package pdfrendercli

import (
	"bytes"
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrender"
)

func TestProofPreservesOptionsAndSuccessBytes(t *testing.T) {
	for _, sourceRef := range []string{"main", "v1.2.3"} {
		var stdout, stderr bytes.Buffer
		want := pdfrender.ReproducibilityOptions{RepositoryRoot: "chosen-root", SourceRef: sourceRef, SourceRevision: strings.Repeat("a", 40), ReceiptPath: "build/evidence/proof.json", Diagnostics: &stderr}
		calls := 0
		verify := func(_ context.Context, got pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
			calls++
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("options=%#v, want %#v", got, want)
			}
			return proofReceipt(), nil
		}
		code := runVerifyReproducibility([]string{"--root", want.RepositoryRoot, "--ref", want.SourceRef, "--revision", want.SourceRevision, "--receipt", want.ReceiptPath}, &stdout, &stderr, verify)
		output := "PDF renderer reproducibility passed for " + sourceRef + ": image-id, manifest-id, complete PDF/manifest pair pair-id; receipt build/evidence/proof.json.\n"
		if code != 0 || calls != 1 || stderr.Len() != 0 || stdout.String() != output {
			t.Fatalf("exit=%d calls=%d stdout=%q stderr=%q", code, calls, stdout.String(), stderr.String())
		}
	}
}

func TestProofPreservesDefaultMainOptions(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := runVerifyReproducibility([]string{"--receipt", "proof.json"}, &stdout, &stderr, func(_ context.Context, got pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
		want := pdfrender.ReproducibilityOptions{RepositoryRoot: ".", SourceRef: "main", ReceiptPath: "proof.json", Diagnostics: &stderr}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("options=%#v, want %#v", got, want)
		}
		return proofReceipt(), nil
	})
	if code != 0 || stderr.Len() != 0 {
		t.Fatalf("exit=%d stderr=%q", code, stderr.String())
	}
}

func TestProofCachePreservesOptionsForBothProofModes(t *testing.T) {
	for _, proof := range []string{"image-build", "render-pair"} {
		t.Run(proof, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			want := pdfrender.ReproducibilityOptions{
				RepositoryRoot: "chosen-root",
				SourceRef:      "main",
				SourceRevision: strings.Repeat("a", 40),
				ReceiptPath:    "build/evidence/proof.json",
				RenderPairOnly: proof == "render-pair",
				CacheDirectory: "build/cache/pdf-renderer",
				Diagnostics:    &stderr,
			}
			calls := 0
			code := runVerifyReproducibility([]string{
				"--root", want.RepositoryRoot, "--ref", want.SourceRef,
				"--revision", want.SourceRevision, "--receipt", want.ReceiptPath,
				"--proof", proof, "--cache-dir", want.CacheDirectory,
			}, &stdout, &stderr, func(_ context.Context, got pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
				calls++
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("options=%#v, want %#v", got, want)
				}
				return proofReceipt(), nil
			})
			if code != 0 || calls != 1 || stdout.Len() == 0 || stderr.Len() != 0 {
				t.Fatalf("exit=%d calls=%d stdout=%q stderr=%q", code, calls, stdout.String(), stderr.String())
			}
		})
	}
}

func TestProofEmptyCacheMatchesOmittedCache(t *testing.T) {
	for _, test := range []struct{ ref, proof string }{
		{"main", "image-build"}, {"main", "render-pair"}, {"v1.2.3", "image-build"},
	} {
		t.Run(test.ref+"/"+test.proof, func(t *testing.T) {
			arguments := []string{"--receipt", "proof.json", "--ref", test.ref, "--revision", strings.Repeat("a", 40), "--proof", test.proof}
			var options []pdfrender.ReproducibilityOptions
			var output []string
			var stdout, stderr bytes.Buffer
			for _, cacheArguments := range [][]string{nil, {"--cache-dir", ""}} {
				stdout.Reset()
				stderr.Reset()
				code := runVerifyReproducibility(append(append([]string(nil), arguments...), cacheArguments...), &stdout, &stderr, func(_ context.Context, got pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
					if got.Diagnostics != &stderr {
						t.Fatal("diagnostics do not use the caller's stderr")
					}
					options = append(options, got)
					return proofReceipt(), nil
				})
				if code != 0 || stderr.Len() != 0 {
					t.Fatalf("cache args=%q exit=%d stderr=%q", cacheArguments, code, stderr.String())
				}
				output = append(output, stdout.String())
			}
			if len(options) != 2 || !reflect.DeepEqual(options[0], options[1]) || options[0].CacheDirectory != "" || output[0] != output[1] {
				t.Fatalf("empty and omitted cache differ: options=%#v output=%q", options, output)
			}
		})
	}
}

func TestProofRejectsInvalidCacheBeforeVerification(t *testing.T) {
	for _, directory := range []string{
		"cache", "/build/cache/pdf-renderer", "../build/cache/pdf-renderer",
		"build/cache/other", "build/cache/pdf-renderer/", "./build/cache/pdf-renderer",
		"build/cache/../cache/pdf-renderer", "build//cache/pdf-renderer", `build\cache\pdf-renderer`,
		"build/cache/pdf-renderer,mode=max", " build/cache/pdf-renderer", "build/cache/pdf-renderer\n",
	} {
		t.Run(directory, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := runVerifyReproducibility([]string{"--receipt", "proof.json", "--cache-dir", directory}, &stdout, &stderr, func(context.Context, pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
				t.Fatal("invalid cache directory reached the verifier")
				return pdfrender.ReproducibilityReceipt{}, nil
			})
			if code != 2 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "cache-dir must be empty, or build/cache/pdf-renderer with --ref main") {
				t.Fatalf("exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
			}
		})
	}
}

