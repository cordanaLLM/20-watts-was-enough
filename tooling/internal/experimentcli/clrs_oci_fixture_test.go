package experimentcli

import (
	"archive/tar"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func clrsOCIFixtureJSON(t *testing.T, value any) []byte {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func clrsOCIFixtureSHA(body []byte) string {
	hash := sha256.Sum256(body)
	return hex.EncodeToString(hash[:])
}

func TestCLRSOCIEndToEndReadOnlyJSON(t *testing.T) {
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(filepath.Join(root, "tooling/clrs-generator/image-contract.json"))
	if err != nil {
		t.Fatal(err)
	}
	var contract clrsfixture.GeneratorImageContract
	if err := json.Unmarshal(body, &contract); err != nil {
		t.Fatal(err)
	}
	// The layer is an empty but complete tar stream, not an extracted filesystem.
	layer := make([]byte, 1024)
	config := clrsOCIFixtureJSON(t, map[string]any{"architecture": "amd64", "os": "linux",
		"config": map[string]any{"User": fmt.Sprintf("%d:%d", contract.Runtime.UID, contract.Runtime.GID), "WorkingDir": contract.Runtime.WorkingDirectory,
			"Entrypoint": contract.Runtime.Entrypoint, "Env": contract.Runtime.Environment},
		"rootfs": map[string]any{"type": "layers", "diff_ids": []string{"sha256:" + clrsOCIFixtureSHA(layer)}}})
	descriptor := func(media string, value []byte) map[string]any {
		return map[string]any{"mediaType": media, "digest": "sha256:" + clrsOCIFixtureSHA(value), "size": len(value)}
	}
	manifest := clrsOCIFixtureJSON(t, map[string]any{"schemaVersion": 2, "mediaType": "application/vnd.oci.image.manifest.v1+json",
		"config": descriptor("application/vnd.oci.image.config.v1+json", config), "layers": []any{descriptor("application/vnd.oci.image.layer.v1.tar", layer)}})
	index := clrsOCIFixtureJSON(t, map[string]any{"schemaVersion": 2, "manifests": []any{descriptor("application/vnd.oci.image.manifest.v1+json", manifest)}})
	var archive bytes.Buffer
	writer := tar.NewWriter(&archive)
	for _, item := range []struct {
		name string
		body []byte
	}{{"oci-layout", []byte(`{"imageLayoutVersion":"1.0.0"}`)}, {"index.json", index},
		{"blobs/sha256/" + clrsOCIFixtureSHA(manifest), manifest}, {"blobs/sha256/" + clrsOCIFixtureSHA(config), config}, {"blobs/sha256/" + clrsOCIFixtureSHA(layer), layer}} {
		if err := writer.WriteHeader(&tar.Header{Name: item.name, Typeflag: tar.TypeReg, Mode: 0o600, Size: int64(len(item.body)), Format: tar.FormatUSTAR}); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(item.body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	archivePath := filepath.Join(t.TempDir(), "input.oci.tar")
	if err := os.WriteFile(archivePath, archive.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	args := []string{"inspect-clrs-image-archive", "--root", root, "--archive", archivePath, "--sha256", clrsOCIFixtureSHA(archive.Bytes()), "--bytes", strconv.Itoa(archive.Len()), "--json"}
	if code := runCommand(t, args, &stdout, &stderr); code != 0 || stderr.Len() != 0 {
		t.Fatalf("valid synthetic OCI: code=%d stderr=%q", code, stderr.String())
	}
	var report clrsfixture.GeneratorOCIReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil || report.Authority != "NO_RESULT" || report.State != "archive-consistent-unadmitted" || report.ImageAdmitted ||
		!bytes.Equal(report.ManifestBytes, manifest) || !bytes.Equal(report.ConfigBytes, config) || report.ExpandedBytes != 1024 {
		t.Fatalf("CLI changed API report: %#v error=%v", report, err)
	}
	entries, err := os.ReadDir(filepath.Dir(archivePath))
	if err != nil || len(entries) != 1 || entries[0].Name() != "input.oci.tar" {
		t.Fatal("read-only CLI changed the archive directory")
	}
}
