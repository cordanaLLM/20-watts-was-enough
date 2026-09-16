package clrsfixture

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrenderlock"
)

const (
	trackedSourcePath                  = "tooling/clrs-generator/upstream.json"
	trackedGenerationPath              = "tooling/clrs-generator/contract.json"
	trackedLockInputPath               = "tooling/clrs-generator/lock-input.json"
	trackedImageContractPath           = "tooling/clrs-generator/image-contract.json"
	trackedGeneratorProjectPath        = "tooling/clrs-generator/pyproject.toml"
	trackedGeneratorDependencyLockPath = "tooling/clrs-generator/uv.lock"
	trackedGeneratorWheelhousePath     = "tooling/clrs-generator/wheelhouse.json"
	maximumGeneratorWheelLicenseBytes  = 4 << 10
)

// CheckGeneratorImageFoundation validates the complete committed foundation
// without invoking the network, Python, a resolver or a container runtime.
func CheckGeneratorImageFoundation(repositoryRoot string) (GeneratorImageFoundation, error) {
	root, err := cleanGeneratorRoot(repositoryRoot)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	sourceBody, err := readGeneratorFile(root, trackedSourcePath, maximumSourceRecordBytes)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	source, err := ParseSourceRecord(sourceBody)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	generationBody, err := readGeneratorFile(root, trackedGenerationPath, maximumGenerationContractBytes)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	generation, err := ParseGenerationContract(generationBody, source)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	lockBody, err := readGeneratorFile(root, trackedLockInputPath, maximumGeneratorLockInputBytes)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	lockInput, err := ParseGeneratorLockInput(lockBody, source)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	imageBody, err := readGeneratorFile(root, trackedImageContractPath, maximumGeneratorImageContractBytes)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	imageContract, err := ParseGeneratorImageContract(imageBody, lockBody, source, generation)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	if err := checkGeneratorBuilderAuthority(root, imageContract.Builder); err != nil {
		return GeneratorImageFoundation{}, err
	}
	projectBody, err := readGeneratorFile(root, imageContract.DependencyLock.ProjectPath, maximumGeneratorProjectBytes)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	dependencyLockBody, err := readGeneratorFile(
		root,
		imageContract.DependencyLock.Path,
		maximumGeneratorDependencyLockBytes,
	)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	if err := validateGeneratorDependencyFiles(
		imageContract.DependencyLock,
		projectBody,
		dependencyLockBody,
		lockInput,
		imageContract.Limits,
	); err != nil {
		return GeneratorImageFoundation{}, err
	}
	wheelhouseBody, err := readGeneratorFile(
		root,
		imageContract.BuildContext.WheelhouseManifestPath,
		imageContract.Limits.WheelhouseManifestBytes,
	)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	if rawSHA256(wheelhouseBody) != imageContract.BuildContext.WheelhouseManifestSHA256 {
		return GeneratorImageFoundation{}, errors.New("CLRS generator wheelhouse manifest digest is invalid")
	}
	wheelhouseManifest, err := ParseGeneratorWheelhouseManifest(
		wheelhouseBody,
		dependencyLockBody,
		lockInput,
		imageContract,
	)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	promiseProvenance := wheelhouseManifest.SourceBuild.Provenance
	promiseLicenseBody, err := readGeneratorFile(
		root,
		promiseProvenance.RepositoryLicensePath,
		maximumGeneratorWheelLicenseBytes,
	)
	if err != nil {
		return GeneratorImageFoundation{}, err
	}
	if rawSHA256(promiseLicenseBody) != promiseProvenance.LicenseSHA256 ||
		int64(len(promiseLicenseBody)) != promiseProvenance.LicenseSizeBytes {
		return GeneratorImageFoundation{}, errors.New("CLRS generator promise licence identity is invalid")
	}
	if err := requireMissingGeneratorFile(root, imageContract.BuildContext.DockerfilePath); err != nil {
		return GeneratorImageFoundation{}, err
	}
	sourceID, _ := source.Identity()
	generationID, _ := generation.Identity(source)
	return GeneratorImageFoundation{
		Authority:            ResultAuthority,
		State:                imageContract.State,
		SourceID:             sourceID,
		GenerationContract:   generationID,
		LockInputSHA256:      rawSHA256(lockBody),
		DependencyLockSHA256: rawSHA256(dependencyLockBody),
		WheelhouseSHA256:     rawSHA256(wheelhouseBody),
		ImageContractSHA256:  rawSHA256(imageBody),
	}, nil
}

