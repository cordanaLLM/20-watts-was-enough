// Package clrsinsertion implements the exact-program insertion-sort vertical
// for the CLRS-Text development shakedown. Every value remains NO_RESULT.
package clrsinsertion

import (
	"fmt"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

// SourceFile binds one upstream file used to derive this vertical's grammar or
// exact conventional operation. SHA256 is over the file bytes at Commit.
type SourceFile struct {
	Path    string
	GitBlob string
	SHA256  string
}

// SourceEvidence extends the canonical source record with the supporting files
// used to derive this vertical. It references rather than repeats repository,
// commit, tree, generator, requirements, and licence metadata.
type SourceEvidence struct {
	SourceRecordPath string
	SourceID         string
	Formatter        SourceFile
	Spec             SourceFile
	Algorithm        SourceFile
	Sampler          SourceFile
}

// PinnedSourceEvidence returns the exact official source inspected for the
// no-hint prompt/reference grammar and insertion-sort operation.
func PinnedSourceEvidence() SourceEvidence {
	return SourceEvidence{
		SourceRecordPath: "tooling/clrs-generator/upstream.json",
		SourceID:         "sha256:7ec3b6b7528d04f517c4e9b7c3e0cd0f7034a775d225d469d1aca5c00fec10d1",
		Formatter: SourceFile{
			Path:    "clrs/_src/clrs_text/clrs_utils.py",
			GitBlob: "64a2714ca879cd62a4c1d1db0a80e6c23bf61541",
			SHA256:  "d6d320eb1536be8fbdb512315d55eada2db3ff87afd613762f125d38a9e7a53c",
		},
		Spec: SourceFile{
			Path:    "clrs/_src/specs.py",
			GitBlob: "db3b02e14072152df590a8df518ef058fd167930",
			SHA256:  "51f1cc936b28189c7b2e3b2030c30e224fb448f3d2846181983329448f1ed018",
		},
		Algorithm: SourceFile{
			Path:    "clrs/_src/algorithms/sorting.py",
			GitBlob: "cdc78ebfdc98e650b5fa67dfe259ff1e3b317fc2",
			SHA256:  "f38d82a93c1e4b987c5f68d9ad72eb4205a3572bdec490c9317cff573fb59ca4",
		},
		Sampler: SourceFile{
			Path:    "clrs/_src/samplers.py",
			GitBlob: "442a5c6d1da86c2956d8dcc78c9339ded296e1a8",
			SHA256:  "01921e9ca7fa0cc81a8ce82dd76869820f1e9ad8863d5b76b088b0610a2e0473",
		},
	}
}

// ValidateSource checks that this grammar evidence points to the supplied
// canonical source record.
func (evidence SourceEvidence) ValidateSource(source clrsfixture.SourceRecord) error {
	if evidence != PinnedSourceEvidence() {
		return fmt.Errorf("insertion-sort supporting source evidence differs from the pinned record")
	}
	identity, err := source.Identity()
	if err != nil {
		return fmt.Errorf("validate insertion-sort source record: %w", err)
	}
	if identity.String() != evidence.SourceID {
		return fmt.Errorf("insertion-sort source identity = %s, want %s", identity, evidence.SourceID)
	}
	return nil
}
