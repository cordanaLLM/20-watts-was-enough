import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ESLint } from "eslint";
import ts from "typescript";
import { parse } from "yaml";

import { createEslintConfig } from "../eslint.config.mjs";
import {
  activeExceptions,
  currentCalendarDay,
  engineFileExceptionFindings,
  isCalendarDay,
  LINT_EXCEPTIONS,
  lintExceptionOverrides,
  TYPE_CHECK_EXCEPTIONS,
} from "./lib/engine-file-exceptions.mjs";
import {
  validateOperationalFilePaths,
  validatePortableOperationsTree,
  validatePortableWorkflowObject,
} from "./lib/portable-operations.mjs";

import {
  engineManagedWorkflowPaths,
  formatFindings,
  generatedHookJobSkips,
  validateCiExperimentImageWorkflowObject,
  validateCiCodeShapeResetWorkflowObject,
  validateCiNativeReleaseWorkflowObject,
  validateCiFuzzingWorkflowObject,
  validateCiImpactWorkflowObject,
  validateCodeQlImpactWorkflowObject,
  validateCurrentResearchDisclosure,
  validateDependencyAuditWorkflowObject,
  validateEngineManagedWorkflowObject,
  validateExperimentReportIdentity,
  validateExperimentRunFailureForm,
  validateFundingConfig,
  validateGoCodeQlWorkflowObject,
  validateGoRuntimeWorkflowObject,
  validateIssueConfig,
  validateIssueForm,
  validateJavaScriptRuntimeWorkflowObject,
  validateLocalHookObject,
  validateRepositoryMetadataSyncWorkflowObject,
  validateNodeSetupWorkflowObject,
  validateNodeVersionFile,
  validateNpmRuntimeLock,
  validatePublicRepositoryRunnerWorkflowObject,
  validatePagesPublicTransportWorkflowObject,
  validatePDFRendererReproducibilityWorkflowObject,
  validatePullRequestTitleTypeAuthority,
  validatePullRequestMetadataWorkflowObject,
  validateReleaseExperimentImageWorkflowObject,
  validateReleaseWorkflowObject,
  validateRenovateConfigObject,
  validateRetiredHostingPaths,
  validateResearchLanePythonWorkflowObject,
  validateRepositoryPolicy,
  validateScientificRuntimeLock,
  validateScientificRuntimeWorkflowObject,
  validateToolingValidationScript,
  validateTypeCheckConfigObject,
  validateTaxonomyImporterScriptObject,
  validateTopicRegistryScriptsObject,
  validateUnpinnedImageSourceLabels,
  validateWorkstationShardScriptsObject,
  validateWorkflowObject,
  validateWorkflowTree,
} from "./validate-engineering-policy.mjs";

const workflow = (name) => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));

function policyDisclosure(version) {
  return [
    `# Research-output disclosure — v${version}`,
    "",
    `- **Output:** repository snapshot \`v${version}\``,
    "- **Record date:** 2026-08-05",
    "- **Authority:** policy-test release boundary",
    "",
    "## Contributors and responsibility",
    "",
    "The maintainer is accountable.",
    "",
    "## Funding and material support",
    "",
    "No funding is declared.",
    "",
    "## Competing interests",
    "",
    "No separate declaration is supplied.",
    "",
    "## Material AI, automation and external services",
    "",
    "The policy validator is the material automated tool.",
    "",
    "## Pre-release evidence and publication conditions",
    "",
    "The policy checks must pass before publication.",
    "",
  ].join("\n");
}

function ciImageStep(subject, name) {
  return subject.jobs["container-smoke"].steps.find((step) => step.name === name);
}

function releaseImageStep(subject, id) {
  return subject.jobs.release.steps.find((step) => step.id === id);
}

function releaseImageStepByName(subject, name) {
  return subject.jobs.release.steps.find((step) => step.name === name);
}

function assertWorkflowTamper(name, validator, mutate, expected) {
  const subject = structuredClone(workflow(name));
  mutate(subject);
  const findings = validator(subject);
  assert.ok(
    findings.includes(expected),
    `expected ${JSON.stringify(expected)} in ${JSON.stringify(findings)}`,
  );
}

function disableExitAfterDiagnostic(step, diagnostic) {
  const lines = step.run.split("\n");
  const diagnosticIndex = lines.findIndex((line) => line.includes(diagnostic));
  assert.notEqual(diagnosticIndex, -1, `missing diagnostic ${diagnostic}`);
  const exitIndex = lines.findIndex((line, index) => (
    index > diagnosticIndex && line.trim() !== ""
  ));
  assert.equal(lines[exitIndex]?.trim(), "exit 1", `diagnostic ${diagnostic} is not followed by exit 1`);
  lines[exitIndex] = lines[exitIndex].replace("exit 1", ":");
  step.run = lines.join("\n");
}

function resolveBash() {
  if (process.platform !== "win32") {
    return "/bin/bash";
  }
  // Windows lists the WSL launcher (System32\bash.exe) ahead of Git's bash on
  // PATH; a bash.exe that ships beside sh.exe is a real POSIX shell install.
  const directories = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).slice(0, 256);
  const directory = directories.find((candidate) => (
    existsSync(path.join(candidate, "bash.exe")) && existsSync(path.join(candidate, "sh.exe"))
  ));
  return directory === undefined ? "bash" : path.join(directory, "bash.exe");
}

const BASH = resolveBash();

function runCiSuccessGate(source, overrides = {}) {
  const environment = {
    EVENT_NAME: "push",
    MODE: "full",
    SELECT_CONTAINER: "false",
    SELECT_DEPENDENCY: "false",
    SELECT_GO: "false",
    SELECT_RELEASE: "false",
    SELECT_RENDERER: "false",
    SELECT_RESEARCH: "false",
    SELECT_SITE: "false",
    SELECT_WORKSTATION: "true",
    RESULT_PLAN: "success",
    RESULT_QUALITY_FULL: "success",
    RESULT_IMPACT_COMMON: "skipped",
    RESULT_GO: "skipped",
    RESULT_RELEASE: "skipped",
    RESULT_RENDERER: "skipped",
    RESULT_RESEARCH: "skipped",
    RESULT_SITE: "skipped",
    RESULT_WORKSTATION_CORE: "success",
    RESULT_WORKSTATION_ARTIFACTS: "success",
    RESULT_CONTAINER: "success",
    RESULT_DEPENDENCY_REVIEW: "skipped",
    RESULT_SECRET_SCAN: "success",
    ...overrides,
  };
  return spawnSync(BASH, ["-c", source], { encoding: "utf8", env: environment });
}

test("the repository satisfies its engineering policy", () => {
  assert.deepEqual(validateRepositoryPolicy(), []);
});

test("tooling validation runs all five offline authorities in order", () => {
  const experiment = "go -C tooling run ./cmd/20w experiment validate --root ..";
  const metadata = "go -C tooling run ./cmd/20w github sync-metadata --root .. --check";
  const publication = "go -C tooling run ./cmd/20w publication render-pdf --root .. --check";
  const pdfTools = "go -C tooling run ./cmd/20w publication verify-pdf-tools --root ..";
  const transport = "go -C tooling run ./cmd/20w publication verify-public-transport --root .. --check";
  const expectedFinding = "package.json: validate:tooling must validate experiment, GitHub metadata, publication-render, PDF-tools, and public-transport authority offline in that order";
  assert.deepEqual(validateToolingValidationScript(`${experiment} && ${metadata} && ${publication} && ${pdfTools} && ${transport}`), []);
  for (const command of [
    `${metadata} && ${experiment} && ${publication} && ${pdfTools} && ${transport}`,
    `${experiment} && ${metadata}`,
    `${experiment} && ${metadata} && ${publication} && ${pdfTools} && curl https://example.test && ${transport}`,
  ]) {
    assert.deepEqual(validateToolingValidationScript(command), [expectedFinding]);
  }
});

test("workstation shard scripts retain their exact disjoint inventories", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const workstationManifests = Object.fromEntries(["026", "029"].map((fixture) => [
    fixture,
    JSON.parse(readFileSync(
      new URL(`../experiments/workstation/manifests/fixture-${fixture}.json`, import.meta.url),
      "utf8",
    )),
  ]));
  const validate = (subject, inventories = workstationManifests) => (
    validateWorkstationShardScriptsObject(subject, inventories)
  );
  assert.deepEqual(validate(manifest), []);

  const missingHeavyTest = structuredClone(manifest);
  missingHeavyTest.scripts["test:workstation:fixture-026:shard-1"] =
    "node --test experiments/workstation/fixture-026/rsd-t02-runner.test.mjs";
  assert.ok(validate(missingHeavyTest).includes(
    "package.json: test:workstation:fixture-026:shard-1 must retain its exact bounded test inventory",
  ));

  const extraShard = structuredClone(manifest);
  extraShard.scripts["test:workstation:fixture-029:shard-3"] =
    extraShard.scripts["test:workstation:fixture-029:shard-2"];
  assert.ok(validate(extraShard).includes(
    "package.json: workstation shard script identities must be exactly the ten allowlisted names",
  ));

  const serialFullGate = structuredClone(manifest);
  serialFullGate.scripts["check:full-without-workstation"] += " && npm run test:workstation";
  assert.ok(validate(serialFullGate).includes(
    "package.json: check:full-without-workstation must retain the complete non-workstation aggregate gate",
  ));

  const bypassedRunner = structuredClone(manifest);
  bypassedRunner.scripts["test:workstation"] = bypassedRunner.scripts["test:workstation:core"];
  assert.ok(validate(bypassedRunner).includes(
    "package.json: test:workstation must use the bounded Go catalogue runner",
  ));

  const weakenedLocalGate = structuredClone(manifest);
  weakenedLocalGate.scripts.test = weakenedLocalGate.scripts.test.replace(
    "npm run validate:workstation && npm run test:workstation",
    "echo 'npm run validate:workstation && npm run test:workstation'",
  );
  assert.ok(validate(weakenedLocalGate).includes(
    "package.json: the local aggregate gate must retain the complete workstation suite",
  ));

  const unshardedRegisteredTest = structuredClone(workstationManifests);
  const unshardedPath = "experiments/workstation/fixture-026/future-contract.test.mjs";
  unshardedRegisteredTest["026"].implementation.tests.push(unshardedPath);
  unshardedRegisteredTest["026"].implementation.full_tests.push(unshardedPath);
  assert.ok(validate(manifest, unshardedRegisteredTest).includes(
    "package.json: Fixture 026 tests and full_tests must match and every registered test must appear in exactly one shard",
  ));
});

test("the topic registry validator runs in the aggregate gate and every impact plan", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(validateTopicRegistryScriptsObject(manifest), []);
  assert.ok(manifest.scripts.test.split(" && ").includes("npm run validate:topics"));
  assert.ok(manifest.scripts["check:full-without-workstation"].split(" && ").includes("npm run validate:topics"));

  const skippedGate = structuredClone(manifest);
  skippedGate.scripts.test = skippedGate.scripts.test.replace("npm run validate:topics && ", "");
  assert.ok(validateWorkstationShardScriptsObject(skippedGate, {}).includes(
    "package.json: the local aggregate gate must retain the complete workstation suite",
  ));

  const cases = [
    ["validate:topics", "node scripts/validate-topics.mjs --lenient",
      "package.json: validate:topics must run node scripts/validate-topics.mjs"],
    ["test:policy", manifest.scripts["test:policy"].replace(" scripts/validate-topics.test.mjs", ""),
      "package.json: test:policy must run scripts/validate-topics.test.mjs"],
    ["check:impact-common", manifest.scripts["check:impact-common"].replace("npm run validate:topics && ", ""),
      "package.json: check:impact-common must run validate:topics for every impact plan"],
  ];
  for (const [script, command, finding] of cases) {
    const tampered = structuredClone(manifest);
    tampered.scripts[script] = command;
    assert.deepEqual(validateTopicRegistryScriptsObject(tampered), [finding]);
  }
  assert.equal(validateTopicRegistryScriptsObject({}).length, 3);
});

test("the taxonomy gate rebuilds the taxonomy JSON from its sources in every lane that runs it", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(validateTaxonomyImporterScriptObject(manifest), []);
  const finding = "package.json: validate:taxonomies must rebuild the taxonomy JSON from its official sources";
  for (const command of [
    manifest.scripts["validate:taxonomies"].replace(" && python scripts/import-science-taxonomies.py --check", ""),
    manifest.scripts["validate:taxonomies"].replace("import-science-taxonomies.py --check", "import-science-taxonomies.py"),
    "echo python scripts/import-science-taxonomies.py --check",
  ]) {
    const tampered = structuredClone(manifest);
    tampered.scripts["validate:taxonomies"] = command;
    assert.deepEqual(validateTaxonomyImporterScriptObject(tampered), [finding]);
  }
  assert.deepEqual(validateTaxonomyImporterScriptObject({}), [finding]);

  const ci = workflow("ci");
  assert.deepEqual(validateResearchLanePythonWorkflowObject(ci), []);
  const laneFinding = "workflow.yml: job lane-research must use locked Python 3.14.8 before the research checks";
  const steps = ci.jobs["lane-research"].steps;
  const setup = steps.findIndex((step) => step.uses?.startsWith("actions/setup-python@"));
  const withoutPython = structuredClone(ci);
  withoutPython.jobs["lane-research"].steps.splice(setup, 1);
  assert.deepEqual(validateResearchLanePythonWorkflowObject(withoutPython), [laneFinding]);
  const otherPython = structuredClone(ci);
  otherPython.jobs["lane-research"].steps[setup].with["python-version"] = "3.14";
  assert.deepEqual(validateResearchLanePythonWorkflowObject(otherPython), [laneFinding]);
  const lateSetup = structuredClone(ci);
  const [moved] = lateSetup.jobs["lane-research"].steps.splice(setup, 1);
  lateSetup.jobs["lane-research"].steps.push(moved);
  assert.deepEqual(validateResearchLanePythonWorkflowObject(lateSetup), [laneFinding]);
  assert.deepEqual(validateResearchLanePythonWorkflowObject({}), [
    "workflow.yml: job lane-research must run the research checks",
  ]);
});

test("full-book browser probes stay in one bounded process-isolated site-test group", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const command = manifest.scripts?.["test:site"];
  const browserCommand = command?.split("&&").at(-1)?.trim() ?? "";
  const tokens = browserCommand.split(/\s+/u);
  assert.deepEqual(tokens.slice(0, 2), ["node", "--test"]);
  assert.deepEqual(
    tokens.filter((token) => token.startsWith("--test-concurrency=")),
    ["--test-concurrency=2"],
  );
  assert.deepEqual(
    tokens.filter((token) => token.startsWith("--experimental-test-isolation=")),
    ["--experimental-test-isolation=process"],
  );
  for (const probe of [
    "scripts/book-fragment-browser.test.mjs",
    "scripts/book-print-tail-browser.test.mjs",
    "scripts/mermaid-browser.test.mjs",
    "scripts/research-object-header-browser.test.mjs",
  ]) {
    assert.equal(tokens.filter((token) => token === probe).length, 1, `${probe} must run exactly once`);
  }

  const isolatedCaches = new Map([
    ["book fragment", ["book-fragment-browser.test.mjs", 'cacheDir: path.join(profile, "vite-cache")']],
    ["Mermaid", ["mermaid-browser.test.mjs", 'cacheDir: path.join(profile, "vite-cache")']],
    ["research object", ["research-object-header-browser.test.mjs", 'cacheDir: path.join(temporaryRoot, "vite-cache")']],
  ]);
  for (const [label, [file, cacheBinding]] of isolatedCaches) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(source.includes(cacheBinding), `${label} browser probe needs a private Vite cache`);
    assert.ok(
      source.includes('configLoader: "runner"'),
      `${label} browser probe must not emit shared temporary config modules`,
    );
    assert.ok(
      source.includes('"--remote-debugging-port=0"')
        && source.includes("devtoolsPageFromProfile(")
        && source.includes("signal: t.signal")
        && source.includes("settleCleanupSteps(["),
      `${label} browser probe needs held ports, cancellation, and settled cleanup`,
    );
    assert.equal(source.includes("reserveLocalPort"), false, `${label} retained a port handoff race`);
  }
});

test("the current package version requires a matching, structured research disclosure", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "current-disclosure-policy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const version = "0.1.0";
  const relativePath = `research/disclosures/v${version}.md`;
  const disclosurePath = path.join(root, relativePath);
  writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ version })}\n`);

  assert.deepEqual(validateCurrentResearchDisclosure(root), [
    `${relativePath}: current-version research disclosure is missing`,
  ]);

  mkdirSync(path.dirname(disclosurePath), { recursive: true });
  writeFileSync(disclosurePath, policyDisclosure(version));
  assert.deepEqual(validateCurrentResearchDisclosure(root), []);

  writeFileSync(disclosurePath, policyDisclosure("0.1.1"));
  assert.deepEqual(validateCurrentResearchDisclosure(root), [
    `${relativePath} must begin with # Research-output disclosure — v${version}`,
  ]);

  writeFileSync(
    disclosurePath,
    policyDisclosure(version).replace("## Funding and material support\n\nNo funding is declared.\n\n", ""),
  );
  assert.deepEqual(validateCurrentResearchDisclosure(root), [
    `${relativePath} must contain exactly one ## Funding and material support`,
  ]);
});

test("workflow validation rejects mutable actions and unbounded jobs", () => {
  const findings = validateWorkflowObject({
    permissions: { contents: "read" },
    concurrency: { group: "test", "cancel-in-progress": true },
    jobs: {
      unsafe: {
        "runs-on": "ubuntu-26.04",
        steps: [{ uses: "actions/checkout@v6", with: { "persist-credentials": false } }],
      },
    },
  });

  assert.equal(findings.length, 2);
  assert.match(findings[0], /timeout-minutes/u);
  assert.match(findings[1], /full commit SHA/u);
});

test("workflow validation rejects ambient writes, unbounded concurrency, and credential persistence", () => {
  const findings = validateWorkflowObject({
    permissions: { contents: "write" },
    jobs: {
      unsafe: {
        "runs-on": "ubuntu-26.04",
        "timeout-minutes": 5,
        steps: [{
          uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        }],
      },
    },
  });
  assert.deepEqual(findings, [
    "workflow.yml: top-level permissions must not grant write access",
    "workflow.yml: concurrency must define a group and explicit cancel-in-progress boolean",
    "workflow.yml: job unsafe step 0 must set checkout persist-credentials to false",
  ]);
});

test("public-repository workflows cannot request self-hosted or dynamic runners", () => {
  const label = "arc-cauda-lusoris-20-watts";
  assert.deepEqual(validatePublicRepositoryRunnerWorkflowObject({
    jobs: {
      ci: { "runs-on": "ubuntu-26.04" },
      release: { "runs-on": "ubuntu-26.04" },
    },
  }), []);

  assert.deepEqual(validatePublicRepositoryRunnerWorkflowObject({
    jobs: {
      selfHosted: { "runs-on": label },
      dynamic: { "runs-on": "${{ matrix.os }}" },
    },
  }), [
    "workflow.yml: public-repository job selfHosted must run on GitHub-hosted ubuntu-26.04",
    "workflow.yml: public-repository job dynamic must run on GitHub-hosted ubuntu-26.04",
  ]);

  assert.deepEqual(validatePublicRepositoryRunnerWorkflowObject({
    jobs: {
      floating: { "runs-on": "ubuntu-latest" },
      previous: { "runs-on": "ubuntu-24.04" },
    },
  }), [
    "workflow.yml: public-repository job floating must run on GitHub-hosted ubuntu-26.04",
    "workflow.yml: public-repository job previous must run on GitHub-hosted ubuntu-26.04",
  ]);

  const labelerPath = ".github/workflows/labeler.yml";
  const labeler = workflow("labeler");
  assert.deepEqual(validatePublicRepositoryRunnerWorkflowObject(labeler, labelerPath), []);
  labeler.jobs.label["runs-on"] = label;
  assert.deepEqual(validatePublicRepositoryRunnerWorkflowObject(labeler, labelerPath), [
    `${labelerPath}: public-repository job label must run on GitHub-hosted ubuntu-26.04`,
  ]);

  const pagesPath = ".github/workflows/github-pages.yml";
  const pages = workflow("github-pages");
  assert.deepEqual(validatePublicRepositoryRunnerWorkflowObject(pages, pagesPath), []);
  pages.jobs["verify-public-transport"]["runs-on"] = label;
  assert.deepEqual(validatePublicRepositoryRunnerWorkflowObject(pages, pagesPath), [
    `${pagesPath}: public-repository job verify-public-transport must run on GitHub-hosted ubuntu-26.04`,
  ]);
});

test("portable operations reject host-specific scripts without rejecting Go portability", () => {
  assert.deepEqual(validateOperationalFilePaths([
    "tooling/cmd/20w/main.go",
    "tooling/internal/runner/runner_windows.go",
    "release/20w-windows-amd64.exe",
    "docs/windows-platform-notes.md",
  ]), []);
  assert.deepEqual(validateOperationalFilePaths([
    "scripts/check.ps1",
    ".github/helpers/release.cmd",
    "experiments/workstation/fixture-012/workstation-acquisition.mjs",
    "tooling/cmd/20w/main.go",
  ]), [
    ".github/helpers/release.cmd: host-specific operational artifact is forbidden; use the portable Go command or a scoped container",
    "experiments/workstation/fixture-012/workstation-acquisition.mjs: host-specific operational artifact is forbidden; use the portable Go command or a scoped container",
    "scripts/check.ps1: host-specific operational artifact is forbidden; use the portable Go command or a scoped container",
  ]);
});

