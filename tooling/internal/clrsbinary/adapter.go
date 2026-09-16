package clrsbinary

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

const (
	maximumIdentityBytes            = 128
	maximumReferencesCeiling        = 4_096
	maximumReferenceSetBytesCeiling = 64 << 20
	// Four fixture identities, one prompt digest and the effective-size integer.
	heldIdentityBytes = 5*sha256.Size + 8
)

var ErrReferenceLimit = errors.New("binary-search reference limit exceeded")

// Specialist is the exact conventional CLRS binary-search implementation. It
// owns no reference data and sees only specialistcontrol.Invocation.
type Specialist struct {
	id     string
	limits Limits
}

// NewSpecialist closes the candidate-visible solver identity and bounds.
func NewSpecialist(id string, limits Limits) (Specialist, error) {
	if !validIdentity(id) {
		return Specialist{}, errors.New("binary-search specialist identity is invalid")
	}
	if err := limits.Validate(); err != nil {
		return Specialist{}, err
	}
	return Specialist{id: id, limits: limits}, nil
}

// Invoke implements specialistcontrol.Specialist.
func (specialist Specialist) Invoke(
	ctx context.Context,
	invocation specialistcontrol.Invocation,
) (specialistcontrol.SpecialistResult, error) {
	refused := specialistcontrol.SpecialistResult{
		Binding: invocation.Binding, SpecialistID: specialist.id, State: specialistcontrol.ResultRefused,
	}
	if ctx == nil {
		return refused, errors.New("invoke binary-search specialist: nil context")
	}
	if err := ctx.Err(); err != nil {
		return refused, err
	}
	if invocation.Task != specialistcontrol.TaskBinarySearch || invocation.Binding == (specialistcontrol.Binding{}) ||
		invocation.MaxResultBytes <= 0 {
		return refused, nil
	}
	answer, err := Solve(ctx, invocation.Payload, specialist.limits)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return refused, err
		}
		if errors.Is(err, ErrInvalidLimits) || errors.Is(err, ErrMalformedPrompt) ||
			errors.Is(err, ErrPromptLimit) || errors.Is(err, ErrAnswerLimit) {
			return refused, nil
		}
		return refused, fmt.Errorf("solve binary-search invocation: %w", err)
	}
	if len(answer) > invocation.MaxResultBytes {
		return refused, nil
	}
	return specialistcontrol.SpecialistResult{
		Binding:      invocation.Binding,
		SpecialistID: specialist.id,
		State:        specialistcontrol.ResultCompleted,
		Payload:      answer,
	}, nil
}

// VerifierLimits bound the separately held reference index. They are safety
// caps, not fixture counts or an experiment sampling decision.
type VerifierLimits struct {
	MaxReferences     int
	MaxReferenceBytes int64
}

// Validate rejects an open or impractically large verifier index.
func (limits VerifierLimits) Validate() error {
	if limits.MaxReferences <= 0 || limits.MaxReferences > maximumReferencesCeiling ||
		limits.MaxReferenceBytes <= 0 || limits.MaxReferenceBytes > maximumReferenceSetBytesCeiling {
		return ErrReferenceLimit
	}
	return nil
}

type referenceKey struct {
	runID     string
	requestID string
}

type heldReference struct {
	source             clrsfixture.SourceID
	contract           clrsfixture.ContractID
	candidateID        clrsfixture.CandidateID
	verifierID         clrsfixture.VerifierID
	promptSHA256       [sha256.Size]byte
	effectiveInputSize int64
	answer             []byte
}

type boundCandidate struct {
	id     clrsfixture.CandidateID
	prompt []byte
}

// RequestSet is the candidate-only projection of one validated binary-search
// dataset run. It cannot be constructed from a raw prompt or held answer.
type RequestSet struct {
	runID      string
	candidates []boundCandidate
}

// Verifier independently exact-scores against separately held references.
type Verifier struct {
	specialistID string
	limits       Limits
	references   map[referenceKey]heldReference
}

