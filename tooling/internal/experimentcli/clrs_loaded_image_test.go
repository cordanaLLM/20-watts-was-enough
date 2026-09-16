package experimentcli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func loadedImageCLIArguments() []string {
	return []string{"--root", "/source", "--archive", "/input/archive.tar", "--sha256", strings.Repeat("a", 64), "--bytes", "1024", "--output", "/evidence/handoff"}
}

func TestLoadedImageCLIRejectsInvalidUseWithoutAction(t *testing.T) {
	unwanted := func(context.Context, clrsfixture.GeneratorLoadedImageOptions) (clrsfixture.GeneratorLoadedImageReport, error) {
		t.Fatal("invalid arguments invoked preparation")
		return clrsfixture.GeneratorLoadedImageReport{}, nil
	}
	cases := [][]string{nil, {"--help"}, {"--execute"}, {"--check"}, append(loadedImageCLIArguments(), "extra"),
		append(loadedImageCLIArguments(), "--bytes=0"), append(loadedImageCLIArguments(), "--bytes=2147483649"),
		append(loadedImageCLIArguments(), "--sha256=ABC"), append(loadedImageCLIArguments(), "--json=invalid")}
	for _, flag := range []string{"--root", "--archive", "--sha256", "--output"} {
		cases = append(cases, append(loadedImageCLIArguments(), flag+"="))
	}
	for _, args := range cases {
		var out, diagnostic bytes.Buffer
		if code := runCLRSLoadedImageWithAction(args, &out, &diagnostic, unwanted); code != 2 || out.Len() != 0 {
			t.Fatalf("arguments %v: code=%d output=%q diagnostic=%q", args, code, out.String(), diagnostic.String())
		}
	}
}

func TestLoadedImageCLIPreservesArgumentsAndOutputModes(t *testing.T) {
	for _, machine := range []bool{false, true} {
		calls := 0
		action := func(ctx context.Context, options clrsfixture.GeneratorLoadedImageOptions) (clrsfixture.GeneratorLoadedImageReport, error) {
			calls++
			deadline, present := ctx.Deadline()
			if !present || time.Until(deadline) > 300*time.Second || options.Archive.RepositoryRoot != "/source" || options.Archive.ArchivePath != "/input/archive.tar" || options.Archive.ExpectedArchiveSHA256 != strings.Repeat("a", 64) || options.Archive.ExpectedArchiveBytes != 1024 || options.OutputDirectory != "/evidence/handoff" {
				t.Fatalf("changed or unbounded options: %#v", options)
			}
			return clrsfixture.GeneratorLoadedImageReport{SchemaVersion: 1, Authority: "NO_RESULT", State: "loaded-image-bound-unadmitted", LoadedImageID: "sha256:" + strings.Repeat("b", 64), OutputDirectory: options.OutputDirectory}, nil
		}
		args := loadedImageCLIArguments()
		if machine {
			args = append(args, "--json")
		}
		var out, diagnostic bytes.Buffer
		if code := runCLRSLoadedImageWithAction(args, &out, &diagnostic, action); code != 0 || calls != 1 || diagnostic.Len() != 0 {
			t.Fatalf("mode=%v output=%q diagnostics=%q", machine, out.String(), diagnostic.String())
		}
		if machine {
			var report clrsfixture.GeneratorLoadedImageReport
			if json.Unmarshal(out.Bytes(), &report) != nil || report.Authority != "NO_RESULT" || report.DockerMutated || report.ImageAdmitted {
				t.Fatalf("invalid machine report: %q", out.String())
			}
		} else if !strings.Contains(out.String(), "Loaded CLRS image bound:") || !strings.Contains(out.String(), "NO_RESULT, image not admitted.") {
			t.Fatalf("human output: %q", out.String())
		}
	}
}

func TestLoadedImageCLIDispatchFailureHasNoDockerOrWrites(t *testing.T) {
	for _, machine := range []bool{false, true} {
		args := append([]string{"prepare-clrs-loaded-image"}, loadedImageCLIArguments()...)
		args = append(args, "--root", t.TempDir())
		if machine {
			args = append(args, "--json")
		}
		var out, diagnostic bytes.Buffer
		if code := runCommand(t, args, &out, &diagnostic); code != 1 || diagnostic.Len() == 0 {
			t.Fatalf("invalid source: code=%d output=%q diagnostic=%q", code, out.String(), diagnostic.String())
		}
		if machine {
			var report clrsfixture.GeneratorLoadedImageReport
			if json.Unmarshal(out.Bytes(), &report) != nil || report.State != "incomplete" || report.Error == "" || report.Authority != "NO_RESULT" {
				t.Fatalf("failure report: %q", out.String())
			}
		} else if out.Len() != 0 {
			t.Fatal("human failure wrote success output")
		}
	}
}

func TestLoadedImageCLIOutputFailuresAndCancellation(t *testing.T) {
	report := clrsfixture.GeneratorLoadedImageReport{Authority: "NO_RESULT", State: "loaded-image-bound-unadmitted"}
	for _, machine := range []bool{false, true} {
		for _, writer := range []io.Writer{clrsInvocationShortWriter{}, clrsInvocationErrorWriter{}} {
			var diagnostic bytes.Buffer
			if code := writeCLRSLoadedImageReport(context.Background(), report, nil, machine, writer, &diagnostic); code != 1 {
				t.Fatal("failed or short output returned success")
			}
		}
		ctx, cancel := context.WithCancel(context.Background())
		var out, diagnostic bytes.Buffer
		if code := writeCLRSLoadedImageReport(ctx, report, nil, machine, clrsOCICancelWriter{cancel}, &diagnostic); code != 1 {
			t.Fatal("cancellation during output returned success")
		}
		if code := writeCLRSLoadedImageReport(ctx, report, nil, machine, &out, &diagnostic); code != 1 || out.Len() != 0 {
			t.Fatal("pre-output cancellation emitted a success report")
		}
	}
	var out, diagnostic bytes.Buffer
	if code := writeCLRSLoadedImageReport(context.Background(), report, errors.New("failed observation"), false, &out, &diagnostic); code != 1 || out.Len() != 0 {
		t.Fatal("operational failure returned success output")
	}
}