test("the portable-operation scan skips agent worktrees and still scans the source tree", () => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-portable-scan-"));
  try {
    mkdirSync(path.join(root, ".claude/worktrees/agent/scripts"), { recursive: true });
    writeFileSync(path.join(root, ".claude/worktrees/agent/scripts/check.ps1"), "Write-Output agent\n");
    assert.deepEqual(validatePortableOperationsTree(root), []);

    mkdirSync(path.join(root, ".claude/settings"), { recursive: true });
    writeFileSync(path.join(root, ".claude/settings/hook.ps1"), "Write-Output hook\n");
    mkdirSync(path.join(root, "tools"));
    writeFileSync(path.join(root, "tools/run.ps1"), "Write-Output tool\n");
    assert.deepEqual(validatePortableOperationsTree(root), [
      ".claude/settings/hook.ps1: host-specific operational artifact is forbidden; use the portable Go command or a scoped container",
      "tools/run.ps1: host-specific operational artifact is forbidden; use the portable Go command or a scoped container",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("portable workflows reject Windows runners and PowerShell entry points", () => {
  const findings = validatePortableWorkflowObject({
    jobs: {
      matrix: {
        "runs-on": "${{ matrix.os }}",
        strategy: { matrix: { os: ["ubuntu-24.04", "windows-2025"] } },
        steps: [{ run: "go test ./..." }],
      },
      shell: {
        "runs-on": "ubuntu-24.04",
        steps: [
          { shell: "pwsh", run: "Write-Output test" },
          { run: "powershell.exe -File scripts/check.ps1" },
        ],
      },
    },
  });
  assert.deepEqual(findings, [
    "workflow.yml: job matrix must not add a Windows runner lane",
    "workflow.yml: job shell step 0 must not use pwsh",
    "workflow.yml: job shell step 1 must not invoke PowerShell",
  ]);
});

test("workflow validation accepts only the reviewed action digests", () => {
  const valid = {
    permissions: { contents: "read" },
    concurrency: { group: "test", "cancel-in-progress": true },
    jobs: {
      check: {
        "timeout-minutes": 5,
        steps: [{
          uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
          with: { "persist-credentials": false },
        }],
      },
    },
  };
  assert.deepEqual(validateWorkflowObject(valid), []);

  const stale = structuredClone(valid);
  stale.jobs.check.steps[0].uses = "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803";
  assert.deepEqual(validateWorkflowObject(stale), [
    "workflow.yml: root.jobs.check.steps[0].uses must use the approved actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 pin; got actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
  ]);
});

test("scientific workflows must provision the fixture-locked Python and NumPy runtime", () => {
  const lock = { python_version: "3.14.8", packages: { numpy: "2.5.3" } };
  const validSteps = [
    { uses: "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97", with: { "python-version": "3.14.8" } },
    { run: "python -m pip install --disable-pip-version-check --no-deps --require-hashes -r requirements-ci.txt" },
  ];
  assert.deepEqual(validateScientificRuntimeWorkflowObject(
    { jobs: { quality: { steps: validSteps } } },
    lock,
    "quality",
  ), []);
  assert.deepEqual(validateScientificRuntimeWorkflowObject(
    { jobs: { quality: { steps: [{ ...validSteps[0], with: { "python-version": "3.14" } }] } } },
    lock,
    "quality",
  ), [
    "workflow.yml: job quality must use locked Python 3.14.8",
    "workflow.yml: job quality must install hash-locked NumPy 2.5.3 without dependencies",
  ]);
});

test("the scientific runtime lock is the exact reviewed CPython and NumPy artifact", () => {
  const valid = {
    schema: 1,
    artifact: "fixture-019",
    python_implementation: "CPython",
    python_version: "3.14.8",
    packages: { numpy: "2.5.3" },
    package_artifacts: {
      numpy: {
        filename: "numpy-2.5.3-cp314-cp314-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
        sha256: "b0521d0f4aebb6e06189451025fa17a913287b13c03d5fe05c017333b654ea5b",
      },
    },
    bit_generator: "PCG64DXSM",
    network_install_during_run: false,
  };
  assert.deepEqual(validateScientificRuntimeLock(valid), []);

  const tampered = structuredClone(valid);
  tampered.python_version = "3.14.9";
  tampered.packages.numpy = "2.5.4";
  tampered.package_artifacts.numpy.sha256 = "0".repeat(64);
  tampered.unreviewed_package_source = "https://example.invalid";
  assert.deepEqual(validateScientificRuntimeLock(tampered), [
    "experiments/workstation/fixture-019/python-environment.lock.json: python_version must be \"3.14.8\"",
    "experiments/workstation/fixture-019/python-environment.lock.json: scientific runtime lock contains an unknown or missing field",
    "experiments/workstation/fixture-019/python-environment.lock.json: packages must contain only NumPy 2.5.3",
    "experiments/workstation/fixture-019/python-environment.lock.json: NumPy 2.5.3 must use the approved CPython 3.14 Linux x86_64 wheel and SHA-256 digest",
  ]);
});

test("JavaScript workflows use the exact Node and npm toolchain in order", () => {
  const validSteps = [
    {
      uses: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
      with: { "node-version-file": ".node-version", cache: "npm" },
    },
    { run: "node scripts/install-locked-npm.mjs" },
    { run: "test \"$(npm --version)\" = \"12.2.0\"" },
    { run: "npm ci --no-audit" },
  ];
  assert.deepEqual(validateJavaScriptRuntimeWorkflowObject(
    { jobs: { quality: { steps: validSteps } } },
    "quality",
  ), []);

  const tampered = structuredClone(validSteps);
  tampered[0].with = { "node-version": "26.10.0", cache: "npm" };
  tampered[1].run = "npm install --global npm@latest";
  tampered[2].run = "test \"$(npm --version)\" = \"12.0.1\"";
  assert.deepEqual(validateJavaScriptRuntimeWorkflowObject(
    { jobs: { quality: { steps: tampered } } },
    "quality",
  ), [
    "workflow.yml: job quality must read the Node version from .node-version with the npm cache",
    "workflow.yml: job quality must install hash-locked npm 12.2.0 after Node setup",
    "workflow.yml: job quality must verify locked npm 12.2.0 after installation",
    "workflow.yml: job quality must run npm ci --no-audit after verifying the locked npm version",
  ]);
});

test("every job reads the Node version from the one version file", () => {
  const setup = (inputs) => ({
    uses: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    with: inputs,
  });
  const jobsWith = (inputs) => ({
    jobs: {
      first: { steps: [{ run: "true" }, setup({ "node-version-file": ".node-version", cache: "npm" })] },
      second: { steps: [setup(inputs)] },
      plain: { steps: [{ run: "true" }] },
      reusable: { uses: "./.github/workflows/other.yml" },
    },
  });
  const finding = ["workflow.yml: job second must read the Node version from .node-version"];
  assert.deepEqual(validateNodeSetupWorkflowObject(jobsWith({ "node-version-file": ".node-version" })), []);
  assert.deepEqual(validateNodeSetupWorkflowObject({ jobs: {} }), []);
  assert.deepEqual(validateNodeSetupWorkflowObject(undefined), []);
  for (const inputs of [
    { "node-version": "26.10.0" },
    { "node-version-file": ".node-version", "node-version": "26.10.0" },
    { "node-version-file": "package.json" },
    { "node-version-file": ".nvmrc" },
    {},
    undefined,
  ]) {
    assert.deepEqual(validateNodeSetupWorkflowObject(jobsWith(inputs)), finding);
  }
  for (const name of ["ci", "github-pages", "release"]) {
    const file = `.github/workflows/${name}.yml`;
    assert.deepEqual(validateNodeSetupWorkflowObject(workflow(name), file), []);
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /node-version:/u);
  }
});

test("the Node version file names exactly the reviewed runtime", () => {
  assert.deepEqual(validateNodeVersionFile("26.10.0\n"), []);
  assert.deepEqual(
    validateNodeVersionFile(readFileSync(new URL("../.node-version", import.meta.url), "utf8")),
    [],
  );
  for (const text of ["26.8.0\n", "26.10.0", "v26.10.0\n", "26.10.0\n\n", "26\n", "26.10.0\r\n", ""]) {
    assert.deepEqual(validateNodeVersionFile(text), [
      ".node-version: must contain exactly 26.10.0 and a final newline",
    ]);
  }
});

test("dependency installation suppresses audit fan-out and one full gate enforces advisories", () => {
  const valid = {
    jobs: {
      full: {
        steps: [
          { run: "npm ci --no-audit" },
          {
            run: "npm audit --audit-level=high --package-lock-only --fetch-timeout=30000 --fetch-retries=1",
          },
        ],
      },
      shard: { steps: [{ run: "npm ci --no-audit" }] },
    },
  };
  assert.deepEqual(validateDependencyAuditWorkflowObject(valid, "full"), []);

  const implicitFanOut = structuredClone(valid);
  implicitFanOut.jobs.shard.steps[0].run = "npm ci";
  assert.deepEqual(validateDependencyAuditWorkflowObject(implicitFanOut, "full"), [
    "workflow.yml: job shard must suppress npm ci's implicit audit with the exact npm ci --no-audit command",
  ]);

  const unlockedInstall = structuredClone(valid);
  unlockedInstall.jobs.shard.steps[0].run = "npm install";
  assert.deepEqual(validateDependencyAuditWorkflowObject(unlockedInstall, "full"), [
    "workflow.yml: job shard must suppress npm ci's implicit audit with the exact npm ci --no-audit command",
  ]);

  const preCommandFlagBypass = structuredClone(valid);
  preCommandFlagBypass.jobs.node = {
    steps: [
      {
        uses: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
        with: { "node-version-file": ".node-version", cache: "npm" },
      },
      { run: "node scripts/install-locked-npm.mjs" },
      { run: "test \"$(npm --version)\" = \"12.2.0\"" },
      { run: "npm --silent ci" },
    ],
  };
  assert.deepEqual(validateDependencyAuditWorkflowObject(preCommandFlagBypass, "full"), [
    "workflow.yml: job node must suppress npm ci's implicit audit with the exact npm ci --no-audit command",
  ]);

  const appendedPreCommandFlagInstall = structuredClone(valid);
  appendedPreCommandFlagInstall.jobs.shard.steps.push({ run: "npm --silent ci" });
  assert.deepEqual(validateDependencyAuditWorkflowObject(
    appendedPreCommandFlagInstall,
    "full",
  ), [
    "workflow.yml: job shard must suppress npm ci's implicit audit with the exact npm ci --no-audit command",
  ]);

  const appendedPreCommandFlagAudit = structuredClone(valid);
  appendedPreCommandFlagAudit.jobs.shard.steps.push({
    run: "npm --silent audit --audit-level=high",
  });
  assert.deepEqual(validateDependencyAuditWorkflowObject(
    appendedPreCommandFlagAudit,
    "full",
  ), [
    "workflow.yml: job full must be the only job to run the lockfile dependency audit",
  ]);

  const continuedPreCommandFlagInstall = structuredClone(valid);
  continuedPreCommandFlagInstall.jobs.shard.steps.push({ run: "npm --silent \\\nci" });
  assert.deepEqual(validateDependencyAuditWorkflowObject(
    continuedPreCommandFlagInstall,
    "full",
  ), [
    "workflow.yml: job shard must suppress npm ci's implicit audit with the exact npm ci --no-audit command",
  ]);

  const abbreviatedInstall = structuredClone(valid);
  abbreviatedInstall.jobs.shard.steps.push({ run: "npm instal" });
  assert.deepEqual(validateDependencyAuditWorkflowObject(abbreviatedInstall, "full"), [
    "workflow.yml: job shard must suppress npm ci's implicit audit with the exact npm ci --no-audit command",
  ]);

  const unsupportedInvocation = structuredClone(valid);
  unsupportedInvocation.jobs.shard.steps.push({ run: "npm exec arbitrary-tool" });
  assert.deepEqual(validateDependencyAuditWorkflowObject(unsupportedInvocation, "full"), [
    "workflow.yml: job shard contains an unsupported npm invocation outside version, run, exact install, or exact audit commands",
  ]);

  const repeatedAssignments = `${'A="" '.repeat(4_096)}"$NPM_COMMAND" i`;
  const repeatedWrapperFlags = `env ${"-! ".repeat(4_096)}"$NPM_COMMAND" in`;
  for (const run of [
    "node /usr/lib/node_modules/npm/bin/npm-cli.js ci",
    "npx --yes arbitrary-tool",
    "corepack pnpm install",
    '"${NPM_COMMAND}" ci',
    'env "$NPM_COMMAND" ci',
    'command "$NPM_COMMAND" ci',
    'exec "$NPM_COMMAND" ci',
    'FOO=bar "$NPM_COMMAND" ci',
    '"${NPM_COMMAND:-npm}" ci',
    '/usr/bin/env "$NPM_COMMAND" ci',
    'builtin command "$NPM_COMMAND" ci',
    'timeout 30 "$NPM_COMMAND" ci',
    "sh -c '\"$NPM_COMMAND\" ci'",
    'if "$NPM_COMMAND" ci; then :; fi',
    '{ "$NPM_COMMAND" ci; }',
    'FOO="bar baz" "$NPM_COMMAND" it',
    repeatedAssignments,
    repeatedWrapperFlags,
  ]) {
    const wrappedInvocation = structuredClone(valid);
    wrappedInvocation.jobs.shard.steps.push({ run });
    assert.notDeepEqual(validateDependencyAuditWorkflowObject(wrappedInvocation, "full"), []);
  }

  const argumentOnlyVariable = structuredClone(valid);
  argumentOnlyVariable.jobs.shard.steps.push({
    run: 'printf "%s\\n" "$NPM_COMMAND" it',
  });
  assert.deepEqual(validateDependencyAuditWorkflowObject(argumentOnlyVariable, "full"), []);

  const auditArgumentToRunScript = structuredClone(valid);
  auditArgumentToRunScript.jobs.shard.steps.push({
    run: "npm run check -- --filter audit",
  });
  assert.deepEqual(validateDependencyAuditWorkflowObject(auditArgumentToRunScript, "full"), []);

  const duplicatedLockedInstall = structuredClone(preCommandFlagBypass);
  duplicatedLockedInstall.jobs.node.steps[3].run = "npm ci --no-audit";
  duplicatedLockedInstall.jobs.node.steps.push({ run: "npm ci --no-audit" });
  assert.deepEqual(validateDependencyAuditWorkflowObject(duplicatedLockedInstall, "full"), [
    "workflow.yml: job node must use one adjacent locked Node, npm, verification, and npm ci --no-audit sequence",
  ]);
});

test("every discovered workflow is inside the generic security policy", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-workflow-tree-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const workflowDirectory = path.join(root, ".github", "workflows");
  mkdirSync(workflowDirectory, { recursive: true });
  writeFileSync(path.join(workflowDirectory, "new-workflow.yaml"), [
    "name: Extra",
    "on:",
    "  workflow_dispatch:",
    "permissions: {}",
    "concurrency:",
    "  group: extra",
    "  cancel-in-progress: true",
    "jobs:",
    "  unsafe:",
    "    runs-on: self-hosted",
    "    timeout-minutes: 5",
    "    steps:",
    "      - run: echo checked",
    "",
  ].join("\n"));
  assert.ok(validateWorkflowTree(root).includes(
    ".github/workflows/new-workflow.yaml: public-repository job unsafe must run on GitHub-hosted ubuntu-26.04",
  ));
});

test("one full gate enforces the only explicit dependency audit", () => {
  const valid = {
    jobs: {
      full: {
        steps: [
          { run: "npm ci --no-audit" },
          {
            run: "npm audit --audit-level=high --package-lock-only --fetch-timeout=30000 --fetch-retries=1",
          },
        ],
      },
      shard: { steps: [{ run: "npm ci --no-audit" }] },
    },
  };

  const duplicateAudit = structuredClone(valid);
  duplicateAudit.jobs.shard.steps.push({
    run: "npm audit --audit-level=high --package-lock-only --fetch-timeout=30000 --fetch-retries=1",
  });
  assert.deepEqual(validateDependencyAuditWorkflowObject(duplicateAudit, "full"), [
    "workflow.yml: job full must be the only job to run the lockfile dependency audit",
  ]);

  const bypassedAudit = structuredClone(valid);
  bypassedAudit.jobs.full.steps[1]["continue-on-error"] = true;
  assert.deepEqual(validateDependencyAuditWorkflowObject(bypassedAudit, "full"), [
    "workflow.yml: job full must run the exact enforcing dependency audit after its no-audit install",
  ]);

  const bypassedAuditJob = structuredClone(valid);
  bypassedAuditJob.jobs.full["continue-on-error"] = true;
  assert.deepEqual(validateDependencyAuditWorkflowObject(bypassedAuditJob, "full"), [
    "workflow.yml: job full must run the exact enforcing dependency audit after its no-audit install",
  ]);

  const delayedAudit = structuredClone(valid);
  delayedAudit.jobs.full.steps.splice(1, 0, { run: "echo delayed" });
  assert.deepEqual(validateDependencyAuditWorkflowObject(delayedAudit, "full"), [
    "workflow.yml: job full must run the exact enforcing dependency audit after its no-audit install",
  ]);

  const reorderedAudit = structuredClone(valid);
  reorderedAudit.jobs.full.steps.reverse();
  assert.deepEqual(validateDependencyAuditWorkflowObject(reorderedAudit, "full"), [
    "workflow.yml: job full must run the exact enforcing dependency audit after its no-audit install",
  ]);

  assert.deepEqual(validateDependencyAuditWorkflowObject(
    { jobs: { pages: { steps: [{ run: "npm ci --no-audit" }] } } },
    undefined,
  ), []);

  assert.deepEqual(validateDependencyAuditWorkflowObject(
    {
      jobs: {
        pages: {
          steps: [{
            run: "npm audit --audit-level=high --package-lock-only --fetch-timeout=30000 --fetch-retries=1",
          }],
        },
      },
    },
    undefined,
  ), [
    "workflow.yml: workflows without a full audit gate must not run an explicit dependency audit",
  ]);
});

test("the npm runtime lock binds the exact reviewed registry archive", () => {
  const valid = {
    schema: 1,
    version: "12.2.0",
    url: "https://registry.npmjs.org/npm/-/npm-12.2.0.tgz",
    size: 3_054_025,
    sha256: "6666b48816b39b86c3febac7b51a4ee4de6c5ca589c382ad8004b6b113f86677",
  };
  assert.deepEqual(validateNpmRuntimeLock(valid), []);

  const tampered = { ...valid, url: "https://registry.npmjs.org/npm/-/npm-12.0.3.tgz" };
  delete tampered.size;
  tampered.extra = true;
  assert.deepEqual(validateNpmRuntimeLock(tampered), [
    "scripts/npm-runtime-lock.json: npm runtime lock contains an unknown or missing field",
    "scripts/npm-runtime-lock.json: url must be \"https://registry.npmjs.org/npm/-/npm-12.2.0.tgz\"",
    "scripts/npm-runtime-lock.json: size must be 3054025",
  ]);
});

test("Go workflows use tooling/go.mod and the Go CodeQL lane", () => {
  const valid = workflow("codeql");
  assert.deepEqual(validateGoRuntimeWorkflowObject(valid, "analyze-go"), []);
  assert.deepEqual(validateGoCodeQlWorkflowObject(valid), []);

  const tampered = structuredClone(valid);
  delete tampered.jobs["analyze-go"].steps.find(
    (step) => step.uses?.startsWith("actions/setup-go@"),
  ).with["cache-dependency-path"];
  tampered.jobs["analyze-go"].steps.find(
    (step) => step.uses?.startsWith("github/codeql-action/init@"),
  ).with.languages = "javascript-typescript";
  assert.deepEqual(validateGoCodeQlWorkflowObject(tampered), [
    ".github/workflows/codeql.yml: job analyze-go must use Go 1.27.2 from tooling/go.mod with tooling/go.sum caching",
    ".github/workflows/codeql.yml: analyze-go must initialize CodeQL autobuild for Go",
    ".github/workflows/codeql.yml: Go CodeQL must keep its exact fail-closed initialization and analysis boundary",
  ]);

  const skipped = structuredClone(valid);
  for (const action of ["init", "analyze"]) {
    skipped.jobs["analyze-go"].steps.find(
      (step) => step.uses?.startsWith(`github/codeql-action/${action}@`),
    ).if = "${{ false }}";
  }
  assert.ok(validateGoCodeQlWorkflowObject(skipped).includes(
    ".github/workflows/codeql.yml: Go CodeQL must keep its exact fail-closed initialization and analysis boundary",
  ));
});

test("CodeQL publishes both configured language results for every protected commit", () => {
  const valid = workflow("codeql");
  assert.deepEqual(validateCodeQlImpactWorkflowObject(valid), []);

  const requiredResultFinding = ".github/workflows/codeql.yml: both configured CodeQL languages must run on every protected commit";
  for (const mutate of [
    (subject) => { subject.jobs.analyze.if = "${{ false }}"; },
    (subject) => { subject.jobs["analyze-go"].if = "${{ false }}"; },
    (subject) => { subject.jobs.analyze.needs = "impact-plan"; },
    (subject) => { subject.jobs["analyze-go"]["continue-on-error"] = true; },
    (subject) => { subject.jobs["impact-plan"] = {}; },
  ]) {
    const missingResult = structuredClone(valid);
    mutate(missingResult);
    assert.ok(validateCodeQlImpactWorkflowObject(missingResult).includes(requiredResultFinding));
  }

  const javascriptFinding = ".github/workflows/codeql.yml: JavaScript and TypeScript CodeQL must keep its exact fail-closed initialization and analysis boundary";
  for (const mutate of [
    (subject) => { subject.jobs.analyze.steps = []; },
    (subject) => {
      subject.jobs.analyze.steps.find(
        (step) => step.uses?.startsWith("github/codeql-action/init@"),
      ).with.languages = "go";
    },
    (subject) => {
      for (const action of ["init", "analyze"]) {
        subject.jobs.analyze.steps.find(
          (step) => step.uses?.startsWith(`github/codeql-action/${action}@`),
        ).if = "${{ false }}";
      }
    },
  ]) {
    const bypassedJavaScript = structuredClone(valid);
    mutate(bypassedJavaScript);
    assert.ok(validateCodeQlImpactWorkflowObject(bypassedJavaScript).includes(javascriptFinding));
  }
});

test("Pages verifies the Cloudflare public transport boundary after deployment", () => {
  const valid = workflow("github-pages");
  assert.deepEqual(validateGoRuntimeWorkflowObject(valid, "verify-public-transport"), []);
  assert.deepEqual(validatePagesPublicTransportWorkflowObject(valid), []);

  const detached = structuredClone(valid);
  detached.jobs["verify-public-transport"].needs = "build";
  assert.deepEqual(validatePagesPublicTransportWorkflowObject(detached), [
    ".github/workflows/github-pages.yml: Pages must run the bounded read-only public-transport check after deployment",
  ]);

  const writable = structuredClone(valid);
  writable.jobs["verify-public-transport"].permissions.issues = "write";
  assert.deepEqual(validatePagesPublicTransportWorkflowObject(writable), [
    ".github/workflows/github-pages.yml: Pages must run the bounded read-only public-transport check after deployment",
  ]);

  const dispatched = structuredClone(valid);
  dispatched.on.workflow_dispatch = {};
  assert.deepEqual(validatePagesPublicTransportWorkflowObject(dispatched), [
    ".github/workflows/github-pages.yml: production Pages publication must run only from canonical main pushes",
  ]);

  for (const field of ["if", "continue-on-error"]) {
    const skippedSetup = structuredClone(valid);
    const setup = skippedSetup.jobs["verify-public-transport"].steps.find(
      (step) => step.uses?.startsWith("actions/setup-go@"),
    );
    setup[field] = field === "if" ? "${{ false }}" : true;
    assert.deepEqual(validatePagesPublicTransportWorkflowObject(skippedSetup), [
      ".github/workflows/github-pages.yml: Pages must run the exact public-transport command from canonical source with no credential persistence or failure bypass",
    ]);
  }

  const maskedPipeline = structuredClone(valid);
  maskedPipeline.jobs["verify-public-transport"].steps.find(
    (step) => step.run?.includes("verify-public-transport"),
  ).shell = undefined;
  assert.deepEqual(validatePagesPublicTransportWorkflowObject(maskedPipeline), [
    ".github/workflows/github-pages.yml: Pages must run the exact public-transport command from canonical source with no credential persistence or failure bypass",
  ]);

  const bypassed = structuredClone(valid);
  const verify = bypassed.jobs["verify-public-transport"].steps.find(
    (step) => step.run?.includes("verify-public-transport"),
  );
  verify.run += " || true";
  assert.deepEqual(validatePagesPublicTransportWorkflowObject(bypassed), [
    ".github/workflows/github-pages.yml: Pages must run the exact public-transport command from canonical source with no credential persistence or failure bypass",
    ".github/workflows/github-pages.yml: Pages must retain the bounded public-transport observation for exactly 30 days",
  ]);

  const unretained = structuredClone(valid);
  const receipt = unretained.jobs["verify-public-transport"].steps.at(-1);
  receipt.with["retention-days"] = 31;
  assert.deepEqual(validatePagesPublicTransportWorkflowObject(unretained), [
    ".github/workflows/github-pages.yml: Pages must retain the bounded public-transport observation for exactly 30 days",
  ]);
});

test("CI runs the strict-JSON fuzzer with explicit time and process bounds", () => {
  const valid = workflow("ci");
  assert.deepEqual(validateCiFuzzingWorkflowObject(valid), []);

  const unboundedMinimisation = structuredClone(valid);
  const fuzz = unboundedMinimisation.jobs["quality-full"].steps.find((step) => (
    step.name === "Fuzz the untrusted JSON boundary"
  ));
  fuzz.run = fuzz.run.replace(" -fuzzminimizetime=5s", "");
  assert.deepEqual(validateCiFuzzingWorkflowObject(unboundedMinimisation), [
    ".github/workflows/ci.yml: quality-full must run the exact bounded strict-JSON fuzz target after the full non-workstation check",
  ]);

  const allowedFailure = structuredClone(valid);
  allowedFailure.jobs["quality-full"].steps.find((step) => (
    step.name === "Fuzz the untrusted JSON boundary"
  ))["continue-on-error"] = true;
  assert.deepEqual(validateCiFuzzingWorkflowObject(allowedFailure), [
    ".github/workflows/ci.yml: quality-full must run the exact bounded strict-JSON fuzz target after the full non-workstation check",
  ]);

  const allowedRepositoryCheckFailure = structuredClone(valid);
  allowedRepositoryCheckFailure.jobs["quality-full"].steps.find((step) => (
    step.run === "npm run check:full-without-workstation"
  ))["continue-on-error"] = true;
  assert.deepEqual(validateCiFuzzingWorkflowObject(allowedRepositoryCheckFailure), [
    ".github/workflows/ci.yml: quality-full must run the exact bounded strict-JSON fuzz target after the full non-workstation check",
  ]);

  const skippedRepositoryCheck = structuredClone(valid);
  skippedRepositoryCheck.jobs["quality-full"].steps.find((step) => (
    step.run === "npm run check:full-without-workstation"
  )).if = "false";
  assert.deepEqual(validateCiFuzzingWorkflowObject(skippedRepositoryCheck), [
    ".github/workflows/ci.yml: quality-full must run the exact bounded strict-JSON fuzz target after the full non-workstation check",
  ]);

  const detachedGate = structuredClone(valid);
  detachedGate.jobs["ci-success"].needs = detachedGate.jobs["ci-success"].needs.filter(
    (job) => job !== "quality-full",
  );
  assert.deepEqual(validateCiFuzzingWorkflowObject(detachedGate), [
    ".github/workflows/ci.yml: ci-success must require the fuzzing quality-full gate",
  ]);

  const laneFinding = ".github/workflows/ci.yml: lane-go must run the exact bounded strict-JSON fuzz target after the Go tests";
  const unfuzzedLane = structuredClone(valid);
  unfuzzedLane.jobs["lane-go"].steps = unfuzzedLane.jobs["lane-go"].steps.filter(
    (step) => step.name !== "Fuzz the untrusted JSON boundary",
  );
  assert.deepEqual(validateCiFuzzingWorkflowObject(unfuzzedLane), [laneFinding]);

  const skippedLaneFuzz = structuredClone(valid);
  skippedLaneFuzz.jobs["lane-go"].steps.find((step) => (
    step.name === "Fuzz the untrusted JSON boundary"
  )).if = "false";
  assert.deepEqual(validateCiFuzzingWorkflowObject(skippedLaneFuzz), [laneFinding]);

  const fuzzBeforeTests = structuredClone(valid);
  const laneSteps = fuzzBeforeTests.jobs["lane-go"].steps;
  const laneFuzz = laneSteps.splice(laneSteps.findIndex((step) => (
    step.name === "Fuzz the untrusted JSON boundary"
  )), 1)[0];
  laneSteps.unshift(laneFuzz);
  assert.deepEqual(validateCiFuzzingWorkflowObject(fuzzBeforeTests), [laneFinding]);
});

test("CI rejects a code-shape baseline reset on every event", () => {
  const valid = workflow("ci");
  assert.deepEqual(validateCiCodeShapeResetWorkflowObject(valid), []);
  const finding = ".github/workflows/ci.yml: quality-full must reject a code-shape baseline reset on every event, dispatched runs against their merge base";
  const resetStep = (document) => document.jobs["quality-full"].steps.find((step) => (
    step.name === "Reject a code-shape baseline reset"
  ));

  const skippedOnDispatch = structuredClone(valid);
  resetStep(skippedOnDispatch).if = "github.event_name != 'workflow_dispatch'";
  assert.deepEqual(validateCiCodeShapeResetWorkflowObject(skippedOnDispatch), [finding]);

  const noDispatchBase = structuredClone(valid);
  resetStep(noDispatchBase).run = 'node scripts/audit-code-shape.mjs --base-revision "$BASE_SHA"';
  assert.deepEqual(validateCiCodeShapeResetWorkflowObject(noDispatchBase), [finding]);

  const allowedFailure = structuredClone(valid);
  resetStep(allowedFailure)["continue-on-error"] = true;
  assert.deepEqual(validateCiCodeShapeResetWorkflowObject(allowedFailure), [finding]);

  const removed = structuredClone(valid);
  removed.jobs["quality-full"].steps = removed.jobs["quality-full"].steps.filter(
    (step) => step.name !== "Reject a code-shape baseline reset",
  );
  assert.deepEqual(validateCiCodeShapeResetWorkflowObject(removed), [finding]);
});

test("CI builds and executes the native release binary in the Go lane and the full gate", () => {
  const valid = workflow("ci");
  assert.deepEqual(validateCiNativeReleaseWorkflowObject(valid), []);
  const finding = (job) => `.github/workflows/ci.yml: ${job} must build and execute the native release binary after the Go checks`;
  const nativeStep = (document, job) => document.jobs[job].steps.find((step) => (
    step.name === "Build and execute the native release binary"
  ));

  const removed = structuredClone(valid);
  removed.jobs["lane-go"].steps = removed.jobs["lane-go"].steps.filter(
    (step) => step.name !== "Build and execute the native release binary",
  );
  assert.deepEqual(validateCiNativeReleaseWorkflowObject(removed), [finding("lane-go")]);

  const skipped = structuredClone(valid);
  nativeStep(skipped, "quality-full").if = "false";
  assert.deepEqual(validateCiNativeReleaseWorkflowObject(skipped), [finding("quality-full")]);

  const unexecuted = structuredClone(valid);
  const step = nativeStep(unexecuted, "lane-go");
  step.run = step.run.replace('./build/native-release/20w-linux-amd64 validate docs --root .', "");
  assert.ok(!step.run.includes("validate docs"));
  assert.deepEqual(validateCiNativeReleaseWorkflowObject(unexecuted), [finding("lane-go")]);

  const beforeFuzz = structuredClone(valid);
  const steps = beforeFuzz.jobs["lane-go"].steps;
  const nativeIndex = steps.findIndex((candidate) => candidate.name === "Build and execute the native release binary");
  const [moved] = steps.splice(nativeIndex, 1);
  steps.splice(steps.findIndex((candidate) => candidate.name === "Fuzz the untrusted JSON boundary"), 0, moved);
  assert.deepEqual(validateCiNativeReleaseWorkflowObject(beforeFuzz), [finding("lane-go")]);
});

test("real PDF reproducibility acceptance stays in the renderer-selected and tagged boundaries", () => {
  const finding = ".github/workflows/ci.yml: CI must run the exact selected PDF reproducibility proof only in its renderer-selected gate and retain its receipt plus mismatch bytes";
  const validCi = workflow("ci");
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
    validCi,
    ".github/workflows/ci.yml",
  ), []);

  const bypassed = structuredClone(validCi);
  bypassed.jobs["pdf-renderer-reproducibility"].steps.find((step) => (
    step.name === "Verify the selected PDF reproducibility proof"
  )).run += " || true";
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
    bypassed,
    ".github/workflows/ci.yml",
  ), [finding]);

  const unretained = structuredClone(validCi);
  for (const selection of [undefined, "render-pair", "image-build", "${{ inputs.renderer_proof }}"]) {
    const tampered = structuredClone(validCi);
    tampered.jobs["pdf-renderer-reproducibility"].steps.find((step) => (
      step.name === "Verify the selected PDF reproducibility proof"
    )).env.RENDERER_PROOF = selection;
    assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
      tampered, ".github/workflows/ci.yml",
    ), [finding]);
  }
  unretained.jobs["pdf-renderer-reproducibility"].steps.find((step) => (
    step.name === "Retain the PDF renderer reproducibility evidence"
  )).with["retention-days"] = 1;
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
    unretained,
    ".github/workflows/ci.yml",
  ), [finding]);

  const missingMismatchBytes = structuredClone(validCi);
  missingMismatchBytes.jobs["pdf-renderer-reproducibility"].steps.find((step) => (
    step.name === "Retain the PDF renderer reproducibility evidence"
  )).with.path = "build/evidence/pdf-renderer-reproducibility.json";
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
    missingMismatchBytes,
    ".github/workflows/ci.yml",
  ), [finding]);

  const broadened = structuredClone(validCi);
  broadened.jobs["pdf-renderer-reproducibility"].if =
    "needs.impact-plan.outputs.mode == 'full' || needs.impact-plan.outputs.renderer == 'true'";
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
    broadened,
    ".github/workflows/ci.yml",
  ), [finding]);

  for (const jobName of ["quality-full", "lane-release"]) {
    for (const run of [
      "go -C tooling run ./cmd/20w publication verify-pdf-reproducibility",
      "go -C tooling run ./cmd/pdf-proof",
    ]) {
      const duplicatedProof = structuredClone(validCi);
      duplicatedProof.jobs[jobName].steps.push({
        name: "Rebuild the final PDF renderer twice without cache",
        run,
      });
      assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
        duplicatedProof,
        ".github/workflows/ci.yml",
      ), [finding]);
    }
  }

  const releaseFinding = ".github/workflows/release.yml: tagged releases must run the exact two-builder PDF reproducibility acceptance and checksum its receipt as a release input";
  const validRelease = workflow("release");
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
    validRelease,
    ".github/workflows/release.yml",
  ), []);

  const unbound = structuredClone(validRelease);
  unbound.jobs.verify.steps.find((step) => (
    step.name === "Rebuild the final PDF renderer twice without cache"
  )).run = unbound.jobs.verify.steps.find((step) => (
    step.name === "Rebuild the final PDF renderer twice without cache"
  )).run.replace("build/release-inputs/", "build/evidence/");
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
    unbound,
    ".github/workflows/release.yml",
  ), [releaseFinding]);

  const unreleasedProofCommand = structuredClone(validRelease);
  unreleasedProofCommand.jobs.verify.steps.find((step) => (
    step.name === "Rebuild the final PDF renderer twice without cache"
  )).run = "go -C tooling run ./cmd/pdf-proof --root . --receipt proof.json";
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(
    unreleasedProofCommand,
    ".github/workflows/release.yml",
  ), [releaseFinding]);
});

