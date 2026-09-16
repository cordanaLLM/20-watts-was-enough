// Package clrscontext prepares an offline candidate build context from existing
// CLRS authorities. It neither builds an image nor changes admission state.
package clrscontext

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

const maximumContextBytes int64 = 2 << 30
const maximumManifestBytes = 1 << 20

// Options names retained inputs explicitly; no input is acquired implicitly.
type Options struct {
	RepositoryRoot, Wheelhouse, SourceArchive, PromiseSourceRoot, PromiseEvidence, Output string
}

// Result identifies candidate bytes, not an admitted image or scientific result.
type Result struct {
	SHA256    string
	SizeBytes int64
	Files     int
}

type identity struct {
	Path      string `json:"path"`
	SHA256    string `json:"sha256"`
	SizeBytes int64  `json:"size_bytes"`
	Mode      int64  `json:"mode"`
}

type member struct {
	identity
	body  []byte
	input string
}

type plan struct {
	members    []member
	epoch      int64
	foundation clrsfixture.GeneratorImageFoundation
}

// Prepare writes one new tar or verifies an existing tar against the same
// explicit inputs. A five-minute cooperative deadline bounds streaming work.
func Prepare(parent context.Context, options Options, check bool) (Result, error) {
	ctx, cancel := context.WithTimeout(parent, 5*time.Minute)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	if err := validateOptions(options); err != nil {
		return Result{}, err
	}
	p, err := preparePlan(ctx, options)
	if err != nil {
		return Result{}, err
	}
	if check {
		result, err := checkContext(ctx, options.Output, p)
		if err != nil {
			return Result{}, err
		}
		return result, recheckInputs(ctx, options, p)
	}
	return publishContext(ctx, options.Output, p, func() error {
		return recheckInputs(ctx, options, p)
	})
}

func recheckInputs(ctx context.Context, o Options, p plan) error {
	current, err := clrsfixture.CheckGeneratorImageFoundation(o.RepositoryRoot)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(current, p.foundation) {
		return errors.New("CLRS authority changed during context materialisation")
	}
	if _, err := clrsfixture.VerifyGeneratorWheelhouse(o.RepositoryRoot, o.Wheelhouse); err != nil {
		return err
	}
	if err := clrsfixture.CheckPromiseWheelReproduction(o.PromiseSourceRoot, o.PromiseEvidence); err != nil {
		return err
	}
	for _, m := range p.members {
		var file string
		switch {
		case strings.HasPrefix(m.Path, "evidence/authority/"):
			file = filepath.Join(o.RepositoryRoot, "tooling/clrs-generator", strings.TrimPrefix(m.Path, "evidence/authority/"))
		case strings.HasPrefix(m.Path, "evidence/promise/"):
			file = filepath.Join(o.PromiseEvidence, strings.TrimPrefix(m.Path, "evidence/promise/"))
		default:
			continue
		}
		body, err := readStable(ctx, file, 16<<20)
		if err != nil {
			return err
		}
		if !bytes.Equal(body, m.body) {
			return errors.New("CLRS context authority or Promise evidence changed during materialisation")
		}
	}
	return ctx.Err()
}

func validateOptions(o Options) error {
	for _, field := range []struct{ name, value string }{{"root", o.RepositoryRoot}, {"wheelhouse", o.Wheelhouse}, {"source archive", o.SourceArchive}, {"Promise source root", o.PromiseSourceRoot}, {"Promise evidence", o.PromiseEvidence}, {"output", o.Output}} {
		if field.value == "" {
			return fmt.Errorf("CLRS context %s is required", field.name)
		}
	}
	output, err := filepath.Abs(o.Output)
	if err != nil {
		return err
	}
	for _, directory := range []string{o.Wheelhouse, o.PromiseEvidence, o.PromiseSourceRoot} {
		root, err := realDirectory(directory)
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, output)
		if err != nil {
			return err
		}
		if rel == "." || (rel != ".." && !bytes.HasPrefix([]byte(rel), []byte(".."+string(filepath.Separator)))) {
			return errors.New("CLRS context output must be outside retained wheelhouse, Promise evidence and frozen source")
		}
	}
	root, err := filepath.Abs(o.RepositoryRoot)
	if err != nil {
		return err
	}
	if output == filepath.Join(root, "tooling/clrs-generator/Dockerfile") {
		return errors.New("candidate context must not create the deliberately absent authority Dockerfile")
	}
	return nil
}

