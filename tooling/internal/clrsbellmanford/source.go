// Package clrsbellmanford implements the exact-program Bellman-Ford vertical
// for the CLRS-Text development shakedown. Every value remains NO_RESULT.
package clrsbellmanford

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
// commit, tree, generator, requirements and licence metadata.
type SourceEvidence struct {
	SourceRecordPath string
	SourceID         string
	Formatter        SourceFile
	Spec             SourceFile
	Algorithm        SourceFile
	Sampler          SourceFile
	Probing          SourceFile
}

// PinnedSourceEvidence returns the exact official source inspected for the
// no-hint prompt/reference grammar and Bellman-Ford predecessor operation.
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
			Path:    "clrs/_src/algorithms/graphs.py",
			GitBlob: "09303e6eab24e4c35dee510589daceb4e3cc5ee7",
			SHA256:  "75366fdd2bd72e8f84103dbda6417214fa071bd42237130909b0035b3cd34940",
		},
		Sampler: SourceFile{
			Path:    "clrs/_src/samplers.py",
			GitBlob: "442a5c6d1da86c2956d8dcc78c9339ded296e1a8",
			SHA256:  "01921e9ca7fa0cc81a8ce82dd76869820f1e9ad8863d5b76b088b0610a2e0473",
		},
		Probing: SourceFile{
			Path:    "clrs/_src/probing.py",
			GitBlob: "e4ba102eecdfee2934268a33727da964a2119d37",
			SHA256:  "6ee8bea717c6a820fec0457c8be01a4459d5b2daab9c2c883ab8db333478f064",
		},
	}
}

// ValidateSource checks that this grammar evidence points to the supplied
// canonical source record.
func (evidence SourceEvidence) ValidateSource(source clrsfixture.SourceRecord) error {
	if evidence != PinnedSourceEvidence() {
		return fmt.Errorf("Bellman-Ford supporting source evidence differs from the pinned record")
	}
	identity, err := source.Identity()
	if err != nil {
		return fmt.Errorf("validate Bellman-Ford source record: %w", err)
	}
	if identity.String() != evidence.SourceID {
		return fmt.Errorf("Bellman-Ford source identity = %s, want %s", identity, evidence.SourceID)
	}
	return nil
}