func decodeCanonicalGeneratorJSON[T any](body []byte, depth int, destination *T) error {
	if err := decodeStrict(body, depth, destination); err != nil {
		return err
	}
	var canonical bytes.Buffer
	encoder := json.NewEncoder(&canonical)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(destination); err != nil {
		return fmt.Errorf("encode canonical CLRS generator JSON: %w", err)
	}
	if !bytes.Equal(body, canonical.Bytes()) {
		return errors.New("CLRS generator JSON is not canonical")
	}
	return nil
}

func cleanGeneratorRoot(value string) (string, error) {
	if value == "" {
		return "", errors.New("repository root is required")
	}
	root, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve repository root: %w", err)
	}
	root = filepath.Clean(root)
	information, err := inspectGeneratorRootPath(root)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", errors.New("repository root path must not contain symlinks")
	}
	resolved = filepath.Clean(resolved)
	resolvedInformation, err := os.Lstat(resolved)
	if err != nil || !resolvedInformation.IsDir() || resolvedInformation.Mode()&os.ModeSymlink != 0 ||
		!os.SameFile(information, resolvedInformation) {
		return "", errors.New("repository root path changed while it was resolved")
	}
	return resolved, nil
}

func inspectGeneratorRootPath(root string) (os.FileInfo, error) {
	current := root
	var rootInformation os.FileInfo
	for {
		information, err := os.Lstat(current)
		if err != nil || !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New("repository root path must contain only real directories")
		}
		if current == root {
			rootInformation = information
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return rootInformation, nil
}

func readGeneratorFile(root, relative string, maximumBytes int64) ([]byte, error) {
	return readGeneratorFileWithInterlock(root, relative, maximumBytes, nil)
}

func readGeneratorFileWithInterlock(root, relative string, maximumBytes int64, afterRead func() error) ([]byte, error) {
	if !validGeneratorRelativePath(relative) {
		return nil, fmt.Errorf("CLRS generator path %q is not repository-relative", relative)
	}
	absolute := filepath.Join(root, filepath.FromSlash(relative))
	if err := rejectGeneratorSymlink(root, absolute); err != nil {
		return nil, err
	}
	before, err := os.Lstat(absolute)
	if err != nil || !before.Mode().IsRegular() || before.Size() <= 0 || before.Size() > maximumBytes {
		return nil, fmt.Errorf("CLRS generator file %s must be regular and between 1 and %d bytes", relative, maximumBytes)
	}
	file, err := os.Open(absolute)
	if err != nil {
		return nil, fmt.Errorf("open CLRS generator file %s: %w", relative, err)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !unchangedGeneratorFile(before, opened) {
		return nil, fmt.Errorf("CLRS generator file %s changed before it was opened", relative)
	}
	body, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read CLRS generator file %s: %w", relative, err)
	}
	if int64(len(body)) > maximumBytes {
		return nil, fmt.Errorf("CLRS generator file %s exceeds the %d-byte limit", relative, maximumBytes)
	}
	if afterRead != nil {
		if err := afterRead(); err != nil {
			return nil, fmt.Errorf("run CLRS generator stable-read interlock: %w", err)
		}
	}
	readState, err := file.Stat()
	if err != nil || !unchangedGeneratorFile(opened, readState) {
		return nil, fmt.Errorf("CLRS generator file %s changed while it was read", relative)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind CLRS generator file %s: %w", relative, err)
	}
	confirmation, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("confirm CLRS generator file %s: %w", relative, err)
	}
	confirmedState, err := file.Stat()
	if err != nil || int64(len(confirmation)) > maximumBytes || !bytes.Equal(body, confirmation) ||
		!unchangedGeneratorFile(readState, confirmedState) {
		return nil, fmt.Errorf("CLRS generator file %s changed while it was read", relative)
	}
	if err := rejectGeneratorSymlink(root, absolute); err != nil {
		return nil, err
	}
	namedState, err := os.Lstat(absolute)
	if err != nil || namedState.Mode()&os.ModeSymlink != 0 || !unchangedGeneratorFile(confirmedState, namedState) {
		return nil, fmt.Errorf("CLRS generator file %s changed while it was read", relative)
	}
	if err := rejectGeneratorSymlink(root, absolute); err != nil {
		return nil, err
	}
	if int64(len(body)) != confirmedState.Size() || len(body) == 0 {
		return nil, fmt.Errorf("CLRS generator file %s changed while it was read", relative)
	}
	return body, nil
}

