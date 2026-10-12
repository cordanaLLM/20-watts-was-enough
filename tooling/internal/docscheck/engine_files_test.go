package docscheck

import (
	"strings"
	"testing"
)

const (
	testVendorNote   = "tools/figures/third_party/interfig/VENDOR.md"
	testVendorTarget = "../../../../docs/guides/figures.md"
	testLastDay      = "2027-01-09"
	testToday        = "2026-10-11"
	testDiagram      = "```mermaid\nflowchart LR\n  Skill --> Copy\n```\n"
)

// validateFixture runs the validator on a synthetic repository. A fixture holds
// no engine-written file, so it runs without the declared link exceptions; with
// them every fixture would report each entry as unused.
func validateFixture(root string) Result {
	return validateWith(root, options{today: testToday})
}

func testException() linkException {
	return linkException{Path: testVendorNote, Target: testVendorTarget, Reason: "engine-written note", Expires: testLastDay}
}

func vendorRepository(t *testing.T) string {
	t.Helper()
	root := validRepository(t)
	writeFile(t, root, testVendorNote, "[guide]("+testVendorTarget+")\n")
	return root
}

func TestLinkExceptionCoversOneFileAndTargetUntilItsLastDay(t *testing.T) {
	t.Parallel()
	root := vendorRepository(t)
	run := options{today: testLastDay, linkExceptions: []linkException{testException()}}

	result := validateWith(root, run)
	if len(result.Errors) != 0 {
		t.Fatalf("validateWith() on the last day: errors = %v", result.Errors)
	}
	if !containsDiagnostic(result.Warnings, "dated exception until "+testLastDay) {
		t.Fatalf("validateWith() warnings = %v, want the exception named", result.Warnings)
	}

	run.today = "2027-01-10"
	result = validateWith(root, run)
	if !containsDiagnostic(result.Errors, "Broken link in "+testVendorNote) ||
		!containsDiagnostic(result.Errors, "ended on "+testLastDay) {
		t.Fatalf("validateWith() the day after: errors = %v, want the link and the expiry", result.Errors)
	}
}

func TestLinkExceptionRefusesEverythingItDoesNotName(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		mutate     func(t *testing.T, root string)
		diagnostic string
	}{
		{
			name: "second broken target in the named file",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, testVendorNote, "[guide]("+testVendorTarget+") [other](missing.md)\n")
			},
			diagnostic: "Broken link in " + testVendorNote + ": missing.md",
		},
		{
			name: "same target in another file",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "tools/figures/third_party/interfig/NOTES.md", "[guide]("+testVendorTarget+")\n")
			},
			diagnostic: "Broken link in tools/figures/third_party/interfig/NOTES.md",
		},
		{
			name: "link repaired, entry left behind",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "docs/guides/figures.md", "guide\n")
			},
			diagnostic: "Link exception matches no broken link",
		},
		{
			name: "file removed, entry left behind",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, testVendorNote, "no link\n")
			},
			diagnostic: "Link exception matches no broken link",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := vendorRepository(t)
			test.mutate(t, root)
			result := validateWith(root, options{today: testToday, linkExceptions: []linkException{testException()}})
			if !containsDiagnostic(result.Errors, test.diagnostic) {
				t.Fatalf("validateWith() errors = %v, want %q", result.Errors, test.diagnostic)
			}
		})
	}
}

func TestMalformedLinkExceptionsStopTheRun(t *testing.T) {
	t.Parallel()
	valid := testException()
	tests := []struct {
		name       string
		run        options
		diagnostic string
	}{
		{"comparison day", options{today: "11.10.2026", linkExceptions: []linkException{valid}}, "comparison day"},
		{"no path", options{today: testToday, linkExceptions: []linkException{{Target: "a", Reason: "b", Expires: testLastDay}}}, "needs a path"},
		{"no target", options{today: testToday, linkExceptions: []linkException{{Path: "a", Reason: "b", Expires: testLastDay}}}, "needs a path"},
		{"blank reason", options{today: testToday, linkExceptions: []linkException{{Path: "a", Target: "b", Reason: " ", Expires: testLastDay}}}, "needs a path"},
		{"no end day", options{today: testToday, linkExceptions: []linkException{{Path: "a", Target: "b", Reason: "c"}}}, "calendar end day"},
		{"impossible end day", options{today: testToday, linkExceptions: []linkException{{Path: "a", Target: "b", Reason: "c", Expires: "2027-02-30"}}}, "calendar end day"},
		{"declared twice", options{today: testToday, linkExceptions: []linkException{valid, valid}}, "declared twice"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			result := validateWith(vendorRepository(t), test.run)
			if !containsDiagnostic(result.Errors, test.diagnostic) {
				t.Fatalf("validateWith() errors = %v, want %q", result.Errors, test.diagnostic)
			}
		})
	}
}

func TestDeclaredLinkExceptionsAreWellFormed(t *testing.T) {
	t.Parallel()
	if findings := validateOptions(defaultOptions()); len(findings) != 0 {
		t.Fatalf("validateOptions(defaultOptions()) = %v", findings)
	}
	for _, exception := range engineLinkExceptions {
		if exception.Expires != testLastDay || strings.ContainsAny(exception.Path+exception.Target, "*?[") {
			t.Fatalf("exception %+v must name one path, one target and the decided last day", exception)
		}
	}
}

func TestRenderedSkillCopyIsReadOnce(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeFile(t, root, ".agents/skills/example/SKILL.md", "# Example\n\n"+testDiagram)
	writeFile(t, root, ".claude/skills/example/SKILL.md", "# Example\n\n"+testDiagram)

	result := validateFixture(root)
	if len(result.Errors) != 0 {
		t.Fatalf("validateWith() with an identical copy: errors = %v", result.Errors)
	}
	if result.MarkdownFiles != 5 {
		t.Fatalf("validateWith() counted %d Markdown files, want the canonical skill only (5)", result.MarkdownFiles)
	}
}

func TestSkillCopyThatIsNotARenderingIsRead(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		path string
		body string
	}{
		{"one byte appended", ".claude/skills/example/SKILL.md", "# Example\n\n" + testDiagram + "\n"},
		{"one byte changed, same length", ".claude/skills/example/SKILL.md", "# Exemple\n\n" + testDiagram},
		{"other relative path", ".claude/skills/other/SKILL.md", "# Example\n\n" + testDiagram},
		{"folder that is no client skills folder", "claude/skills/example/SKILL.md", "# Example\n\n" + testDiagram},
		{"skills folder one level down", ".claude/extra/skills/example/SKILL.md", "# Example\n\n" + testDiagram},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			writeFile(t, root, ".agents/skills/example/SKILL.md", "# Example\n\n"+testDiagram)
			writeFile(t, root, test.path, test.body)
			result := validateFixture(root)
			if !containsDiagnostic(result.Errors, "Unbaselined duplicate Mermaid body") {
				t.Fatalf("validateWith() errors = %v, want the second diagram counted", result.Errors)
			}
		})
	}
}

func TestSkillCopyWithoutCanonicalFileIsRead(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeFile(t, root, ".claude/skills/example/SKILL.md", "[missing](missing.md)\n")
	result := validateFixture(root)
	if !containsDiagnostic(result.Errors, "Broken link in .claude/skills/example/SKILL.md") {
		t.Fatalf("validateWith() errors = %v, want the copy validated", result.Errors)
	}
}
