package clrsfixture

import (
	"errors"
	"fmt"
	"maps"
	"net/url"
	"regexp"
	"slices"
	"time"
)

const (
	maximumGeneratorLockInputBytes = 16 << 10
	maximumGeneratorPackageCutoffs = 8
	lockedSourceArchiveSHA256      = "754ef8fbaaec647b7bfdcc88ccbb21653dfff25b05bd7df30658f2253ebcf796"
	lockedSourceArchiveBytes       = 5_347_008
)

var lockedUpstreamConstraints = []string{
	"absl-py>=2.1.0",
	"attrs>=24.2.0",
	"chex>=0.1.86",
	"dm-haiku>=0.0.12",
	"jax>=0.4.31",
	"jaxlib>=0.4.31",
	"ml_collections>=0.1.1",
	"numpy>=1.26.4",
	"opt-einsum>=3.3.0",
	"optax>=0.2.3",
	"six>=1.16.0",
	"tensorflow>=2.17.0",
	"tfds-nightly>=4.9.6.dev202409060044",
	"toolz>=0.12.1",
}

var lockedWheelCandidates = []GeneratorWheel{
	{
		Name: "jax", Version: "0.11.1", Requirement: "jax==0.11.1", RequiresPython: ">=3.12",
		Filename: "jax-0.11.1-py3-none-any.whl",
		URL:      "https://files.pythonhosted.org/packages/8f/f4/5f9a286e1eeca9faa8b83885edccf63ab2f1b22e17f6a5ea66ac86b1afe4/jax-0.11.1-py3-none-any.whl",
		SHA256:   "72ed60bf85a0b53d0f5b5cd61e37a8b25f369f6f88481feb98ab489894861a82", SizeBytes: 3_302_513,
	},
	{
		Name: "jaxlib", Version: "0.11.1", Requirement: "jaxlib==0.11.1", RequiresPython: ">=3.12",
		Filename: "jaxlib-0.11.1-cp313-cp313-manylinux_2_27_x86_64.whl",
		URL:      "https://files.pythonhosted.org/packages/f5/28/ef1371618e784880e68c2ab5277d5ccbaf518a2a5ec9ec05ef90a9ee7d1b/jaxlib-0.11.1-cp313-cp313-manylinux_2_27_x86_64.whl",
		SHA256:   "7ebe86a7b891fcda83e7f634a677d285681a7b80b3ec9ed435536078a8371acf", SizeBytes: 87_901_562,
	},
	{
		Name: "numpy", Version: "2.5.2", Requirement: "numpy==2.5.2", RequiresPython: ">=3.12",
		Filename: "numpy-2.5.2-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
		URL:      "https://files.pythonhosted.org/packages/7b/44/59a1eb68e773c4098d107ef34a0dbdeca501d72ffcfbff9a7707343921ce/numpy-2.5.2-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
		SHA256:   "29b86ff8a6cc556b47ec6b64b194815cc80e6bf5eedcc6cddfd65318cb0b4eee", SizeBytes: 16_709_995,
	},
	{
		Name: "tensorflow", Version: "2.21.0", Requirement: "tensorflow==2.21.0", RequiresPython: ">=3.10",
		Filename: "tensorflow-2.21.0-cp313-cp313-manylinux_2_27_x86_64.whl",
		URL:      "https://files.pythonhosted.org/packages/86/6c/10d075ffc09754c7f10e749ba3c9d46dd809fb007990c7f788128044180c/tensorflow-2.21.0-cp313-cp313-manylinux_2_27_x86_64.whl",
		SHA256:   "e9d8da8dcab9650efb45f032ba70af2f016f907e6e0c6bda29dd101bba945406", SizeBytes: 572_881_074,
	},
	{
		Name: "tqdm", Version: "4.70.0", Requirement: "tqdm==4.70.0", RequiresPython: ">=3.8",
		Filename: "tqdm-4.70.0-py3-none-any.whl",
		URL:      "https://files.pythonhosted.org/packages/f9/1c/01bfd571a64e7f270e6bab5e33777debe0edc56759233ce84f27dec92d14/tqdm-4.70.0-py3-none-any.whl",
		SHA256:   "7f585706bfddbdebf89daac705b2dfcc16890130727d3197ca62c732b4310953", SizeBytes: 80_184,
	},
}

