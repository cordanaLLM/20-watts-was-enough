package clrsfixture

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

var sbomBundleFiles = []struct {
	name  string
	limit int64
}{
	{"derivation-receipt.json", sbomMaximumReceiptBytes},
	{"execution-record.json", sbomMaximumReceiptBytes},
	{"image.spdx.json", sbomMaximumBytes},
	{"scanner-statement.intoto.json", sbomMaximumBytes},
	{"supplied-binding.json", sbomMaximumBindingBytes},
}

type sbomBundle struct {
	root  string
	info  os.FileInfo
	files map[string]sbomFile
}

type sbomFile struct {
	body []byte
	info os.FileInfo
}

func readSBOMBundle(ctx context.Context, directory string) (sbomBundle, error) {
	root, err := cleanGeneratorRoot(directory)
	if err != nil {
		return sbomBundle{}, fmt.Errorf("SBOM bundle root: %w", err)
	}
	info, err := inspectGeneratorRootPath(root)
	if err != nil {
		return sbomBundle{}, err
	}
	bundle := sbomBundle{root: root, info: info, files: make(map[string]sbomFile)}
	if err := checkSBOMInventory(bundle); err != nil {
		return sbomBundle{}, err
	}
	var total int64
	for _, expected := range sbomBundleFiles {
		if err := ctx.Err(); err != nil {
			return sbomBundle{}, err
		}
		info, err := fileidentity.Lstat(filepath.Join(root, expected.name))
		if err != nil {
			return sbomBundle{}, err
		}
		body, err := readGeneratorFileWithInterlock(root, expected.name, expected.limit, ctx.Err)
		if err != nil {
			return sbomBundle{}, err
		}
		total += int64(len(body))
		if total > sbomMaximumBundleBytes {
			return sbomBundle{}, errors.New("SBOM bundle exceeds 137 MiB")
		}
		bundle.files[expected.name] = sbomFile{body: body, info: info}
	}
	return bundle, nil
}

func checkSBOMInventory(bundle sbomBundle) error {
	info, err := inspectGeneratorRootPath(bundle.root)
	if err != nil || !os.SameFile(bundle.info, info) || bundle.info.Mode() != info.Mode() || !bundle.info.ModTime().Equal(info.ModTime()) {
		return errors.New("SBOM bundle root identity changed")
	}
	directory, err := os.Open(bundle.root)
	if err != nil {
		return err
	}
	defer directory.Close()
	opened, err := directory.Stat()
	if err != nil || !os.SameFile(info, opened) || info.Mode() != opened.Mode() || !info.ModTime().Equal(opened.ModTime()) {
		return errors.New("SBOM bundle directory changed before opening")
	}
	entries, err := directory.ReadDir(len(sbomBundleFiles) + 1)
	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	if len(entries) != len(sbomBundleFiles) {
		return errors.New("SBOM bundle must contain exactly the five named receipt and SPDX files")
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for i, expected := range sbomBundleFiles {
		entry := entries[i]
		if entry.Name() != expected.name || !entry.Type().IsRegular() {
			return fmt.Errorf("SBOM bundle requires regular file %s and no other entries", expected.name)
		}
	}
	return nil
}

func recheckSBOMBundle(ctx context.Context, bundle sbomBundle) error {
	if err := checkSBOMInventory(bundle); err != nil {
		return err
	}
	for _, expected := range sbomBundleFiles {
		if err := ctx.Err(); err != nil {
			return err
		}
		previous := bundle.files[expected.name]
		body, err := readGeneratorFileWithInterlock(bundle.root, expected.name, expected.limit, ctx.Err)
		if err != nil {
			return err
		}
		current, err := fileidentity.Lstat(filepath.Join(bundle.root, expected.name))
		if err != nil || !unchangedGeneratorFile(previous.info, current) ||
			len(body) != len(previous.body) || rawSHA256(body) != rawSHA256(previous.body) {
			return fmt.Errorf("SBOM bundle file %s changed during verification", expected.name)
		}
	}
	return checkSBOMInventory(bundle)
}

func (bundle sbomBundle) identities() []GeneratorSBOMFile {
	files := make([]GeneratorSBOMFile, 0, len(sbomBundleFiles))
	for _, expected := range sbomBundleFiles {
		body := bundle.files[expected.name].body
		files = append(files, GeneratorSBOMFile{expected.name, rawSHA256(body), int64(len(body))})
	}
	return files
}
