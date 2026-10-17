package clrsfixture

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

func TestPromiseTransfersUseFixedRuntimeExec(t *testing.T) {
	inputs := promiseLifecycleInputs(t)
	name := "20w-promise-" + strings.Repeat("1", 32)
	for _, operation := range []string{"copy-source", "read-wheel"} {
		arguments := promiseTransferArguments(inputs.manifest.SourceBuild, name, operation)
		if arguments[0] != "container" || arguments[1] != "exec" || slices.Contains(arguments, "cp") ||
			!slices.Contains(arguments, "--user=65532:65532") || !slices.Contains(arguments, "/usr/bin/env") ||
			!slices.Contains(arguments, "-i") || arguments[len(arguments)-3] != "python" || arguments[len(arguments)-2] != "-c" {
			t.Fatalf("transfer is not fixed direct runtime execution: %v", arguments)
		}
		if slices.Contains(arguments, "--interactive") != (operation == "copy-source") {
			t.Fatalf("unexpected stdin configuration: %v", arguments)
		}
	}
}

func TestPromiseMaterializerChecksExactBytesBeforeExtraction(t *testing.T) {
	program := promiseMaterializer()
	read := strings.Index(program, fmt.Sprintf("sys.stdin.buffer.read(%d)", promiseCanonicalTarSize+1))
	hash := strings.Index(program, promiseCanonicalTarSHA256)
	extract := strings.Index(program, `archive.extractall("/work", members=members, filter="data")`)
	if read < 0 || hash <= read || extract <= hash || !strings.Contains(program, fmt.Sprintf("len(body) != %d", promiseCanonicalTarSize)) {
		t.Fatal("materializer no longer verifies the bounded canonical transfer before extraction")
	}
	for _, boundary := range []string{"os.umask(0o022)", "errorlevel=2", "info.st_mode & 0o777", "info.st_mtime != member.mtime", "info.st_uid != 65532", "info.st_gid != 65532"} {
		if !strings.Contains(program, boundary) {
			t.Fatalf("missing materialization boundary %q", boundary)
		}
	}
}

func TestPromiseOutputReaderHasBoundedRegularFileEnvelope(t *testing.T) {
	program := promiseOutputReader()
	for _, boundary := range []string{"next(entries, None)", "extra is not None", "entry.name != name", "entry.is_file(follow_symlinks=False)",
		"os.O_NOFOLLOW", "os.O_NONBLOCK", "stat.S_ISREG(before.st_mode)", "before.st_size > maximum", "wheel.read(maximum + 1)",
		"info.st_mtime_ns", "info.st_ctime_ns", "tarfile.USTAR_FORMAT", "archive.addfile(member, io.BytesIO(body))"} {
		if !strings.Contains(program, boundary) {
			t.Fatalf("missing readback boundary %q", boundary)
		}
	}
	if strings.Contains(program, "st_atime") {
		t.Fatal("normal read access time must not appear in stable-file identity")
	}
}

func TestPromiseReceiptRejectsModifiedTransferPrograms(t *testing.T) {
	inputs, receipt := promiseReceiptFixture(t)
	for _, operation := range []string{"copy-source", "read-wheel"} {
		t.Run(operation, func(t *testing.T) {
			entries := promiseLogFixture(t, inputs, receipt.Runs[0])
			for index := range entries {
				if entries[index].Operation == operation {
					arguments := slices.Clone(entries[index].Arguments)
					arguments[len(arguments)-1] += "\nprint('modified transfer')\n"
					entries[index].Arguments = arguments
				}
			}
			body, err := strictjson.Canonical(entries)
			if err != nil {
				t.Fatal(err)
			}
			if err := validatePromiseCommandLog(body, receipt.Runs[0], inputs.procedure); err == nil || !strings.Contains(err.Error(), "argv differs") {
				t.Fatalf("changed transfer was not rejected at argv boundary: %v", err)
			}
		})
	}
}
