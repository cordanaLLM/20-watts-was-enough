package pdfrender

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
)

// builderInventoryExecutor simulates the Docker Buildx builder set so a test
// can refuse any builder a render leaves behind.
type builderInventoryExecutor struct {
	*recordingExecutor
	builders            []string
	lockedImage         string
	foreignImage        bool
	failCreateBootstrap bool
	failRemoveNotFound  bool
	failRemoveError     error
	onRemove            func(name string)
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
		if executor.failCreateBootstrap {
			return nil, errors.New("docker-container driver bootstrap failed")
		}
		return nil, nil
	default:
		if executor.onRemove != nil {
			executor.onRemove(name)
		}
		if executor.failRemoveError != nil {
			return nil, executor.failRemoveError
		}
		if !slices.Contains(executor.builders, name) {
			if executor.failRemoveNotFound {
				return nil, errors.New(`no builder "` + name + `" found`)
			}
			return nil, nil
		}
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

func TestCachedBuilderNameBindsPlatform(t *testing.T) {
	configuration := renderConfiguration(t)
	lockA := configuration.Lock
	lockA.Platform = "linux/amd64"
	lockB := configuration.Lock
	lockB.Platform = "linux/arm64"
	nameA := cachedBuilderName(lockA)
	nameB := cachedBuilderName(lockB)
	if nameA == nameB {
		t.Fatalf("cachedBuilderName() must change when platform changes: %s == %s", nameA, nameB)
	}
}

func TestUsesCachedBuilderSourceRefs(t *testing.T) {
	if !usesCachedBuilder("main") {
		t.Fatal("usesCachedBuilder(main) = false, want true")
	}
	for _, ref := range []string{"v1.2.3", "v1.2.3-rc.1"} {
		if usesCachedBuilder(ref) {
			t.Fatalf("usesCachedBuilder(%s) = true, want false", ref)
		}
	}
}

func TestBuildArgumentsPullFlagDistinction(t *testing.T) {
	configuration := renderConfiguration(t)
	fresh := buildArguments(configuration, "builder-fresh", "/context", "/iid")
	cached := cachedBuildArguments(configuration, "builder-cached", "/context", "/iid")
	if !slices.Contains(fresh, "--pull") {
		t.Fatalf("fresh build arguments must contain --pull: %v", fresh)
	}
	if slices.Contains(cached, "--pull") {
		t.Fatalf("cached build arguments must drop --pull: %v", cached)
	}
}

func TestDescribeBuilderForms(t *testing.T) {
	owned := describeBuilder(rendererBuilder{name: "pdf20w-test", owned: true})
	wantOwned := "fresh builder pdf20w-test with --pull"
	if owned != wantOwned {
		t.Fatalf("describeBuilder(owned) = %q, want %q", owned, wantOwned)
	}
	cached := describeBuilder(rendererBuilder{name: "pdf20w-cache-0123456789abcdef", owned: false})
	wantCached := "cached builder pdf20w-cache-0123456789abcdef"
	if cached != wantCached {
		t.Fatalf("describeBuilder(cached) = %q, want %q", cached, wantCached)
	}
}

func TestRemoveOutdatedCachedBuildersInventoryBound(t *testing.T) {
	configuration := renderConfiguration(t)
	current := cachedBuilderName(configuration.Lock)
	// The fake lists a node line after each builder, as buildx ls does, so
	// the bound counts listed names: 128 builders list 256, 129 list 258.
	inventory := func(builders int) []string {
		names := []string{current}
		for index := 1; index < builders; index++ {
			names = append(names, fmt.Sprintf("unrelated-%03d", index))
		}
		return names
	}
	accepted := maximumListedBuilders / 2
	acceptedExecutor := newBuilderInventoryExecutor(
		configuration, &recordingExecutor{imageID: testImageID}, inventory(accepted)...,
	)
	if err := removeOutdatedCachedBuilders(context.Background(), configuration, acceptedExecutor, current); err != nil {
		t.Fatalf("removeOutdatedCachedBuilders() with %d listed names error = %v, want nil", 2*accepted, err)
	}

	refusedExecutor := newBuilderInventoryExecutor(
		configuration, &recordingExecutor{imageID: testImageID}, inventory(accepted+1)...,
	)
	err := removeOutdatedCachedBuilders(context.Background(), configuration, refusedExecutor, current)
	if err == nil || !strings.Contains(err.Error(), "more than 256 builders") {
		t.Fatalf("removeOutdatedCachedBuilders() with %d listed names error = %v, want refusal exceeding bound", 2*(accepted+1), err)
	}
}

func TestRemoveOutdatedCachedBuildersRespectsContextCancellation(t *testing.T) {
	configuration := renderConfiguration(t)
	current := cachedBuilderName(configuration.Lock)
	outdated1 := cachedBuilderPrefix + "1111111111111111"
	outdated2 := cachedBuilderPrefix + "2222222222222222"
	executor := newBuilderInventoryExecutor(
		configuration, &recordingExecutor{imageID: testImageID}, current, outdated1, outdated2,
	)
	ctx, cancel := context.WithCancel(context.Background())
	executor.onRemove = func(name string) {
		cancel()
	}
	err := removeOutdatedCachedBuilders(ctx, configuration, executor, current)
	if err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("removeOutdatedCachedBuilders() error = %v, want context.Canceled", err)
	}
	if !slices.Contains(executor.builders, outdated2) {
		t.Fatalf("removeOutdatedCachedBuilders() removed %s after context cancellation", outdated2)
	}
}

