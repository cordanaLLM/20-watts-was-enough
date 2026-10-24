package workstationrunner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestMain(testingMain *testing.M) {
	if len(os.Args) >= 2 && os.Args[1] == "--test" {
		if err := runFrozenNodeHelper(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(23)
		}
		os.Exit(0)
	}
	if len(os.Args) == 3 && os.Args[1] == "workstation-grandchild" {
		time.Sleep(400 * time.Millisecond)
		if err := os.WriteFile(os.Args[2], []byte("survived\n"), 0o600); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(20)
		}
		os.Exit(0)
	}
	if len(os.Args) == 3 && os.Args[1] == "workstation-orphan-grandchild" {
		// A race-instrumented parent sleeps for about one second during exit.
		// Keep this descendant alive beyond that delay so post-wait cleanup,
		// rather than the helper's natural exit, determines the outcome.
		time.Sleep(2 * time.Second)
		if err := os.WriteFile(os.Args[2], []byte("survived\n"), 0o600); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(25)
		}
		os.Exit(0)
	}
	if len(os.Args) == 3 && os.Args[1] == "run" && strings.HasPrefix(os.Args[2], "test:workstation:") {
		runHelper(os.Args[2])
		os.Exit(0)
	}
	os.Exit(testingMain.Run())
}

func runHelper(script string) {
	switch {
	case strings.Contains(script, "tree"):
		grandchild := exec.Command(
			os.Args[0],
			"workstation-grandchild",
			filepath.Join(".", "grandchild.survived"),
		)
		grandchild.Stdout = os.Stdout
		grandchild.Stderr = os.Stderr
		if err := grandchild.Start(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(21)
		}
		if err := os.WriteFile("grandchild.ready", []byte("ready\n"), 0o600); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(22)
		}
		time.Sleep(time.Hour)
	case strings.Contains(script, "orphan"):
		grandchild := exec.Command(
			os.Args[0],
			"workstation-orphan-grandchild",
			filepath.Join(".", "grandchild.survived"),
		)
		grandchild.Stdout = os.Stdout
		grandchild.Stderr = os.Stderr
		if err := grandchild.Start(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(24)
		}
		return
	case strings.Contains(script, "environment"):
		fmt.Printf(
			"secret=%q node_options=%q path=%q\n",
			os.Getenv("WORKSTATION_RUNNER_SECRET"),
			os.Getenv("NODE_OPTIONS"),
			os.Getenv("PATH"),
		)
		os.Exit(17)
	case strings.Contains(script, "overflow"):
		fmt.Print(strings.Repeat("x", 4096))
	case strings.Contains(script, "block"):
		time.Sleep(time.Hour)
	case strings.Contains(script, "fail"):
		fmt.Printf("failure from %s\n", script)
		os.Exit(17)
	case strings.Contains(script, "gate"):
		marker := strings.NewReplacer(":", "-", "/", "-").Replace(script) + ".ready"
		if err := os.WriteFile(marker, []byte("ready\n"), 0o600); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(18)
		}
		const maximumGateReleasePolls = 6000 // 30 s at 5 ms per poll
		released := false
		for poll := 0; poll < maximumGateReleasePolls && !released; poll++ {
			if _, err := os.Lstat("release"); err == nil {
				released = true
			} else if !os.IsNotExist(err) {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(19)
			} else {
				time.Sleep(5 * time.Millisecond)
			}
		}
		if !released {
			fmt.Fprintln(os.Stderr, "gate was not released within 30 s")
			os.Exit(26)
		}
	case strings.Contains(script, "slow"):
		time.Sleep(40 * time.Millisecond)
	}
	fmt.Printf("completed %s\n", script)
}

