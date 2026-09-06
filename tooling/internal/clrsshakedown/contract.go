// Package clrsshakedown runs the frozen local Go controller development slice.
// It neither generates fixtures nor grants image or scientific-result authority.
package clrsshakedown

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/lusoris/20-watts-was-enough/tooling/internal/buildinfo"
	"github.com/lusoris/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/lusoris/20-watts-was-enough/tooling/internal/specialistcontrol"
)

const (
	maximumExamples     = 48
	maximumEvents       = 256
	maximumEventBytes   = 2 << 20
	maximumJournalBytes = 16 << 20
	maximumReportBytes  = 1 << 20
	maximumExampleBytes = 1 << 20
	runTimeout          = 60 * time.Second
	requestTimeout      = time.Second
	recordTimeout       = 100 * time.Millisecond
)

type Options struct {
	RepositoryRoot, DatasetDirectory, ExpectedTreeSHA256, OutputDirectory, RunID string
}

type FileIdentity struct {
	SHA256    string `json:"sha256"`
	SizeBytes int64  `json:"size_bytes"`
}

type Artifact struct {
	Path     string       `json:"path"`
	Identity FileIdentity `json:"identity"`
}

type Case struct {
	RequestID          string               `json:"request_id"`
	Task               clrsfixture.TaskKind `json:"task"`
	Answer             FileIdentity         `json:"answer"`
	Exact              bool                 `json:"exact"`
	ElapsedNanoseconds int64                `json:"elapsed_nanoseconds"`
}

type UnavailableMeasurement struct {
	State  string   `json:"state"`
	Joules *float64 `json:"joules"`
	Reason string   `json:"reason"`
}

// Report describes development observations. A completed receipt additionally
// needs successful external command exit; it does not authenticate its producer.
type Report struct {
	SchemaVersion        int                           `json:"schema_version"`
	Authority            string                        `json:"authority"`
	State                string                        `json:"state"`
	RunID                string                        `json:"run_id"`
	SourceID             string                        `json:"source_id"`
	ContractID           string                        `json:"contract_id"`
	SourceSHA256         string                        `json:"source_sha256"`
	ContractSHA256       string                        `json:"contract_sha256"`
	TreeSHA256           string                        `json:"tree_sha256"`
	Build                buildinfo.Info                `json:"build"`
	Executable           FileIdentity                  `json:"executable"`
	Started              time.Time                     `json:"started"`
	Finished             time.Time                     `json:"finished"`
	TimeoutSeconds       int                           `json:"timeout_seconds"`
	RequestTimeoutMillis int                           `json:"request_timeout_milliseconds"`
	Inputs               []clrsfixture.FixtureTreeFile `json:"inputs"`
	InputsRechecked      bool                          `json:"inputs_rechecked"`
	Cases                []Case                        `json:"cases"`
	Events               []Artifact                    `json:"events"`
	EventBytes           int64                         `json:"event_bytes"`
	Energy               UnavailableMeasurement        `json:"energy"`
	ImageAdmitted        bool                          `json:"image_admitted"`
	ScientificResult     bool                          `json:"scientific_result"`
	Limitations          []string                      `json:"limitations"`
	Error                string                        `json:"error"`
}

type invocationEvent struct {
	RequestID string                             `json:"request_id"`
	Started   time.Time                          `json:"started"`
	Finished  time.Time                          `json:"finished"`
	Result    specialistcontrol.SpecialistResult `json:"result"`
	Error     string                             `json:"error"`
}

type verificationEvent struct {
	RequestID    string                         `json:"request_id"`
	Started      time.Time                      `json:"started"`
	Finished     time.Time                      `json:"finished"`
	Candidate    specialistcontrol.Candidate    `json:"candidate"`
	Verification specialistcontrol.Verification `json:"verification"`
	Error        string                         `json:"error"`
}

type terminalEvent struct {
	Request  specialistcontrol.Request   `json:"request"`
	Finished time.Time                   `json:"finished"`
	Result   specialistcontrol.RunResult `json:"result"`
	Case     Case                        `json:"case"`
	Error    string                      `json:"error"`
}

type event struct {
	Sequence     int                         `json:"sequence"`
	Kind         string                      `json:"kind"`
	Authority    string                      `json:"authority"`
	ObservedAt   time.Time                   `json:"observed_at"`
	Decision     *specialistcontrol.Decision `json:"decision,omitempty"`
	Invocation   *invocationEvent            `json:"invocation,omitempty"`
	Verification *verificationEvent          `json:"verification,omitempty"`
	Terminal     *terminalEvent              `json:"terminal,omitempty"`
}

func identify(body []byte) FileIdentity {
	sum := sha256.Sum256(body)
	return FileIdentity{hex.EncodeToString(sum[:]), int64(len(body))}
}

func newReport(options Options, tree clrsfixture.FixtureTree, executable FileIdentity, started time.Time) Report {
	return Report{SchemaVersion: 1, Authority: clrsfixture.ResultAuthority, State: "incomplete", RunID: options.RunID,
		SourceID: tree.Plan.SourceID.String(), ContractID: tree.Plan.ContractID.String(), SourceSHA256: tree.SourceSHA256,
		ContractSHA256: tree.ContractSHA256, TreeSHA256: tree.TreeSHA256, Build: buildinfo.Current(), Executable: executable,
		Started: started, TimeoutSeconds: 60, RequestTimeoutMillis: 1000,
		Inputs: tree.Files, Cases: []Case{}, Events: []Artifact{},
		Energy: UnavailableMeasurement{State: "unavailable", Reason: "No qualified whole-task energy measurement is collected."},
		Limitations: []string{
			"Local Go development execution of frozen construction fixtures; NO_RESULT and image admission remains blocked.",
			"No model, fixture generation, container execution, resource quota, independent human review or scientific comparison.",
			"Per-case elapsed time includes controller and verification work, excludes its terminal journal write, and is not a performance estimate.",
			"Unsigned local evidence does not authenticate compilation or third-party execution; successful external command exit is also required.",
			"Operator-owned filesystem; cooperative deadlines cannot pre-empt a blocked filesystem operation or hostile same-user process.",
		}}
}
