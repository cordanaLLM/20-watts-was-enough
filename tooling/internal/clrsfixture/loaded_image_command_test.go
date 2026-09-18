package clrsfixture

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The fake "docker" is this Go test executable. Its testing flag parser rejects
// --host with exit 2 before any test runs; no Docker executable is invoked.
func TestLoadedImageAdapterPinsOneResolvedExecutable(t *testing.T) {
	path := filepath.Join(t.TempDir(), fakeDockerExecutableName())
	if err := os.Symlink(os.Args[0], path); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", filepath.Dir(path))
	t.Setenv("DOCKER_HOST", "tcp://must-not-be-used.invalid:2375")
	execute := newLoadedImageDocker()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	args := []string{"version", "--format", "{{.Client.Version}} {{.Server.Version}}"}
	first, err := execute(ctx, args, nil, 64<<10)
	fakeDockerInvocationExit(t, first, err)
	if len(first.Arguments) < 3 || first.Arguments[0] != os.Args[0] || first.Arguments[1] != "--host" || first.Arguments[2] != generationDockerEndpoint {
		t.Fatalf("fake executable invocation: %+v %v", first, err)
	}
	t.Setenv("PATH", t.TempDir())
	second, err := execute(ctx, args, nil, 64<<10)
	fakeDockerInvocationExit(t, second, err)
	if second.Arguments[0] != first.Arguments[0] {
		t.Fatalf("PATH drift changed selected executable: %+v %v", second, err)
	}
}

func TestLoadedImageAdapterRejectsChangedExecutableBeforeAnotherCall(t *testing.T) {
	body, err := os.ReadFile(os.Args[0])
	if err != nil || len(body) > 128<<20 {
		t.Fatalf("bounded test executable fixture: %v", err)
	}
	path := filepath.Join(t.TempDir(), fakeDockerExecutableName())
	if err := os.WriteFile(path, body, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", filepath.Dir(path))
	execute := newLoadedImageDocker()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	args := []string{"version", "--format", "{{.Client.Version}} {{.Server.Version}}"}
	record, err := execute(ctx, args, nil, 64<<10)
	fakeDockerInvocationExit(t, record, err)
	if err := os.WriteFile(path+".replacement", append(body, '\n'), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(path+".replacement", path); err != nil {
		t.Fatal(err)
	}
	record, err = execute(ctx, args, nil, 64<<10)
	if err == nil || record.ExitCode != -1 || len(record.Arguments) != 0 || !strings.Contains(err.Error(), "executable changed") {
		t.Fatalf("changed executable reached a process: %+v %v", record, err)
	}
}

func TestLoadedImageAdapterRejectsInvalidUseBeforeResolution(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	execute := newLoadedImageDocker()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	for _, args := range [][]string{{"image", "load"}, {"image", "inspect", "latest"}, {"container", "create"}, nil} {
		if record, err := execute(ctx, args, nil, 64<<10); err == nil || record.ExitCode != -1 || len(record.Arguments) != 0 {
			t.Fatal("invalid adapter use selected an executable")
		}
	}
	args := []string{"version", "--format", "{{.Client.Version}} {{.Server.Version}}"}
	for _, unbounded := range []context.Context{nil, context.Background()} {
		if _, err := execute(unbounded, args, nil, 64<<10); err == nil || !strings.Contains(err.Error(), "requires") {
			t.Fatalf("unbounded adapter context: %v", err)
		}
	}
	cancel()
	if _, err := execute(ctx, args, nil, 64<<10); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled adapter: %v", err)
	}
}
