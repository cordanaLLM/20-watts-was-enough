package workstationrunner

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	pathpkg "path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	workstationAggregateCommand     = "go -C tooling run ./cmd/20w ci run-workstation --root .."
	maximumWorkstationTreeEntries   = 4096
	maximumWorkstationTreeDepth     = 16
	maximumWorkstationManifestFiles = 32
	maximumWorkstationManifestBytes = 1 << 20
)

var workstationTestPathPattern = regexp.MustCompile(
	`^experiments/workstation/[A-Za-z0-9_./*-]+\.test\.mjs$`,
)

type packageDocument struct {
	Scripts map[string]string `json:"scripts"`
}

type workstationManifestDocument struct {
	Artifact       string `json:"artifact"`
	Implementation struct {
		FullTests []string `json:"full_tests"`
	} `json:"implementation"`
}

type manifestFullTest struct {
	artifact string
	path     string
}

type admittedWorkstationCommand struct {
	arguments []string
	patterns  []string
}

func freezeWorkstationInventory(root string, jobs []job) ([]job, error) {
	manifest, err := loadPackageDocument(root)
	if err != nil {
		return nil, err
	}
	if manifest.Scripts["test:workstation"] != workstationAggregateCommand {
		return nil, errors.New("package.json test:workstation does not invoke the bounded Go runner")
	}
	frozenJobs := make([]job, len(jobs))
	patterns := make([]string, 0, len(jobs)*2)
	patternsByArtifact := make(map[string][]string)
	for index, current := range jobs {
		command, parseErr := parseWorkstationCommand(manifest.Scripts[current.script])
		if parseErr != nil {
			return nil, fmt.Errorf("package.json script %s: %w", current.script, parseErr)
		}
		frozenJobs[index] = job{
			artifact:  current.artifact,
			script:    current.script,
			arguments: append([]string(nil), command.arguments...),
		}
		patterns = append(patterns, command.patterns...)
		artifact := workstationManifestArtifact(current.artifact)
		if artifact != "core" {
			patternsByArtifact[artifact] = append(patternsByArtifact[artifact], command.patterns...)
		}
	}
	discovered, err := discoverWorkstationTests(root)
	if err != nil {
		return nil, err
	}
	if err := validateExactTestCoverage(patterns, discovered); err != nil {
		return nil, err
	}
	fullTests, err := loadManifestFullTests(root, jobs)
	if err != nil {
		return nil, err
	}
	discoveredSet := make(map[string]struct{}, len(discovered))
	for _, testPath := range discovered {
		discoveredSet[testPath] = struct{}{}
	}
	for _, declared := range fullTests {
		if _, present := discoveredSet[declared.path]; !present {
			return nil, fmt.Errorf("manifest full_tests path is not a discovered workstation test: %s", declared.path)
		}
		coverage := 0
		for _, pattern := range patternsByArtifact[declared.artifact] {
			if workstationPatternCovers(pattern, declared.path) {
				coverage++
			}
		}
		if coverage != 1 {
			return nil, fmt.Errorf(
				"manifest %s full_tests path %s is scheduled %d times by its catalogue jobs, want exactly once",
				declared.artifact,
				declared.path,
				coverage,
			)
		}
	}
	return frozenJobs, nil
}

func loadPackageDocument(root string) (packageDocument, error) {
	body, err := readStableBoundedFile(
		filepath.Join(root, "package.json"),
		maximumPackageManifestBytes,
	)
	if err != nil {
		return packageDocument{}, fmt.Errorf("read package.json: %w", err)
	}
	if err := strictjson.Validate(body, 32); err != nil {
		return packageDocument{}, fmt.Errorf("validate unambiguous package.json: %w", err)
	}
	var manifest packageDocument
	if err := json.Unmarshal(body, &manifest); err != nil {
		return packageDocument{}, fmt.Errorf("decode package.json: %w", err)
	}
	if manifest.Scripts == nil {
		return packageDocument{}, errors.New("package.json has no scripts object")
	}
	return manifest, nil
}

