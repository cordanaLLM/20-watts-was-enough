package translationbundle

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	importedMarkdownName = "candidate-not-for-publication.md"
	importedReceiptName  = "candidate-receipt.json"
)

// ExportOptions selects one canonical source and a new candidate bundle file.
type ExportOptions struct {
	RepositoryRoot string
	SourcePath     string
	TargetLanguage string
	OutputPath     string
}

// ImportOptions selects one returned bundle and a new non-authoritative directory.
type ImportOptions struct {
	RepositoryRoot         string
	InputPath              string
	ExpectedSourcePath     string
	ExpectedTargetLanguage string
	OutputDirectory        string
}

// ValidateOptions selects one returned bundle and its expected canonical identity.
type ValidateOptions struct {
	RepositoryRoot         string
	InputPath              string
	ExpectedSourcePath     string
	ExpectedTargetLanguage string
}

// ValidationResult reports the checked identities without granting publication authority.
type ValidationResult struct {
	BundleSHA256       string
	SourcePath         string
	SourceSHA256       string
	TargetLanguage     string
	TargetSHA256       string
	UnresolvedGlossary int
	DraftingMode       string
	ReviewStatus       string
}

type validatedCandidate struct {
	root   string
	bundle Bundle
	body   []byte
}

// ImportResult reports exact candidate artifact identities.
type ImportResult struct {
	MarkdownPath       string
	ReceiptPath        string
	TargetSHA256       string
	UnresolvedGlossary int
}

// ExportCandidate writes a deterministic source-bound JSON exchange object.
func ExportCandidate(options ExportOptions) (Bundle, error) {
	root, err := resolveRepositoryRoot(options.RepositoryRoot)
	if err != nil {
		return Bundle{}, err
	}
	languages, err := loadOfficialTargetLanguages(root)
	if err != nil {
		return Bundle{}, err
	}
	if !sourcePathPattern.MatchString(options.SourcePath) {
		return Bundle{}, errors.New("translation source must be canonical concept/math Markdown")
	}
	if err := requireOfficialTargetLanguage(languages, options.TargetLanguage); err != nil {
		return Bundle{}, err
	}
	sourcePath := filepath.Join(root, filepath.FromSlash(options.SourcePath))
	source, err := readStableRegularFile(sourcePath, maximumDocumentBytes)
	if err != nil {
		return Bundle{}, fmt.Errorf("read canonical translation source %s: %w", options.SourcePath, err)
	}
	bundle := newBundle(options.SourcePath, options.TargetLanguage, source)
	if err := validateBundle(bundle, false); err != nil {
		return Bundle{}, fmt.Errorf("validate exported candidate bundle: %w", err)
	}
	body, err := strictjson.Canonical(bundle)
	if err != nil {
		return Bundle{}, fmt.Errorf("encode candidate bundle: %w", err)
	}
	output, err := safeCandidateOutput(root, options.OutputPath)
	if err != nil {
		return Bundle{}, err
	}
	if err := writeNewFile(output, body); err != nil {
		return Bundle{}, fmt.Errorf("write candidate bundle: %w", err)
	}
	return bundle, nil
}

// ValidateCandidate checks a returned bundle against current canonical source without
// writing candidate artifacts or changing translation publication authority.
func ValidateCandidate(options ValidateOptions) (ValidationResult, error) {
	candidate, err := validateReturnedCandidate(options)
	if err != nil {
		return ValidationResult{}, err
	}
	return ValidationResult{
		BundleSHA256:       digest(candidate.body),
		SourcePath:         candidate.bundle.Source.Path,
		SourceSHA256:       candidate.bundle.Source.SHA256,
		TargetLanguage:     candidate.bundle.Target.Language,
		TargetSHA256:       digest([]byte(candidate.bundle.Target.Markdown)),
		UnresolvedGlossary: countUnresolvedGlossary(candidate.bundle.Glossary),
		DraftingMode:       candidate.bundle.Drafting.Mode,
		ReviewStatus:       candidate.bundle.Review.Status,
	}, nil
}

// ImportCandidate validates a returned bundle against current canonical source and
// writes only candidate-marked artifacts. It never edits translations/ or its manifest.
func ImportCandidate(options ImportOptions) (ImportResult, error) {
	validation := ValidateOptions{
		RepositoryRoot:         options.RepositoryRoot,
		InputPath:              options.InputPath,
		ExpectedSourcePath:     options.ExpectedSourcePath,
		ExpectedTargetLanguage: options.ExpectedTargetLanguage,
	}
	candidate, err := validateReturnedCandidate(validation)
	if err != nil {
		return ImportResult{}, err
	}
	receipt, unresolved := candidateReceipt(candidate.bundle, candidate.body)
	receiptBody, err := strictjson.Canonical(receipt)
	if err != nil {
		return ImportResult{}, fmt.Errorf("encode candidate receipt: %w", err)
	}
	output, err := safeCandidateOutput(candidate.root, options.OutputDirectory)
	if err != nil {
		return ImportResult{}, err
	}
	markdownPath, receiptPath, err := writeCandidateDirectory(output, []byte(candidate.bundle.Target.Markdown), receiptBody)
	if err != nil {
		return ImportResult{}, err
	}
	return ImportResult{
		MarkdownPath:       markdownPath,
		ReceiptPath:        receiptPath,
		TargetSHA256:       receipt.Target.SHA256,
		UnresolvedGlossary: unresolved,
	}, nil
}

