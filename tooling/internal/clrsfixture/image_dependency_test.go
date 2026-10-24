package clrsfixture

import (
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestGeneratorDependencyArtifactCutoffBoundaries(t *testing.T) {
	t.Parallel()
	input, err := ParseGeneratorLockInput(trackedGeneratorFile(t, "lock-input.json"), trackedSourceRecord(t))
	if err != nil {
		t.Fatal(err)
	}
	lock := trackedGeneratorFile(t, "uv.lock")
	packages, err := parseLockedGeneratorPackages(lock)
	if err != nil {
		t.Fatal(err)
	}
	count, artifacts, _, err := inspectGeneratorDependencyLock(lock, input)
	if err != nil || count != 63 || artifacts != 137 {
		t.Fatalf("reviewed lock counts/error = %d/%d/%v", count, artifacts, err)
	}
	for _, pkg := range packages {
		if pkg.Name != "certifi" && pkg.Name != "pip" && pkg.Name != "setuptools" && pkg.Name != "urllib3" && pkg.Name != "wheel" {
			continue
		}
		cutoffText := input.Resolver.ExcludeNewer
		if specific := input.Resolver.ExcludeNewerPackage[pkg.Name]; specific != "" {
			cutoffText = specific
		}
		cutoff, err := time.Parse(time.RFC3339, cutoffText)
		if err != nil {
			t.Fatal(err)
		}
		for _, artifact := range pkg.Artifacts {
			t.Run(pkg.Name+"/"+artifact.Filename, func(t *testing.T) {
				testGeneratorArtifactCutoff(t, lock, artifact, cutoff)
			})
		}
	}
}

func testGeneratorArtifactCutoff(t *testing.T, lock []byte, artifact lockedGeneratorArtifact, cutoff time.Time) {
	t.Helper()
	for _, delta := range []time.Duration{-time.Nanosecond, 0, time.Nanosecond} {
		t.Run(delta.String(), func(t *testing.T) {
			t.Parallel()
			before := "upload-time = " + strconv.Quote(artifact.UploadTime)
			if strings.Count(string(lock), before) != 1 {
				t.Fatalf("ambiguous upload-time fixture: %s", before)
			}
			after := "upload-time = " + strconv.Quote(cutoff.Add(delta).Format(time.RFC3339Nano))
			changed := strings.Replace(string(lock), before, after, 1)
			input, err := ParseGeneratorLockInput(trackedGeneratorFile(t, "lock-input.json"), trackedSourceRecord(t))
			if err != nil {
				t.Fatal(err)
			}
			_, _, _, err = inspectGeneratorDependencyLock([]byte(changed), input)
			if delta <= 0 {
				if err != nil {
					t.Fatalf("artifact at/before cutoff rejected: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), "after the resolution cutoff "+cutoff.Format(time.RFC3339)) {
				t.Fatalf("artifact after cutoff error = %v", err)
			}
		})
	}
}

func TestGeneratorDependencyLockRejectsPackageCutoffHeaderDrift(t *testing.T) {
	t.Parallel()
	input, err := ParseGeneratorLockInput(trackedGeneratorFile(t, "lock-input.json"), trackedSourceRecord(t))
	if err != nil {
		t.Fatal(err)
	}
	lock := string(trackedGeneratorFile(t, "uv.lock"))
	changed := strings.Replace(lock, `urllib3 = "2026-09-16T00:00:00Z"`, `urllib3 = "2026-09-17T00:00:00Z"`, 1)
	if changed == lock {
		t.Fatal("cutoff header fixture did not change")
	}
	if _, _, _, err := inspectGeneratorDependencyLock([]byte(changed), input); err == nil ||
		!strings.Contains(err.Error(), "header differs") {
		t.Fatalf("cutoff header drift error = %v", err)
	}
}

func TestGeneratorDependencyArtifactsRejectAbsentPackageCutoff(t *testing.T) {
	t.Parallel()
	input, err := ParseGeneratorLockInput(trackedGeneratorFile(t, "lock-input.json"), trackedSourceRecord(t))
	if err != nil {
		t.Fatal(err)
	}
	packages, err := parseLockedGeneratorPackages(trackedGeneratorFile(t, "uv.lock"))
	if err != nil {
		t.Fatal(err)
	}
	input.Resolver.ExcludeNewerPackage["unknown-package"] = "2026-09-16T00:00:00Z"
	if _, _, err := inspectGeneratorPackageArtifacts(packages, input.Resolver); err == nil ||
		!strings.Contains(err.Error(), "package absent from the lock") {
		t.Fatalf("absent package cutoff error = %v", err)
	}
}