func preparePlan(ctx context.Context, o Options) (plan, error) {
	p := plan{}
	current, err := clrsfixture.CheckGeneratorImageFoundation(o.RepositoryRoot)
	if err != nil {
		return p, err
	}
	frozen, err := clrsfixture.CheckGeneratorImageFoundation(o.PromiseSourceRoot)
	if err != nil {
		return p, err
	}
	if !reflect.DeepEqual(current, frozen) {
		return p, errors.New("frozen Promise source foundation differs from current CLRS authority")
	}
	p.foundation = current
	wheels, err := clrsfixture.VerifyGeneratorWheelhouse(o.RepositoryRoot, o.Wheelhouse)
	if err != nil {
		return p, err
	}
	p.epoch = wheels.SourceDateEpoch
	source, input, image, authority, err := loadAuthority(ctx, o.RepositoryRoot)
	if err != nil {
		return p, err
	}
	p.members = authority
	archive, err := readStable(ctx, o.SourceArchive, input.SourceContext.ArchiveSizeBytes)
	if err != nil {
		return p, err
	}
	entries, err := sourceEntries(archive, input.SourceContext, source)
	if err != nil {
		return p, err
	}
	for _, entry := range entries {
		p.members = append(p.members, dataMember(entry.Name, entry.Data, entry.Mode))
	}
	proof, err := promiseMembers(ctx, o)
	if err != nil {
		return p, err
	}
	p.members = append(p.members, proof...)
	for _, wheel := range wheels.Artifacts {
		p.members = append(p.members, member{identity: identity{"wheels/" + wheel.Filename, wheel.SHA256, wheel.SizeBytes, 0o644}, input: filepath.Join(o.Wheelhouse, wheel.Filename)})
	}
	p.members = append(p.members, dataMember("requirements.txt", requirements(wheels), 0o644), dataMember("Dockerfile", dockerfile(input, image), 0o644))
	if err := addManifest(&p, input); err != nil {
		return p, err
	}
	if err := ctx.Err(); err != nil {
		return p, err
	}
	return p, nil
}

func loadAuthority(ctx context.Context, root string) (clrsfixture.SourceRecord, clrsfixture.GeneratorLockInput, clrsfixture.GeneratorImageContract, []member, error) {
	var source clrsfixture.SourceRecord
	var input clrsfixture.GeneratorLockInput
	var image clrsfixture.GeneratorImageContract
	var members []member
	bodies := make(map[string][]byte)
	for _, name := range []string{"upstream.json", "contract.json", "lock-input.json", "image-contract.json", "pyproject.toml", "uv.lock", "wheelhouse.json"} {
		body, err := readStable(ctx, filepath.Join(root, "tooling/clrs-generator", name), 16<<20)
		if err != nil {
			return source, input, image, nil, err
		}
		bodies[name] = body
		members = append(members, dataMember("evidence/authority/"+name, body, 0o644))
	}
	source, err := clrsfixture.ParseSourceRecord(bodies["upstream.json"])
	if err != nil {
		return source, input, image, nil, err
	}
	input, err = clrsfixture.ParseGeneratorLockInput(bodies["lock-input.json"], source)
	if err != nil {
		return source, input, image, nil, err
	}
	generation, err := clrsfixture.ParseGenerationContract(bodies["contract.json"], source)
	if err != nil {
		return source, input, image, nil, err
	}
	image, err = clrsfixture.ParseGeneratorImageContract(bodies["image-contract.json"], bodies["lock-input.json"], source, generation)
	return source, input, image, members, err
}

func promiseMembers(ctx context.Context, o Options) ([]member, error) {
	var members []member
	for _, name := range []string{"receipt.json", "run-1/commands.json", "run-2/commands.json"} {
		body, err := readStable(ctx, filepath.Join(o.PromiseEvidence, name), 2<<20)
		if err != nil {
			return nil, err
		}
		members = append(members, dataMember("evidence/promise/"+name, body, 0o644))
	}
	if err := clrsfixture.CheckPromiseWheelReproduction(o.PromiseSourceRoot, o.PromiseEvidence); err != nil {
		return nil, err
	}
	for _, m := range members {
		name := m.Path[len("evidence/promise/"):]
		body, err := readStable(ctx, filepath.Join(o.PromiseEvidence, name), 2<<20)
		if err != nil {
			return nil, err
		}
		if !bytes.Equal(body, m.body) {
			return nil, errors.New("Promise evidence changed during verification")
		}
	}
	return members, nil
}

func addManifest(p *plan, input clrsfixture.GeneratorLockInput) error {
	sort.Slice(p.members, func(i, j int) bool { return p.members[i].Path < p.members[j].Path })
	ids := make([]identity, 0, len(p.members))
	for i, m := range p.members {
		if i > 0 && p.members[i-1].Path == m.Path {
			return errors.New("duplicate CLRS context member")
		}
		ids = append(ids, m.identity)
	}
	manifest := struct {
		Schema    int                                `json:"schema_version"`
		Authority string                             `json:"authority"`
		State     string                             `json:"state"`
		Procedure string                             `json:"procedure"`
		Source    clrsfixture.GeneratorSourceContext `json:"source_archive"`
		Platform  string                             `json:"platform"`
		BaseImage string                             `json:"base_image"`
		Epoch     int64                              `json:"source_date_epoch"`
		Members   []identity                         `json:"members"`
	}{1, clrsfixture.ResultAuthority, "candidate-only", "clrs-offline-context-v1", input.SourceContext, input.Platform, input.Python.BaseImage, p.epoch, ids}
	body, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	body = append(body, '\n')
	if len(body) > maximumManifestBytes {
		return errors.New("CLRS context manifest exceeds 1 MiB")
	}
	p.members = append(p.members, dataMember("context-manifest.json", body, 0o644))
	sort.Slice(p.members, func(i, j int) bool { return p.members[i].Path < p.members[j].Path })
	return nil
}

func dataMember(name string, body []byte, mode int64) member {
	return member{identity: identity{name, hashBytes(body), int64(len(body)), mode}, body: body}
}
