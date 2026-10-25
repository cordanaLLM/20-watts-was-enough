package pdfrender

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
)

// builderInventoryExecutor simulates the Docker Buildx builder set so a test
// can refuse any builder a render leaves behind.
type builderInventoryExecutor struct {
	*recordingExecutor
	builders     []string
	lockedImage  string
	foreignImage bool
}

func newBuilderInventoryExecutor(configuration Configuration, recording *recordingExecutor, builders ...string) *builderInventoryExecutor {
	return &builderInventoryExecutor{
		recordingExecutor: recording,
		builders:          builders,
		lockedImage:       configuration.Lock.Builder.BuildKitImage,
	}
}

func (executor *builderInventoryExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	arguments := request.arguments
	if len(arguments) < 2 || arguments[0] != "buildx" || !slices.Contains([]string{"ls", "inspect", "create", "rm"}, arguments[1]) {
		return executor.recordingExecutor.run(ctx, request)
	}
	executor.mu.Lock()
	defer executor.mu.Unlock()
	executor.requests = append(executor.requests, request)
	name := arguments[len(arguments)-1]
	switch arguments[1] {
	case "ls":
		var output strings.Builder
		for _, builder := range executor.builders {
			output.WriteString(builder + "\n" + builder + "0\n")
		}
		return []byte(output.String()), nil
	case "inspect":
		if !slices.Contains(executor.builders, name) {
			return nil, errors.New(`no builder "` + name + `" found`)
		}
		image := executor.lockedImage
		if executor.foreignImage {
			image = "moby/buildkit:foreign@sha256:" + strings.Repeat("0", 64)
		}
		return []byte("Driver: docker-container\nDriver Options: image=\"" + image + "\"\n"), nil
	case "create":
		builder := argumentAfterValue(arguments, "--name")
		if slices.Contains(executor.builders, builder) {
			return nil, errors.New("existing instance for " + builder)
		}
		executor.builders = append(executor.builders, builder)
		return nil, nil
	default:
		executor.builders = slices.DeleteFunc(executor.builders, func(builder string) bool { return builder == name })
		return nil, nil
	}
}

func cachedRenderConfiguration(t *testing.T) Configuration {
	t.Helper()
	configuration := renderConfiguration(t)
	configuration.cachedBuilder = true
	return configuration
}

func TestCachedRenderReusesBuilderWithoutPullAndRemovesOnlyOutdatedCachedBuilders(t *testing.T) {
	configuration := cachedRenderConfiguration(t)
	current := cachedBuilderName(configuration.Lock)
	outdated := cachedBuilderPrefix + "0123456789abcdef"
	unrelated := []string{"default", "pdf20w-1-0011223344556677", "pdf20w-cache-short"}
	executor := newBuilderInventoryExecutor(
		configuration, &recordingExecutor{imageID: testImageID}, append([]string{current, outdated}, unrelated...)...,
	)
	result, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
	if err != nil {
		t.Fatalf("renderWithDependencies() error = %v", err)
	}
	if result.Builder != "cached builder "+current {
		t.Fatalf("result builder = %q, want cached builder %s", result.Builder, current)
	}
	if len(requestsWithPrefix(executor.requests, "buildx", "create")) != 0 {
		t.Fatal("cached render created a builder although the locked one exists")
	}
	build := requestWithPrefix(t, executor.requests, "buildx", "build").arguments
	if slices.Contains(build, "--pull") || argumentAfterValue(build, "--builder") != current {
		t.Fatalf("cached build must use %s without --pull: %v", current, build)
	}
	want := append([]string{current}, unrelated...)
	if !slices.Equal(executor.builders, want) {
		t.Fatalf("builders after cached render = %v, want %v", executor.builders, want)
	}
}

func TestRenderLeavesNoBuilderItCreatedExceptTheCachedOne(t *testing.T) {
	for _, test := range []struct {
		name    string
		cached  bool
		failRun bool
	}{
		{name: "fresh success"},
		{name: "fresh render failure", failRun: true},
		{name: "cached success", cached: true},
		{name: "cached render failure", cached: true, failRun: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			configuration := renderConfiguration(t)
			if test.cached {
				configuration = cachedRenderConfiguration(t)
			}
			executor := newBuilderInventoryExecutor(
				configuration, &recordingExecutor{imageID: testImageID, failRun: test.failRun}, "default",
			)
			_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
			if (err != nil) != test.failRun {
				t.Fatalf("renderWithDependencies() error = %v, want failure %t", err, test.failRun)
			}
			want := []string{"default"}
			if test.cached {
				want = append(want, cachedBuilderName(configuration.Lock))
			}
			if !slices.Equal(executor.builders, want) {
				t.Fatalf("leftover builders = %v, want %v", executor.builders, want)
			}
		})
	}
}

func TestCachedRenderRefusesABuilderWithAForeignBuildKitImage(t *testing.T) {
	configuration := cachedRenderConfiguration(t)
	executor := newBuilderInventoryExecutor(
		configuration, &recordingExecutor{imageID: testImageID}, cachedBuilderName(configuration.Lock),
	)
	executor.foreignImage = true
	_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
	if err == nil || !strings.Contains(err.Error(), "locked docker-container BuildKit image") {
		t.Fatalf("renderWithDependencies() error = %v, want foreign builder refusal", err)
	}
	if len(requestsWithPrefix(executor.requests, "buildx", "build")) != 0 {
		t.Fatal("render built on a builder whose BuildKit image differs from the lock")
	}
}

func TestCachedBuilderNameBindsTheBuildKitLock(t *testing.T) {
	configuration := renderConfiguration(t)
	name := cachedBuilderName(configuration.Lock)
	if !cachedBuilderNamePattern.MatchString(name) || cachedBuilderNamePattern.MatchString(name+"0") {
		t.Fatalf("cached builder name %q does not match only its own pattern", name)
	}
	changed := configuration.Lock
	changed.Builder.BuildKitImage += "-changed"
	if cachedBuilderName(changed) == name {
		t.Fatal("cached builder name ignores the locked BuildKit image")
	}
}