test("the renderer job ends by proving the published PDF against its fresh renders", async (t) => {
  const finding = ".github/workflows/ci.yml: CI must run the exact selected PDF reproducibility proof only in its renderer-selected gate and retain its receipt plus mismatch bytes";
  const steps = (subject) => subject.jobs["pdf-renderer-reproducibility"].steps;
  const comparison = (subject) => steps(subject)
    .find((candidate) => candidate.name === "Verify the published PDF against the fresh renders");
  const valid = workflow("ci");
  assert.equal(steps(valid).at(-1), comparison(valid));
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(valid, ".github/workflows/ci.yml"), []);
  const mutations = {
    "missing comparison": (subject) => { steps(subject).pop(); },
    "ignored comparison result": (subject) => { comparison(subject).run += " || true"; },
    "comparison failure bypass": (subject) => { comparison(subject)["continue-on-error"] = true; },
    "comparison after a failed proof": (subject) => { comparison(subject).if = "always()"; },
    "comparison skipped on pull requests": (subject) => { comparison(subject).if = "github.ref == 'refs/heads/main'"; },
    "other receipt": (subject) => { comparison(subject).run = comparison(subject).run.replace("build/evidence/", "tmp/"); },
    "injected environment": (subject) => { comparison(subject).env = { NODE_OPTIONS: "--require ./tmp/patch.cjs" }; },
    "unbounded comparison": (subject) => { delete comparison(subject)["timeout-minutes"]; },
    "comparison before the receipt exists": (subject) => {
      const list = steps(subject);
      list.splice(list.length - 2, 2, list.at(-1), list.at(-2));
    },
    "step after the comparison": (subject) => { steps(subject).push({ name: "Later step", run: "true" }); },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    await t.test(name, () => {
      const subject = structuredClone(workflow("ci"));
      mutate(subject);
      assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(subject, ".github/workflows/ci.yml"), [finding]);
    });
  }
});

test("PDF build cache has one exact key, bounded restore and trusted successful-main save", async (t) => {
  const finding = ".github/workflows/ci.yml: CI must run the exact selected PDF reproducibility proof only in its renderer-selected gate and retain its receipt plus mismatch bytes";
  const step = (subject, name) => subject.jobs["pdf-renderer-reproducibility"].steps
    .find((candidate) => candidate.name === name);
  const restore = (subject) => step(subject, "Restore the PDF renderer build cache");
  const guard = (subject) => step(subject, "Reject a non-exact PDF renderer cache restore");
  const save = (subject) => step(subject, "Save the verified PDF renderer build cache");
  const verify = (subject) => step(subject, "Verify the selected PDF reproducibility proof");
  const mutations = {
    "missing restore": (subject) => { restore(subject).name = "Missing restore"; },
    "restore during independent build": (subject) => { delete restore(subject).if; },
    "mutable action": (subject) => { restore(subject).uses = "actions/cache/restore@v6"; },
    "new unreviewed action": (subject) => { restore(subject).uses = "actions/cache/restore@" + "a".repeat(40); },
    "unbounded restore": (subject) => { delete restore(subject)["timeout-minutes"]; },
    "unbounded download segment": (subject) => { delete restore(subject).env.SEGMENT_DOWNLOAD_TIMEOUT_MINS; },
    "unexpected restore credentials": (subject) => { restore(subject).env.ACTIONS_RUNTIME_TOKEN = "${{ secrets.TOKEN }}"; },
    "broad cache path": (subject) => { restore(subject).with.path = "build"; },
    "partial restore keys": (subject) => { restore(subject).with["restore-keys"] = "pdf-renderer-buildkit-v1-"; },
    "cross-platform archive": (subject) => { restore(subject).with.enableCrossOsArchive = true; },
    "lookup without restoration": (subject) => { restore(subject).with["lookup-only"] = true; },
    "fail on ordinary miss": (subject) => { restore(subject).with["fail-on-cache-miss"] = true; },
    "incomplete input key": (subject) => { restore(subject).with.key = "pdf-renderer-" + "a".repeat(64); },
    "missing exact-match guard": (subject) => { guard(subject).run = "true"; },
    "ignored partial match": (subject) => { guard(subject)["continue-on-error"] = true; },
    "unbound guard output": (subject) => { guard(subject).env.CACHE_HIT = "true"; },
    "unbounded guard": (subject) => { delete guard(subject)["timeout-minutes"]; },
    "guard after execution": (subject) => {
      const steps = subject.jobs["pdf-renderer-reproducibility"].steps;
      const index = steps.indexOf(guard(subject));
      [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
    },
    "duplicate restore identifier": (subject) => {
      subject.jobs["pdf-renderer-reproducibility"].steps.push({ id: "pdf-renderer-cache", run: "true" });
    },
    "duplicate proof identifier": (subject) => {
      subject.jobs["pdf-renderer-reproducibility"].steps.push({ id: "pdf-renderer-proof", run: "true" });
    },
    "missing cache argument": (subject) => { verify(subject).run = verify(subject).run.replace("--cache-dir build/cache/pdf-renderer ", ""); },
    "changed proof identifier": (subject) => { verify(subject).id = "different-proof"; },
    "save on pull requests": (subject) => { save(subject).if = "github.event_name == 'pull_request'"; },
    "save after failed proof": (subject) => { save(subject).if = "always() && github.ref == 'refs/heads/main'"; },
    "save from other branches": (subject) => { save(subject).if = save(subject).if.replace(" && github.ref == 'refs/heads/main'", ""); },
    "save incomplete key": (subject) => { save(subject).with.key = restore(subject).with.key + "-fallback"; },
    "unbounded save": (subject) => { delete save(subject)["timeout-minutes"]; },
    "cache execution failure bypass": (subject) => { save(subject)["continue-on-error"] = true; },
    "cache save elsewhere": (subject) => { subject.jobs["lane-release"].steps.push(structuredClone(save(subject))); },
    "changed proof cache path": (subject) => { verify(subject).run = verify(subject).run.replace("build/cache/pdf-renderer", "tmp/cache"); },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    await t.test(name, () => {
      const subject = structuredClone(workflow("ci"));
      mutate(subject);
      assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(subject, ".github/workflows/ci.yml"), [finding]);
    });
  }
});

test("the executed PDF cache guard allows exact hits and cold misses but rejects partial matches", () => {
  const guard = workflow("ci").jobs["pdf-renderer-reproducibility"].steps.find((step) => (
    step.name === "Reject a non-exact PDF renderer cache restore"
  ));
  for (const [matched, hit, expected] of [
    ["", "", 0], ["", "false", 0], ["exact-key", "true", 0],
    ["partial-key", "false", 1], ["partial-key", "", 1], ["partial-key", "TRUE", 1],
  ]) {
    const child = spawnSync(BASH, ["-c", guard.run], {
      env: { CACHE_MATCHED_KEY: matched, CACHE_HIT: hit }, encoding: "utf8", timeout: 1000, maxBuffer: 1024,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, expected, JSON.stringify({ matched, hit, stderr: child.stderr }));
    assert.equal(child.stdout.includes("did not match the exact key"), expected === 1);
  }
});

test("tagged PDF proof never opts into the CI build cache", () => {
  const subject = structuredClone(workflow("release"));
  subject.jobs.verify.steps.find((step) => step.name === "Rebuild the final PDF renderer twice without cache")
    .run += " --cache-dir build/cache/pdf-renderer";
  assert.deepEqual(validatePDFRendererReproducibilityWorkflowObject(subject, ".github/workflows/release.yml"), [
    ".github/workflows/release.yml: tagged releases must run the exact two-builder PDF reproducibility acceptance and checksum its receipt as a release input",
  ]);
});

test("private CI executables retain their tested Go build configuration", () => {
  const expected = {
    CGO_ENABLED: "0", GOOS: "linux", GOARCH: "amd64", GOENV: "off", GOWORK: "off",
    GOTOOLCHAIN: "local", GOFLAGS: "-mod=readonly", GOPROXY: "off", GOSUMDB: "off",
  };
  for (const kind of ["plan", "proof"]) {
    const locate = (subject) => kind === "plan"
      ? subject.jobs["impact-plan"].steps.find((step) => step.id === "plan")
      : subject.jobs["pdf-renderer-reproducibility"].steps.find((step) => (
        step.name === "Verify the selected PDF reproducibility proof"
      ));
    const validate = (subject) => kind === "plan"
      ? validateCiImpactWorkflowObject(subject)
      : validatePDFRendererReproducibilityWorkflowObject(subject, ".github/workflows/ci.yml");
    const valid = workflow("ci");
    assert.deepEqual(validate(valid), []);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(locate(valid).env[key], value, `${kind} ${key}`);
      for (const missing of [false, true]) {
        const tampered = structuredClone(valid);
        if (missing) delete locate(tampered).env[key];
        else locate(tampered).env[key] = "unreviewed";
        assert.ok(validate(tampered).length > 0, `${kind} ${key} missing=${missing}`);
      }
    }
    const extra = structuredClone(valid);
    locate(extra).env.GOEXPERIMENT = "unreviewed";
    assert.ok(validate(extra).length > 0, `${kind} extra Go configuration`);
    const recoupled = structuredClone(valid);
    locate(recoupled).run = locate(recoupled).run
      .replaceAll("./cmd/ci-plan", "./cmd/20w ci")
      .replace("./cmd/pdf-proof", "./cmd/20w publication verify-pdf-reproducibility");
    assert.ok(validate(recoupled).length > 0, `${kind} shared executable reintroduced`);
  }
});

test("private CI build configuration rejects inherited workflow and job environment", () => {
  for (const jobName of ["impact-plan", "pdf-renderer-reproducibility"]) {
    const validate = (subject) => jobName === "impact-plan"
      ? validateCiImpactWorkflowObject(subject)
      : validatePDFRendererReproducibilityWorkflowObject(subject, ".github/workflows/ci.yml");
    const valid = workflow("ci");
    assert.deepEqual(Object.keys(valid.env), ["PRAETOR_REF"]);
    assert.match(valid.env.PRAETOR_REF, /^[0-9a-f]{40}$/u);
    assert.equal(valid.jobs[jobName].env, undefined);
    assert.deepEqual(validate(valid), []);
    for (const key of ["GOEXPERIMENT", "GOFLAGS"]) {
      for (const level of ["workflow", "job"]) {
        const tampered = structuredClone(valid);
        const owner = level === "workflow" ? tampered : tampered.jobs[jobName];
        owner.env = { [key]: "unreviewed" };
        assert.ok(validate(tampered).length > 0, `${jobName} inherited ${level} ${key}`);
      }
    }
  }
});

test("the workflow environment of CI holds nothing but a full engine commit id", () => {
  const pin = "0123456789abcdef0123456789abcdef01234567";
  for (const jobName of ["impact-plan", "pdf-renderer-reproducibility"]) {
    const validate = (subject) => jobName === "impact-plan"
      ? validateCiImpactWorkflowObject(subject)
      : validatePDFRendererReproducibilityWorkflowObject(subject, ".github/workflows/ci.yml");
    const withEnvironment = (environment) => {
      const subject = workflow("ci");
      if (environment === undefined) delete subject.env;
      else subject.env = environment;
      return subject;
    };
    assert.deepEqual(validate(withEnvironment(undefined)), [], `${jobName} without a workflow environment`);
    assert.deepEqual(validate(withEnvironment({ PRAETOR_REF: pin })), [], `${jobName} with another full commit id`);
    for (const [label, environment] of [
      ["a second key beside the pin", { PRAETOR_REF: pin, GOFLAGS: "-mod=mod" }],
      ["a second harmless-looking key", { PRAETOR_REF: pin, CI_NOTE: "x" }],
      ["a release tag", { PRAETOR_REF: "v1.0.0" }],
      ["a branch name", { PRAETOR_REF: "main" }],
      ["an abbreviated commit id", { PRAETOR_REF: pin.slice(0, 12) }],
      ["a value that is not hexadecimal", { PRAETOR_REF: `${pin.slice(0, 39)}g` }],
      ["upper-case hexadecimal", { PRAETOR_REF: pin.toUpperCase() }],
      ["a 41-character value", { PRAETOR_REF: `${pin}0` }],
      ["a commit id with a trailing line", { PRAETOR_REF: `${pin}\n` }],
      ["a number", { PRAETOR_REF: 1234567890123456 }],
      ["an expression", { PRAETOR_REF: "${{ vars.PRAETOR_REF }}" }],
      ["an empty environment", {}],
      ["a null environment", null],
      ["a list", [pin]],
      ["the pin under another name", { PRAETOR_PIN: pin }],
    ]) {
      assert.ok(validate(withEnvironment(environment)).length > 0, `${jobName} accepted ${label}`);
    }
    const jobLevel = withEnvironment({ PRAETOR_REF: pin });
    jobLevel.jobs[jobName].env = { PRAETOR_REF: pin };
    assert.ok(validate(jobLevel).length > 0, `${jobName} accepted the pin at job level`);
  }
});

