package experiment

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadCatalogSortsAndClassifiesRuntimeNeeds(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	manifestRoot := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := os.MkdirAll(manifestRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	writeRepositoryFile(t, root, "experiments/workstation/Dockerfile.node-artifact")
	writeRepositoryFile(t, root, "experiments/workstation/fixture-019/Dockerfile")
	writeRepositoryFile(t, root, "package-lock.json")
	writeRepositoryFile(t, root, "python-environment.lock.json")
	writeManifest(t, manifestRoot, "fixture-019", `{"schema":1,"artifact":"fixture-019","readiness":"smoke-ready","distribution":{"state":"release-image","runtime_class":"node-python","image":"ghcr.io/cordanallm/20-watts-was-enough-fixture-019","platforms":["linux/amd64"],"build_context":"repository-root","dockerfile":"experiments/workstation/fixture-019/Dockerfile","authority":"NO_RESULT"},"environment":{"runtime":"Node and Python","lockfiles":["python-environment.lock.json"]}}`)
	writeManifest(t, manifestRoot, "fixture-007", `{"schema":1,"artifact":"fixture-007","readiness":"smoke-ready","distribution":{"state":"release-image","runtime_class":"transitional-node","image":"ghcr.io/cordanallm/20-watts-was-enough-fixture-007","platforms":["linux/amd64"],"build_context":"closed-go-package","dockerfile":"experiments/workstation/Dockerfile.node-artifact","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":["package-lock.json"]}}`)

	catalog, err := LoadCatalog(root)
	if err != nil {
		t.Fatalf("LoadCatalog() error = %v", err)
	}
	if len(catalog) != 2 || catalog[0].Artifact != "fixture-007" || catalog[0].Distribution.RuntimeClass != "transitional-node" || catalog[1].Distribution.RuntimeClass != "node-python" {
		t.Fatalf("LoadCatalog() = %+v", catalog)
	}
	plan, err := LoadReleasePlan(root)
	if err != nil || len(plan) != 2 || plan[0].Distribution.State != "release-image" {
		t.Fatalf("LoadReleasePlan() = %+v, %v", plan, err)
	}
}

func TestLoadCatalogRejectsOversizedManifestAndInvalidLockfiles(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	manifestRoot := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := os.MkdirAll(manifestRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	oversized := make([]byte, maxManifestBytes+1)
	if err := os.WriteFile(filepath.Join(manifestRoot, "fixture-007.json"), oversized, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted an oversized manifest")
	}

	writeManifest(t, manifestRoot, "fixture-007", `{"schema":1,"artifact":"fixture-007","readiness":"smoke-ready","distribution":{"state":"source-only","runtime_class":"node-source","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":["../package-lock.json"]}}`)
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted a path-escaping lockfile")
	}
}

func TestLoadCatalogKeepsFixture012AsPortableSource(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	manifestRoot := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := os.MkdirAll(manifestRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	writeManifest(t, manifestRoot, "fixture-012", `{"schema":1,"artifact":"fixture-012","readiness":"smoke-ready","distribution":{"state":"source-only","runtime_class":"node-source","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":["package-lock.json"]}}`)
	writeRepositoryFile(t, root, "package-lock.json")
	catalog, err := LoadCatalog(root)
	if err != nil {
		t.Fatalf("LoadCatalog() error = %v", err)
	}
	if catalog[0].Distribution.State != "source-only" {
		t.Fatalf("fixture-012 distribution = %+v", catalog[0].Distribution)
	}
}

func TestLoadCatalogRejectsUnknownDistributionAuthorityFields(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	manifestRoot := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := os.MkdirAll(manifestRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	writeManifest(t, manifestRoot, "fixture-012", `{"schema":1,"artifact":"fixture-012","readiness":"smoke-ready","distribution":{"state":"source-only","runtime_class":"node-source","authority":"NO_RESULT","publish":true},"environment":{"runtime":"Node","lockfiles":["package-lock.json"]}}`)
	writeRepositoryFile(t, root, "package-lock.json")
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted an unknown distribution authority field")
	}
	writeManifest(t, manifestRoot, "fixture-012", `{"schema":1,"artifact":"fixture-012","readiness":"smoke-ready","distribution":{"state":"source-only","state":"release-image","runtime_class":"node-source","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":["package-lock.json"]}}`)
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted a duplicate JSON authority field")
	}
}

func TestLoadCatalogRejectsMissingNonRegularAndSymlinkedLockfiles(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	manifestRoot := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := os.MkdirAll(manifestRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	writeManifest(t, manifestRoot, "fixture-007", `{"schema":1,"artifact":"fixture-007","readiness":"smoke-ready","distribution":{"state":"source-only","runtime_class":"node-source","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":["missing-lock.json"]}}`)
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted a missing lockfile")
	}

	directoryLock := filepath.Join(root, "directory-lock.json")
	if err := os.Mkdir(directoryLock, 0o700); err != nil {
		t.Fatal(err)
	}
	writeManifest(t, manifestRoot, "fixture-007", `{"schema":1,"artifact":"fixture-007","readiness":"smoke-ready","distribution":{"state":"source-only","runtime_class":"node-source","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":["directory-lock.json"]}}`)
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted a non-regular lockfile")
	}

	target := filepath.Join(t.TempDir(), "outside-lock.json")
	if err := os.WriteFile(target, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "linked-lock.json")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	writeManifest(t, manifestRoot, "fixture-007", `{"schema":1,"artifact":"fixture-007","readiness":"smoke-ready","distribution":{"state":"source-only","runtime_class":"node-source","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":["linked-lock.json"]}}`)
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted a symlinked lockfile")
	}
}

func TestLoadCatalogRejectsLockfileBelowSymlinkedDirectory(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	manifestRoot := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := os.MkdirAll(manifestRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "lock.json"), []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "locks")); err != nil {
		t.Fatal(err)
	}
	writeManifest(t, manifestRoot, "fixture-007", `{"schema":1,"artifact":"fixture-007","readiness":"smoke-ready","distribution":{"state":"source-only","runtime_class":"node-source","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":["locks/lock.json"]}}`)
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted a lockfile below a symlinked directory")
	}
}

func TestLoadCatalogRejectsFilenameMismatch(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	manifestRoot := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := os.MkdirAll(manifestRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	writeManifest(t, manifestRoot, "fixture-007", `{"schema":1,"artifact":"fixture-019","readiness":"smoke-ready","distribution":{"state":"source-only","runtime_class":"node-source","authority":"NO_RESULT"},"environment":{"runtime":"Node","lockfiles":[]}}`)
	if _, err := LoadCatalog(root); err == nil {
		t.Fatal("LoadCatalog() accepted a filename/artifact mismatch")
	}
}

func writeRepositoryFile(t *testing.T, root, relative string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("FROM scratch\n"), 0o600); err != nil {
		t.Fatal(err)
	}
}

func writeManifest(t *testing.T, root, artifact, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, artifact+".json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}