func validateReturnedCandidate(options ValidateOptions) (validatedCandidate, error) {
	root, err := resolveRepositoryRoot(options.RepositoryRoot)
	if err != nil {
		return validatedCandidate{}, err
	}
	languages, err := loadOfficialTargetLanguages(root)
	if err != nil {
		return validatedCandidate{}, err
	}
	if !sourcePathPattern.MatchString(options.ExpectedSourcePath) {
		return validatedCandidate{}, errors.New("expected translation source must be canonical concept/math Markdown")
	}
	if err := requireOfficialTargetLanguage(languages, options.ExpectedTargetLanguage); err != nil {
		return validatedCandidate{}, err
	}
	body, err := readStableRegularFile(options.InputPath, maximumBundleBytes)
	if err != nil {
		return validatedCandidate{}, fmt.Errorf("read returned candidate bundle: %w", err)
	}
	bundle, err := decodeBundle(body)
	if err != nil {
		return validatedCandidate{}, err
	}
	if err := validateBundle(bundle, true); err != nil {
		return validatedCandidate{}, fmt.Errorf("validate returned candidate bundle: %w", err)
	}
	if err := requireOfficialTargetLanguage(languages, bundle.Target.Language); err != nil {
		return validatedCandidate{}, err
	}
	if bundle.Source.Path != options.ExpectedSourcePath || bundle.Target.Language != options.ExpectedTargetLanguage {
		return validatedCandidate{}, errors.New("returned candidate does not match the expected source path and target language")
	}
	if err := bindCurrentSource(root, bundle.Source); err != nil {
		return validatedCandidate{}, err
	}
	return validatedCandidate{root: root, bundle: bundle, body: body}, nil
}

func bindCurrentSource(root string, source Source) error {
	path := filepath.Join(root, filepath.FromSlash(source.Path))
	current, err := readStableRegularFile(path, maximumDocumentBytes)
	if err != nil {
		return fmt.Errorf("read current canonical source %s: %w", source.Path, err)
	}
	if !bytes.Equal(current, []byte(source.Markdown)) || digest(current) != source.SHA256 {
		return fmt.Errorf("candidate source is stale or altered: %s", source.Path)
	}
	return nil
}

func candidateReceipt(bundle Bundle, body []byte) (Receipt, int) {
	unresolved := countUnresolvedGlossary(bundle.Glossary)
	return Receipt{
		Schema:       1,
		Authority:    candidateAuthorityLabel,
		BundleSHA256: digest(body),
		Source: SourceBinding{
			Language: bundle.Source.Language,
			Path:     bundle.Source.Path,
			SHA256:   bundle.Source.SHA256,
		},
		Target: TargetBinding{
			Language: bundle.Target.Language,
			SHA256:   digest([]byte(bundle.Target.Markdown)),
		},
		Glossary: append([]GlossaryEntry(nil), bundle.Glossary...),
		Drafting: bundle.Drafting,
		Review:   bundle.Review,
	}, unresolved
}

func countUnresolvedGlossary(entries []GlossaryEntry) int {
	unresolved := 0
	for _, entry := range entries {
		if entry.Status == "unresolved" {
			unresolved++
		}
	}
	return unresolved
}

func resolveRepositoryRoot(root string) (string, error) {
	if root == "" {
		return "", errors.New("repository root is required")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve repository root: %w", err)
	}
	absolute = filepath.Clean(absolute)
	information, err := fileidentity.Lstat(absolute)
	if err != nil || !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("repository root must be a real directory")
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil || filepath.Clean(resolved) != absolute {
		return "", errors.New("repository root path must not contain symlinks")
	}
	return absolute, nil
}

func safeCandidateOutput(root, output string) (string, error) {
	if output == "" {
		return "", errors.New("candidate output path is required")
	}
	absolute, err := filepath.Abs(output)
	if err != nil {
		return "", fmt.Errorf("resolve candidate output path: %w", err)
	}
	absolute = filepath.Clean(absolute)
	if inside(root, absolute) {
		cache := filepath.Join(root, ".workingdir", "cache", "translation-candidates")
		if absolute == cache || !inside(cache, absolute) {
			return "", errors.New("candidate output inside the repository must remain under .workingdir/cache/translation-candidates")
		}
	}
	return absolute, nil
}

