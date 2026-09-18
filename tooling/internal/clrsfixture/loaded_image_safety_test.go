package clrsfixture

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoadedImageInvalidInputsHaveNoDockerOrOutput(t *testing.T) {
	for _, mode := range []string{"nil-context", "cancelled", "bad-source", "bad-hash", "missing-archive", "existing-output", "symlink-parent", "empty-output", "newline-output"} {
		t.Run(mode, func(t *testing.T) {
			options, fake := loadedImageTestFixture(t)
			ctx := context.Background()
			switch mode {
			case "nil-context":
				ctx = nil
			case "cancelled":
				var cancel context.CancelFunc
				ctx, cancel = context.WithCancel(ctx)
				cancel()
			case "bad-source":
				options.Archive.RepositoryRoot = t.TempDir()
			case "bad-hash":
				options.Archive.ExpectedArchiveSHA256 = strings.Repeat("f", 64)
			case "missing-archive":
				options.Archive.ArchivePath += ".missing"
			case "existing-output":
				if err := os.Mkdir(options.OutputDirectory, 0o700); err != nil {
					t.Fatal(err)
				}
			case "symlink-parent":
				link := filepath.Join(t.TempDir(), "parent-link")
				if err := os.Symlink(filepath.Dir(options.OutputDirectory), link); err != nil {
					t.Fatal(err)
				}
				options.OutputDirectory = filepath.Join(link, "handoff")
			case "empty-output":
				options.OutputDirectory = ""
			case "newline-output":
				options.OutputDirectory += "\n"
			}
			report, err := prepareGeneratorLoadedImage(ctx, options, fake.execute, nil)
			assertLoadedImageFailure(t, report, err)
			if len(fake.calls) != 0 {
				t.Fatal("invalid input reached Docker")
			}
			if mode != "existing-output" && options.OutputDirectory != "" {
				// Windows cannot address the newline name at all, so the fresh
				// parent staying empty is the portable evidence of no output.
				entries, err := os.ReadDir(filepath.Dir(options.OutputDirectory))
				if err != nil || len(entries) != 0 {
					t.Fatalf("invalid input made output: %v %v", entries, err)
				}
			}
		})
	}
}

func TestLoadedImageDetectsChangedArchiveAuthorityAndRetainedInputs(t *testing.T) {
	for _, mode := range []string{"archive", "authority", "metadata", "extra-file", "output-replaced"} {
		t.Run(mode, func(t *testing.T) {
			options, fake := loadedImageTestFixture(t)
			if mode == "authority" {
				options.Archive.RepositoryRoot = copyGeneratorFoundation(t)
			}
			fake.interlock = func(index int, _ []string, _ *generationCommandEvidence) error {
				if index != 4 {
					return nil
				}
				switch mode {
				case "archive":
					return os.WriteFile(options.Archive.ArchivePath, []byte("changed\n"), 0o600)
				case "authority":
					return os.WriteFile(filepath.Join(options.Archive.RepositoryRoot, trackedSourcePath), []byte("{}\n"), 0o600)
				case "metadata":
					return os.WriteFile(filepath.Join(options.OutputDirectory, "manifest.json"), []byte("{}\n"), 0o600)
				case "extra-file":
					return os.WriteFile(filepath.Join(options.OutputDirectory, "unexpected"), []byte("retained\n"), 0o600)
				case "output-replaced":
					if err := os.Rename(options.OutputDirectory, options.OutputDirectory+".retained"); err != nil {
						return err
					}
					return os.Mkdir(options.OutputDirectory, 0o700)
				}
				return nil
			}
			report, err := prepareGeneratorLoadedImage(context.Background(), options, fake.execute, nil)
			assertLoadedImageFailure(t, report, err)
		})
	}
}

func TestLoadedImagePendingPublicationRechecksCancellationAndFiles(t *testing.T) {
	for _, mode := range []string{"cancel", "metadata", "pending", "extra"} {
		t.Run(mode, func(t *testing.T) {
			options, fake := loadedImageTestFixture(t)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			hook := func() {
				if mode == "cancel" {
					cancel()
					return
				}
				path := map[string]string{"metadata": "config.json", "pending": "receipt.pending.json", "extra": "unexpected"}[mode]
				if err := os.WriteFile(filepath.Join(options.OutputDirectory, path), []byte("changed\n"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			report, err := prepareGeneratorLoadedImage(ctx, options, fake.execute, hook)
			assertLoadedImageFailure(t, report, err)
			body, readErr := os.ReadFile(filepath.Join(options.OutputDirectory, "receipt.json"))
			var receipt GeneratorLoadedImageReport
			if readErr != nil || json.Unmarshal(body, &receipt) != nil || receipt.State != "incomplete" || receipt.Error == "" {
				t.Fatalf("final failure receipt: %q %v", body, readErr)
			}
		})
	}
}

func TestLoadedImageStartedCoversTheBoundedOperationAndReportsStayBounded(t *testing.T) {
	options, fake := loadedImageTestFixture(t)
	before := time.Now().UTC()
	var observed time.Time
	fake.interlock = func(index int, _ []string, _ *generationCommandEvidence) error {
		if index == 1 {
			observed = time.Now().UTC()
		}
		return nil
	}
	report, err := prepareGeneratorLoadedImage(context.Background(), options, fake.execute, nil)
	if err != nil {
		t.Fatal(err)
	}
	started, parseErr := time.Parse(time.RFC3339Nano, report.Started)
	if parseErr != nil || started.Before(before) || !started.Before(observed) {
		t.Fatal("operation start is not recorded before Docker observation")
	}
	report.Error = strings.Repeat("e", 4097)
	if _, err := MarshalGeneratorLoadedImageReport(report); err == nil {
		t.Fatal("oversized diagnostic was accepted")
	}
	report.Error = ""
	report.Files = append(report.Files, GeneratorLoadedImageFile{})
	if _, err := MarshalGeneratorLoadedImageReport(report); err == nil {
		t.Fatal("oversized inventory was accepted")
	}
}
