package pdftools

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

const reproductionBuildCount = 2

const buildKitContainerPrefix = "buildx_buildkit_"

type baseBuild struct {
	Sequence  int
	Archive   string
	Layout    string
	Image     imageIdentity
	SPDX      spdxIdentity
	SPDXIndex spdxIdentity
}

type finalBuild struct {
	Sequence int
	Archive  string
	Image    inspectedFinalImage
}

type reproductionBuilder struct {
	Name      string
	Node      string
	Container string
	Volume    string
}

type apkoBuilderIdentity struct {
	Version   string
	Revision  string
	GoVersion string
	TreeState string
	BuildDate string
}

type apkoVersionOutput struct {
	GitVersion   string `json:"gitVersion"`
	GitCommit    string `json:"gitCommit"`
	GitTreeState string `json:"gitTreeState"`
	BuildDate    string `json:"buildDate"`
	GoVersion    string `json:"goVersion"`
	Compiler     string `json:"compiler"`
	Platform     string `json:"platform"`
}

type buildKitContainerInspection struct {
	Name  string `json:"Name"`
	State struct {
		Running bool `json:"Running"`
	} `json:"State"`
	Host struct {
		NetworkMode string `json:"NetworkMode"`
		Restart     struct {
			Name string `json:"Name"`
		} `json:"RestartPolicy"`
		Privileged      bool                       `json:"Privileged"`
		PublishAllPorts bool                       `json:"PublishAllPorts"`
		PortBindings    map[string]json.RawMessage `json:"PortBindings"`
		Memory          int64                      `json:"Memory"`
		MemorySwap      int64                      `json:"MemorySwap"`
		PIDsLimit       *int64                     `json:"PidsLimit"`
		CPUPeriod       int64                      `json:"CpuPeriod"`
		CPUQuota        int64                      `json:"CpuQuota"`
	} `json:"HostConfig"`
	Config struct {
		Image      string   `json:"Image"`
		Entrypoint []string `json:"Entrypoint"`
		Command    []string `json:"Cmd"`
	} `json:"Config"`
	NetworkSettings struct {
		Networks map[string]json.RawMessage `json:"Networks"`
	} `json:"NetworkSettings"`
	Mounts []struct {
		Type        string `json:"Type"`
		Name        string `json:"Name"`
		Destination string `json:"Destination"`
		ReadWrite   bool   `json:"RW"`
	} `json:"Mounts"`
}

func inspectApkoBuilderIdentity(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
) (_ apkoBuilderIdentity, returnError error) {
	containerName, err := reproductionName("apko-version")
	if err != nil {
		return apkoBuilderIdentity{}, err
	}
	if err := requireOwnedContainerNameAvailable(executor, authority, containerName); err != nil {
		return apkoBuilderIdentity{}, err
	}
	defer func() {
		returnError = errors.Join(returnError, removeRuntimeContainer(executor, authority, containerName))
	}()
	result, err := executor.run(ctx, apkoVersionRequest(authority, containerName))
	if err != nil {
		return apkoBuilderIdentity{}, err
	}
	if len(result.stderr) != 0 {
		return apkoBuilderIdentity{}, errors.New("pinned apko version probe wrote unexpected stderr")
	}
	return parseApkoBuilderIdentity(result.stdout, authority.contract.Builder, authority.contract.Platform)
}

func apkoVersionRequest(authority checkedAuthority, containerName string) dockerRequest {
	contract := authority.contract
	return dockerRequest{
		operation: "observe pinned apko builder identity",
		directory: authority.root,
		timeout:   time.Duration(contract.Limits.RuntimeSeconds) * time.Second,
		output:    contract.Limits.CapturedOutputBytes,
		arguments: []string{
			"run", "--rm", "--pull", "missing",
			"--name", containerName,
			"--platform", contract.Platform,
			"--read-only",
			"--network", "none",
			"--cap-drop", "ALL",
			"--security-opt", "no-new-privileges",
			"--memory", decimalInt64(contract.Limits.RuntimeMemoryBytes),
			"--memory-swap", decimalInt64(contract.Limits.RuntimeMemoryBytes),
			"--pids-limit", strconv.Itoa(contract.Limits.RuntimePIDs),
			"--ulimit", "core=0:0",
			"--ulimit", "nofile=256:256",
			"--tmpfs", dockerTmpfsValue("/tmp", contract.Limits.RuntimeTemporaryBytes),
			"--env", "HOME=/tmp",
			"--env", "LANG=C.UTF-8",
			"--env", "LC_ALL=C.UTF-8",
			"--env", "TZ=UTC",
			contract.Builder.Image,
			"version", "--json",
		},
	}
}

