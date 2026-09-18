package clrsfixture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func comparisonFixture(t *testing.T) FixtureComparisonOptions {
	t.Helper()
	root := t.TempDir()
	writeComparisonTestFile(t, root, trackedSourcePath, trackedSourceRecordBytes(t))
	writeComparisonTestFile(t, root, trackedGenerationPath, trackedGenerationContractBytes(t))
	for _, task := range ShakedownTasks() {
		fixture := newImportFixture(t, task)
		body := marshalDataset(t, completeDataset(fixture))
		for _, tree := range []string{"first", "second"} {
			writeComparisonTestFile(t, root, tree+"/"+fixture.task.OutputRelativePath, body)
		}
	}
	return FixtureComparisonOptions{root, "first", "second"}
}

func writeComparisonTestFile(t *testing.T, root, relative string, body []byte) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestCompareFixturesReportsCompleteDeterministicReadOnlyImports(t *testing.T) {
	t.Parallel()
	options := comparisonFixture(t)
	before := comparisonTestInventory(t, options.RepositoryRoot)
	first, err := CompareFixtures(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	second, err := CompareFixtures(context.Background(), options)
	if err != nil || !reflect.DeepEqual(first, second) {
		t.Fatalf("repeated comparison changed: %v", err)
	}
	if first.SchemaVersion != 1 || first.Authority != ResultAuthority || first.State != "fixtures-byte-equal-and-import-valid" || first.GenerationState != generationState ||
		first.ContractID != expectedContractIdentity || first.FirstExamples != 48 || first.SecondExamples != 48 || len(first.Files) != 6 {
		t.Fatalf("bad complete report: %#v", first)
	}
	if first.FirstTreeSHA256 != first.SecondTreeSHA256 || len(first.FirstTreeSHA256) != 64 || first.SourceRecordSHA256 != rawSHA256(trackedSourceRecordBytes(t)) {
		t.Fatalf("bad source/tree identities: %#v", first)
	}
	for index, file := range first.Files {
		if !file.ByteEqual || file.FirstSHA256 != file.SecondSHA256 || file.FirstBytes != file.SecondBytes || file.FirstExamples != file.SecondExamples || file.FirstExamples == 0 {
			t.Fatalf("bad file comparison: %#v", file)
		}
		if index > 0 && first.Files[index-1].Path >= file.Path {
			t.Fatal("report paths not strictly sorted")
		}
	}
	left, err := MarshalFixtureComparison(first)
	if err != nil || len(left) > maximumComparisonReportBytes || !json.Valid(left) || !bytes.HasSuffix(left, []byte{'\n'}) {
		t.Fatalf("bad machine report: %v", err)
	}
	right, err := MarshalFixtureComparison(second)
	if err != nil || !bytes.Equal(left, right) {
		t.Fatal("machine report is not byte stable")
	}
	if after := comparisonTestInventory(t, options.RepositoryRoot); !reflect.DeepEqual(before, after) {
		t.Fatal("read-only comparison changed file bytes, modes or modification times")
	}
}

func TestCompareFixturesRejectsDifferencesWithoutSkippingImport(t *testing.T) {
	t.Parallel()
	options := comparisonFixture(t)
	fixture := newImportFixture(t, TaskInsertionSort)
	dataset := completeDataset(fixture)
	dataset.Examples[0].References[0] += " changed"
	writeComparisonTestFile(t, options.RepositoryRoot, "second/"+fixture.task.OutputRelativePath, marshalDataset(t, dataset))
	report, err := CompareFixtures(context.Background(), options)
	if err == nil || !strings.Contains(err.Error(), "fixture bytes differ") || report.State != "failed" || report.Error == "" {
		t.Fatalf("different fixture accepted: %#v %v", report, err)
	}
	if report.FirstExamples != 48 || report.SecondExamples != 48 || report.FirstTreeSHA256 == report.SecondTreeSHA256 {
		t.Fatalf("mismatch lost semantic counts or tree identity: %#v", report)
	}
}

func TestCompareFixturesRejectsMatchingInvalidDatasets(t *testing.T) {
	t.Parallel()
	for name, change := range map[string]func([]byte) []byte{
		"trailing": func(body []byte) []byte { return append(body, []byte(`{}`)...) },
		"duplicate": func(body []byte) []byte {
			return bytes.Replace(body, []byte(`"examples":`), []byte(`"name":"duplicate","examples":`), 1)
		},
		"wrong seed":  func(body []byte) []byte { return bytes.Replace(body, []byte(`"seed":3`), []byte(`"seed":4`), 1) },
		"wrong count": func([]byte) []byte { return []byte(`{"name":"clrs_insertion_sort","examples":[]}`) },
		"unknown": func(body []byte) []byte {
			return bytes.Replace(body, []byte(`"examples":`), []byte(`"extra":true,"examples":`), 1)
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			options := comparisonFixture(t)
			fixture := newImportFixture(t, TaskInsertionSort)
			body := change(marshalDataset(t, completeDataset(fixture)))
			for _, tree := range []string{"first", "second"} {
				writeComparisonTestFile(t, options.RepositoryRoot, tree+"/"+fixture.task.OutputRelativePath, body)
			}
			report, err := CompareFixtures(context.Background(), options)
			if err == nil || report.State != "failed" || report.FirstExamples >= 48 || report.FirstTreeSHA256 != report.SecondTreeSHA256 {
				t.Fatalf("matching invalid data accepted: %#v %v", report, err)
			}
		})
	}
}

