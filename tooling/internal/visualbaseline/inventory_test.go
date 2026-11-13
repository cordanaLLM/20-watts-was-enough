package visualbaseline

import (
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

func baselineEntries(directory string) ([]os.DirEntry, error) {
	files, err := os.Open(directory)
	if err != nil {
		return nil, fmt.Errorf("open inventory: %w", err)
	}
	defer files.Close()
	entries, err := files.ReadDir(128 + 1)
	if err != nil && err != io.EOF {
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