func parseApkoBuilderIdentity(body []byte, expected Builder, platform string) (apkoBuilderIdentity, error) {
	value, err := decodeArtifactJSON[apkoVersionOutput](body, 4, "apko version")
	if err != nil {
		return apkoBuilderIdentity{}, err
	}
	buildDate, err := time.Parse(time.RFC3339, value.BuildDate)
	if err != nil || buildDate.UTC().Format(time.RFC3339) != value.BuildDate {
		return apkoBuilderIdentity{}, errors.New("apko build date is not canonical UTC RFC 3339")
	}
	if value.GitVersion != "v"+expected.Version || value.GitCommit != expected.Revision ||
		value.GoVersion != "go"+expected.GoVersion || value.Compiler != "gc" || value.Platform != platform ||
		(value.GitTreeState != "clean" && value.GitTreeState != "dirty") {
		return apkoBuilderIdentity{}, errors.New("observed apko builder identity differs from contract.json")
	}
	return apkoBuilderIdentity{
		Version: expected.Version, Revision: value.GitCommit, GoVersion: expected.GoVersion,
		TreeState: value.GitTreeState, BuildDate: value.BuildDate,
	}, nil
}

func runApkoBuild(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	temporaryRoot string,
	sequence int,
) (baseBuild, error) {
	root := filepath.Join(temporaryRoot, fmt.Sprintf("base-%d", sequence))
	sbomRoot := filepath.Join(root, "sbom")
	layoutRoot := filepath.Join(temporaryRoot, fmt.Sprintf("base-%d-oci", sequence))
	for _, directory := range []string{root, sbomRoot} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			return baseBuild{}, fmt.Errorf("create apko build staging directory: %w", err)
		}
		// The private 0700 temporaryRoot contains this bind mount. Its mounted
		// directories need write and search permission for the capability-free
		// container root, including daemons that remap container identities.
		if err := os.Chmod(directory, 0o733); err != nil { //#nosec G302 -- bind mount directory permissions for capability-free container execution
			return baseBuild{}, fmt.Errorf("prepare apko output directory permissions: %w", err)
		}
	}
	containerName, err := reproductionName("apko")
	if err != nil {
		return baseBuild{}, err
	}
	if err := requireOwnedContainerNameAvailable(executor, authority, containerName); err != nil {
		return baseBuild{}, err
	}
	request, err := apkoBuildRequest(authority, root, containerName)
	if err != nil {
		return baseBuild{}, err
	}
	if _, err := executor.run(ctx, request); err != nil {
		return baseBuild{}, errors.Join(err, removeRuntimeContainer(executor, authority, containerName))
	}
	if err := removeRuntimeContainer(executor, authority, containerName); err != nil {
		return baseBuild{}, err
	}
	for _, directory := range []string{root, sbomRoot} {
		if err := os.Chmod(directory, 0o700); err != nil { //#nosec G302 -- directory restore to private 0700 after container run
			return baseBuild{}, fmt.Errorf("close apko output directory permissions: %w", err)
		}
	}
	if err := validateApkoOutputInventory(root); err != nil {
		return baseBuild{}, err
	}
	archivePath := filepath.Join(root, "base.tar")
	image, err := projectBaseArchive(ctx, archivePath, layoutRoot, authority)
	if err != nil {
		return baseBuild{}, err
	}
	spdxBody, err := readTemporaryFile(filepath.Join(sbomRoot, "sbom-x86_64.spdx.json"), authority.contract.Limits.SPDXBytes, "apko platform SPDX")
	if err != nil {
		return baseBuild{}, err
	}
	spdx, err := canonicalizeSPDX(
		spdxBody,
		authority.contract.Limits.SPDXBytes,
		authority.contract.Limits.SPDXPackages,
		authority.contract.Limits.SPDXRelationships,
	)
	if err != nil {
		return baseBuild{}, fmt.Errorf("canonicalize apko platform SPDX: %w", err)
	}
	if err := validatePlatformSPDXIdentity(spdx, authority.contract.BaseImage); err != nil {
		return baseBuild{}, err
	}
	indexBody, err := readTemporaryFile(filepath.Join(sbomRoot, "sbom-index.spdx.json"), authority.contract.Limits.SPDXBytes, "apko index SPDX")
	if err != nil {
		return baseBuild{}, err
	}
	indexSPDX, err := canonicalizeSPDX(
		indexBody,
		authority.contract.Limits.SPDXBytes,
		authority.contract.Limits.SPDXPackages,
		authority.contract.Limits.SPDXRelationships,
	)
	if err != nil {
		return baseBuild{}, fmt.Errorf("canonicalize apko index SPDX: %w", err)
	}
	if indexSPDX.Packages != 2 || indexSPDX.Relationships != 1 ||
		indexSPDX.CanonicalSHA256 != authority.contract.BaseImage.SPDXIndexCanonicalSHA256 ||
		indexSPDX.CanonicalSize != authority.contract.BaseImage.SPDXIndexCanonicalSize {
		return baseBuild{}, errors.New("apko index SPDX differs from the committed canonical graph")
	}
	return baseBuild{
		Sequence: sequence, Archive: archivePath, Layout: layoutRoot, Image: image, SPDX: spdx, SPDXIndex: indexSPDX,
	}, nil
}

