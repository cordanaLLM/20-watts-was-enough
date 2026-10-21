package pdftools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
)

// RuntimeObservation is the bounded local execution evidence for the exact
// final image that was compared.
type RuntimeObservation struct {
	ImageManifestDigest string                   `json:"image_manifest_digest"`
	ConfiguredUID       int                      `json:"configured_uid"`
	ConfiguredGID       int                      `json:"configured_gid"`
	IdentityBasis       string                   `json:"identity_basis"`
	ContentRetention    string                   `json:"content_retention"`
	Tools               []RuntimeToolObservation `json:"tools"`
	Containment         RuntimeContainment       `json:"containment"`
}

// RuntimeToolObservation records one version probe and its required stream.
type RuntimeToolObservation struct {
	Name          string `json:"name"`
	Version       string `json:"version"`
	VersionStream string `json:"version_stream"`
}

// RuntimeContainment records the Docker configuration inspected before the
// same argument set is used for the Poppler probes.
type RuntimeContainment struct {
	Network         string `json:"network"`
	ReadOnlyRoot    bool   `json:"read_only_root"`
	Capabilities    string `json:"capabilities"`
	NoNewPrivileges bool   `json:"no_new_privileges"`
	MemoryBytes     int64  `json:"memory_bytes"`
	PIDs            int    `json:"pids"`
	TemporaryBytes  int64  `json:"temporary_bytes"`
}

type dockerImageInspection struct {
	ID           string   `json:"Id"`
	RepoTags     []string `json:"RepoTags"`
	Architecture string   `json:"Architecture"`
	OS           string   `json:"Os"`
	Config       struct {
		User   string            `json:"User"`
		Env    []string          `json:"Env"`
		Labels map[string]string `json:"Labels"`
	} `json:"Config"`
	RootFS struct {
		Type   string   `json:"Type"`
		Layers []string `json:"Layers"`
	} `json:"RootFS"`
	Descriptor struct {
		Digest string `json:"digest"`
	} `json:"Descriptor"`
}

type dockerContainerInspection struct {
	Image    string `json:"Image"`
	Platform string `json:"Platform"`
	Host     struct {
		NetworkMode  string            `json:"NetworkMode"`
		CapAdd       []string          `json:"CapAdd"`
		CapDrop      []string          `json:"CapDrop"`
		Privileged   bool              `json:"Privileged"`
		ReadonlyRoot bool              `json:"ReadonlyRootfs"`
		SecurityOpt  []string          `json:"SecurityOpt"`
		Memory       int64             `json:"Memory"`
		MemorySwap   int64             `json:"MemorySwap"`
		PIDsLimit    int               `json:"PidsLimit"`
		Tmpfs        map[string]string `json:"Tmpfs"`
	} `json:"HostConfig"`
	Config struct {
		User       string            `json:"User"`
		Image      string            `json:"Image"`
		Entrypoint []string          `json:"Entrypoint"`
		Env        []string          `json:"Env"`
		Labels     map[string]string `json:"Labels"`
	} `json:"Config"`
	NetworkSettings struct {
		Networks map[string]json.RawMessage `json:"Networks"`
	} `json:"NetworkSettings"`
}

func loadAndTagFinalRuntimeImage(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	build finalBuild,
	alias string,
) error {
	if _, err := executor.run(ctx, dockerRequest{
		operation: "load compared untagged PDF-tools final image locally",
		directory: authority.root,
		timeout:   2 * time.Minute,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"image", "load", "--input", build.Archive},
	}); err != nil {
		return err
	}
	reference, present, err := localFinalImageReference(ctx, executor, authority, build.Image.Identity)
	if err != nil || !present {
		return errors.Join(err, errors.New("Docker did not retain the loaded PDF-tools image identity"))
	}
	if _, err := executor.run(ctx, dockerRequest{
		operation: "create owned PDF-tools runtime alias",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"image", "tag", reference, alias},
	}); err != nil {
		return err
	}
	return validateLoadedFinalImage(ctx, executor, authority, build.Image, alias)
}

