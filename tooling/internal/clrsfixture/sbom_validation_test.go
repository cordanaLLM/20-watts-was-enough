package clrsfixture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestGeneratorSBOMPythonNameNormalization(t *testing.T) {
	for _, name := range []string{"typing_extensions", "Typing.Extensions", "typing__extensions", "typing--extensions", "TyPing-._.-Extensions"} {
		t.Run(name, func(t *testing.T) {
			if !validSBOMDistributionName(name) || sbomNormalizedName(name) != "typing-extensions" {
				t.Fatal("Python name normalization differs from PyPA's ASCII separator-run rule")
			}
			fixture := newSBOMTestFixture(t)
			fixture.packages = append(fixture.packages, sbomTestPackage(name, "4.16.0", "SPDXRef-duplicate-alias", ""))
			fixture.execution["PackageCount"] = len(fixture.packages)
			fixture.write(t)
			assertSBOMTestFailure(t, fixture.options)
		})
	}
	for _, name := range []string{"", "typing_extensions\n", "týping_extensions", "-typing", "typing_", ".typing", "typing/extra", "typing%2eextra"} {
		if validSBOMDistributionName(name) {
			t.Fatalf("accepted invalid distribution name %q", name)
		}
	}
}

func TestGeneratorSBOMInstalledMetadataPathTraps(t *testing.T) {
	const prefix = "/opt/venv/lib/python3.13/site-packages/"
	cases := map[string]func(string) string{
		"wrong base":         func(s string) string { return strings.ReplaceAll(s, "/opt/venv/", "/usr/local/") },
		"traversal":          func(s string) string { return strings.ReplaceAll(s, prefix, prefix+"../site-packages/") },
		"double separator":   func(s string) string { return strings.ReplaceAll(s, prefix, prefix+"/") },
		"encoded separator":  func(s string) string { return strings.ReplaceAll(s, ".dist-info/", ".dist-info%2f") },
		"encoded name":       func(s string) string { return strings.ReplaceAll(s, "absl_py", "absl%5fpy") },
		"other distribution": func(s string) string { return strings.ReplaceAll(s, "absl_py", "wrong") },
		"only RECORD":        func(s string) string { return strings.ReplaceAll(s, "METADATA", "RECORD") },
		"different RECORD directory": func(s string) string {
			return strings.Replace(s, "absl_py-2.5.0.dist-info/RECORD", "pip-26.2.2.dist-info/RECORD", 1)
		},
		"duplicate METADATA":      func(s string) string { return strings.Replace(s, "RECORD", "METADATA", 1) },
		"backslash":               func(s string) string { return strings.ReplaceAll(s, ".dist-info/", ".dist-info\\") },
		"metadata embedded later": func(s string) string { return "acquired package info from embedded SBOM: " + s },
		"too many paths":          func(s string) string { return s + strings.Repeat(", "+prefix+"absl_py-2.5.0.dist-info/extra", 16) },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			fixture := newSBOMTestFixture(t)
			fixture.packages[0]["sourceInfo"] = mutate(fixture.packages[0]["sourceInfo"].(string))
			fixture.write(t)
			assertSBOMTestFailure(t, fixture.options)
		})
	}
}

func TestGeneratorSBOMReceiptHashesAndClosedFields(t *testing.T) {
	cases := map[string]func(map[string]any){
		"embedded binding mismatch": func(v map[string]any) {
			v["supplied_binding"].(map[string]any)["supervisor_sha256"] = strings.Repeat("a", 64)
		},
		"binding size":     func(v map[string]any) { v["binding_file"].(map[string]any)["bytes"] = 1 },
		"binding sha":      func(v map[string]any) { v["binding_file"].(map[string]any)["sha256"] = strings.Repeat("a", 64) },
		"statement size":   func(v map[string]any) { v["original_statement"].(map[string]any)["bytes"] = 1 },
		"predicate sha":    func(v map[string]any) { v["spdx_predicate"].(map[string]any)["sha256"] = strings.Repeat("a", 64) },
		"unknown identity": func(v map[string]any) { v["spdx_predicate"].(map[string]any)["extra"] = true },
		"aliased identity": func(v map[string]any) {
			p := v["spdx_predicate"].(map[string]any)
			p["SHA256"] = p["sha256"]
			delete(p, "sha256")
		},
		"null identity":     func(v map[string]any) { v["spdx_predicate"] = nil },
		"null bytes":        func(v map[string]any) { v["spdx_predicate"].(map[string]any)["bytes"] = nil },
		"null hash":         func(v map[string]any) { v["spdx_predicate"].(map[string]any)["sha256"] = nil },
		"false count":       func(v map[string]any) { v["package_count"] = 1 },
		"promoted state":    func(v map[string]any) { v["state"] = "admitted" },
		"schema case alias": func(v map[string]any) { v["Schema"] = v["schema"]; delete(v, "schema") },
		"unknown authority": func(v map[string]any) { v["authority"] = "RESULT" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			fixture := newSBOMTestFixture(t)
			fixture.write(t)
			body := readSBOMTestFiles(t, fixture.options.BundleRoot)["derivation-receipt.json"]
			var value map[string]any
			if err := json.Unmarshal(body, &value); err != nil {
				t.Fatal(err)
			}
			mutate(value)
			writeSBOMTestFile(t, fixture.options.BundleRoot, "derivation-receipt.json", sbomTestJSON(t, value))
			assertSBOMTestFailure(t, fixture.options)
		})
	}
}