func apkoBuildRequest(authority checkedAuthority, outputRoot, containerName string) (dockerRequest, error) {
	contract := authority.contract
	source := filepath.Join(authority.root, "tooling", "pdf-tools")
	if err := validDockerMountSources(source, outputRoot); err != nil {
		return dockerRequest{}, err
	}
	created := time.Unix(contract.SourceDateEpoch, 0).UTC().Format(time.RFC3339)
	arguments := []string{
		"run", "--rm", "--pull", "missing",
		"--name", containerName,
		"--platform", contract.Platform,
		"--read-only",
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--memory", decimalInt64(contract.Limits.ApkoMemoryBytes),
		"--memory-swap", decimalInt64(contract.Limits.ApkoMemoryBytes),
		"--pids-limit", strconv.Itoa(contract.Limits.ApkoPIDs),
		"--ulimit", "core=0:0",
		"--ulimit", "nofile=1024:1024",
		"--tmpfs", dockerTmpfsValue("/tmp", contract.Limits.ApkoTemporaryBytes),
		"--env", "HOME=/tmp",
		"--env", "LANG=C.UTF-8",
		"--env", "LC_ALL=C.UTF-8",
		"--env", "SOURCE_DATE_EPOCH=" + decimalInt64(contract.SourceDateEpoch),
		"--env", "TZ=UTC",
		"--mount", boundedexec.DockerBind(source, "/work", true),
		"--mount", boundedexec.DockerBind(outputRoot, "/output", false),
		contract.Builder.Image,
		"-C", "/work", "build",
		"--arch", "amd64",
		"--build-date", created,
		"--lockfile", contract.Apko.Lock,
		"--max-apk-control-size", decimalInt64(contract.Limits.APKControlBytes),
		"--max-apk-data-size", decimalInt64(contract.Limits.APKDataBytes),
		"--max-apkindex-decompressed-size", decimalInt64(contract.Limits.APKIndexBytes),
		"--max-http-response-size", decimalInt64(contract.Limits.HTTPResponseBytes),
		"--sbom-formats", "spdx",
		"--sbom-path", "/output/sbom",
		contract.Apko.Config,
		contract.Apko.OutputTag,
		"/output/base.tar",
	}
	return dockerRequest{
		operation: "build locked PDF-tools apko base",
		directory: authority.root,
		timeout:   time.Duration(contract.Limits.BuildSeconds) * time.Second,
		output:    contract.Limits.CapturedOutputBytes,
		arguments: arguments,
		files: []boundedDockerFile{{
			path: filepath.Join(outputRoot, "base.tar"), maximum: contract.Limits.BaseArchiveBytes,
			label: "apko Docker archive",
		}},
		directories: []boundedDockerDirectory{{
			path: outputRoot, maximum: contract.Limits.BaseArchiveBytes + 2*contract.Limits.SPDXBytes,
			maximumEntries: 8, maximumDepth: 2, label: "apko output inventory",
		}},
	}, nil
}

