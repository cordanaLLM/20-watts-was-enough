package clrsfixture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func generationSuccessfulTestBundle(t *testing.T) (GeneratorFixtureRunOptions, generationRunInputs, GeneratorFixtureRun) {
	t.Helper()
	options, inputs, archive := generationRunFixture(t)
	fake := &generationFake{t: t, inputs: inputs, tar: archive}
	report, err := runGeneratorFixtures(context.Background(), options, fake.execute)
	if err != nil {
		t.Fatal(err)
	}
	generationLinuxTestReceipt(t, options, inputs, &report)
	return options, inputs, report
}

// generationLinuxTestReceipt rewrites the bundle's producer platform to the
// Linux amd64 identity that validateGenerationReceipt demands: production
// generates only there, while the fake executor completes an otherwise
// identical bundle on any host. Every other receipt check stays in force.
func generationLinuxTestReceipt(t *testing.T, options GeneratorFixtureRunOptions, inputs generationRunInputs, report *GeneratorFixtureRun) {
	t.Helper()
	if runtime.GOOS == "linux" && runtime.GOARCH == "amd64" {
		return
	}
	report.Producer.Build.OperatingSys, report.Producer.Build.Architecture = "linux", "amd64"
	prepared := generationPreparedReport(inputs, report.ContainerName, promiseProducer{
		Build: report.Producer.Build, ExecutableSHA256: report.Producer.ExecutableSHA256, ExecutableSizeBytes: report.Producer.ExecutableSizeBytes})
	prepared.Started = report.Started
	start, err := MarshalGeneratorFixtureRun(prepared)
	if err != nil {
		t.Fatal(err)
	}
	writeComparisonTestFile(t, options.OutputDirectory, "run-start.json", start)
	rewriteGenerationTestReceipt(t, options, *report)
}

func rewriteGenerationTestReceipt(t *testing.T, options GeneratorFixtureRunOptions, report GeneratorFixtureRun) {
	t.Helper()
	body, err := marshalGenerationJSON(report, generationRunMaximumReceipt)
	if err != nil {
		t.Fatal(err)
	}
	writeComparisonTestFile(t, options.OutputDirectory, "receipt.json", body)
}

func requireGenerationCheckFailure(t *testing.T, options GeneratorFixtureRunOptions) {
	t.Helper()
	report, err := CheckGeneratorFixtureRun(context.Background(), options)
	if err == nil || report.State != "failed" || report.Authority != ResultAuthority || report.Error == "" || report.TreeSHA256 != "" || report.ImportedExamples != 0 || report.CleanupVerified || len(report.Files) != 0 {
		t.Fatalf("invalid bundle retained success-shaped report: %#v %v", report, err)
	}
	if _, err := MarshalGeneratorFixtureRun(report); err != nil {
		t.Fatalf("failure report not serializable: %v", err)
	}
}

func TestGenerationCheckRejectsReclosedCommandClaims(t *testing.T) {
	for name, mutate := range map[string]func([]generationCommandEvidence){
		"wrong-version":       func(v []generationCommandEvidence) { v[0].Stdout = []byte("1 1\n") },
		"remote-endpoint":     func(v []generationCommandEvidence) { v[0].Arguments[2] = "tcp://remote:2375" },
		"binary-change":       func(v []generationCommandEvidence) { v[1].Arguments[0] = "/different/docker" },
		"nonzero-exit":        func(v []generationCommandEvidence) { v[0].ExitCode = 1 },
		"error":               func(v []generationCommandEvidence) { v[0].Error = "failed" },
		"extra-marker":        func(v []generationCommandEvidence) { v[8].Stdout = append(v[8].Stdout, '\n') },
		"arbitrary-program":   func(v []generationCommandEvidence) { v[8].Arguments[len(v[8].Arguments)-1] = "print('anything')" },
		"arbitrary-reader":    func(v []generationCommandEvidence) { v[11].Arguments[len(v[11].Arguments)-1] = "print('anything')" },
		"reader-stderr":       func(v []generationCommandEvidence) { v[11].Stderr = []byte("warning") },
		"remaining-container": func(v []generationCommandEvidence) { v[18].Stdout = []byte(strings.Repeat("a", 64) + " somebody\n") },
	} {
		t.Run(name, func(t *testing.T) {
			options, _, report := generationSuccessfulTestBundle(t)
			body, err := os.ReadFile(filepath.Join(options.OutputDirectory, "commands.json"))
			if err != nil {
				t.Fatal(err)
			}
			var commands []generationCommandEvidence
			if err := decodeCanonicalGeneratorJSON(body, 20, &commands); err != nil {
				t.Fatal(err)
			}
			mutate(commands)
			body, err = marshalGenerationJSON(commands, generationRunMaximumLog)
			if err != nil {
				t.Fatal(err)
			}
			writeComparisonTestFile(t, options.OutputDirectory, "commands.json", body)
			report.CommandLog = generationFileIdentity("commands.json", body)
			rewriteGenerationTestReceipt(t, options, report)
			requireGenerationCheckFailure(t, options)
		})
	}
}

