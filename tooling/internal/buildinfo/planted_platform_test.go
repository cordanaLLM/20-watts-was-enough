package buildinfo

import (
	"runtime"
	"testing"
)

func TestPlantedFailureWindows(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Fatal("planted failure for Windows CI runner proof")
	}
}

func TestPlantedFailureDarwin(t *testing.T) {
	if runtime.GOOS == "darwin" {
		t.Fatal("planted failure for macOS CI runner proof")
	}
}