func validateApkoOutputInventory(root string) error {
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 2 {
		return errors.New("apko output must contain only base.tar and its SPDX directory")
	}
	wanted := map[string]bool{"base.tar": false, "sbom": false}
	for _, entry := range entries {
		if _, expected := wanted[entry.Name()]; !expected || entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("apko output contains unexpected path %q", entry.Name())
		}
		information, err := fileidentity.Info(entry)
		if err != nil || (entry.Name() == "base.tar" && !information.Mode().IsRegular()) ||
			(entry.Name() == "sbom" && !information.IsDir()) {
			return fmt.Errorf("apko output path %q has an invalid type", entry.Name())
		}
		wanted[entry.Name()] = true
	}
	sbomEntries, err := os.ReadDir(filepath.Join(root, "sbom"))
	if err != nil || len(sbomEntries) != 2 {
		return errors.New("apko SPDX output must contain exactly index and linux-amd64 documents")
	}
	for _, entry := range sbomEntries {
		information, informationError := fileidentity.Info(entry)
		if informationError != nil || !information.Mode().IsRegular() || entry.Type()&os.ModeSymlink != 0 ||
			(entry.Name() != "sbom-index.spdx.json" && entry.Name() != "sbom-x86_64.spdx.json") {
			return fmt.Errorf("apko SPDX output contains unexpected path %q", entry.Name())
		}
	}
	return nil
}

func validatePlatformSPDXIdentity(identity spdxIdentity, base BaseImage) error {
	if identity.RawSize != base.SPDXSize || identity.CanonicalSHA256 != base.SPDXCanonicalSHA256 ||
		identity.CanonicalSize != base.SPDXCanonicalSize || identity.Packages != base.SPDXPackages ||
		identity.Relationships != base.SPDXRelationships {
		return errors.New("apko platform SPDX differs from the committed canonical graph")
	}
	return nil
}

func runFinalBuild(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	base baseBuild,
	contextRoot, temporaryRoot string,
	sequence int,
) (_ finalBuild, returnError error) {
	builder, err := createReproductionBuilder(ctx, executor, authority, sequence)
	if err != nil {
		return finalBuild{}, err
	}
	builderActive := true
	defer func() {
		if builderActive {
			returnError = errors.Join(returnError, removeReproductionBuilder(executor, authority, builder))
		}
	}()
	buildRoot := filepath.Join(temporaryRoot, fmt.Sprintf("final-%d", sequence))
	if err := os.MkdirAll(buildRoot, 0o700); err != nil {
		return finalBuild{}, fmt.Errorf("create final image build root: %w", err)
	}
	archivePath := filepath.Join(buildRoot, "final.tar")
	metadataPath := filepath.Join(buildRoot, "metadata.json")
	request := finalBuildRequest(authority, base, contextRoot, builder.Name, archivePath, metadataPath, sequence)
	result, err := executor.run(ctx, request)
	if err != nil {
		return finalBuild{}, err
	}
	if err := rejectBuildKitTimestampWarnings(result); err != nil {
		return finalBuild{}, err
	}
	if err := removeReproductionBuilder(executor, authority, builder); err != nil {
		return finalBuild{}, err
	}
	builderActive = false
	if err := ensureAuthorityUnchanged(authority); err != nil {
		return finalBuild{}, err
	}
	layout := filepath.Join(buildRoot, "inspection")
	image, err := inspectFinalArchive(ctx, archivePath, layout, authority.contract)
	if err != nil {
		return finalBuild{}, err
	}
	if err := validateFinalBuildMetadata(metadataPath, image.Identity, authority.contract.Limits.CapturedOutputBytes); err != nil {
		return finalBuild{}, err
	}
	return finalBuild{Sequence: sequence, Archive: archivePath, Image: image}, nil
}

