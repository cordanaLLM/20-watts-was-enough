package clrscontext

import (
	"archive/tar"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func smallPlan(t *testing.T) plan {
	t.Helper()
	file := filepath.Join(t.TempDir(), "wheel.whl")
	body := []byte("bounded wheel fixture")
	if err := os.WriteFile(file, body, 0o644); err != nil {
		t.Fatal(err)
	}
	m := dataMember("wheels/wheel.whl", body, 0o644)
	m.body = nil
	m.input = file
	return plan{epoch: 1787658740, members: []member{dataMember("Dockerfile", []byte("FROM pinned\n"), 0o644), dataMember("source/LICENSE", []byte("test licence"), 0o644), m}}
}

func TestContextTarIsDeterministicAndNormalised(t *testing.T) {
	p := smallPlan(t)
	var first, second bytes.Buffer
	a, err := writeContext(context.Background(), &first, p)
	if err != nil {
		t.Fatal(err)
	}
	b, err := writeContext(context.Background(), &second, p)
	if err != nil {
		t.Fatal(err)
	}
	if a != b || !bytes.Equal(first.Bytes(), second.Bytes()) || a.Files != 3 || a.SHA256 != hashBytes(first.Bytes()) {
		t.Fatal("context is not deterministic")
	}
	r := tar.NewReader(bytes.NewReader(first.Bytes()))
	files := 0
	directories := 0
	for {
		header, err := r.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if header.Format != tar.FormatUSTAR || header.Uid != 0 || header.Gid != 0 || header.ModTime.Unix() != p.epoch || header.Linkname != "" {
			t.Fatalf("unexpected tar metadata: %+v", header)
		}
		if header.Typeflag == tar.TypeDir {
			directories++
		} else {
			files++
		}
	}
	if files != 3 || directories != 2 {
		t.Fatalf("members = %d files / %d dirs", files, directories)
	}
}

func TestPrepareRejectsCancellationAndInputOutputOverlap(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Prepare(ctx, Options{}, false); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled prepare = %v", err)
	}
	root := t.TempDir()
	wheels := t.TempDir()
	proof := t.TempDir()
	frozen := t.TempDir()
	o := Options{RepositoryRoot: root, Wheelhouse: wheels, SourceArchive: "source.tar.gz", PromiseSourceRoot: frozen, PromiseEvidence: proof}
	for _, output := range []string{filepath.Join(wheels, "candidate.tar"), filepath.Join(proof, "candidate.tar"), filepath.Join(frozen, "candidate.tar"), filepath.Join(root, "tooling/clrs-generator/Dockerfile")} {
		o.Output = output
		if err := validateOptions(o); err == nil {
			t.Fatalf("accepted overlapping output %q", output)
		}
	}
}

func TestContextPreservesLongPinnedWheelFilename(t *testing.T) {
	name := "wheels/charset_normalizer-3.5.1-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
	p := plan{epoch: 1787658740, members: []member{dataMember(name, []byte("wheel fixture"), 0o644)}}
	var first, second bytes.Buffer
	a, err := writeContext(context.Background(), &first, p)
	if err != nil {
		t.Fatal(err)
	}
	b, err := writeContext(context.Background(), &second, p)
	if err != nil || a != b || !bytes.Equal(first.Bytes(), second.Bytes()) {
		t.Fatalf("long-name context is not deterministic: %v", err)
	}
	r := tar.NewReader(bytes.NewReader(first.Bytes()))
	if _, err := r.Next(); err != nil {
		t.Fatal(err)
	}
	header, err := r.Next()
	if err != nil {
		t.Fatal(err)
	}
	if header.Name != name || header.Format != tar.FormatPAX || len(header.PAXRecords) != 1 || header.PAXRecords["path"] != name || header.ModTime.Unix() != p.epoch || header.Uid != 0 || header.Gid != 0 {
		t.Fatalf("unexpected long-name tar metadata: %+v", header)
	}
	body, err := io.ReadAll(r)
	if err != nil || string(body) != "wheel fixture" {
		t.Fatalf("wheel content changed: %q %v", body, err)
	}
}

