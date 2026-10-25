package clrsfixture

import (
	"context"
	"errors"
	"fmt"
	"path"
	"reflect"
	"sort"
	"time"
)

const (
	invocationTimeout             = 30 * time.Second
	maximumInvocationProgramBytes = 16 << 10
	maximumInvocationSourceBytes  = 64 << 10
)

// InvocationDeadline bounds one PrepareGeneratorInvocation call, which runs all
// of its work under invocationTimeout.
const InvocationDeadline = invocationTimeout

// GeneratorInvocation is prepared code, not an execution receipt. Its caller
// still owns the image identity, environment, isolation, deadline, and outputs.
type GeneratorInvocation struct {
	Authority        string
	SourceID         SourceID
	ContractID       ContractID
	Program          string
	ProgramSHA256    string
	PythonExecutable string
	OutputDirectory  string
	ExpectedPaths    []string
	ExpectedExamples int
}

// PythonArguments returns fresh arguments for PythonExecutable, not shell text.
// Merely constructing these arguments does not authorise their execution.
func (invocation GeneratorInvocation) PythonArguments() []string {
	return []string{"-B", "-c", invocation.Program}
}

type invocationInputs struct {
	root                     string
	foundation               GeneratorImageFoundation
	source                   SourceRecord
	contract                 GenerationContract
	plan                     GenerationPlan
	lock                     GeneratorLockInput
	image                    GeneratorImageContract
	sourceBody, contractBody []byte
}

// PrepareGeneratorInvocation derives the tested public-API ConfigDict wrapper
// from the current frozen authorities. It only reads bounded local files: no
// writes, Python, subprocesses, network, image selection, or fixture generation.
// The context deadline is cooperative between reads, parsing and rendering; it
// cannot preempt a blocked filesystem call or JSON decode.
func PrepareGeneratorInvocation(ctx context.Context, repositoryRoot string) (GeneratorInvocation, error) {
	return prepareGeneratorInvocation(ctx, repositoryRoot, nil)
}

func prepareGeneratorInvocation(ctx context.Context, repositoryRoot string, beforeRecheck func() error) (GeneratorInvocation, error) {
	if ctx == nil {
		return GeneratorInvocation{}, errors.New("CLRS invocation preparation requires a context")
	}
	ctx, cancel := context.WithTimeout(ctx, invocationTimeout)
	defer cancel()
	inputs, err := loadInvocationInputs(ctx, repositoryRoot)
	if err != nil {
		return GeneratorInvocation{}, err
	}
	program, err := renderGeneratorProgram(inputs)
	if err != nil {
		return GeneratorInvocation{}, err
	}
	if beforeRecheck != nil {
		if err := beforeRecheck(); err != nil {
			return GeneratorInvocation{}, err
		}
	}
	current, err := loadInvocationInputs(ctx, inputs.root)
	if err != nil {
		return GeneratorInvocation{}, err
	}
	if !reflect.DeepEqual(inputs, current) {
		return GeneratorInvocation{}, errors.New("CLRS invocation authority changed during preparation")
	}
	paths := make([]string, 0, len(inputs.plan.Tasks))
	for _, task := range inputs.plan.Tasks {
		paths = append(paths, task.OutputRelativePath)
	}
	sort.Strings(paths)
	result := GeneratorInvocation{
		Authority: ResultAuthority, SourceID: inputs.plan.SourceID, ContractID: inputs.plan.ContractID,
		Program: program, ProgramSHA256: rawSHA256([]byte(program)), PythonExecutable: inputs.image.Runtime.Entrypoint[0],
		OutputDirectory: path.Join(inputs.image.Runtime.OutputRoot, "dataset"), ExpectedPaths: paths,
		ExpectedExamples: inputs.plan.Output.ExpectedExamples,
	}
	if err := ctx.Err(); err != nil {
		return GeneratorInvocation{}, err
	}
	return result, nil
}

func loadInvocationInputs(ctx context.Context, repositoryRoot string) (inputs invocationInputs, err error) {
	if err := ctx.Err(); err != nil {
		return inputs, err
	}
	inputs.root, err = cleanGeneratorRoot(repositoryRoot)
	if err != nil {
		return inputs, err
	}
	inputs.foundation, err = CheckGeneratorImageFoundation(inputs.root)
	if err != nil {
		return inputs, fmt.Errorf("CLRS invocation foundation: %w", err)
	}
	inputs.sourceBody, err = readGeneratorFileWithInterlock(inputs.root, trackedSourcePath, maximumSourceRecordBytes, ctx.Err)
	if err != nil {
		return inputs, err
	}
	inputs.source, err = ParseSourceRecord(inputs.sourceBody)
	if err != nil {
		return inputs, err
	}
	inputs.contractBody, err = readGeneratorFileWithInterlock(inputs.root, trackedGenerationPath, maximumGenerationContractBytes, ctx.Err)
	if err != nil {
		return inputs, err
	}
	inputs.contract, err = ParseGenerationContract(inputs.contractBody, inputs.source)
	if err != nil {
		return inputs, err
	}
	inputs.plan, err = inputs.contract.Plan(inputs.source)
	if err != nil {
		return inputs, err
	}
	inputs.lock, inputs.image, _, err = loadGeneratorWheelhouseInputs(inputs.root)
	if err != nil {
		return inputs, err
	}
	if inputs.foundation.SourceID != inputs.plan.SourceID || inputs.foundation.GenerationContract != inputs.plan.ContractID {
		return inputs, errors.New("CLRS invocation source/plan differs from the image foundation")
	}
	return inputs, ctx.Err()
}