func createReproductionBuilder(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	sequence int,
) (reproductionBuilder, error) {
	name, err := reproductionName(fmt.Sprintf("builder-%d", sequence))
	if err != nil {
		return reproductionBuilder{}, err
	}
	node := name + "-node"
	builder := reproductionBuilder{
		Name: name, Node: node,
		Container: buildKitContainerPrefix + node,
		Volume:    buildKitContainerPrefix + node + "_state",
	}
	present, err := reproductionBuilderPresent(executor, name, authority.contract.Limits.CapturedOutputBytes)
	if err != nil {
		return reproductionBuilder{}, err
	}
	if present {
		return reproductionBuilder{}, errors.New("generated PDF-tools BuildKit builder name is already in use")
	}
	if err := requireOwnedContainerNameAvailable(executor, authority, builder.Container); err != nil {
		return reproductionBuilder{}, err
	}
	volumePresent, err := reproductionVolumePresent(executor, authority, builder.Volume)
	if err != nil {
		return reproductionBuilder{}, err
	}
	if volumePresent {
		return reproductionBuilder{}, errors.New("generated PDF-tools BuildKit volume name is already in use")
	}
	limits := authority.contract.Limits
	_, err = executor.run(ctx, reproductionBuilderCreateRequest(authority, builder))
	if err != nil {
		return reproductionBuilder{}, errors.Join(err, removeReproductionBuilder(executor, authority, builder))
	}
	if _, err := executor.run(ctx, dockerRequest{
		operation: "apply PDF-tools BuildKit PID boundary",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"container", "update", "--pids-limit", strconv.Itoa(limits.BuildKitPIDs), builder.Container},
	}); err != nil {
		return reproductionBuilder{}, errors.Join(err, removeReproductionBuilder(executor, authority, builder))
	}
	if err := validateReproductionBuilder(ctx, executor, authority, builder); err != nil {
		return reproductionBuilder{}, errors.Join(err, removeReproductionBuilder(executor, authority, builder))
	}
	return builder, nil
}

func reproductionBuilderCreateRequest(authority checkedAuthority, builder reproductionBuilder) dockerRequest {
	lock := authority.renderer.Lock
	limits := authority.contract.Limits
	return dockerRequest{
		operation: "create fresh pinned PDF-tools BuildKit builder",
		directory: authority.root,
		timeout:   time.Duration(authority.contract.Limits.BuildSeconds) * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{
			"buildx", "create",
			"--name", builder.Name,
			"--node", builder.Node,
			"--driver", "docker-container",
			"--driver-opt", "image=" + lock.Builder.BuildKitImage,
			"--driver-opt", "memory=" + decimalInt64(limits.BuildKitMemoryBytes),
			"--driver-opt", "memory-swap=" + decimalInt64(limits.BuildKitMemoryBytes),
			"--driver-opt", "cpu-period=" + decimalInt64(limits.BuildKitCPUPeriod),
			"--driver-opt", "cpu-quota=" + decimalInt64(limits.BuildKitCPUQuota),
			"--driver-opt", "network=none",
			"--driver-opt", "restart-policy=no",
			"--driver-opt", "default-load=false",
			"--driver-opt", "provenance-add-gha=false",
			"--buildkitd-flags", strings.Join(expectedBuildKitDaemonFlags(authority.contract), " "),
			"--platform", authority.contract.Platform,
			"--bootstrap",
		},
	}
}