func TestGeneratorSBOMStrictJSONAndPredicateByteIdentity(t *testing.T) {
	fixture := newSBOMTestFixture(t)
	fixture.write(t)
	files := readSBOMTestFiles(t, fixture.options.BundleRoot)
	for _, body := range [][]byte{[]byte(`{"schema":1,"schema":1}`), []byte(`{"schema":1} {}`), []byte(`{"schema":null}`), {0xff},
		[]byte(`{"schema":` + strings.Repeat("[", 33) + "0" + strings.Repeat("]", 33) + `}`)} {
		if _, err := sbomObject(body, "schema", ""); err == nil && !bytes.Contains(body, []byte("null")) {
			t.Fatalf("accepted ambiguous/malformed JSON %q", body)
		}
	}
	var value map[string]any
	if err := json.Unmarshal(files["image.spdx.json"], &value); err != nil {
		t.Fatal(err)
	}
	compact, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := checkSBOMStatement(files["scanner-statement.intoto.json"], compact); err == nil {
		t.Fatal("accepted equivalent but changed predicate bytes")
	}
	for _, subject := range []string{"[]", "{}", `"null"`, "false"} {
		fixture.subject = subject
		fixture.write(t)
		assertSBOMTestFailure(t, fixture.options)
	}
	for _, field := range []string{"Running", "Pid", "ExitCode", "Error"} {
		fixture := newSBOMTestFixture(t)
		state := fixture.execution["After"].(map[string]any)["State"].(map[string]any)
		state[strings.ToLower(field)] = state[field]
		delete(state, field)
		fixture.write(t)
		assertSBOMTestFailure(t, fixture.options)
	}
}

func TestGeneratorSBOMInventoryAndReportBounds(t *testing.T) {
	fixture := newSBOMTestFixture(t)
	for i := len(fixture.packages); i <= sbomMaximumPackages; i++ {
		fixture.packages = append(fixture.packages, map[string]any{"SPDXID": fmt.Sprintf("SPDXRef-extra-%d", i), "name": "opaque", "versionInfo": "1"})
	}
	fixture.execution["PackageCount"] = len(fixture.packages)
	fixture.write(t)
	assertSBOMTestFailure(t, fixture.options)
	report := newGeneratorSBOMReport()
	report.Error = strings.Repeat("x", sbomMaximumReportBytes)
	if _, err := MarshalGeneratorSBOMReport(report); err == nil {
		t.Fatal("accepted oversized report")
	}
	if len(sbomDiagnostic(errors.New(strings.Repeat("é", 4096)))) > 4096 {
		t.Fatal("diagnostic exceeded its byte limit")
	}
	for _, digest := range []string{"", "sha256:", strings.Repeat("a", 64), "sha256:" + strings.Repeat("A", 64), "sha256:" + strings.Repeat("a", 65)} {
		fixture := newSBOMTestFixture(t)
		fixture.write(t)
		fixture.options.ExpectedManifestDigest = digest
		assertSBOMTestFailure(t, fixture.options)
	}
	if _, err := CheckGeneratorSBOMBundle(nil, fixture.options); err == nil {
		t.Fatal("accepted nil context")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := readSBOMBundle(ctx, fixture.options.BundleRoot); !errors.Is(err, context.Canceled) {
		t.Fatalf("read cancellation: %v", err)
	}
}