func probeRuntimeTools(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	alias string,
) ([]RuntimeToolObservation, error) {
	tools := make([]RuntimeToolObservation, 0, len(authority.contract.Runtime.RequiredTools))
	for _, tool := range authority.contract.Runtime.RequiredTools {
		if err := runVersionProbe(ctx, executor, authority, alias, tool); err != nil {
			return nil, err
		}
		tools = append(tools, RuntimeToolObservation{
			Name: tool.Name, Version: tool.Version, VersionStream: tool.VersionStream,
		})
	}
	return tools, nil
}

func inspectFinalRuntime(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	build finalBuild,
) (_ RuntimeObservation, returnError error) {
	preexistingReference, preexisting, err := localFinalImageReference(ctx, executor, authority, build.Image.Identity)
	if err != nil {
		return RuntimeObservation{}, err
	}
	if preexisting {
		if err := validateLoadedFinalImage(ctx, executor, authority, build.Image, preexistingReference); err != nil {
			return RuntimeObservation{}, err
		}
	}
	aliasName, err := reproductionName("runtime-image")
	if err != nil {
		return RuntimeObservation{}, err
	}
	alias := "20w-local/" + aliasName + ":reproduction"
	if err := requireRuntimeAliasAvailable(executor, authority, alias); err != nil {
		return RuntimeObservation{}, err
	}
	defer func() {
		returnError = errors.Join(returnError, removeRuntimeAliasIfPresent(executor, authority, alias))
	}()
	if err := loadAndTagFinalRuntimeImage(ctx, executor, authority, build, alias); err != nil {
		return RuntimeObservation{}, err
	}
	containment, uid, gid, err := inspectRuntimeContainment(ctx, executor, authority, build.Image, alias)
	if err != nil {
		return RuntimeObservation{}, err
	}
	tools, err := probeRuntimeTools(ctx, executor, authority, alias)
	if err != nil {
		return RuntimeObservation{}, err
	}
	return RuntimeObservation{
		ImageManifestDigest: build.Image.Identity.ManifestDigest,
		ConfiguredUID:       uid,
		ConfiguredGID:       gid,
		IdentityBasis:       "exact-image-and-container-config-user-with-direct-entrypoints",
		ContentRetention:    "temporary-alias-removed; untagged-content-remains-docker-managed",
		Tools:               tools,
		Containment:         containment,
	}, nil
}

func localFinalImageReference(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	identity imageIdentity,
) (string, bool, error) {
	result, err := executor.run(ctx, dockerRequest{
		operation: "inventory local Docker image identities",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"image", "ls", "--all", "--no-trunc", "--quiet"},
	})
	if err != nil {
		return "", false, err
	}
	if len(result.stderr) != 0 {
		return "", false, errors.New("local Docker image inventory wrote unexpected stderr")
	}
	seen := make(map[string]struct{})
	for _, line := range strings.Split(strings.TrimSpace(string(result.stdout)), "\n") {
		if line == "" {
			continue
		}
		if !digestPattern.MatchString(line) || len(seen) >= 4096 {
			return "", false, errors.New("local Docker image inventory is ambiguous or exceeds its count boundary")
		}
		seen[line] = struct{}{}
	}
	_, manifestPresent := seen[identity.ManifestDigest]
	_, configPresent := seen[identity.ConfigDigest]
	if manifestPresent && configPresent && identity.ManifestDigest != identity.ConfigDigest {
		return "", false, errors.New("local Docker image inventory exposes both manifest and config identities ambiguously")
	}
	if manifestPresent {
		return identity.ManifestDigest, true, nil
	}
	if configPresent {
		return identity.ConfigDigest, true, nil
	}
	return "", false, nil
}