func finalBuildRequest(
	authority checkedAuthority,
	base baseBuild,
	contextRoot, builderName, archivePath, metadataPath string,
	sequence int,
) dockerRequest {
	contract := authority.contract
	return dockerRequest{
		operation: fmt.Sprintf("build PDF-tools final image %d", sequence),
		directory: authority.root,
		timeout:   time.Duration(contract.Limits.BuildSeconds) * time.Second,
		output:    contract.Limits.CapturedOutputBytes,
		arguments: []string{
			"buildx", "build",
			"--builder", builderName,
			"--output", "type=oci,dest=" + archivePath + ",rewrite-timestamp=true",
			"--platform", contract.Platform,
			"--network", "none",
			"--resource", "memory=" + decimalInt64(contract.Limits.BuildKitMemoryBytes),
			"--resource", "memory-swap=" + decimalInt64(contract.Limits.BuildKitMemoryBytes),
			"--resource", "cpu-period=" + decimalInt64(contract.Limits.BuildKitCPUPeriod),
			"--resource", "cpu-quota=" + decimalInt64(contract.Limits.BuildKitCPUQuota),
			"--no-cache",
			"--provenance=false",
			"--sbom=false",
			"--metadata-file", metadataPath,
			"--progress", "plain",
			"--build-arg", "SOURCE_DATE_EPOCH=" + decimalInt64(contract.SourceDateEpoch),
			"--build-context", "pdf_tools_base=oci-layout://" + base.Layout + "@" + base.Image.ManifestDigest,
			"--file", filepath.Join(contextRoot, "Dockerfile"),
			contextRoot,
		},
		files: []boundedDockerFile{{
			path: archivePath, maximum: contract.Limits.FinalArchiveBytes, label: "final OCI archive",
		}},
		directories: []boundedDockerDirectory{{
			path: filepath.Dir(archivePath), maximum: contract.Limits.FinalArchiveBytes + contract.Limits.CapturedOutputBytes,
			maximumEntries: 4, maximumDepth: 1, label: "Buildx final-image output inventory",
		}},
	}
}

func expectedBuildKitDaemonFlags(contract Contract) []string {
	keepStorageMegabytes := 4 * contract.Limits.FinalArchiveBytes / (1024 * 1024)
	return []string{
		// Pinned Buildx stops its entitlement scan at the first unrelated
		// buildkitd flag. Keep the sole admitted entitlement first so Buildx
		// does not append a duplicate default permission.
		"--allow-insecure-entitlement=network.host",
		"--cdi-disabled",
		"--containerd-worker=false",
		"--oci-max-parallelism=1",
		"--oci-worker-gc=true",
		"--oci-worker-gc-keepstorage=" + decimalInt64(keepStorageMegabytes),
		"--proxy-network",
	}
}

func validateReproductionBuilder(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	builder reproductionBuilder,
) error {
	result, err := executor.run(ctx, dockerRequest{
		operation: "inspect bounded PDF-tools BuildKit daemon",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"container", "inspect", "--format", "{{json .}}", builder.Container},
	})
	if err != nil {
		return err
	}
	inspection, err := decodeDockerJSON[buildKitContainerInspection](result.stdout, "PDF-tools BuildKit daemon")
	if err != nil {
		return err
	}
	limits := authority.contract.Limits
	mismatches := make([]string, 0, 20)
	require := func(condition bool, field string) {
		if !condition {
			mismatches = append(mismatches, field)
		}
	}
	require(inspection.Name == "/"+builder.Container, "name")
	require(inspection.State.Running, "running state")
	require(inspection.Config.Image == authority.renderer.Lock.Builder.BuildKitImage, "image")
	require(slices.Equal(inspection.Config.Entrypoint, []string{"/usr/bin/buildkitd-entrypoint"}), "entrypoint")
	require(slices.Equal(inspection.Config.Command, expectedBuildKitDaemonFlags(authority.contract)), "daemon flags")
	require(inspection.Host.NetworkMode == "none", "daemon network")
	require(inspection.Host.Privileged, "privileged mode")
	require(inspection.Host.Restart.Name == "no", "restart policy")
	require(!inspection.Host.PublishAllPorts && len(inspection.Host.PortBindings) == 0, "published ports")
	require(inspection.Host.Memory == limits.BuildKitMemoryBytes, "memory")
	require(inspection.Host.MemorySwap == limits.BuildKitMemoryBytes, "memory swap")
	require(inspection.Host.PIDsLimit != nil && *inspection.Host.PIDsLimit == int64(limits.BuildKitPIDs), "PID limit")
	require(inspection.Host.CPUPeriod == limits.BuildKitCPUPeriod, "CPU period")
	require(inspection.Host.CPUQuota == limits.BuildKitCPUQuota, "CPU quota")
	require(len(inspection.NetworkSettings.Networks) == 1, "network attachment count")
	_, disabledNetwork := inspection.NetworkSettings.Networks["none"]
	require(disabledNetwork, "disabled network attachment")
	require(len(inspection.Mounts) == 1, "mount count")
	if len(inspection.Mounts) == 1 {
		require(inspection.Mounts[0].Type == "volume", "state mount type")
		require(inspection.Mounts[0].Name == builder.Volume, "state volume")
		require(inspection.Mounts[0].Destination == "/var/lib/buildkit", "state mount destination")
		require(inspection.Mounts[0].ReadWrite, "state mount access")
	}
	if len(mismatches) != 0 {
		return fmt.Errorf("Docker did not retain the exact PDF-tools BuildKit daemon boundary: %s", strings.Join(mismatches, ", "))
	}
	version, err := executor.run(ctx, dockerRequest{
		operation: "verify pinned PDF-tools BuildKit daemon version",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"container", "exec", builder.Container, "/usr/bin/buildkitd", "--version"},
	})
	if err != nil {
		return err
	}
	fields := strings.Fields(string(version.stdout))
	if len(version.stderr) != 0 || len(fields) != 4 || fields[0] != "buildkitd" ||
		fields[1] != "github.com/moby/buildkit" || strings.TrimPrefix(fields[2], "v") != authority.renderer.Lock.Builder.BuildKitVersion ||
		!revisionPattern.MatchString(fields[3]) {
		return errors.New("running BuildKit daemon differs from the pinned PDF renderer authority")
	}
	return nil
}

