package visualbaseline

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func committedBaselineDirectory(t *testing.T) string {
	t.Helper()
	return filepath.Join("..", "..", "..", BaselineDirectory)
}

func checkBaselineInventory(directory string) error {
	plan, err := LoadPlan(filepath.Join(directory, "views.json"))
	if err != nil {
		return fmt.Errorf("inventory plan: %w", err)
	}
	entries, err := baselineEntries(directory)
	if err != nil {
		return err
	}
	expected := make(map[string]Capture)
	for _, capture := range plan.Captures().Captures {
		expected[capture.File] = capture
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".png") {
			continue
		}
		capture, ok := expected[entry.Name()]
		if !ok {
			return fmt.Errorf("extra PNG: %s", entry.Name())
		}
		if err := checkBaselineDimensions(directory, capture); err != nil {
			return err
		}
		delete(expected, entry.Name())
	}
	if len(expected) != 0 {
		return fmt.Errorf("missing PNGs: %v", expected)
	}
	return nil
}

func baselineEntries(directory string) (entries []os.DirEntry, err error) {
	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, fmt.Errorf("open inventory root: %w", err)
	}
	defer func() {
		if closeErr := root.Close(); closeErr != nil {
			err = errors.Join(err, fmt.Errorf("close inventory root: %w", closeErr))
		}
	}()
	files, err := root.Open(".")
	if err != nil {
		return nil, fmt.Errorf("open inventory: %w", err)
	}
	defer func() {
		if closeErr := files.Close(); closeErr != nil {
			err = errors.Join(err, fmt.Errorf("close inventory: %w", closeErr))
		}
	}()
	entries, err = files.ReadDir(128 + 1)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("list inventory: %w", err)
	}
	if len(entries) > 128 {
		return nil, fmt.Errorf("inventory exceeds 128 entries")
	}
	return entries, nil
}

func checkBaselineDimensions(directory string, capture Capture) error {
	body, err := readPath(filepath.Join(directory, capture.File), maximumPNGBytes)
	if err != nil {
		return fmt.Errorf("read inventory PNG %s: %w", capture.File, err)
	}
	decoded, err := decodePNG(body)
	if err != nil {
		return fmt.Errorf("decode inventory PNG %s: %w", capture.File, err)
	}
	bounds := decoded.Bounds()
	if bounds.Dx() != capture.Width || bounds.Dy() != capture.Height {
		return fmt.Errorf("%s dimensions: got %dx%d, want %dx%d", capture.File, bounds.Dx(), bounds.Dy(), capture.Width, capture.Height)
	}
	return nil
}

func copyBaselineInventory(t *testing.T) (string, string) {
	t.Helper()
	source := committedBaselineDirectory(t)
	plan, err := LoadPlan(filepath.Join(source, "views.json"))
	if err != nil {
		t.Fatal(err)
	}
	destination := t.TempDir()
	writeTestFile(t, filepath.Join(destination, "views.json"), readTestFile(t, filepath.Join(source, "views.json")))
	captures := plan.Captures().Captures
	for _, capture := range captures {
		writeTestFile(t, filepath.Join(destination, capture.File), readTestFile(t, filepath.Join(source, capture.File)))
	}
	return destination, captures[0].File
}

func TestCommittedBaselineInventory(t *testing.T) {
	if err := checkBaselineInventory(committedBaselineDirectory(t)); err != nil {
		t.Fatal(err)
	}
}

func TestBaselineEntriesKeepTheDirectoryBound(t *testing.T) {
	directory := t.TempDir()
	for index := 0; index < 128; index++ {
		writeTestFile(t, filepath.Join(directory, fmt.Sprintf("entry-%03d", index)), nil)
	}
	entries, err := baselineEntries(directory)
	if err != nil || len(entries) != 128 {
		t.Fatalf("128-entry inventory: entries=%d error=%v", len(entries), err)
	}
	writeTestFile(t, filepath.Join(directory, "entry-128"), nil)
	if _, err := baselineEntries(directory); err == nil || !strings.Contains(err.Error(), "exceeds 128 entries") {
		t.Fatalf("129-entry inventory: error=%v", err)
	}
}

func TestBaselineInventoryRejectsMissingExtraAndWrongSize(t *testing.T) {
	for _, mutation := range []string{"missing", "extra", "dimensions"} {
		t.Run(mutation, func(t *testing.T) {
			directory, first := copyBaselineInventory(t)
			switch mutation {
			case "missing":
				if err := os.Remove(filepath.Join(directory, first)); err != nil {
					t.Fatal(err)
				}
			case "extra":
				writeTestFile(t, filepath.Join(directory, "extra-desktop.png"), readTestFile(t, filepath.Join(directory, first)))
			case "dimensions":
				body, err := encodePNG(solid(1, 1))
				if err != nil {
					t.Fatal(err)
				}
				writeTestFile(t, filepath.Join(directory, first), body)
			}
			if err := checkBaselineInventory(directory); err == nil || !strings.Contains(err.Error(), mutation) {
				t.Fatalf("%s: error=%v", mutation, err)
			}
		})
	}
}