func validateLoadedFinalImage(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	image inspectedFinalImage,
	tag string,
) error {
	result, err := executor.run(ctx, dockerRequest{
		operation: "inspect loaded PDF-tools final image",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"image", "inspect", "--format", "{{json .}}", tag},
	})
	if err != nil {
		return err
	}
	body := result.stdout
	inspection, err := decodeDockerJSON[dockerImageInspection](body, "loaded PDF-tools image")
	if err != nil {
		return err
	}
	identityMatches := inspection.ID == image.Identity.ManifestDigest || inspection.ID == image.Identity.ConfigDigest
	if inspection.Descriptor.Digest != "" {
		identityMatches = identityMatches && inspection.Descriptor.Digest == image.Identity.ManifestDigest
	}
	if !identityMatches || strings.HasPrefix(tag, "20w-local/") && !slices.Contains(inspection.RepoTags, tag) ||
		inspection.Architecture != "amd64" ||
		inspection.OS != "linux" || inspection.Config.User != "65532" || inspection.RootFS.Type != "layers" ||
		!slices.Equal(inspection.RootFS.Layers, image.Identity.LayerDiffIDs) ||
		!slices.Equal(inspection.Config.Env, image.Config.Config.Env) ||
		!equalStringMap(inspection.Config.Labels, image.Config.Config.Labels) {
		return errors.New("loaded PDF-tools image differs from the inspected final archive")
	}
	return nil
}

func validateRuntimeContainmentInspection(
	inspection dockerContainerInspection,
	authority checkedAuthority,
	image inspectedFinalImage,
	reference string,
) error {
	contract := authority.contract
	expectedUser := strconv.Itoa(contract.Runtime.UID) + ":" + strconv.Itoa(contract.Runtime.GID)
	if inspection.Platform != "linux" ||
		(inspection.Image != image.Identity.ManifestDigest && inspection.Image != image.Identity.ConfigDigest) ||
		inspection.Host.NetworkMode != contract.Runtime.Network || inspection.Host.Privileged ||
		!inspection.Host.ReadonlyRoot || len(inspection.Host.CapAdd) != 0 ||
		!slices.Equal(inspection.Host.CapDrop, []string{"ALL"}) ||
		!slices.Equal(inspection.Host.SecurityOpt, []string{"no-new-privileges"}) ||
		inspection.Host.Memory != contract.Limits.RuntimeMemoryBytes ||
		inspection.Host.MemorySwap != contract.Limits.RuntimeMemoryBytes ||
		inspection.Host.PIDsLimit != contract.Limits.RuntimePIDs || inspection.Config.User != expectedUser ||
		inspection.Config.Image != reference || !slices.Equal(inspection.Config.Entrypoint, []string{"/usr/bin/pdfinfo"}) ||
		!slices.Equal(inspection.Config.Env, image.Config.Config.Env) ||
		!equalStringMap(inspection.Config.Labels, image.Config.Config.Labels) ||
		!equalStringMap(inspection.Host.Tmpfs, map[string]string{
			"/tmp": strings.TrimPrefix(dockerTmpfsValue("/tmp", contract.Limits.RuntimeTemporaryBytes), "/tmp:"),
		}) || len(inspection.NetworkSettings.Networks) != 1 {
		return errors.New("Docker did not retain the exact PDF-tools runtime containment")
	}
	if _, exists := inspection.NetworkSettings.Networks[contract.Runtime.Network]; !exists {
		return errors.New("Docker did not attach only the disabled PDF-tools network")
	}
	return nil
}