func parseWorkstationCommand(command string) (admittedWorkstationCommand, error) {
	fields := strings.Fields(command)
	if len(fields) < 4 || fields[0] != "node" || fields[1] != "--test" ||
		fields[2] != "--experimental-test-isolation=none" {
		return admittedWorkstationCommand{}, errors.New("command must start with the closed Node test invocation")
	}
	index := 3
	if fields[index] == "--test-concurrency=1" {
		index++
	}
	if index == len(fields) {
		return admittedWorkstationCommand{}, errors.New("command has no test paths")
	}
	patterns := append([]string(nil), fields[index:]...)
	for _, pattern := range patterns {
		if !workstationTestPathPattern.MatchString(pattern) || strings.Contains(pattern, "\\") ||
			pathpkg.Clean(pattern) != pattern || strings.Contains(pattern, "..") {
			return admittedWorkstationCommand{}, fmt.Errorf("command contains an invalid test path %q", pattern)
		}
		if strings.Contains(pattern, "*") &&
			(strings.Count(pattern, "*") != 1 || !strings.HasSuffix(pattern, "/*.test.mjs")) {
			return admittedWorkstationCommand{}, fmt.Errorf("command contains an invalid test glob %q", pattern)
		}
	}
	return admittedWorkstationCommand{
		arguments: append([]string(nil), fields[1:]...),
		patterns:  patterns,
	}, nil
}

func discoverWorkstationTests(root string) ([]string, error) {
	directory := filepath.Join(root, "experiments", "workstation")
	if err := requireRealPath(directory, true); err != nil {
		return nil, fmt.Errorf("inspect workstation test root: %w", err)
	}
	tests := make([]string, 0)
	visited := 0
	err := filepath.WalkDir(directory, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		visited++
		if visited > maximumWorkstationTreeEntries {
			return fmt.Errorf("workstation tree exceeds %d entries", maximumWorkstationTreeEntries)
		}
		relativeToTree, err := filepath.Rel(directory, current)
		if err != nil {
			return err
		}
		if relativeToTree != "." && len(strings.Split(filepath.ToSlash(relativeToTree), "/")) > maximumWorkstationTreeDepth {
			return fmt.Errorf("workstation tree exceeds %d levels", maximumWorkstationTreeDepth)
		}
		information, err := entry.Info()
		if err != nil {
			return err
		}
		if information.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("workstation tree contains a symbolic link: %s", filepath.ToSlash(relativeToTree))
		}
		if !information.IsDir() && !information.Mode().IsRegular() {
			return fmt.Errorf("workstation tree contains a special file: %s", filepath.ToSlash(relativeToTree))
		}
		if information.Mode().IsRegular() && strings.HasSuffix(entry.Name(), ".test.mjs") {
			relative, err := filepath.Rel(root, current)
			if err != nil {
				return err
			}
			tests = append(tests, filepath.ToSlash(relative))
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("discover workstation tests: %w", err)
	}
	if len(tests) == 0 {
		return nil, errors.New("workstation tree contains no tests")
	}
	sort.Strings(tests)
	return tests, nil
}

func validateExactTestCoverage(patterns, discovered []string) error {
	for _, pattern := range patterns {
		matched := false
		for _, testPath := range discovered {
			if workstationPatternCovers(pattern, testPath) {
				matched = true
				break
			}
		}
		if !matched {
			return fmt.Errorf("workstation test pattern matches no discovered test: %s", pattern)
		}
	}
	for _, testPath := range discovered {
		coverage := 0
		for _, pattern := range patterns {
			if workstationPatternCovers(pattern, testPath) {
				coverage++
			}
		}
		if coverage != 1 {
			return fmt.Errorf("workstation test %s is scheduled %d times, want exactly once", testPath, coverage)
		}
	}
	return nil
}

func workstationPatternCovers(pattern, testPath string) bool {
	if pattern == testPath {
		return true
	}
	if !strings.HasSuffix(pattern, "/*.test.mjs") {
		return false
	}
	directory := strings.TrimSuffix(pattern, "*.test.mjs")
	relative := strings.TrimPrefix(testPath, directory)
	return strings.HasPrefix(testPath, directory) && strings.HasSuffix(relative, ".test.mjs") &&
		!strings.Contains(relative, "/")
}

