package pdfrender

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
)

// cachedBuilderPrefix names the persistent BuildKit builder that local `main`
// renders reuse (Decision 0119). Tag renders keep a fresh builder per run.
const cachedBuilderPrefix = "pdf20w-cache-"

// maximumListedBuilders bounds the builder inventory read before cleanup.
const maximumListedBuilders = 256

var cachedBuilderNamePattern = regexp.MustCompile(`^` + cachedBuilderPrefix + `[0-9a-f]{16}$`)

// rendererBuilder is the builder one render uses. Owned builders are created
// for this run and removed on every return path; a cached builder persists.
type rendererBuilder struct {
	name  string
	owned bool
}

func usesCachedBuilder(sourceRef string) bool {
	return sourceRef == "main"
}

// cachedBuilderName binds the persistent builder to the locked BuildKit image
// and platform, so a lock change selects a new builder and an empty store.
func cachedBuilderName(lock Lock) string {
	digest := sha256.Sum256([]byte(lock.Builder.BuildKitImage + "\n" + lock.Platform))
	return cachedBuilderPrefix + hex.EncodeToString(digest[:8])
}

// describeBuilder names the executed builder path for the render report.
func describeBuilder(builder rendererBuilder) string {
	if builder.owned {
		return "fresh builder " + builder.name + " with --pull"
	}
	return "cached builder " + builder.name
}

func ensureCachedBuilder(ctx context.Context, configuration Configuration, executor commandExecutor) (string, error) {
	name := cachedBuilderName(configuration.Lock)
	if err := removeOutdatedCachedBuilders(ctx, configuration, executor, name); err != nil {
		return "", err
	}
	if inspectError := inspectCachedBuilder(ctx, configuration, executor, name); inspectError == nil {
		return name, nil
	}
	if err := createNamedBuilder(ctx, configuration, executor, name); err != nil {
		// A concurrent render in another worktree may have created it first.
		if inspectError := inspectCachedBuilder(ctx, configuration, executor, name); inspectError != nil {
			return "", errors.Join(err, inspectError)
		}
	}
	return name, nil
}

// inspectCachedBuilder starts the builder and refuses one whose driver or
// BuildKit image differs from the lock, whatever its name says.
func inspectCachedBuilder(ctx context.Context, configuration Configuration, executor commandExecutor, name string) error {
	output, err := executor.run(ctx, commandRequest{
		operation:  "inspect cached Docker BuildKit builder",
		directory:  configuration.RepositoryRoot,
		timeout:    time.Duration(configuration.Lock.Limits.BuildSeconds) * time.Second,
		outputSize: configuration.Lock.Limits.OutputBytes,
		arguments:  []string{"buildx", "inspect", "--bootstrap", name},
	})
	if err != nil {
		return err
	}
	text := string(output)
	if !strings.Contains(text, "docker-container") ||
		!strings.Contains(text, `image="`+configuration.Lock.Builder.BuildKitImage+`"`) {
		return fmt.Errorf("cached builder %s does not use the locked docker-container BuildKit image", name)
	}
	return nil
}

// removeOutdatedCachedBuilders removes cached builders bound to an earlier
// BuildKit lock. Builders outside the cached prefix are never touched.
func removeOutdatedCachedBuilders(ctx context.Context, configuration Configuration, executor commandExecutor, current string) error {
	output, err := executor.run(ctx, commandRequest{
		operation:  "list Docker BuildKit builders",
		directory:  configuration.RepositoryRoot,
		timeout:    30 * time.Second,
		outputSize: configuration.Lock.Limits.OutputBytes,
		arguments:  []string{"buildx", "ls", "--format", "{{.Name}}"},
	})
	if err != nil {
		return err
	}
	names := strings.Fields(string(output))
	if len(names) > maximumListedBuilders {
		return fmt.Errorf("Docker Buildx lists more than %d builders", maximumListedBuilders)
	}
	var removed []string
	for _, name := range names {
		if name == current || !cachedBuilderNamePattern.MatchString(name) || slices.Contains(removed, name) {
			continue
		}
		if err := removeBuilder(executor, name, configuration.Lock.Limits.OutputBytes); err != nil {
			return fmt.Errorf("remove outdated cached builder %s: %w", name, err)
		}
		removed = append(removed, name)
	}
	return nil
}

// cachedBuildArguments drops --pull: both FROM lines name immutable digests,
// so BuildKit fetches a base image only when the lock changes its digest.
func cachedBuildArguments(configuration Configuration, builderName, contextRoot, iidPath string) []string {
	return slices.DeleteFunc(
		buildArguments(configuration, builderName, contextRoot, iidPath),
		func(argument string) bool { return argument == "--pull" },
	)
}