test("CI refuses tool attribution in exactly the commit messages a change adds", () => {
  const valid = workflow("ci");
  const finding = ".github/workflows/ci.yml: impact-plan must refuse tool or model attribution in every commit message that the accepted base does not reach";
  const locate = (subject) => subject.jobs["impact-plan"].steps[3];
  assert.deepEqual(validateCiImpactWorkflowObject(valid), []);
  assert.equal(locate(valid).name, "Refuse tool attribution in new commit messages");

  for (const mutate of [
    // Compare against the event's recorded base, which may be an older ancestor of main.
    (source) => source.replace('"${CURRENT_SHA}^1^{commit}"', '"$BEFORE_SHA"'),
    (source) => source.replace('[[ "$merged_head" != "$HEAD_SHA" ]]', "false"),
    (source) => source.replace('--base "$base_tip" --head "$HEAD_SHA"', '--head "$HEAD_SHA"'),
    (source) => source.replace('&& "$BEFORE_SHA" != "$zero_sha" ]]', "]]"),
    (source) => source.replace('git merge-base --is-ancestor "$BEFORE_SHA" "$CURRENT_SHA"', "true"),
    (source) => source.replace('--base "$BEFORE_SHA" --head "$CURRENT_SHA"', '--head "$CURRENT_SHA"'),
    (source) => source.replace(
      '  go -C tooling run ./cmd/ci-plan messages --root .. --head "$CURRENT_SHA"',
      "  true",
    ),
    (source) => source.replaceAll("./cmd/ci-plan messages", "./cmd/20w ci messages"),
    (source) => `${source}\n|| true`,
    () => "true",
  ]) {
    const weakened = structuredClone(valid);
    const before = locate(weakened).run;
    locate(weakened).run = mutate(before);
    assert.notEqual(locate(weakened).run, before, "the mutation must change the step source");
    assert.ok(validateCiImpactWorkflowObject(weakened).includes(finding));
  }

  for (const mutate of [
    (step) => { step["continue-on-error"] = true; },
    (step) => { step.if = "github.event_name == 'push'"; },
    (step) => { step.shell = "sh"; },
    (step) => { step.env.GOFLAGS = "-mod=mod"; },
    (step) => { delete step.env.HEAD_SHA; },
    (step) => { step.env.BASE_SHA = "${{ github.event.pull_request.base.sha }}"; },
    (step) => { step["working-directory"] = "tooling"; },
  ]) {
    const weakened = structuredClone(valid);
    mutate(locate(weakened));
    assert.ok(validateCiImpactWorkflowObject(weakened).includes(finding));
  }

  const removed = structuredClone(valid);
  removed.jobs["impact-plan"].steps.splice(3, 1);
  assert.ok(validateCiImpactWorkflowObject(removed).includes(finding));

  const reordered = structuredClone(valid);
  const steps = reordered.jobs["impact-plan"].steps;
  [steps[2], steps[3]] = [steps[3], steps[2]];
  assert.ok(validateCiImpactWorkflowObject(reordered).includes(finding));
});

test("CI impact selection is projected once and every job state fails closed", () => {
  const valid = workflow("ci");
  const planFinding = ".github/workflows/ci.yml: pull requests and comparable main pushes must use exact impact diffs, while unavailable push ancestry and manual runs must fail closed";
  assert.deepEqual(validateCiImpactWorkflowObject(valid), []);

  const forcedPullRequestFull = structuredClone(valid);
  const plan = forcedPullRequestFull.jobs["impact-plan"].steps.find((step) => step.id === "plan");
  plan.run = plan.run.replace(
    "go -C tooling run ./cmd/ci-plan plan --root .. \\",
    "go -C tooling run ./cmd/ci-plan plan --root .. --full \\",
  );
  assert.ok(validateCiImpactWorkflowObject(forcedPullRequestFull).includes(planFinding));

  const ambientDraftState = structuredClone(valid);
  ambientDraftState.jobs["impact-plan"].steps.find((step) => step.id === "plan").env.PR_DRAFT
    = "${{ github.event.pull_request.draft }}";
  assert.ok(validateCiImpactWorkflowObject(ambientDraftState).includes(planFinding));

  for (const mutate of [
    (source) => source.replace(
      '[[ "$BEFORE_SHA" != "$zero_sha" ]]',
      '[[ "$BEFORE_SHA" == "$zero_sha" ]]',
    ),
    (source) => source.replace(
      'git cat-file -e "${sha}^{commit}"',
      'git rev-parse --verify "$sha"',
    ),
    (source) => source.replace(
      'git merge-base --is-ancestor "$BEFORE_SHA" "$CURRENT_SHA"',
      "true",
    ),
    (source) => source.replace(
      "    go -C tooling run ./cmd/ci-plan plan --root .. \\",
      "    go -C tooling run ./cmd/ci-plan plan --root .. --full \\",
    ),
    (source) => source.replace(
      '--base "$BEFORE_SHA" --head "$CURRENT_SHA" --json \\',
      "--json \\",
    ),
    (source) => source.replace(
      "    go -C tooling run ./cmd/ci-plan plan --root .. --full --json \\",
      "    go -C tooling run ./cmd/ci-plan plan --root .. --json \\",
    ),
    (source) => source.replace(
      "  go -C tooling run ./cmd/ci-plan plan --root .. --full --json \\",
      "  go -C tooling run ./cmd/ci-plan plan --root .. --json \\",
    ),
  ]) {
    const weakenedRouting = structuredClone(valid);
    const routing = weakenedRouting.jobs["impact-plan"].steps.find((step) => step.id === "plan");
    routing.run = mutate(routing.run);
    assert.ok(validateCiImpactWorkflowObject(weakenedRouting).includes(planFinding));
  }

  for (const eventType of ["opened", "synchronize", "reopened"]) {
    const missingCodeUpdate = structuredClone(valid);
    missingCodeUpdate.on.pull_request.types = missingCodeUpdate.on.pull_request.types.filter(
      (type) => type !== eventType,
    );
    assert.ok(validateCiImpactWorkflowObject(missingCodeUpdate).includes(
      ".github/workflows/ci.yml: CI must run on main pushes, manual dispatches, and every pull-request code update",
    ));
  }

  const duplicateTitleGate = structuredClone(valid);
  duplicateTitleGate.jobs["pr-title"] = { "runs-on": "ubuntu-26.04", steps: [] };
  assert.ok(validateCiImpactWorkflowObject(duplicateTitleGate).includes(
    ".github/workflows/ci.yml: CI must delegate PR title validation to the standalone required workflow",
  ));

  const titleOnlyTrigger = structuredClone(valid);
  titleOnlyTrigger.on.pull_request.types.push("edited");
  assert.ok(validateCiImpactWorkflowObject(titleOnlyTrigger).includes(
    ".github/workflows/ci.yml: CI must run on main pushes, manual dispatches, and every pull-request code update",
  ));

  const unselectedDependencyReview = structuredClone(valid);
  unselectedDependencyReview.jobs["dependency-review"].if = "github.event_name == 'pull_request'";
  assert.ok(validateCiImpactWorkflowObject(unselectedDependencyReview).includes(
    ".github/workflows/ci.yml: dependency review must run only for full pull requests or its fixed impact selector and must fail closed",
  ));

  const ignoredDependencyFailure = structuredClone(valid);
  ignoredDependencyFailure.jobs["dependency-review"]["continue-on-error"] = true;
  assert.ok(validateCiImpactWorkflowObject(ignoredDependencyFailure).includes(
    ".github/workflows/ci.yml: dependency review must run only for full pull requests or its fixed impact selector and must fail closed",
  ));

  const openEmptyMatrix = structuredClone(valid);
  openEmptyMatrix.jobs["workstation-artifacts"].if = "needs.impact-plan.outputs.mode == 'impact'";
  assert.ok(validateCiImpactWorkflowObject(openEmptyMatrix).includes(
    ".github/workflows/ci.yml: an empty workstation matrix must skip both workstation jobs and selected tests must use the bounded eight-concurrent-job matrix",
  ));

  for (const job of ["workstation-core", "workstation-artifacts"]) {
    const allowedJobFailure = structuredClone(valid);
    allowedJobFailure.jobs[job]["continue-on-error"] = true;
    assert.ok(validateCiImpactWorkflowObject(allowedJobFailure).includes(
      ".github/workflows/ci.yml: workstation core, setup, and shard execution must fail closed",
    ));
  }

});

test("CI selected-lane aggregation and artifact dispatch fail closed", () => {
  const valid = workflow("ci");
  const successFinding = ".github/workflows/ci.yml: ci-success must reject unexpected states and any skipped selected lane";

  const skippedSelectedLane = structuredClone(valid);
  const success = skippedSelectedLane.jobs["ci-success"].steps.find((step) => (
    step.name === "Require every expected gate state"
  ));
  success.run = success.run.replace(
    'require_selection lane-go "$RESULT_GO" "$SELECT_GO"',
    'require_state lane-go "$RESULT_GO" skipped',
  );
  assert.ok(validateCiImpactWorkflowObject(skippedSelectedLane).includes(successFinding));

  const missingFullRendererGate = structuredClone(valid);
  const missingRendererSource = missingFullRendererGate.jobs["ci-success"].steps.find((step) => (
    step.name === "Require every expected gate state"
  ));
  missingRendererSource.run = missingRendererSource.run.replace(
    'require_selection pdf-renderer-reproducibility "$RESULT_RENDERER" "$SELECT_RENDERER"',
    'require_state pdf-renderer-reproducibility "$RESULT_RENDERER" skipped',
  );
  assert.ok(validateCiImpactWorkflowObject(missingFullRendererGate).includes(successFinding));

  const rendererFoldedIntoFullSelectors = structuredClone(valid);
  const foldedRendererSource = rendererFoldedIntoFullSelectors.jobs["ci-success"].steps.find((step) => (
    step.name === "Require every expected gate state"
  ));
  foldedRendererSource.run = foldedRendererSource.run.replace(
    '"$SELECT_GO" "$SELECT_RELEASE" \\',
    '"$SELECT_GO" "$SELECT_RELEASE" "$SELECT_RENDERER" \\',
  );
  assert.ok(validateCiImpactWorkflowObject(rendererFoldedIntoFullSelectors).includes(successFinding));

  const pullRequestOnlyImpact = structuredClone(valid);
  const pullRequestOnlySource = pullRequestOnlyImpact.jobs["ci-success"].steps.find((step) => (
    step.name === "Require every expected gate state"
  ));
  pullRequestOnlySource.run = pullRequestOnlySource.run.replace(
    'if [[ "$EVENT_NAME" != "pull_request" && "$EVENT_NAME" != "push" ]]; then',
    'if [[ "$EVENT_NAME" != "pull_request" ]]; then',
  );
  assert.ok(validateCiImpactWorkflowObject(pullRequestOnlyImpact).includes(successFinding));

  const pushRunsDependencyReview = structuredClone(valid);
  const pushDependencySource = pushRunsDependencyReview.jobs["ci-success"].steps.find((step) => (
    step.name === "Require every expected gate state"
  ));
  pushDependencySource.run = pushDependencySource.run.replace(
    [
      'if [[ "$EVENT_NAME" == "pull_request" ]]; then',
      '      require_selection dependency-review "$RESULT_DEPENDENCY_REVIEW" "$SELECT_DEPENDENCY"',
      "    else",
      '      require_state dependency-review "$RESULT_DEPENDENCY_REVIEW" skipped',
      "    fi",
    ].join("\n"),
    'require_selection dependency-review "$RESULT_DEPENDENCY_REVIEW" "$SELECT_DEPENDENCY"',
  );
  assert.ok(validateCiImpactWorkflowObject(pushRunsDependencyReview).includes(successFinding));

  const dynamicCommand = structuredClone(valid);
  const artifactStep = dynamicCommand.jobs["workstation-artifacts"].steps.find((step) => (
    step.name === "Run the allowlisted artifact test script"
  ));
  artifactStep.run = 'eval "$PLAN_COMMAND"';
  assert.ok(validateCiImpactWorkflowObject(dynamicCommand).includes(
    ".github/workflows/ci.yml: workstation matrix execution must quote the Go-projected script without a second dispatch table",
  ));

  const unquotedDispatch = structuredClone(valid);
  const unquotedArtifactStep = unquotedDispatch.jobs["workstation-artifacts"].steps.find((step) => (
    step.name === "Run the allowlisted artifact test script"
  ));
  unquotedArtifactStep.run = "npm run $SCRIPT";
  assert.ok(validateCiImpactWorkflowObject(unquotedDispatch).includes(
    ".github/workflows/ci.yml: workstation matrix execution must quote the Go-projected script without a second dispatch table",
  ));

  const ignoredShardFailure = structuredClone(valid);
  ignoredShardFailure.jobs["workstation-artifacts"].steps.find((step) => (
    step.name === "Run the allowlisted artifact test script"
  ))["continue-on-error"] = "${{ true }}";
  assert.ok(validateCiImpactWorkflowObject(ignoredShardFailure).includes(
    ".github/workflows/ci.yml: workstation core, setup, and shard execution must fail closed",
  ));

  const constantArtifact = structuredClone(valid);
  const constantArtifactStep = constantArtifact.jobs["workstation-artifacts"].steps.find((step) => (
    step.name === "Run the allowlisted artifact test script"
  ));
  constantArtifactStep.env.SCRIPT = "test:workstation:fixture-026:shard-1";
  assert.ok(validateCiImpactWorkflowObject(constantArtifact).includes(
    ".github/workflows/ci.yml: workstation matrix execution must quote the Go-projected script without a second dispatch table",
  ));
});

test("CI workstation and success authority cannot be conditionally skipped", () => {
  const valid = workflow("ci");
  const matrixFinding = ".github/workflows/ci.yml: an empty workstation matrix must skip both workstation jobs and selected tests must use the bounded eight-concurrent-job matrix";
  const coreFinding = ".github/workflows/ci.yml: workstation core must run its complete authority step unconditionally";
  const dispatchFinding = ".github/workflows/ci.yml: workstation matrix execution must quote the Go-projected script without a second dispatch table";
  const successFinding = ".github/workflows/ci.yml: ci-success must unconditionally inspect the exact fail-closed state vector";

  const excludedShard = structuredClone(valid);
  excludedShard.jobs["workstation-artifacts"].strategy.matrix.exclude = [
    { artifact: "fixture-026-shard-1" },
  ];
  assert.ok(validateCiImpactWorkflowObject(excludedShard).includes(matrixFinding));

  const artifactOnlyMatrix = structuredClone(valid);
  const artifactOnlyStrategy = artifactOnlyMatrix.jobs["workstation-artifacts"].strategy.matrix;
  artifactOnlyStrategy.artifact = artifactOnlyStrategy.include;
  delete artifactOnlyStrategy.include;
  assert.ok(validateCiImpactWorkflowObject(artifactOnlyMatrix).includes(matrixFinding));

  const skippedCore = structuredClone(valid);
  skippedCore.jobs["workstation-core"].steps.find((step) => (
    step.name === "Validate the workstation inventory and core"
  )).if = "false";
  assert.ok(validateCiImpactWorkflowObject(skippedCore).includes(coreFinding));

  const skippedShard = structuredClone(valid);
  skippedShard.jobs["workstation-artifacts"].steps.find((step) => (
    step.name === "Run the allowlisted artifact test script"
  )).if = "matrix.artifact != 'fixture-026-shard-1'";
  assert.ok(validateCiImpactWorkflowObject(skippedShard).includes(dispatchFinding));

  const ambientArtifact = structuredClone(valid);
  ambientArtifact.jobs["workstation-artifacts"].steps.find((step) => (
    step.name === "Run the allowlisted artifact test script"
  )).env.ARTIFACT = "${{ matrix.artifact }}";
  assert.ok(validateCiImpactWorkflowObject(ambientArtifact).includes(dispatchFinding));

  const skippedSuccess = structuredClone(valid);
  delete skippedSuccess.jobs["ci-success"].if;
  assert.ok(validateCiImpactWorkflowObject(skippedSuccess).includes(successFinding));

  const forgedSuccess = structuredClone(valid);
  forgedSuccess.jobs["ci-success"].steps.find((step) => (
    step.name === "Require every expected gate state"
  )).env.RESULT_WORKSTATION_ARTIFACTS = "success";
  assert.ok(validateCiImpactWorkflowObject(forgedSuccess).includes(successFinding));
});

test("CI proves the pinned gitleaks on a planted secret before it scans the history", () => {
  const valid = workflow("ci");
  const finding = ".github/workflows/ci.yml: secret-scan must prove the pinned gitleaks on a planted secret, then scan the full history reachable from HEAD and fail closed";
  const vectorFinding = ".github/workflows/ci.yml: ci-success must unconditionally inspect the exact fail-closed state vector";
  const needsFinding = ".github/workflows/ci.yml: ci-success must depend on every full, impact, matrix, container, and PR gate";
  const successFinding = ".github/workflows/ci.yml: ci-success must reject unexpected states and any skipped selected lane";
  assert.deepEqual(validateCiImpactWorkflowObject(valid), []);

  for (const mutate of [
    (job) => { job.if = "github.event_name == 'pull_request'"; },
    (job) => { job.needs = "impact-plan"; },
    (job) => { job["continue-on-error"] = true; },
    (job) => { job["timeout-minutes"] = 600; },
    (job) => { job.permissions.contents = "write"; },
    (job) => { delete job.steps[0].with["fetch-depth"]; },
    (job) => { job.steps[0].with["persist-credentials"] = true; },
    (job) => { job.steps.splice(2, 1); },
    (job) => { [job.steps[2], job.steps[3]] = [job.steps[3], job.steps[2]]; },
    (job) => { job.steps[2]["continue-on-error"] = true; },
    (job) => { job.steps[2].run = "echo go -C tooling run ./cmd/20w security gitleaks-canary --root .."; },
    (job) => { job.steps[3].run += " || true"; },
    (job) => { job.steps[3].run = job.steps[3].run.replace("--exit-code 1", "--exit-code 0"); },
    (job) => { job.steps[3].run = job.steps[3].run.replace(" --ignore-gitleaks-allow", ""); },
    (job) => { job.steps[3].run = job.steps[3].run.replace("--log-opts=HEAD", "--log-opts=-1"); },
    (job) => { job.steps[3].if = "false"; },
    (job) => { delete job.steps[3]["working-directory"]; },
  ]) {
    const weakened = structuredClone(valid);
    const before = JSON.stringify(weakened.jobs["secret-scan"]);
    mutate(weakened.jobs["secret-scan"]);
    assert.notEqual(JSON.stringify(weakened.jobs["secret-scan"]), before, "the mutation must change the job");
    assert.ok(validateCiImpactWorkflowObject(weakened).includes(finding));
  }

  const removed = structuredClone(valid);
  delete removed.jobs["secret-scan"];
  assert.ok(validateCiImpactWorkflowObject(removed).includes(finding));

  const unwired = structuredClone(valid);
  unwired.jobs["ci-success"].needs = unwired.jobs["ci-success"].needs.filter((job) => job !== "secret-scan");
  assert.ok(validateCiImpactWorkflowObject(unwired).includes(needsFinding));

  const forged = structuredClone(valid);
  const forgedStep = forged.jobs["ci-success"].steps.find((step) => step.name === "Require every expected gate state");
  forgedStep.env.RESULT_SECRET_SCAN = "success";
  assert.ok(validateCiImpactWorkflowObject(forged).includes(vectorFinding));

  for (const replacement of [
    'require_state secret-scan "$RESULT_SECRET_SCAN" skipped\n',
    "",
    'if false; then require_state secret-scan "$RESULT_SECRET_SCAN" success\nfi\n',
  ]) {
    const unchecked = structuredClone(valid);
    const step = unchecked.jobs["ci-success"].steps.find((candidate) => candidate.name === "Require every expected gate state");
    const before = step.run;
    step.run = before.replace('require_state secret-scan "$RESULT_SECRET_SCAN" success\n', replacement);
    assert.notEqual(step.run, before, "the mutation must change the script");
    assert.ok(validateCiImpactWorkflowObject(unchecked).includes(successFinding));
  }
});

test("CI success accepts only the exact full or selected impact state vector", () => {
  const subject = workflow("ci");
  const source = subject.jobs["ci-success"].steps.find((step) => (
    step.name === "Require every expected gate state"
  )).run;
  assert.equal(runCiSuccessGate(source).status, 0);
  assert.equal(runCiSuccessGate(source, {
    SELECT_RENDERER: "true",
    RESULT_RENDERER: "success",
  }).status, 0, "a full plan may select the orthogonal renderer gate");

  const impact = {
    EVENT_NAME: "pull_request",
    MODE: "impact",
    SELECT_DEPENDENCY: "true",
    SELECT_SITE: "true",
    SELECT_WORKSTATION: "true",
    RESULT_QUALITY_FULL: "skipped",
    RESULT_IMPACT_COMMON: "success",
    RESULT_SITE: "success",
    RESULT_WORKSTATION_CORE: "success",
    RESULT_WORKSTATION_ARTIFACTS: "success",
    RESULT_CONTAINER: "skipped",
    RESULT_DEPENDENCY_REVIEW: "success",
  };
  assert.equal(runCiSuccessGate(source, impact).status, 0);
  const pushImpact = {
    ...impact,
    EVENT_NAME: "push",
    RESULT_DEPENDENCY_REVIEW: "skipped",
  };
  assert.equal(
    runCiSuccessGate(source, pushImpact).status,
    0,
    "a comparable main push may use impact mode and must skip dependency review",
  );
  assert.equal(runCiSuccessGate(source, {
    ...impact,
    SELECT_RENDERER: "true",
    RESULT_RENDERER: "success",
  }).status, 0, "an impact plan may select the orthogonal renderer gate");
  assert.equal(runCiSuccessGate(source, {
    ...impact,
    SELECT_DEPENDENCY: "false",
    RESULT_DEPENDENCY_REVIEW: "skipped",
  }).status, 0);
  assert.equal(runCiSuccessGate(source, {
    EVENT_NAME: "pull_request",
    RESULT_DEPENDENCY_REVIEW: "success",
  }).status, 0, "a full pull request must require dependency review");
  assert.notEqual(runCiSuccessGate(source, {
    ...impact,
    RESULT_WORKSTATION_ARTIFACTS: "skipped",
  }).status, 0, "a selected matrix may not skip");
  assert.notEqual(runCiSuccessGate(source, {
    ...impact,
    RESULT_GO: "success",
  }).status, 0, "an unselected lane may not succeed unexpectedly");
  assert.notEqual(runCiSuccessGate(source, {
    ...impact,
    RESULT_RENDERER: "success",
  }).status, 0, "an unselected renderer gate may not run unexpectedly");
  assert.notEqual(runCiSuccessGate(source, {
    ...impact,
    SELECT_RENDERER: "true",
    RESULT_RENDERER: "skipped",
  }).status, 0, "a selected renderer gate may not skip");
  assert.notEqual(runCiSuccessGate(source, {
    ...impact,
    RESULT_SITE: "cancelled",
  }).status, 0, "a selected lane may not be cancelled");
  assert.notEqual(runCiSuccessGate(source, {
    ...impact,
    SELECT_DEPENDENCY: "false",
    RESULT_DEPENDENCY_REVIEW: "success",
  }).status, 0, "an unselected dependency review may not run unexpectedly");
  assert.notEqual(runCiSuccessGate(source, {
    ...pushImpact,
    RESULT_DEPENDENCY_REVIEW: "success",
  }).status, 0, "a push must not run dependency review even when its semantic selector is true");
  assert.notEqual(runCiSuccessGate(source, {
    ...impact,
    EVENT_NAME: "workflow_dispatch",
    RESULT_DEPENDENCY_REVIEW: "skipped",
  }).status, 0, "manual dispatch may not enter impact mode");
  assert.notEqual(runCiSuccessGate(source, {
    SELECT_GO: "true",
  }).status, 0, "full mode must expose false semantic selectors");
  for (const state of ["failure", "skipped", "cancelled", ""]) {
    assert.notEqual(runCiSuccessGate(source, {
      RESULT_SECRET_SCAN: state,
    }).status, 0, `a full plan may not accept a secret scan state of "${state}"`);
    assert.notEqual(runCiSuccessGate(source, {
      ...impact,
      RESULT_SECRET_SCAN: state,
    }).status, 0, `an impact plan may not accept a secret scan state of "${state}"`);
  }
  assert.notEqual(runCiSuccessGate(source, {
    SELECT_DEPENDENCY: "true",
  }).status, 0, "full mode must expose a false dependency selector");
  assert.notEqual(runCiSuccessGate(source, {
    SELECT_WORKSTATION: "false",
  }).status, 0, "full mode must expose its closed workstation matrix");
  assert.notEqual(runCiSuccessGate(source, {
    RESULT_WORKSTATION_ARTIFACTS: "skipped",
  }).status, 0, "the full workstation matrix may not skip");
});