func TestProductionJobsUseTheCompleteClosedCatalogue(t *testing.T) {
	t.Parallel()
	jobs, err := productionJobs()
	if err != nil {
		t.Fatal(err)
	}
	if len(jobs) != expectedArtifactJobs+1 {
		t.Fatalf("productionJobs() returned %d jobs, want %d", len(jobs), expectedArtifactJobs+1)
	}
	if jobs[0].artifact != "core" || jobs[0].script != "test:workstation:core" || jobs[0].arguments != nil {
		t.Fatalf("first production job = %#v, want core", jobs[0])
	}
	for index, current := range jobs[1:] {
		if current.artifact == "" || current.script == "" {
			t.Fatalf("production job %d is incomplete: %#v", index+1, current)
		}
	}

	root := filepath.Clean(filepath.Join("..", "..", ".."))
	body, err := os.ReadFile(filepath.Join(root, "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(body, &manifest); err != nil {
		t.Fatal(err)
	}
	if got := manifest.Scripts["test:workstation"]; got != "go -C tooling run ./cmd/20w ci run-workstation --root .." {
		t.Fatalf("test:workstation = %q, want bounded Go runner", got)
	}
	for _, current := range jobs {
		if manifest.Scripts[current.script] == "" {
			t.Fatalf("package.json has no command for %s", current.script)
		}
	}
}

func TestRunRejectsMissingPublicBoundaries(t *testing.T) {
	t.Parallel()
	if err := Run(nil, ".", &bytes.Buffer{}); err == nil || !strings.Contains(err.Error(), "requires a context") {
		t.Fatalf("Run(nil context) error = %v", err)
	}
	if err := Run(context.Background(), ".", nil); err == nil || !strings.Contains(err.Error(), "summary writer") {
		t.Fatalf("Run(nil writer) error = %v", err)
	}
}

func TestRunSuiteCollectsEveryFailureAndOrdersTheSummary(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	options := helperOptions(t, 2)
	jobs := []job{
		helperJob("slow-first", "test:workstation:slow-first"),
		helperJob("fail-second", "test:workstation:fail-second"),
		helperJob("fail-third", "test:workstation:fail-third"),
		helperJob("pass-fourth", "test:workstation:pass-fourth"),
	}
	var summary bytes.Buffer
	err := runSuite(context.Background(), root, jobs, options, &summary)
	if err == nil || !strings.Contains(err.Error(), "2 failed, 0 cancelled out of 4 jobs") {
		t.Fatalf("runSuite() error = %v, want complete failure count", err)
	}
	lines := strings.Split(summary.String(), "\n")
	wantPrefixes := []string{
		"Workstation suite: running 4 jobs with at most 2 concurrent commands; timeout 5s and combined output limit 16384 bytes per job.",
		"PASS slow-first (test:workstation:slow-first)",
		"FAIL fail-second (test:workstation:fail-second): exit status 17",
		"--- fail-second output ---",
		"failure from test:workstation:fail-second",
		"--- end fail-second output ---",
		"FAIL fail-third (test:workstation:fail-third): exit status 17",
		"--- fail-third output ---",
		"failure from test:workstation:fail-third",
		"--- end fail-third output ---",
		"PASS pass-fourth (test:workstation:pass-fourth)",
		"Workstation suite: 2 passed, 2 failed, 0 cancelled.",
	}
	if !reflect.DeepEqual(lines[:len(wantPrefixes)], wantPrefixes) {
		t.Fatalf("ordered summary =\n%s\nwant prefixes = %#v", summary.String(), wantPrefixes)
	}
}

func TestRunSuiteCapsConcurrentCommands(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	options := helperOptions(t, 2)
	jobs := []job{
		helperJob("gate-one", "test:workstation:gate-one"),
		helperJob("gate-two", "test:workstation:gate-two"),
		helperJob("gate-three", "test:workstation:gate-three"),
	}
	done := make(chan error, 1)
	go func() {
		done <- runSuite(context.Background(), root, jobs, options, &bytes.Buffer{})
	}()
	waitForMarkerCount(t, root, 2)
	if got := markerCount(t, root); got != 2 {
		t.Fatalf("active command markers = %d, want exactly 2 before release", got)
	}
	if err := os.WriteFile(filepath.Join(root, "release"), []byte("release\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("bounded concurrent suite did not finish")
	}
	if got := markerCount(t, root); got != len(jobs) {
		t.Fatalf("completed command markers = %d, want %d", got, len(jobs))
	}
}

func TestRunSuiteRejectsConcurrencyAboveEight(t *testing.T) {
	t.Parallel()
	options := helperOptions(t, maximumConcurrency+1)
	err := runSuite(context.Background(), repositoryFixture(t), []job{
		helperJob("one", "test:workstation:one"),
	}, options, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "outside 1..8") {
		t.Fatalf("runSuite() error = %v, want concurrency rejection", err)
	}
}

func TestLocalAggregateDefaultsToFourWithinEightHardLimit(t *testing.T) {
	t.Parallel()
	if defaultConcurrency != 4 {
		t.Fatalf("defaultConcurrency = %d, want 4", defaultConcurrency)
	}
	if maximumConcurrency != 8 {
		t.Fatalf("maximumConcurrency = %d, want 8", maximumConcurrency)
	}
	if defaultConcurrency >= maximumConcurrency {
		t.Fatalf(
			"default concurrency %d must stay below hard limit %d",
			defaultConcurrency,
			maximumConcurrency,
		)
	}
}

func TestRunSuiteRejectsInvalidBoundsAndDuplicateJobs(t *testing.T) {
	t.Parallel()
	valid := helperOptions(t, 1)
	for name, testCase := range map[string]struct {
		jobs    []job
		options runOptions
	}{
		"empty jobs": {
			jobs:    nil,
			options: valid,
		},
		"too many jobs": {
			jobs:    makeUniqueJobs(maximumSuiteJobs + 1),
			options: valid,
		},
		"duplicate artifact": {
			jobs: []job{
				helperJob("same", "test:workstation:one"),
				helperJob("same", "test:workstation:two"),
			},
			options: valid,
		},
		"duplicate script": {
			jobs: []job{
				helperJob("one", "test:workstation:same"),
				helperJob("two", "test:workstation:same"),
			},
			options: valid,
		},
		"missing frozen arguments": {
			jobs:    []job{{artifact: "one", script: "test:workstation:one"}},
			options: valid,
		},
		"long timeout": {
			jobs:    []job{helperJob("one", "test:workstation:one")},
			options: withJobDuration(valid, maximumJobDuration+time.Nanosecond),
		},
		"large output": {
			jobs:    []job{helperJob("one", "test:workstation:one")},
			options: withOutputBytes(valid, maximumJobOutputBytes+1),
		},
	} {
		name, testCase := name, testCase
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if err := runSuite(
				context.Background(),
				repositoryFixture(t),
				testCase.jobs,
				testCase.options,
				&bytes.Buffer{},
			); err == nil {
				t.Fatal("runSuite() accepted an invalid execution boundary")
			}
		})
	}
}