func TestRemoveOutdatedCachedBuildersIgnoresConcurrentRemovalWhenBuilderAbsent(t *testing.T) {
	configuration := renderConfiguration(t)
	current := cachedBuilderName(configuration.Lock)
	outdated := cachedBuilderPrefix + "0123456789abcdef"
	executor := newBuilderInventoryExecutor(
		configuration, &recordingExecutor{imageID: testImageID}, current, outdated,
	)
	executor.failRemoveNotFound = true
	executor.onRemove = func(name string) {
		executor.builders = slices.DeleteFunc(executor.builders, func(builder string) bool { return builder == name })
	}
	err := removeOutdatedCachedBuilders(context.Background(), configuration, executor, current)
	if err != nil {
		t.Fatalf("removeOutdatedCachedBuilders() error = %v, want nil for concurrent removal", err)
	}
}

func TestRemoveOutdatedCachedBuildersFailsWhenBuilderRemainsAfterRemovalError(t *testing.T) {
	configuration := renderConfiguration(t)
	current := cachedBuilderName(configuration.Lock)
	outdated := cachedBuilderPrefix + "0123456789abcdef"
	executor := newBuilderInventoryExecutor(
		configuration, &recordingExecutor{imageID: testImageID}, current, outdated,
	)
	executor.failRemoveError = errors.New("daemon I/O failure")
	err := removeOutdatedCachedBuilders(context.Background(), configuration, executor, current)
	if err == nil || !strings.Contains(err.Error(), "daemon I/O failure") {
		t.Fatalf("removeOutdatedCachedBuilders() error = %v, want daemon I/O failure", err)
	}
}

func TestCreateLockedBuilderCleansUpOnCreateNamedBuilderFailure(t *testing.T) {
	configuration := renderConfiguration(t)
	executor := newBuilderInventoryExecutor(configuration, &recordingExecutor{imageID: testImageID})
	executor.failCreateBootstrap = true
	_, err := createLockedBuilder(context.Background(), configuration, executor)
	if err == nil {
		t.Fatal("createLockedBuilder() error = nil, want bootstrap failure")
	}
	if len(executor.builders) != 0 {
		t.Fatalf("createLockedBuilder() leaked builders on failure: %v", executor.builders)
	}
}

func TestCreateLockedBuilderJoinsCleanupError(t *testing.T) {
	configuration := renderConfiguration(t)
	executor := newBuilderInventoryExecutor(configuration, &recordingExecutor{imageID: testImageID})
	executor.failCreateBootstrap = true
	executor.failRemoveError = errors.New("cleanup rm failed")
	_, err := createLockedBuilder(context.Background(), configuration, executor)
	if err == nil {
		t.Fatal("createLockedBuilder() error = nil, want failure")
	}
	if !strings.Contains(err.Error(), "docker-container driver bootstrap failed") ||
		!strings.Contains(err.Error(), "cleanup rm failed") {
		t.Fatalf("createLockedBuilder() error = %v, want joined bootstrap and cleanup errors", err)
	}
}

func TestEnsureCachedBuilderRefusesForeignImageAfterCreation(t *testing.T) {
	configuration := cachedRenderConfiguration(t)
	executor := newBuilderInventoryExecutor(configuration, &recordingExecutor{imageID: testImageID})
	executor.foreignImage = true
	_, err := ensureCachedBuilder(context.Background(), configuration, executor)
	if err == nil || !strings.Contains(err.Error(), "locked docker-container BuildKit image") {
		t.Fatalf("ensureCachedBuilder() error = %v, want foreign image refusal after creation", err)
	}
}