func TestGenerationCheckRejectsReceiptsInventoriesAndIndependentInputDrift(t *testing.T) {
	for _, kind := range []string{"cleanup-false", "cleanup-null", "schema", "authority", "reversed-time", "producer", "subject", "tree", "count", "input-hash", "independent-manifest", "independent-config", "extra-root", "extra-input", "extra-fixture", "symlink-fixture", "truncated-tar", "malformed-fixture", "matching-input-change"} {
		t.Run(kind, func(t *testing.T) {
			options, inputs, report := generationSuccessfulTestBundle(t)
			switch kind {
			case "cleanup-false":
				report.CleanupVerified = false
			case "schema":
				report.SchemaVersion = 2
			case "authority":
				report.Authority = "CLAIM_ELIGIBLE"
			case "reversed-time":
				report.Finished = "2000-01-01T00:00:00Z"
			case "producer":
				report.Producer.ExecutableSHA256 = "none"
			case "tree":
				report.TreeSHA256 = strings.Repeat("0", 64)
			case "count":
				report.ImportedExamples = 49
			case "input-hash":
				report.Inputs[0].SHA256 = strings.Repeat("0", 64)
			case "independent-manifest":
				options.Image.ManifestDigest = strings.Repeat("0", 64)
			case "independent-config":
				options.Image.ConfigDigest = options.Image.ManifestDigest
			case "extra-root":
				writeComparisonTestFile(t, options.OutputDirectory, "unexpected", []byte("extra"))
			case "extra-input":
				writeComparisonTestFile(t, options.OutputDirectory, "inputs/extra", []byte("extra"))
			case "extra-fixture":
				writeComparisonTestFile(t, options.OutputDirectory, "dataset/shakedown/extra", []byte("extra"))
			case "symlink-fixture":
				path := filepath.Join(options.OutputDirectory, "dataset", inputs.invocation.ExpectedPaths[0])
				if err := os.Rename(path, path+".retained"); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(path+".retained", path); err != nil {
					t.Fatal(err)
				}
			case "truncated-tar":
				body, err := os.ReadFile(filepath.Join(options.OutputDirectory, "output.tar"))
				if err != nil {
					t.Fatal(err)
				}
				body = body[:len(body)-1024]
				writeComparisonTestFile(t, options.OutputDirectory, "output.tar", body)
				report.OutputTar = generationFileIdentity("output.tar", body)
			case "malformed-fixture":
				writeComparisonTestFile(t, options.OutputDirectory, "dataset/"+inputs.invocation.ExpectedPaths[0], []byte("{}"))
			case "matching-input-change":
				body := append(bytes.Clone(inputs.files["manifest.json"]), '\n')
				writeComparisonTestFile(t, filepath.Dir(options.Image.ManifestFile), filepath.Base(options.Image.ManifestFile), body)
				writeComparisonTestFile(t, options.OutputDirectory, "inputs/manifest.json", body)
			}
			rewriteGenerationTestReceipt(t, options, report)
			if kind == "cleanup-null" || kind == "subject" {
				body, err := os.ReadFile(filepath.Join(options.OutputDirectory, "receipt.json"))
				if err != nil {
					t.Fatal(err)
				}
				if kind == "cleanup-null" {
					body = bytes.Replace(body, []byte(`"cleanup_verified": true`), []byte(`"cleanup_verified": null`), 1)
				} else {
					body = bytes.Replace(body, []byte(`"schema_version": 1,`), []byte(`"schema_version": 1, "subject": "authenticated",`), 1)
				}
				writeComparisonTestFile(t, options.OutputDirectory, "receipt.json", body)
			}
			requireGenerationCheckFailure(t, options)
		})
	}
}

func TestGenerationCheckRequiresPresenceSafeCommandExitAndFinalStableSnapshots(t *testing.T) {
	options, inputs, report := generationSuccessfulTestBundle(t)
	bundle, err := loadGenerationBundle(context.Background(), inputs)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(options.OutputDirectory, "dataset", inputs.invocation.ExpectedPaths[0])
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(path, path+".original"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path + ".original"); err != nil {
		t.Fatal(err)
	}
	if err := recheckGenerationBundle(context.Background(), bundle, inputs); err == nil {
		t.Fatal("same-byte inode replacement escaped final snapshot")
	}
	commands := bytes.Replace(bundle.bodies["commands.json"], []byte(`"exit_code": 0`), []byte(`"exit_code": null`), 1)
	if !json.Valid(commands) {
		t.Fatal("invalid test JSON")
	}
	writeComparisonTestFile(t, options.OutputDirectory, "commands.json", commands)
	report.CommandLog = generationFileIdentity("commands.json", commands)
	rewriteGenerationTestReceipt(t, options, report)
	requireGenerationCheckFailure(t, options)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	failed, err := CheckGeneratorFixtureRun(ctx, options)
	if !errors.Is(err, context.Canceled) || failed.State != "failed" {
		t.Fatal(err)
	}
}

func TestGenerationCheckLateCancellationCannotReturnSuccess(t *testing.T) {
	options, _, _ := generationSuccessfulTestBundle(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	report, err := checkGeneratorFixtureRun(ctx, options, cancel)
	if !errors.Is(err, context.Canceled) || report.State != "failed" || report.CleanupVerified || report.ImportedExamples != 0 {
		t.Fatalf("late cancellation retained success: %#v %v", report, err)
	}
}