func TestContextEncodesEveryCanonicalWheelFilename(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	_, input, image, authority, err := loadAuthority(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	bodies := map[string][]byte{}
	for _, m := range authority {
		bodies[filepath.Base(m.Path)] = m.body
	}
	wheels, err := clrsfixture.ParseGeneratorWheelhouseManifest(bodies["wheelhouse.json"], bodies["uv.lock"], input, image)
	if err != nil {
		t.Fatal(err)
	}
	p := plan{epoch: wheels.SourceDateEpoch}
	for _, wheel := range wheels.Artifacts {
		p.members = append(p.members, dataMember("wheels/"+wheel.Filename, []byte(wheel.Package), 0o644))
	}
	var first, second bytes.Buffer
	a, err := writeContext(context.Background(), &first, p)
	if err != nil {
		t.Fatal(err)
	}
	b, err := writeContext(context.Background(), &second, p)
	if err != nil || a != b || !bytes.Equal(first.Bytes(), second.Bytes()) {
		t.Fatalf("canonical filename context is not deterministic: %v", err)
	}
	r := tar.NewReader(bytes.NewReader(first.Bytes()))
	if _, err := r.Next(); err != nil {
		t.Fatal(err)
	}
	for _, wheel := range wheels.Artifacts {
		header, err := r.Next()
		if err != nil {
			t.Fatalf("wheel %s: %v", wheel.Filename, err)
		}
		if header.Name != "wheels/"+wheel.Filename || header.Typeflag != tar.TypeReg || header.Uid != 0 || header.Gid != 0 || header.ModTime.Unix() != p.epoch || header.Mode != 0o644 {
			t.Fatalf("wheel identity changed: %+v", header)
		}
		body, err := io.ReadAll(r)
		if err != nil || string(body) != wheel.Package {
			t.Fatalf("wheel content changed: %q %v", body, err)
		}
	}
	if _, err := r.Next(); err != io.EOF {
		t.Fatalf("unexpected trailing member: %v", err)
	}
}

func TestPublishCheckAndNoOverwrite(t *testing.T) {
	p := smallPlan(t)
	output := filepath.Join(t.TempDir(), "context.tar")
	result, err := publishContext(context.Background(), output, p, func() error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(output)
	if err != nil {
		t.Fatal(err)
	}
	checked, err := checkContext(context.Background(), output, p)
	if err != nil || checked != result {
		t.Fatalf("check: %+v %v", checked, err)
	}
	after, _ := os.Stat(output)
	if !sameFile(before, after) {
		t.Fatal("read-only check changed output")
	}
	if _, err := publishContext(context.Background(), output, p, func() error { return nil }); err == nil {
		t.Fatal("overwrote existing context")
	}
	assertOnly(t, filepath.Dir(output), "context.tar")
	body, _ := os.ReadFile(output)
	body[len(body)/2] ^= 1
	if err := os.WriteFile(output, body, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := checkContext(context.Background(), output, p); err == nil {
		t.Fatal("accepted same-size context tampering")
	}
}

func TestPublicationFailuresLeaveNoPartialOutput(t *testing.T) {
	for _, kind := range []string{"wheel-change", "recheck", "cancelled"} {
		t.Run(kind, func(t *testing.T) {
			p := smallPlan(t)
			output := filepath.Join(t.TempDir(), "context.tar")
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			recheck := func() error { return nil }
			switch kind {
			case "wheel-change":
				if err := os.WriteFile(p.members[2].input, []byte("changed"), 0o644); err != nil {
					t.Fatal(err)
				}
			case "recheck":
				recheck = func() error { return errors.New("authority changed") }
			case "cancelled":
				cancel()
			}
			if _, err := publishContext(ctx, output, p, recheck); err == nil {
				t.Fatal("accepted failed publication")
			}
			assertOnly(t, filepath.Dir(output))
		})
	}
}

func TestPublicationPreservesConcurrentCreator(t *testing.T) {
	p := smallPlan(t)
	output := filepath.Join(t.TempDir(), "context.tar")
	other := []byte("concurrent owner")
	_, err := publishContext(context.Background(), output, p, func() error { return os.WriteFile(output, other, 0o600) })
	if err == nil {
		t.Fatal("overwrote concurrent creator")
	}
	body, err := os.ReadFile(output)
	if err != nil || !bytes.Equal(body, other) {
		t.Fatalf("concurrent output changed: %q %v", body, err)
	}
	assertOnly(t, filepath.Dir(output), "context.tar")
}

func TestContextRejectsUnsafePathsAndBudgets(t *testing.T) {
	for _, name := range []string{"..", "../outside", "/absolute", "a/../b", "a\\b", "a:b", "a\x00b", "a\nb", "a//b", strings.Repeat("a/", 20) + "b"} {
		if _, err := contextDirectories([]member{dataMember(name, nil, 0o644)}); err == nil {
			t.Errorf("accepted path %q", name)
		}
	}
	if _, err := contextDirectories([]member{dataMember("a", nil, 0o644), dataMember("a/b", nil, 0o644)}); err == nil {
		t.Fatal("accepted file/directory conflict")
	}
	if _, err := contextDirectories([]member{dataMember("a", nil, 0o644), dataMember("a", nil, 0o644)}); err == nil {
		t.Fatal("accepted duplicate")
	}
	writer := limitWriter{writer: io.Discard, remaining: 3}
	if _, err := writer.Write([]byte("four")); err == nil || writer.written != 0 {
		t.Fatal("accepted output overflow")
	}
}

func TestStableInputsRejectSymlinksAndOversize(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "file")
	link := filepath.Join(root, "link")
	if err := os.WriteFile(file, []byte("bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(file, link); err != nil {
		t.Fatal(err)
	}
	if _, err := readStable(context.Background(), link, 100); err == nil {
		t.Fatal("accepted symlink")
	}
	if _, err := readStable(context.Background(), file, 2); err == nil {
		t.Fatal("accepted oversized file")
	}
	directoryLink := filepath.Join(t.TempDir(), "root")
	if err := os.Symlink(root, directoryLink); err != nil {
		t.Fatal(err)
	}
	if _, err := readStable(context.Background(), filepath.Join(directoryLink, "file"), 100); err == nil {
		t.Fatal("accepted symlinked parent")
	}
}

func TestOfflineDockerfileUsesExistingAuthority(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	_, input, image, _, err := loadAuthority(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	text := string(dockerfile(input, image))
	for _, required := range []string{input.Python.BaseImage, "--network=none", "--no-index", "--no-deps", "--no-compile", "--require-hashes", "--only-binary=:all:", "source=wheels", "COPY source/ /opt/clrs/", "COPY source/LICENSE /usr/share/licenses/clrs/LICENSE", "USER 65532:65532", "JAX_PLATFORMS=\"cpu\"", "clrs._src.clrs_text.generate_clrs_text"} {
		if !strings.Contains(text, required) {
			t.Errorf("missing %q", required)
		}
	}
	if strings.Contains(text, "# syntax=") || strings.Contains(text, "apt-get") || strings.Contains(text, "pip install --upgrade") {
		t.Fatal("introduced mutable network input")
	}
	requirement := requirements(clrsfixture.GeneratorWheelhouseManifest{Artifacts: []clrsfixture.GeneratorWheelhouseEntry{{Package: "test", Version: "1.2", SHA256: strings.Repeat("a", 64)}}})
	if string(requirement) != "test==1.2 --hash=sha256:"+strings.Repeat("a", 64)+"\n" {
		t.Fatalf("requirements = %q", requirement)
	}
}

func assertOnly(t *testing.T, directory string, names ...string) {
	t.Helper()
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != len(names) {
		t.Fatalf("unexpected leftover entries: %+v", entries)
	}
	for i, name := range names {
		if entries[i].Name() != name {
			t.Fatalf("entry = %s, want %s", entries[i].Name(), name)
		}
	}
}