// BindDataset validates the exact contract-selected binary-search candidate
// and verifier sets, then returns separate candidate-only and held-reference
// views. Every value remains NO_RESULT.
func BindDataset(
	runID string,
	specialistID string,
	source clrsfixture.SourceRecord,
	contract clrsfixture.GenerationContract,
	candidates clrsfixture.CandidateSet,
	verifiers clrsfixture.VerifierSet,
	limits Limits,
	verifierLimits VerifierLimits,
) (RequestSet, Verifier, error) {
	if !validIdentity(runID) || !validIdentity(specialistID) {
		return RequestSet{}, Verifier{}, errors.New("binary-search run or specialist identity is invalid")
	}
	if err := limits.Validate(); err != nil {
		return RequestSet{}, Verifier{}, err
	}
	if err := verifierLimits.Validate(); err != nil {
		return RequestSet{}, Verifier{}, err
	}
	if err := PinnedSourceEvidence().ValidateSource(source); err != nil {
		return RequestSet{}, Verifier{}, err
	}
	task, err := binarySearchTaskPlan(source, contract)
	if err != nil {
		return RequestSet{}, Verifier{}, err
	}
	pairs, err := clrsfixture.PairExamples(
		source,
		contract,
		task.OutputRelativePath,
		candidates,
		verifiers,
	)
	if err != nil {
		return RequestSet{}, Verifier{}, fmt.Errorf("pair binary-search dataset: %w", err)
	}
	if len(pairs) == 0 || len(pairs) > verifierLimits.MaxReferences {
		return RequestSet{}, Verifier{}, fmt.Errorf("%w: reference count is %d", ErrReferenceLimit, len(pairs))
	}

	requestSet := RequestSet{runID: runID, candidates: make([]boundCandidate, 0, len(pairs))}
	validated := make(map[referenceKey]heldReference, len(pairs))
	var retainedBytes int64
	for index, pair := range pairs {
		candidate, held, bindErr := bindPair(pair, limits)
		if bindErr != nil {
			return RequestSet{}, Verifier{}, fmt.Errorf("bind binary-search pair %d: %w", index, bindErr)
		}
		requestID := candidate.id.String()
		retainedBytes += int64(len(runID)+len(requestID)+len(held.answer)) + heldIdentityBytes
		if retainedBytes > verifierLimits.MaxReferenceBytes {
			return RequestSet{}, Verifier{}, fmt.Errorf("%w: retained bytes exceed %d", ErrReferenceLimit, verifierLimits.MaxReferenceBytes)
		}
		key := referenceKey{runID: runID, requestID: requestID}
		if _, duplicate := validated[key]; duplicate {
			return RequestSet{}, Verifier{}, fmt.Errorf("duplicate binary-search reference %s/%s", key.runID, key.requestID)
		}
		requestSet.candidates = append(requestSet.candidates, candidate)
		validated[key] = held
	}
	return requestSet, Verifier{specialistID: specialistID, limits: limits, references: validated}, nil
}

// Requests returns fresh candidate-only controller packets for one closed run
// window. RequestID is the source-and-contract-bound CandidateID.
func (set RequestSet) Requests(issuedAt, deadline time.Time) ([]specialistcontrol.Request, error) {
	if !validIdentity(set.runID) || len(set.candidates) == 0 {
		return nil, errors.New("binary-search request set is unbound")
	}
	if issuedAt.IsZero() || deadline.IsZero() || !deadline.After(issuedAt) {
		return nil, errors.New("binary-search request window is invalid")
	}
	requests := make([]specialistcontrol.Request, 0, len(set.candidates))
	for _, candidate := range set.candidates {
		requestID := candidate.id.String()
		if !validIdentity(requestID) || len(candidate.prompt) == 0 {
			return nil, errors.New("binary-search bound candidate is invalid")
		}
		requests = append(requests, specialistcontrol.Request{
			RunID:     set.runID,
			RequestID: requestID,
			Task:      specialistcontrol.TaskBinarySearch,
			Payload:   append([]byte(nil), candidate.prompt...),
			IssuedAt:  issuedAt,
			Deadline:  deadline,
		})
	}
	return requests, nil
}