func rejectGeneratorSymlink(root, target string) error {
	return inspectGeneratorPath(root, target, false)
}

func inspectGeneratorPath(root, target string, allowMissing bool) error {
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errors.New("CLRS generator file escapes the repository root")
	}
	rootInformation, err := os.Lstat(root)
	if err != nil || !rootInformation.IsDir() || rootInformation.Mode()&os.ModeSymlink != 0 {
		return errors.New("CLRS generator repository root must remain a real directory")
	}
	current := root
	components := strings.Split(relative, string(filepath.Separator))
	for index, component := range components {
		current = filepath.Join(current, component)
		information, inspectErr := os.Lstat(current)
		if inspectErr != nil {
			if allowMissing && errors.Is(inspectErr, os.ErrNotExist) {
				return nil
			}
			return fmt.Errorf("inspect CLRS generator path: %w", inspectErr)
		}
		if information.Mode()&os.ModeSymlink != 0 {
			return errors.New("CLRS generator path contains a symlink")
		}
		if index < len(components)-1 && !information.IsDir() {
			return errors.New("CLRS generator path ancestor must be a real directory")
		}
	}
	return nil
}

func requireMissingGeneratorFile(root, relative string) error {
	if !validGeneratorRelativePath(relative) {
		return fmt.Errorf("missing CLRS generator path %q is not repository-relative", relative)
	}
	absolute := filepath.Join(root, filepath.FromSlash(relative))
	if err := inspectGeneratorPath(root, absolute, true); err != nil {
		return err
	}
	_, err := os.Lstat(absolute)
	if err == nil {
		return fmt.Errorf("CLRS generator file %s exists while its state is missing", relative)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect missing CLRS generator file %s: %w", relative, err)
	}
	return inspectGeneratorPath(root, absolute, true)
}

func unchangedGeneratorFile(before, after os.FileInfo) bool {
	return before.Mode().IsRegular() && after.Mode().IsRegular() && os.SameFile(before, after) &&
		before.Mode() == after.Mode() && before.Size() == after.Size() && before.ModTime().Equal(after.ModTime())
}

func checkGeneratorBuilderAuthority(root string, builder GeneratorBuilder) error {
	lockBody, err := readGeneratorFile(root, pdfrenderlock.RelativePath, pdfrenderlock.MaximumBytes)
	if err != nil {
		return fmt.Errorf("validate generator BuildKit authority: %w", err)
	}
	locked, err := pdfrenderlock.Parse(lockBody)
	if err != nil {
		return fmt.Errorf("validate generator BuildKit authority: %w", err)
	}
	if builder.BuildxVersion != locked.Builder.BuildxVersion || builder.BuildxRevision != locked.Builder.BuildxRevision ||
		builder.BuildKitVersion != locked.Builder.BuildKitVersion || builder.BuildKitImage != locked.Builder.BuildKitImage ||
		builder.RewriteTimestamp != locked.Exporter.RewriteTimestamp ||
		builder.CompatibilityVersion != locked.Exporter.CompatibilityVersion {
		return errors.New("generator builder does not match the shared BuildKit authority")
	}
	subset, err := json.Marshal(struct {
		Builder  pdfrenderlock.Builder  `json:"builder"`
		Exporter pdfrenderlock.Exporter `json:"exporter"`
	}{Builder: locked.Builder, Exporter: locked.Exporter})
	if err != nil {
		return fmt.Errorf("encode generator BuildKit authority: %w", err)
	}
	if builder.AuthoritySubsetSHA256 != rawSHA256(subset) {
		return errors.New("generator BuildKit authority subset digest is stale")
	}
	return nil
}

func validGeneratorRelativePath(value string) bool {
	if value == "" || filepath.IsAbs(value) || strings.Contains(value, "\\") {
		return false
	}
	cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(value)))
	return cleaned == value && value != "." && !strings.HasPrefix(value, "../")
}

func rawSHA256(body []byte) string {
	digest := sha256.Sum256(body)
	return hex.EncodeToString(digest[:])
}