func TestCompareFixturesRejectsInventoryAndAuthorityDrift(t *testing.T) {
	t.Parallel()
	for name, mutate := range map[string]func(*testing.T, FixtureComparisonOptions){
		"extra root file": func(t *testing.T, o FixtureComparisonOptions) {
			writeComparisonTestFile(t, o.RepositoryRoot, "first/extra", []byte("x"))
		},
		"extra split file": func(t *testing.T, o FixtureComparisonOptions) {
			writeComparisonTestFile(t, o.RepositoryRoot, "second/shakedown/extra", []byte("x"))
		},
		"missing task": func(t *testing.T, o FixtureComparisonOptions) {
			if err := os.Remove(filepath.Join(o.RepositoryRoot, "first/shakedown/insertion_sort.json")); err != nil {
				t.Fatal(err)
			}
		},
		"directory instead of file": func(t *testing.T, o FixtureComparisonOptions) {
			path := filepath.Join(o.RepositoryRoot, "first/shakedown/insertion_sort.json")
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(path, 0o700); err != nil {
				t.Fatal(err)
			}
		},
		"empty file": func(t *testing.T, o FixtureComparisonOptions) {
			writeComparisonTestFile(t, o.RepositoryRoot, "second/shakedown/insertion_sort.json", nil)
		},
		"oversized file": func(t *testing.T, o FixtureComparisonOptions) {
			file, err := os.OpenFile(filepath.Join(o.RepositoryRoot, "first/shakedown/insertion_sort.json"), os.O_WRONLY, 0)
			if err != nil {
				t.Fatal(err)
			}
			err = errors.Join(file.Truncate((4<<20)+1), file.Close())
			if err != nil {
				t.Fatal(err)
			}
		},
		"invalid authority": func(t *testing.T, o FixtureComparisonOptions) {
			writeComparisonTestFile(t, o.RepositoryRoot, trackedGenerationPath, []byte(`{}`))
		},
		"missing authority": func(t *testing.T, o FixtureComparisonOptions) {
			if err := os.Remove(filepath.Join(o.RepositoryRoot, trackedSourcePath)); err != nil {
				t.Fatal(err)
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			options := comparisonFixture(t)
			mutate(t, options)
			report, err := CompareFixtures(context.Background(), options)
			if err == nil || report.State != "failed" || report.Error == "" {
				t.Fatalf("accepted %s: %#v %v", name, report, err)
			}
			if (name == "empty file" || name == "oversized file") && (report.FirstTreeSHA256 != "" || report.SecondTreeSHA256 != "") {
				t.Fatal("partial file reads received complete-tree digests")
			}
		})
	}
}