func loadManifestFullTests(root string, jobs []job) ([]manifestFullTest, error) {
	directory := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := requireRealPath(directory, true); err != nil {
		return nil, fmt.Errorf("inspect workstation manifest root: %w", err)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, fmt.Errorf("read workstation manifest root: %w", err)
	}
	if len(entries) == 0 || len(entries) > maximumWorkstationManifestFiles {
		return nil, fmt.Errorf(
			"workstation manifest root contains %d entries, limit is 1..%d",
			len(entries), maximumWorkstationManifestFiles,
		)
	}
	expected := make(map[string]struct{})
	for _, current := range jobs {
		artifact := workstationManifestArtifact(current.artifact)
		if artifact != "core" {
			expected[artifact] = struct{}{}
		}
	}
	seenManifests := make(map[string]struct{}, len(entries))
	seenTests := make(map[string]struct{})
	fullTests := make([]manifestFullTest, 0)
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() || !strings.HasSuffix(entry.Name(), ".json") {
			return nil, fmt.Errorf("workstation manifest root contains an unsupported entry: %s", entry.Name())
		}
		artifact := strings.TrimSuffix(entry.Name(), ".json")
		if _, known := expected[artifact]; !known {
			return nil, fmt.Errorf("workstation manifest has no catalogue job: %s", artifact)
		}
		body, err := readStableBoundedFile(filepath.Join(directory, entry.Name()), maximumWorkstationManifestBytes)
		if err != nil {
			return nil, fmt.Errorf("read workstation manifest %s: %w", artifact, err)
		}
		if err := strictjson.Validate(body, 64); err != nil {
			return nil, fmt.Errorf("validate unambiguous workstation manifest %s: %w", artifact, err)
		}
		var document workstationManifestDocument
		if err := json.Unmarshal(body, &document); err != nil {
			return nil, fmt.Errorf("decode workstation manifest %s: %w", artifact, err)
		}
		if document.Artifact != artifact || len(document.Implementation.FullTests) == 0 {
			return nil, fmt.Errorf("workstation manifest %s has an invalid artifact or empty full_tests", artifact)
		}
		seenManifests[artifact] = struct{}{}
		for _, testPath := range document.Implementation.FullTests {
			if !workstationTestPathPattern.MatchString(testPath) || strings.Contains(testPath, "*") ||
				strings.Contains(testPath, "\\") || pathpkg.Clean(testPath) != testPath || strings.Contains(testPath, "..") {
				return nil, fmt.Errorf("workstation manifest %s has an invalid full_tests path %q", artifact, testPath)
			}
			if _, duplicate := seenTests[testPath]; duplicate {
				return nil, fmt.Errorf("workstation manifests repeat full_tests path: %s", testPath)
			}
			seenTests[testPath] = struct{}{}
			fullTests = append(fullTests, manifestFullTest{artifact: artifact, path: testPath})
		}
	}
	for artifact := range expected {
		if _, present := seenManifests[artifact]; !present {
			return nil, fmt.Errorf("workstation catalogue artifact has no manifest: %s", artifact)
		}
	}
	sort.Slice(fullTests, func(left, right int) bool {
		return fullTests[left].artifact < fullTests[right].artifact ||
			(fullTests[left].artifact == fullTests[right].artifact && fullTests[left].path < fullTests[right].path)
	})
	return fullTests, nil
}

func workstationManifestArtifact(artifact string) string {
	if marker := strings.Index(artifact, "-shard-"); marker >= 0 {
		return artifact[:marker]
	}
	return artifact
}

func requireRealPath(path string, directory bool) error {
	clean := filepath.Clean(path)
	resolved, err := filepath.EvalSymlinks(clean)
	if err != nil || !sameCanonicalPath(resolved, clean) {
		return errors.New("path must not contain symbolic links")
	}
	information, err := os.Lstat(clean)
	if err != nil {
		return err
	}
	if information.Mode()&os.ModeSymlink != 0 || (directory && !information.IsDir()) ||
		(!directory && !information.Mode().IsRegular()) {
		return errors.New("path has the wrong file type")
	}
	return nil
}

func readStableBoundedFile(path string, maximumBytes int64) ([]byte, error) {
	if maximumBytes < 1 {
		return nil, errors.New("file-size bound must be positive")
	}
	if err := requireRealPath(path, false); err != nil {
		return nil, err
	}
	before, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if before.Size() <= 0 || before.Size() > maximumBytes {
		return nil, fmt.Errorf("file size is outside 1..%d bytes", maximumBytes)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(before, opened) {
		return nil, errors.New("file changed before it was opened")
	}
	body, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil || int64(len(body)) > maximumBytes {
		return nil, fmt.Errorf("read bounded file of at most %d bytes", maximumBytes)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	confirmation, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil || !bytes.Equal(body, confirmation) {
		return nil, errors.New("file changed while it was read")
	}
	after, err := os.Lstat(path)
	if err != nil || !after.Mode().IsRegular() || !os.SameFile(opened, after) ||
		after.Size() != opened.Size() || !after.ModTime().Equal(opened.ModTime()) {
		return nil, errors.New("file changed while it was read")
	}
	return body, nil
}
