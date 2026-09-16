package clrsshakedown

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

// Run executes one sequential local development run and never overwrites output.
func Run(ctx context.Context, options Options) (Report, error) { return run(ctx, options, nil) }

func run(ctx context.Context, options Options, beforeCases func(*boundInputs, *journal)) (report Report, err error) {
	report = Report{SchemaVersion: 1, Authority: clrsfixture.ResultAuthority, State: "incomplete", RunID: options.RunID}
	defer func() {
		report.Authority = clrsfixture.ResultAuthority
		report.ImageAdmitted, report.ScientificResult = false, false
		if err != nil {
			report.State, report.Error = "incomplete", diagnostic(err)
		}
	}()
	if ctx == nil {
		return report, errors.New("shakedown execution requires a context")
	}
	if err := validateOptions(options); err != nil {
		return report, err
	}
	ctx, cancel := context.WithTimeout(ctx, runTimeout)
	defer cancel()
	started := time.Now().UTC()
	tree, err := clrsfixture.LoadFixtureTree(ctx, clrsfixture.FixtureTreeOptions{RepositoryRoot: options.RepositoryRoot,
		DatasetDirectory: options.DatasetDirectory, ExpectedTreeSHA256: options.ExpectedTreeSHA256})
	if err != nil {
		return report, err
	}
	options.RepositoryRoot, options.DatasetDirectory = tree.RepositoryRoot, tree.DatasetDirectory
	bound, err := bindInputs(options, tree)
	if err != nil {
		return report, err
	}
	executable, err := executableIdentity(ctx)
	if err != nil {
		return report, err
	}
	report = newReport(options, tree, executable, started)
	root, err := newBundle(options)
	if err != nil {
		return report, err
	}
	defer func() {
		err = errors.Join(err, root.Close(), ctx.Err())
		if err != nil {
			report.State, report.Error = "incomplete", diagnostic(err)
		}
	}()
	j := &journal{root: root, decisions: make(map[string]specialistcontrol.Decision)}
	defer func() { err = finishRun(ctx, root, j, &report, err) }()
	body, err := MarshalReport(report)
	if err != nil {
		return report, err
	}
	if err := writeNew(root, "run-start.json", body); err != nil {
		return report, err
	}
	if err := root.Mkdir("events", 0o700); err != nil {
		return report, err
	}
	if err := syncDirectory(root, "."); err != nil {
		return report, err
	}
	if beforeCases != nil {
		beforeCases(&bound, j)
	}
	runner, err := newRunner(bound, j)
	if err != nil {
		return report, err
	}
	if err := executeCases(ctx, bound, runner, j, &report); err != nil {
		return report, err
	}
	if err := tree.Recheck(ctx); err != nil {
		return report, err
	}
	currentExecutable, err := executableIdentity(ctx)
	if err != nil || currentExecutable != executable {
		return report, errors.Join(err, errors.New("shakedown executable changed during execution"))
	}
	report.InputsRechecked = true
	report.State = "completed-unadmitted"
	return report, ctx.Err()
}

func executeCases(ctx context.Context, bound boundInputs, runner specialistcontrol.Runner, j *journal, report *Report) error {
	for _, task := range bound.tasks {
		now := time.Now().UTC()
		requests, err := task.requests.Requests(now, now.Add(requestTimeout))
		if err != nil {
			return err
		}
		for _, request := range requests {
			if err := ctx.Err(); err != nil {
				return err
			}
			if len(report.Cases) >= maximumExamples {
				return errors.New("shakedown case limit exceeded")
			}
			request.IssuedAt = time.Now().UTC()
			request.Deadline = request.IssuedAt.Add(requestTimeout)
			started := time.Now()
			result, runErr := runner.Run(ctx, request)
			finished := time.Now().UTC()
			if result.Outcome.State != specialistcontrol.OutcomeVerified || result.Outcome.Authority != clrsfixture.ResultAuthority {
				runErr = errors.Join(runErr, errors.New("controller did not return a verified development outcome"))
			}
			runErr = errors.Join(runErr, ctx.Err())
			if !finished.Before(request.Deadline) {
				runErr = errors.Join(runErr, context.DeadlineExceeded)
			}
			c := Case{request.RequestID, task.task, identify(result.Outcome.Payload), runErr == nil, time.Since(started).Nanoseconds()}
			report.Cases = append(report.Cases, c)
			terminal := terminalEvent{request, finished, result, c, diagnostic(runErr)}
			recordCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), recordTimeout)
			recordErr := j.append(recordCtx, event{Kind: "terminal", Terminal: &terminal}, maximumEventBytes)
			cancel()
			if err := errors.Join(runErr, recordErr); err != nil {
				return fmt.Errorf("case %s: %w", request.RequestID, err)
			}
		}
	}
	if len(report.Cases) != maximumExamples || len(j.files) != maximumExamples*4 {
		return errors.New("shakedown did not complete all 48 cases and 192 ordered events")
	}
	return ctx.Err()
}

func finishRun(ctx context.Context, root *os.Root, j *journal, report *Report, runErr error) error {
	runErr = errors.Join(runErr, ctx.Err(), checkBundleRoot(root))
	report.Finished = time.Now().UTC()
	report.Events, report.EventBytes = append([]Artifact{}, j.files...), j.bytes
	if runErr != nil {
		report.State, report.Error = "incomplete", diagnostic(runErr)
	}
	body, err := MarshalReport(*report)
	if err == nil {
		err = writeNew(root, "receipt.json", body)
	}
	return errors.Join(runErr, err, ctx.Err(), checkBundleRoot(root))
}
