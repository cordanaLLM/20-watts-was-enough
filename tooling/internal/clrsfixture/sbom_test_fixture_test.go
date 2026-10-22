package clrsfixture

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type sbomTestFixture struct {
	options   GeneratorSBOMOptions
	packages  []map[string]any
	execution map[string]any
	binding   sbomBinding
	subject   string
}

func newSBOMTestFixture(t *testing.T) *sbomTestFixture {
	t.Helper()
	root := copyGeneratorFoundation(t)
	authority, contract, err := loadSBOMAuthority(root)
	if err != nil {
		t.Fatal(err)
	}
	identity := func(c string, size int64) sbomIdentity { return sbomIdentity{strings.Repeat(c, 64), size} }
	fixture := &sbomTestFixture{options: GeneratorSBOMOptions{root, t.TempDir(), "sha256:" + strings.Repeat("a", 64), "sha256:" + strings.Repeat("b", 64)}, subject: "null"}
	fixture.binding = sbomBinding{Schema: 1, Authority: ResultAuthority, Archive: identity("c", 100),
		ManifestDigest: fixture.options.ExpectedManifestDigest, ConfigDigest: fixture.options.ExpectedConfigDigest,
		ScannerIndex: strings.Split(contract.SBOM.GeneratorImage, "@")[1], ScannerManifest: "sha256:" + strings.Repeat("d", 64),
		ScannerConfig: "sha256:" + strings.Repeat("e", 64), ScannerBinary: strings.Repeat("f", 64), Supervisor: strings.Repeat("1", 64)}
	for _, wheel := range authority.manifest.Artifacts {
		fixture.packages = append(fixture.packages, sbomTestPackage(wheel.Package, wheel.Version, "SPDXRef-"+wheel.Package, ""))
	}
	fixture.packages = append(fixture.packages, sbomTestPackage("packaging", "26.0", "SPDXRef-vendor", "setuptools/_vendor/"))
	fixture.packages = append(fixture.packages, map[string]any{"SPDXID": "SPDXRef-system", "name": "libc6", "versionInfo": "2.41", "sourceInfo": "acquired dpkg metadata"})
	fixture.execution = map[string]any{
		"schema": 1, "Authority": ResultAuthority, "State": "scanner-observation-passed-unadmitted",
		"Started": "2026-09-05T12:00:00Z", "Finished": "2026-09-05T12:00:10Z", "Name": "clrs20w-sbom-test-123", "ContainerID": strings.Repeat("2", 64),
		"LoadedScannerID": fixture.binding.ScannerIndex, "Archive": fixture.binding.Archive, "Supervisor": identity("1", 100), "Launcher": identity("1", 100),
		"ScannerBinary": identity("f", 100), "Statement": sbomIdentity{}, "CommandLog": identity("3", 100),
		"ScannerIndexDigest": fixture.binding.ScannerIndex, "ScannerManifestDigest": fixture.binding.ScannerManifest, "ScannerConfigDigest": fixture.binding.ScannerConfig,
		"ImageManifestDigest": fixture.binding.ManifestDigest, "ImageConfigDigest": fixture.binding.ConfigDigest,
		"InputsRechecked": true, "CleanupVerified": true, "PackageCount": len(fixture.packages), "Limitations": []string{"Synthetic test receipt; no execution."},
	}
	fixture.execution["Before"] = sbomTestInspection(fixture, "created")
	fixture.execution["After"] = sbomTestInspection(fixture, "exited")
	return fixture
}

func sbomTestPackage(name, version, id, nested string) map[string]any {
	directory := "/opt/venv/lib/python3.13/site-packages/" + nested + strings.ReplaceAll(name, "-", "_") + "-" + version + ".dist-info/"
	return map[string]any{"SPDXID": id, "name": name, "versionInfo": version,
		"sourceInfo": "acquired package info from installed python package manifest file: " + directory + "METADATA, " + directory + "RECORD"}
}

