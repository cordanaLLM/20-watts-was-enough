package clrsshakedown

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func (r *containerRunner) preflight(ctx context.Context) error {
	version, err := r.control(ctx, false, "version", "--format", "{{.Client.Version}} {{.Server.Version}}")
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(version.Stdout)) != containerDockerVersion+" "+containerDockerVersion {
		return errors.New("Docker differs from reviewed 29.7.2 client/server")
	}
	info, err := r.control(ctx, false, "info", "--format", "{{json .}}")
	if err != nil {
		return err
	}
	if err := validateContainerDockerInfo(info.Stdout); err != nil {
		return err
	}
	image, err := r.control(ctx, false, "image", "inspect", "--format", "{{json .}}", r.options.ImageID)
	if err != nil {
		return err
	}
	return validateContainerImage(image.Stdout, r.options.ImageID)
}

func (r *containerRunner) present(ctx context.Context, p *containerPhaseState, cleanup bool) (bool, error) {
	result, err := r.control(ctx, cleanup, "container", "ls", "--all", "--filter", "name=^/"+p.Name+"$", "--format", "{{.ID}} {{.Names}}", "--no-trunc")
	if err != nil {
		return false, err
	}
	value := strings.TrimSpace(string(result.Stdout))
	if value == "" {
		return false, nil
	}
	parts := strings.Fields(value)
	if len(parts) != 2 || !validDigest(parts[0]) || parts[1] != p.Name || p.ID != "" && p.ID != parts[0] {
		return false, errors.New("container name inventory is ambiguous or changed")
	}
	return true, nil
}

func (r *containerRunner) inspect(ctx context.Context, p *containerPhaseState, cleanup bool) (containerInspection, error) {
	result, err := r.control(ctx, cleanup, "container", "inspect", "--format", "{{json .}}", p.Name)
	if err != nil {
		return containerInspection{}, err
	}
	parser := parseContainerInspection
	if cleanup {
		parser = parseContainerOwner
	}
	value, err := parser(result.Stdout)
	if err != nil {
		return value, err
	}
	if err := r.validateOwner(value, p); err != nil {
		return value, err
	}
	p.ID = value.ID
	return value, nil
}

func (r *containerRunner) runPhase(ctx context.Context, p *containerPhaseState) (containerCommandResult, error) {
	var empty containerCommandResult
	present, err := r.present(ctx, p, false)
	if err != nil {
		return empty, err
	}
	if present {
		return empty, errors.New("fresh shakedown container name already exists")
	}
	p.absentBefore, p.attempted = true, true
	created, err := r.control(ctx, false, r.createArguments(p)...)
	if err != nil {
		return empty, err
	}
	p.ID = strings.TrimSpace(string(created.Stdout))
	if !validDigest(p.ID) {
		p.ID = ""
		return empty, errors.New("Docker create did not return an exact container ID")
	}
	value, err := r.inspect(ctx, p, false)
	if err != nil {
		return empty, err
	}
	if err := r.validateCreated(value, p); err != nil {
		return empty, err
	}
	duration := containerExecuteTimeout
	if p.check {
		duration = containerCheckTimeout
	}
	p.StartAttempted = true
	result, runErr := r.command(ctx, duration, containerAttachedBytes, false, "container", "start", "--attach", p.ID)
	p.ExternalExit = result.ExitCode
	value, inspectErr := r.inspect(ctx, p, false)
	if inspectErr == nil {
		p.OOMKilled = value.State.OOMKilled
		if value.State.Status == "exited" && !value.State.Running {
			p.ContainerExit = value.State.ExitCode
		}
		s := value.State
		if s.Status != "exited" || s.Running || s.Paused || s.Restarting || s.OOMKilled || s.Dead || s.ExitCode != 0 || s.Error != "" {
			inspectErr = errors.New("container did not exit cleanly without OOM")
		}
		inspectErr = errors.Join(inspectErr, r.validateConfiguration(value, p))
	}
	return result, errors.Join(runErr, inspectErr)
}

func (r *containerRunner) cleanupPhase(ctx context.Context, p *containerPhaseState) error {
	if !p.attempted {
		return nil
	}
	present, err := r.present(ctx, p, true)
	if err != nil {
		return err
	}
	if !present {
		p.Removed = true
		return nil
	}
	value, err := r.inspect(ctx, p, true)
	if err != nil {
		return err
	}
	var stopErr error
	if value.State.Running {
		_, stopErr = r.control(ctx, true, "container", "stop", "--timeout", strconv.Itoa(int(containerStopGrace/time.Second)), p.ID)
	}
	value, err = r.inspect(ctx, p, true)
	if err != nil {
		return errors.Join(stopErr, err)
	}
	args := []string{"container", "rm"}
	if value.State.Running {
		args = append(args, "--force")
	}
	if _, err := r.control(ctx, true, append(args, p.ID)...); err != nil {
		return errors.Join(stopErr, err)
	}
	present, err = r.present(ctx, p, true)
	if present {
		err = errors.Join(err, fmt.Errorf("owned container %s remains after removal", p.Name))
	}
	if err == nil {
		p.Removed = true
	}
	return errors.Join(stopErr, err)
}

func (r *containerRunner) cleanup() error {
	ctx, cancel := context.WithTimeout(context.Background(), containerCleanupTimeout)
	defer cancel()
	var err error
	for i := range r.phases {
		err = errors.Join(err, r.cleanupPhase(ctx, &r.phases[i]))
	}
	return errors.Join(err, ctx.Err())
}