func TestRunSuiteEnforcesPerJobTimeout(t *testing.T) {
	t.Parallel()
	options := helperOptions(t, 1)
	options.jobDuration = 50 * time.Millisecond
	var summary bytes.Buffer
	started := time.Now()
	err := runSuite(context.Background(), repositoryFixture(t), []job{
		helperJob("block", "test:workstation:block"),
	}, options, &summary)
	if err == nil || !strings.Contains(summary.String(), "exceeded 50ms timeout") {
		t.Fatalf("runSuite() error/summary = %v/%q, want timeout failure", err, summary.String())
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("timed-out command returned after %s", elapsed)
	}
}

func TestRunSuiteCancelsInflightAndUnscheduledJobs(t *testing.T) {
	t.Parallel()
	options := helperOptions(t, 1)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	time.AfterFunc(50*time.Millisecond, cancel)
	var summary bytes.Buffer
	err := runSuite(ctx, repositoryFixture(t), []job{
		helperJob("block", "test:workstation:block"),
		helperJob("later", "test:workstation:later"),
	}, options, &summary)
	if err == nil || strings.Count(summary.String(), "CANCELLED ") != 2 {
		t.Fatalf("runSuite() error/summary = %v/%q, want two cancellations", err, summary.String())
	}
}

func TestRunSuiteCancellationTerminatesTheDescendantProcessTree(t *testing.T) {
	root := repositoryFixture(t)
	options := helperOptions(t, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var summary bytes.Buffer
	done := make(chan error, 1)
	go func() {
		done <- runSuite(ctx, root, []job{
			helperJob("tree", "test:workstation:tree"),
		}, options, &summary)
	}()
	waitForPath(t, filepath.Join(root, "grandchild.ready"))
	cancel()
	select {
	case err := <-done:
		if err == nil || !strings.Contains(summary.String(), "CANCELLED tree") {
			t.Fatalf("runSuite() error/summary = %v/%q, want tree cancellation", err, summary.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("process-tree cancellation did not return")
	}
	time.Sleep(800 * time.Millisecond)
	if _, err := os.Lstat(filepath.Join(root, "grandchild.survived")); !os.IsNotExist(err) {
		t.Fatalf("cancelled descendant survived: %v", err)
	}
}

func TestRunSuiteCleansDescendantsAfterTheirParentExitsFirst(t *testing.T) {
	root := repositoryFixture(t)
	options := helperOptions(t, 1)
	options.waitDelay = 100 * time.Millisecond
	var summary bytes.Buffer
	err := runSuite(t.Context(), root, []job{
		helperJob("orphan", "test:workstation:orphan"),
	}, options, &summary)
	if err == nil || !strings.Contains(summary.String(), "FAIL orphan") {
		t.Fatalf("runSuite() error/summary = %v/%q, want leaked-pipe failure", err, summary.String())
	}
	time.Sleep(2200 * time.Millisecond)
	if _, err := os.Lstat(filepath.Join(root, "grandchild.survived")); !os.IsNotExist(err) {
		t.Fatalf("parent-exit descendant survived cleanup: %v", err)
	}
}

func TestRunSuiteBoundsCombinedOutputAndFailsTheJob(t *testing.T) {
	t.Parallel()
	options := helperOptions(t, 1)
	options.outputBytes = 128
	jobs := []job{helperJob("overflow", "test:workstation:overflow")}
	results := executeJobs(context.Background(), repositoryFixture(t), jobs, options)
	if len(results) != 1 || results[0].status != statusFailed || !results[0].exceeded {
		t.Fatalf("executeJobs() = %#v, want output-limit failure", results)
	}
	if len(results[0].output) != options.outputBytes || !strings.Contains(results[0].detail, "exceeded 128 bytes") {
		t.Fatalf("bounded output = %d bytes / %q", len(results[0].output), results[0].detail)
	}
}

func TestRunSuiteFiltersAmbientEnvironmentBeforeExecution(t *testing.T) {
	t.Parallel()
	options := helperOptions(t, 1)
	options.environment = append(options.environment,
		"WORKSTATION_RUNNER_SECRET=do-not-pass",
		"NODE_OPTIONS=--import=/tmp/hostile.mjs",
	)
	var summary bytes.Buffer
	err := runSuite(context.Background(), repositoryFixture(t), []job{
		helperJob("environment", "test:workstation:environment"),
	}, options, &summary)
	if err == nil {
		t.Fatal("environment helper unexpectedly passed")
	}
	if strings.Contains(summary.String(), "do-not-pass") || strings.Contains(summary.String(), "hostile.mjs") {
		t.Fatalf("filtered secrets reached the child: %q", summary.String())
	}
	if !strings.Contains(summary.String(), `secret="" node_options="" path="`) {
		t.Fatalf("environment helper did not report the closed environment: %q", summary.String())
	}
}

func TestFilteredEnvironmentIsClosedBoundedAndSorted(t *testing.T) {
	t.Parallel()
	filtered, err := filteredEnvironment([]string{
		"=C:=C:\\workspace",
		"WORKSTATION_RUNNER_SECRET=do-not-pass",
		"TZ=Europe/Berlin",
		"PATH=/usr/bin",
		"HOME=/tmp/home",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"HOME=/tmp/home", "PATH=/usr/bin", "TZ=Europe/Berlin"}
	if !reflect.DeepEqual(filtered, want) {
		t.Fatalf("filteredEnvironment() = %q, want %q", filtered, want)
	}
	if !slices.IsSorted(filtered) {
		t.Fatalf("filtered environment is not sorted: %q", filtered)
	}

	for name, environment := range map[string][]string{
		"missing path": {"HOME=/tmp"},
		"duplicate":    {"PATH=/usr/bin", "Path=/bin"},
		"oversized":    {"PATH=/usr/bin", "HOME=" + strings.Repeat("x", maximumEnvironmentValueBytes+1)},
		"nul":          {"PATH=/usr/bin\x00hostile"},
		"oversized total": {
			"PATH=/usr/bin",
			"HOME=" + strings.Repeat("x", maximumEnvironmentValueBytes),
			"TEMP=" + strings.Repeat("x", maximumEnvironmentValueBytes),
			"TMP=" + strings.Repeat("x", maximumEnvironmentValueBytes),
			"TMPDIR=" + strings.Repeat("x", maximumEnvironmentValueBytes),
			"APPDATA=" + strings.Repeat("x", maximumEnvironmentValueBytes),
			"LOCALAPPDATA=" + strings.Repeat("x", maximumEnvironmentValueBytes),
			"USERPROFILE=" + strings.Repeat("x", maximumEnvironmentValueBytes),
			"XDG_CACHE_HOME=" + strings.Repeat("x", maximumEnvironmentValueBytes),
		},
		"malformed": {"PATH=/usr/bin", "BROKEN"},
	} {
		name, environment := name, environment
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := filteredEnvironment(environment); err == nil {
				t.Fatalf("filteredEnvironment(%q) succeeded", environment)
			}
		})
	}
}

func TestResolveRepositoryRootRejectsPackageAndPathSymlinks(t *testing.T) {
	t.Parallel()
	realRoot := repositoryFixture(t)
	packagePath := filepath.Join(realRoot, "package.json")
	if err := os.Remove(packagePath); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join("nested", "package.json"), packagePath); err != nil {
		t.Fatal(err)
	}
	if _, err := resolveRepositoryRoot(realRoot); err == nil {
		t.Fatal("resolveRepositoryRoot() accepted a package.json symlink")
	}

	parent := t.TempDir()
	linkedRoot := filepath.Join(parent, "repository")
	if err := os.Symlink(realRoot, linkedRoot); err != nil {
		t.Fatal(err)
	}
	if _, err := resolveRepositoryRoot(linkedRoot); err == nil || !strings.Contains(err.Error(), "must not traverse symlinks") {
		t.Fatalf("resolveRepositoryRoot() error = %v, want root-symlink rejection", err)
	}
}

func TestRunSuiteReturnsSummaryWriterFailure(t *testing.T) {
	t.Parallel()
	err := runSuite(context.Background(), repositoryFixture(t), []job{
		helperJob("pass", "test:workstation:pass"),
	}, helperOptions(t, 1), failingWriter{})
	if err == nil || !strings.Contains(err.Error(), "write workstation") {
		t.Fatalf("runSuite() error = %v, want writer failure", err)
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) {
	return 0, errors.New("closed")
}

func makeUniqueJobs(count int) []job {
	jobs := make([]job, count)
	for index := range count {
		jobs[index] = job{
			artifact:  fmt.Sprintf("job-%d", index),
			script:    fmt.Sprintf("test:workstation:job-%d", index),
			arguments: []string{"run", fmt.Sprintf("test:workstation:job-%d", index)},
		}
	}
	return jobs
}

func helperJob(artifact, script string) job {
	return job{artifact: artifact, script: script, arguments: []string{"run", script}}
}

func withJobDuration(options runOptions, duration time.Duration) runOptions {
	options.jobDuration = duration
	return options
}

func withOutputBytes(options runOptions, outputBytes int) runOptions {
	options.outputBytes = outputBytes
	return options
}

func helperOptions(t *testing.T, concurrency int) runOptions {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return runOptions{
		concurrency: concurrency,
		jobDuration: 5 * time.Second,
		outputBytes: 16 << 10,
		waitDelay:   100 * time.Millisecond,
		executable:  executable,
		environment: []string{"PATH=" + os.Getenv("PATH")},
	}
}

func repositoryFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "package.json"), []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return root
}

func waitForMarkerCount(t *testing.T, root string, want int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if markerCount(t, root) == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("did not observe %d concurrent command markers", want)
}

func waitForPath(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Lstat(path); err == nil {
			return
		} else if !os.IsNotExist(err) {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("did not observe %s", path)
}

func markerCount(t *testing.T, root string) int {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(root, "*.ready"))
	if err != nil {
		t.Fatal(err)
	}
	return len(matches)
}