func TestCompareFixturesRejectsSymlinksSameRootAndCancellation(t *testing.T) {
	t.Parallel()
	for _, scope := range []string{"root", "ancestor", "split", "file", "authority"} {
		t.Run(scope, func(t *testing.T) {
			options := comparisonFixture(t)
			path := filepath.Join(options.RepositoryRoot, "first")
			switch scope {
			case "ancestor":
				path = options.RepositoryRoot
			case "split":
				path += "/shakedown"
			case "file":
				path += "/shakedown/insertion_sort.json"
			case "authority":
				path = filepath.Join(options.RepositoryRoot, trackedSourcePath)
			}
			if err := os.Rename(path, path+"-real"); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(path+"-real", path); err != nil {
				t.Skipf("symlink unavailable: %v", err)
			}
			if report, err := CompareFixtures(context.Background(), options); err == nil || report.State != "failed" {
				t.Fatalf("accepted %s link: %v", scope, err)
			}
		})
	}
	options := comparisonFixture(t)
	options.SecondDirectory = filepath.Join(options.RepositoryRoot, "first")
	if _, err := CompareFixtures(context.Background(), options); err == nil || !strings.Contains(err.Error(), "distinct") {
		t.Fatalf("same directory: %v", err)
	}
	options.SecondDirectory = "second"
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := CompareFixtures(ctx, options); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled check: %v", err)
	}
	if _, err := CompareFixtures(nil, options); err == nil {
		t.Fatal("nil context accepted")
	}
	options.FirstDirectory = ""
	if _, err := CompareFixtures(context.Background(), options); err == nil {
		t.Fatal("missing dataset root accepted")
	}
}

func TestComparisonRecheckRejectsChangedInputAndInventory(t *testing.T) {
	t.Parallel()
	for _, change := range []string{"bytes", "replacement", "extra", "authority", "directory"} {
		t.Run(change, func(t *testing.T) {
			options := comparisonFixture(t)
			ctx := context.Background()
			inputs, err := loadComparisonInputs(ctx, options)
			if err != nil {
				t.Fatal(err)
			}
			snapshots, err := newComparisonSnapshots(ctx, inputs)
			if err != nil {
				t.Fatal(err)
			}
			path := inputs.plan.Tasks[0].OutputRelativePath
			if _, err := compareFixtureFile(ctx, inputs, path, snapshots); err != nil {
				t.Fatal(err)
			}
			absolute := filepath.Join(inputs.first, path)
			switch change {
			case "bytes":
				writeComparisonTestFile(t, inputs.first, path, []byte("changed"))
			case "replacement":
				body, err := os.ReadFile(absolute)
				if err != nil {
					t.Fatal(err)
				}
				if err := os.Remove(absolute); err != nil {
					t.Fatal(err)
				}
				writeComparisonTestFile(t, inputs.first, path, body)
			case "extra":
				writeComparisonTestFile(t, inputs.first, "shakedown/extra", []byte("x"))
			case "authority":
				writeComparisonTestFile(t, inputs.root, trackedGenerationPath, append(inputs.contractBody, ' '))
			case "directory":
				if err := os.Chtimes(inputs.first, time.Unix(1, 0), time.Unix(1, 0)); err != nil {
					t.Fatal(err)
				}
			}
			if err := recheckComparisonInputs(ctx, inputs, snapshots); err == nil {
				t.Fatalf("recheck accepted %s", change)
			}
		})
	}
}

func TestComparisonTreeFramingAndReportBounds(t *testing.T) {
	t.Parallel()
	first, second := newComparisonTree(), newComparisonTree()
	addComparisonTreeFile(first, "ab", []byte("c"))
	addComparisonTreeFile(second, "a", []byte("bc"))
	if bytes.Equal(first.Sum(nil), second.Sum(nil)) {
		t.Fatal("tree identity has ambiguous path/content framing")
	}
	report := newFixtureComparison()
	report.Error = strings.Repeat("x", maximumComparisonReportBytes)
	if _, err := MarshalFixtureComparison(report); err == nil {
		t.Fatal("oversized machine report accepted")
	}
	if got := comparisonDiagnostic(errors.New(strings.Repeat("x", 8192))); len(got) > 4200 || !strings.Contains(got, "truncated") {
		t.Fatal("diagnostic is not bounded")
	}
}

func comparisonTestInventory(t *testing.T, root string) map[string]string {
	t.Helper()
	inventory := map[string]string{}
	err := filepath.WalkDir(root, func(path string, _ os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		// Lstat reads each entry's own record. DirEntry.Info comes from the
		// parent's listing, which NTFS refreshes lazily when a child handle
		// closes, so a read-only pass would appear to change directory mtimes.
		info, err := os.Lstat(path)
		if err != nil {
			return err
		}
		value := info.Mode().String() + info.ModTime().UTC().Format(time.RFC3339Nano)
		if info.Mode().IsRegular() {
			body, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			value += rawSHA256(body)
		}
		inventory[path] = value
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return inventory
}