// Verify implements specialistcontrol.ExactVerifier.
func (verifier Verifier) Verify(
	ctx context.Context,
	invocation specialistcontrol.Invocation,
	candidate specialistcontrol.Candidate,
) (specialistcontrol.Verification, error) {
	verification := specialistcontrol.Verification{
		Binding: candidate.Binding, CandidateBinding: candidate.CandidateBinding,
		Verdict: specialistcontrol.VerificationAbstain,
	}
	if ctx == nil {
		return verification, errors.New("verify binary-search candidate: nil context")
	}
	if err := ctx.Err(); err != nil {
		return verification, err
	}
	if invocation.Task != specialistcontrol.TaskBinarySearch || invocation.Binding != candidate.Binding ||
		candidate.Binding == (specialistcontrol.Binding{}) ||
		candidate.CandidateBinding == (specialistcontrol.CandidateBinding{}) ||
		candidate.SpecialistID != verifier.specialistID || candidate.State != specialistcontrol.ResultCompleted {
		return verification, errors.New("verify binary-search candidate: invalid invocation binding")
	}
	held, present := verifier.references[referenceKey{runID: invocation.RunID, requestID: invocation.RequestID}]
	if !present || held.candidateID.String() != invocation.RequestID ||
		held.promptSHA256 != sha256.Sum256(invocation.Payload) {
		return verification, errors.New("verify binary-search candidate: no exact prompt-bound reference")
	}
	input, err := parsePrompt(ctx, invocation.Payload, verifier.limits)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return verification, err
		}
		return verification, errors.New("verify binary-search candidate: prompt semantics differ from the held candidate")
	}
	if int64(len(input.values)) != held.effectiveInputSize {
		return verification, errors.New("verify binary-search candidate: prompt semantics differ from the held candidate")
	}
	if len(candidate.Payload) == 0 || len(candidate.Payload) > verifier.limits.MaxAnswerBytes {
		return verification, errors.New("verify binary-search candidate: answer crosses verifier bounds")
	}
	if bytes.Equal(candidate.Payload, held.answer) {
		verification.Verdict = specialistcontrol.VerificationExact
	} else {
		verification.Verdict = specialistcontrol.VerificationMismatch
	}
	return verification, nil
}

func binarySearchTaskPlan(
	source clrsfixture.SourceRecord,
	contract clrsfixture.GenerationContract,
) (clrsfixture.TaskPlan, error) {
	plan, err := contract.Plan(source)
	if err != nil {
		return clrsfixture.TaskPlan{}, fmt.Errorf("plan binary-search dataset: %w", err)
	}
	for _, task := range plan.Tasks {
		if task.Task == clrsfixture.TaskBinarySearch {
			return task, nil
		}
	}
	return clrsfixture.TaskPlan{}, errors.New("generation contract has no binary-search task")
}

func bindPair(pair clrsfixture.PairedExample, limits Limits) (boundCandidate, heldReference, error) {
	candidate := pair.Candidate
	verifier := pair.Verifier
	if candidate.Task != clrsfixture.TaskBinarySearch ||
		candidate.LengthSemantics != clrsfixture.LengthDeclaredInput || candidate.UseHints ||
		candidate.RequestedLength != candidate.EffectiveInputSize ||
		verifier.CandidateID != candidate.ID {
		return boundCandidate{}, heldReference{}, errors.New("pair differs from binary-search no-hint length semantics")
	}
	if candidate.EffectiveInputSize <= 0 || candidate.EffectiveInputSize > int64(limits.MaxValues) {
		return boundCandidate{}, heldReference{}, fmt.Errorf(
			"%w: effective input size %d exceeds 1..%d",
			ErrPromptLimit,
			candidate.EffectiveInputSize,
			limits.MaxValues,
		)
	}
	prompt := []byte(candidate.Prompt)
	input, err := parsePrompt(context.Background(), prompt, limits)
	if err != nil {
		return boundCandidate{}, heldReference{}, fmt.Errorf("validate candidate prompt: %w", err)
	}
	if int64(len(input.values)) != candidate.EffectiveInputSize {
		return boundCandidate{}, heldReference{}, fmt.Errorf(
			"prompt value count = %d, want effective input size %d",
			len(input.values), candidate.EffectiveInputSize,
		)
	}
	answer := []byte(verifier.Reference)
	if err := validateReference(context.Background(), answer, limits, input); err != nil {
		return boundCandidate{}, heldReference{}, err
	}
	return boundCandidate{id: candidate.ID, prompt: append([]byte(nil), prompt...)}, heldReference{
		source:             candidate.Source,
		contract:           candidate.Contract,
		candidateID:        candidate.ID,
		verifierID:         verifier.ID,
		promptSHA256:       sha256.Sum256(prompt),
		effectiveInputSize: candidate.EffectiveInputSize,
		answer:             append([]byte(nil), answer...),
	}, nil
}

func validIdentity(value string) bool {
	if len(value) == 0 || len(value) > maximumIdentityBytes {
		return false
	}
	for index := range len(value) {
		character := value[index]
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') &&
			(character < '0' || character > '9') && character != '.' && character != '_' &&
			character != ':' && character != '-' {
			return false
		}
	}
	return true
}