func TestProofRejectsReleaseCacheBeforeVerification(t *testing.T) {
	for _, proof := range []string{"image-build", "render-pair"} {
		t.Run(proof, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := runVerifyReproducibility([]string{
				"--receipt", "proof.json", "--ref", "v1.2.3", "--revision", strings.Repeat("a", 40),
				"--proof", proof, "--cache-dir", "build/cache/pdf-renderer",
			}, &stdout, &stderr, func(context.Context, pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
				t.Fatal("release cache reached the verifier")
				return pdfrender.ReproducibilityReceipt{}, nil
			})
			if code != 2 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "with --ref main") {
				t.Fatalf("exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
			}
		})
	}
}

func TestProofRejectsArgumentsBeforeVerification(t *testing.T) {
	for _, args := range [][]string{
		nil, {"--ref", "main"}, {"--receipt"}, {"--unknown"}, {"--help"}, {"--receipt", "proof.json", "--cache-dir"},
		{"--receipt", "proof.json", "extra"},
		{"--receipt", "proof.json", "--ref", "release/latest"},
		{"--receipt", "proof.json", "--ref", "v1.2.3"},
		{"--receipt", "proof.json", "--ref", "v1.2.3", "--revision", strings.Repeat("A", 40)},
		{"--receipt", "proof.json", "--proof", ""},
		{"--receipt", "proof.json", "--proof", "none"},
		{"--receipt", "proof.json", "--proof", "render-pair", "--ref", "v1.2.3", "--revision", strings.Repeat("a", 40)},
	} {
		var stdout, stderr bytes.Buffer
		code := runVerifyReproducibility(args, &stdout, &stderr, func(context.Context, pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
			t.Fatal("invalid arguments reached the verifier")
			return pdfrender.ReproducibilityReceipt{}, nil
		})
		if code != 2 || stdout.Len() != 0 {
			t.Fatalf("args=%q exit=%d stdout=%q stderr=%q", args, code, stdout.String(), stderr.String())
		}
	}
}

func TestRenderPairProofPreservesSelectionAndNamesItsBoundary(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := runVerifyReproducibility([]string{"--receipt", "proof.json", "--proof", "render-pair"}, &stdout, &stderr, func(_ context.Context, got pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
		if !got.RenderPairOnly || got.SourceRef != "main" {
			t.Fatalf("options=%+v", got)
		}
		return proofReceipt(), nil
	})
	if code != 0 || stderr.Len() != 0 || !strings.HasPrefix(stdout.String(), "PDF render-pair reproducibility (one image build) passed") {
		t.Fatalf("exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestProofPropagatesOperationalFailureWithoutSuccess(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := runVerifyReproducibility([]string{"--receipt", "proof.json"}, &stdout, &stderr, func(context.Context, pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
		return pdfrender.ReproducibilityReceipt{}, errors.New("retained proof mismatch")
	})
	if code != 1 || stdout.Len() != 0 || stderr.String() != "Verify PDF renderer reproducibility: retained proof mismatch\n" {
		t.Fatalf("exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestProofOutputErrorAndShortWriteFail(t *testing.T) {
	for _, short := range []bool{false, true} {
		var stderr bytes.Buffer
		code := runVerifyReproducibility([]string{"--receipt", "proof.json"}, failingWriter{short}, &stderr, func(context.Context, pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
			return proofReceipt(), nil
		})
		if code != 1 || !strings.Contains(stderr.String(), "Write PDF renderer reproducibility result:") {
			t.Fatalf("short=%t exit=%d stderr=%q", short, code, stderr.String())
		}
	}
}

func TestPublicAdapterRejectsInvalidRootBeforeDocker(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := RunVerifyReproducibility([]string{"--root", t.TempDir(), "--receipt", "proof.json"}, &stdout, &stderr)
	if code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "Verify PDF renderer reproducibility:") {
		t.Fatalf("exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestPublicAdapterRejectsCacheUsageBeforeRepositoryInspection(t *testing.T) {
	for _, arguments := range [][]string{
		{"--cache-dir", "/build/cache/pdf-renderer"},
		{"--cache-dir", "build/cache/pdf-renderer", "--ref", "v1.2.3", "--revision", strings.Repeat("a", 40)},
	} {
		var stdout, stderr bytes.Buffer
		code := RunVerifyReproducibility(append([]string{"--root", t.TempDir(), "--receipt", "proof.json"}, arguments...), &stdout, &stderr)
		if code != 2 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "cache-dir must be empty, or build/cache/pdf-renderer with --ref main") {
			t.Fatalf("args=%q exit=%d stdout=%q stderr=%q", arguments, code, stdout.String(), stderr.String())
		}
	}
}

func proofReceipt() pdfrender.ReproducibilityReceipt {
	return pdfrender.ReproducibilityReceipt{Builds: []pdfrender.ReproducibilityBuild{{ImageID: "image-id", ManifestDigest: "manifest-id", Pair: pdfrender.ReproducibilityPair{PairSHA256: "pair-id"}}}}
}

type failingWriter struct{ short bool }

func (writer failingWriter) Write(body []byte) (int, error) {
	if writer.short {
		return len(body) - 1, nil
	}
	return 0, errors.New("writer rejected output")
}