test("repository metadata synchronization is manifest-triggered and least-privileged", () => {
  const valid = workflow("sync-repository-metadata");
  assert.deepEqual(validateRepositoryMetadataSyncWorkflowObject(valid), []);

  const tampered = structuredClone(valid);
  tampered.jobs.sync.permissions.contents = "write";
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(tampered).includes(
    ".github/workflows/sync-repository-metadata.yml: repository metadata synchronization needs only contents:read, issues:write, and pull-requests:write",
  ));

  const readOnlyPullRequests = structuredClone(valid);
  readOnlyPullRequests.jobs.sync.permissions["pull-requests"] = "read";
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(readOnlyPullRequests).includes(
    ".github/workflows/sync-repository-metadata.yml: repository metadata synchronization needs only contents:read, issues:write, and pull-requests:write",
  ));

  for (const mutate of [
    (candidate) => { candidate.concurrency.group = "mutable"; },
    (candidate) => { candidate.concurrency["cancel-in-progress"] = true; },
    (candidate) => { delete candidate.concurrency.queue; },
    (candidate) => { candidate.concurrency.queue = "single"; },
    (candidate) => { candidate.jobs.sync["continue-on-error"] = true; },
    (candidate) => { candidate.jobs.sync.steps.at(-1)["continue-on-error"] = true; },
    (candidate) => { candidate.jobs.sync.if = "${{ false }}"; },
    (candidate) => { candidate.jobs.sync.defaults = { run: { shell: "true {0}" } }; },
    (candidate) => { candidate.jobs.sync.steps.at(-1).shell = "true {0}"; },
    (candidate) => { candidate.jobs.sync.steps.find((step) => step.uses?.startsWith("actions/setup-go@")).if = "${{ false }}"; },
  ]) {
    const bypassed = structuredClone(valid);
    mutate(bypassed);
    assert.ok(validateRepositoryMetadataSyncWorkflowObject(bypassed).includes(
      ".github/workflows/sync-repository-metadata.yml: repository metadata synchronization must use GitHub's maximum pending queue without cancellation or failure bypass",
    ));
  }

  const untrustedCheckout = structuredClone(valid);
  const checkout = untrustedCheckout.jobs.sync.steps.find(
    (step) => step.uses?.startsWith("actions/checkout@"),
  );
  checkout.with.ref = "refs/heads/feature";
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(untrustedCheckout).includes(
    ".github/workflows/sync-repository-metadata.yml: manual metadata repair must still check out canonical main",
  ));

  const incompleteTrigger = structuredClone(valid);
  incompleteTrigger.on.push.paths = incompleteTrigger.on.push.paths.filter(
    (entry) => entry !== ".github/issue-milestones.json",
  );
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(incompleteTrigger).includes(
    ".github/workflows/sync-repository-metadata.yml: repository metadata synchronization must run for issue close/reopen events, all three canonical manifests and every owned metadata source on main, and manual repair",
  ));

  const missingLifecycleSource = structuredClone(valid);
  missingLifecycleSource.on.push.paths = missingLifecycleSource.on.push.paths.filter(
    (entry) => entry !== "tooling/internal/githubissuelifecycle/**",
  );
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(missingLifecycleSource).includes(
    ".github/workflows/sync-repository-metadata.yml: repository metadata synchronization must run for issue close/reopen events, all three canonical manifests and every owned metadata source on main, and manual repair",
  ));

  const missingPullRequestLifecycleSource = structuredClone(valid);
  missingPullRequestLifecycleSource.on.push.paths = missingPullRequestLifecycleSource.on.push.paths.filter(
    (entry) => entry !== "tooling/internal/githubprmetadata/**",
  );
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(missingPullRequestLifecycleSource).includes(
    ".github/workflows/sync-repository-metadata.yml: repository metadata synchronization must run for issue close/reopen events, all three canonical manifests and every owned metadata source on main, and manual repair",
  ));

  const missingRetrySource = structuredClone(valid);
  missingRetrySource.on.push.paths = missingRetrySource.on.push.paths.filter(
    (entry) => entry !== "tooling/internal/githubapi/**",
  );
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(missingRetrySource).includes(
    ".github/workflows/sync-repository-metadata.yml: repository metadata synchronization must run for issue close/reopen events, all three canonical manifests and every owned metadata source on main, and manual repair",
  ));

  const missingLifecycleTrigger = structuredClone(valid);
  delete missingLifecycleTrigger.on.issues;
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(missingLifecycleTrigger).includes(
    ".github/workflows/sync-repository-metadata.yml: repository metadata synchronization must run for issue close/reopen events, all three canonical manifests and every owned metadata source on main, and manual repair",
  ));

  const unboundLifecycle = structuredClone(valid);
  const lifecycle = unboundLifecycle.jobs.sync.steps.find(
    (step) => step.name === "Reconcile the managed issue lifecycle",
  );
  lifecycle.env.ISSUE_ACTION = "reopened";
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(unboundLifecycle).includes(
    ".github/workflows/sync-repository-metadata.yml: closed and reopened issues must pass trusted event identity to the bounded Go lifecycle repair",
  ));

  const eventRunsFullSync = structuredClone(valid);
  eventRunsFullSync.jobs.sync.steps.find(
    (step) => step.name === "Create or repair managed metadata",
  ).if = undefined;
  assert.ok(validateRepositoryMetadataSyncWorkflowObject(eventRunsFullSync).includes(
    ".github/workflows/sync-repository-metadata.yml: the trusted Go command must apply canonical labels, milestones, and mapped issue assignments with the job token",
  ));
});

test("Go renderer and CI owners retain their path-derived pull-request labels", () => {
  const rules = parse(readFileSync(new URL("../.github/labeler.yml", import.meta.url), "utf8"));
  const labelsFor = (file) => Object.entries(rules).filter(([, groups]) => groups.some(
    (group) => group["changed-files"].some((rule) => rule["any-glob-to-any-file"].some(
      (pattern) => path.matchesGlob(file, pattern),
    )),
  )).map(([label]) => label).sort();
  const rendererLabels = ["area:ci", "area:publication"];
  for (const file of [
    "tooling/cmd/pdf-proof/main.go",
    "tooling/internal/pdfrendercli/cli_test.go",
    "tooling/internal/pdfrender/installed_dependencies.go",
    "tooling/internal/pdfrender/installed_boundaries_test.go",
    "tooling/internal/pdfrenderlock/lock.go",
    "tooling/pdf-renderer/lock.json",
  ]) assert.deepEqual(labelsFor(file), rendererLabels, file);
  assert.deepEqual(labelsFor("tooling/internal/ciplan/plan_test.go"), ["area:ci"]);
  for (const file of [
    "tooling/internal/clrscontext/context.go",
    "tooling/internal/clrscontext/source_test.go",
  ]) assert.deepEqual(labelsFor(file), ["area:ci", "area:experiment"], file);
  for (const file of [
    "tooling/internal/experimentcli/clrs_context.go",
    "tooling/internal/experimentcli/clrs_context_test.go",
    "tooling/internal/experimentcli/catalog.go",
    "tooling/internal/experimentcli/cli.go",
    "tooling/internal/experimentcli/future_command_test.go",
    "tooling/internal/experimentcli/clrs_compare.go",
    "tooling/internal/experimentcli/clrs_compare_test.go",
    "tooling/internal/clrsfixture/compare.go",
    "tooling/internal/clrsfixture/compare_files.go",
    "tooling/internal/clrsfixture/compare_test.go",
    "tooling/internal/experimentcli/clrs_sbom.go",
    "tooling/internal/experimentcli/clrs_sbom_test.go",
    "tooling/internal/clrsfixture/sbom.go",
    "tooling/internal/clrsfixture/sbom_execution.go",
    "tooling/internal/clrsfixture/sbom_files.go",
    "tooling/internal/clrsfixture/sbom_inventory.go",
    "tooling/internal/clrsfixture/sbom_receipt.go",
    "tooling/internal/clrsfixture/sbom_test.go",
    "tooling/internal/clrsfixture/sbom_test_fixture_test.go",
    "tooling/internal/clrsfixture/sbom_validation_test.go",
    "tooling/internal/experimentcli/clrs_invocation.go",
    "tooling/internal/experimentcli/clrs_invocation_test.go",
    "tooling/internal/clrsfixture/invocation.go",
    "tooling/internal/clrsfixture/invocation_payload.go",
    "tooling/internal/clrsfixture/invocation_test.go",
    "tooling/internal/experimentcli/clrs_generation.go",
    "tooling/internal/experimentcli/clrs_generation_test.go",
    "tooling/internal/clrsfixture/generation_run.go",
    "tooling/internal/clrsfixture/generation_run_command_test.go",
    "tooling/internal/clrsfixture/generation_run_publish.go",
    "tooling/internal/clrsfixture/generation_run_safety_test.go",
  ]) assert.deepEqual(labelsFor(file), ["area:experiment"], file);
  for (const file of [
    "tooling/internal/pdftools/candidate_output.go",
    "tooling/pdf-tools/contract.json",
    "tooling/cmd/20w/pdf_tools_test.go",
    "scripts/book-support-sources.json",
  ]) assert.deepEqual(labelsFor(file), ["area:publication"], file);
  for (const file of [
    "tooling/internal/experimentcli-unrelated/example.go",
    "tooling/internal/pdfrender-unrelated/example.go",
    "tooling/internal/clrscontext-unrelated/example.go",
    "tooling/cmd/20w/clrs_context_other.go",
    "tooling/cmd/20w/clrs_compare_other.go",
    "tooling/internal/clrsfixture/compare_other.go",
    "tooling/cmd/20w/clrs_sbom_other.go",
    "tooling/internal/clrsfixture/sbom_other.go",
    "tooling/cmd/20w/clrs_invocation_other.go",
    "tooling/internal/clrsfixture/invocation_other.go",
    "tooling/internal/clrsfixture-other/generation_run.go",
    "tooling/internal/clrsfixture/generation_run.txt",
    "tooling/internal/clrsfixture/generation_run/nested.go",
    "tooling/internal/clrsfixture/image.go",
    "tooling/cmd/20w/main.go",
  ]) assert.deepEqual(labelsFor(file), [], file);
});

test("pull-request metadata uses only trusted main and explicit bounded authority", () => {
  const relativePath = ".github/workflows/labeler.yml";
  const valid = workflow("labeler");
  const triggerFinding = `${relativePath}: trusted metadata projection and lifecycle cleanup must run on opened, edited, synchronized, reopened, and closed pull requests`;
  const permissionFinding = `${relativePath}: pull-request metadata needs only contents:read, issues:write, and pull-requests:write at job scope`;
  const stepsFinding = `${relativePath}: pull-request metadata must skip path labeling on close, check out only trusted main, and run the exact bounded Go projection and lifecycle cleanup`;
  const boundaryFinding = `${relativePath}: pull-request metadata must keep its bounded hosted runner and maximum per-pull-request pending queue`;
  assert.deepEqual(validatePullRequestMetadataWorkflowObject(valid), []);

  const missingEdited = structuredClone(valid);
  missingEdited.on.pull_request_target.types = missingEdited.on.pull_request_target.types.filter(
    (type) => type !== "edited",
  );
  assert.ok(validatePullRequestMetadataWorkflowObject(missingEdited).includes(triggerFinding));

  const broadPermission = structuredClone(valid);
  broadPermission.jobs.label.permissions.contents = "write";
  assert.ok(validatePullRequestMetadataWorkflowObject(broadPermission).includes(permissionFinding));

  const untrustedCheckout = structuredClone(valid);
  untrustedCheckout.jobs.label.steps.find(
    (step) => step.uses?.startsWith("actions/checkout@"),
  ).with.ref = "${{ github.event.pull_request.head.sha }}";
  assert.ok(validatePullRequestMetadataWorkflowObject(untrustedCheckout).includes(stepsFinding));

  const stalePathLabels = structuredClone(valid);
  stalePathLabels.jobs.label.steps.find(
    (step) => step.uses?.startsWith("actions/labeler@"),
  ).with["sync-labels"] = false;
  assert.ok(validatePullRequestMetadataWorkflowObject(stalePathLabels).includes(stepsFinding));

  const pathLabelerRunsOnClosed = structuredClone(valid);
  delete pathLabelerRunsOnClosed.jobs.label.steps.find(
    (step) => step.uses?.startsWith("actions/labeler@"),
  ).if;
  assert.ok(validatePullRequestMetadataWorkflowObject(pathLabelerRunsOnClosed).includes(stepsFinding));

  const commandDrift = structuredClone(valid);
  commandDrift.jobs.label.steps.find(
    (step) => step.run?.includes("sync-pr-metadata"),
  ).run = "go run ./untrusted-command";
  assert.ok(validatePullRequestMetadataWorkflowObject(commandDrift).includes(stepsFinding));

  const missingMergedIdentity = structuredClone(valid);
  delete missingMergedIdentity.jobs.label.steps.find(
    (step) => step.run?.includes("sync-pr-metadata"),
  ).env.PULL_REQUEST_MERGED;
  assert.ok(validatePullRequestMetadataWorkflowObject(missingMergedIdentity).includes(stepsFinding));

  const bypassedCleanup = structuredClone(valid);
  bypassedCleanup.jobs.label.steps.find(
    (step) => step.run?.includes("sync-pr-metadata"),
  ).if = "github.event.action != 'closed'";
  assert.ok(validatePullRequestMetadataWorkflowObject(bypassedCleanup).includes(stepsFinding));

  const ignoredCleanupFailure = structuredClone(valid);
  ignoredCleanupFailure.jobs.label.steps.find(
    (step) => step.run?.includes("sync-pr-metadata"),
  )["continue-on-error"] = true;
  assert.ok(validatePullRequestMetadataWorkflowObject(ignoredCleanupFailure).includes(stepsFinding));

  const bypassShell = structuredClone(valid);
  bypassShell.jobs.label.steps.find(
    (step) => step.run?.includes("sync-pr-metadata"),
  ).shell = "true {0}";
  assert.ok(validatePullRequestMetadataWorkflowObject(bypassShell).includes(stepsFinding));

  const cancellableRepair = structuredClone(valid);
  cancellableRepair.concurrency["cancel-in-progress"] = true;
  assert.ok(validatePullRequestMetadataWorkflowObject(cancellableRepair).includes(boundaryFinding));

  const defaultPendingSlot = structuredClone(valid);
  delete defaultPendingSlot.concurrency.queue;
  assert.ok(validatePullRequestMetadataWorkflowObject(defaultPendingSlot).includes(boundaryFinding));

  const replaceablePendingSlot = structuredClone(valid);
  replaceablePendingSlot.concurrency.queue = "single";
  assert.ok(validatePullRequestMetadataWorkflowObject(replaceablePendingSlot).includes(boundaryFinding));
});

test("the label manifest closes the accepted pull-request title types", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("../.github/labels.json", import.meta.url),
    "utf8",
  ));
  const valid = workflow("pr-title");
  const finding = ".github/workflows/pr-title.yml: PR title types must exactly match managed type:* labels in .github/labels.json";
  assert.deepEqual(validatePullRequestTitleTypeAuthority(valid, manifest), []);

  const staleOnEdit = structuredClone(valid);
  staleOnEdit.on.pull_request_target.types = staleOnEdit.on.pull_request_target.types.filter(
    (event) => event !== "edited",
  );
  assert.deepEqual(validatePullRequestTitleTypeAuthority(staleOnEdit, manifest), [finding]);

  const missingType = structuredClone(valid);
  const titleStep = missingType.jobs["pr-title"].steps.find(
    (step) => step.run?.includes("PR title must use Conventional Commits"),
  );
  titleStep.run = titleStep.run.replace("|perf", "");
  assert.deepEqual(validatePullRequestTitleTypeAuthority(missingType, manifest), [finding]);

  const unmanagedType = structuredClone(valid);
  const unmanagedStep = unmanagedType.jobs["pr-title"].steps.find(
    (step) => step.run?.includes("PR title must use Conventional Commits"),
  );
  unmanagedStep.run = unmanagedStep.run.replace("|revert)", "|revert|unknown)");
  assert.deepEqual(validatePullRequestTitleTypeAuthority(unmanagedType, manifest), [finding]);

  const appendedAlternative = structuredClone(valid);
  const appendedStep = appendedAlternative.jobs["pr-title"].steps.find(
    (step) => step.run?.includes("PR title must use Conventional Commits"),
  );
  appendedStep.run = appendedStep.run.replace("(!)?:", "(!)?:|^unknown:");
  assert.deepEqual(validatePullRequestTitleTypeAuthority(appendedAlternative, manifest), [finding]);

  for (const field of ["if", "continue-on-error", "shell"]) {
    const bypassed = structuredClone(valid);
    const bypassedStep = bypassed.jobs["pr-title"].steps.find(
      (step) => step.run?.includes("PR title must use Conventional Commits"),
    );
    bypassedStep[field] = field === "if" ? "${{ false }}" : field === "shell" ? "true {0}" : true;
    assert.deepEqual(validatePullRequestTitleTypeAuthority(bypassed, manifest), [finding]);
  }

  for (const [field, value] of [
    ["continue-on-error", true],
    ["defaults", { run: { shell: "true {0}" } }],
  ]) {
    const bypassed = structuredClone(valid);
    bypassed.jobs["pr-title"][field] = value;
    assert.deepEqual(validatePullRequestTitleTypeAuthority(bypassed, manifest), [finding]);
  }

  const workflowShellBypass = structuredClone(valid);
  workflowShellBypass.defaults = { run: { shell: "true {0}" } };
  assert.deepEqual(validatePullRequestTitleTypeAuthority(workflowShellBypass, manifest), [finding]);
});

test("retired ChatGPT Site paths remain forbidden", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-retired-hosting-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(path.join(root, ".openai"), { recursive: true });
  writeFileSync(path.join(root, ".openai", "hosting.json"), "{}\n");
  assert.deepEqual(validateRetiredHostingPaths(root), [
    ".openai/hosting.json: retired ChatGPT Site path must remain absent",
  ]);
});

test("unpinned image definitions label the canonical repository source", (t) => {
  assert.deepEqual(validateUnpinnedImageSourceLabels(), []);

  const root = mkdtempSync(path.join(tmpdir(), "20w-image-source-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const label = (url) => `LABEL org.opencontainers.image.source="${url}" \\\n      org.opencontainers.image.licenses="EUPL-1.2"\n`;
  const canonical = label("https://github.com/cordanaLLM/20-watts-was-enough");
  const definitions = [
    "tooling/Dockerfile",
    "tooling/clrs-specialist/Dockerfile",
    "experiments/workstation/Dockerfile.node-artifact",
    "experiments/workstation/fixture-019/Dockerfile",
  ];
  for (const relativePath of definitions) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), canonical);
  }
  assert.deepEqual(validateUnpinnedImageSourceLabels(root), []);

  writeFileSync(path.join(root, definitions[0]), label("https://github.com/lusoris/20-watts-was-enough"));
  writeFileSync(
    path.join(root, definitions[1]),
    `${canonical}LABEL org.opencontainers.image.source=https://github.com/lusoris/20-watts-was-enough\n`,
  );
  rmSync(path.join(root, definitions[3]));
  const finding = (relativePath) =>
    `${relativePath}: org.opencontainers.image.source must be https://github.com/cordanaLLM/20-watts-was-enough exactly once`;
  assert.deepEqual(validateUnpinnedImageSourceLabels(root), [
    finding(definitions[0]),
    finding(definitions[1]),
    finding(definitions[3]),
  ]);
});

test("experiment reports separate immutable digests from discovery tags", () => {
  const relativePath = ".github/ISSUE_TEMPLATE/experiment-protocol-problem.yml";
  const form = parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
  assert.deepEqual(validateExperimentReportIdentity(form), []);

  const tampered = structuredClone(form);
  tampered.body.find((item) => item.id === "released_image_digest").attributes.description = "Tag or digest";
  assert.ok(validateExperimentReportIdentity(tampered).includes(
    `${relativePath}: experiment reports must request an exact released image@sha256 identity`,
  ));
});

test("failed experiment runs use a short, redaction-aware intake", () => {
  const relativePath = ".github/ISSUE_TEMPLATE/experiment-run-failure.yml";
  const form = parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
  assert.deepEqual(validateExperimentRunFailureForm(form), []);

  const tampered = structuredClone(form);
  tampered.body.find((item) => item.id === "platform").validations.required = false;
  delete tampered.body.find((item) => item.id === "command").attributes.render;
  tampered.body.find((item) => item.id === "confirmation").attributes.options.pop();
  tampered.body.push({ type: "input", id: "unbounded_extra" });
  const findings = validateExperimentRunFailureForm(tampered);
  assert.ok(findings.includes(`${relativePath}: failed-run intake must remain a short form with at most seven body items`));
  assert.ok(findings.includes(`${relativePath}: platform must be a required input field`));
  assert.ok(findings.includes(`${relativePath}: command must be rendered as shell input`));
  assert.ok(findings.includes(`${relativePath}: submission checks must require redaction and public-report consent`));
});

test("issue-form validation rejects duplicate authority field IDs", () => {
  const findings = validateIssueForm({
    name: "Evidence correction",
    description: "Correct an evidence record.",
    title: "[Evidence]: ",
    body: [
      { type: "input", id: "claim_id" },
      { type: "textarea", id: "claim_id" },
    ],
  });

  assert.deepEqual(findings, ["issue-form.yml: duplicate field id claim_id"]);
});

test("funding validation accepts only the verified maintainer identities", () => {
  assert.deepEqual(validateFundingConfig({ github: ["lusoris"], ko_fi: "lusoris" }), []);
  assert.deepEqual(
    validateFundingConfig({ github: ["someone-else"], ko_fi: "lusoris", custom: "https://example.com" }),
    [
      ".github/FUNDING.yml: unverified funding platform custom",
      ".github/FUNDING.yml: github must contain only the verified lusoris sponsor identity",
    ],
  );
});

