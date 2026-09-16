package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplancli"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrendercli"
)

func TestPublicAndPrivateCIPlanAgree(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	for _, arguments := range [][]string{
		{"--root", root, "--full", "--json"},
		{"--root", root, "--full"},
		{"--base", strings.Repeat("1", 40)},
		{"--unknown"},
		{"unexpected"},
	} {
		t.Run(strings.Join(arguments, " "), func(t *testing.T) {
			var publicOut, publicErr, privateOut, privateErr bytes.Buffer
			publicCode := run(append([]string{"ci", "plan"}, arguments...), &publicOut, &publicErr)
			privateCode := ciplancli.Run(append([]string{"plan"}, arguments...), strings.NewReader(""), &privateOut, &privateErr)
			if publicCode != privateCode || publicOut.String() != privateOut.String() || publicErr.String() != privateErr.String() {
				t.Fatalf("public %d/%q/%q differs from private %d/%q/%q", publicCode, publicOut.String(), publicErr.String(), privateCode, privateOut.String(), privateErr.String())
			}
		})
	}
}

func TestPublicAndPrivateCIProjectionAgree(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		input string
		code  int
	}{
		{`{"schema":2,"mode":"full","reason":"explicit-full","changed_paths":[],"lanes":["full","renderer"]}`, 0},
		{`{"schema":2,"mode":"full","unexpected":true}`, 1},
		{`null`, 1},
	} {
		var publicOut, publicErr, privateOut, privateErr bytes.Buffer
		publicCode := runCIProject(nil, strings.NewReader(test.input), &publicOut, &publicErr)
		privateCode := ciplancli.Run([]string{"project"}, strings.NewReader(test.input), &privateOut, &privateErr)
		if publicCode != test.code || privateCode != test.code || publicOut.String() != privateOut.String() || publicErr.String() != privateErr.String() {
			t.Fatalf("public %d/%q/%q differs from private %d/%q/%q", publicCode, publicOut.String(), publicErr.String(), privateCode, privateOut.String(), privateErr.String())
		}
	}
}

func TestPublicAndPrivatePDFProofRejectTheSameArgumentsBeforeDocker(t *testing.T) {
	t.Parallel()
	for _, arguments := range [][]string{
		nil,
		{"--receipt", "build/proof.json", "--ref", "release/latest"},
		{"--receipt", "build/proof.json", "--ref", "v1.2.3"},
		{"--receipt", "build/proof.json", "--revision", "not-a-commit"},
		{"--unknown"},
	} {
		var publicOut, publicErr, privateOut, privateErr bytes.Buffer
		publicCode := run(append([]string{"publication", "verify-pdf-reproducibility"}, arguments...), &publicOut, &publicErr)
		privateCode := pdfrendercli.RunVerifyReproducibility(arguments, &privateOut, &privateErr)
		if publicCode != 2 || privateCode != 2 || publicOut.Len() != 0 || privateOut.Len() != 0 || publicErr.String() != privateErr.String() {
			t.Fatalf("public %d/%q/%q differs from private usage rejection %d/%q/%q", publicCode, publicOut.String(), publicErr.String(), privateCode, privateOut.String(), privateErr.String())
		}
	}
}