func validateFinalBuildMetadata(path string, identity imageIdentity, maximum int64) error {
	body, err := readTemporaryFile(path, maximum, "PDF-tools Buildx metadata")
	if err != nil {
		return err
	}
	var values map[string]json.RawMessage
	if _, err := decodeArtifactJSON[map[string]json.RawMessage](body, 32, "PDF-tools Buildx metadata"); err != nil {
		return err
	}
	if err := json.Unmarshal(body, &values); err != nil {
		return fmt.Errorf("decode PDF-tools Buildx metadata: %w", err)
	}
	for name, wanted := range map[string]string{
		"containerimage.digest":        identity.ManifestDigest,
		"containerimage.config.digest": identity.ConfigDigest,
	} {
		var value string
		if body, exists := values[name]; !exists || json.Unmarshal(body, &value) != nil || value != wanted {
			return fmt.Errorf("PDF-tools Buildx metadata %s does not match the inspected archive", name)
		}
	}
	return nil
}

func verifyBuildxIdentity(ctx context.Context, executor dockerExecutor, authority checkedAuthority) error {
	result, err := executor.run(ctx, dockerRequest{
		operation: "verify locked Docker Buildx client",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"buildx", "version"},
	})
	if err != nil {
		return err
	}
	fields := strings.Fields(string(result.stdout))
	builder := authority.renderer.Lock.Builder
	if len(fields) != 3 || fields[0] != "github.com/docker/buildx" ||
		strings.TrimPrefix(fields[1], "v") != builder.BuildxVersion || fields[2] != builder.BuildxRevision {
		return errors.New("Docker Buildx client differs from the PDF renderer authority")
	}
	return nil
}

func ensureAuthorityUnchanged(authority checkedAuthority) error {
	current, err := checkAuthority(authority.root)
	if err != nil || current.contractSHA256 != authority.contractSHA256 ||
		current.renderer.LockSHA256 != authority.renderer.LockSHA256 ||
		authority.rootInformation == nil || current.rootInformation == nil ||
		!os.SameFile(authority.rootInformation, current.rootInformation) {
		return errors.New("PDF-tools or BuildKit authority changed during local reproduction")
	}
	return nil
}

func rejectBuildKitTimestampWarnings(result dockerResult) error {
	output := string(append(bytes.Clone(result.stdout), result.stderr...))
	if strings.Contains(output, "rewrite-timestamp is specified, but no source-date-epoch was found") ||
		(strings.Contains(output, "failed to rewrite layer ") && strings.Contains(output, " to match source-date-epoch ")) {
		return errors.New("BuildKit did not apply the required PDF-tools timestamp rewrite")
	}
	return nil
}

