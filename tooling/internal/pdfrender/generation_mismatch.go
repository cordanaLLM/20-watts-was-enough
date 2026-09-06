package pdfrender

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func retainGenerationMismatch(repositoryRoot string, pairs [2][]renderedArtifact) (string, error) {
	identity, err := randomIdentity(12)
	if err != nil {
		return "", err
	}
	return retainGenerationMismatchAt(repositoryRoot, identity, pairs, writeReproducibilityMismatchArtifact)
}

func retainGenerationMismatchAt(
	repositoryRoot, identity string,
	pairs [2][]renderedArtifact,
	writeArtifact func(string, []byte) error,
) (location string, returnError error) {
	if len(identity) != 24 || strings.Trim(identity, "0123456789abcdef") != "" {
		return "", errors.New("PDF generation mismatch identity must be 24 lowercase hexadecimal characters")
	}
	if writeArtifact == nil {
		return "", errors.New("PDF generation mismatch evidence requires an artifact writer")
	}
	for _, pair := range pairs {
		if len(pair) != 2 || pair[0].name != bookPDFName || pair[1].name != bookManifestName ||
			len(pair[0].body) == 0 || len(pair[0].body) > maximumRenderedPDFBytes ||
			len(pair[1].body) == 0 || len(pair[1].body) > maximumManifestBytes {
			return "", errors.New("PDF generation mismatch evidence requires exactly two bounded PDF and manifest pairs")
		}
	}
	if err := requireContainedDirectory(repositoryRoot, "build/evidence", true); err != nil {
		return "", err
	}
	relative := filepath.Join("build", "evidence", "pdf-generation-mismatch-"+identity)
	root := filepath.Join(repositoryRoot, relative)
	if err := os.Mkdir(root, 0o755); err != nil {
		return "", fmt.Errorf("create PDF generation mismatch evidence %s: %w", filepath.ToSlash(relative), err)
	}
	location = filepath.ToSlash(relative)
	defer func() {
		if returnError != nil {
			// Completed artifacts remain useful even when a later write fails.
			returnError = fmt.Errorf("incomplete PDF generation mismatch evidence at %s: %w", location, returnError)
		}
	}()
	for index, pair := range pairs {
		renderRoot := filepath.Join(root, fmt.Sprintf("render-%d", index+1))
		if err := os.Mkdir(renderRoot, 0o755); err != nil {
			return location, fmt.Errorf("create PDF generation mismatch render directory: %w", err)
		}
		for _, artifact := range pair {
			if err := writeArtifact(filepath.Join(renderRoot, artifact.name), artifact.body); err != nil {
				return location, err
			}
		}
	}
	return location, nil
}