func inside(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	return err == nil && relative != "." && relative != "" && relative != ".." &&
		!filepath.IsAbs(relative) && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func readStableRegularFile(path string, maximumBytes int64) ([]byte, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	absolute = filepath.Clean(absolute)
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil || filepath.Clean(resolved) != absolute {
		return nil, errors.New("file path must not contain symlinks")
	}
	before, err := fileidentity.Lstat(absolute)
	if err != nil || !before.Mode().IsRegular() {
		return nil, errors.New("file must be a regular file")
	}
	if before.Size() > maximumBytes {
		return nil, fmt.Errorf("file exceeds the %d-byte limit", maximumBytes)
	}
	file, err := os.Open(absolute)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return readStableOpenedFile(file, absolute, before, maximumBytes)
}

func readStableOpenedFile(file *os.File, path string, before os.FileInfo, maximumBytes int64) ([]byte, error) {
	opened, err := file.Stat()
	if err != nil || !sameRegularFile(before, opened) {
		return nil, errors.New("file changed before it was opened")
	}
	body, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read bounded file: %w", err)
	}
	if int64(len(body)) > maximumBytes {
		return nil, fmt.Errorf("file exceeds the %d-byte limit", maximumBytes)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind file: %w", err)
	}
	confirmation, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil || !bytes.Equal(body, confirmation) {
		return nil, errors.New("file changed while it was read")
	}
	after, err := fileidentity.Lstat(path)
	if err != nil || !sameRegularFile(opened, after) {
		return nil, errors.New("file changed while it was read")
	}
	return body, nil
}

func sameRegularFile(left, right os.FileInfo) bool {
	return left != nil && right != nil && left.Mode().IsRegular() && right.Mode().IsRegular() &&
		os.SameFile(left, right) && left.Mode() == right.Mode() && left.Size() == right.Size() &&
		left.ModTime().Equal(right.ModTime())
}

func writeNewFile(path string, body []byte) error {
	if err := prepareRealParent(filepath.Dir(path)); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600) //#nosec G304 -- path within translation directory prepared with non-symlink parent
	if err != nil {
		return err
	}
	ok := false
	defer func() {
		if !ok {
			_ = os.Remove(path)
		}
	}()
	if _, err := file.Write(body); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	ok = true
	return nil
}

func prepareRealParent(parent string) error {
	parent = filepath.Clean(parent)
	ancestor, missing, err := nearestRealAncestor(parent)
	if err != nil {
		return err
	}
	current := ancestor
	for index := len(missing) - 1; index >= 0; index-- {
		current = filepath.Join(current, missing[index])
		if err := os.Mkdir(current, 0o755); err != nil && !os.IsExist(err) { //#nosec G301 -- translation bundle repository directory must be readable by build and test tooling
			return err
		}
		if err := requireRealDirectory(current); err != nil {
			return err
		}
	}
	return requireRealDirectory(parent)
}

func nearestRealAncestor(path string) (string, []string, error) {
	missing := make([]string, 0, 8)
	current := path
	for {
		information, err := fileidentity.Lstat(current)
		if err == nil {
			if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
				return "", nil, errors.New("candidate output parent path must not contain links or non-directories")
			}
			if err := requireRealDirectory(current); err != nil {
				return "", nil, err
			}
			return current, missing, nil
		}
		if !os.IsNotExist(err) {
			return "", nil, err
		}
		next := filepath.Dir(current)
		if next == current {
			return "", nil, errors.New("candidate output has no existing directory ancestor")
		}
		missing = append(missing, filepath.Base(current))
		current = next
	}
}

func requireRealDirectory(path string) error {
	information, err := fileidentity.Lstat(path)
	if err != nil || !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return errors.New("candidate output parent path must contain only real directories")
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil || filepath.Clean(resolved) != filepath.Clean(path) {
		return errors.New("candidate output parent path must not contain symlinks")
	}
	return nil
}

func writeCandidateDirectory(output string, markdown, receipt []byte) (string, string, error) {
	if err := prepareRealParent(filepath.Dir(output)); err != nil {
		return "", "", err
	}
	if err := os.Mkdir(output, 0o700); err != nil {
		return "", "", fmt.Errorf("create new candidate output directory: %w", err)
	}
	markdownPath := filepath.Join(output, importedMarkdownName)
	receiptPath := filepath.Join(output, importedReceiptName)
	if err := writeNewFile(markdownPath, markdown); err != nil {
		_ = os.Remove(output)
		return "", "", fmt.Errorf("write imported candidate Markdown: %w", err)
	}
	if err := writeNewFile(receiptPath, receipt); err != nil {
		_ = os.Remove(markdownPath)
		_ = os.Remove(output)
		return "", "", fmt.Errorf("write imported candidate receipt: %w", err)
	}
	return markdownPath, receiptPath, nil
}
