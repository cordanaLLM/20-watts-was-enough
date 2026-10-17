package ocimanifest

import (
	"os"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/testtmp"
)

func TestMain(tests *testing.M) {
	os.Exit(testtmp.Run(tests))
}
