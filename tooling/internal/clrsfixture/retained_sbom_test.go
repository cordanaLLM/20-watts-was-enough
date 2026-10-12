package clrsfixture

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSBOMBundleLockRefusesUnlockedEntries(t *testing.T) {
	tracked, err := LoadSBOMBundleLock(trackedRepositoryRoot(t))
	if err != nil {
		t.Fatal(err)
	}
	mutate := func(change func(*SBOMBundleLock)) SBOMBundleLock {
		lock := tracked
		lock.Files = append([]sbomBundleLockFile(nil), tracked.Files...)
		change(&lock)
		return lock
	}
	cases := map[string]SBOMBundleLock{
		"schema":          mutate(func(lock *SBOMBundleLock) { lock.Schema = 2 }),
		"manifest digest": mutate(func(lock *SBOMBundleLock) { lock.ImageManifestDigest = "sha256:" + strings.Repeat("A", 64) }),
		"missing file":    mutate(func(lock *SBOMBundleLock) { lock.Files = lock.Files[1:] }),
		"order":           mutate(func(lock *SBOMBundleLock) { lock.Files[0], lock.Files[1] = lock.Files[1], lock.Files[0] }),
		"empty":           mutate(func(lock *SBOMBundleLock) { lock.Files[0].SizeBytes = 0 }),
		"oversize":        mutate(func(lock *SBOMBundleLock) { lock.Files[4].SizeBytes = sbomMaximumBindingBytes + 1 }),
		"digest":          mutate(func(lock *SBOMBundleLock) { lock.Files[2].SHA256 = strings.Repeat("z", 64) }),
		"scheme": mutate(func(lock *SBOMBundleLock) {
			lock.Files[0].URL = strings.Replace(lock.Files[0].URL, "https:", "http:", 1)
		}),
		"host": mutate(func(lock *SBOMBundleLock) {
			lock.Files[0].URL = strings.Replace(lock.Files[0].URL, "github.com", "example.com", 1)
		}),
		"query":      mutate(func(lock *SBOMBundleLock) { lock.Files[0].URL += "?raw=1" }),
		"other file": mutate(func(lock *SBOMBundleLock) { lock.Files[0].URL = lock.Files[1].URL }),
		"not a release": mutate(func(lock *SBOMBundleLock) {
			lock.Files[0].URL = "https://github.com/cordanaLLM/20-watts-was-enough/raw/main/derivation-receipt.json"
		}),
		"nested path": mutate(func(lock *SBOMBundleLock) {
			lock.Files[0].URL = strings.Replace(lock.Files[0].URL, "/derivation-receipt.json", "/x/derivation-receipt.json", 1)
		}),
	}
	for name, lock := range cases {
		t.Run(name, func(t *testing.T) {
			if err := lock.validate(); err == nil {
				t.Fatalf("unlocked entry accepted: %+v", lock)
			}
		})
	}
}

func TestLoadSBOMBundleLockRefusesUnreadableLocks(t *testing.T) {
	tracked, err := os.ReadFile(filepath.Join(trackedRepositoryRoot(t), filepath.FromSlash(sbomBundleLockPath)))
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string][]byte{
		"duplicate key": []byte(strings.Replace(string(tracked), `"schema": 1,`, `"schema": 1, "schema": 1,`, 1)),
		"unknown key":   []byte(strings.Replace(string(tracked), `"schema": 1,`, `"schema": 1, "extra": true,`, 1)),
		"oversize":      append(append([]byte(nil), tracked...), make([]byte, sbomBundleLockMaxBytes)...),
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, filepath.FromSlash(sbomBundleLockPath))
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, body, 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := LoadSBOMBundleLock(root); err == nil {
				t.Fatal("unreadable lock accepted")
			}
		})
	}
	if _, err := LoadSBOMBundleLock(t.TempDir()); err == nil {
		t.Fatal("missing lock accepted")
	}
}

func TestRetainedRedirectFollowsOnlyTheReleaseAssetHop(t *testing.T) {
	request := func(raw string) *http.Request {
		parsed, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		return &http.Request{URL: parsed}
	}
	download := request("https://github.com/cordanaLLM/20-watts-was-enough/releases/download/tag/image.spdx.json")
	asset := request("https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r")
	if err := retainedRedirect(asset, []*http.Request{download}); err != nil {
		t.Fatalf("release asset hop refused: %v", err)
	}
	cases := map[string]struct {
		next *http.Request
		via  []*http.Request
	}{
		"second hop":      {asset, []*http.Request{download, asset}},
		"plain asset":     {request("http://release-assets.githubusercontent.com/a"), []*http.Request{download}},
		"other target":    {request("https://example.com/a"), []*http.Request{download}},
		"non-release":     {asset, []*http.Request{request("https://github.com/cordanaLLM/20-watts-was-enough/archive/main.tar.gz")}},
		"other origin":    {asset, []*http.Request{request("https://example.com/releases/download/tag/file")}},
		"plain origin":    {asset, []*http.Request{request("http://github.com/o/r/releases/download/tag/file")}},
		"no prior source": {asset, nil},
	}
	for name, test := range cases {
		t.Run(name, func(t *testing.T) {
			if err := retainedRedirect(test.next, test.via); err == nil {
				t.Fatal("redirect followed")
			}
		})
	}
}