test("issue configuration requires private-security and support routes", () => {
  const validLink = (name, url) => ({ name, url, about: "Use this route." });
  assert.deepEqual(validateIssueConfig({
    blank_issues_enabled: false,
    contact_links: [
      validLink("Security", "https://github.com/cordanaLLM/20-watts-was-enough/security/advisories/new"),
      validLink("Support", "https://github.com/cordanaLLM/20-watts-was-enough/blob/main/SUPPORT.md"),
    ],
  }), []);
  assert.deepEqual(
    validateIssueConfig({ blank_issues_enabled: true, contact_links: [] }),
    [
      ".github/ISSUE_TEMPLATE/config.yml: blank issues must remain disabled",
      ".github/ISSUE_TEMPLATE/config.yml: missing required contact link https://github.com/cordanaLLM/20-watts-was-enough/security/advisories/new",
      ".github/ISSUE_TEMPLATE/config.yml: missing required contact link https://github.com/cordanaLLM/20-watts-was-enough/blob/main/SUPPORT.md",
    ],
  );
});

test("release policy rejects a tag that is not bound to origin/main", () => {
  const findings = validateReleaseWorkflowObject({
    jobs: {
      verify: {
        steps: [{ id: "release-ref", run: "git rev-parse HEAD" }],
      },
    },
  });

  const diagnostic = findings.join("\n");
  assert.match(diagnostic, /origin\/main is unavailable/u);
  assert.match(diagnostic, /contained in origin\/main/u);
  assert.match(diagnostic, /triggering event SHA/u);
  assert.match(diagnostic, /exact tag ref and commit/u);
  assert.match(diagnostic, /tag-bound PDF render/u);
  assert.match(diagnostic, /native 20w binaries/u);
  assert.match(diagnostic, /must follow the native binary build/u);
});

test("release policy binds native binaries and ingests them after the PDF render", () => {
  const valid = workflow("release");
  assert.deepEqual(validateReleaseWorkflowObject(valid), []);

  const tampered = structuredClone(valid);
  const preparation = tampered.jobs.verify.steps.find((step) => (
    typeof step.run === "string" && step.run.includes("npm run prepare:release")
  ));
  preparation.run = preparation.run.replace(" --additional-assets-root build/release-inputs", "");
  assert.ok(validateReleaseWorkflowObject(tampered).includes(
    ".github/workflows/release.yml: release preparation must ingest the native binaries as additional assets",
  ));

  const escapedReleasePlan = structuredClone(valid);
  const execution = escapedReleasePlan.jobs.verify.steps.find((step) => (
    typeof step.run === "string" && step.run.includes("experiment release-plan")
  ));
  execution.run = execution.run.replace(
    "> build/release-inputs/experiment-release-plan.json",
    "> ../build/release-inputs/experiment-release-plan.json",
  );
  assert.ok(validateReleaseWorkflowObject(escapedReleasePlan).includes(
    ".github/workflows/release.yml: the release plan redirect must stay inside the repository release-input directory",
  ));

  const ambientPDFBuilder = structuredClone(valid);
  ambientPDFBuilder.jobs.verify.steps.find(
    (step) => step.name === "Set up the locked PDF Docker Buildx client",
  ).with.version = "latest";
  assert.ok(validateReleaseWorkflowObject(ambientPDFBuilder).includes(
    ".github/workflows/release.yml: tag-bound PDF rendering must provision the locked Buildx client and BuildKit image after the source gate",
  ));

  const latePDFBuilder = structuredClone(valid);
  const verifySteps = latePDFBuilder.jobs.verify.steps;
  const builderIndex = verifySteps.findIndex(
    (step) => step.name === "Set up the locked PDF Docker Buildx client",
  );
  const [builder] = verifySteps.splice(builderIndex, 1);
  const renderIndex = verifySteps.findIndex((step) => step.name === "Render the immutable tag-bound book");
  verifySteps.splice(renderIndex + 1, 0, builder);
  assert.ok(validateReleaseWorkflowObject(latePDFBuilder).includes(
    ".github/workflows/release.yml: tag-bound PDF rendering must provision the locked Buildx client and BuildKit image after the source gate",
  ));

  const incompleteAttestation = structuredClone(valid);
  const attestation = releaseImageStepByName(incompleteAttestation, "Attest the complete release asset inventory");
  attestation.with["subject-path"] = "build/release/assets/SHA256SUMS";
  assert.ok(validateReleaseWorkflowObject(incompleteAttestation).includes(
    ".github/workflows/release.yml: checksums and provenance must cover the exact generated release asset directory",
  ));

  const publishedMutation = structuredClone(valid);
  delete releaseImageStepByName(
    publishedMutation,
    "Attest the complete release asset inventory",
  ).if;
  assert.ok(validateReleaseWorkflowObject(publishedMutation).includes(
    ".github/workflows/release.yml: checksums and provenance must cover the exact generated release asset directory",
  ));
});

test("release PDF rendering binds only the exact verified tag and commit", async (t) => {
  const diagnostic = ".github/workflows/release.yml: release PDF render must use its exact reviewed step, verified tag and commit outputs, and bounded command without a failure bypass";
  const renderStep = (subject) => subject.jobs.verify.steps.find((step) => (
    step.name === "Render the immutable tag-bound book"
  ));
  const cases = {
    "missing revision": (subject) => {
      renderStep(subject).run = 'npm run generate:book-pdf -- --ref "$RELEASE_TAG"';
    },
    "ambient commit": (subject) => {
      renderStep(subject).env.RELEASE_COMMIT = "${{ github.sha }}";
    },
    "additional ambient input": (subject) => {
      renderStep(subject).env.GITHUB_SHA = "${{ github.sha }}";
    },
    "reordered command": (subject) => {
      renderStep(subject).run = 'npm run generate:book-pdf -- --revision "$RELEASE_COMMIT" --ref "$RELEASE_TAG"';
    },
    "renamed step": (subject) => {
      renderStep(subject).name = "Render release PDF";
    },
    "continue-on-error bypass": (subject) => {
      renderStep(subject)["continue-on-error"] = true;
    },
    "conditional bypass": (subject) => {
      renderStep(subject).if = "${{ always() }}";
    },
    "render before Buildx": (subject) => {
      const steps = subject.jobs.verify.steps;
      const renderIndex = steps.findIndex((step) => step.name === "Render the immutable tag-bound book");
      const [render] = steps.splice(renderIndex, 1);
      const setupIndex = steps.findIndex((step) => step.name === "Set up the locked PDF Docker Buildx client");
      steps.splice(setupIndex, 0, render);
    },
  };

  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, () => {
      const subject = structuredClone(workflow("release"));
      mutate(subject);
      const findings = validateReleaseWorkflowObject(subject);
      if (name === "render before Buildx") {
        assert.ok(findings.includes(
          ".github/workflows/release.yml: tag-bound PDF rendering must provision the locked Buildx client and BuildKit image after the source gate",
        ));
      } else {
        assert.ok(findings.includes(diagnostic), JSON.stringify(findings));
      }
    });
  }
});

test("release publication preserves generated notes before appending image identities", () => {
  assertWorkflowTamper(
    "release",
    validateReleaseExperimentImageWorkflowObject,
    (subject) => {
      const notes = releaseImageStepByName(subject, "Add immutable container identities to the release notes");
      notes.run = notes.run.replace('cp build/release/release-notes.md "$notes"', ': > "$notes"');
    },
    ".github/workflows/release.yml: published release notes must preserve the generated changelog and disclosure link",
  );
});

test("release publication requires anonymous pulls of all final image digests", () => {
  const anonymousFinding = ".github/workflows/release.yml: final release image digests must pass anonymous pulls with an empty Docker configuration";
  for (const mutate of [
    (subject) => {
      const pull = releaseImageStepByName(subject, "Prove final image digests are anonymously pullable");
      pull.run = pull.run.replace('DOCKER_CONFIG="$anonymous_config" docker pull "$image"', 'docker pull "$image"');
    },
    (subject) => {
      const pull = releaseImageStepByName(subject, "Prove final image digests are anonymously pullable");
      pull.run = pull.run.replace('printf \'%s\\n\' \'{"auths":{}}\' > "$anonymous_config/config.json"', "docker login ghcr.io");
    },
    (subject) => {
      const pull = releaseImageStepByName(subject, "Prove final image digests are anonymously pullable");
      pull.run = pull.run.replace('ghcr.io/${IMAGE_REPOSITORY}-fixture-019@${FIXTURE_019_DIGEST}', "fixture-019:latest");
    },
    (subject) => {
      const pull = releaseImageStepByName(subject, "Prove final image digests are anonymously pullable");
      pull.run = pull.run.replace('registry_manifest_is_anonymous "$image" || ', "");
    },
  ]) {
    assertWorkflowTamper("release", validateReleaseExperimentImageWorkflowObject, mutate, anonymousFinding);
  }

  assertWorkflowTamper(
    "release",
    validateReleaseExperimentImageWorkflowObject,
    (subject) => {
      const steps = subject.jobs.release.steps;
      const pullIndex = steps.findIndex((step) => step.name === "Prove final image digests are anonymously pullable");
      const [pull] = steps.splice(pullIndex, 1);
      const publicationIndex = steps.findIndex((step) => step.name === "Publish or validate the immutable GitHub release");
      steps.splice(publicationIndex + 1, 0, pull);
    },
    ".github/workflows/release.yml: anonymous digest pulls must follow final binding and precede GitHub Release publication",
  );
});

test("release derives one safe sorted asset inventory from SHA256SUMS", () => {
  const finding = ".github/workflows/release.yml: release asset inventory must derive safe sorted unique basenames from validated SHA256SUMS before remote access";
  const cases = [
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace(
        '"$tool" release asset-inventory',
        '"$tool" release list-unchecked-assets',
      );
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace(
        "--assets build/release/assets",
        "--assets build/release",
      );
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace("--phase publication", "--phase source");
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace(
        'local inventory="$comparison_root/local-revalidated.txt"',
        'local inventory="$comparison_root/untrusted.txt"',
      );
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace(
        'mapfile -t expected_assets < "$expected_inventory"',
        'expected_assets=("LICENSE")',
      );
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace(
        "tool=build/release-tools/20w",
        'gh api --paginate "repos/${GITHUB_REPOSITORY}/releases?per_page=100"\ntool=build/release-tools/20w',
      );
    },
  ];
  for (const mutate of cases) {
    assertWorkflowTamper("release", validateReleaseWorkflowObject, mutate, finding);
  }
});

test("same-tag releases compare assets and upload only missing allowed files", () => {
  const finding = ".github/workflows/release.yml: same-tag release assets must use the closed inventory, compare existing bytes, upload only missing files, and never replace or delete";
  const cases = [
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace("release fetch-assets", "release fetch-unchecked-assets");
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace(
        "--expected-assets build/release/assets",
        "--expected-assets build/release",
      );
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace('--release-id "$release_id"', "--release-id 1");
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run += '\ngh api --paginate "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets"';
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace('cmp --silent -- "$expected" "$downloaded"', "true");
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace('gh release upload "$RELEASE_TAG" "${missing_assets[@]}"', 'gh release upload "$RELEASE_TAG" "${assets[@]}"');
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace('gh release upload "$RELEASE_TAG" "${missing_assets[@]}"', 'gh release upload "$RELEASE_TAG" "${missing_assets[@]}" --clobber');
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      publication.run = publication.run.replace('compare_asset "$name" "$download_root/$name"', ":");
    },
    (subject) => {
      const publication = releaseImageStepByName(subject, "Publish or validate the immutable GitHub release");
      const lines = publication.run.split("\n");
      const publishedIndex = lines.findIndex((line) => line.trim() === "published)");
      const exitIndex = lines.findIndex((line, index) => index > publishedIndex && line.trim() === "exit 0");
      lines.splice(exitIndex, 0, '      gh api --method PATCH "repos/${GITHUB_REPOSITORY}/releases/${release_id}"');
      publication.run = lines.join("\n");
    },
  ];
  for (const mutate of cases) {
    assertWorkflowTamper("release", validateReleaseWorkflowObject, mutate, finding);
  }
});

test("release preflight completes before publication mutation", () => {
  const finding = ".github/workflows/release.yml: existing releases must pass the read-only asset and peeled-tag preflight before publication mutations";
  assertWorkflowTamper(
    "release",
    validateReleaseWorkflowObject,
    (subject) => {
      const steps = subject.jobs.release.steps;
      const preflightIndex = steps.findIndex((step) => step.id === "release-preflight");
      const [preflight] = steps.splice(preflightIndex, 1);
      const buildxIndex = steps.findIndex((step) => step.name === "Set up Docker Buildx");
      steps.splice(buildxIndex + 1, 0, preflight);
    },
    finding,
  );
  assertWorkflowTamper(
    "release",
    validateReleaseWorkflowObject,
    (subject) => {
      releaseImageStep(subject, "release-preflight").run += '\ngh api --method PATCH "repos/${GITHUB_REPOSITORY}/releases/1"';
    },
    finding,
  );
  for (const [before, after] of [
    ["release state", "release state-unchecked"],
    ["release fetch-assets", "release fetch-unchecked-assets"],
    ["--expected-assets ../build/release/assets", "--expected-assets ../build/release"],
    ['--release-id "$release_id"', "--release-id 1"],
    ['--output "$existing_root"', "--output build/release/assets"],
  ]) {
    assertWorkflowTamper(
      "release",
      validateReleaseWorkflowObject,
      (subject) => {
        const preflight = releaseImageStep(subject, "release-preflight");
        preflight.run = preflight.run.replace(before, after);
      },
      finding,
    );
  }
  assertWorkflowTamper(
    "release",
    validateReleaseWorkflowObject,
    (subject) => {
      releaseImageStep(subject, "release-preflight").run += '\ngh api --paginate "repos/${GITHUB_REPOSITORY}/releases/1/assets"';
    },
    finding,
  );
});

test("release refusal branches cannot be neutralized", () => {
  const preflightFinding = ".github/workflows/release.yml: existing releases must pass the read-only asset and peeled-tag preflight before publication mutations";
  for (const diagnostic of [
    "existing release asset differs from the local asset",
    "published immutable release assets are incomplete",
  ]) {
    assertWorkflowTamper(
      "release",
      validateReleaseWorkflowObject,
      (subject) => disableExitAfterDiagnostic(releaseImageStep(subject, "release-preflight"), diagnostic),
      preflightFinding,
    );
  }

  const finalFinding = ".github/workflows/release.yml: same-tag release assets must use the closed inventory, compare existing bytes, upload only missing files, and never replace or delete";
  for (const diagnostic of [
    "remote release asset differs from the local asset",
    "remote release assets do not match the checksum-derived inventory",
    "local release asset authority changed before publication mutation",
    "remote release checksum authority changed during verification",
    "published release did not become immutable after five checks",
  ]) {
    assertWorkflowTamper(
      "release",
      validateReleaseWorkflowObject,
      (subject) => disableExitAfterDiagnostic(
        releaseImageStepByName(subject, "Publish or validate the immutable GitHub release"),
        diagnostic,
      ),
      finalFinding,
    );
  }

  assertWorkflowTamper(
    "release",
    validateReleaseExperimentImageWorkflowObject,
    (subject) => disableExitAfterDiagnostic(
      releaseImageStepByName(subject, "Prove final image digests are anonymously pullable"),
      "is not anonymously pullable.",
    ),
    ".github/workflows/release.yml: final release image digests must pass anonymous pulls with an empty Docker configuration",
  );
});

test("oci-images.json is the immutable release-image authority", () => {
  const authorityFinding = ".github/workflows/release.yml: oci-images.json must become the checksum-bound authority only after final anonymous digest admission";
  for (const mutate of [
    (subject) => {
      const materialize = releaseImageStepByName(subject, "Materialize the immutable OCI image authority");
      materialize.run = materialize.run.replace("release write-oci-images", "printf");
    },
    (subject) => {
      const resolve = releaseImageStep(subject, "release-images");
      resolve.if = "steps.release-preflight.outputs.release_state != 'published'";
    },
    (subject) => {
      const steps = subject.jobs.release.steps;
      const materializeIndex = steps.findIndex((step) => step.name === "Materialize the immutable OCI image authority");
      const [materialize] = steps.splice(materializeIndex, 1);
      const bindingIndex = steps.findIndex((step) => step.name === "Bind final release tags to the admitted digests");
      steps.splice(bindingIndex + 1, 0, materialize);
    },
  ]) {
    assertWorkflowTamper("release", validateReleaseWorkflowObject, mutate, authorityFinding);
  }

  const rerunFinding = ".github/workflows/release.yml: immutable published reruns must revalidate persisted assets, images, provenance, and anonymous pulls without mutation";
  for (const stepName of [
    "Validate persisted release image identities and tag bindings",
    "Verify persisted image provenance against the tag source",
    "Revalidate persisted image digests anonymously",
    "Verify the complete release-asset attestations against the tag source",
  ]) {
    assertWorkflowTamper(
      "release",
      validateReleaseWorkflowObject,
      (subject) => {
        releaseImageStepByName(subject, stepName).if = "steps.release-preflight.outputs.release_state != 'published'";
      },
      rerunFinding,
    );
  }
  for (const mutate of [
    (subject) => {
      releaseImageStepByName(
        subject,
        "Revalidate persisted image digests anonymously",
      ).env.GHCR_TOKEN = "${{ github.token }}";
    },
    (subject) => {
      releaseImageStepByName(
        subject,
        "Revalidate persisted image digests anonymously",
      ).run += "\ndocker login ghcr.io";
    },
    (subject) => {
      const pull = releaseImageStepByName(subject, "Revalidate persisted image digests anonymously");
      pull.run = pull.run.replace('registry_manifest_is_anonymous "$image" || ', "");
    },
  ]) {
    assertWorkflowTamper("release", validateReleaseWorkflowObject, mutate, rerunFinding);
  }
});

test("registry image names derive from one validated lowercase repository", () => {
  const derivationName = "Derive the lowercase registry repository";
  for (const [name, validator, jobName, consumerName, registryConsumers] of [
    [
      "ci",
      validateCiExperimentImageWorkflowObject,
      "container-smoke",
      "Build the CLRS shakedown specialist image",
      ["Build the CLRS shakedown specialist image", "Build the Fixture 007 image"],
    ],
    [
      "release",
      validateReleaseExperimentImageWorkflowObject,
      "release",
      "Preflight the remote release without mutation",
      ["Inspect existing release image tags", "Derive 20w image tags and labels"],
    ],
  ]) {
    const stepsOf = (subject) => subject.jobs[jobName].steps;
    const derivationOf = (subject) => stepsOf(subject).find((step) => step.name === derivationName);
    const derivationFinding = `.github/workflows/${name}.yml: registry image names must derive from one validated lowercase IMAGE_REPOSITORY before the first image step`;
    for (const mutate of [
      (subject) => {
        const steps = stepsOf(subject);
        steps.splice(steps.indexOf(derivationOf(subject)), 1);
      },
      (subject) => {
        const steps = stepsOf(subject);
        const [derivation] = steps.splice(steps.indexOf(derivationOf(subject)), 1);
        steps.splice(steps.findIndex((step) => step.name === consumerName) + 1, 0, derivation);
      },
      (subject) => {
        const derivation = derivationOf(subject);
        derivation.run = derivation.run.replace('"${GITHUB_REPOSITORY,,}"', '"$GITHUB_REPOSITORY"');
      },
      (subject) => {
        derivationOf(subject).if = "github.event_name == 'workflow_dispatch'";
      },
      (subject) => disableExitAfterDiagnostic(
        derivationOf(subject),
        "does not lowercase to a bounded OCI owner/name",
      ),
    ]) {
      assertWorkflowTamper(name, validator, mutate, derivationFinding);
    }
    const rawFinding = `.github/workflows/${name}.yml: registry image names must not interpolate the case-preserving repository identity`;
    for (const registryConsumer of registryConsumers) {
      assertWorkflowTamper(
        name,
        validator,
        (subject) => {
          const consumer = stepsOf(subject).find((step) => step.name === registryConsumer);
          const source = JSON.stringify(consumer).replaceAll("${{ env.IMAGE_REPOSITORY }}", "${{ github.repository }}")
            .replaceAll("${IMAGE_REPOSITORY}", "${GITHUB_REPOSITORY}");
          assert.notEqual(source, JSON.stringify(consumer), `${registryConsumer} carries no registry image name`);
          Object.assign(consumer, JSON.parse(source));
        },
        rawFinding,
      );
    }
  }

  const consumerFinding = ".github/workflows/release.yml: OCI image manifests must bind the lowercase IMAGE_REPOSITORY while GitHub release lookups keep the case-preserving repository";
  for (const [stepName, from, to] of [
    ["Preflight the remote release without mutation", '--repository "$IMAGE_REPOSITORY"', '--repository "$GITHUB_REPOSITORY"'],
    ["Preflight the remote release without mutation", '--repository "$GITHUB_REPOSITORY"', '--repository "$IMAGE_REPOSITORY"'],
    ["Materialize the immutable OCI image authority", '--repository "$IMAGE_REPOSITORY"', '--repository "$GITHUB_REPOSITORY"'],
    ["Resolve the immutable OCI image authority", '--repository "$IMAGE_REPOSITORY"', '--repository "$GITHUB_REPOSITORY"'],
    ["Publish or validate the immutable GitHub release", '--repository "$GITHUB_REPOSITORY"', '--repository "$IMAGE_REPOSITORY"'],
  ]) {
    assertWorkflowTamper(
      "release",
      validateReleaseExperimentImageWorkflowObject,
      (subject) => {
        const step = releaseImageStepByName(subject, stepName);
        assert.ok(step.run.includes(from), `${stepName} lacks ${from}`);
        step.run = step.run.replace(from, to);
      },
      consumerFinding,
    );
  }
});

test("CI and release image policy preserve separate tooling and experiment identities", () => {
  const ciWorkflow = workflow("ci");
  const releaseWorkflow = workflow("release");
  assert.deepEqual(validateCiExperimentImageWorkflowObject(ciWorkflow), []);
  assert.deepEqual(validateReleaseExperimentImageWorkflowObject(releaseWorkflow), []);

  const sharedCiImage = structuredClone(ciWorkflow);
  const ciBuild = sharedCiImage.jobs["container-smoke"].steps.find((step) => (
    step.with?.tags === "20w-fixture-019:test"
  ));
  ciBuild.with.file = "experiments/workstation/Dockerfile";
  assert.ok(validateCiExperimentImageWorkflowObject(sharedCiImage).includes(
    ".github/workflows/ci.yml: container-smoke must build only the scoped Fixture 019 test image",
  ));

  const unnamedCiImage = structuredClone(ciWorkflow);
  const unnamedCiBuild = unnamedCiImage.jobs["container-smoke"].steps.find((step) => (
    step.with?.tags === "20w-fixture-019:test"
  ));
  unnamedCiBuild.with["build-args"] = unnamedCiBuild.with["build-args"].replace(
    "IMAGE_NAME=ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-019\n",
    "",
  );
  assert.ok(validateCiExperimentImageWorkflowObject(unnamedCiImage).includes(
    ".github/workflows/ci.yml: Fixture 019 test image must bind its image name, development version, and source revision",
  ));

  const sharedReleaseImage = structuredClone(releaseWorkflow);
  const releaseBuild = sharedReleaseImage.jobs.release.steps.find((step) => (
    step.id === "build-fixture-019-image"
  ));
  releaseBuild.with.file = "experiments/workstation/Dockerfile";
  assert.ok(validateReleaseExperimentImageWorkflowObject(sharedReleaseImage).includes(
    ".github/workflows/release.yml: release must build the untagged linux/amd64 Fixture 019 candidate",
  ));

  const unnamedReleaseImage = structuredClone(releaseWorkflow);
  const unnamedReleaseBuild = unnamedReleaseImage.jobs.release.steps.find((step) => (
    step.id === "build-fixture-019-image"
  ));
  unnamedReleaseBuild.with["build-args"] = unnamedReleaseBuild.with["build-args"].replace(
    "IMAGE_NAME=ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-019\n",
    "",
  );
  assert.ok(validateReleaseExperimentImageWorkflowObject(unnamedReleaseImage).includes(
    ".github/workflows/release.yml: release must build the untagged linux/amd64 Fixture 019 candidate",
  ));

  const mergedToolingImage = structuredClone(releaseWorkflow);
  const toolingBuild = mergedToolingImage.jobs.release.steps.find((step) => (
    step.id === "build-tooling-image"
  ));
  toolingBuild.with.file = "experiments/workstation/fixture-019/Dockerfile";
  assert.ok(validateReleaseExperimentImageWorkflowObject(mergedToolingImage).includes(
    ".github/workflows/release.yml: static 20w tooling image must use a separate untagged, admitted digest",
  ));
});

