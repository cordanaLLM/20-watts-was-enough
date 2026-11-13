package pdfrender

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/visualbaseline"
)

type visualLockWriter struct {
	t     *testing.T
	root  string
	calls int
}

func (writer *visualLockWriter) Write(body []byte) (int, error) {
	assertVisualPublicationHeld(writer.t, writer.root)
	writer.calls++
	return len(body), nil
}

func assertVisualPublicationHeld(t *testing.T, root string) {
	t.Helper()
	lock, err := acquirePublicationLock(root)
	if err == nil {
		if releaseErr := lock.release(); releaseErr != nil {
			t.Fatal(releaseErr)
		}
		t.Fatal("publication lock released before visual processing completed")
	}
	if !strings.Contains(err.Error(), "already locked") {
		t.Fatal(err)
	}
}

func visualPixel(t *testing.T, red uint8) []byte {
	t.Helper()
	value := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	value.SetNRGBA(0, 0, color.NRGBA{R: red, A: 255})
	var body bytes.Buffer
	if err := png.Encode(&body, value); err != nil {
		t.Fatal(err)
	}
	return body.Bytes()
}

func writeVisualLockCapture(t *testing.T, directory string, configuration Configuration) {
	t.Helper()
	output := filepath.Join(directory, "visual-capture")
	if err := os.Mkdir(output, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(output, "home-desktop.png"), visualPixel(t, 0), 0o600); err != nil {
		t.Fatal(err)
	}
	manifest := visualbaseline.Manifest{Schema: 1, Captures: []visualbaseline.Captured{{
		File: "home-desktop.png", View: "home", Viewport: "desktop", Width: 1, Height: 1,
		URL: "http://127.0.0.1:3137/", BrowserProduct: "Chrome/" + configuration.Lock.ChromeForTesting.Version,
	}}}
	body, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(output, "capture-manifest.json"), body, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestVisualRunKeepsPublicationLockedThroughProcessingAndReport(t *testing.T) {
	for _, mode := range []string{"record", "check", "difference", "capture-error"} {
		t.Run(mode, func(t *testing.T) { runLockedVisualFixture(t, mode) })
	}
}

func visualLockOptions(t *testing.T, configuration Configuration, mode string) (visualbaseline.Options, *visualLockWriter) {
	t.Helper()
	writer := &visualLockWriter{t: t, root: configuration.RepositoryRoot}
	options := visualbaseline.Options{RepositoryRoot: configuration.RepositoryRoot, Lock: configuration.Lock,
		Plan: visualbaseline.Plan{Schema: 1, Viewports: []visualbaseline.Viewport{{Name: "desktop", Width: 1, Height: 1}},
			Views: []visualbaseline.View{{Name: "home", ReadySelector: "main"}}}, Record: mode == "record", Output: writer}
	if err := os.MkdirAll(filepath.Join(options.RepositoryRoot, visualbaseline.BaselineDirectory), 0o755); err != nil {
		t.Fatal(err)
	}
	red := uint8(0)
	if mode == "difference" || mode == "record" {
		red = 255
	}
	if _, err := visualbaseline.Record(options.RepositoryRoot, "home-desktop.png", visualPixel(t, red)); err != nil {
		t.Fatal(err)
	}
	return options, writer
}

func executeLockedVisualFixture(t *testing.T, ctx context.Context, options visualbaseline.Options, configuration Configuration, mode string, capture VisualCapture) error {
	t.Helper()
	runErr := visualbaseline.Execute(ctx, options, func(ctx context.Context, directory string) error {
		if _, err := capture(ctx, directory); err != nil {
			return err
		}
		if mode == "capture-error" {
			return errors.New("planted capture error")
		}
		writeVisualLockCapture(t, directory, configuration)
		return nil
	})
	assertVisualPublicationHeld(t, options.RepositoryRoot)
	if mode != "record" {
		if _, err := os.Stat(filepath.Join(options.RepositoryRoot, "build/visual-check/report.json")); err != nil {
			t.Fatal(err)
		}
	}
	return runErr
}

func runLockedVisualFixture(t *testing.T, mode string) {
	t.Helper()
	configuration := renderConfiguration(t)
	options, writer := visualLockOptions(t, configuration, mode)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	executor := &visualExecutor{recordingExecutor: recordingExecutor{imageID: testImageID}}
	err := withVisualCaptureDependencies(ctx, configuration, noOpPreparer{}, executor, func(capture VisualCapture) error {
		return executeLockedVisualFixture(t, ctx, options, configuration, mode, capture)
	})
	wantError := mode == "difference" || mode == "capture-error"
	if (err != nil) != wantError {
		t.Fatalf("mode %s: %v", mode, err)
	}
	if (mode == "record" || mode == "difference") && writer.calls == 0 {
		t.Fatal("processing writer never called")
	}
	lock, err := acquirePublicationLock(options.RepositoryRoot)
	if err != nil {
		t.Fatalf("publication lock leaked: %v", err)
	}
	if err := lock.release(); err != nil {
		t.Fatal(err)
	}
}