// ParseGeneratorLockInput validates the exact candidate-only lock input.
func ParseGeneratorLockInput(body []byte, source SourceRecord) (GeneratorLockInput, error) {
	if len(body) == 0 || len(body) > maximumGeneratorLockInputBytes {
		return GeneratorLockInput{}, fmt.Errorf("CLRS generator lock input size = %d, want 1..%d", len(body), maximumGeneratorLockInputBytes)
	}
	var input GeneratorLockInput
	if err := decodeCanonicalGeneratorJSON(body, 7, &input); err != nil {
		return GeneratorLockInput{}, fmt.Errorf("parse CLRS generator lock input: %w", err)
	}
	if err := input.Validate(source); err != nil {
		return GeneratorLockInput{}, err
	}
	return input, nil
}

// Validate rejects source, interpreter, resolver, constraint or wheel drift.
func (input GeneratorLockInput) Validate(source SourceRecord) error {
	sourceID, err := source.Identity()
	if err != nil {
		return fmt.Errorf("validate generator lock source: %w", err)
	}
	if input.SchemaVersion != 1 || input.Authority != ResultAuthority || input.State != "candidate_only" ||
		input.Platform != "linux/amd64" || input.PackageIndex != "https://pypi.org/simple" {
		return errors.New("generator lock header is invalid")
	}
	if err := validateGeneratorSourceContext(input.SourceContext, source, sourceID); err != nil {
		return err
	}
	if err := validateGeneratorPythonAndResolver(input.Python, input.Resolver); err != nil {
		return err
	}
	if input.UpstreamRequirements.Path != source.Requirements.Path ||
		input.UpstreamRequirements.SHA256 != source.Requirements.SHA256 ||
		!slices.Equal(input.UpstreamRequirements.Constraints, lockedUpstreamConstraints) {
		return errors.New("generator upstream requirements differ from the pinned source")
	}
	if !slices.Equal(input.SelectedCandidates, lockedWheelCandidates) {
		return errors.New("generator high-impact wheel candidates differ from the reviewed registry observations")
	}
	for _, wheel := range input.SelectedCandidates {
		if err := validateGeneratorWheel(wheel); err != nil {
			return err
		}
	}
	wantSupplement := []SupplementalRequirement{
		{
			Requirement: "pip==26.2.2",
			Reason:      "replaces the base image's ensurepip pip whose vendored certifi carries PYSEC-2026-4320",
		},
		{
			Requirement: "tqdm==4.70.0",
			Reason:      "the pinned generator imports tqdm directly but the upstream requirements file does not name it",
		},
	}
	if !slices.Equal(input.SupplementalRequirements, wantSupplement) {
		return errors.New("generator supplemental requirement is invalid")
	}
	return nil
}

