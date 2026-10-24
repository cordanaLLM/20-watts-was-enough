package clrsfixture

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRetainedInputFilesFollowTrackedLocks(t *testing.T) {
	files, err := retainedInputFiles(trackedRepositoryRoot(t))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		RetainedSourceArchiveName,
		"source-build-inputs/promise-2.3.tar.gz",
		"build-tools/packaging-26.3-py3-none-any.whl",
		"build-tools/setuptools-84.1.0-py3-none-any.whl",
		"build-tools/wheel-0.48.0-py3-none-any.whl",
		"sbom-bundle/derivation-receipt.json",
		"sbom-bundle/execution-record.json",
		"sbom-bundle/image.spdx.json",
		"sbom-bundle/scanner-statement.intoto.json",
		"sbom-bundle/supplied-binding.json",
	}
	if len(files) != len(want) {
		t.Fatalf("files = %+v", files)
	}
	for index, file := range files {
		if file.relative != want[index] || !strings.HasPrefix(file.url, "https://") || len(file.sha256) != 64 || file.sizeBytes <= 0 {
			t.Fatalf("file %d = %+v, want %s", index, file, want[index])
		}
	}
}

func TestFetchRetainedFilesVerifiesLockedBytes(t *testing.T) {
	body := []byte("locked retained input")
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/good", "/other":
			_, _ = writer.Write(body)
		case "/long":
			_, _ = writer.Write(append(body, '!'))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	locked := func(path string) retainedInputFile {
		return retainedInputFile{"nested/" + strings.TrimPrefix(path, "/"), server.URL + path, rawSHA256(body), int64(len(body))}
	}

	output := filepath.Join(t.TempDir(), "inputs")
	if err := fetchRetainedFiles(context.Background(), server.Client(), []retainedInputFile{locked("/good")}, output); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(filepath.Join(output, "nested", "good")); err != nil || string(got) != string(body) {
		t.Fatalf("fetched %q: %v", got, err)
	}
	if err := fetchRetainedFiles(context.Background(), server.Client(), nil, output); err == nil {
		t.Fatal("existing output directory accepted")
	}

	tampered := locked("/other")
	tampered.sha256 = strings.Repeat("0", 64)
	long := locked("/long")
	missing := locked("/missing")
	plain := locked("/good")
	plain.url = "http://" + strings.TrimPrefix(server.URL, "https://") + "/good"
	for name, file := range map[string]retainedInputFile{"digest": tampered, "oversize": long, "status": missing, "scheme": plain} {
		t.Run(name, func(t *testing.T) {
			output := filepath.Join(t.TempDir(), "inputs")
			if err := fetchRetainedFiles(context.Background(), server.Client(), []retainedInputFile{file}, output); err == nil {
				t.Fatal("unverified retained input accepted")
			}
			if _, err := os.Stat(filepath.Join(output, filepath.FromSlash(file.relative))); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("refused input left on disk: %v", err)
			}
		})
	}
}