func removeReproductionBuilder(
	executor dockerExecutor,
	authority checkedAuthority,
	builder reproductionBuilder,
) error {
	output := authority.contract.Limits.CapturedOutputBytes
	present, inventoryError := reproductionBuilderPresent(executor, builder.Name, output)
	var removeError error
	if inventoryError == nil && present {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		_, removeError = executor.run(ctx, dockerRequest{
			operation: "remove pinned PDF-tools BuildKit builder",
			directory: authority.root,
			timeout:   60 * time.Second,
			output:    output,
			arguments: []string{"buildx", "rm", "--force", builder.Name},
		})
		cancel()
	}
	containerError := removeRuntimeContainer(executor, authority, builder.Container)
	volumeError := removeReproductionVolume(executor, authority, builder.Volume)
	present, finalBuilderError := reproductionBuilderPresent(executor, builder.Name, output)
	containerPresent, finalContainerError := runtimeContainerPresent(executor, authority, builder.Container)
	volumePresent, finalVolumeError := reproductionVolumePresent(executor, authority, builder.Volume)
	if present || containerPresent || volumePresent {
		return errors.Join(
			inventoryError, removeError, containerError, volumeError,
			finalBuilderError, finalContainerError, finalVolumeError,
			errors.New("owned PDF-tools BuildKit builder resources remain after cleanup"),
		)
	}
	return errors.Join(inventoryError, finalBuilderError, finalContainerError, finalVolumeError)
}

func reproductionBuilderPresent(executor dockerExecutor, name string, output int64) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	result, err := executor.run(ctx, dockerRequest{
		operation: "inventory local Docker Buildx builders",
		timeout:   30 * time.Second,
		output:    output,
		arguments: []string{"buildx", "ls", "--format", "{{.Name}}"},
	})
	if err != nil {
		return false, err
	}
	if len(result.stderr) != 0 {
		return false, errors.New("Docker Buildx builder inventory wrote unexpected stderr")
	}
	lines := strings.Split(strings.TrimSpace(string(result.stdout)), "\n")
	if len(lines) > 4096 {
		return false, errors.New("Docker Buildx builder inventory exceeds its count boundary")
	}
	for _, line := range lines {
		if line == name {
			return true, nil
		}
	}
	return false, nil
}

func reproductionVolumePresent(
	executor dockerExecutor,
	authority checkedAuthority,
	name string,
) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	result, err := executor.run(ctx, dockerRequest{
		operation: "inventory local Docker volumes",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"volume", "ls", "--format", "{{.Name}}"},
	})
	if err != nil {
		return false, err
	}
	if len(result.stderr) != 0 {
		return false, errors.New("local Docker volume inventory wrote unexpected stderr")
	}
	lines := strings.Split(strings.TrimSpace(string(result.stdout)), "\n")
	if len(lines) > 4096 {
		return false, errors.New("local Docker volume inventory exceeds its count boundary")
	}
	for _, line := range lines {
		if line == name {
			return true, nil
		}
	}
	return false, nil
}

func removeReproductionVolume(executor dockerExecutor, authority checkedAuthority, name string) error {
	present, err := reproductionVolumePresent(executor, authority, name)
	if err != nil || !present {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	_, removeError := executor.run(ctx, dockerRequest{
		operation: "remove owned PDF-tools BuildKit state volume",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"volume", "rm", name},
	})
	cancel()
	present, inspectionError := reproductionVolumePresent(executor, authority, name)
	if inspectionError != nil {
		return errors.Join(removeError, inspectionError)
	}
	if present {
		return errors.Join(removeError, errors.New("owned PDF-tools BuildKit state volume remains after cleanup"))
	}
	return nil
}

func reproductionName(role string) (string, error) {
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("create PDF-tools local reproduction identity: %w", err)
	}
	return fmt.Sprintf("pdf20w-%s-%d-%s", role, os.Getpid(), hex.EncodeToString(random)), nil
}

func validDockerMountSources(values ...string) error {
	for _, value := range values {
		if value == "" || strings.ContainsAny(value, ",\r\n\x00") {
			return errors.New("PDF-tools Docker mount source contains an unsupported character")
		}
	}
	return nil
}

func dockerTmpfsValue(destination string, size int64) string {
	return destination + ":rw,noexec,nosuid,nodev,size=" + decimalInt64(size) + ",mode=1777"
}

func decimalInt64(value int64) string { return strconv.FormatInt(value, 10) }
