package ciplan

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"os/exec"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

const (
	gitDiffTimeout       = 15 * time.Second
	maximumGitDiffBytes  = 1 << 20
	maximumGitErrorBytes = 64 << 10
)

var (
	revisionPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
	scorePattern    = regexp.MustCompile(`^[RC][0-9]{1,3}$`)
	modePattern     = regexp.MustCompile(`^[0-7]{6}$`)
	objectIDPattern = regexp.MustCompile(`^([0-9a-f]{40}|[0-9a-f]{64})$`)
)

func readGitChangedPaths(
	ctx context.Context,
	root, baseRevision, headRevision string,
) ([]string, bool, error) {
	gitExecutable, err := exec.LookPath("git")
	if err != nil {
		return nil, false, errors.New("locate Git executable")
	}
	diffContext, cancel := context.WithTimeout(ctx, gitDiffTimeout)
	defer cancel()
	standardOutput := newBoundedBuffer(maximumGitDiffBytes)
	standardError := newBoundedBuffer(maximumGitErrorBytes)
	command := exec.CommandContext( //#nosec G204 -- fixed git binary with validated revisions and double-dash separator
		diffContext,
		gitExecutable,
		"-C", root,
		"diff", "--no-ext-diff", "--no-textconv", "--find-renames", "--find-copies-harder",
		"--raw", "--no-abbrev", "-z", baseRevision+"..."+headRevision, "--",
	)
	command.Env = boundedexec.GitEnvironment()
	command.Stdout = standardOutput
	command.Stderr = standardError
	command.WaitDelay = time.Second
	if err := command.Run(); err != nil {
		return nil, false, fmt.Errorf("run bounded Git diff: %w", err)
	}
	return parseRawDiff(standardOutput.Bytes())
}

func parseRawDiff(body []byte) ([]string, bool, error) {
	if len(body) == 0 {
		return []string{}, false, nil
	}
	if body[len(body)-1] != 0 {
		return nil, false, errors.New("Git raw diff output is truncated")
	}
	tokens := bytes.Split(body[:len(body)-1], []byte{0})
	paths := make(map[string]struct{})
	requiresFull := false
	for index := 0; index < len(tokens); {
		oldMode, newMode, status, err := parseRawHeader(string(tokens[index]))
		index++
		if err != nil {
			return nil, false, errors.New("Git raw diff output is malformed")
		}
		pathCount, identityChange, err := statusPathCount(status)
		if err != nil || index+pathCount > len(tokens) {
			return nil, false, errors.New("Git raw diff output is malformed")
		}
		requiresFull = requiresFull || identityChange || !regularFileTransition(status, oldMode, newMode)
		for offset := 0; offset < pathCount; offset++ {
			changedPath := string(tokens[index+offset])
			if !validChangedPath(changedPath) {
				return nil, false, errors.New("Git diff contains an unsafe path")
			}
			paths[changedPath] = struct{}{}
			// Removing renderer authority is not a presentation-only edit.
			requiresFull = requiresFull || (status == "D" && isRendererPresentation(changedPath))
			if len(paths) > maximumChanges {
				return nil, false, errors.New("Git diff exceeds the changed-path limit")
			}
		}
		index += pathCount
	}
	result := slices.Sorted(maps.Keys(paths))
	return result, requiresFull, nil
}

func parseRawHeader(header string) (string, string, string, error) {
	fields := strings.Fields(header)
	if len(fields) != 5 || strings.Join(fields, " ") != header ||
		len(fields[0]) != 7 || fields[0][0] != ':' {
		return "", "", "", errors.New("raw diff header shape is invalid")
	}
	oldMode := fields[0][1:]
	newMode := fields[1]
	if !modePattern.MatchString(oldMode) || !modePattern.MatchString(newMode) ||
		!objectIDPattern.MatchString(fields[2]) || !objectIDPattern.MatchString(fields[3]) ||
		len(fields[2]) != len(fields[3]) ||
		!modeMatchesObjectIdentity(oldMode, fields[2]) ||
		!modeMatchesObjectIdentity(newMode, fields[3]) {
		return "", "", "", errors.New("raw diff header identity is invalid")
	}
	return oldMode, newMode, fields[4], nil
}

func modeMatchesObjectIdentity(mode, objectID string) bool {
	zeroObjectID := strings.Trim(objectID, "0") == ""
	return (mode == "000000") == zeroObjectID
}

func regularFileTransition(status, oldMode, newMode string) bool {
	isRegular := func(mode string) bool {
		return mode == "100644" || mode == "100755"
	}
	switch status {
	case "A":
		return oldMode == "000000" && isRegular(newMode)
	case "M":
		return isRegular(oldMode) && isRegular(newMode)
	case "D":
		return isRegular(oldMode) && newMode == "000000"
	default:
		return false
	}
}

func statusPathCount(status string) (int, bool, error) {
	if status == "A" || status == "M" {
		return 1, false, nil
	}
	if status == "D" {
		return 1, false, nil
	}
	if status == "T" {
		return 1, true, nil
	}
	if scorePattern.MatchString(status) {
		score, err := strconv.Atoi(status[1:])
		if err != nil || score > 100 {
			return 0, false, fmt.Errorf("unsupported Git status %q", status)
		}
		return 2, true, nil
	}
	return 0, false, fmt.Errorf("unsupported Git status %q", status)
}

type boundedBuffer struct {
	buffer bytes.Buffer
	limit  int
}

func newBoundedBuffer(limit int) *boundedBuffer {
	return &boundedBuffer{limit: limit}
}

func (buffer *boundedBuffer) Write(body []byte) (int, error) {
	remaining := buffer.limit - buffer.buffer.Len()
	if remaining <= 0 {
		return 0, errors.New("subprocess output limit exceeded")
	}
	if len(body) > remaining {
		written, _ := buffer.buffer.Write(body[:remaining])
		return written, io.ErrShortWrite
	}
	return buffer.buffer.Write(body)
}

func (buffer *boundedBuffer) Bytes() []byte {
	return buffer.buffer.Bytes()
}
