package clrsshakedown

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

func TestJournalRejectsUnboundedOversizedOrExhaustedWrites(t *testing.T) {
	for _, kind := range []string{"nil-context", "no-deadline", "cancelled", "count", "aggregate-bytes", "record-bytes"} {
		t.Run(kind, func(t *testing.T) {
			path := t.TempDir()
			if err := os.Mkdir(filepath.Join(path, "events"), 0o700); err != nil {
				t.Fatal(err)
			}
			root, err := os.OpenRoot(path)
			if err != nil {
				t.Fatal(err)
			}
			defer root.Close()
			j := &journal{root: root}
			ctx, cancel := context.WithTimeout(context.Background(), recordTimeout)
			defer cancel()
			maximum := maximumEventBytes
			switch kind {
			case "nil-context":
				ctx = nil
			case "no-deadline":
				ctx = context.Background()
			case "cancelled":
				cancel()
			case "count":
				j.files = make([]Artifact, maximumEvents)
			case "aggregate-bytes":
				j.bytes = maximumJournalBytes
			case "record-bytes":
				maximum = 1
			}
			before := snapshot(t, path)
			if err := j.append(ctx, event{Kind: "decision", Decision: &specialistcontrol.Decision{}}, maximum); err == nil {
				t.Fatal("unbounded write passed")
			}
			if !reflect.DeepEqual(before, snapshot(t, path)) {
				t.Fatal("rejected journal append wrote evidence")
			}
		})
	}
}

func TestRunRejectsUnsafeOutputWithoutMutatingExistingFiles(t *testing.T) {
	for _, kind := range []string{"dataset", "dataset-child", "repository", "ancestor", "parent-symlink", "existing-symlink"} {
		t.Run(kind, func(t *testing.T) {
			options := fixtureOptions(t)
			switch kind {
			case "dataset":
				options.OutputDirectory = options.DatasetDirectory
			case "dataset-child":
				options.OutputDirectory = filepath.Join(options.DatasetDirectory, "new")
			case "repository":
				options.OutputDirectory = options.RepositoryRoot
			case "ancestor":
				options.OutputDirectory = filepath.Dir(options.RepositoryRoot)
			case "parent-symlink":
				link := filepath.Join(options.RepositoryRoot, "parent-link")
				if err := os.Symlink(t.TempDir(), link); err != nil {
					t.Fatal(err)
				}
				options.OutputDirectory = filepath.Join(link, "new")
			case "existing-symlink":
				if err := os.Symlink(t.TempDir(), options.OutputDirectory); err != nil {
					t.Fatal(err)
				}
			}
			before := snapshot(t, options.DatasetDirectory)
			if report, err := Run(context.Background(), options); err == nil || report.State != "incomplete" {
				t.Fatalf("unsafe output passed: %+v %v", report, err)
			}
			if !reflect.DeepEqual(before, snapshot(t, options.DatasetDirectory)) {
				t.Fatal("unsafe output rejection changed input")
			}
		})
	}
}

func TestRunRetainsIncompleteReceiptWhenOutputRootIsReplaced(t *testing.T) {
	options := fixtureOptions(t)
	retained := options.OutputDirectory + "-retained"
	report, err := run(context.Background(), options, func(_ *boundInputs, _ *journal) {
		if err := os.Rename(options.OutputDirectory, retained); err != nil {
			t.Fatal(err)
		}
		if err := os.Mkdir(options.OutputDirectory, 0o700); err != nil {
			t.Fatal(err)
		}
	})
	if err == nil || report.State != "incomplete" || !strings.Contains(err.Error(), "output root changed") {
		t.Fatalf("output replacement accepted: %+v %v", report, err)
	}
	if len(snapshot(t, options.OutputDirectory)) != 0 {
		t.Fatal("replacement output root was written")
	}
	body, err := os.ReadFile(filepath.Join(retained, "receipt.json"))
	var receipt Report
	if err != nil || json.Unmarshal(body, &receipt) != nil || receipt.State != "incomplete" || receipt.Authority != "NO_RESULT" {
		t.Fatalf("original evidence lost: %v %s", err, body)
	}
}

func TestRunRejectsNilOrCancelledContextBeforeCreatingOutput(t *testing.T) {
	for _, nilContext := range []bool{false, true} {
		options := fixtureOptions(t)
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		if nilContext {
			ctx = nil
		}
		report, err := Run(ctx, options)
		if err == nil || report.Authority != "NO_RESULT" || report.State != "incomplete" {
			t.Fatalf("invalid context passed: %+v %v", report, err)
		}
		if !nilContext && !errors.Is(err, context.Canceled) {
			t.Fatalf("cancellation cause lost: %v", err)
		}
		if _, err := os.Lstat(options.OutputDirectory); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("invalid context created output: %v", err)
		}
	}
}

func TestEvidenceDecoderRejectsNonCanonicalFieldSpellingsAndOmissions(t *testing.T) {
	value := FileIdentity{SHA256: strings.Repeat("1", 64), SizeBytes: 1}
	body, err := marshal(value, maximumReportBytes)
	if err != nil {
		t.Fatal(err)
	}
	for _, changed := range []string{
		strings.Replace(string(body), "sha256", "SHA256", 1),
		strings.Replace(string(body), ",\n  \"size_bytes\": 1", "", 1),
		string(body) + "{}",
		strings.Replace(string(body), "\"sha256\":", "\"unknown\":", 1),
	} {
		var decoded FileIdentity
		if err := decode([]byte(changed), &decoded); err == nil {
			t.Fatalf("noncanonical evidence passed: %s", changed)
		}
	}
}