func validateGeneratorSourceContext(context GeneratorSourceContext, source SourceRecord, sourceID SourceID) error {
	wantArchiveURL := "https://codeload.github.com/google-deepmind/clrs/tar.gz/" + source.Commit
	wantRoot := "clrs-" + source.Commit
	if context.Repository != source.Repository || context.Commit != source.Commit || context.Tree != source.Tree ||
		context.SourceID != sourceID.String() || context.ArchiveURL != wantArchiveURL || context.ArchiveRoot != wantRoot ||
		context.ArchiveSHA256 != lockedSourceArchiveSHA256 || context.ArchiveSizeBytes != lockedSourceArchiveBytes {
		return errors.New("generator source archive does not match the pinned Git source")
	}
	parsed, err := url.Parse(context.ArchiveURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host != "codeload.github.com" || parsed.User != nil ||
		parsed.RawQuery != "" || parsed.Fragment != "" {
		return errors.New("generator source archive URL is invalid")
	}
	return nil
}

func validateGeneratorPythonAndResolver(python GeneratorPython, resolver GeneratorResolver) error {
	if _, err := generatorPackageCutoffs(resolver); err != nil {
		return err
	}
	wantPython := GeneratorPython{
		Version: "3.13.15", ABI: "cp313",
		BaseImage:              "docker.io/library/python:3.13.15-slim-bookworm@sha256:c45a22ea000adfd9cda29364bbe7edd23001ce5cc2ad15857cfbf7766943b9ca",
		PlatformManifestDigest: "sha256:b6bd71b0dd3811ddbcbc523ec2965fd1e1bcfdf7a20ab24679273d3bee726129",
		PythonSourceSHA256:     "1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76",
	}
	wantResolver := GeneratorResolver{
		Name: "uv", Version: "0.12.9",
		Image:      "ghcr.io/astral-sh/uv:0.12.9@sha256:8b940d3a9d65bed080436972241af2e21c84b5e8c9193f7014ed71479ee795ff",
		Revision:   "9f928602938ac5cf1cd6b294a725833c16f5720e",
		Resolution: "highest-compatible", Prerelease: "if-necessary", ExcludeNewer: "2026-08-31T13:22:50Z",
		ExcludeNewerPackage: map[string]string{
			"certifi": "2026-10-21T00:00:00Z",
			"pip":     "2026-10-21T00:00:00Z",
			"urllib3": "2026-09-16T00:00:00Z",
		},
	}
	if python != wantPython || resolver.Name != wantResolver.Name || resolver.Version != wantResolver.Version ||
		resolver.Image != wantResolver.Image || resolver.Revision != wantResolver.Revision ||
		resolver.Resolution != wantResolver.Resolution || resolver.Prerelease != wantResolver.Prerelease ||
		resolver.ExcludeNewer != wantResolver.ExcludeNewer ||
		!maps.Equal(resolver.ExcludeNewerPackage, wantResolver.ExcludeNewerPackage) {
		return errors.New("generator Python or uv candidate differs from the reviewed Linux amd64 boundary")
	}
	return nil
}

var generatorCanonicalPackageName = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func generatorPackageCutoffs(resolver GeneratorResolver) (map[string]time.Time, error) {
	global, err := time.Parse(time.RFC3339, resolver.ExcludeNewer)
	if err != nil {
		return nil, errors.New("generator dependency cutoff is invalid")
	}
	if len(resolver.ExcludeNewerPackage) > maximumGeneratorPackageCutoffs {
		return nil, fmt.Errorf("generator package cutoffs exceed %d entries", maximumGeneratorPackageCutoffs)
	}
	cutoffs := make(map[string]time.Time, len(resolver.ExcludeNewerPackage))
	for name, date := range resolver.ExcludeNewerPackage {
		if !generatorCanonicalPackageName.MatchString(name) {
			return nil, fmt.Errorf("generator package cutoff name %q is not canonical", name)
		}
		cutoff, err := time.Parse(time.RFC3339, date)
		if err != nil || !cutoff.After(global) {
			return nil, fmt.Errorf("generator package cutoff for %q must be RFC3339 and after the global cutoff", name)
		}
		cutoffs[name] = cutoff
	}
	return cutoffs, nil
}

func validateGeneratorWheel(wheel GeneratorWheel) error {
	parsed, err := url.Parse(wheel.URL)
	if err != nil || parsed.Scheme != "https" || parsed.Host != "files.pythonhosted.org" || parsed.User != nil ||
		parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path == "" {
		return fmt.Errorf("generator wheel %q has an invalid PyPI URL", wheel.Name)
	}
	if !lowerHex(wheel.SHA256, 64) || wheel.SizeBytes <= 0 || wheel.SizeBytes > 1<<30 {
		return fmt.Errorf("generator wheel %q has an invalid digest or size", wheel.Name)
	}
	return nil
}
