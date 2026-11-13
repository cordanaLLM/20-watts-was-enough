package visualbaseline

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrenderlock"
)

type Manifest struct {
	Schema   int        `json:"schema"`
	Captures []Captured `json:"captures"`
}

type Captured struct {
	File           string `json:"file"`
	View           string `json:"view"`
	Viewport       string `json:"viewport"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
	URL            string `json:"url"`
	BrowserProduct string `json:"browser_product"`
}

// ValidateManifest binds inventory, browser product and decoded PNG dimensions.
func ValidateManifest(directory string, plan CapturePlan, lock pdfrenderlock.Lock) (Manifest, error) {
	root, err := openDirectory(directory, "visual-capture", false)
	if err != nil {
		return Manifest{}, err
	}
	defer root.Close()
	body, err := readFile(root, "capture-manifest.json", maximumJSONBytes)
	if err != nil {
		return Manifest{}, err
	}
	var manifest Manifest
	if err := decodeStrict(body, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("capture manifest: %w", err)
	}
	if manifest.Schema != 1 {
		return Manifest{}, errors.New("capture manifest schema must be 1")
	}
	if len(manifest.Captures) != len(plan.Captures) {
		return Manifest{}, errors.New("capture manifest has missing or extra captures")
	}
	if err := validateManifestCaptures(root, manifest, plan, lock); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateManifestCaptures(root *os.Root, manifest Manifest, plan CapturePlan, lock pdfrenderlock.Lock) error {
	expected := make(map[string]Capture, len(plan.Captures))
	for _, capture := range plan.Captures {
		expected[capture.File] = capture
	}
	for _, capture := range manifest.Captures {
		want, ok := expected[capture.File]
		if !ok {
			return fmt.Errorf("capture manifest has extra or duplicate file %q", capture.File)
		}
		if err := validateCapture(capture, want, lock); err != nil {
			return err
		}
		if err := validateCapturePNG(root, capture); err != nil {
			return err
		}
		delete(expected, capture.File)
	}
	return nil
}

func validateCapture(got Captured, want Capture, lock pdfrenderlock.Lock) error {
	if got.View != want.View || got.Viewport != want.Viewport {
		return fmt.Errorf("capture %s view or viewport mismatch", got.File)
	}
	if got.Width != want.Width || got.Height != want.Height {
		return fmt.Errorf("capture %s width or height mismatch", got.File)
	}
	if got.URL != "http://127.0.0.1:3137"+want.URL {
		return fmt.Errorf("capture %s url mismatch", got.File)
	}
	product, version, ok := strings.Cut(got.BrowserProduct, "/")
	if !ok || (product != "Chrome" && product != "HeadlessChrome") || version != lock.ChromeForTesting.Version {
		return fmt.Errorf("capture %s browser_product %q differs from locked Chrome %s", got.File, got.BrowserProduct, lock.ChromeForTesting.Version)
	}
	return nil
}

func validateCapturePNG(root *os.Root, capture Captured) error {
	body, err := readFile(root, capture.File, maximumPNGBytes)
	if err != nil {
		return err
	}
	decoded, err := decodePNG(body)
	if err != nil {
		return fmt.Errorf("capture %s: %w", capture.File, err)
	}
	if decoded.Bounds().Dx() != capture.Width || decoded.Bounds().Dy() != capture.Height {
		return fmt.Errorf("capture %s PNG dimensions do not match viewport", capture.File)
	}
	return nil
}