func inspectRuntimeContainment(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	image inspectedFinalImage,
	reference string,
) (_ RuntimeContainment, uid, gid int, returnError error) {
	name, err := reproductionName("runtime-inspect")
	if err != nil {
		return RuntimeContainment{}, 0, 0, err
	}
	if err := requireOwnedContainerNameAvailable(executor, authority, name); err != nil {
		return RuntimeContainment{}, 0, 0, err
	}
	defer func() {
		returnError = errors.Join(returnError, removeRuntimeContainer(executor, authority, name))
	}()
	arguments := append([]string{"container", "create", "--pull", "never", "--name", name}, runtimeContainmentArguments(authority.contract)...)
	arguments = append(arguments, "--entrypoint", "/usr/bin/pdfinfo", reference, "-v")
	if _, err := executor.run(ctx, dockerRequest{
		operation: "create contained PDF-tools inspection container",
		directory: authority.root,
		timeout:   time.Duration(authority.contract.Limits.RuntimeSeconds) * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: arguments,
	}); err != nil {
		return RuntimeContainment{}, 0, 0, err
	}
	result, err := executor.run(ctx, dockerRequest{
		operation: "inspect contained PDF-tools runtime",
		directory: authority.root,
		timeout:   time.Duration(authority.contract.Limits.RuntimeSeconds) * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"container", "inspect", "--format", "{{json .}}", name},
	})
	if err != nil {
		return RuntimeContainment{}, 0, 0, err
	}
	inspection, err := decodeDockerJSON[dockerContainerInspection](result.stdout, "PDF-tools containment")
	if err != nil {
		return RuntimeContainment{}, 0, 0, err
	}
	if err := validateRuntimeContainmentInspection(inspection, authority, image, reference); err != nil {
		return RuntimeContainment{}, 0, 0, err
	}
	contract := authority.contract
	return RuntimeContainment{
		Network: contract.Runtime.Network, ReadOnlyRoot: true, Capabilities: contract.Runtime.Capabilities,
		NoNewPrivileges: true, MemoryBytes: contract.Limits.RuntimeMemoryBytes,
		PIDs: contract.Limits.RuntimePIDs, TemporaryBytes: contract.Limits.RuntimeTemporaryBytes,
	}, contract.Runtime.UID, contract.Runtime.GID, nil
}

func runVersionProbe(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	tag string,
	tool Tool,
) (returnError error) {
	name, err := reproductionName("runtime-" + tool.Name)
	if err != nil {
		return err
	}
	if err := requireOwnedContainerNameAvailable(executor, authority, name); err != nil {
		return err
	}
	arguments := append([]string{"run", "--rm", "--pull", "never", "--name", name}, runtimeContainmentArguments(authority.contract)...)
	arguments = append(arguments, "--entrypoint", "/usr/bin/"+tool.Name, tag, "-v")
	defer func() {
		returnError = errors.Join(returnError, removeRuntimeContainer(executor, authority, name))
	}()
	result, err := executor.run(ctx, dockerRequest{
		operation: "run contained " + tool.Name + " version probe",
		directory: authority.root,
		timeout:   time.Duration(authority.contract.Limits.RuntimeSeconds) * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: arguments,
	})
	if err != nil {
		return err
	}
	if tool.VersionStream != "stderr" || len(result.stdout) != 0 {
		return fmt.Errorf("%s wrote its version to an unexpected stream", tool.Name)
	}
	lines := strings.Split(strings.TrimSuffix(string(result.stderr), "\n"), "\n")
	if len(lines) < 1 || lines[0] != tool.Name+" version "+tool.Version {
		return fmt.Errorf("%s did not report exact version %s", tool.Name, tool.Version)
	}
	return nil
}

func runtimeContainmentArguments(contract Contract) []string {
	return []string{
		"--platform", contract.Platform,
		"--network", contract.Runtime.Network,
		"--read-only",
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--memory", decimalInt64(contract.Limits.RuntimeMemoryBytes),
		"--memory-swap", decimalInt64(contract.Limits.RuntimeMemoryBytes),
		"--pids-limit", strconv.Itoa(contract.Limits.RuntimePIDs),
		"--tmpfs", dockerTmpfsValue("/tmp", contract.Limits.RuntimeTemporaryBytes),
		"--user", strconv.Itoa(contract.Runtime.UID) + ":" + strconv.Itoa(contract.Runtime.GID),
	}
}