test("Fixture 019 uses the closed Go-packaged context in CI and release", () => {
  const ciContextFinding = ".github/workflows/ci.yml: Fixture 019 test image must use its exact closed Go-packaged runtime context";
  assertWorkflowTamper(
    "ci",
    validateCiExperimentImageWorkflowObject,
    (subject) => {
      ciImageStep(subject, "Package the closed Fixture 019 runtime context").run += " --artifact fixture-007";
    },
    ciContextFinding,
  );
  assertWorkflowTamper(
    "ci",
    validateCiExperimentImageWorkflowObject,
    (subject) => {
      ciImageStep(subject, "Build the Fixture 019 image").with.context = ".";
    },
    ".github/workflows/ci.yml: container-smoke must build only the scoped Fixture 019 test image",
  );
  assertWorkflowTamper(
    "release",
    validateReleaseExperimentImageWorkflowObject,
    (subject) => {
      releaseImageStepByName(subject, "Package the closed Fixture 019 runtime context").if = "success()";
    },
    ".github/workflows/release.yml: Fixture 019 release must package its exact closed runtime context after the existing-tag check",
  );
  assertWorkflowTamper(
    "release",
    validateReleaseExperimentImageWorkflowObject,
    (subject) => {
      releaseImageStep(subject, "build-fixture-019-image").with.context = ".";
    },
    ".github/workflows/release.yml: release must build the untagged linux/amd64 Fixture 019 candidate",
  );
  assertWorkflowTamper(
    "release",
    validateReleaseExperimentImageWorkflowObject,
    (subject) => {
      const attestation = subject.jobs.release.steps.find(
        (step) => step.with?.["subject-name"]?.includes("fixture-019"),
      );
      attestation.with["subject-digest"] = "${{ steps.admission-images.outputs.fixture019_digest }}";
    },
    ".github/workflows/release.yml: Fixture 019 provenance must attest only its current-run build output",
  );
});

test("container policy withholds arm64 and enforces exact-digest runtime identity", () => {
  const toolingFinding = ".github/workflows/release.yml: static 20w tooling image must use a separate untagged, admitted digest";
  assertWorkflowTamper(
    "release",
    validateReleaseExperimentImageWorkflowObject,
    (subject) => {
      releaseImageStep(subject, "build-tooling-image").with.platforms = "linux/amd64,linux/arm64";
    },
    toolingFinding,
  );
  assertWorkflowTamper(
    "release",
    validateReleaseExperimentImageWorkflowObject,
    (subject) => {
      const attestation = subject.jobs.release.steps.find(
        (step) => step.with?.["subject-name"] === "ghcr.io/${{ env.IMAGE_REPOSITORY }}-20w",
      );
      attestation.with["subject-digest"] = "${{ steps.admission-images.outputs.tooling_digest }}";
    },
    toolingFinding,
  );

  const executionFinding = ".github/workflows/release.yml: candidate images must run tooling plus smoke, analyze, and validate by digest before tagging";
  for (const [from, to] of [
    ['if [[ "$tooling_identity" != "$expected_tooling_identity" ]]; then', "if false; then"],
    ['"go_version":"go1.27.2"', '"go_version":"go1.28.0"'],
    ['if [[ "$fixture_007_node" != "v26.10.0" ]]; then', "if false; then"],
    ['"Python 3.14.8"', '"Python 3.14.9"'],
    ['numpy.__version__ == \\"2.5.3\\"', 'numpy.__version__ == \\"2.5.4\\"'],
  ]) {
    assertWorkflowTamper(
      "release",
      validateReleaseExperimentImageWorkflowObject,
      (subject) => {
        const step = releaseImageStepByName(subject, "Run the admitted candidates by immutable digest");
        step.run = step.run.replace(from, to);
      },
      executionFinding,
    );
  }
});

test("release tags remain absent until exact-digest admission and provenance verifies", () => {
  const buildFinding = ".github/workflows/release.yml: static 20w tooling image must use a separate untagged, admitted digest";
  const inspectionFinding = ".github/workflows/release.yml: exact candidate digests must pass authenticated platform and label inspection before admission";
  const provenanceFinding = ".github/workflows/release.yml: existing image digests must fail closed unless source-bound provenance already verifies";
  const publicationFinding = ".github/workflows/release.yml: release tags must use the single absence-checked publication path after admission";
  const orderingFinding = ".github/workflows/release.yml: release image tagging must follow digest inspection, execution, attestation, and provenance verification";
  const cases = [
    {
      expected: buildFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "build-tooling-image").with.tags = "${{ needs.verify.outputs.release-tag }}";
      },
    },
    {
      expected: buildFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "build-tooling-image").with.push = true;
      },
    },
    {
      expected: inspectionFinding,
      mutate: (subject) => {
        const inspection = releaseImageStepByName(subject, "Validate the exact image digests before admission");
        inspection.run = inspection.run.replace('--digest "$TOOLING_DIGEST"', '--tag "$RELEASE_TAG"');
      },
    },
    {
      expected: provenanceFinding,
      mutate: (subject) => {
        releaseImageStepByName(
          subject,
          "Verify admitted image provenance against the tag source",
        ).if = "steps.image-status.outputs.tooling_publish == 'true'";
      },
    },
    {
      expected: publicationFinding,
      mutate: (subject) => {
        const publication = releaseImageStepByName(subject, "Attach missing release tags to admitted digests");
        publication.run = publication.run.replace("candidate_status=absent", "candidate_status=existing");
      },
    },
    {
      expected: orderingFinding,
      mutate: (subject) => {
        const steps = subject.jobs.release.steps;
        const publicationIndex = steps.findIndex((step) => step.name === "Attach missing release tags to admitted digests");
        const [publication] = steps.splice(publicationIndex, 1);
        const executionIndex = steps.findIndex((step) => step.name === "Run the admitted candidates by immutable digest");
        steps.splice(executionIndex, 0, publication);
      },
    },
    {
      expected: orderingFinding,
      mutate: (subject) => {
        const steps = subject.jobs.release.steps;
        const provenanceIndex = steps.findIndex((step) => step.name === "Verify admitted image provenance against the tag source");
        const [provenance] = steps.splice(provenanceIndex, 1);
        const executionIndex = steps.findIndex((step) => step.name === "Run the admitted candidates by immutable digest");
        steps.splice(executionIndex + 1, 0, provenance);
      },
    },
    {
      expected: orderingFinding,
      mutate: (subject) => {
        const steps = subject.jobs.release.steps;
        const bindingIndex = steps.findIndex((step) => step.name === "Bind final release tags to the admitted digests");
        const [binding] = steps.splice(bindingIndex, 1);
        const publicationIndex = steps.findIndex((step) => step.name === "Attach missing release tags to admitted digests");
        steps.splice(publicationIndex, 0, binding);
      },
    },
  ];
  for (const entry of cases) {
    assertWorkflowTamper("release", validateReleaseExperimentImageWorkflowObject, entry.mutate, entry.expected);
  }
});

test("CI enforces the exact Fixture 007 Node runtime", () => {
  assertWorkflowTamper(
    "ci",
    validateCiExperimentImageWorkflowObject,
    (subject) => {
      const step = ciImageStep(subject, "Execute the bounded Fixture 007 smoke path");
      step.run = step.run.replaceAll("v26.10.0", "v26.8.2");
    },
    ".github/workflows/ci.yml: Fixture 007 must run smoke, analyze, and validate against one persistent result volume",
  );
});

test("CI locks Fixture 007 packaging, scoped build inputs, and offline smoke", () => {
  const buildName = "Build the Fixture 007 image";
  const buildFinding = ".github/workflows/ci.yml: container-smoke must build only the scoped Fixture 007 test image from its closed context";
  const cases = [
    {
      expected: ".github/workflows/ci.yml: Fixture 007 test image must use its exact closed Go-packaged runtime context",
      mutate: (subject) => {
        ciImageStep(subject, "Package the closed Fixture 007 runtime context").run += " --artifact fixture-019";
      },
    },
    {
      expected: buildFinding,
      mutate: (subject) => {
        ciImageStep(subject, buildName).with.context = ".";
      },
    },
    {
      expected: buildFinding,
      mutate: (subject) => {
        ciImageStep(subject, buildName).with.file = "experiments/workstation/fixture-019/Dockerfile";
      },
    },
    {
      expected: buildFinding,
      mutate: (subject) => {
        ciImageStep(subject, buildName).with.tags = "20w-experiments:test";
      },
    },
    {
      expected: ".github/workflows/ci.yml: Fixture 007 test image must keep its exact artifact, registry, version, and revision arguments",
      mutate: (subject) => {
        ciImageStep(subject, buildName).with["build-args"] += "UNREVIEWED=true\n";
      },
    },
    {
      expected: ".github/workflows/ci.yml: Fixture 007 test image must use its per-artifact cache scope",
      mutate: (subject) => {
        ciImageStep(subject, buildName).with["cache-from"] = "type=gha,scope=experiments";
      },
    },
    {
      expected: ".github/workflows/ci.yml: Fixture 007 must run smoke, analyze, and validate against one persistent result volume",
      mutate: (subject) => {
        ciImageStep(subject, "Execute the bounded Fixture 007 smoke path").run = "docker run 20w-fixture-007:test smoke";
      },
    },
  ];
  for (const entry of cases) {
    assertWorkflowTamper("ci", validateCiExperimentImageWorkflowObject, entry.mutate, entry.expected);
  }
});

test("release locks Fixture 007 existing-tag, packaging, and metadata boundaries", () => {
  const statusFinding = ".github/workflows/release.yml: Fixture 007 release tags must be checked and preserved before publication";
  const contextFinding = ".github/workflows/release.yml: Fixture 007 release must package its exact closed runtime context after the existing-tag check";
  const metadataFinding = ".github/workflows/release.yml: Fixture 007 metadata must use its per-artifact image identity and verified tag";
  const cases = [
    {
      expected: statusFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "image-status").env.GHCR_TOKEN = "";
      },
    },
    {
      expected: statusFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "image-status").run = "echo publish=true >> $GITHUB_OUTPUT";
      },
    },
    {
      expected: contextFinding,
      mutate: (subject) => {
        releaseImageStepByName(subject, "Package the closed Fixture 007 runtime context").run += " --artifact fixture-019";
      },
    },
    {
      expected: contextFinding,
      mutate: (subject) => {
        const packaging = releaseImageStepByName(subject, "Package the closed Fixture 007 runtime context");
        packaging.if = "success()";
      },
    },
    {
      expected: metadataFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "fixture-007-image-metadata").with.images = "ghcr.io/example/shared";
      },
    },
    {
      expected: metadataFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "fixture-007-image-metadata").with.tags += "type=raw,value=edge\n";
      },
    },
  ];
  for (const entry of cases) {
    assertWorkflowTamper("release", validateReleaseExperimentImageWorkflowObject, entry.mutate, entry.expected);
  }
});

test("release locks the Fixture 007 linux image build and attestation", () => {
  const buildFinding = ".github/workflows/release.yml: release must build the untagged linux/amd64 Fixture 007 candidate from its closed context";
  const attestationFinding = ".github/workflows/release.yml: Fixture 007 provenance must attest only its current-run build output";
  const cases = [
    {
      expected: buildFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "build-fixture-007-image").with.context = ".";
      },
    },
    {
      expected: buildFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "build-fixture-007-image").with.file = "tooling/Dockerfile";
      },
    },
    {
      expected: buildFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "build-fixture-007-image").with.platforms = "linux/amd64,linux/arm64";
      },
    },
    {
      expected: buildFinding,
      mutate: (subject) => {
        releaseImageStep(subject, "build-fixture-007-image").with.tags = "latest";
      },
    },
    {
      expected: ".github/workflows/release.yml: Fixture 007 release image must keep its exact artifact, registry, tag, and revision arguments",
      mutate: (subject) => {
        releaseImageStep(subject, "build-fixture-007-image").with["build-args"] += "UNREVIEWED=true\n";
      },
    },
    {
      expected: ".github/workflows/release.yml: Fixture 007 release image must use its per-artifact cache scope",
      mutate: (subject) => {
        releaseImageStep(subject, "build-fixture-007-image").with["cache-to"] = "type=gha,mode=max,scope=experiments";
      },
    },
    {
      expected: attestationFinding,
      mutate: (subject) => {
        const attestation = subject.jobs.release.steps.find((step) => step.with?.["subject-name"]?.includes("fixture-007"));
        attestation.with["subject-name"] = "ghcr.io/example/shared";
      },
    },
    {
      expected: attestationFinding,
      mutate: (subject) => {
        const attestation = subject.jobs.release.steps.find((step) => step.with?.["subject-name"]?.includes("fixture-007"));
        attestation.with["subject-digest"] = "sha256:unbound";
      },
    },
    {
      expected: attestationFinding,
      mutate: (subject) => {
        const attestation = subject.jobs.release.steps.find((step) => step.with?.["subject-name"]?.includes("fixture-007"));
        attestation.if = "steps.release-preflight.outputs.release_state != 'published'";
      },
    },
  ];
  for (const entry of cases) {
    assertWorkflowTamper("release", validateReleaseExperimentImageWorkflowObject, entry.mutate, entry.expected);
  }
});

test("release pins the SBOM generator for every published container", () => {
  const cases = [
    {
      expected: ".github/workflows/release.yml: static 20w tooling image must use a separate untagged, admitted digest",
      id: "build-tooling-image",
    },
    {
      expected: ".github/workflows/release.yml: release must build the untagged linux/amd64 Fixture 007 candidate from its closed context",
      id: "build-fixture-007-image",
    },
    {
      expected: ".github/workflows/release.yml: release must build the untagged linux/amd64 Fixture 019 candidate",
      id: "build-fixture-019-image",
    },
  ];
  for (const entry of cases) {
    assertWorkflowTamper(
      "release",
      validateReleaseExperimentImageWorkflowObject,
      (subject) => {
        releaseImageStep(subject, entry.id).with.sbom = true;
      },
      entry.expected,
    );
  }
});

test("the update bot leaves the CLRS generator folder alone and keeps the preset ignore list", () => {
  const config = JSON.parse(readFileSync(new URL("../renovate.json", import.meta.url), "utf8"));
  assert.deepEqual(validateRenovateConfigObject(config), []);
  const without = (entry) => ({
    ...config,
    ignorePaths: config.ignorePaths.filter((candidate) => candidate !== entry),
  });
  assert.deepEqual(validateRenovateConfigObject(without("tooling/clrs-generator/**")), [
    "renovate.json: ignorePaths must exclude tooling/clrs-generator/**",
  ]);
  assert.deepEqual(validateRenovateConfigObject(without("**/tests/**")), [
    "renovate.json: ignorePaths must keep the preset entry **/tests/**",
  ]);
  for (const ignorePaths of [undefined, [], "tooling/clrs-generator/**", ["tooling/clrs-generator"]]) {
    const findings = validateRenovateConfigObject({ ...config, ignorePaths });
    assert.equal(findings.length, 9, JSON.stringify(ignorePaths));
    assert.equal(findings[0], "renovate.json: ignorePaths must exclude tooling/clrs-generator/**");
  }
  assert.deepEqual(validateRenovateConfigObject({ ...config, timezone: "UTC" }), [
    "renovate.json: timezone must be Europe/Berlin",
  ]);
  assert.deepEqual(
    validateRenovateConfigObject({ ...config, packageRules: [{ automerge: true }] }),
    ["renovate.json: automerge stays disabled until required CI and repository rules are verified"],
  );
  assert.equal(validateRenovateConfigObject(null).length, 12);
});

test("the update bot updates lock files with the pinned Node and npm", () => {
  const config = JSON.parse(readFileSync(new URL("../renovate.json", import.meta.url), "utf8"));
  const node = readFileSync(new URL("../.node-version", import.meta.url), "utf8").trim();
  const npm = JSON.parse(readFileSync(new URL("./npm-runtime-lock.json", import.meta.url), "utf8")).version;
  assert.deepEqual(config.constraints, { node, npm });
  assert.deepEqual(validateRenovateConfigObject(config), []);
  const nodeFinding = `renovate.json: constraints.node must be ${JSON.stringify(node)}`;
  const npmFinding = `renovate.json: constraints.npm must be ${JSON.stringify(npm)}`;
  const withConstraints = (constraints) => validateRenovateConfigObject({ ...config, constraints });
  assert.deepEqual(withConstraints(undefined), [nodeFinding, npmFinding]);
  assert.deepEqual(withConstraints({}), [nodeFinding, npmFinding]);
  assert.deepEqual(withConstraints({ npm }), [nodeFinding]);
  assert.deepEqual(withConstraints({ node }), [npmFinding]);
  const [major, minor, patch] = node.split(".").map(Number);
  assert.deepEqual(withConstraints({ node: `${major}.${minor}.${patch + 1}`, npm }), [nodeFinding]);
  assert.deepEqual(withConstraints({ node: `^${node}`, npm }), [nodeFinding]);
  assert.deepEqual(withConstraints({ node, npm: "12.2.0-pre" }), [npmFinding]);
  assert.deepEqual(withConstraints({ node: Number.parseInt(node, 10), npm }), [nodeFinding]);
});

test("no update group of the bot carries a workflow tool version", () => {
  const config = JSON.parse(readFileSync(new URL("../renovate.json", import.meta.url), "utf8"));
  const groupIndex = config.packageRules.findIndex((rule) => rule.groupName === "github actions");
  assert.equal(groupIndex, 0);
  assert.deepEqual(config.packageRules[groupIndex].matchDepTypes, ["!uses-with"]);
  assert.deepEqual(validateRenovateConfigObject(config), []);
  const finding = (index) => (
    `renovate.json: packageRules[${index}] groups updates and must list !uses-with in matchDepTypes or name only managers other than github-actions`
  );
  const withGroupRule = (change) => ({
    ...config,
    packageRules: config.packageRules.map((rule, index) => (
      index === groupIndex ? change({ ...rule }) : rule
    )),
  });
  const refused = [
    (rule) => { delete rule.matchDepTypes; return rule; },
    (rule) => ({ ...rule, matchDepTypes: [] }),
    (rule) => ({ ...rule, matchDepTypes: "!uses-with" }),
    (rule) => ({ ...rule, matchDepTypes: ["uses-with"] }),
    (rule) => ({ ...rule, matchDepTypes: ["action"] }),
    (rule) => ({ ...rule, matchDepTypes: ["!USES-WITH"] }),
    (rule) => ({ ...rule, matchDepTypes: ["!/uses-with/"] }),
  ];
  for (const [caseIndex, change] of refused.entries()) {
    assert.deepEqual(validateRenovateConfigObject(withGroupRule(change)), [finding(groupIndex)], `case ${caseIndex}`);
  }
  const appended = (rule) => ({ ...config, packageRules: [...config.packageRules, rule] });
  const last = config.packageRules.length;
  for (const matchManagers of [
    undefined, [], "npm", ["github-actions"], ["npm", "github-actions"], ["/.*/"], ["!npm"], ["*"],
    ["custom.regex"], [7],
  ]) {
    assert.deepEqual(
      validateRenovateConfigObject(appended({ matchManagers, groupName: "planted group" })),
      [finding(last)],
      JSON.stringify(matchManagers),
    );
  }
  assert.deepEqual(validateRenovateConfigObject(appended({ matchManagers: ["npm"], groupName: "npm tools" })), []);
  assert.deepEqual(
    validateRenovateConfigObject(appended({ matchPackageNames: ["*"], matchDepTypes: ["action", "!uses-with"], groupName: "wide" })),
    [],
  );
  assert.deepEqual(validateRenovateConfigObject(appended({ matchManagers: ["github-actions"], groupName: null })), []);
  assert.deepEqual(validateRenovateConfigObject({ ...config, groupName: "everything" }), [
    "renovate.json: groupName outside packageRules would group workflow tool versions with every other update",
  ]);
});

test("engine-managed workflows keep pins, read-only permissions, runner and timeout", () => {
  assert.deepEqual([...engineManagedWorkflowPaths], [
    ".github/workflows/praetor-api.yml",
    ".github/workflows/praetor-docs.yml",
  ]);
  for (const relativePath of engineManagedWorkflowPaths) {
    const valid = parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
    const [jobName] = Object.keys(valid.jobs);
    const validate = (candidate) => validateEngineManagedWorkflowObject(candidate, relativePath);
    const mutated = (change) => {
      const candidate = structuredClone(valid);
      change(candidate, candidate.jobs[jobName]);
      return validate(candidate);
    };
    assert.deepEqual(validate(valid), [], relativePath);
    // The carve-out exists because the generic policy refuses the engine's shape.
    assert.notDeepEqual(validateWorkflowObject(valid, relativePath), [], relativePath);

    const checkout = valid.jobs[jobName].steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"));
    assert.ok(checkout >= 0, relativePath);
    for (const reference of ["actions/checkout@v7", "actions/checkout@main", "actions/checkout@3d3c42e5aac5", "docker://alpine:3"]) {
      assert.deepEqual(mutated((_, job) => { job.steps[checkout].uses = reference; }), [
        `${relativePath}: root.jobs.${jobName}.steps[${checkout}].uses must pin an external action to a full commit SHA; got ${reference}`,
      ], reference);
    }
    assert.deepEqual(mutated((_, job) => { job.uses = "cordanaLLM/praetor/.github/workflows/gate.yml@v1"; }), [
      `${relativePath}: root.jobs.${jobName}.uses must pin an external action to a full commit SHA; got cordanaLLM/praetor/.github/workflows/gate.yml@v1`,
    ]);

    for (const permissions of [{ contents: "write" }, { contents: "read", "id-token": "write" }]) {
      assert.deepEqual(mutated((candidate) => { candidate.permissions = permissions; }), [
        `${relativePath}: top-level permissions must not grant write access`,
      ], JSON.stringify(permissions));
      assert.deepEqual(mutated((_, job) => { job.permissions = permissions; }), [
        `${relativePath}: engine-managed job ${jobName} must not grant write access`,
      ], JSON.stringify(permissions));
    }
    assert.deepEqual(mutated((_, job) => { job.permissions = "write-all"; }), [
      `${relativePath}: engine-managed job ${jobName} must not grant write access`,
    ]);
    assert.deepEqual(mutated((_, job) => { job.permissions = { contents: "read" }; }), []);
    for (const permissions of [undefined, "write-all", "read-all", null]) {
      assert.deepEqual(mutated((candidate) => { candidate.permissions = permissions; }), [
        `${relativePath}: declare explicit top-level permissions`,
      ], String(permissions));
    }

    for (const runner of ["ubuntu-latest", "self-hosted", ["ubuntu-26.04"], undefined]) {
      assert.deepEqual(mutated((_, job) => { job["runs-on"] = runner; }), [
        `${relativePath}: public-repository job ${jobName} must run on GitHub-hosted ubuntu-26.04`,
      ], String(runner));
    }
    for (const timeout of [undefined, 0, -5, "10"]) {
      assert.deepEqual(mutated((_, job) => { job["timeout-minutes"] = timeout; }), [
        `${relativePath}: job ${jobName} needs a positive timeout-minutes`,
      ], String(timeout));
    }
    assert.deepEqual(mutated((candidate) => { candidate.jobs = {}; }), [
      `${relativePath}: jobs must be a non-empty mapping`,
    ]);
    assert.deepEqual(mutated((candidate) => { candidate.jobs[jobName] = "x"; }), [
      `${relativePath}: job ${jobName} must be a mapping`,
    ]);
    assert.deepEqual(validate(null), [`${relativePath}: workflow root must be a mapping`]);
  }
});