func sbomTestInspection(fixture *sbomTestFixture, status string) map[string]any {
	return map[string]any{
		"ID": fixture.execution["ContainerID"], "Name": "/" + fixture.execution["Name"].(string), "Image": fixture.binding.ScannerIndex,
		"Config": map[string]any{"Image": fixture.binding.ScannerIndex, "User": "65532:65532", "WorkingDir": "/", "Entrypoint": []string{"/scanner-supervisor"},
			"Cmd": []string{"inside"}, "Env": []string{}, "OnBuild": nil, "Labels": map[string]string{"dev.cordana.clrs-sbom-owner": fixture.execution["Name"].(string)},
			"Volumes": nil, "ExposedPorts": nil, "Healthcheck": nil, "StopTimeout": 5, "StopSignal": "SIGTERM", "Tty": false, "OpenStdin": false},
		"State":  map[string]any{"Running": false, "Paused": false, "Restarting": false, "OOMKilled": false, "Dead": false, "Status": status, "Error": "", "ExitCode": 0, "Pid": 0},
		"Mounts": []map[string]any{{"Type": "bind"}, {"Type": "bind"}}, "NetworkSettings": map[string]any{"Networks": map[string]any{"none": map[string]any{}}},
		"HostConfig": map[string]any{"NetworkMode": "none", "OomKillDisable": nil},
	}
}

func (fixture *sbomTestFixture) write(t *testing.T) {
	t.Helper()
	root := fixture.options.BundleRoot
	predicate := sbomTestJSON(t, map[string]any{
		"spdxVersion": "SPDX-2.3", "SPDXID": "SPDXRef-DOCUMENT", "dataLicense": "CC0-1.0", "documentNamespace": "https://example.invalid/synthetic-sbom", "name": "synthetic-test",
		"creationInfo": map[string]any{"creators": []string{"Tool: synthetic-test"}}, "files": []any{}, "hasExtractedLicensingInfos": []any{}, "relationships": []any{}, "packages": fixture.packages,
	})
	subject := ""
	if fixture.subject != "" {
		subject = `,"subject":` + fixture.subject
	}
	statement := []byte(`{"_type":"https://in-toto.io/Statement/v1"` + subject + `,"predicateType":"https://spdx.dev/Document","predicate":` + string(predicate) + `}`)
	fixture.execution["Statement"] = sbomBytesIdentity(statement)
	execution := sbomTestJSON(t, fixture.execution)
	fixture.binding.ExecutionRecord = sbomBytesIdentity(execution)
	binding := sbomTestJSON(t, fixture.binding)
	derivative := sbomDerivation{Schema: 1, Authority: ResultAuthority, State: "derived-from-supplied-bindings", Binding: fixture.binding,
		BindingFile: sbomBytesIdentity(binding), Statement: sbomBytesIdentity(statement), Predicate: sbomBytesIdentity(predicate), PackageCount: len(fixture.packages), Limitations: []string{"Synthetic test only."}}
	for name, body := range map[string][]byte{"image.spdx.json": predicate, "scanner-statement.intoto.json": statement, "execution-record.json": execution,
		"supplied-binding.json": binding, "derivation-receipt.json": sbomTestJSON(t, derivative)} {
		writeSBOMTestFile(t, root, name, body)
	}
}

func sbomTestJSON(t *testing.T, value any) []byte {
	t.Helper()
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func writeSBOMTestFile(t *testing.T, root, name string, body []byte) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, name), body, 0o600); err != nil {
		t.Fatal(err)
	}
}

func readSBOMTestFiles(t *testing.T, root string) map[string][]byte {
	t.Helper()
	files := make(map[string][]byte)
	for _, spec := range sbomBundleFiles {
		body, err := os.ReadFile(filepath.Join(root, spec.name))
		if err != nil {
			t.Fatal(err)
		}
		files[spec.name] = body
	}
	return files
}