func decodeDockerJSON[T any](body []byte, label string) (T, error) {
	var value T
	if _, err := decodeArtifactJSON[map[string]json.RawMessage](body, 32, label); err != nil {
		return value, err
	}
	if err := json.Unmarshal(body, &value); err != nil {
		return value, fmt.Errorf("decode %s: %w", label, err)
	}
	return value, nil
}

func removeRuntimeContainer(executor dockerExecutor, authority checkedAuthority, name string) error {
	present, err := runtimeContainerPresent(executor, authority, name)
	if err != nil || !present {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, removeError := executor.run(ctx, dockerRequest{
		operation: "remove PDF-tools runtime inspection container",
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"container", "rm", "--force", name},
	})
	present, inspectionError := runtimeContainerPresent(executor, authority, name)
	if inspectionError != nil {
		return errors.Join(removeError, inspectionError)
	}
	if present {
		return errors.Join(removeError, errors.New("owned PDF-tools container remains after cleanup"))
	}
	return nil
}

func requireOwnedContainerNameAvailable(executor dockerExecutor, authority checkedAuthority, name string) error {
	present, err := runtimeContainerPresent(executor, authority, name)
	if err != nil {
		return err
	}
	if present {
		return errors.New("generated PDF-tools container name is already in use")
	}
	return nil
}

func runtimeContainerPresent(executor dockerExecutor, authority checkedAuthority, name string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	result, err := executor.run(ctx, dockerRequest{
		operation: "inventory local Docker containers",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"container", "ls", "--all", "--format", "{{.Names}}"},
	})
	if err != nil {
		return false, err
	}
	if len(result.stderr) != 0 {
		return false, errors.New("local Docker container inventory wrote unexpected stderr")
	}
	lines := strings.Split(strings.TrimSpace(string(result.stdout)), "\n")
	if len(lines) > 4096 {
		return false, errors.New("local Docker container inventory exceeds its count boundary")
	}
	for _, line := range lines {
		if line == name {
			return true, nil
		}
	}
	return false, nil
}

func removeRuntimeImage(executor dockerExecutor, authority checkedAuthority, reference, operation string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, err := executor.run(ctx, dockerRequest{
		operation: operation,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"image", "rm", reference},
	})
	return err
}

func removeRuntimeAliasIfPresent(executor dockerExecutor, authority checkedAuthority, alias string) error {
	_, present, err := runtimeAliasIdentity(executor, authority, alias)
	if err != nil || !present {
		return err
	}
	removeError := removeRuntimeImage(executor, authority, alias, "remove owned PDF-tools runtime alias")
	_, present, inspectionError := runtimeAliasIdentity(executor, authority, alias)
	if removeError != nil || inspectionError != nil {
		return errors.Join(removeError, inspectionError)
	}
	if present {
		return errors.New("owned PDF-tools runtime alias remains after cleanup")
	}
	return nil
}

func requireRuntimeAliasAvailable(executor dockerExecutor, authority checkedAuthority, alias string) error {
	_, present, err := runtimeAliasIdentity(executor, authority, alias)
	if err != nil {
		return err
	}
	if present {
		return errors.New("generated PDF-tools runtime alias is already in use")
	}
	return nil
}

func runtimeAliasIdentity(
	executor dockerExecutor,
	authority checkedAuthority,
	alias string,
) (string, bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	result, err := executor.run(ctx, dockerRequest{
		operation: "inspect owned PDF-tools runtime alias",
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"image", "ls", "--all", "--no-trunc", "--quiet", "--filter", "reference=" + alias},
	})
	if err != nil {
		return "", false, err
	}
	identity := strings.TrimSpace(string(result.stdout))
	if identity == "" {
		return "", false, nil
	}
	if strings.Contains(identity, "\n") || !digestPattern.MatchString(identity) {
		return "", false, errors.New("owned PDF-tools runtime alias resolves ambiguously")
	}
	return identity, true, nil
}
