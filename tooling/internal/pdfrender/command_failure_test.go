package pdfrender

import (
	"errors"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestCommandFailureRetainsTail(t *testing.T) {
	cause := errors.New("capture failed")
	const marker = "final capture cause"
	output := strings.Repeat("build listing\n", maximumDiagnosticBytes) + marker
	err := commandFailure("capture", cause, []byte(output))
	if !strings.Contains(err.Error(), marker) {
		t.Fatal("command failure dropped final capture cause")
	}
	if !strings.HasPrefix(err.Error(), "capture: capture failed: ...") {
		t.Fatal("truncated diagnostic lacks leading ellipsis")
	}
	if !errors.Is(err, cause) {
		t.Fatal("command failure lost wrapped cause")
	}
}

func TestCommandFailureExactLimit(t *testing.T) {
	output := strings.Repeat("x", maximumDiagnosticBytes)
	err := commandFailure("capture", errors.New("failed"), []byte(output))
	if err.Error() != "capture: failed: "+output {
		t.Fatal("exact-limit diagnostic changed or acquired ellipsis")
	}
}

func TestCommandFailureShortOutput(t *testing.T) {
	err := commandFailure("capture", errors.New("failed"), []byte("  render cause\n"))
	if err.Error() != "capture: failed: render cause" {
		t.Fatalf("short diagnostic = %q", err.Error())
	}
}

func TestCommandFailureEmptyOutput(t *testing.T) {
	for _, output := range []string{"", " \n\t"} {
		t.Run("output="+output, func(t *testing.T) {
			err := commandFailure("capture", errors.New("failed"), []byte(output))
			if err.Error() != "capture: failed" {
				t.Fatalf("empty diagnostic = %q", err.Error())
			}
		})
	}
}

func TestCommandFailureUTF8Boundary(t *testing.T) {
	for _, runeText := range []string{"é", "界", "🌍"} {
		t.Run(runeText, func(t *testing.T) {
			// The naive tail cut starts inside this rune, after its first byte.
			output := "prefix" + runeText + strings.Repeat("x", maximumDiagnosticBytes-len(runeText)+1)
			err := commandFailure("capture", errors.New("failed"), []byte(output))
			if !utf8.ValidString(err.Error()) {
				t.Fatal("truncated diagnostic split a UTF-8 rune")
			}
			if !strings.HasPrefix(err.Error(), "capture: failed: ...") {
				t.Fatal("truncated UTF-8 diagnostic lacks leading ellipsis")
			}
		})
	}
}