test("no other workflow file can claim the engine-managed carve-out", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-engine-workflows-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const workflowDirectory = path.join(root, ".github", "workflows");
  mkdirSync(workflowDirectory, { recursive: true });
  const source = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
  for (const relativePath of engineManagedWorkflowPaths) {
    writeFileSync(path.join(root, relativePath), source(relativePath));
  }
  const about = (findings, name) => findings.filter((finding) => finding.startsWith(`.github/workflows/${name}:`));
  const clean = validateWorkflowTree(root);
  assert.deepEqual(about(clean, "praetor-api.yml"), []);
  assert.deepEqual(about(clean, "praetor-docs.yml"), []);

  // Byte copies of an engine workflow under any other name get the full policy.
  const claimants = ["praetor-extra.yml", "praetor-api.yaml", "praetor-api-2.yml", "xpraetor-docs.yml"];
  for (const name of claimants) {
    writeFileSync(path.join(workflowDirectory, name), source(engineManagedWorkflowPaths[0]));
  }
  const findings = validateWorkflowTree(root);
  for (const name of claimants) {
    const refused = about(findings, name);
    assert.ok(
      refused.includes(`.github/workflows/${name}: concurrency must define a group and explicit cancel-in-progress boolean`),
      `${name}: ${refused.join(" | ")}`,
    );
    assert.ok(refused.some((finding) => finding.includes("persist-credentials")), name);
  }
  assert.deepEqual(about(findings, "praetor-api.yml"), []);
  assert.deepEqual(about(findings, "praetor-docs.yml"), []);

  // An engine path keeps its narrow rules inside the tree walk as well.
  writeFileSync(
    path.join(root, engineManagedWorkflowPaths[0]),
    source(engineManagedWorkflowPaths[0]).replace(/actions\/checkout@[0-9a-f]{40}/u, "actions/checkout@v7"),
  );
  const tagged = about(validateWorkflowTree(root), "praetor-api.yml");
  assert.equal(tagged.length, 1, tagged.join(" | "));
  assert.match(tagged[0], /must pin an external action to a full commit SHA; got actions\/checkout@v7$/u);
});

test("a local hook file may skip a generated job only by a dated exception", () => {
  const generated = parse(readFileSync(new URL("../lefthook.yml", import.meta.url), "utf8"));
  const local = parse(readFileSync(new URL("../lefthook-local.yml", import.meta.url), "utf8"));
  assert.deepEqual(generatedHookJobSkips.map((entry) => ({ ...entry })), [
    { hook: "pre-commit", job: "reuse-lint", lastDay: "2026-11-30" },
  ]);
  const validate = (candidate, today = "2026-10-11", skips = generatedHookJobSkips) =>
    validateLocalHookObject(candidate, generated, today, skips);
  const mutated = (change, today) => {
    const candidate = structuredClone(local);
    change(candidate);
    return validate(candidate, today);
  };
  const expired = "lefthook-local.yml: the skip of pre-commit command reuse-lint ended on 2026-11-30; remove it or decide a new date";
  const skipOnly = "lefthook-local.yml: the exception for pre-commit command reuse-lint may only set skip: true";

  assert.deepEqual(validate(local), []);
  assert.deepEqual(validate(local, "2026-11-30"), []);
  assert.deepEqual(validate(local, "2026-12-01"), [expired]);
  assert.deepEqual(validate(local, "2027-01-01"), [expired]);
  assert.deepEqual(validateRepositoryPolicy(undefined, "2026-11-30"), []);
  assert.deepEqual(validateRepositoryPolicy(undefined, "2026-12-01"), [expired]);
  for (const today of ["2026-12-1", "11.10.2026", "", "tomorrow"]) {
    assert.deepEqual(validate(local, today), [
      `lefthook-local.yml: the comparison date must be a calendar day; got ${today}`,
    ]);
  }

  // Every generated job: an override without a declared exception is refused.
  const overrides = Object.entries(generated).flatMap(([hook, body]) =>
    Object.keys(body.commands).map((job) => [hook, job]));
  assert.ok(overrides.length >= 9, String(overrides.length));
  for (const [hook, job] of overrides.filter(([hook, job]) => `${hook}/${job}` !== "pre-commit/reuse-lint")) {
    for (const body of [{ skip: true }, { run: "true" }, { env: { X: "1" } }, null]) {
      assert.deepEqual(mutated((candidate) => {
        candidate[hook] = { commands: { ...(candidate[hook]?.commands ?? {}), [job]: body } };
      }), [
        `lefthook-local.yml: ${hook} command ${job} changes a generated job without a declared exception`,
      ], `${hook}/${job} ${JSON.stringify(body)}`);
    }
  }

  for (const body of [{ skip: true, run: "true" }, { skip: false }, { skip: "true" }, { run: "true" }, {}, null, true]) {
    assert.deepEqual(mutated((candidate) => { candidate["pre-commit"].commands["reuse-lint"] = body; }), [skipOnly], JSON.stringify(body));
  }
  for (const [name, change] of [
    ["a hook-level skip", (candidate) => { candidate["pre-commit"].skip = true; }],
    ["a hook-level exclusion", (candidate) => { candidate["pre-push"].exclude_tags = ["x"]; }],
    ["a hook-level parallel switch", (candidate) => { candidate["pre-push"].parallel = true; }],
    ["a hook without commands", (candidate) => { candidate["pre-push"] = { skip: true }; }],
    ["a commands list", (candidate) => { candidate["pre-push"] = { commands: [] }; }],
  ]) {
    const findings = mutated(change);
    assert.equal(findings.length, 1, `${name}: ${findings.join(" | ")}`);
    assert.match(findings[0], /^lefthook-local\.yml: hook pre-(commit|push) may only declare a commands mapping$/u, name);
  }

  assert.deepEqual(mutated((candidate) => { delete candidate["pre-commit"].commands["reuse-lint"]; }), [
    "lefthook-local.yml: the declared exception for pre-commit command reuse-lint is unused; remove it",
  ]);
  assert.deepEqual(mutated((candidate) => { delete candidate["pre-commit"]; }), [
    "lefthook-local.yml: the declared exception for pre-commit command reuse-lint is unused; remove it",
  ]);
  assert.deepEqual(validate(local, "2026-10-11", []), [
    "lefthook-local.yml: pre-commit command reuse-lint changes a generated job without a declared exception",
  ]);
  for (const pair of [[null, generated], [local, null], [[], generated], [local, "x"]]) {
    assert.deepEqual(validateLocalHookObject(pair[0], pair[1], "2026-10-11"), [
      "lefthook-local.yml: lefthook-local.yml and lefthook.yml must each be a mapping",
    ]);
  }
});

test("policy diagnostics are actionable", () => {
  const output = formatFindings(["file: reason"]);
  assert.match(output, /1 finding/u);
  assert.match(output, /- file: reason/u);
});

const engineFileRoot = path.resolve(import.meta.dirname, "..");
const engineFileLastDay = "2027-01-09";
const engineFileNextDay = "2027-01-10";
const vendoredSource = "tools/figures/third_party/interfig/upstream/src/svg.ts";
const plainEntry = (entry, listKey) => ({ ...entry, [listKey]: [...entry[listKey]] });

async function lintRuleIds(today, exceptions = LINT_EXCEPTIONS) {
  const eslint = new ESLint({
    cwd: engineFileRoot,
    overrideConfig: createEslintConfig({ exceptions, today }),
    overrideConfigFile: true,
  });
  const results = await eslint.lintFiles(LINT_EXCEPTIONS.map((entry) => entry.path));
  return Object.fromEntries(results.map((result) => [
    path.relative(engineFileRoot, result.filePath).split(path.sep).join("/"),
    [...new Set(result.messages.map((message) => String(message.ruleId)))].sort(),
  ]));
}

function typeCheckCodes(relativePath) {
  const read = ts.readConfigFile(path.join(engineFileRoot, "tsconfig.json"), ts.sys.readFile);
  assert.equal(read.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, engineFileRoot);
  const target = path.join(engineFileRoot, relativePath);
  const program = ts.createProgram([target], { ...parsed.options, incremental: false, noEmit: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.filter((diagnostic) => diagnostic.file === undefined), []);
  return [...new Set(diagnostics
    .filter((diagnostic) => path.resolve(diagnostic.file.fileName) === target)
    .map((diagnostic) => `TS${diagnostic.code}`))].sort();
}

test("engine-file exception lists are well formed and fail closed when they are not", () => {
  assert.deepEqual(engineFileExceptionFindings(LINT_EXCEPTIONS, "rules"), []);
  assert.deepEqual(engineFileExceptionFindings(TYPE_CHECK_EXCEPTIONS, "diagnostics"), []);
  assert.deepEqual(LINT_EXCEPTIONS.map((entry) => [entry.path, entry.expires, entry.rules.length]), [
    ["tools/figures/dist/loader.js", engineFileLastDay, 1],
    ["tools/figures/dist/player.js", engineFileLastDay, 14],
  ]);
  const base = plainEntry(LINT_EXCEPTIONS[1], "rules");
  const label = "engine-file exception 0";
  for (const [name, entries, expected] of [
    ["not a list", { ...base }, ["engine-file exceptions must be an array"]],
    ["a null entry", [null], [`${label} must be an object`]],
    ["an entry that is a list", [[]], [`${label} must be an object`]],
    ["no reason", [{ ...base, reason: " " }], [`${label} has no reason`]],
    ["a short end day", [{ ...base, expires: "2027-1-9" }], [`${label} has no calendar end day`]],
    ["a day that does not exist", [{ ...base, expires: "2027-02-30" }], [`${label} has no calendar end day`]],
    ["no end day", [{ ...base, expires: undefined }], [`${label} has no calendar end day`]],
    ["a glob", [{ ...base, path: "tools/figures/dist/*.js" }], [`${label} must name one file by its literal repository path`]],
    ["a recursive glob", [{ ...base, path: "tools/**" }], [`${label} must name one file by its literal repository path`]],
    ["a directory", [{ ...base, path: "tools/figures/dist/" }], [`${label} must name one file by its literal repository path`]],
    ["a relative prefix", [{ ...base, path: "./tools/figures/dist/player.js" }], [`${label} must name one file by its literal repository path`]],
    ["an alternation", [{ ...base, path: "tools/figures/dist/@(player|x).js" }], [`${label} must name one file by its literal repository path`]],
    ["a negation", [{ ...base, path: "!tools/figures/dist/player.js" }], [`${label} must name one file by its literal repository path`]],
    ["no rules", [{ ...base, rules: [] }], [`${label} must list its rules as sorted, unique names`]],
    ["a repeated rule", [{ ...base, rules: ["no-empty", "no-empty"] }], [`${label} must list its rules as sorted, unique names`]],
    ["unsorted rules", [{ ...base, rules: ["no-undef", "no-empty"] }], [`${label} must list its rules as sorted, unique names`]],
    ["a rule that is not a name", [{ ...base, rules: [""] }], [`${label} must list its rules as sorted, unique names`]],
    ["an added key", [{ ...base, files: ["**"] }], [`${label} must hold exactly expires, path, reason and rules`]],
    ["the other list's key", [{ ...base, diagnostics: ["TS1"] }], [`${label} must hold exactly expires, path, reason and rules`]],
    ["a path named twice", [base, base], [`engine-file exception 1 repeats the path ${base.path}`]],
  ]) {
    assert.deepEqual(engineFileExceptionFindings(entries, "rules"), expected, name);
    assert.throws(() => lintExceptionOverrides(entries, "2026-10-11"), new Error(expected.join("\n")), name);
  }
});

test("engine-file exceptions apply through their last day and compare calendar days only", () => {
  for (const day of ["2026-10-11", engineFileLastDay, "2028-02-29"]) assert.equal(isCalendarDay(day), true, day);
  assert.equal(isCalendarDay(undefined), false);
  for (const day of ["2027-1-9", "2027-02-30", "2027-13-01", "09.01.2027", "+010000-01", "", "tomorrow", 20270109, null]) {
    assert.equal(isCalendarDay(day), false, String(day));
    assert.throws(() => lintExceptionOverrides(LINT_EXCEPTIONS, day), /the comparison day must be a calendar day/u, String(day));
  }
  assert.equal(currentCalendarDay(new Date("2027-01-09T23:59:59.999Z")), engineFileLastDay);
  assert.equal(currentCalendarDay(new Date("2027-01-10T00:00:00.000Z")), engineFileNextDay);
  assert.equal(activeExceptions(LINT_EXCEPTIONS, engineFileLastDay).length, 2);
  assert.deepEqual(activeExceptions(LINT_EXCEPTIONS, engineFileNextDay), []);
  assert.deepEqual(lintExceptionOverrides(LINT_EXCEPTIONS, engineFileNextDay), []);
  const overrides = lintExceptionOverrides(LINT_EXCEPTIONS, engineFileLastDay);
  assert.deepEqual(overrides.map((override) => override.files), LINT_EXCEPTIONS.map((entry) => [entry.path]));
  assert.deepEqual(overrides.map((override) => Object.keys(override)), Array(2).fill(["files", "rules"]));
  assert.deepEqual(overrides[0].rules, { "@typescript-eslint/no-unused-expressions": "off" });
  const mixed = [{ ...plainEntry(LINT_EXCEPTIONS[0], "rules"), expires: "2026-10-10" }, LINT_EXCEPTIONS[1]];
  assert.deepEqual(lintExceptionOverrides(mixed, "2026-10-11").map((override) => override.files), [
    ["tools/figures/dist/player.js"],
  ]);
  assert.equal(createEslintConfig({ today: engineFileLastDay }).length, createEslintConfig({ today: engineFileNextDay }).length + 2);
});

test("the lint exceptions hide exactly the rules their two files trip, and nothing after their last day", async () => {
  const declared = Object.fromEntries(LINT_EXCEPTIONS.map((entry) => [entry.path, [...entry.rules]]));
  const clean = Object.fromEntries(LINT_EXCEPTIONS.map((entry) => [entry.path, []]));
  assert.deepEqual(await lintRuleIds(engineFileLastDay), clean);
  // Without the entries every declared rule fires and no other one does, so
  // no entry is unused and none hides a rule it does not name.
  assert.deepEqual(await lintRuleIds(engineFileNextDay), declared);
  assert.deepEqual(await lintRuleIds("2026-10-11", []), declared);

  const narrowed = LINT_EXCEPTIONS.map((entry) => plainEntry(entry, "rules"));
  narrowed[1].rules = narrowed[1].rules.filter((rule) => rule !== "no-undef");
  assert.deepEqual(await lintRuleIds("2026-10-11", narrowed), {
    ...clean,
    "tools/figures/dist/player.js": ["no-undef"],
  });
});

test("a lint exception covers its own file and no neighbour", async () => {
  const eslint = new ESLint({
    cwd: engineFileRoot,
    overrideConfig: createEslintConfig({ today: "2026-10-11" }),
    overrideConfigFile: true,
  });
  const source = "export const pattern = /a\\-b/;\nif (pattern) {}\n";
  for (const [filePath, expected] of [
    ["tools/figures/dist/player.js", []],
    ["tools/figures/dist/player.test.js", ["no-empty", "no-useless-escape"]],
    ["tools/figures/dist/nested/player.js", ["no-empty", "no-useless-escape"]],
    ["tools/figures/player.js", ["no-empty", "no-useless-escape"]],
    ["scripts/player.js", ["no-empty", "no-useless-escape"]],
  ]) {
    const [result] = await eslint.lintText(source, { filePath: path.join(engineFileRoot, filePath) });
    assert.deepEqual(result.messages.map((message) => message.ruleId).sort(), expected, filePath);
  }
});

test("a lint exception is never a whole-file ignore: the lint reads every script under tools", async () => {
  const scripts = readdirSync(path.join(engineFileRoot, "tools"), { recursive: true })
    .map((entry) => `tools/${entry.split(path.sep).join("/")}`)
    .filter((entry) => /\.(?:[cm]?js|tsx?)$/u.test(entry))
    .sort();
  const markdownGates = ["tools/markdownlint/no-private-scratch-links.mjs", "tools/markdownlint/verify.mjs"];
  for (const expected of [...LINT_EXCEPTIONS.map((entry) => entry.path), "tools/figures/checks.mjs", ...markdownGates]) {
    assert.ok(scripts.includes(expected), expected);
  }
  const ignored = async (extra) => {
    const eslint = new ESLint({
      cwd: engineFileRoot,
      overrideConfig: [...createEslintConfig({ today: "2026-10-11" }), ...extra],
      overrideConfigFile: true,
    });
    const flags = await Promise.all(scripts.map((script) => eslint.isPathIgnored(script)));
    return scripts.filter((_, index) => flags[index]);
  };
  assert.deepEqual(await ignored([]), []);
  // A planted folder ignore must show up, so the empty result above is a reading.
  assert.deepEqual(await ignored([{ ignores: ["tools/markdownlint/**"] }]), markdownGates);
});

test("the type check leaves out a file only by a dated exception", () => {
  const config = JSON.parse(readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"));
  assert.deepEqual(TYPE_CHECK_EXCEPTIONS.map((entry) => [entry.path, entry.expires, [...entry.diagnostics]]), [
    [vendoredSource, engineFileLastDay, ["TS5097"]],
  ]);
  const validate = (change = () => {}, today = "2026-10-11", exceptions = TYPE_CHECK_EXCEPTIONS) => {
    const candidate = structuredClone(config);
    change(candidate);
    return validateTypeCheckConfigObject(candidate, today, exceptions);
  };
  const expired = `tsconfig.json: the type-check exception for ${vendoredSource} ended on ${engineFileLastDay}; remove it or decide a new date`;
  const unused = `tsconfig.json: the declared exception for ${vendoredSource} is unused; remove it`;
  const undeclared = (excluded) => `tsconfig.json: exclude names ${excluded} without a declared exception`;

  assert.deepEqual(validate(), []);
  assert.deepEqual(validate(undefined, engineFileLastDay), []);
  assert.deepEqual(validate(undefined, engineFileNextDay), [expired]);
  const tsconfigFindings = (today) =>
    validateRepositoryPolicy(undefined, today).filter((finding) => finding.startsWith("tsconfig.json"));
  assert.deepEqual(tsconfigFindings(engineFileLastDay), []);
  assert.deepEqual(tsconfigFindings(engineFileNextDay), [expired]);

  for (const excluded of ["app", "tools", "tools/**", "**/*.ts", "tools/figures/third_party/interfig/upstream/src",
    "tools/figures/third_party/interfig/upstream/src/*.ts", "tools/figures/third_party/interfig/upstream/src/model.ts"]) {
    assert.deepEqual(validate((candidate) => { candidate.exclude.push(excluded); }), [undeclared(excluded)], excluded);
  }
  assert.deepEqual(validate(undefined, "2026-10-11", []), [undeclared(vendoredSource)]);
  assert.deepEqual(validate((candidate) => { candidate.exclude.pop(); }), [unused]);
  assert.deepEqual(validate((candidate) => { candidate.exclude = [vendoredSource]; }), [
    "tsconfig.json: exclude must keep node_modules",
  ]);
  assert.deepEqual(validate((candidate) => { candidate.exclude.push(vendoredSource); }), [
    `tsconfig.json: exclude repeats ${vendoredSource}`,
  ]);
});

test("the type-check configuration cannot drop a file by another route", () => {
  const config = JSON.parse(readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"));
  const validate = (change, today = "2026-10-11", exceptions = TYPE_CHECK_EXCEPTIONS) => {
    const candidate = structuredClone(config);
    change(candidate);
    return validateTypeCheckConfigObject(candidate, today, exceptions);
  };
  const include = "tsconfig.json: include must be exactly **/*.ts, **/*.tsx, **/*.mts and files must be absent";
  for (const [name, change] of [
    ["a narrowed glob", (candidate) => { candidate.include = ["app/**/*.ts", "**/*.tsx", "**/*.mts"]; }],
    ["a dropped glob", (candidate) => { candidate.include.pop(); }],
    ["no include", (candidate) => { delete candidate.include; }],
    ["a files list", (candidate) => { candidate.files = ["app/book-content.ts"]; }],
    ["an empty files list", (candidate) => { candidate.files = []; }],
  ]) {
    assert.deepEqual(validate(change), [include], name);
  }
  for (const [name, change] of [
    ["no exclude", (candidate) => { delete candidate.exclude; }],
    ["an exclude string", (candidate) => { candidate.exclude = vendoredSource; }],
  ]) {
    assert.deepEqual(validate(change), ["tsconfig.json: exclude must be a list"], name);
  }
  assert.deepEqual(validateTypeCheckConfigObject(null, "2026-10-11"), ["tsconfig.json: exclude must be a list"]);
  for (const today of ["2027-1-9", "09.01.2027", "", "tomorrow"]) {
    assert.deepEqual(validate(() => {}, today), [
      `tsconfig.json: the comparison date must be a calendar day; got ${today}`,
    ]);
  }
  const base = plainEntry(TYPE_CHECK_EXCEPTIONS[0], "diagnostics");
  for (const [name, entry, expected] of [
    ["a glob", { ...base, path: "tools/figures/**/svg.ts" }, "must name one file by its literal repository path"],
    ["no end day", { ...base, expires: "" }, "has no calendar end day"],
    ["no reason", { ...base, reason: "" }, "has no reason"],
    ["no diagnostics", { ...base, diagnostics: [] }, "must list its diagnostics as sorted, unique names"],
    ["an added key", { ...base, rules: ["x"] }, "must hold exactly expires, path, reason and diagnostics"],
  ]) {
    assert.deepEqual(validate(() => {}, "2026-10-11", [entry]), [
      `tsconfig.json: engine-file exception 0 ${expected}`,
    ], name);
  }
});

test("the type-check exception names exactly what the compiler reports for its file", () => {
  for (const entry of TYPE_CHECK_EXCEPTIONS) {
    assert.deepEqual(typeCheckCodes(entry.path), [...entry.diagnostics], entry.path);
  }
  // A file the compiler accepts reports nothing, so an entry for it would not
  // pass the comparison above.
  assert.deepEqual(typeCheckCodes("tools/figures/third_party/interfig/upstream/src/model.ts"), []);
});
