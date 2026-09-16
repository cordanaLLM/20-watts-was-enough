import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseDocument } from "yaml";

import { REQUIRED_NODE_VERSION } from "../experiments/workstation/lib/node-runtime-policy.mjs";
import {
  validatePortableOperationsTree,
  validatePortableWorkflowObject,
} from "./lib/portable-operations.mjs";
import { validateResearchDisclosure } from "./prepare-release-assets.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");

const runtimePolicy = Object.freeze({
  goVersion: "1.27.1",
  nodeVersion: REQUIRED_NODE_VERSION,
  npmArchiveBytes: 3_045_132,
  npmArchiveSha256: "5dbb86c71d07a1957f2e90734092dd6a58bdcd9ebc2d8d41ca1c6e6a21d364e1",
  npmArchiveUrl: "https://registry.npmjs.org/npm/-/npm-12.0.2.tgz",
  npmVersion: "12.0.2",
  numpyDigest: "318b9a4c845dbea06708a29c84ee429cc3065048db34cdb799047643492050ee",
  numpyFilename: "numpy-2.5.2-cp314-cp314-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
  numpyVersion: "2.5.2",
  pythonImplementation: "CPython",
  pythonVersion: "3.14.7",
});

const sbomGenerator = "generator=docker.io/docker/buildkit-syft-scanner@sha256:ae4f3b554449e7e25548e7d8ccc029d17357348e30c6e3df01b92bc93654d6a9";

const buildxPolicy = Object.freeze({
  buildkit: "image=moby/buildkit:v0.32.2@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8",
  version: "v0.36.1",
});

const releaseMutationGuard = "steps.release-preflight.outputs.release_state != 'published'";

const fixture007ImagePolicy = Object.freeze({
  cacheFrom: "type=gha,scope=fixture-007-image",
  cacheTo: "type=gha,mode=max,scope=fixture-007-image",
  ciBuildArgs: [
    "EXPERIMENT_ARTIFACT=fixture-007",
    "IMAGE_NAME=ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-007",
    "IMAGE_VERSION=development",
    "SOURCE_REVISION=${{ github.sha }}",
  ].join("\n") + "\n",
  ciTag: "20w-fixture-007:test",
  condition: `${releaseMutationGuard} && steps.image-status.outputs.fixture007_publish == 'true'`,
  context: "build/container-contexts/fixture-007",
  dockerfile: "experiments/workstation/Dockerfile.node-artifact",
  imageName: "ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-007",
  packageCommand: "go -C tooling run ./cmd/20w experiment package-node-image --root .. --artifact fixture-007 --output ../build/container-contexts/fixture-007",
  releaseBuildArgs: [
    "EXPERIMENT_ARTIFACT=fixture-007",
    "IMAGE_NAME=ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-007",
    "IMAGE_VERSION=${{ needs.verify.outputs.release-tag }}",
    "SOURCE_REVISION=${{ needs.verify.outputs.release-commit }}",
  ].join("\n") + "\n",
  releaseTag: "type=raw,value=${{ needs.verify.outputs.release-tag }}",
});

const fixture019ImagePolicy = Object.freeze({
  condition: `${releaseMutationGuard} && steps.image-status.outputs.fixture019_publish == 'true'`,
  context: "build/container-contexts/fixture-019",
  dockerfile: "experiments/workstation/fixture-019/Dockerfile",
  packageCommand: "go -C tooling run ./cmd/20w experiment package-node-image --root .. --artifact fixture-019 --output ../build/container-contexts/fixture-019",
});

const approvedActionPins = new Map([
  ["actions/attest-build-provenance", "4d101475d8b20a2381f78447822ac1eab6504dd8"],
  ["actions/cache/restore", "55cc8345863c7cc4c66a329aec7e433d2d1c52a9"],
  ["actions/cache/save", "55cc8345863c7cc4c66a329aec7e433d2d1c52a9"],
  ["actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1"],
  ["actions/configure-pages", "45bfe0192ca1faeb007ade9deae92b16b8254a0d"],
  ["actions/dependency-review-action", "a1d282b36b6f3519aa1f3fc636f609c47dddb294"],
  ["actions/deploy-pages", "cd2ce8fcbc39b97be8ca5fce6e763baed58fa128"],
  ["actions/download-artifact", "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c"],
  ["actions/labeler", "bf12e9b00b37c5c0ca2b87b79b2daf7891dbda13"],
  ["actions/setup-go", "b7ad1dad31e06c5925ef5d2fc7ad053ef454303e"],
  ["actions/setup-node", "820762786026740c76f36085b0efc47a31fe5020"],
  ["actions/setup-python", "5fda3b95a4ea91299a34e894583c3862153e4b97"],
  ["actions/upload-artifact", "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"],
  ["actions/upload-pages-artifact", "fc324d3547104276b827a68afc52ff2a11cc49c9"],
  ["docker/build-push-action", "53b7df96c91f9c12dcc8a07bcb9ccacbed38856a"],
  ["docker/login-action", "dbcb813823bdd20940b903addbd779551569679f"],
  ["docker/metadata-action", "dc802804100637a589fabce1cb79ff13a1411302"],
  ["docker/setup-buildx-action", "37fe631027851001ddb9b187196cc803df7f5f0e"],
  ["github/codeql-action/analyze", "cdf488f595d80d6e07e03d4674febd5ab45fa938"],
  ["github/codeql-action/init", "cdf488f595d80d6e07e03d4674febd5ab45fa938"],
  ["github/codeql-action/upload-sarif", "cdf488f595d80d6e07e03d4674febd5ab45fa938"],
  ["ossf/scorecard-action", "2d1146689b8cda280b9bc96326124645441f03bc"],
]);

const requiredFiles = [
  ".agents/skills/research-writing/SKILL.md",
  ".agents/skills/reader-editor/SKILL.md",
  ".agents/skills/research-design/SKILL.md",
  ".agents/skills/research-design/references/prior-art.md",
  ".agents/skills/research-design/references/visual-review.md",
  ".agents/skills/maintenance-automation/SKILL.md",
  ".agents/skills/maintenance-automation/agents/openai.yaml",
  ".agents/skills/maintenance-automation/references/automation-map.md",
  ".agents/skills/maintenance-automation/references/prior-art.md",
  ".agents/skills/publication-design/SKILL.md",
  ".agents/skills/publication-design/agents/openai.yaml",
  ".dockerignore",
  ".editorconfig",
  ".gitleaks.toml",
  ".github/AGENTS.md",
  ".github/CODEOWNERS",
  ".github/FUNDING.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/evidence-correction.yml",
  ".github/ISSUE_TEMPLATE/experiment-protocol-problem.yml",
  ".github/ISSUE_TEMPLATE/experiment-run-failure.yml",
  ".github/ISSUE_TEMPLATE/mechanism-principle-proposal.yml",
  ".github/ISSUE_TEMPLATE/repository-tooling-problem.yml",
  ".github/ISSUE_TEMPLATE/site-documentation-problem.yml",
  ".github/ISSUE_TEMPLATE/translation-problem.yml",
  ".github/labeler.yml",
  ".github/issue-milestones.json",
  ".github/labels.json",
  ".github/public-transport.json",
  ".github/milestones.json",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/github-pages.yml",
  ".github/workflows/labeler.yml",
  ".github/workflows/pr-title.yml",
  ".github/workflows/release.yml",
  ".github/workflows/scorecard.yml",
  ".github/workflows/sync-repository-metadata.yml",
  "AGENTS.md",
  "CITATION.cff",
  "CLAUDE.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "docs/repository-map.md",
  "docs/design-system.md",
  "GOVERNANCE.md",
  "MAINTAINERS.md",
  "SECURITY.md",
  "SUPPORT.md",
  "app/AGENTS.md",
  "docs/principles.md",
  "experiments/AGENTS.md",
  "experiments/workstation/AGENTS.md",
  "experiments/workstation/Dockerfile.node-artifact",
  "experiments/workstation/fixture-019/Dockerfile",
  "experiments/workstation/fixture-019/python-environment.lock.json",
  "experiments/workstation/lib/execution-receipt.mjs",
  "experiments/workstation/lib/node-runtime-policy.mjs",
  "research/AGENTS.md",
  "research/disclosures/README.md",
  "research/disclosures/v0.2.0.md",
  "research/research-integrity-baseline.md",
  "renovate.json",
  "requirements-ci.txt",
  "scripts/AGENTS.md",
  "scripts/audit-code-shape.mjs",
  "scripts/audit-code-shape.test.mjs",
  "scripts/audit-prose-style.mjs",
  "scripts/audit-prose-style.test.mjs",
  "scripts/code-shape-baseline.json",
  "scripts/install-locked-npm.mjs",
  "scripts/install-locked-npm.test.mjs",
  "scripts/npm-runtime-lock.json",
  "scripts/validate-node-runtime.mjs",
  "tooling/AGENTS.md",
  "tooling/Dockerfile",
  "tooling/cmd/20w/github_metadata.go",
  "tooling/cmd/20w/github_pr_metadata.go",
  "tooling/cmd/20w/main.go",
  "tooling/cmd/build-release/main.go",
  "tooling/go.mod",
  "tooling/go.sum",
  "tooling/internal/githublabels/labels.go",
  "tooling/internal/githubissuemilestones/manifest.go",
  "tooling/internal/githubissuemilestones/sync.go",
  "tooling/internal/githubmilestones/manifest.go",
  "tooling/internal/githubmilestones/sync.go",
  "tooling/internal/githubprmetadata/sync.go",
  "tooling/internal/repositorymanifest/read.go",
];

const forbiddenLegacyHostingPaths = [
  ".openai/hosting.json",
  "app/content.ts",
  "app/layout.tsx",
  "app/lib/machine-translation.mjs",
  "app/page.tsx",
  "app/readiness/page.tsx",
  "build/sites-vite-plugin.ts",
  "next-env.d.ts",
  "next.config.ts",
  "scripts/validate-book-route-build.mjs",
  "vite.config.ts",
  "worker/index.ts",
];

const issueFormFiles = [
  ".github/ISSUE_TEMPLATE/evidence-correction.yml",
  ".github/ISSUE_TEMPLATE/experiment-protocol-problem.yml",
  ".github/ISSUE_TEMPLATE/experiment-run-failure.yml",
  ".github/ISSUE_TEMPLATE/mechanism-principle-proposal.yml",
  ".github/ISSUE_TEMPLATE/repository-tooling-problem.yml",
  ".github/ISSUE_TEMPLATE/site-documentation-problem.yml",
  ".github/ISSUE_TEMPLATE/translation-problem.yml",
];

const actionDigestPattern = /^[^\s@]+@[0-9a-f]{40}$/u;

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function parseYaml(root, relativePath, findings) {
  const source = readText(root, relativePath);
  const document = parseDocument(source, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });

  for (const error of document.errors) {
    findings.push(`${relativePath}: invalid YAML: ${error.message}`);
  }

  return document.errors.length === 0 ? document.toJS() : null;
}

function collectUses(value, location = "root", output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectUses(entry, `${location}[${index}]`, output));
    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  for (const [key, entry] of Object.entries(value)) {
    const nextLocation = `${location}.${key}`;
    if (key === "uses" && typeof entry === "string") {
      output.push({ location: nextLocation, value: entry });
    }
    collectUses(entry, nextLocation, output);
  }

  return output;
}

function validateWorkflowJob(job, jobName, relativePath) {
  const findings = [];
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    return [`${relativePath}: job ${jobName} must be a mapping`];
  }
  if (!Number.isFinite(job["timeout-minutes"]) || job["timeout-minutes"] <= 0) {
    findings.push(`${relativePath}: job ${jobName} needs a positive timeout-minutes`);
  }
  for (const [stepIndex, step] of (job.steps ?? []).entries()) {
    if (
      typeof step?.uses === "string"
      && step.uses.startsWith("actions/checkout@")
      && step.with?.["persist-credentials"] !== false
    ) {
      findings.push(`${relativePath}: job ${jobName} step ${stepIndex} must set checkout persist-credentials to false`);
    }
  }
  return findings;
}

export function validateWorkflowObject(workflow, relativePath = "workflow.yml") {
  const findings = [];

  if (!workflow || typeof workflow !== "object") {
    return [`${relativePath}: workflow root must be a mapping`];
  }

  if (!workflow.permissions || typeof workflow.permissions !== "object") {
    findings.push(`${relativePath}: declare explicit top-level permissions`);
  } else if (Object.values(workflow.permissions).includes("write")) {
    findings.push(`${relativePath}: top-level permissions must not grant write access`);
  }

  if (
    !workflow.concurrency
    || typeof workflow.concurrency !== "object"
    || typeof workflow.concurrency.group !== "string"
    || workflow.concurrency.group.trim().length === 0
    || typeof workflow.concurrency["cancel-in-progress"] !== "boolean"
  ) {
    findings.push(`${relativePath}: concurrency must define a group and explicit cancel-in-progress boolean`);
  }

  const jobs = workflow.jobs;
  if (!jobs || typeof jobs !== "object" || Array.isArray(jobs)) {
    findings.push(`${relativePath}: jobs must be a non-empty mapping`);
  } else {
    for (const [jobName, job] of Object.entries(jobs)) {
      findings.push(...validateWorkflowJob(job, jobName, relativePath));
    }
  }

  for (const action of collectUses(workflow)) {
    if (action.value.startsWith("./")) {
      continue;
    }
    if (!actionDigestPattern.test(action.value)) {
      findings.push(
        `${relativePath}: ${action.location} must pin an external action to a full commit SHA; got ${action.value}`,
      );
      continue;
    }
    const separator = action.value.lastIndexOf("@");
    const identity = action.value.slice(0, separator);
    const digest = action.value.slice(separator + 1);
    const approvedDigest = approvedActionPins.get(identity);
    if (approvedDigest === undefined) {
      findings.push(`${relativePath}: ${action.location} uses unapproved external action ${identity}`);
    } else if (digest !== approvedDigest) {
      findings.push(
        `${relativePath}: ${action.location} must use the approved ${identity}@${approvedDigest} pin; got ${action.value}`,
      );
    }
  }

  findings.push(...validatePortableWorkflowObject(workflow, relativePath));

  return findings;
}

export function validatePublicRepositoryRunnerWorkflowObject(
  workflow,
  relativePath = "workflow.yml",
) {
  const findings = [];
  for (const [jobName, job] of Object.entries(workflow?.jobs ?? {})) {
    if (job?.["runs-on"] !== "ubuntu-latest") {
      findings.push(
        `${relativePath}: public-repository job ${jobName} must run on GitHub-hosted ubuntu-latest`,
      );
    }
  }
  return findings;
}

export function validateScientificRuntimeWorkflowObject(
  workflow,
  lock,
  jobName,
  relativePath = "workflow.yml",
) {
  const findings = [];
  const steps = workflow?.jobs?.[jobName]?.steps;
  if (!Array.isArray(steps)) {
    return [`${relativePath}: job ${jobName} must provision the locked scientific runtime`];
  }
  const pythonVersion = lock?.python_version;
  const numpyVersion = lock?.packages?.numpy;
  const setup = steps.find((step) => step?.uses?.startsWith("actions/setup-python@"));
  if (setup?.with?.["python-version"] !== pythonVersion) {
    findings.push(`${relativePath}: job ${jobName} must use locked Python ${pythonVersion}`);
  }
  const install = steps.find((step) => (
    typeof step?.run === "string" && step.run.includes("python -m pip install")
  ));
  const expectedInstall = "python -m pip install --disable-pip-version-check --no-deps --require-hashes -r requirements-ci.txt";
  if (install?.run?.trim() !== expectedInstall) {
    findings.push(`${relativePath}: job ${jobName} must install hash-locked NumPy ${numpyVersion} without dependencies`);
  }
  return findings;
}

export function validateScientificRuntimeLock(
  lock,
  relativePath = "experiments/workstation/fixture-019/python-environment.lock.json",
) {
  const findings = [];
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    return [`${relativePath}: scientific runtime lock must be a mapping`];
  }
  const expectedFields = [
    ["schema", 1],
    ["artifact", "fixture-019"],
    ["python_implementation", runtimePolicy.pythonImplementation],
    ["python_version", runtimePolicy.pythonVersion],
    ["bit_generator", "PCG64DXSM"],
    ["network_install_during_run", false],
  ];
  for (const [field, expected] of expectedFields) {
    if (lock[field] !== expected) {
      findings.push(`${relativePath}: ${field} must be ${JSON.stringify(expected)}`);
    }
  }
  const expectedKeys = new Set([
    "artifact",
    "bit_generator",
    "network_install_during_run",
    "package_artifacts",
    "packages",
    "python_implementation",
    "python_version",
    "schema",
  ]);
  if (
    Object.keys(lock).length !== expectedKeys.size
    || Object.keys(lock).some((key) => !expectedKeys.has(key))
  ) {
    findings.push(`${relativePath}: scientific runtime lock contains an unknown or missing field`);
  }
  if (
    !lock.packages
    || typeof lock.packages !== "object"
    || Array.isArray(lock.packages)
    || Object.keys(lock.packages).length !== 1
    || lock.packages.numpy !== runtimePolicy.numpyVersion
  ) {
    findings.push(`${relativePath}: packages must contain only NumPy ${runtimePolicy.numpyVersion}`);
  }
  const numpyArtifact = lock.package_artifacts?.numpy;
  if (
    !lock.package_artifacts
    || typeof lock.package_artifacts !== "object"
    || Array.isArray(lock.package_artifacts)
    || Object.keys(lock.package_artifacts).length !== 1
    || numpyArtifact?.filename !== runtimePolicy.numpyFilename
    || numpyArtifact?.sha256 !== runtimePolicy.numpyDigest
  ) {
    findings.push(
      `${relativePath}: NumPy ${runtimePolicy.numpyVersion} must use the approved CPython 3.14 Linux x86_64 wheel and SHA-256 digest`,
    );
  }
  return findings;
}

export function validateNpmRuntimeLock(
  lock,
  relativePath = "scripts/npm-runtime-lock.json",
) {
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    return [`${relativePath}: npm runtime lock must be a mapping`];
  }
  const findings = [];
  const expected = Object.freeze({
    schema: 1,
    version: runtimePolicy.npmVersion,
    url: runtimePolicy.npmArchiveUrl,
    size: runtimePolicy.npmArchiveBytes,
    sha256: runtimePolicy.npmArchiveSha256,
  });
  const expectedKeys = Object.keys(expected);
  if (
    Object.keys(lock).length !== expectedKeys.length
    || Object.keys(lock).some((key) => !Object.hasOwn(expected, key))
  ) {
    findings.push(`${relativePath}: npm runtime lock contains an unknown or missing field`);
  }
  for (const [field, value] of Object.entries(expected)) {
    if (lock[field] !== value) {
      findings.push(`${relativePath}: ${field} must be ${JSON.stringify(value)}`);
    }
  }
  return findings;
}

function validateScientificRequirements(root, findings) {
  const relativePath = "requirements-ci.txt";
  const numpyVersion = runtimePolicy.numpyVersion;
  const numpyDigest = runtimePolicy.numpyDigest;
  const [pythonMajor, pythonMinor] = runtimePolicy.pythonVersion.split(".");
  const expected = [
    `# CPython ${pythonMajor}.${pythonMinor} / Linux x86_64 scientific runtime used by GitHub-hosted jobs.`,
    `# The artifact digest is published by PyPI for NumPy ${numpyVersion}.`,
    `numpy==${numpyVersion} \\`,
    `    --hash=sha256:${numpyDigest}`,
    "",
  ].join("\n");
  if (readText(root, relativePath).replaceAll("\r\n", "\n") !== expected) {
    findings.push(`${relativePath}: must bind locked NumPy ${numpyVersion} to its approved PyPI artifact digest`);
  }
}

export function validateJavaScriptRuntimeWorkflowObject(
  workflow,
  jobName,
  relativePath = "workflow.yml",
) {
  const findings = [];
  const steps = workflow?.jobs?.[jobName]?.steps;
  if (!Array.isArray(steps)) {
    return [`${relativePath}: job ${jobName} must provision the locked Node and npm runtime`];
  }
  const setupIndex = steps.findIndex((step) => step?.uses?.startsWith("actions/setup-node@"));
  const bootstrapIndex = steps.findIndex((step) => (
    step?.run?.trim() === "node scripts/install-locked-npm.mjs"
  ));
  const npmIndex = steps.findIndex((step) => step?.run?.trim() === (
    `test "$(npm --version)" = "${runtimePolicy.npmVersion}"`
  ));
  const installIndex = steps.findIndex((step) => step?.run?.trim() === "npm ci --no-audit");
  const setup = setupIndex >= 0 ? steps[setupIndex] : undefined;
  if (
    setup?.with?.["node-version"] !== runtimePolicy.nodeVersion
    || setup?.with?.cache !== "npm"
  ) {
    findings.push(
      `${relativePath}: job ${jobName} must use Node ${runtimePolicy.nodeVersion} with the npm cache`,
    );
  }
  if (bootstrapIndex < 0 || bootstrapIndex <= setupIndex) {
    findings.push(
      `${relativePath}: job ${jobName} must install hash-locked npm ${runtimePolicy.npmVersion} after Node setup`,
    );
  }
  if (npmIndex < 0 || npmIndex <= bootstrapIndex) {
    findings.push(
      `${relativePath}: job ${jobName} must verify locked npm ${runtimePolicy.npmVersion} after installation`,
    );
  }
  if (installIndex < 0 || npmIndex < 0 || installIndex <= npmIndex) {
    findings.push(`${relativePath}: job ${jobName} must run npm ci --no-audit after verifying the locked npm version`);
  }
  return findings;
}

const npmDependencyCommands = new Set([
  "add",
  "audit",
  "cit",
  "ci",
  "clean-install",
  "clean-install-test",
  "i",
  "ic",
  "in",
  "ins",
  "inst",
  "insta",
  "instal",
  "install",
  "install-ci-test",
  "install-clean",
  "install-scripts",
  "install-test",
  "isnt",
  "isnta",
  "isntal",
  "isntall",
  "isntall-clean",
  "it",
  "sit",
]);
const unambiguousNpmDependencyCommands = new Set(
  [...npmDependencyCommands].filter((command) => !["i", "in", "it"].includes(command)),
);

const shellAssignmentPrefix = /[A-Za-z_][A-Za-z0-9_]*=(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+)(?:\s+|$)/uy;
const shellCommandWrapper = /(?:\/usr\/bin\/env|env|command|exec)(?=\s|$)/uy;
const shellWrapperFlag = /--?[^\s]*/uy;
const shellVariableCommand = /(?:"\$\{[^}\r\n]+\}"|"\$[A-Za-z_][A-Za-z0-9_]*"|\$\{[^}\r\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*)(?=\s|$)/uy;

function skipShellWhitespace(value, start) {
  let index = start;
  while (index < value.length && /\s/u.test(value[index])) index += 1;
  return index;
}

function skipShellAssignments(value, start) {
  let index = start;
  while (index < value.length) {
    shellAssignmentPrefix.lastIndex = index;
    const match = shellAssignmentPrefix.exec(value);
    if (!match) break;
    index = match.index + match[0].length;
  }
  return index;
}

function variableShellCommandTail(segment) {
  let index = skipShellAssignments(segment, 0);
  shellCommandWrapper.lastIndex = index;
  const wrapper = shellCommandWrapper.exec(segment);
  if (wrapper) {
    index = skipShellWhitespace(segment, wrapper.index + wrapper[0].length);
    while (index < segment.length && segment[index] === "-") {
      shellWrapperFlag.lastIndex = index;
      const flag = shellWrapperFlag.exec(segment);
      if (!flag) break;
      index = skipShellWhitespace(segment, flag.index + flag[0].length);
    }
    index = skipShellAssignments(segment, index);
  }

  shellVariableCommand.lastIndex = index;
  const variable = shellVariableCommand.exec(segment);
  if (!variable) return undefined;
  return segment.slice(skipShellWhitespace(segment, variable.index + variable[0].length));
}

function npmInvocations(step) {
  if (typeof step?.run !== "string") {
    return [];
  }
  const invocations = [];
  const logicalLines = step.run
    .replaceAll(/\\\r?\n/gu, " ")
    .split(/\r?\n/u)
    .map((line) => line.trim());
  for (const line of logicalLines) {
    const npmPattern = /(?<![A-Za-z0-9_.-])(?:bun|bunx|npm|npm-cli\.js|npx|pnpm|yarn)(?=$|[\s;&|)])/gu;
    for (const match of line.matchAll(npmPattern)) {
      const commandSegment = line
        .slice((match.index ?? 0) + match[0].length)
        .split(/[;&|]/u, 1)[0];
      const tokens = commandSegment
        .match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/gu)
        ?.map((token) => token
          .replace(/^[("'$[{]+/u, "")
          .replace(/[;)"'\]}]+$/u, "")) ?? [];
      const firstToken = tokens[0] ?? "";
      let command = firstToken;
      if (firstToken.startsWith("-")) {
        command = tokens.find((token) => npmDependencyCommands.has(token)) ?? "";
      }
      if (npmDependencyCommands.has(command)) {
        invocations.push({ command, line });
      } else if (firstToken !== "--version" && firstToken !== "run" && firstToken !== "run-script") {
        invocations.push({ command: "unsupported", line });
      }
    }
    for (const segment of line.split(/[;&|]/u).map((part) => part.trim())) {
      const commandTail = variableShellCommandTail(segment);
      if (commandTail !== undefined) {
        const tokens = commandTail
          .match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/gu)
          ?.map((token) => token
            .replace(/^[("'$[{]+/u, "")
            .replace(/[)"'\]}]+$/u, "")) ?? [];
        const command = tokens[0]?.startsWith("-")
          ? tokens.find((token) => npmDependencyCommands.has(token))
          : tokens[0];
        if (npmDependencyCommands.has(command)) {
          invocations.push({ command: "unsupported", line });
        }
      }
    }
    const variableReference = /\$\{[^}\r\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*/gu;
    for (const match of line.matchAll(variableReference)) {
      const tokens = line
        .slice((match.index ?? 0) + match[0].length)
        .replace(/^[\\'"}\])]+\s*/u, "")
        .match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/gu)
        ?.map((token) => token
          .replace(/^[("'$[{]+/u, "")
          .replace(/[;)"'\]}]+$/u, "")) ?? [];
      const command = tokens[0]?.startsWith("-")
        ? tokens.find((token) => unambiguousNpmDependencyCommands.has(token))
        : tokens[0];
      if (unambiguousNpmDependencyCommands.has(command)) {
        invocations.push({ command: "unsupported", line });
      }
    }
  }
  return invocations;
}

function lockedNpmInstallSequenceIsExact(job) {
  const steps = job?.steps;
  if (!Array.isArray(steps)) return true;
  const sequenceMatchers = [
    (step) => actionUses(step, "actions/setup-node"),
    (step) => step?.run?.trim() === "node scripts/install-locked-npm.mjs",
    (step) => step?.run?.trim() === `test "$(npm --version)" = "${runtimePolicy.npmVersion}"`,
    (step) => step?.run?.trim() === "npm ci --no-audit",
  ];
  const sequenceIndices = sequenceMatchers.map((matches) => steps.flatMap(
    (step, stepIndex) => (matches(step) ? [stepIndex] : []),
  ));
  if (sequenceIndices[0].length === 0) return true;
  const firstIndex = sequenceIndices[0][0];
  return sequenceIndices.every((indices, offset) => (
    indices.length === 1 && indices[0] === firstIndex + offset
  ));
}

function inspectDependencyWorkflowJob(jobName, job, relativePath) {
  const auditSteps = [];
  const findings = [];
  if (!Array.isArray(job?.steps)) return { auditSteps, findings };
  let unsafeInstallDetected = false;
  let unsupportedNpmDetected = false;
  for (const [stepIndex, step] of job.steps.entries()) {
    const dependencyCommands = npmInvocations(step);
    const installCommands = dependencyCommands.filter(({ command }) => command !== "audit");
    if (installCommands.some(({ command, line }) => (
      command !== "unsupported" && (command !== "ci" || line !== "npm ci --no-audit")
    ))) {
      unsafeInstallDetected = true;
    }
    if (installCommands.some(({ command }) => command === "unsupported")) {
      unsupportedNpmDetected = true;
    }
    for (const { command, line } of dependencyCommands) {
      if (command !== "audit") continue;
      auditSteps.push({ jobName, stepIndex, step, line });
    }
  }
  if (unsafeInstallDetected) {
    findings.push(
      `${relativePath}: job ${jobName} must suppress npm ci's implicit audit with the exact npm ci --no-audit command`,
    );
  }
  if (unsupportedNpmDetected) {
    findings.push(
      `${relativePath}: job ${jobName} contains an unsupported npm invocation outside version, run, exact install, or exact audit commands`,
    );
  }
  if (!unsafeInstallDetected && !unsupportedNpmDetected && !lockedNpmInstallSequenceIsExact(job)) {
    findings.push(
      `${relativePath}: job ${jobName} must use one adjacent locked Node, npm, verification, and npm ci --no-audit sequence`,
    );
  }
  return { auditSteps, findings };
}

export function validateDependencyAuditWorkflowObject(
  workflow,
  auditJobName,
  relativePath = "workflow.yml",
) {
  const findings = [];
  const jobs = workflow?.jobs;
  if (!jobs || typeof jobs !== "object" || Array.isArray(jobs)) {
    return [`${relativePath}: workflow must declare jobs for dependency-audit validation`];
  }

  const auditSteps = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    const inspected = inspectDependencyWorkflowJob(jobName, job, relativePath);
    findings.push(...inspected.findings);
    auditSteps.push(...inspected.auditSteps);
  }

  if (auditJobName === undefined) {
    if (auditSteps.length > 0) {
      findings.push(
        `${relativePath}: workflows without a full audit gate must not run an explicit dependency audit`,
      );
    }
    return findings;
  }

  if (auditSteps.length !== 1) {
    findings.push(
      `${relativePath}: job ${auditJobName} must be the only job to run the lockfile dependency audit`,
    );
    return findings;
  }

  const audit = auditSteps[0];
  const auditJob = jobs[auditJobName];
  const installIndex = auditJob?.steps?.findIndex((step) => (
    step?.run?.trim() === "npm ci --no-audit"
  ));
  if (
    audit.jobName !== auditJobName
    || audit.line !== "npm audit --audit-level=high --package-lock-only --fetch-timeout=30000 --fetch-retries=1"
    || audit.step?.run?.trim() !== audit.line
    || !Number.isInteger(installIndex)
    || installIndex < 0
    || audit.stepIndex !== installIndex + 1
    || !continueOnErrorIsDisabled(auditJob)
    || audit.step?.if !== undefined
    || !continueOnErrorIsDisabled(audit.step)
  ) {
    findings.push(
      `${relativePath}: job ${auditJobName} must run the exact enforcing dependency audit after its no-audit install`,
    );
  }
  return findings;
}

export function validateGoRuntimeWorkflowObject(
  workflow,
  jobName,
  relativePath = "workflow.yml",
) {
  const findings = [];
  const steps = workflow?.jobs?.[jobName]?.steps;
  if (!Array.isArray(steps)) {
    return [`${relativePath}: job ${jobName} must provision the locked Go runtime`];
  }
  const setup = steps.find((step) => step?.uses?.startsWith("actions/setup-go@"));
  if (
    setup?.with?.["go-version-file"] !== "tooling/go.mod"
    || setup?.with?.["cache-dependency-path"] !== "tooling/go.sum"
  ) {
    findings.push(
      `${relativePath}: job ${jobName} must use Go ${runtimePolicy.goVersion} from tooling/go.mod with tooling/go.sum caching`,
    );
  }
  return findings;
}

function pagesPublicTransportJobBoundaryIsExact(job) {
  return (
    job?.needs === "deploy"
    && job?.["runs-on"] === "ubuntu-latest"
    && job?.["timeout-minutes"] === 5
    && job?.if === undefined
    && continueOnErrorIsDisabled(job)
    && Object.keys(job?.permissions ?? {}).length === 1
    && job?.permissions?.contents === "read"
  );
}

function pagesPublicationTriggerIsExact(trigger) {
  const push = trigger?.push;
  return (
    Object.keys(trigger ?? {}).length === 1
    && Object.keys(push ?? {}).length === 1
    && Array.isArray(push?.branches)
    && push.branches.length === 1
    && push.branches[0] === "main"
  );
}

function pagesPublicTransportExecutionStepsAreExact(steps, expectedCommand) {
  const checkoutIndex = steps.findIndex((step) => step?.uses?.startsWith("actions/checkout@"));
  const setupIndex = steps.findIndex((step) => step?.uses?.startsWith("actions/setup-go@"));
  const verifyIndex = steps.findIndex((step) => step?.run?.trim() === expectedCommand);
  const checkout = checkoutIndex >= 0 ? steps[checkoutIndex] : undefined;
  const setup = setupIndex >= 0 ? steps[setupIndex] : undefined;
  const verify = verifyIndex >= 0 ? steps[verifyIndex] : undefined;
  return (
    checkout?.with?.["persist-credentials"] === false
    && checkout?.with?.ref === undefined
    && checkout?.if === undefined
    && continueOnErrorIsDisabled(checkout)
    && setup?.if === undefined
    && continueOnErrorIsDisabled(setup)
    && verify?.if === undefined
    && verify?.shell === "bash"
    && continueOnErrorIsDisabled(verify)
    && checkoutIndex >= 0
    && setupIndex > checkoutIndex
    && verifyIndex > setupIndex
  );
}

function pagesPublicTransportReceiptStepIsExact(steps, verifyCommand) {
  const verifyIndex = steps.findIndex((step) => step?.run?.trim() === verifyCommand);
  const receiptIndex = steps.findIndex((step) => (
    step?.uses === "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
  ));
  const receipt = receiptIndex >= 0 ? steps[receiptIndex] : undefined;
  return (
    verifyIndex >= 0
    && receiptIndex > verifyIndex
    && receipt?.if === "${{ always() }}"
    && continueOnErrorIsDisabled(receipt)
    && receipt?.with?.name === "public-transport-observation"
    && receipt?.with?.path === "public-transport-observation.txt"
    && receipt?.with?.["if-no-files-found"] === "error"
    && receipt?.with?.["retention-days"] === 30
  );
}

export function validatePagesPublicTransportWorkflowObject(
  workflow,
  relativePath = ".github/workflows/github-pages.yml",
) {
  const job = workflow?.jobs?.["verify-public-transport"];
  const steps = job?.steps;
  const expectedCommand = "go -C tooling run ./cmd/20w publication verify-public-transport --root .. 2>&1 | tee public-transport-observation.txt";
  const findings = [];
  if (!pagesPublicationTriggerIsExact(workflow?.on)) {
    findings.push(`${relativePath}: production Pages publication must run only from canonical main pushes`);
  }
  if (!pagesPublicTransportJobBoundaryIsExact(job) || !Array.isArray(steps)) {
    findings.push(`${relativePath}: Pages must run the bounded read-only public-transport check after deployment`);
    return findings;
  }

  if (!pagesPublicTransportExecutionStepsAreExact(steps, expectedCommand)) {
    findings.push(`${relativePath}: Pages must run the exact public-transport command from canonical source with no credential persistence or failure bypass`);
  }
  if (!pagesPublicTransportReceiptStepIsExact(steps, expectedCommand)) {
    findings.push(`${relativePath}: Pages must retain the bounded public-transport observation for exactly 30 days`);
  }
  return findings;
}

export function validateCiFuzzingWorkflowObject(
  workflow,
  relativePath = ".github/workflows/ci.yml",
) {
  const qualityJob = workflow?.jobs?.["quality-full"];
  const steps = qualityJob?.steps;
  if (!Array.isArray(steps)) {
    return [`${relativePath}: quality-full must run the bounded strict-JSON fuzz target`];
  }
  const expectedCommand = [
    "go -C tooling test ./internal/strictjson",
    "-run '^$'",
    "-fuzz '^FuzzValidate$'",
    "-fuzztime=30s",
    "-fuzzminimizetime=5s",
    "-parallel=2",
    "-timeout=2m",
  ].join(" ");
  const repositoryCheckIndex = steps.findIndex((step) => (
    step?.run?.trim() === "npm run check:full-without-workstation"
    && step?.if === undefined
    && continueOnErrorIsDisabled(step)
  ));
  const fuzzIndex = steps.findIndex((step) => (
    step?.name === "Fuzz the untrusted JSON boundary"
    && step?.run?.trim() === expectedCommand
    && step?.if === undefined
    && continueOnErrorIsDisabled(step)
  ));
  const findings = [];
  if (
    !continueOnErrorIsDisabled(qualityJob)
    || fuzzIndex < 0
    || repositoryCheckIndex < 0
    || fuzzIndex <= repositoryCheckIndex
  ) {
    findings.push(
      `${relativePath}: quality-full must run the exact bounded strict-JSON fuzz target after the full non-workstation check`,
    );
  }
  if (!arrayIncludes(workflow?.jobs?.["ci-success"]?.needs, "quality-full")) {
    findings.push(`${relativePath}: ci-success must require the fuzzing quality-full gate`);
  }
  return findings;
}

const pdfReproducibilitySetupAction = "docker/setup-buildx-action@37fe631027851001ddb9b187196cc803df7f5f0e";
const pdfReproducibilityBuildKit = "image=moby/buildkit:v0.32.2@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8";
const privateGoCommandEnvironment = Object.freeze({
  CGO_ENABLED: "0",
  GOOS: "linux",
  GOARCH: "amd64",
  GOENV: "off",
  GOWORK: "off",
  GOTOOLCHAIN: "local",
  GOFLAGS: "-mod=readonly",
  GOPROXY: "off",
  GOSUMDB: "off",
});

function privateGoJobHasNoInheritedEnvironment(workflow, job) {
  return workflow?.env === undefined && job?.env === undefined;
}

const pdfReproducibilityCiCommand = [
  "go -C tooling run ./cmd/pdf-proof",
  '--root .. --ref main --proof "$RENDERER_PROOF"',
  "--cache-dir build/cache/pdf-renderer",
  "--receipt build/evidence/pdf-renderer-reproducibility.json",
].join(" ");
const pdfRendererCacheInputs = Object.freeze({
  path: "build/cache/pdf-renderer",
  key: "pdf-renderer-buildkit-v1-linux-amd64-${{ hashFiles('tooling/pdf-renderer/lock.json', 'tooling/internal/pdfrender/**', 'tooling/internal/pdfrenderlock/**', 'tooling/internal/pdfrendercli/**', 'tooling/internal/strictjson/**', 'tooling/cmd/pdf-proof/**', 'tooling/go.mod', 'tooling/go.sum') }}",
});
const pdfRendererCacheRestore = Object.freeze({
  name: "Restore the PDF renderer build cache",
  id: "pdf-renderer-cache",
  if: "needs.impact-plan.outputs.renderer_proof == 'render-pair'",
  uses: "actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  "timeout-minutes": 10,
  env: { SEGMENT_DOWNLOAD_TIMEOUT_MINS: "2" },
  with: pdfRendererCacheInputs,
});
const pdfRendererCacheGuard = Object.freeze({
  name: "Reject a non-exact PDF renderer cache restore",
  if: "needs.impact-plan.outputs.renderer_proof == 'render-pair'",
  "timeout-minutes": 1,
  env: {
    CACHE_MATCHED_KEY: "${{ steps.pdf-renderer-cache.outputs.cache-matched-key }}",
    CACHE_HIT: "${{ steps.pdf-renderer-cache.outputs.cache-hit }}",
  },
  run: [
    'if [ -n "$CACHE_MATCHED_KEY" ] && [ "$CACHE_HIT" != "true" ]; then',
    '  echo "::error::PDF renderer cache restore did not match the exact key"',
    "  exit 1",
    "fi",
  ].join("\n"),
});
const pdfRendererCacheSave = Object.freeze({
  name: "Save the verified PDF renderer build cache",
  if: "github.event_name == 'push' && github.ref == 'refs/heads/main' && steps.pdf-renderer-proof.outcome == 'success' && steps.pdf-renderer-cache.outputs.cache-hit != 'true'",
  uses: "actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  "timeout-minutes": 10,
  with: pdfRendererCacheInputs,
});
const pdfReproducibilityCiEvidence = [
  "build/evidence/pdf-renderer-reproducibility.json",
  "build/evidence/pdf-renderer-reproducibility-mismatch",
].join("\n");
const pdfReproducibilityReleaseCommand = [
  "./build/release-inputs/20w-linux-amd64",
  "publication verify-pdf-reproducibility",
  '--root . --ref "$RELEASE_TAG"',
  '--revision "$RELEASE_COMMIT"',
  "--receipt build/release-inputs/pdf-renderer-reproducibility.json",
].join(" ");

function pdfReproducibilitySetupIsExact(step) {
  return step?.name === "Set up the locked PDF Docker Buildx client"
    && step?.uses === pdfReproducibilitySetupAction
    && step?.if === undefined
    && continueOnErrorIsDisabled(step)
    && Object.keys(step?.with ?? {}).length === 2
    && step.with.version === "v0.36.1"
    && step.with["driver-opts"] === pdfReproducibilityBuildKit;
}

function pdfRendererCacheStepIsExact(step, expected) {
  if (!step || Object.keys(step).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([key, value]) => (
    typeof value === "object"
      ? Object.keys(step[key] ?? {}).length === Object.keys(value).length
        && propertiesMatch(step[key], value)
      : step[key] === value
  ));
}

function pdfRendererCacheStepsAreExact(steps, setupIndex, verifyIndex, receiptIndex) {
  const locate = (expected) => steps.findIndex((step) => pdfRendererCacheStepIsExact(step, expected));
  const restore = locate(pdfRendererCacheRestore);
  const guard = locate(pdfRendererCacheGuard);
  const save = locate(pdfRendererCacheSave);
  return restore > setupIndex && guard === restore + 1 && verifyIndex === guard + 1
    && save === verifyIndex + 1 && receiptIndex === save + 1
    && steps.filter((step) => step?.id === "pdf-renderer-cache").length === 1
    && steps.filter((step) => step?.id === "pdf-renderer-proof").length === 1;
}

function pdfReproducibilityCiJobIsExact(job) {
  const steps = job?.steps ?? [];
  const setupIndex = steps.findIndex(pdfReproducibilitySetupIsExact);
  const verifyIndex = steps.findIndex((step) => (
    step?.name === "Verify the selected PDF reproducibility proof"
    && step?.id === "pdf-renderer-proof"
    && step?.run?.trim() === pdfReproducibilityCiCommand
    && Object.keys(step?.env ?? {}).length === Object.keys(privateGoCommandEnvironment).length + 1
    && propertiesMatch(step?.env, privateGoCommandEnvironment)
    && step?.env?.RENDERER_PROOF === "${{ needs.impact-plan.outputs.renderer_proof }}"
    && step?.if === undefined
    && continueOnErrorIsDisabled(step)
  ));
  const receiptIndex = steps.findIndex((step) => (
    step?.name === "Retain the PDF renderer reproducibility evidence"
  ));
  const receipt = receiptIndex >= 0 ? steps[receiptIndex] : undefined;
  return job?.needs === "impact-plan"
    && job?.if === "needs.impact-plan.outputs.renderer == 'true'"
    && job?.["timeout-minutes"] === 75
    && Object.keys(job?.permissions ?? {}).length === 1
    && job.permissions.contents === "read"
    && continueOnErrorIsDisabled(job)
    && setupIndex >= 0
    && verifyIndex > setupIndex
    && receiptIndex > verifyIndex
    && pdfRendererCacheStepsAreExact(steps, setupIndex, verifyIndex, receiptIndex)
    && receipt?.if === "${{ always() && !cancelled() }}"
    && receipt?.uses === "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
    && continueOnErrorIsDisabled(receipt)
    && Object.keys(receipt?.with ?? {}).length === 4
    && receipt.with.name === "pdf-renderer-reproducibility"
    && receipt.with.path === pdfReproducibilityCiEvidence
    && receipt.with["if-no-files-found"] === "error"
    && receipt.with["retention-days"] === 30;
}

// validatePDFRendererReproducibilityWorkflowObject protects the real-Docker
// regression boundary without placing it in common or fast unit-test lanes.
export function validatePDFRendererReproducibilityWorkflowObject(workflow, relativePath) {
  if (relativePath === ".github/workflows/ci.yml") {
    const jobs = workflow?.jobs ?? {};
    const cacheActionCount = Object.values(jobs).flatMap((job) => job?.steps ?? [])
      .filter((step) => step?.uses?.startsWith("actions/cache")).length;
    const broadJobsContainHeavyProof = ["quality-full", "lane-release"].some((jobName) => (
      (jobs[jobName]?.steps ?? []).some((step) => (
        String(step?.run ?? "").includes("publication verify-pdf-reproducibility")
        || String(step?.run ?? "").includes("./cmd/pdf-proof")
      ))
    ));
    return privateGoJobHasNoInheritedEnvironment(workflow, jobs["pdf-renderer-reproducibility"])
      && cacheActionCount === 2
      && !broadJobsContainHeavyProof
      && pdfReproducibilityCiJobIsExact(jobs["pdf-renderer-reproducibility"])
      ? []
      : [`${relativePath}: CI must run the exact selected PDF reproducibility proof only in its renderer-selected gate and retain its receipt plus mismatch bytes`];
  }
  if (relativePath === ".github/workflows/release.yml") {
    const job = workflow?.jobs?.verify;
    const steps = job?.steps ?? [];
    const setupIndex = steps.findIndex(pdfReproducibilitySetupIsExact);
    const nativeIndex = steps.findIndex((step) => (
      step?.name === "Execute the native release binary and materialize the experiment plan"
    ));
    const verifyIndex = steps.findIndex((step) => (
      step?.name === "Rebuild the final PDF renderer twice without cache"
      && step?.run?.trim() === pdfReproducibilityReleaseCommand
      && step?.if === undefined
      && continueOnErrorIsDisabled(step)
      && Object.keys(step?.env ?? {}).length === 2
      && step.env.RELEASE_COMMIT === "${{ steps.release-ref.outputs.commit }}"
      && step.env.RELEASE_TAG === "${{ steps.release-ref.outputs.tag }}"
    ));
    const prepareIndex = steps.findIndex((step) => (
      step?.name === "Prepare version-bound release assets"
      && String(step?.run ?? "").includes("--additional-assets-root build/release-inputs")
    ));
    if (
      job?.["timeout-minutes"] === 180
      && continueOnErrorIsDisabled(job)
      && setupIndex >= 0
      && nativeIndex > setupIndex
      && verifyIndex > nativeIndex
      && prepareIndex > verifyIndex
    ) {
      return [];
    }
    return [`${relativePath}: tagged releases must run the exact two-builder PDF reproducibility acceptance and checksum its receipt as a release input`];
  }
  return [`${relativePath}: PDF reproducibility validator received an unsupported workflow`];
}

const ciImpactPlanEnvironment = Object.freeze({
  ...privateGoCommandEnvironment,
  BASE_SHA: "${{ github.event.pull_request.base.sha }}",
  BEFORE_SHA: "${{ github.event.before }}",
  CURRENT_SHA: "${{ github.sha }}",
  EVENT_NAME: "${{ github.event_name }}",
  HEAD_SHA: "${{ github.event.pull_request.head.sha }}",
});

const ciImpactPlanSource = [
  "set -euo pipefail",
  "mkdir -p build",
  'if [[ "$EVENT_NAME" == "pull_request" ]]; then',
  "  go -C tooling run ./cmd/ci-plan plan --root .. \\",
  '    --base "$BASE_SHA" --head "$HEAD_SHA" --json \\',
  "    > build/ci-impact-plan.json",
  'elif [[ "$EVENT_NAME" == "push" ]]; then',
  "  zero_sha=0000000000000000000000000000000000000000",
  "  valid_commit() {",
  '    local sha="$1"',
  '    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "${sha}^{commit}" 2>/dev/null',
  "  }",
  '  if [[ "$BEFORE_SHA" != "$zero_sha" ]] \\',
  '    && valid_commit "$BEFORE_SHA" \\',
  '    && valid_commit "$CURRENT_SHA" \\',
  '    && git merge-base --is-ancestor "$BEFORE_SHA" "$CURRENT_SHA"; then',
  "    go -C tooling run ./cmd/ci-plan plan --root .. \\",
  '      --base "$BEFORE_SHA" --head "$CURRENT_SHA" --json \\',
  "      > build/ci-impact-plan.json",
  "  else",
  '    echo "::notice::Main-push comparison is unavailable; running the fail-closed full plan."',
  "    go -C tooling run ./cmd/ci-plan plan --root .. --full --json \\",
  "      > build/ci-impact-plan.json",
  "  fi",
  "else",
  "  go -C tooling run ./cmd/ci-plan plan --root .. --full --json \\",
  "    > build/ci-impact-plan.json",
  "fi",
  "test -s build/ci-impact-plan.json",
  "go -C tooling run ./cmd/ci-plan project \\",
  '  < build/ci-impact-plan.json >> "$GITHUB_OUTPUT"',
].join("\n");

function impactPlanJobBoundaryIsExact(workflow, plan) {
  return [
    workflow?.defaults === undefined,
    privateGoJobHasNoInheritedEnvironment(workflow, plan),
    plan?.name === "CI impact plan",
    plan?.["runs-on"] === "ubuntu-latest",
    plan?.["timeout-minutes"] === 10,
    Object.keys(plan?.permissions ?? {}).length === 1,
    plan?.permissions?.contents === "read",
    plan?.if === undefined,
    continueOnErrorIsDisabled(plan),
    plan?.defaults === undefined,
    plan?.container === undefined,
    plan?.services === undefined,
    Object.keys(plan ?? {}).every((key) => [
      "name", "runs-on", "timeout-minutes", "permissions", "outputs", "steps",
    ].includes(key)),
  ].every(Boolean);
}

function impactPlanCheckoutIsExact(checkout) {
  return [
    actionUses(checkout, "actions/checkout"),
    checkout?.with?.["fetch-depth"] === 0,
    checkout?.with?.["persist-credentials"] === false,
    checkout?.if === undefined,
    checkout?.shell === undefined,
    continueOnErrorIsDisabled(checkout),
    Object.keys(checkout ?? {}).every((key) => ["name", "uses", "with"].includes(key)),
  ].every(Boolean);
}

function impactPlanGoSetupIsExact(setup) {
  return [
    actionUses(setup, "actions/setup-go"),
    setup?.with?.["go-version-file"] === "tooling/go.mod",
    setup?.with?.["cache-dependency-path"] === "tooling/go.sum",
    setup?.if === undefined,
    setup?.shell === undefined,
    continueOnErrorIsDisabled(setup),
    Object.keys(setup ?? {}).every((key) => ["name", "uses", "with"].includes(key)),
  ].every(Boolean);
}

function impactPlanProjectionStepIsExact(planStep) {
  return [
    planStep?.id === "plan",
    Object.keys(planStep?.env ?? {}).length === Object.keys(ciImpactPlanEnvironment).length,
    propertiesMatch(planStep?.env, ciImpactPlanEnvironment),
    String(planStep?.run ?? "").trim() === ciImpactPlanSource,
    planStep?.if === undefined,
    planStep?.shell === undefined,
    continueOnErrorIsDisabled(planStep),
    Object.keys(planStep ?? {}).every((key) => ["name", "id", "env", "run"].includes(key)),
  ].every(Boolean);
}

function impactPlanJobRunsExactProjection(workflow, plan) {
  const steps = plan?.steps ?? [];
  return [
    impactPlanJobBoundaryIsExact(workflow, plan),
    steps.length === 3,
    impactPlanCheckoutIsExact(steps[0]),
    impactPlanGoSetupIsExact(steps[1]),
    impactPlanProjectionStepIsExact(steps[2]),
  ].every(Boolean);
}

function validateCiImpactPlanJob(workflow, jobs, relativePath, findings) {
  const plan = jobs["impact-plan"];
  const expectedOutputs = {
    mode: "${{ steps.plan.outputs.mode }}",
    reason: "${{ steps.plan.outputs.reason }}",
    container: "${{ steps.plan.outputs.container }}",
    dependency: "${{ steps.plan.outputs.dependency }}",
    go: "${{ steps.plan.outputs.go }}",
    release: "${{ steps.plan.outputs.release }}",
    renderer: "${{ steps.plan.outputs.renderer }}",
    renderer_proof: "${{ steps.plan.outputs.renderer_proof }}",
    research: "${{ steps.plan.outputs.research }}",
    site: "${{ steps.plan.outputs.site }}",
    workstation_any: "${{ steps.plan.outputs.workstation_any }}",
    workstation_matrix: "${{ steps.plan.outputs.workstation_matrix }}",
  };
  recordExpectation(
    findings,
    Object.keys(plan?.outputs ?? {}).length === Object.keys(expectedOutputs).length
      && propertiesMatch(plan?.outputs, expectedOutputs),
    `${relativePath}: impact-plan must expose only the fixed validated Go projection`,
  );
  recordExpectation(
    findings,
    impactPlanJobRunsExactProjection(workflow, plan),
    `${relativePath}: pull requests and comparable main pushes must use exact impact diffs, while unavailable push ancestry and manual runs must fail closed`,
  );
}

function validateCiImpactLaneJobs(jobs, relativePath, findings) {
  const impactMode = "needs.impact-plan.outputs.mode == 'impact'";
  recordExpectation(
    findings,
    jobs["quality-full"]?.if === "needs.impact-plan.outputs.mode == 'full'",
    `${relativePath}: quality-full must run only for full plans`,
  );
  recordExpectation(
    findings,
    jobs["impact-common"]?.if === impactMode,
    `${relativePath}: impact-common must run for every impact plan`,
  );
  for (const lane of ["go", "release", "research", "site"]) {
    recordExpectation(
      findings,
      jobs[`lane-${lane}`]?.if === `${impactMode} && needs.impact-plan.outputs.${lane} == 'true'`,
      `${relativePath}: lane-${lane} must use only its fixed Go selector`,
    );
  }
  recordExpectation(
    findings,
    jobs["container-smoke"]?.if
      === "needs.impact-plan.outputs.mode == 'full' || needs.impact-plan.outputs.container == 'true'",
    `${relativePath}: container-smoke must run for full plans or its fixed selector`,
  );
  const dependency = jobs["dependency-review"];
  recordExpectation(
    findings,
    dependency?.needs === "impact-plan"
      && dependency?.if
        === "github.event_name == 'pull_request' && (needs.impact-plan.outputs.mode == 'full' || needs.impact-plan.outputs.dependency == 'true')"
      && continueOnErrorIsDisabled(dependency)
      && (dependency?.steps ?? []).every(continueOnErrorIsDisabled),
    `${relativePath}: dependency review must run only for full pull requests or its fixed impact selector and must fail closed`,
  );
}

function workstationJobsUseBoundedMatrix(core, artifacts, workstationCondition) {
  const matrix = artifacts?.strategy?.matrix;
  return [
    core?.if === workstationCondition,
    artifacts?.if === workstationCondition,
    artifacts?.strategy?.["fail-fast"] === false,
    artifacts?.strategy?.["max-parallel"] === 8,
    Object.keys(matrix ?? {}).length === 1,
    matrix?.include
      === "${{ fromJSON(needs.impact-plan.outputs.workstation_matrix) }}",
  ].every(Boolean);
}

function workstationJobsFailClosed(core, artifacts) {
  return [
    continueOnErrorIsDisabled(core),
    continueOnErrorIsDisabled(artifacts),
    (core?.steps ?? []).every(continueOnErrorIsDisabled),
    (artifacts?.steps ?? []).every(continueOnErrorIsDisabled),
  ].every(Boolean);
}

function workstationDispatchIsExact(step) {
  return [
    step?.if === undefined,
    Object.keys(step?.env ?? {}).length === 1,
    step?.env?.SCRIPT === "${{ matrix.script }}",
    String(step?.run ?? "").trim() === "npm run \"$SCRIPT\"",
  ].every(Boolean);
}

function validateCiImpactWorkstationJobs(jobs, relativePath, findings) {
  const workstationCondition = "needs.impact-plan.outputs.workstation_any == 'true'";
  const core = jobs["workstation-core"];
  const artifacts = jobs["workstation-artifacts"];
  recordExpectation(
    findings,
    workstationJobsUseBoundedMatrix(core, artifacts, workstationCondition),
    `${relativePath}: an empty workstation matrix must skip both workstation jobs and selected tests must use the bounded eight-concurrent-job matrix`,
  );
  const artifactStep = (artifacts?.steps ?? []).find((step) => (
    step?.name === "Run the allowlisted artifact test script"
  ));
  const coreStep = (core?.steps ?? []).find((step) => (
    step?.name === "Validate the workstation inventory and core"
  ));
  recordExpectation(
    findings,
    workstationJobsFailClosed(core, artifacts),
    `${relativePath}: workstation core, setup, and shard execution must fail closed`,
  );
  recordExpectation(
    findings,
    coreStep?.if === undefined
      && coreStep?.run?.trim()
        === "npm run validate:workstation && npm run test:workstation:core",
    `${relativePath}: workstation core must run its complete authority step unconditionally`,
  );
  recordExpectation(
    findings,
    workstationDispatchIsExact(artifactStep),
    `${relativePath}: workstation matrix execution must quote the Go-projected script without a second dispatch table`,
  );
  const pythonSteps = (artifacts?.steps ?? []).filter((step) => (
    step?.uses?.startsWith("actions/setup-python@")
      || String(step?.run ?? "").includes("requirements-ci.txt")
  ));
  recordExpectation(
    findings,
    pythonSteps.length === 2
      && pythonSteps.every((step) => step.if === "matrix.artifact == 'fixture-019'"),
    `${relativePath}: only Fixture 019 may provision the locked scientific runtime in the artifact matrix`,
  );
}

function validateCiImpactSuccessJob(jobs, relativePath, findings) {
  const expectedNeeds = [
    "impact-plan",
    "quality-full",
    "impact-common",
    "lane-go",
    "lane-release",
    "pdf-renderer-reproducibility",
    "lane-research",
    "lane-site",
    "workstation-core",
    "workstation-artifacts",
    "container-smoke",
    "dependency-review",
  ];
  const success = jobs["ci-success"];
  const successStep = success?.steps?.find((step) => (
    step?.name === "Require every expected gate state"
  ));
  const successSource = successStep?.run;
  const expectedEnvironment = {
    EVENT_NAME: "${{ github.event_name }}",
    MODE: "${{ needs.impact-plan.outputs.mode }}",
    SELECT_CONTAINER: "${{ needs.impact-plan.outputs.container }}",
    SELECT_DEPENDENCY: "${{ needs.impact-plan.outputs.dependency }}",
    SELECT_GO: "${{ needs.impact-plan.outputs.go }}",
    SELECT_RELEASE: "${{ needs.impact-plan.outputs.release }}",
    SELECT_RENDERER: "${{ needs.impact-plan.outputs.renderer }}",
    SELECT_RESEARCH: "${{ needs.impact-plan.outputs.research }}",
    SELECT_SITE: "${{ needs.impact-plan.outputs.site }}",
    SELECT_WORKSTATION: "${{ needs.impact-plan.outputs.workstation_any }}",
    RESULT_PLAN: "${{ needs.impact-plan.result }}",
    RESULT_QUALITY_FULL: "${{ needs.quality-full.result }}",
    RESULT_IMPACT_COMMON: "${{ needs.impact-common.result }}",
    RESULT_GO: "${{ needs.lane-go.result }}",
    RESULT_RELEASE: "${{ needs.lane-release.result }}",
    RESULT_RENDERER: "${{ needs.pdf-renderer-reproducibility.result }}",
    RESULT_RESEARCH: "${{ needs.lane-research.result }}",
    RESULT_SITE: "${{ needs.lane-site.result }}",
    RESULT_WORKSTATION_CORE: "${{ needs.workstation-core.result }}",
    RESULT_WORKSTATION_ARTIFACTS: "${{ needs.workstation-artifacts.result }}",
    RESULT_CONTAINER: "${{ needs.container-smoke.result }}",
    RESULT_DEPENDENCY_REVIEW: "${{ needs.dependency-review.result }}",
  };
  recordExpectation(
    findings,
    Array.isArray(success?.needs)
      && success.needs.length === expectedNeeds.length
      && expectedNeeds.every((job) => success.needs.includes(job)),
    `${relativePath}: ci-success must depend on every full, impact, matrix, container, and PR gate`,
  );
  recordExpectation(
    findings,
    [
      success?.if === "always()",
      continueOnErrorIsDisabled(success),
      successStep?.if === undefined,
      continueOnErrorIsDisabled(successStep),
      Object.keys(successStep?.env ?? {}).length === Object.keys(expectedEnvironment).length,
      propertiesMatch(successStep?.env, expectedEnvironment),
    ].every(Boolean),
    `${relativePath}: ci-success must unconditionally inspect the exact fail-closed state vector`,
  );
  recordExpectation(
    findings,
    stringIncludesAll(successSource, [
      'require_state impact-plan "$RESULT_PLAN" success',
      'require_state dependency-review "$RESULT_DEPENDENCY_REVIEW" success',
      'require_state quality-full "$RESULT_QUALITY_FULL" success',
      'require_state workstation-core "$RESULT_WORKSTATION_CORE" success',
      'require_state workstation-artifacts "$RESULT_WORKSTATION_ARTIFACTS" success',
      'require_state impact-common "$RESULT_IMPACT_COMMON" success',
      'require_selection lane-go "$RESULT_GO" "$SELECT_GO"',
      'require_selection lane-release "$RESULT_RELEASE" "$SELECT_RELEASE"',
      'require_selection pdf-renderer-reproducibility "$RESULT_RENDERER" "$SELECT_RENDERER"',
      'require_selection lane-research "$RESULT_RESEARCH" "$SELECT_RESEARCH"',
      'require_selection lane-site "$RESULT_SITE" "$SELECT_SITE"',
      'require_selection workstation-core "$RESULT_WORKSTATION_CORE" "$SELECT_WORKSTATION"',
      'require_selection workstation-artifacts "$RESULT_WORKSTATION_ARTIFACTS" "$SELECT_WORKSTATION"',
      'require_selection container-smoke "$RESULT_CONTAINER" "$SELECT_CONTAINER"',
      'require_selection dependency-review "$RESULT_DEPENDENCY_REVIEW" "$SELECT_DEPENDENCY"',
      'if [[ "$EVENT_NAME" != "pull_request" && "$EVENT_NAME" != "push" ]]; then\n      echo "::error::impact mode is allowed only for pull requests and pushes"\n      exit 1\n    fi',
      'if [[ "$EVENT_NAME" == "pull_request" ]]; then\n      require_selection dependency-review "$RESULT_DEPENDENCY_REVIEW" "$SELECT_DEPENDENCY"\n    else\n      require_state dependency-review "$RESULT_DEPENDENCY_REVIEW" skipped\n    fi',
      '"$SELECT_CONTAINER" "$SELECT_DEPENDENCY" "$SELECT_GO"',
      'full plan exposed a non-false semantic selector: $selector',
      "full plan did not expose its closed workstation matrix",
      'false) require_state "$gate" "$actual" skipped ;;',
      '*) echo "::error::$gate selector is malformed: $selected"; exit 1 ;;',
    ])
      && countOccurrences(
        successSource,
        'require_selection pdf-renderer-reproducibility "$RESULT_RENDERER" "$SELECT_RENDERER"',
      ) === 2
      && countOccurrences(
        successSource,
        'require_selection dependency-review "$RESULT_DEPENDENCY_REVIEW" "$SELECT_DEPENDENCY"',
      ) === 1
      && countOccurrences(
        successSource,
        'require_state dependency-review "$RESULT_DEPENDENCY_REVIEW" skipped',
      ) === 2
      && String(successSource ?? "").includes([
        'for selector in "$SELECT_CONTAINER" "$SELECT_DEPENDENCY" "$SELECT_GO" "$SELECT_RELEASE" \\',
        '      "$SELECT_RESEARCH" "$SELECT_SITE"; do',
      ].join("\n")),
    `${relativePath}: ci-success must reject unexpected states and any skipped selected lane`,
  );
}

export function validateCiImpactWorkflowObject(
  workflow,
  relativePath = ".github/workflows/ci.yml",
) {
  const findings = [];
  const trigger = workflow?.on;
  const pullRequest = trigger?.pull_request;
  recordExpectation(
    findings,
    Object.keys(trigger ?? {}).length === 3
      && Array.isArray(trigger?.push?.branches)
      && trigger.push.branches.length === 1
      && trigger.push.branches[0] === "main"
      && Object.keys(trigger?.push ?? {}).length === 1
      && Array.isArray(pullRequest?.branches)
      && pullRequest.branches.length === 1
      && pullRequest.branches[0] === "main"
      && Array.isArray(pullRequest?.types)
      && pullRequest.types.length === 3
      && ["opened", "synchronize", "reopened"]
        .every((type) => pullRequest.types.includes(type))
      && Object.keys(pullRequest ?? {}).length === 2
      && Object.prototype.hasOwnProperty.call(trigger ?? {}, "workflow_dispatch"),
    `${relativePath}: CI must run on main pushes, manual dispatches, and every pull-request code update`,
  );
  const jobs = workflow?.jobs ?? {};
  recordExpectation(
    findings,
    !Object.prototype.hasOwnProperty.call(jobs, "pr-title"),
    `${relativePath}: CI must delegate PR title validation to the standalone required workflow`,
  );
  validateCiImpactPlanJob(workflow, jobs, relativePath, findings);
  validateCiImpactLaneJobs(jobs, relativePath, findings);
  validateCiImpactWorkstationJobs(jobs, relativePath, findings);
  validateCiImpactSuccessJob(jobs, relativePath, findings);
  return findings;
}

function codeQlRequiredLaneIsExact(job) {
  return (
    job?.needs === undefined
    && job?.if === undefined
    && continueOnErrorIsDisabled(job)
    && (job?.steps ?? []).every(continueOnErrorIsDisabled)
  );
}

function codeQlStepIsExact(step, name, action, expectedWith) {
  return (
    step?.name === name
    && actionUses(step, action)
    && Object.keys(step ?? {}).every((key) => ["name", "uses", "with"].includes(key))
    && Object.keys(step?.with ?? {}).length === Object.keys(expectedWith).length
    && propertiesMatch(step?.with, expectedWith)
    && step?.if === undefined
    && step?.shell === undefined
    && continueOnErrorIsDisabled(step)
  );
}

function codeQlJobBoundaryIsExact(job, name, expectedStepCount) {
  return (
    job?.name === name
    && job?.needs === undefined
    && job?.if === undefined
    && job?.["runs-on"] === "ubuntu-latest"
    && job?.["timeout-minutes"] === 30
    && Object.keys(job?.permissions ?? {}).length === 3
    && propertiesMatch(job?.permissions, {
      contents: "read",
      "security-events": "write",
      actions: "read",
    })
    && continueOnErrorIsDisabled(job)
    && job?.defaults === undefined
    && job?.container === undefined
    && job?.services === undefined
    && Array.isArray(job?.steps)
    && job.steps.length === expectedStepCount
    && Object.keys(job ?? {}).every((key) => [
      "name", "runs-on", "timeout-minutes", "permissions", "steps",
    ].includes(key))
  );
}

function javaScriptCodeQlJobIsExact(job) {
  const steps = job?.steps ?? [];
  return (
    codeQlJobBoundaryIsExact(job, "JavaScript and TypeScript analysis", 3)
    && codeQlStepIsExact(steps[0], "Check out canonical source", "actions/checkout", {
      "persist-credentials": false,
    })
    && codeQlStepIsExact(steps[1], "Initialize CodeQL", "github/codeql-action/init", {
      languages: "javascript-typescript",
      queries: "security-extended,security-and-quality",
    })
    && codeQlStepIsExact(steps[2], "Analyze", "github/codeql-action/analyze", {
      category: "/language:javascript-typescript",
    })
  );
}

function goCodeQlJobIsExact(job) {
  const steps = job?.steps ?? [];
  return (
    codeQlJobBoundaryIsExact(job, "Go analysis", 4)
    && codeQlStepIsExact(steps[0], "Check out canonical source", "actions/checkout", {
      "persist-credentials": false,
    })
    && codeQlStepIsExact(steps[1], "Use Go 1.27", "actions/setup-go", {
      "go-version-file": "tooling/go.mod",
      "cache-dependency-path": "tooling/go.sum",
    })
    && codeQlStepIsExact(steps[2], "Initialize CodeQL", "github/codeql-action/init", {
      languages: "go",
      "build-mode": "autobuild",
      queries: "security-extended,security-and-quality",
    })
    && codeQlStepIsExact(steps[3], "Analyze", "github/codeql-action/analyze", {
      category: "/language:go",
    })
  );
}

export function validateCodeQlImpactWorkflowObject(
  workflow,
  relativePath = ".github/workflows/codeql.yml",
) {
  const findings = [];
  const jobs = workflow?.jobs ?? {};
  recordExpectation(
    findings,
    jobs["impact-plan"] === undefined
      && codeQlRequiredLaneIsExact(jobs.analyze)
      && codeQlRequiredLaneIsExact(jobs["analyze-go"]),
    `${relativePath}: both configured CodeQL languages must run on every protected commit`,
  );
  recordExpectation(
    findings,
    javaScriptCodeQlJobIsExact(jobs.analyze),
    `${relativePath}: JavaScript and TypeScript CodeQL must keep its exact fail-closed initialization and analysis boundary`,
  );
  return findings;
}

export function validateGoCodeQlWorkflowObject(
  workflow,
  relativePath = ".github/workflows/codeql.yml",
) {
  const findings = validateGoRuntimeWorkflowObject(workflow, "analyze-go", relativePath);
  const steps = workflow?.jobs?.["analyze-go"]?.steps ?? [];
  const initialize = steps.find((step) => step?.uses?.startsWith("github/codeql-action/init@"));
  const analyze = steps.find((step) => step?.uses?.startsWith("github/codeql-action/analyze@"));
  if (initialize?.with?.languages !== "go" || initialize?.with?.["build-mode"] !== "autobuild") {
    findings.push(`${relativePath}: analyze-go must initialize CodeQL autobuild for Go`);
  }
  if (analyze?.with?.category !== "/language:go") {
    findings.push(`${relativePath}: analyze-go must publish the /language:go category`);
  }
  if (!goCodeQlJobIsExact(workflow?.jobs?.["analyze-go"])) {
    findings.push(`${relativePath}: Go CodeQL must keep its exact fail-closed initialization and analysis boundary`);
  }
  return findings;
}

function repositoryMetadataTriggerIsExact(trigger) {
  const push = trigger?.push;
  const issues = trigger?.issues;
  return (
    Object.keys(trigger ?? {}).length === 3
    && Array.isArray(issues?.types)
    && issues.types.length === 2
    && ["closed", "reopened"].every((type) => issues.types.includes(type))
    && Object.keys(issues ?? {}).length === 1
    && arrayIncludes(push?.branches, "main")
    && arrayIncludes(push?.paths, ".github/labels.json")
    && arrayIncludes(push?.paths, ".github/milestones.json")
    && arrayIncludes(push?.paths, ".github/issue-milestones.json")
    && arrayIncludes(push?.paths, "tooling/cmd/20w/github_issue_lifecycle.go")
    && arrayIncludes(push?.paths, "tooling/cmd/20w/github_pr_metadata.go")
    && arrayIncludes(push?.paths, "tooling/internal/githubapi/**")
    && arrayIncludes(push?.paths, "tooling/internal/githubissuelifecycle/**")
    && arrayIncludes(push?.paths, "tooling/internal/githubprmetadata/**")
    && Object.prototype.hasOwnProperty.call(trigger ?? {}, "workflow_dispatch")
  );
}

function repositoryMetadataPermissionsAreExact(job) {
  return (
    propertiesMatch(job?.permissions, {
      contents: "read", issues: "write", "pull-requests": "write",
    })
    && Object.keys(job?.permissions ?? {}).length === 3
  );
}

function repositoryMetadataExecutionIsBounded(workflow, job) {
  const steps = job?.steps ?? [];
  const checkout = steps.find((step) => actionUses(step, "actions/checkout"));
  const setup = steps.find((step) => actionUses(step, "actions/setup-go"));
  return (
    workflow?.concurrency?.group === "repository-metadata-sync"
    && workflow?.concurrency?.["cancel-in-progress"] === false
    && workflow?.concurrency?.queue === "max"
    && Object.keys(workflow?.concurrency ?? {}).length === 3
    && job?.if === undefined
    && job?.defaults === undefined
    && job?.container === undefined
    && job?.services === undefined
    && continueOnErrorIsDisabled(job)
    && steps.length === 4
    && steps.every(continueOnErrorIsDisabled)
    && steps.every((step) => step?.shell === undefined)
    && checkout?.if === undefined
    && setup?.if === undefined
  );
}

function repositoryMetadataCommandIsExact(synchronization) {
  return (
    synchronization?.run === 'go -C tooling run ./cmd/20w github sync-metadata --root .. --repository "$GITHUB_REPOSITORY"'
    && synchronization?.if === "github.event_name != 'issues'"
    && synchronization?.shell === undefined
    && synchronization?.env?.GH_TOKEN === "${{ github.token }}"
    && Object.keys(synchronization?.env ?? {}).length === 1
  );
}

function repositoryLifecycleCommandIsExact(synchronization) {
  const expected = [
    "go -C tooling run ./cmd/20w github sync-issue-lifecycle",
    '--root .. --repository "$GITHUB_REPOSITORY"',
    '--issue "$ISSUE_NUMBER" --issue-action "$ISSUE_ACTION"',
  ].join(" ");
  return (
    synchronization?.run === expected
    && synchronization?.if === "github.event_name == 'issues'"
    && synchronization?.shell === undefined
    && propertiesMatch(synchronization?.env, {
      GH_TOKEN: "${{ github.token }}",
      ISSUE_ACTION: "${{ github.event.action }}",
      ISSUE_NUMBER: "${{ github.event.issue.number }}",
    })
    && Object.keys(synchronization?.env ?? {}).length === 3
  );
}

export function validateRepositoryMetadataSyncWorkflowObject(
  workflow,
  relativePath = ".github/workflows/sync-repository-metadata.yml",
) {
  const findings = validateGoRuntimeWorkflowObject(workflow, "sync", relativePath);
  const trigger = workflow?.on;
  if (!repositoryMetadataTriggerIsExact(trigger)) {
    findings.push(`${relativePath}: repository metadata synchronization must run for issue close/reopen events, all three canonical manifests and every owned metadata source on main, and manual repair`);
  }
  const job = workflow?.jobs?.sync;
  if (!repositoryMetadataPermissionsAreExact(job)) {
    findings.push(`${relativePath}: repository metadata synchronization needs only contents:read, issues:write, and pull-requests:write`);
  }
  if (!repositoryMetadataExecutionIsBounded(workflow, job)) {
    findings.push(`${relativePath}: repository metadata synchronization must use GitHub's maximum pending queue without cancellation or failure bypass`);
  }
  const checkout = (job?.steps ?? []).find((step) => actionUses(step, "actions/checkout"));
  if (checkout?.with?.ref !== "refs/heads/main") {
    findings.push(`${relativePath}: manual metadata repair must still check out canonical main`);
  }
  const synchronization = findStepByRunFragment(
    job?.steps ?? [],
    "github sync-metadata --root .. --repository",
  );
  if (!repositoryMetadataCommandIsExact(synchronization)) {
    findings.push(`${relativePath}: the trusted Go command must apply canonical labels, milestones, and mapped issue assignments with the job token`);
  }
  const lifecycle = findStepByRunFragment(
    job?.steps ?? [],
    '--issue "$ISSUE_NUMBER" --issue-action "$ISSUE_ACTION"',
  );
  if (!repositoryLifecycleCommandIsExact(lifecycle)) {
    findings.push(`${relativePath}: closed and reopened issues must pass trusted event identity to the bounded Go lifecycle repair`);
  }
  return findings;
}

function pullRequestMetadataTriggerIsExact(trigger) {
  const pullRequestTarget = trigger?.pull_request_target;
  const expectedTypes = ["opened", "edited", "synchronize", "reopened", "closed"];
  return (
    Object.keys(trigger ?? {}).length === 1
    && Object.keys(pullRequestTarget ?? {}).length === 1
    && Array.isArray(pullRequestTarget?.types)
    && pullRequestTarget.types.length === expectedTypes.length
    && expectedTypes.every((type) => pullRequestTarget.types.includes(type))
  );
}

function pullRequestLabelerStepIsExact(labeler) {
  return (
    actionUses(labeler, "actions/labeler")
    && labeler?.if === "github.event.action != 'closed'"
    && propertiesMatch(labeler?.with, { "sync-labels": true })
    && Object.keys(labeler?.with ?? {}).length === 1
  );
}

function pullRequestTrustedCheckoutIsExact(checkout) {
  return (
    actionUses(checkout, "actions/checkout")
    && propertiesMatch(checkout?.with, {
      ref: "refs/heads/main",
      "persist-credentials": false,
      "allow-unsafe-pr-checkout": false,
    })
    && Object.keys(checkout?.with ?? {}).length === 3
  );
}

function pullRequestGoSetupIsExact(setup) {
  return (
    actionUses(setup, "actions/setup-go")
    && propertiesMatch(setup?.with, {
      "go-version-file": "tooling/go.mod",
      "cache-dependency-path": "tooling/go.sum",
    })
    && Object.keys(setup?.with ?? {}).length === 2
  );
}

function pullRequestSynchronizationIsExact(synchronization, expectedCommand) {
  return (
    synchronization?.run === expectedCommand
    && propertiesMatch(synchronization?.env, {
      GH_TOKEN: "${{ github.token }}",
      PULL_REQUEST: "${{ github.event.pull_request.number }}",
      PULL_REQUEST_ACTION: "${{ github.event.action }}",
      PULL_REQUEST_MERGED: "${{ github.event.pull_request.merged }}",
    })
    && Object.keys(synchronization?.env ?? {}).length === 4
  );
}

function pullRequestMetadataStepsAreExact(steps) {
  if (!Array.isArray(steps) || steps.length !== 4) return false;
  const [labeler, checkout, setup, synchronization] = steps;
  const expectedCommand = [
    "go -C tooling run ./cmd/20w github sync-pr-metadata",
    '--root .. --repository "$GITHUB_REPOSITORY"',
    '--pull-request "$PULL_REQUEST"',
    '--event-action "$PULL_REQUEST_ACTION"',
    '--merged "$PULL_REQUEST_MERGED"',
  ].join(" ");
  return (
    pullRequestLabelerStepIsExact(labeler)
    && pullRequestTrustedCheckoutIsExact(checkout)
    && pullRequestGoSetupIsExact(setup)
    && pullRequestSynchronizationIsExact(synchronization, expectedCommand)
    && [labeler, checkout, setup, synchronization].every(continueOnErrorIsDisabled)
    && [labeler, checkout, setup, synchronization].every((step) => step?.shell === undefined)
    && [checkout, setup, synchronization].every((step) => step?.if === undefined)
  );
}

function pullRequestMetadataPermissionsAreExact(workflow, job) {
  return (
    Object.keys(workflow?.permissions ?? {}).length === 1
    && workflow?.permissions?.contents === "read"
    && Object.keys(job?.permissions ?? {}).length === 3
    && propertiesMatch(job?.permissions, {
      contents: "read", issues: "write", "pull-requests": "write",
    })
  );
}

function pullRequestMetadataBoundaryIsExact(workflow, job) {
  return (
    job?.["runs-on"] === "ubuntu-latest"
    && job?.["timeout-minutes"] === 10
    && job?.if === undefined
    && continueOnErrorIsDisabled(job)
    && workflow?.concurrency?.group === "${{ github.workflow }}-${{ github.event.pull_request.number }}"
    && workflow?.concurrency?.["cancel-in-progress"] === false
    && workflow?.concurrency?.queue === "max"
    && Object.keys(workflow?.concurrency ?? {}).length === 3
  );
}

export function validatePullRequestMetadataWorkflowObject(
  workflow,
  relativePath = ".github/workflows/labeler.yml",
) {
  const findings = [];
  if (!pullRequestMetadataTriggerIsExact(workflow?.on)) {
    findings.push(`${relativePath}: trusted metadata projection and lifecycle cleanup must run on opened, edited, synchronized, reopened, and closed pull requests`);
  }
  const job = workflow?.jobs?.label;
  if (!pullRequestMetadataPermissionsAreExact(workflow, job)) {
    findings.push(`${relativePath}: pull-request metadata needs only contents:read, issues:write, and pull-requests:write at job scope`);
  }
  if (!pullRequestMetadataBoundaryIsExact(workflow, job)) {
    findings.push(`${relativePath}: pull-request metadata must keep its bounded hosted runner and maximum per-pull-request pending queue`);
  }
  if (!pullRequestMetadataStepsAreExact(job?.steps)) {
    findings.push(`${relativePath}: pull-request metadata must skip path labeling on close, check out only trusted main, and run the exact bounded Go projection and lifecycle cleanup`);
  }
  return findings;
}

function validateReleaseRefSource(source, relativePath) {
  const findings = [];
  const expectations = [
    [
      source.includes("git show-ref --verify --quiet refs/remotes/origin/main"),
      `${relativePath}: release-ref must fail closed when origin/main is unavailable`,
    ],
    [
      source.includes('git merge-base --is-ancestor "$release_commit" refs/remotes/origin/main'),
      `${relativePath}: tagged release commits must be contained in origin/main`,
    ],
    [
      source.includes('git rev-parse "${EVENT_SHA}^{commit}"'),
      `${relativePath}: tag-push releases must bind the triggering event SHA`,
    ],
    [
      source.includes('"$EVENT_REF" != "refs/tags/${RELEASE_TAG}"')
        && source.includes('"$event_commit" != "$release_commit"'),
      `${relativePath}: release runs must bind the exact tag ref and commit`,
    ],
  ];
  for (const [accepted, message] of expectations) {
    if (!accepted) findings.push(message);
  }
  return findings;
}

function findRunStepIndex(steps, fragments) {
  return steps.findIndex((step) => (
    typeof step?.run === "string"
    && fragments.every((fragment) => step.run.includes(fragment))
  ));
}

const releasePDFRenderStepName = "Render the immutable tag-bound book";
const releasePDFRenderCommand = 'npm run generate:book-pdf -- --ref "$RELEASE_TAG" --revision "$RELEASE_COMMIT"';

function releasePDFRenderStepIndex(steps) {
  const named = steps
    .map((step, index) => ({ index, step }))
    .filter(({ step }) => step?.name === releasePDFRenderStepName);
  if (named.length !== 1) return -1;
  const { index, step } = named[0];
  return step?.run?.trim() === releasePDFRenderCommand
    && step?.if === undefined
    && continueOnErrorIsDisabled(step)
    && Object.keys(step?.env ?? {}).length === 2
    && step.env.RELEASE_COMMIT === "${{ steps.release-ref.outputs.commit }}"
    && step.env.RELEASE_TAG === "${{ steps.release-ref.outputs.tag }}"
    ? index
    : -1;
}

function releaseVerificationStepIndices(steps) {
  return {
    binary: findRunStepIndex(steps, ["go -C tooling run ./cmd/build-release"]),
    execute: findRunStepIndex(steps, [
      "./build/release-inputs/20w-linux-amd64 version --json",
      "experiment release-plan --root .. --json",
    ]),
    prepare: findRunStepIndex(steps, ['npm run prepare:release -- --tag "$RELEASE_TAG"']),
    render: releasePDFRenderStepIndex(steps),
  };
}

function validateReleasePDFBuilder(steps, indices, relativePath) {
  const findings = [];
  const setup = findStepByName(steps, "Set up the locked PDF Docker Buildx client");
  const setupPosition = stepPosition(steps, "Set up the locked PDF Docker Buildx client");
  const gatePosition = stepPosition(steps, "Run the full repository gate");
  recordExpectation(
    findings,
    indices.render >= 0,
    `${relativePath}: release PDF render must use its exact reviewed step, verified tag and commit outputs, and bounded command without a failure bypass`,
  );
  recordExpectation(
    findings,
    actionUses(setup, "docker/setup-buildx-action")
      && propertiesMatch(setup?.with, {
        version: buildxPolicy.version,
        "driver-opts": buildxPolicy.buildkit,
      })
      && gatePosition >= 0
      && setupPosition > gatePosition
      && indices.render > setupPosition,
    `${relativePath}: tag-bound PDF rendering must provision the locked Buildx client and BuildKit image after the source gate`,
  );
  return findings;
}

function validateNativeReleaseBuild(steps, indices, relativePath) {
  const findings = [];
  if (indices.render < 0) {
    findings.push(`${relativePath}: release assets require a tag-bound PDF render`);
  }
  const binaryStep = indices.binary >= 0 ? steps[indices.binary] : undefined;
  if (indices.binary < 0 || indices.binary <= indices.render) {
    findings.push(`${relativePath}: native 20w binaries must be built after the tag-bound PDF render`);
    return findings;
  }
  for (const fragment of [
    'source_timestamp="$(git show -s --format=%cI "$RELEASE_COMMIT")"',
    '--version "$RELEASE_TAG"',
    '--revision "$RELEASE_COMMIT"',
    '--built-at "$source_timestamp"',
    "--output-root ../build/release-inputs",
  ]) {
    if (!binaryStep.run.includes(fragment)) {
      findings.push(`${relativePath}: native binary build must include ${fragment}`);
    }
  }
  if (
    binaryStep.env?.RELEASE_COMMIT !== "${{ steps.release-ref.outputs.commit }}"
    || binaryStep.env?.RELEASE_TAG !== "${{ steps.release-ref.outputs.tag }}"
  ) {
    findings.push(`${relativePath}: native binary build must bind the verified release tag and commit`);
  }
  return findings;
}

function validateReleasePreparation(steps, indices, relativePath) {
  const findings = [];
  const preparationFollowsBinary = indices.prepare >= 0
    && indices.binary >= 0
    && indices.prepare > indices.binary;
  if (!preparationFollowsBinary) {
    findings.push(`${relativePath}: release preparation must follow the native binary build`);
  } else if (!steps[indices.prepare].run.includes("--additional-assets-root build/release-inputs")) {
    findings.push(`${relativePath}: release preparation must ingest the native binaries as additional assets`);
  }
  const executionFollowsBinary = indices.execute >= 0
    && indices.binary >= 0
    && indices.execute > indices.binary;
  const executionPrecedesPreparation = indices.prepare < 0 || indices.execute < indices.prepare;
  if (!executionFollowsBinary || !executionPrecedesPreparation) {
    findings.push(`${relativePath}: the exercised Linux amd64 binary must validate source and materialize the manifest release plan before asset preparation`);
  } else if (!steps[indices.execute].run.includes(
    "> build/release-inputs/experiment-release-plan.json",
  )) {
    findings.push(`${relativePath}: the release plan redirect must stay inside the repository release-input directory`);
  }
  return findings;
}

function releaseInventoryIsChecksumDerived(publication) {
  const inventoryCommand = [
    '"$tool" release asset-inventory \\',
    "  --assets build/release/assets \\",
    '  --phase publication > "$expected_inventory"',
  ].join("\n");
  const remoteLookup = '"$tool" release state \\';
  const assetFetch = '"$tool" release fetch-assets \\';
  if (!stringIncludesAll(publication, [
    "export LC_ALL=C",
    "tool=build/release-tools/20w",
    inventoryCommand,
    'mapfile -t expected_assets < "$expected_inventory"',
    "revalidate_local_assets",
    'local inventory="$comparison_root/local-revalidated.txt"',
    'diff --unified=0 "$expected_inventory" "$inventory"',
    remoteLookup,
    assetFetch,
    '--expected-assets build/release/assets',
    '--release-id "$release_id"',
    '--phase publication',
    '--output "$download_root"',
  ])) return false;
  return !publication.includes("expected_assets=(")
    && !publication.includes("checksum_line_pattern=")
    && !publication.includes("gh api")
    && publication.indexOf(inventoryCommand) < publication.indexOf(remoteLookup);
}

function releaseAssetPublicationIsSafe(publication) {
  const forbiddenMutations = [
    "--clobber", "gh release delete", "gh release delete-asset",
    "gh api", "git push --force",
    "git push --delete", "git tag -d", "git tag -f", "git update-ref",
  ];
  const missingUpload = 'gh release upload "$RELEASE_TAG" "${missing_assets[@]}"';
  const existingVerification = 'verify_complete_remote_assets "$comparison_root/draft-complete"';
  const releaseEdit = 'gh release edit "$RELEASE_TAG"';
  const releaseCreate = 'gh release create "$RELEASE_TAG" "${assets[@]}"';
  const newVerification = 'verify_complete_remote_assets "$comparison_root/new-draft-complete"';
  if (!stringIncludesAll(publication, [
    '"$tool" release state \\',
    '--repository "$GITHUB_REPOSITORY"',
    'if [[ "$EVENT_NAME" != "workflow_dispatch"',
    "load_remote_assets",
    'diff --unified=0 "$expected_inventory" "$remote_inventory"',
    '"$tool" release fetch-assets',
    '--release-id "$release_id"',
    '--expected-assets build/release/assets',
    '--phase publication',
    '--output "$download_root"',
    'compare_asset "$name" "$download_root/$name"',
    'expected_sha="$(sha256sum "$expected" | awk \'{print $1}\')"',
    'downloaded_sha="$(sha256sum "$downloaded" | awk \'{print $1}\')"',
    'cmp --silent -- "$expected" "$downloaded"',
    '"$tool" release asset-inventory',
    '--assets "$download_root"',
    '--phase publication',
    'verify_asset_attestation "$download_root/$name"',
    "revalidate_local_assets",
    "remote_by_name",
    'missing_assets+=("build/release/assets/${name}")',
    missingUpload, "verify_complete_remote_assets", releaseEdit, releaseCreate,
    "remote release asset differs from the local asset", "--draft", "--draft=false", "--verify-tag",
    'release_prerelease" != "false"', 'release_immutable" != "true"',
    'case "$PREFLIGHT_STATE" in', "published)", "exit 0",
  ])) return false;
  if (forbiddenMutations.some((fragment) => publication.includes(fragment))) return false;
  return countOccurrences(publication, "gh release upload") === 1
    && countOccurrences(publication, "revalidate_local_assets") >= 5
    && publication.indexOf(missingUpload) < publication.indexOf(existingVerification)
    && publication.indexOf(existingVerification) < publication.indexOf(releaseEdit)
    && publication.indexOf(releaseCreate) < publication.indexOf(newVerification);
}

function publishedValidationLaneIsReadOnly(publication) {
  if (typeof publication !== "string") return false;
  const lines = publication.split("\n");
  const start = lines.findIndex((line) => line.trim() === "published)");
  const end = lines.findIndex((line, index) => index > start && line.trim() === "exit 0");
  if (start < 0 || end < 0) return false;
  const lane = lines.slice(start, end + 1).join("\n");
  const forbidden = [
    "gh api", "gh release create", "gh release edit",
    "gh release upload", "gh release delete", "git push", "git tag", "docker buildx",
    "docker push", "curl ", "wget ",
  ];
  return stringIncludesAll(lane, [
    '"${verify_tag[@]}"',
    'verify_complete_remote_assets "$comparison_root/published-recheck"',
    "immutable release changed during final validation",
    "exit 0",
  ]) && forbidden.every((fragment) => !lane.includes(fragment));
}

function diagnosticImmediatelyExits(source, diagnostic) {
  if (typeof source !== "string") return false;
  const lines = source.split("\n");
  const diagnosticIndex = lines.findIndex((line) => line.includes(diagnostic));
  if (diagnosticIndex < 0) return false;
  const next = lines.slice(diagnosticIndex + 1).find((line) => line.trim() !== "");
  return next?.trim() === "exit 1";
}

function releasePreflightIsFailClosed(preflight) {
  if (!stringIncludesAll(preflight, [
    "release asset-inventory",
    "--phase source",
    "release verify-tag",
    '--repository "$GITHUB_REPOSITORY"',
    '--commit "$RELEASE_COMMIT"',
    "release compare-publication-manifest",
    "release state \\",
    "release fetch-assets \\",
    '--release-id "$release_id"',
    "--expected-assets ../build/release/assets",
    "--phase source",
    '--output "$existing_root"',
    '--tag "$RELEASE_TAG"',
    '--revision "$RELEASE_COMMIT"',
    "release_state=absent",
    "release_state=draft",
    "release_state=published",
    "the release is unexpectedly marked as a prerelease",
    "published immutable release assets are incomplete",
    "oci-images.json",
    "release validate-oci-images",
    'cmp --silent -- "$expected" "$downloaded"',
  ])) return false;
  const forbiddenMutations = [
    "gh api",
    "gh release ", "git push", "git tag", "docker buildx", "curl ", "wget ",
  ];
  return forbiddenMutations.every((fragment) => !preflight.includes(fragment))
    && !preflight.includes("checksum_line_pattern=") && [
    "existing release asset differs from the local asset",
    "published immutable release assets are incomplete",
  ].every((diagnostic) => diagnosticImmediatelyExits(preflight, diagnostic));
}

function releaseFinalComparisonIsFailClosed(publication) {
  return [
    "remote release asset differs from the local asset",
    "remote release assets do not match the checksum-derived inventory",
    "local release asset authority changed before publication mutation",
    "remote release checksum authority changed during verification",
    "published release did not become immutable after five checks",
  ].every((diagnostic) => diagnosticImmediatelyExits(publication, diagnostic));
}

function validateImmutableReleaseBoundary(releaseSteps, relativePath, findings) {
  const downloadPosition = stepPosition(releaseSteps, "Download the verified release workspace");
  const preflightPosition = stepPosition(releaseSteps, "Preflight the remote release without mutation");
  const buildxPosition = stepPosition(releaseSteps, "Set up Docker Buildx");
  const preflight = findStepById(releaseSteps, "release-preflight")?.run;
  const publication = findStepByName(
    releaseSteps,
    "Publish or validate the immutable GitHub release",
  )?.run;
  recordExpectation(
    findings,
    downloadPosition >= 0 && preflightPosition === downloadPosition + 1
      && buildxPosition > preflightPosition
      && releasePreflightIsFailClosed(preflight),
    `${relativePath}: existing releases must pass the read-only asset and peeled-tag preflight before publication mutations`,
  );
  recordExpectation(
    findings,
    releaseInventoryIsChecksumDerived(publication),
    `${relativePath}: release asset inventory must derive safe sorted unique basenames from validated SHA256SUMS before remote access`,
  );
  recordExpectation(
    findings,
    releaseAssetPublicationIsSafe(publication)
      && releaseFinalComparisonIsFailClosed(publication)
      && publishedValidationLaneIsReadOnly(publication),
    `${relativePath}: same-tag release assets must use the closed inventory, compare existing bytes, upload only missing files, and never replace or delete`,
  );
  recordExpectation(
    findings,
    countOccurrences(publication, '"${verify_tag[@]}"') >= 5
      && publication?.includes('"$tool" release verify-tag')
      && publication?.includes('--repository "$GITHUB_REPOSITORY"')
      && publication?.includes('gh release create "$RELEASE_TAG" "${assets[@]}"')
      && publication?.includes("--draft \\")
      && publication?.includes('gh release edit "$RELEASE_TAG" --verify-tag --draft=false')
      && publication?.includes('gh release edit "$RELEASE_TAG" \\')
      && publication?.includes("--notes-file build/release/published-release-notes.md")
      && publication?.includes("published release did not become immutable")
      && publication?.includes('release_prerelease" != "false"'),
    `${relativePath}: release publication must verify the peeled tag and complete draft before immutable non-prerelease publication`,
  );
}

function validateOCIImageAssetBoundary(releaseSteps, relativePath, findings) {
  const materialize = findStepByName(releaseSteps, "Materialize the immutable OCI image authority");
  const resolve = findStepById(releaseSteps, "release-images");
  const persistedIdentity = findStepByName(
    releaseSteps,
    "Validate persisted release image identities and tag bindings",
  );
  const persistedProvenance = findStepByName(
    releaseSteps,
    "Verify persisted image provenance against the tag source",
  );
  const persistedAnonymous = findStepByName(
    releaseSteps,
    "Revalidate persisted image digests anonymously",
  );
  const assetVerification = findStepByName(
    releaseSteps,
    "Verify the complete release-asset attestations against the tag source",
  );
  const publicationPosition = stepPosition(
    releaseSteps,
    "Publish or validate the immutable GitHub release",
  );
  const orderedNames = [
    "Bind final release tags to the admitted digests",
    "Prove final image digests are anonymously pullable",
    "Materialize the immutable OCI image authority",
    "Resolve the immutable OCI image authority",
    "Validate persisted release image identities and tag bindings",
    "Verify persisted image provenance against the tag source",
    "Revalidate persisted image digests anonymously",
    "Attest the complete release asset inventory",
    "Verify the complete release-asset attestations against the tag source",
  ];
  const positions = orderedNames.map((name) => stepPosition(releaseSteps, name));
  recordExpectation(
    findings,
    materialize?.if === releaseMutationGuard
      && stringIncludesAll(materialize?.run, [
        "release write-oci-images", "--tooling-digest", "--fixture-007-digest",
        "--fixture-019-digest", "oci-images.json", "existing-draft-SHA256SUMS",
        "release asset-inventory", "--phase publication", "release validate-oci-images",
      ])
      && resolve?.if === undefined
      && stringIncludesAll(resolve?.run, [
        "release validate-oci-images", "--input build/release/assets/oci-images.json",
        "--github-output", '>> "$GITHUB_OUTPUT"',
      ])
      && positions.every((position) => position >= 0)
      && positions.every((position, index) => index === 0 || positions[index - 1] < position)
      && publicationPosition > positions.at(-1),
    `${relativePath}: oci-images.json must become the checksum-bound authority only after final anonymous digest admission`,
  );
  recordExpectation(
    findings,
    [persistedIdentity, persistedProvenance, persistedAnonymous, assetVerification]
      .every((step) => step && step.if === undefined)
      && stringIncludesAll(persistedIdentity?.run, [
        "release inspect-image", "--require-existing", "persisted_digest=${expected_digest}",
        "fixture-007", "fixture-019", "NO_RESULT",
      ])
      && stringIncludesAll(persistedProvenance?.run, [
        "gh attestation verify", '--source-digest "$RELEASE_COMMIT"',
        '--source-ref "refs/tags/$RELEASE_TAG"',
      ])
      && stringIncludesAll(persistedAnonymous?.run, [
        'printf \'%s\\n\' \'{"auths":{}}\' > "$anonymous_config/config.json"',
        'DOCKER_CONFIG="$anonymous_config" docker pull "$image"',
        "persisted release image", "exit 1",
      ])
      && ![
        "docker login", "GHCR_TOKEN", "GHCR_USERNAME", "github.token",
      ].some((fragment) => persistedAnonymous?.run?.includes(fragment))
      && persistedAnonymous?.env?.GHCR_TOKEN === undefined
      && persistedAnonymous?.env?.GHCR_USERNAME === undefined
      && diagnosticImmediatelyExits(persistedAnonymous?.run, "persisted release image"),
    `${relativePath}: immutable published reruns must revalidate persisted assets, images, provenance, and anonymous pulls without mutation`,
  );
}

function validateReleaseAssetProvenance(workflow, relativePath) {
  const releaseSteps = workflow?.jobs?.release?.steps ?? [];
  const findings = [];
  const preflight = findStepById(releaseSteps, "release-preflight");
  const publication = findStepByName(
    releaseSteps,
    "Publish or validate the immutable GitHub release",
  );
  const attestation = findStepByName(releaseSteps, "Attest the complete release asset inventory");
  if (
    !stringIncludesAll(preflight?.run, [
      "release asset-inventory", "--assets ../build/release/assets", "--phase source",
    ])
    || !stringIncludesAll(publication?.run, [
      '"$tool" release asset-inventory', "--assets build/release/assets", "--phase publication",
    ])
    || !actionUses(attestation, "actions/attest-build-provenance")
    || attestation?.if !== releaseMutationGuard
    || attestation?.with?.["subject-path"] !== "build/release/assets/*"
  ) {
    findings.push(`${relativePath}: checksums and provenance must cover the exact generated release asset directory`);
  }
  const assetVerification = findStepByName(
    releaseSteps,
    "Verify the complete release-asset attestations against the tag source",
  )?.run;
  if (!stringIncludesAll(assetVerification, [
    "gh attestation verify", '--source-digest "$RELEASE_COMMIT"',
    '--source-ref "refs/tags/$RELEASE_TAG"', "for asset in build/release/assets/*; do",
    'verify_asset "$asset"',
  ])) {
    findings.push(`${relativePath}: attached release assets must verify against the exact tag source before publication`);
  }
  validateImmutableReleaseBoundary(releaseSteps, relativePath, findings);
  validateOCIImageAssetBoundary(releaseSteps, relativePath, findings);
  return findings;
}

export function validateReleaseWorkflowObject(
  workflow,
  relativePath = ".github/workflows/release.yml",
) {
  const findings = [];
  const releaseRefStep = workflow?.jobs?.verify?.steps?.find(
    (step) => step?.id === "release-ref",
  );
  const source = releaseRefStep?.run;
  if (typeof source !== "string") {
    return [`${relativePath}: verify job needs the release-ref ancestry step`];
  }
  findings.push(...validateReleaseRefSource(source, relativePath));
  const steps = workflow?.jobs?.verify?.steps ?? [];
  const indices = releaseVerificationStepIndices(steps);
  findings.push(...validateReleasePDFBuilder(steps, indices, relativePath));
  findings.push(...validateNativeReleaseBuild(steps, indices, relativePath));
  findings.push(...validateReleasePreparation(steps, indices, relativePath));
  findings.push(...validateReleaseAssetProvenance(workflow, relativePath));
  return findings;
}

function recordExpectation(findings, accepted, message) {
  if (!accepted) findings.push(message);
}

function arrayIncludes(values, expected) {
  if (!Array.isArray(values)) return false;
  return values.includes(expected);
}

function propertiesMatch(value, expected) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(expected).every(([key, expectedValue]) => (
    value[key] === expectedValue
  ));
}

function actionUses(step, actionName) {
  if (typeof step?.uses !== "string") return false;
  return step.uses.startsWith(`${actionName}@`);
}

function stringIncludesAll(value, fragments) {
  if (typeof value !== "string") return false;
  return fragments.every((fragment) => value.includes(fragment));
}

function continueOnErrorIsDisabled(subject) {
  return subject?.["continue-on-error"] === undefined
    || subject["continue-on-error"] === false;
}

function findStepById(steps, id) {
  return steps.find((step) => step?.id === id);
}

function findStepByName(steps, name) {
  return steps.find((step) => step?.name === name);
}

function findStepByInput(steps, key, value) {
  return steps.find((step) => step?.with?.[key] === value);
}

function findStepByRunFragment(steps, fragment) {
  return steps.find((step) => (
    typeof step?.run === "string" && step.run.includes(fragment)
  ));
}

function findRegistryAttestation(steps, imageName) {
  return steps.find((step) => propertiesMatch(step?.with, {
    "push-to-registry": true,
    "subject-name": imageName,
  }));
}

function countOccurrences(value, fragment) {
  return typeof value === "string" ? value.split(fragment).length - 1 : 0;
}

function validateBuildxSetup(steps, relativePath, findings) {
  const setup = steps.find((step) => actionUses(step, "docker/setup-buildx-action"));
  recordExpectation(
    findings,
    propertiesMatch(setup?.with, {
      version: buildxPolicy.version,
      "driver-opts": buildxPolicy.buildkit,
    }),
    `${relativePath}: Docker Buildx and BuildKit must use the reviewed version and image digest`,
  );
}

function validateHardenedDockerRuns(source, minimumRuns, relativePath, subject, findings) {
  recordExpectation(
    findings,
    [
      countOccurrences(source, "docker run") >= minimumRuns,
      countOccurrences(source, "--pull never") >= minimumRuns,
      countOccurrences(source, "--network none") >= minimumRuns,
      countOccurrences(source, "--read-only") >= minimumRuns,
      countOccurrences(source, "--cap-drop ALL") >= minimumRuns,
      countOccurrences(source, "--security-opt no-new-privileges") >= minimumRuns,
    ].every(Boolean),
    `${relativePath}: ${subject} must use the bounded offline read-only container profile`,
  );
}

function loadReleaseImageDeclarations(root, findings) {
  const manifestRoot = path.join(root, "experiments", "workstation", "manifests");
  let names;
  try {
    names = fs.readdirSync(manifestRoot).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    findings.push(`experiments/workstation/manifests: cannot read release declarations: ${error.message}`);
    return [];
  }
  const declarations = [];
  for (const name of names) {
    try {
      const manifest = JSON.parse(readText(root, `experiments/workstation/manifests/${name}`));
      if (manifest.distribution?.state === "release-image") {
        declarations.push({ artifact: manifest.artifact, ...manifest.distribution });
      }
    } catch (error) {
      findings.push(`experiments/workstation/manifests/${name}: invalid release declaration: ${error.message}`);
    }
  }
  return declarations;
}

function workflowImageName(artifact) {
  return `ghcr.io/\${{ env.IMAGE_REPOSITORY }}-${artifact}`;
}

function untaggedRegistryOutput(imageName) {
  return `type=registry,name=${imageName},push-by-digest=true,name-canonical=true`;
}

const registryRepositoryDerivation = Object.freeze({
  diagnostic: "repository identity does not lowercase to a bounded OCI owner/name",
  name: "Derive the lowercase registry repository",
  rawImageNames: ["ghcr.io/${GITHUB_REPOSITORY}", "ghcr.io/${{ github.repository }}"],
  runFragments: [
    "set -euo pipefail",
    'image_repository="${GITHUB_REPOSITORY,,}"',
    'if [[ ! "$image_repository" =~ ^[a-z0-9]([a-z0-9._-]{0,99}[a-z0-9])?/[a-z0-9]([a-z0-9._-]{0,99}[a-z0-9])?$ ]]; then',
    'printf \'IMAGE_REPOSITORY=%s\\n\' "$image_repository" >> "$GITHUB_ENV"',
  ],
});

function validateRegistryRepositoryDerivation(steps, relativePath, findings, firstConsumer) {
  const derivation = findStepByName(steps, registryRepositoryDerivation.name);
  const position = stepPosition(steps, registryRepositoryDerivation.name);
  const consumerPosition = stepPosition(steps, firstConsumer);
  recordExpectation(
    findings,
    derivation?.if === undefined
      && derivation?.uses === undefined
      && stringIncludesAll(derivation?.run, registryRepositoryDerivation.runFragments)
      && diagnosticImmediatelyExits(derivation?.run, registryRepositoryDerivation.diagnostic)
      && position >= 0
      && consumerPosition > position,
    `${relativePath}: registry image names must derive from one validated lowercase IMAGE_REPOSITORY before the first image step`,
  );
  const serialized = JSON.stringify(steps);
  recordExpectation(
    findings,
    registryRepositoryDerivation.rawImageNames.every((fragment) => !serialized.includes(fragment)),
    `${relativePath}: registry image names must not interpolate the case-preserving repository identity`,
  );
}

function validateReleaseRepositoryIdentityConsumers(steps, relativePath, findings) {
  const lowercaseRepository = '--repository "$IMAGE_REPOSITORY"';
  const preservedRepository = '--repository "$GITHUB_REPOSITORY"';
  const accepted = [
    ["Preflight the remote release without mutation", 1, 3],
    ["Materialize the immutable OCI image authority", 2, 0],
    ["Resolve the immutable OCI image authority", 1, 0],
    ["Publish or validate the immutable GitHub release", 0, 3],
  ].every(([name, lowercase, preserved]) => {
    const run = findStepByName(steps, name)?.run;
    const manifestCommands = countOccurrences(run, "release write-oci-images")
      + countOccurrences(run, "release validate-oci-images");
    return countOccurrences(run, lowercaseRepository) === lowercase
      && manifestCommands === lowercase
      && countOccurrences(run, preservedRepository) === preserved;
  });
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: OCI image manifests must bind the lowercase IMAGE_REPOSITORY while GitHub release lookups keep the case-preserving repository`,
  );
}

function stepPosition(steps, name) {
  return steps.findIndex((step) => step?.name === name);
}

function validateManifestReleaseImageParity(root, workflow, relativePath, findings) {
  const declarations = loadReleaseImageDeclarations(root, findings);
  const releaseSteps = workflow?.jobs?.release?.steps ?? [];
  const declared = new Set(declarations.map(({ artifact }) => artifact));
  const workflowArtifacts = new Set(
    releaseSteps
      .map((step) => /^build-((?:candidate|fixture)-[0-9]{3})-image$/u.exec(step?.id)?.[1])
      .filter(Boolean),
  );
  recordExpectation(
    findings,
    declared.size > 0
      && declared.size === workflowArtifacts.size
      && [...declared].every((artifact) => workflowArtifacts.has(artifact)),
    `${relativePath}: experiment image build set must exactly match manifest release-image declarations`,
  );
  for (const declaration of declarations) {
    const build = findStepById(releaseSteps, `build-${declaration.artifact}-image`);
    const metadata = findStepById(releaseSteps, `${declaration.artifact}-image-metadata`);
    const expectedContext = declaration.build_context === "closed-go-package"
      ? `build/container-contexts/${declaration.artifact}`
      : ".";
    recordExpectation(
      findings,
      propertiesMatch(build?.with, {
        context: expectedContext,
        file: declaration.dockerfile,
        platforms: declaration.platforms.join(","),
      }) && metadata?.with?.images === workflowImageName(declaration.artifact),
      `${relativePath}: ${declaration.artifact} workflow build must match its manifest distribution boundary`,
    );
  }
  return declarations;
}

function validateCiManifestReleaseImageParity(root, workflow, relativePath, findings) {
  const declarations = loadReleaseImageDeclarations(root, findings);
  const steps = workflow?.jobs?.["container-smoke"]?.steps ?? [];
  for (const declaration of declarations) {
    const build = findStepByInput(steps, "tags", `20w-${declaration.artifact}:test`);
    const expectedContext = declaration.build_context === "closed-go-package"
      ? `build/container-contexts/${declaration.artifact}`
      : ".";
    recordExpectation(
      findings,
      propertiesMatch(build?.with, {
        context: expectedContext,
        file: declaration.dockerfile,
      }) && stringIncludesAll(build?.with?.["build-args"], [
        `IMAGE_NAME=${workflowImageName(declaration.artifact)}`,
        "IMAGE_VERSION=development",
        "SOURCE_REVISION=${{ github.sha }}",
      ]),
      `${relativePath}: ${declaration.artifact} CI build must match its manifest distribution boundary`,
    );
  }
}

function validateCiFixtureImageSteps(steps, relativePath, findings) {
  const build = findStepByInput(steps, "tags", "20w-fixture-019:test");
  const inputs = build?.with;
  recordExpectation(
    findings,
    [
      actionUses(build, "docker/build-push-action"),
      propertiesMatch(inputs, {
        context: fixture019ImagePolicy.context,
        file: fixture019ImagePolicy.dockerfile,
        load: true,
        push: false,
        tags: "20w-fixture-019:test",
      }),
    ].every(Boolean),
    `${relativePath}: container-smoke must build only the scoped Fixture 019 test image`,
  );
  recordExpectation(
    findings,
    stringIncludesAll(inputs?.["build-args"], [
      "IMAGE_NAME=ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-019",
      "IMAGE_VERSION=development",
      "SOURCE_REVISION=${{ github.sha }}",
    ]),
    `${relativePath}: Fixture 019 test image must bind its image name, development version, and source revision`,
  );
  recordExpectation(
    findings,
    propertiesMatch(inputs, {
      "cache-from": "type=gha,scope=fixture-019-image",
      "cache-to": "type=gha,mode=max,scope=fixture-019-image",
    }),
    `${relativePath}: Fixture 019 test image must use a per-artifact cache scope`,
  );
}

function validateCiFixture019Context(steps, relativePath, findings) {
  const packaging = findStepByName(steps, "Package the closed Fixture 019 runtime context");
  recordExpectation(
    findings,
    packaging?.run === fixture019ImagePolicy.packageCommand,
    `${relativePath}: Fixture 019 test image must use its exact closed Go-packaged runtime context`,
  );
}

function validateCiFixture007Context(steps, relativePath, findings) {
  const packaging = findStepByName(steps, "Package the closed Fixture 007 runtime context");
  recordExpectation(
    findings,
    packaging?.run === fixture007ImagePolicy.packageCommand,
    `${relativePath}: Fixture 007 test image must use its exact closed Go-packaged runtime context`,
  );
}

function validateCiFixture007Build(steps, relativePath, findings) {
  const build = findStepByName(steps, "Build the Fixture 007 image");
  const inputs = build?.with;
  recordExpectation(
    findings,
    actionUses(build, "docker/build-push-action") && propertiesMatch(inputs, {
      context: fixture007ImagePolicy.context,
      file: fixture007ImagePolicy.dockerfile,
      load: true,
      push: false,
      tags: fixture007ImagePolicy.ciTag,
    }),
    `${relativePath}: container-smoke must build only the scoped Fixture 007 test image from its closed context`,
  );
  recordExpectation(
    findings,
    inputs?.["build-args"] === fixture007ImagePolicy.ciBuildArgs,
    `${relativePath}: Fixture 007 test image must keep its exact artifact, registry, version, and revision arguments`,
  );
  recordExpectation(
    findings,
    propertiesMatch(inputs, {
      "cache-from": fixture007ImagePolicy.cacheFrom,
      "cache-to": fixture007ImagePolicy.cacheTo,
    }),
    `${relativePath}: Fixture 007 test image must use its per-artifact cache scope`,
  );
}

function validateCiFixture007Smoke(steps, relativePath, findings) {
  const smoke = findStepByName(steps, "Execute the bounded Fixture 007 smoke path");
  const source = smoke?.run;
  recordExpectation(
    findings,
    stringIncludesAll(source, [
      "20w-fixture-007:test smoke --profile smoke --output /workspace/results/ci-fixture-007",
      "20w-fixture-007:test analyze --output /workspace/results/ci-fixture-007",
      "20w-fixture-007:test validate --output /workspace/results/ci-fixture-007",
      "--entrypoint node 20w-fixture-007:test --version",
      `"v${runtimePolicy.nodeVersion}"`,
      "type=volume",
    ]),
    `${relativePath}: Fixture 007 must run smoke, analyze, and validate against one persistent result volume`,
  );
  validateHardenedDockerRuns(source, 4, relativePath, "Fixture 007", findings);
}

function validateCiFixture007Image(steps, relativePath, findings) {
  validateCiFixture007Context(steps, relativePath, findings);
  validateCiFixture007Build(steps, relativePath, findings);
  validateCiFixture007Smoke(steps, relativePath, findings);
}

function validateCiToolingImageSteps(steps, relativePath, findings) {
  const build = findStepByInput(steps, "tags", "20w-tooling:test");
  const inputs = build?.with;
  const accepted = [
    actionUses(build, "docker/build-push-action"),
    propertiesMatch(inputs, {
      "cache-from": "type=gha,scope=20w-tooling-image",
      "cache-to": "type=gha,mode=max,scope=20w-tooling-image",
      context: ".",
      file: "tooling/Dockerfile",
      load: true,
      push: false,
    }),
    stringIncludesAll(inputs?.["build-args"], [
      "IMAGE_VERSION=development",
      "SOURCE_REVISION=${{ github.sha }}",
      "SOURCE_TIMESTAMP=unknown",
    ]),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: container-smoke must build the separate static 20w tooling image`,
  );

  const source = findStepByRunFragment(steps, "20w-tooling:test version --json")?.run;
  recordExpectation(
    findings,
    stringIncludesAll(source, [
      "20w-tooling:test version --json",
      "20w-tooling:test validate docs --root /repo",
      "20w-tooling:test experiment list --root /repo --json",
      "src=$GITHUB_WORKSPACE,dst=/repo,readonly",
    ]),
    `${relativePath}: static 20w image must be tested offline against a read-only repository mount`,
  );
  validateHardenedDockerRuns(source, 3, relativePath, "static 20w image", findings);
}

function validateCiImageRuntimeSteps(steps, relativePath, findings) {
  const runtimeSource = findStepByRunFragment(steps, "node --version")?.run;
  recordExpectation(
    findings,
    stringIncludesAll(runtimeSource, [
      "--entrypoint sh 20w-fixture-019:test",
      `= "v${runtimePolicy.nodeVersion}"`,
      `= "Python ${runtimePolicy.pythonVersion}"`,
      `numpy.__version__ == \\"${runtimePolicy.numpyVersion}\\"`,
      "20w-fixture-019:test prepare --profile smoke",
    ]),
    `${relativePath}: Fixture 019 image runtime and smoke preparation must be checked offline`,
  );
  validateHardenedDockerRuns(runtimeSource, 2, relativePath, "Fixture 019 runtime checks", findings);
  const smokeSource = findStepByName(steps, "Execute the bounded Fixture 019 smoke path")?.run;
  recordExpectation(
    findings,
    stringIncludesAll(smokeSource, [
      "20w-fixture-019:test smoke --profile smoke --output /workspace/results/ci-fixture-019 --resume false",
      "20w-fixture-019:test analyze --output /workspace/results/ci-fixture-019",
      "20w-fixture-019:test validate --output /workspace/results/ci-fixture-019",
      "type=volume",
    ]),
    `${relativePath}: Fixture 019 must run smoke, analyze, and validate against one persistent result volume`,
  );
  validateHardenedDockerRuns(smokeSource, 3, relativePath, "Fixture 019", findings);
}

export function validateCiExperimentImageWorkflowObject(
  workflow,
  relativePath = ".github/workflows/ci.yml",
  root = defaultRoot,
) {
  const findings = [];
  const steps = workflow?.jobs?.["container-smoke"]?.steps;
  if (!Array.isArray(steps)) {
    return [`${relativePath}: container-smoke job must validate the scoped Fixture 007 and Fixture 019 images`];
  }
  validateBuildxSetup(steps, relativePath, findings);
  validateRegistryRepositoryDerivation(steps, relativePath, findings, "Build the CLRS shakedown specialist image");
  validateCiManifestReleaseImageParity(root, workflow, relativePath, findings);
  validateCiFixture007Image(steps, relativePath, findings);
  validateCiFixture019Context(steps, relativePath, findings);
  validateCiFixtureImageSteps(steps, relativePath, findings);
  validateCiToolingImageSteps(steps, relativePath, findings);
  validateCiImageRuntimeSteps(steps, relativePath, findings);
  recordExpectation(
    findings,
    arrayIncludes(workflow?.jobs?.["ci-success"]?.needs, "container-smoke"),
    `${relativePath}: ci-success must require the scoped container-smoke gate`,
  );
  return findings;
}

function validateReleaseTimestamp(verifyJob, relativePath, findings) {
  const releaseRefSource = findStepById(verifyJob?.steps ?? [], "release-ref")?.run;
  const accepted = [
    propertiesMatch(verifyJob?.outputs, {
      "release-timestamp": "${{ steps.release-ref.outputs.timestamp }}",
      "release-epoch": "${{ steps.release-ref.outputs.epoch }}",
    }),
    stringIncludesAll(releaseRefSource, [
      "--format=%cI",
      "--format=%ct",
      "release_commit",
      '>> "$GITHUB_OUTPUT"',
    ]),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: release must derive timestamp and SOURCE_DATE_EPOCH from the tagged commit`,
  );
}

function validateReleaseToolingImage(steps, relativePath, findings) {
  const condition = `${releaseMutationGuard} && steps.image-status.outputs.tooling_publish == 'true'`;
  const imageName = "ghcr.io/${{ env.IMAGE_REPOSITORY }}-20w";
  const metadata = findStepById(steps, "tooling-image-metadata");
  const build = findStepById(steps, "build-tooling-image");
  const attestation = findRegistryAttestation(steps, imageName);
  const accepted = [
    propertiesMatch(metadata, { if: condition }),
    actionUses(metadata, "docker/metadata-action"),
    propertiesMatch(metadata?.with, {
      images: imageName,
      flavor: "latest=false",
      tags: fixture007ImagePolicy.releaseTag,
    }),
    stringIncludesAll(metadata?.with?.labels, [
      "org.opencontainers.image.created=${{ needs.verify.outputs.release-timestamp }}",
      "org.opencontainers.image.revision=${{ needs.verify.outputs.release-commit }}",
      `io.github.lusoris.20-watts-was-enough.image-name=${imageName}`,
    ]),
    propertiesMatch(build, { if: condition }),
    actionUses(build, "docker/build-push-action"),
    propertiesMatch(build?.with, {
      "cache-from": "type=gha,scope=20w-tooling-image",
      "cache-to": "type=gha,mode=max,scope=20w-tooling-image",
      context: ".",
      file: "tooling/Dockerfile",
      labels: "${{ steps.tooling-image-metadata.outputs.labels }}",
      outputs: untaggedRegistryOutput(imageName),
      platforms: "linux/amd64",
      provenance: "mode=max",
      sbom: sbomGenerator,
    }),
    !Object.hasOwn(build?.with ?? {}, "push"),
    !Object.hasOwn(build?.with ?? {}, "tags"),
    stringIncludesAll(build?.with?.["build-args"], [
      "IMAGE_NAME=ghcr.io/${{ env.IMAGE_REPOSITORY }}-20w",
      "IMAGE_VERSION=${{ needs.verify.outputs.release-tag }}",
      "SOURCE_REVISION=${{ needs.verify.outputs.release-commit }}",
      "SOURCE_TIMESTAMP=${{ needs.verify.outputs.release-timestamp }}",
    ]),
    build?.env?.SOURCE_DATE_EPOCH === "${{ needs.verify.outputs.release-epoch }}",
    propertiesMatch(attestation, {
      if: condition,
    }),
    actionUses(attestation, "actions/attest-build-provenance"),
    propertiesMatch(attestation?.with, {
      "subject-digest": "${{ steps.build-tooling-image.outputs.digest }}",
    }),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: static 20w tooling image must use a separate untagged, admitted digest`,
  );
}

function validateReleaseFixtureStatus(steps, relativePath, findings) {
  const status = findStepById(steps, "image-status");
  const accepted = [
    propertiesMatch(status?.env, {
      GHCR_TOKEN: "${{ github.token }}",
      GHCR_USERNAME: "${{ github.actor }}",
      RELEASE_COMMIT: "${{ needs.verify.outputs.release-commit }}",
      RELEASE_TAG: "${{ needs.verify.outputs.release-tag }}",
      RELEASE_TIMESTAMP: "${{ needs.verify.outputs.release-timestamp }}",
    }),
    stringIncludesAll(status?.run, [
      "tool=build/release-tools/20w",
      "release inspect-image",
      "for fixture in fixture-007 fixture-019",
      'ghcr.io/${IMAGE_REPOSITORY}-${fixture}',
      '--revision "$RELEASE_COMMIT"',
      '--expected-label "io.github.lusoris.20-watts-was-enough.result-authority=NO_RESULT"',
      '--github-output-prefix "$prefix"',
    ]),
    countOccurrences(status?.run, "--platform linux/amd64") >= 2,
    !status?.run?.includes("linux/arm64"),
    !status?.run?.includes("imagetools inspect"),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: Fixture 019 release tags must be checked and preserved before publication`,
  );
}

function validateReleaseFixtureMetadata(steps, relativePath, findings, condition, imageName) {
  const metadata = findStepById(steps, "fixture-019-image-metadata");
  const accepted = [
    propertiesMatch(metadata, { if: condition }),
    actionUses(metadata, "docker/metadata-action"),
    propertiesMatch(metadata?.with, {
      images: imageName,
      flavor: "latest=false",
      tags: fixture007ImagePolicy.releaseTag,
    }),
    stringIncludesAll(metadata?.with?.labels, [
      "org.opencontainers.image.created=${{ needs.verify.outputs.release-timestamp }}",
      "org.opencontainers.image.revision=${{ needs.verify.outputs.release-commit }}",
      "io.github.lusoris.20-watts-was-enough.result-authority=NO_RESULT",
    ]),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: Fixture 019 metadata must use its per-artifact image identity and verified tag`,
  );
}

function validateReleaseFixtureBuild(steps, relativePath, findings, condition) {
  const build = findStepById(steps, "build-fixture-019-image");
  const imageName = "ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-019";
  const accepted = [
    propertiesMatch(build, { if: condition }),
    actionUses(build, "docker/build-push-action"),
    propertiesMatch(build?.with, {
      "cache-from": "type=gha,scope=fixture-019-image",
      "cache-to": "type=gha,mode=max,scope=fixture-019-image",
      context: fixture019ImagePolicy.context,
      file: fixture019ImagePolicy.dockerfile,
      labels: "${{ steps.fixture-019-image-metadata.outputs.labels }}",
      outputs: untaggedRegistryOutput(imageName),
      platforms: "linux/amd64",
      provenance: "mode=max",
      sbom: sbomGenerator,
    }),
    !Object.hasOwn(build?.with ?? {}, "push"),
    !Object.hasOwn(build?.with ?? {}, "tags"),
    stringIncludesAll(build?.with?.["build-args"], [
      "IMAGE_NAME=ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-019",
      "IMAGE_VERSION=${{ needs.verify.outputs.release-tag }}",
      "SOURCE_REVISION=${{ needs.verify.outputs.release-commit }}",
    ]),
    build?.env?.SOURCE_DATE_EPOCH === "${{ needs.verify.outputs.release-epoch }}",
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: release must build the untagged linux/amd64 Fixture 019 candidate`,
  );
}

function validateReleaseFixture019Context(steps, relativePath, findings) {
  const packaging = findStepByName(steps, "Package the closed Fixture 019 runtime context");
  recordExpectation(
    findings,
    propertiesMatch(packaging, { if: fixture019ImagePolicy.condition })
      && packaging?.run === fixture019ImagePolicy.packageCommand,
    `${relativePath}: Fixture 019 release must package its exact closed runtime context after the existing-tag check`,
  );
}

function validateReleaseFixtureAttestation(steps, relativePath, findings, imageName) {
  const attestation = findRegistryAttestation(steps, imageName);
  const accepted = [
    propertiesMatch(attestation, {
      if: fixture019ImagePolicy.condition,
    }),
    actionUses(attestation, "actions/attest-build-provenance"),
    propertiesMatch(attestation?.with, {
      "subject-digest": "${{ steps.build-fixture-019-image.outputs.digest }}",
      "subject-name": imageName,
    }),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: Fixture 019 provenance must attest only its current-run build output`,
  );
}

function validateReleaseFixtureImage(steps, relativePath, findings) {
  const condition = fixture019ImagePolicy.condition;
  const imageName = "ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-019";
  validateReleaseFixtureStatus(steps, relativePath, findings);
  validateReleaseFixture019Context(steps, relativePath, findings);
  validateReleaseFixtureMetadata(steps, relativePath, findings, condition, imageName);
  validateReleaseFixtureBuild(steps, relativePath, findings, condition);
  validateReleaseFixtureAttestation(steps, relativePath, findings, imageName);
}

function validateReleaseFixture007Status(steps, relativePath, findings) {
  const status = findStepById(steps, "image-status");
  const accepted = [
    propertiesMatch(status?.env, {
      GHCR_TOKEN: "${{ github.token }}",
      GHCR_USERNAME: "${{ github.actor }}",
      RELEASE_COMMIT: "${{ needs.verify.outputs.release-commit }}",
      RELEASE_TAG: "${{ needs.verify.outputs.release-tag }}",
      RELEASE_TIMESTAMP: "${{ needs.verify.outputs.release-timestamp }}",
    }),
    stringIncludesAll(status?.run, [
      "release inspect-image",
      "for fixture in fixture-007 fixture-019",
      'ghcr.io/${IMAGE_REPOSITORY}-${fixture}',
      '--expected-label "io.github.lusoris.20-watts-was-enough.result-authority=NO_RESULT"',
      '--github-output-prefix "$prefix"',
    ]),
    !status?.run?.includes("imagetools inspect"),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: Fixture 007 release tags must be checked and preserved before publication`,
  );
}

function validateReleaseFixture007Context(steps, relativePath, findings) {
  const packaging = findStepByName(steps, "Package the closed Fixture 007 runtime context");
  recordExpectation(
    findings,
    propertiesMatch(packaging, { if: fixture007ImagePolicy.condition })
      && packaging?.run === fixture007ImagePolicy.packageCommand,
    `${relativePath}: Fixture 007 release must package its exact closed runtime context after the existing-tag check`,
  );
}

function validateReleaseFixture007Metadata(steps, relativePath, findings) {
  const metadata = findStepById(steps, "fixture-007-image-metadata");
  const accepted = [
    propertiesMatch(metadata, { if: fixture007ImagePolicy.condition }),
    actionUses(metadata, "docker/metadata-action"),
    propertiesMatch(metadata?.with, {
      images: fixture007ImagePolicy.imageName,
      flavor: "latest=false",
      tags: fixture007ImagePolicy.releaseTag,
    }),
    stringIncludesAll(metadata?.with?.labels, [
      "org.opencontainers.image.created=${{ needs.verify.outputs.release-timestamp }}",
      "org.opencontainers.image.revision=${{ needs.verify.outputs.release-commit }}",
      "io.github.lusoris.20-watts-was-enough.result-authority=NO_RESULT",
    ]),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: Fixture 007 metadata must use its per-artifact image identity and verified tag`,
  );
}

function validateReleaseFixture007Build(steps, relativePath, findings) {
  const build = findStepById(steps, "build-fixture-007-image");
  const inputs = build?.with;
  const accepted = [
    propertiesMatch(build, { if: fixture007ImagePolicy.condition }),
    actionUses(build, "docker/build-push-action"),
    propertiesMatch(inputs, {
      context: fixture007ImagePolicy.context,
      file: fixture007ImagePolicy.dockerfile,
      labels: "${{ steps.fixture-007-image-metadata.outputs.labels }}",
      outputs: untaggedRegistryOutput(fixture007ImagePolicy.imageName),
      platforms: "linux/amd64",
      provenance: "mode=max",
      sbom: sbomGenerator,
    }),
    !Object.hasOwn(inputs ?? {}, "push"),
    !Object.hasOwn(inputs ?? {}, "tags"),
    build?.env?.SOURCE_DATE_EPOCH === "${{ needs.verify.outputs.release-epoch }}",
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: release must build the untagged linux/amd64 Fixture 007 candidate from its closed context`,
  );
  recordExpectation(
    findings,
    inputs?.["build-args"] === fixture007ImagePolicy.releaseBuildArgs,
    `${relativePath}: Fixture 007 release image must keep its exact artifact, registry, tag, and revision arguments`,
  );
  recordExpectation(
    findings,
    propertiesMatch(inputs, {
      "cache-from": fixture007ImagePolicy.cacheFrom,
      "cache-to": fixture007ImagePolicy.cacheTo,
    }),
    `${relativePath}: Fixture 007 release image must use its per-artifact cache scope`,
  );
}

function validateReleaseFixture007Attestation(steps, relativePath, findings) {
  const attestation = findRegistryAttestation(steps, fixture007ImagePolicy.imageName);
  const accepted = [
    propertiesMatch(attestation, {
      if: fixture007ImagePolicy.condition,
    }),
    actionUses(attestation, "actions/attest-build-provenance"),
    propertiesMatch(attestation?.with, {
      "subject-digest": "${{ steps.build-fixture-007-image.outputs.digest }}",
      "subject-name": fixture007ImagePolicy.imageName,
    }),
  ].every(Boolean);
  recordExpectation(
    findings,
    accepted,
    `${relativePath}: Fixture 007 provenance must attest only its current-run build output`,
  );
}

function validateReleaseFixture007Image(steps, relativePath, findings) {
  validateReleaseFixture007Status(steps, relativePath, findings);
  validateReleaseFixture007Context(steps, relativePath, findings);
  validateReleaseFixture007Metadata(steps, relativePath, findings);
  validateReleaseFixture007Build(steps, relativePath, findings);
  validateReleaseFixture007Attestation(steps, relativePath, findings);
}

function validateReleaseDigestAdmission(steps, relativePath, findings) {
  const selection = findStepById(steps, "admission-images");
  recordExpectation(
    findings,
    stringIncludesAll(selection?.run, [
      "select_digest",
      'case "$publish" in',
      'true) selected="$built"',
      'false) selected="$existing"',
      "^sha256:[0-9a-f]{64}$",
      "$TOOLING_PUBLISH",
      "$FIXTURE_007_PUBLISH",
      "$FIXTURE_019_PUBLISH",
    ]),
    `${relativePath}: release admission must select one exact existing or newly built digest per image`,
  );

  const digestInspection = findStepByName(steps, "Validate the exact image digests before admission")?.run;
  recordExpectation(
    findings,
    stringIncludesAll(digestInspection, [
      "release inspect-image",
      '--digest "$TOOLING_DIGEST"',
      '--digest "$digest"',
      "--require-existing",
      'ghcr.io/${IMAGE_REPOSITORY}-20w',
      'ghcr.io/${IMAGE_REPOSITORY}-${fixture}',
      '--revision "$RELEASE_COMMIT"',
      '--expected-label "io.github.lusoris.20-watts-was-enough.result-authority=NO_RESULT"',
    ])
      && countOccurrences(digestInspection, "--platform linux/amd64") >= 2
      && !digestInspection?.includes("linux/arm64"),
    `${relativePath}: exact candidate digests must pass authenticated platform and label inspection before admission`,
  );

  const execution = findStepByName(steps, "Run the admitted candidates by immutable digest")?.run;
  recordExpectation(
    findings,
    stringIncludesAll(execution, [
      'ghcr.io/${IMAGE_REPOSITORY}-20w@${TOOLING_DIGEST}',
      'ghcr.io/${IMAGE_REPOSITORY}-fixture-007@${FIXTURE_007_DIGEST}',
      'ghcr.io/${IMAGE_REPOSITORY}-fixture-019@${FIXTURE_019_DIGEST}',
      '"$tooling" version --json',
      '"go_version":"go1.27.1"',
      '"os":"linux"',
      '"architecture":"amd64"',
      '"$RELEASE_TAG" "$RELEASE_COMMIT" "$RELEASE_TIMESTAMP"',
      'if [[ "$tooling_identity" != "$expected_tooling_identity" ]]; then',
      "admitted 20w binary identity does not match the tag, commit, timestamp, Go version, OS, and architecture",
      '--entrypoint node "$fixture_007" --version',
      `"v${runtimePolicy.nodeVersion}"`,
      `if [[ "$fixture_007_node" != "v${runtimePolicy.nodeVersion}" ]]; then`,
      '--entrypoint sh "$fixture_019" -c',
      `"Python ${runtimePolicy.pythonVersion}"`,
      `numpy.__version__ == \\"${runtimePolicy.numpyVersion}\\"`,
      " smoke --profile smoke ",
      '"$action" --output',
      "type=volume",
    ]),
    `${relativePath}: candidate images must run tooling plus smoke, analyze, and validate by digest before tagging`,
  );
  validateHardenedDockerRuns(execution, 7, relativePath, "admitted candidate images", findings);
}

function validateReleaseAttestationAndTagging(steps, relativePath, findings) {
  const provenanceStep = findStepByName(steps, "Verify admitted image provenance against the tag source");
  const provenance = provenanceStep?.run;
  recordExpectation(
    findings,
    findStepById(steps, "attestation-status") === undefined
      && !steps.some((step) => step?.if?.includes("_repair"))
      && provenanceStep?.if === releaseMutationGuard
      && stringIncludesAll(provenance, [
      "gh attestation verify",
      '--source-digest "$RELEASE_COMMIT"',
      '--source-ref "refs/tags/$RELEASE_TAG"',
      'ghcr.io/${IMAGE_REPOSITORY}-fixture-007',
      'ghcr.io/${IMAGE_REPOSITORY}-fixture-019',
    ]),
    `${relativePath}: existing image digests must fail closed unless source-bound provenance already verifies`,
  );

  const publication = findStepByName(steps, "Attach missing release tags to admitted digests")?.run;
  recordExpectation(
    findings,
    stringIncludesAll(publication, [
      "publish_tag",
      'if [[ "$publish" == "false" ]]',
      "release inspect-image",
      "candidate_status=absent",
      "refusing to overwrite an image tag that became present during admission",
      "docker buildx imagetools create",
      '--tag "${image_name}:${RELEASE_TAG}"',
      '"${image_name}@${digest}"',
    ]) && steps.filter((step) => step?.run?.includes("docker buildx imagetools create")).length === 1,
    `${relativePath}: release tags must use the single absence-checked publication path after admission`,
  );
}

function validateReleaseFinalBindingAndNotes(steps, relativePath, findings) {
  const final = findStepById(steps, "final-images")?.run;
  recordExpectation(
    findings,
    stringIncludesAll(final, [
      "inspect_final_image",
      "--require-existing",
      "inspect_final_image finaltooling",
      '--github-output-prefix "$prefix"',
      "for fixture in fixture-007 fixture-019",
      'ghcr.io/${IMAGE_REPOSITORY}-${fixture}',
    ])
      && countOccurrences(final, "--platform linux/amd64") >= 2
      && !final?.includes("linux/arm64"),
    `${relativePath}: final image tags must converge through bounded authenticated inspection`,
  );

  const binding = findStepByName(steps, "Bind final release tags to the admitted digests");
  recordExpectation(
    findings,
    stringIncludesAll(binding?.run, [
      "require_digest_match",
      'if [[ "$admitted" != "$resolved" ]]',
      "$TOOLING_ADMITTED",
      "$FIXTURE_007_ADMITTED",
      "$FIXTURE_019_ADMITTED",
    ]),
    `${relativePath}: final image tags must resolve to the exact admitted digests`,
  );

  const anonymousPull = findStepByName(steps, "Prove final image digests are anonymously pullable");
  recordExpectation(
    findings,
    stringIncludesAll(anonymousPull?.run, [
      'mktemp -d "${RUNNER_TEMP}/20w-anonymous-docker.XXXXXX"',
      'printf \'%s\\n\' \'{"auths":{}}\' > "$anonymous_config/config.json"',
      'rm -rf -- "$anonymous_config"',
      "trap cleanup EXIT",
      'ghcr.io/${IMAGE_REPOSITORY}-20w@${TOOLING_DIGEST}',
      'ghcr.io/${IMAGE_REPOSITORY}-fixture-007@${FIXTURE_007_DIGEST}',
      'ghcr.io/${IMAGE_REPOSITORY}-fixture-019@${FIXTURE_019_DIGEST}',
      'for image in "${images[@]}"',
      'DOCKER_CONFIG="$anonymous_config" docker pull "$image"',
      "new packages as private",
      "set all three release packages to Public",
      "manually rerun this exact tag",
    ])
      && ![
        "docker login",
        "GHCR_TOKEN",
        "GHCR_USERNAME",
        "github.token",
      ].some((fragment) => anonymousPull?.run?.includes(fragment))
      && anonymousPull?.env?.GHCR_TOKEN === undefined
      && anonymousPull?.env?.GHCR_USERNAME === undefined
      && diagnosticImmediatelyExits(anonymousPull?.run, "is not anonymously pullable."),
    `${relativePath}: final release image digests must pass anonymous pulls with an empty Docker configuration`,
  );

  const orderedNames = [
    "Select exact image digests for admission",
    "Validate the exact image digests before admission",
    "Run the admitted candidates by immutable digest",
    "Verify admitted image provenance against the tag source",
    "Attach missing release tags to admitted digests",
    "Resolve and validate the final release image tags",
    "Bind final release tags to the admitted digests",
    "Prove final image digests are anonymously pullable",
    "Add immutable container identities to the release notes",
  ];
  const positions = orderedNames.map((name) => stepPosition(steps, name));
  const attestationPositions = [
    "ghcr.io/${{ env.IMAGE_REPOSITORY }}-20w",
    "ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-007",
    "ghcr.io/${{ env.IMAGE_REPOSITORY }}-fixture-019",
  ].map((imageName) => steps.indexOf(findRegistryAttestation(steps, imageName)));
  recordExpectation(
    findings,
    positions.every((position) => position >= 0)
      && positions.every((position, index) => index === 0 || positions[index - 1] < position)
      && attestationPositions.every((position) => position > positions[2] && position < positions[3]),
    `${relativePath}: release image tagging must follow digest inspection, execution, attestation, and provenance verification`,
  );

  const publicationPosition = stepPosition(steps, "Publish or validate the immutable GitHub release");
  const bindingPosition = stepPosition(steps, "Bind final release tags to the admitted digests");
  const anonymousPullPosition = stepPosition(steps, "Prove final image digests are anonymously pullable");
  recordExpectation(
    findings,
    bindingPosition >= 0
      && anonymousPullPosition > bindingPosition
      && publicationPosition > anonymousPullPosition,
    `${relativePath}: anonymous digest pulls must follow final binding and precede GitHub Release publication`,
  );

  const notes = findStepByName(steps, "Add immutable container identities to the release notes")?.run;
  recordExpectation(
    findings,
    notes?.includes('cp build/release/release-notes.md "$notes"'),
    `${relativePath}: published release notes must preserve the generated changelog and disclosure link`,
  );
  recordExpectation(
    findings,
    stringIncludesAll(notes, [
      "Immutable container images",
      'ghcr.io/${IMAGE_REPOSITORY}-20w@${TOOLING_DIGEST}',
      'ghcr.io/${IMAGE_REPOSITORY}-fixture-007@${FIXTURE_007_DIGEST}',
      'ghcr.io/${IMAGE_REPOSITORY}-fixture-019@${FIXTURE_019_DIGEST}',
      "TOOLING_DIGEST",
      "FIXTURE_007_DIGEST",
      "FIXTURE_019_DIGEST",
      "linux/amd64",
      "NO_RESULT",
    ]) && !notes?.includes("linux/arm64"),
    `${relativePath}: release notes must carry exact image digests, platforms, revision, and NO_RESULT authority`,
  );
}

function validateReleaseImageProvenanceAndExecution(steps, relativePath, findings) {
  validateReleaseDigestAdmission(steps, relativePath, findings);
  validateReleaseAttestationAndTagging(steps, relativePath, findings);
  validateReleaseFinalBindingAndNotes(steps, relativePath, findings);
}

export function validateReleaseExperimentImageWorkflowObject(
  workflow,
  relativePath = ".github/workflows/release.yml",
  root = defaultRoot,
) {
  const findings = [];
  const releaseJob = workflow?.jobs?.release;
  const steps = releaseJob?.steps;
  if (!Array.isArray(steps)) {
    return [`${relativePath}: release job must publish the scoped Fixture 007 and Fixture 019 images`];
  }
  recordExpectation(
    findings,
    releaseJob.permissions?.packages === "write",
    `${relativePath}: release job needs packages write permission for per-artifact images`,
  );
  validateBuildxSetup(steps, relativePath, findings);
  validateRegistryRepositoryDerivation(steps, relativePath, findings, "Preflight the remote release without mutation");
  validateReleaseRepositoryIdentityConsumers(steps, relativePath, findings);
  validateManifestReleaseImageParity(root, workflow, relativePath, findings);
  validateReleaseTimestamp(workflow?.jobs?.verify, relativePath, findings);
  validateReleaseToolingImage(steps, relativePath, findings);
  validateReleaseFixture007Image(steps, relativePath, findings);
  validateReleaseFixtureImage(steps, relativePath, findings);
  validateReleaseImageProvenanceAndExecution(steps, relativePath, findings);
  return findings;
}

export function validateIssueForm(form, relativePath = "issue-form.yml") {
  const findings = [];
  const requiredStrings = ["name", "description", "title"];

  if (!form || typeof form !== "object") {
    return [`${relativePath}: issue form root must be a mapping`];
  }

  for (const key of requiredStrings) {
    if (typeof form[key] !== "string" || form[key].trim().length === 0) {
      findings.push(`${relativePath}: ${key} must be a non-empty string`);
    }
  }

  if (!Array.isArray(form.body) || form.body.length === 0) {
    findings.push(`${relativePath}: body must be a non-empty sequence`);
    return findings;
  }

  const ids = new Set();
  for (const [index, item] of form.body.entries()) {
    if (!item || typeof item !== "object") {
      findings.push(`${relativePath}: body[${index}] must be a mapping`);
      continue;
    }
    if (item.id === undefined) {
      continue;
    }
    if (typeof item.id !== "string" || !/^[a-z][a-z0-9_-]*$/u.test(item.id)) {
      findings.push(`${relativePath}: body[${index}].id is invalid`);
      continue;
    }
    if (ids.has(item.id)) {
      findings.push(`${relativePath}: duplicate field id ${item.id}`);
    }
    ids.add(item.id);
  }

  return findings;
}

export function validateFundingConfig(config, relativePath = ".github/FUNDING.yml") {
  const findings = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [`${relativePath}: funding configuration must be a mapping`];
  }

  const expectedKeys = new Set(["github", "ko_fi"]);
  for (const key of Object.keys(config)) {
    if (!expectedKeys.has(key)) {
      findings.push(`${relativePath}: unverified funding platform ${key}`);
    }
  }

  if (
    !Array.isArray(config.github)
    || config.github.length !== 1
    || config.github[0] !== "lusoris"
  ) {
    findings.push(`${relativePath}: github must contain only the verified lusoris sponsor identity`);
  }
  if (config.ko_fi !== "lusoris") {
    findings.push(`${relativePath}: ko_fi must use the verified lusoris identity`);
  }
  return findings;
}

export function validateIssueConfig(config, relativePath = ".github/ISSUE_TEMPLATE/config.yml") {
  const findings = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [`${relativePath}: issue configuration must be a mapping`];
  }
  if (config.blank_issues_enabled !== false) {
    findings.push(`${relativePath}: blank issues must remain disabled`);
  }

  const links = config.contact_links;
  if (!Array.isArray(links)) {
    findings.push(`${relativePath}: contact_links must be a sequence`);
    return findings;
  }

  const requiredUrls = new Set([
    "https://github.com/cordanaLLM/20-watts-was-enough/security/advisories/new",
    "https://github.com/cordanaLLM/20-watts-was-enough/blob/main/SUPPORT.md",
  ]);
  const seenUrls = new Set();
  for (const [index, link] of links.entries()) {
    if (
      !link
      || typeof link !== "object"
      || typeof link.name !== "string"
      || link.name.trim().length === 0
      || typeof link.about !== "string"
      || link.about.trim().length === 0
      || typeof link.url !== "string"
    ) {
      findings.push(`${relativePath}: contact_links[${index}] must define non-empty name, url, and about strings`);
      continue;
    }
    if (seenUrls.has(link.url)) {
      findings.push(`${relativePath}: duplicate contact link ${link.url}`);
    }
    seenUrls.add(link.url);
  }
  for (const url of requiredUrls) {
    if (!seenUrls.has(url)) {
      findings.push(`${relativePath}: missing required contact link ${url}`);
    }
  }
  return findings;
}

export function validateToolingValidationScript(
  command,
  relativePath = "package.json",
) {
  const expected = [
    "go -C tooling run ./cmd/20w experiment validate --root ..",
    "go -C tooling run ./cmd/20w github sync-metadata --root .. --check",
    "go -C tooling run ./cmd/20w publication render-pdf --root .. --check",
    "go -C tooling run ./cmd/20w publication verify-pdf-tools --root ..",
    "go -C tooling run ./cmd/20w publication verify-public-transport --root .. --check",
  ].join(" && ");
  if (command === expected) return [];
  return [
    `${relativePath}: validate:tooling must validate experiment, GitHub metadata, publication-render, PDF-tools, and public-transport authority offline in that order`,
  ];
}

function workstationShardCommand(files) {
  return [
    "node --test --experimental-test-isolation=none --test-concurrency=1",
    ...files,
  ].join(" ");
}

const aggregateTestScripts = Object.freeze([
  "test:go", "validate:tooling", "validate:policy", "test:runtime", "test:policy",
  "test:release", "check:code-shape", "test:code-shape", "check:prose", "test:prose",
  "typecheck", "lint", "test:site", "validate:translations", "test:translations",
  "validate:docs", "test:sources", "validate:coverage", "validate:taxonomies", "validate:math",
  "validate:workstation", "test:workstation", "check:test-coverage", "test:readiness",
  "build", "validate:site-build",
]);

function npmRunChain(scripts) {
  return scripts.map((script) => `npm run ${script}`).join(" && ");
}

function validateWorkstationShardManifestCoverage(
  scripts,
  expectedShardNames,
  workstationManifests,
  relativePath,
) {
  const findings = [];
  for (const fixture of ["026", "029"]) {
    const implementation = workstationManifests?.[fixture]?.implementation;
    const tests = implementation?.tests;
    const fullTests = implementation?.full_tests;
    const fixtureShardNames = expectedShardNames.filter((name) => (
      name.startsWith(`test:workstation:fixture-${fixture}:shard-`)
    ));
    const shardFiles = fixtureShardNames.flatMap((name) => (
      String(scripts[name] ?? "").split(" ").filter((entry) => entry.endsWith(".test.mjs"))
    ));
    const shardCounts = new Map();
    for (const file of shardFiles) shardCounts.set(file, (shardCounts.get(file) ?? 0) + 1);
    const inventoriesMatch = Array.isArray(tests)
      && Array.isArray(fullTests)
      && tests.length === fullTests.length
      && tests.every((file, index) => file === fullTests[index]);
    const everyTestShardedOnce = inventoriesMatch
      && shardFiles.length === fullTests.length
      && fullTests.every((file) => shardCounts.get(file) === 1);
    if (!everyTestShardedOnce) {
      findings.push(
        `${relativePath}: Fixture ${fixture} tests and full_tests must match and every registered test must appear in exactly one shard`,
      );
    }
  }
  return findings;
}

export function validateWorkstationShardScriptsObject(
  manifest,
  workstationManifests,
  relativePath = "package.json",
) {
  const scripts = manifest?.scripts ?? {};
  const findings = [];
  if (scripts["test:workstation"] !== "go -C tooling run ./cmd/20w ci run-workstation --root ..") {
    findings.push(`${relativePath}: test:workstation must use the bounded Go catalogue runner`);
  }
  const fullWithoutWorkstation = npmRunChain([
    "validate:runtime",
    ...aggregateTestScripts.filter((script) => ![
      "validate:workstation", "test:workstation",
    ].includes(script)),
  ]);
  if (scripts["check:full-without-workstation"] !== fullWithoutWorkstation) {
    findings.push(
      `${relativePath}: check:full-without-workstation must retain the complete non-workstation aggregate gate`,
    );
  }
  if (
    scripts.check !== "npm test"
    || scripts.pretest !== "npm run validate:runtime"
    || scripts.test !== npmRunChain(aggregateTestScripts)
  ) {
    findings.push(`${relativePath}: the local aggregate gate must retain the complete workstation suite`);
  }

  const expected = new Map([
    ["test:workstation:fixture-026:shard-1", workstationShardCommand([
      "experiments/workstation/fixture-026/rsd-t02-runner-resume.test.mjs",
    ])],
    ["test:workstation:fixture-026:shard-2", workstationShardCommand([
      "experiments/workstation/fixture-026/rsd-t02-runner.test.mjs",
    ])],
    ["test:workstation:fixture-026:shard-3", workstationShardCommand([
      "experiments/workstation/fixture-026/rsd-t02-public-development-isolated-durable-population-runner.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-transform-policies.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-pilot-transcript-calibration.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-system-family-generator.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-run-lock.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-fixed-instance-durable-store.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-population-contract.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-floor.test.mjs",
      "experiments/workstation/fixture-026/scientific-grid.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-stage3-design.test.mjs",
    ])],
    ["test:workstation:fixture-026:shard-4", workstationShardCommand([
      "experiments/workstation/fixture-026/rsd-t02-runner-ledger-format.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-arm-bank.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-isolated-policy.test.mjs",
      "experiments/workstation/fixture-026/build-rsd-t02-policy-bundle.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-null-prototypes.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-generator.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-pulse-panel-runner.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-null-maturation-contract.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-power-plan.test.mjs",
      "experiments/workstation/fixture-026/opened-file.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-contract.test.mjs",
    ])],
    ["test:workstation:fixture-026:shard-5", workstationShardCommand([
      "experiments/workstation/fixture-026/rsd-t02-pulse.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-public-development-population-runner.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-fixed-instance-runner.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-null-prototype-adapter.test.mjs",
    ])],
    ["test:workstation:fixture-026:shard-6", workstationShardCommand([
      "experiments/workstation/fixture-026/rsd-t02-runner-boundaries.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-event.test.mjs",
      "experiments/workstation/fixture-026/contract.test.mjs",
      "experiments/workstation/fixture-026/runner.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-evaluator.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-models.test.mjs",
      "experiments/workstation/fixture-026/rsd-t02-holm4.test.mjs",
    ])],
    ["test:workstation:fixture-026:shard-7", workstationShardCommand([
      "experiments/workstation/fixture-026/rsd-t02-fixed-instance-isolated-durable-runner.test.mjs",
    ])],
    ["test:workstation:fixture-026:shard-8", workstationShardCommand([
      "experiments/workstation/fixture-026/rsd-t02-runner-ledger-semantics.test.mjs",
    ])],
    ["test:workstation:fixture-029:shard-1", workstationShardCommand([
      "experiments/workstation/fixture-029/suite-runner.test.mjs",
      "experiments/workstation/fixture-029/contract.test.mjs",
    ])],
    ["test:workstation:fixture-029:shard-2", workstationShardCommand([
      "experiments/workstation/fixture-029/suite-runner-integrity.test.mjs",
      "experiments/workstation/fixture-029/cmb-x01-runner.test.mjs",
      "experiments/workstation/fixture-029/cmb-x01-contract.test.mjs",
      "experiments/workstation/fixture-029/runner.test.mjs",
    ])],
  ]);
  const actualShardNames = Object.keys(scripts)
    .filter((name) => /^test:workstation:fixture-(026|029):shard-/.test(name))
    .sort();
  const expectedShardNames = [...expected.keys()].sort();
  if (
    actualShardNames.length !== expectedShardNames.length
    || actualShardNames.some((name, index) => name !== expectedShardNames[index])
  ) {
    findings.push(`${relativePath}: workstation shard script identities must be exactly the ten allowlisted names`);
  }
  for (const [name, command] of expected) {
    if (scripts[name] !== command) {
      findings.push(`${relativePath}: ${name} must retain its exact bounded test inventory`);
    }
  }
  findings.push(...validateWorkstationShardManifestCoverage(
    scripts,
    expectedShardNames,
    workstationManifests,
    relativePath,
  ));
  return findings;
}

function validatePackage(root, findings) {
  const relativePath = "package.json";
  let manifest;
  try {
    manifest = JSON.parse(readText(root, relativePath));
  } catch (error) {
    findings.push(`${relativePath}: invalid JSON: ${error.message}`);
    return;
  }

  const scripts = manifest.scripts ?? {};
  const workstationManifests = {};
  for (const fixture of ["026", "029"]) {
    const manifestPath = `experiments/workstation/manifests/fixture-${fixture}.json`;
    try {
      workstationManifests[fixture] = JSON.parse(readText(root, manifestPath));
    } catch (error) {
      findings.push(`${manifestPath}: invalid JSON: ${error.message}`);
    }
  }
  findings.push(...validateWorkstationShardScriptsObject(
    manifest,
    workstationManifests,
    relativePath,
  ));
  for (const script of [
    "check",
    "check:code-shape",
    "check:prose",
    "test:code-shape",
    "test:go",
    "test:runtime",
    "test:prose",
    "test:release",
    "typecheck",
    "validate:policy",
    "validate:runtime",
    "validate:tooling",
    "test:policy",
  ]) {
    if (typeof scripts[script] !== "string" || scripts[script].trim().length === 0) {
      findings.push(`${relativePath}: missing required script ${script}`);
    }
  }

  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === "string" && command.includes("--test-isolation=")) {
      findings.push(
        `${relativePath}: script ${name} uses the unsupported --test-isolation spelling; use --experimental-test-isolation`,
      );
    }
  }

  if (manifest.engines?.node !== runtimePolicy.nodeVersion) {
    findings.push(`${relativePath}: engines.node must be exactly ${runtimePolicy.nodeVersion}`);
  }
  if (manifest.packageManager !== `npm@${runtimePolicy.npmVersion}`) {
    findings.push(`${relativePath}: packageManager must be npm@${runtimePolicy.npmVersion}`);
  }
  const expectedGoTest = "go -C tooling test ./... && go -C tooling vet ./...";
  if (scripts["test:go"] !== expectedGoTest) {
    findings.push(`${relativePath}: test:go must run the complete tooling test and vet gates`);
  }
  findings.push(...validateToolingValidationScript(scripts["validate:tooling"], relativePath));
  if (
    typeof scripts.test !== "string"
    || !scripts.test.startsWith("npm run test:go && npm run validate:tooling && ")
  ) {
    findings.push(`${relativePath}: the aggregate test gate must begin with Go tests and real catalogue validation`);
  }
  if (scripts.pretest !== "npm run validate:runtime") {
    findings.push(`${relativePath}: pretest must fail fast on the exact Node runtime policy`);
  }
  if (!scripts.test.includes("npm run test:runtime")) {
    findings.push(`${relativePath}: the aggregate test gate must exercise the Node runtime policy tests`);
  }

  const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
  const retiredHostingDependencies = new Set([
    "@cloudflare/vite-plugin",
    "@next/eslint-plugin-next",
    "next",
    "vinext",
    "wrangler",
  ]);
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (typeof version !== "string" || !exactVersion.test(version)) {
        findings.push(`${relativePath}: ${section}.${name} must use an exact version; got ${JSON.stringify(version)}`);
      }
      if (retiredHostingDependencies.has(name)) {
        findings.push(`${relativePath}: ${section}.${name} belongs to the retired ChatGPT Site runtime`);
      }
    }
  }

  if (manifest.private !== true) {
    findings.push(`${relativePath}: private must remain true to prevent accidental npm publication`);
  }
  if (manifest.license !== "SEE LICENSE IN LICENSING.md") {
    findings.push(`${relativePath}: split licensing must point to LICENSING.md`);
  }
}

export function validateRetiredHostingPaths(root = defaultRoot) {
  return forbiddenLegacyHostingPaths
    .filter((relativePath) => fs.existsSync(path.join(root, relativePath)))
    .map((relativePath) => `${relativePath}: retired ChatGPT Site path must remain absent`);
}

function validateGoModule(root, findings) {
  const relativePath = "tooling/go.mod";
  const expected = [
    "module github.com/cordanaLLM/20-watts-was-enough/tooling",
    "",
    `go ${runtimePolicy.goVersion}`,
    "",
    "require github.com/yuin/goldmark/v2 v2.0.1",
    "",
  ].join("\n");
  if (readText(root, relativePath).replaceAll("\r\n", "\n") !== expected) {
    findings.push(
      `${relativePath}: must declare the canonical module, Go ${runtimePolicy.goVersion}, and the reviewed Goldmark v2 dependency`,
    );
  }
  const expectedSums = [
    "github.com/yuin/goldmark/v2 v2.0.1 h1:Os0APQLbfXBzA7pc8qF8HBSTO8LOIvhQHX6pEA5/0CY=",
    "github.com/yuin/goldmark/v2 v2.0.1/go.mod h1:G6M4/qOFtfn01/o14BU1UR2Lo5N3S9Qo7xCuz/sHjGQ=",
    "",
  ].join("\n");
  if (readText(root, "tooling/go.sum").replaceAll("\r\n", "\n") !== expectedSums) {
    findings.push("tooling/go.sum: must contain only the reviewed Goldmark v2 checksums");
  }
}

function validatePrinciples(root, findings) {
  const relativePath = "docs/principles.md";
  const source = readText(root, relativePath);
  for (let rule = 1; rule <= 10; rule += 1) {
    if (!source.includes(`**P10-${rule}**`)) {
      findings.push(`${relativePath}: missing adapted rule P10-${rule}`);
    }
  }

  for (const heading of [
    "Scientific integrity contract",
    "Research conduct and disclosure",
    "Ethics, correction, and review",
    "Experiment and reproducibility contract",
    "Software and supply-chain contract",
    "Repository and release contract",
    "Licensing contract",
  ]) {
    if (!source.includes(heading)) {
      findings.push(`${relativePath}: missing section ${heading}`);
    }
  }
}

function validateRenovate(root, findings) {
  const relativePath = "renovate.json";
  let config;
  try {
    config = JSON.parse(readText(root, relativePath));
  } catch (error) {
    findings.push(`${relativePath}: invalid JSON: ${error.message}`);
    return;
  }

  const rules = Array.isArray(config.packageRules) ? config.packageRules : [];
  if (rules.some((rule) => rule?.automerge === true)) {
    findings.push(`${relativePath}: automerge stays disabled until required CI and repository rules are verified`);
  }
  if (!config.timezone || config.timezone !== "Europe/Berlin") {
    findings.push(`${relativePath}: timezone must be Europe/Berlin`);
  }
}

function pullRequestTitleTriggerIsExact(trigger) {
  const expectedEvents = ["opened", "edited", "synchronize", "reopened"];
  return (
    Object.keys(trigger ?? {}).every((key) => ["branches", "types"].includes(key))
    && trigger?.branches?.length === 1
    && trigger.branches[0] === "main"
    && trigger?.types?.length === expectedEvents.length
    && expectedEvents.every((event) => trigger.types.includes(event))
  );
}

function pullRequestTitleWorkflowIsExact(workflow) {
  return (
    workflow?.name === "PR title"
    && Object.keys(workflow ?? {}).every((key) => [
      "name", "on", "permissions", "concurrency", "jobs",
    ].includes(key))
    && Object.keys(workflow?.on ?? {}).length === 1
    && pullRequestTitleTriggerIsExact(workflow?.on?.pull_request_target)
    && Object.keys(workflow?.permissions ?? {}).length === 0
    && workflow?.concurrency?.group === "${{ github.workflow }}-${{ github.event.pull_request.number }}"
    && workflow?.concurrency?.["cancel-in-progress"] === true
    && Object.keys(workflow?.concurrency ?? {}).length === 2
    && workflow?.defaults === undefined
    && Object.keys(workflow?.jobs ?? {}).length === 1
  );
}

function pullRequestTitleJobIsExact(titleJob, expectedName = "PR title", expectedIf) {
  return (
    titleJob?.name === expectedName
    && titleJob?.if === expectedIf
    && titleJob?.["runs-on"] === "ubuntu-latest"
    && titleJob?.["timeout-minutes"] === 5
    && continueOnErrorIsDisabled(titleJob)
    && titleJob?.defaults === undefined
    && titleJob?.container === undefined
    && titleJob?.services === undefined
    && Array.isArray(titleJob?.steps)
    && titleJob.steps.length === 1
    && Object.keys(titleJob ?? {}).every((key) => (
      ["name", "runs-on", "timeout-minutes", "steps"].includes(key)
      || (key === "if" && expectedIf !== undefined)
    ))
  );
}

function pullRequestTitleRun(managedTypes) {
  return [
    `if ! printf '%s\\n' "$PR_TITLE" | grep -qE '^(${managedTypes.join("|")})(\\([^()]{1,64}\\))?(!)?:[[:space:]]+[^[:space:]]'; then`,
    "  echo \"::error::PR title must use Conventional Commits: <type>(<scope>): <description>\"",
    "  exit 1",
    "fi",
    "",
  ].join("\n");
}

function pullRequestTitleStepIsExact(titleStep, expectedRun) {
  return (
    titleStep?.name === "Require a Conventional Commit title"
    && titleStep?.run === expectedRun
    && titleStep?.env?.PR_TITLE === "${{ github.event.pull_request.title }}"
    && Object.keys(titleStep?.env ?? {}).length === 1
    && titleStep?.if === undefined
    && continueOnErrorIsDisabled(titleStep)
    && titleStep?.shell === undefined
    && Object.keys(titleStep ?? {}).every((key) => ["name", "env", "run"].includes(key))
  );
}

export function validatePullRequestTitleTypeAuthority(
  workflow,
  manifest,
  workflowPath = ".github/workflows/pr-title.yml",
  manifestPath = ".github/labels.json",
) {
  const finding = `${workflowPath}: PR title types must exactly match managed type:* labels in ${manifestPath}`;
  const managedTypes = (manifest?.labels ?? [])
    .map((label) => label?.name)
    .filter((name) => typeof name === "string" && name.startsWith("type:"))
    .map((name) => name.slice("type:".length));
  const uniqueManagedTypes = new Set(managedTypes);
  const expectedRun = pullRequestTitleRun(managedTypes);
  if (
    managedTypes.length === 0
    || uniqueManagedTypes.size !== managedTypes.length
    || managedTypes.some((type) => !/^[a-z][a-z0-9-]{0,31}$/u.test(type))
    || !pullRequestTitleWorkflowIsExact(workflow)
    || !pullRequestTitleJobIsExact(workflow?.jobs?.["pr-title"])
    || !pullRequestTitleStepIsExact(workflow?.jobs?.["pr-title"]?.steps?.[0], expectedRun)
  ) {
    return [finding];
  }
  return [];
}

function validateLabels(root, findings, issueForms) {
  const manifestPath = ".github/labels.json";
  const manifest = parseYaml(root, manifestPath, findings);
  if (
    !manifest
    || typeof manifest !== "object"
    || Array.isArray(manifest)
    || manifest.schema !== 1
    || Object.keys(manifest).some((key) => !["schema", "labels"].includes(key))
    || !Array.isArray(manifest.labels)
    || manifest.labels.length === 0
  ) {
    findings.push(`${manifestPath}: label manifest must be a closed schema-1 object with a non-empty labels sequence`);
    return;
  }

  const labels = new Set();
  for (const [index, label] of manifest.labels.entries()) {
    if (!label || typeof label !== "object" || typeof label.name !== "string") {
      findings.push(`${manifestPath}: entry ${index} needs a string name`);
      continue;
    }
    if (Object.keys(label).some((key) => !["color", "description", "name"].includes(key))) {
      findings.push(`${manifestPath}: label ${label.name} contains an unknown field`);
    }
    if (labels.has(label.name)) {
      findings.push(`${manifestPath}: duplicate label ${label.name}`);
    }
    labels.add(label.name);
    if (typeof label.color !== "string" || !/^[0-9a-f]{6}$/iu.test(label.color)) {
      findings.push(`${manifestPath}: label ${label.name} needs a six-digit color`);
    }
    if (
      typeof label.description !== "string"
      || label.description.length === 0
      || label.description.length > 100
    ) {
      findings.push(`${manifestPath}: label ${label.name} needs a 1-100 character description`);
    }
  }

  const labelerPath = ".github/labeler.yml";
  const labeler = parseYaml(root, labelerPath, findings);
  if (!labeler || typeof labeler !== "object" || Array.isArray(labeler)) {
    findings.push(`${labelerPath}: path labeler must be a mapping`);
  } else {
    for (const label of Object.keys(labeler)) {
      if (!labels.has(label)) {
        findings.push(`${labelerPath}: path rule references undefined label ${label}`);
      }
    }
  }

  for (const [relativePath, form] of issueForms) {
    const formLabels = Array.isArray(form?.labels) ? form.labels : [];
    for (const label of formLabels) {
      if (!labels.has(label)) {
        findings.push(`${relativePath}: issue form references undefined label ${label}`);
      }
    }
  }

  const titleWorkflowPath = ".github/workflows/pr-title.yml";
  const titleWorkflow = parseYaml(root, titleWorkflowPath, findings);
  if (titleWorkflow) {
    findings.push(...validatePullRequestTitleTypeAuthority(
      titleWorkflow,
      manifest,
      titleWorkflowPath,
      manifestPath,
    ));
  }
}

function loadScientificRuntimeLock(root, findings) {
  const relativePath = "experiments/workstation/fixture-019/python-environment.lock.json";
  try {
    return JSON.parse(readText(root, relativePath));
  } catch (error) {
    findings.push(`${relativePath}: invalid JSON: ${error.message}`);
    return undefined;
  }
}

function loadNpmRuntimeLock(root, findings) {
  const relativePath = "scripts/npm-runtime-lock.json";
  try {
    return JSON.parse(readText(root, relativePath));
  } catch (error) {
    findings.push(`${relativePath}: invalid JSON: ${error.message}`);
    return undefined;
  }
}

function validateReleaseWorkflowPolicy(workflow, relativePath, lock, findings) {
  findings.push(...validateReleaseWorkflowObject(workflow, relativePath));
  findings.push(...validateReleaseExperimentImageWorkflowObject(workflow, relativePath));
  findings.push(...validateScientificRuntimeWorkflowObject(
    workflow,
    lock,
    "verify",
    relativePath,
  ));
  findings.push(...validateJavaScriptRuntimeWorkflowObject(workflow, "verify", relativePath));
  findings.push(...validateGoRuntimeWorkflowObject(workflow, "verify", relativePath));
  findings.push(...validatePDFRendererReproducibilityWorkflowObject(workflow, relativePath));
}

function validateCiWorkflowPolicy(workflow, relativePath, lock, findings) {
  findings.push(...validateCiImpactWorkflowObject(workflow, relativePath));
  findings.push(...validateCiExperimentImageWorkflowObject(workflow, relativePath));
  findings.push(...validateCiFuzzingWorkflowObject(workflow, relativePath));
  findings.push(...validateScientificRuntimeWorkflowObject(
    workflow,
    lock,
    "quality-full",
    relativePath,
  ));
  findings.push(...validateJavaScriptRuntimeWorkflowObject(workflow, "quality-full", relativePath));
  findings.push(...validateGoRuntimeWorkflowObject(workflow, "quality-full", relativePath));
  findings.push(...validatePDFRendererReproducibilityWorkflowObject(workflow, relativePath));
}

function validateWorkflowPolicy(workflow, relativePath, lock, findings) {
  findings.push(...validateWorkflowObject(workflow, relativePath));
  findings.push(...validatePublicRepositoryRunnerWorkflowObject(workflow, relativePath));
  const auditJobName = relativePath === ".github/workflows/ci.yml"
    ? "quality-full"
    : relativePath === ".github/workflows/release.yml"
      ? "verify"
      : undefined;
  findings.push(...validateDependencyAuditWorkflowObject(workflow, auditJobName, relativePath));
  if (relativePath === ".github/workflows/release.yml") {
    validateReleaseWorkflowPolicy(workflow, relativePath, lock, findings);
  }
  if (relativePath === ".github/workflows/ci.yml") {
    validateCiWorkflowPolicy(workflow, relativePath, lock, findings);
  }
  if (relativePath === ".github/workflows/github-pages.yml") {
    findings.push(...validateJavaScriptRuntimeWorkflowObject(workflow, "build", relativePath));
    findings.push(...validateGoRuntimeWorkflowObject(
      workflow,
      "verify-public-transport",
      relativePath,
    ));
    findings.push(...validatePagesPublicTransportWorkflowObject(workflow, relativePath));
  }
  if (relativePath === ".github/workflows/codeql.yml") {
    findings.push(...validateCodeQlImpactWorkflowObject(workflow, relativePath));
    findings.push(...validateGoCodeQlWorkflowObject(workflow, relativePath));
  }
  if (relativePath === ".github/workflows/sync-repository-metadata.yml") {
    findings.push(...validateRepositoryMetadataSyncWorkflowObject(workflow, relativePath));
  }
  if (relativePath === ".github/workflows/labeler.yml") {
    findings.push(...validatePullRequestMetadataWorkflowObject(workflow, relativePath));
  }
}

export function validateWorkflowTree(root, scientificRuntimeLock) {
  const findings = [];
  const directory = path.join(root, ".github", "workflows");
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    return [".github/workflows: cannot enumerate workflow policy surface: " + error.message];
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!/\.ya?ml$/u.test(entry.name)) continue;
    const relativePath = path.posix.join(".github/workflows", entry.name);
    if (!entry.isFile()) {
      findings.push(relativePath + ": workflow policy surface must be a regular file");
      continue;
    }
    const workflow = parseYaml(root, relativePath, findings);
    if (workflow) {
      validateWorkflowPolicy(workflow, relativePath, scientificRuntimeLock, findings);
    }
  }
  return findings;
}

function validateIssuePolicy(root, findings) {
  const issueForms = [];
  for (const relativePath of issueFormFiles) {
    const form = parseYaml(root, relativePath, findings);
    if (form) {
      issueForms.push([relativePath, form]);
      findings.push(...validateIssueForm(form, relativePath));
      if (relativePath === ".github/ISSUE_TEMPLATE/experiment-protocol-problem.yml") {
        findings.push(...validateExperimentReportIdentity(form, relativePath));
      }
      if (relativePath === ".github/ISSUE_TEMPLATE/experiment-run-failure.yml") {
        findings.push(...validateExperimentRunFailureForm(form, relativePath));
      }
    }
  }
  validateLabels(root, findings, issueForms);

  const issueConfigPath = ".github/ISSUE_TEMPLATE/config.yml";
  const issueConfig = parseYaml(root, issueConfigPath, findings);
  if (issueConfig) findings.push(...validateIssueConfig(issueConfig, issueConfigPath));

  const fundingPath = ".github/FUNDING.yml";
  const funding = parseYaml(root, fundingPath, findings);
  if (funding) findings.push(...validateFundingConfig(funding, fundingPath));
}

export function validateExperimentReportIdentity(
  form,
  relativePath = ".github/ISSUE_TEMPLATE/experiment-protocol-problem.yml",
) {
  const findings = [];
  const items = Array.isArray(form?.body) ? form.body : [];
  const digest = items.find((item) => item?.id === "released_image_digest");
  const releaseTag = items.find((item) => item?.id === "release_tag");
  const execution = items.find((item) => item?.id === "container_execution");
  if (
    digest?.type !== "input"
    || !digest.attributes?.description?.includes("image@sha256")
    || !digest.attributes?.description?.includes("tag alone is not sufficient")
  ) {
    findings.push(`${relativePath}: experiment reports must request an exact released image@sha256 identity`);
  }
  if (
    releaseTag?.type !== "input"
    || !releaseTag.attributes?.description?.includes("separately from the immutable digest")
  ) {
    findings.push(`${relativePath}: experiment reports must keep the release tag separate from the image digest`);
  }
  if (
    execution?.type !== "textarea"
    || !execution.attributes?.description?.includes("architecture")
    || !execution.attributes?.description?.includes("NO_RESULT receipt")
  ) {
    findings.push(`${relativePath}: experiment reports must capture the bounded container execution identity`);
  }
  return findings;
}

function descriptionIncludes(field, fragments) {
  const description = field?.attributes?.description;
  return typeof description === "string"
    && fragments.every((fragment) => description.includes(fragment));
}

function requiredRunFailureField(byId, id, type, relativePath, findings) {
  const field = byId.get(id);
  if (field?.type !== type || field.validations?.required !== true) {
    findings.push(`${relativePath}: ${id} must be a required ${type} field`);
  }
  return field;
}

function validateRunFailureImageIdentity(byId, relativePath, findings) {
  const image = byId.get("image_identity");
  if (
    image?.type !== "input"
    || image.validations?.required === true
    || !descriptionIncludes(image, ["If available", "image@sha256", "release tag"])
  ) {
    findings.push(`${relativePath}: image identity must optionally request an exact image@sha256 digest or release tag`);
  }
}

function validateRunFailurePlatform(byId, relativePath, findings) {
  const platform = requiredRunFailureField(byId, "platform", "input", relativePath, findings);
  if (!descriptionIncludes(platform, ["operating system", "architecture", "container runtime"])) {
    findings.push(`${relativePath}: platform must request operating system, architecture, and container runtime`);
  }
}

function validateRunFailureCommandAndLog(byId, relativePath, findings) {
  const command = requiredRunFailureField(byId, "command", "textarea", relativePath, findings);
  if (command?.attributes?.render !== "shell") {
    findings.push(`${relativePath}: command must be rendered as shell input`);
  }

  const failure = requiredRunFailureField(byId, "failure", "textarea", relativePath, findings);
  if (!descriptionIncludes(failure, ["run stopped", "shortest relevant", "log excerpt"])) {
    findings.push(`${relativePath}: failure must request the stopping point and shortest relevant log excerpt`);
  }
}

function validateRunFailureConfirmation(byId, relativePath, findings) {
  const confirmation = byId.get("confirmation");
  const options = Array.isArray(confirmation?.attributes?.options)
    ? confirmation.attributes.options
    : [];
  const requiresRedaction = options.some((option) => (
    option?.required === true && option?.label?.includes("I removed credentials")
  ));
  const requiresPublicConsent = options.some((option) => (
    option?.required === true
    && option?.label?.includes("public issue")
    && option.label.includes("consent")
  ));
  const requiresEveryCheck = options.every((option) => option?.required === true);
  if (
    confirmation?.type !== "checkboxes"
    || options.length !== 2
    || !requiresEveryCheck
    || !requiresRedaction
    || !requiresPublicConsent
  ) {
    findings.push(`${relativePath}: submission checks must require redaction and public-report consent`);
  }
}

export function validateExperimentRunFailureForm(
  form,
  relativePath = ".github/ISSUE_TEMPLATE/experiment-run-failure.yml",
) {
  const findings = [];
  const items = Array.isArray(form?.body) ? form.body : [];
  const byId = new Map(items.filter((item) => item?.id).map((item) => [item.id, item]));

  if (items.length > 7) {
    findings.push(`${relativePath}: failed-run intake must remain a short form with at most seven body items`);
  }

  requiredRunFailureField(byId, "experiment_ref", "input", relativePath, findings);
  validateRunFailureImageIdentity(byId, relativePath, findings);
  validateRunFailurePlatform(byId, relativePath, findings);
  validateRunFailureCommandAndLog(byId, relativePath, findings);
  validateRunFailureConfirmation(byId, relativePath, findings);

  return findings;
}

function validateCitationAndOwnership(root, findings) {
  const citation = parseYaml(root, "CITATION.cff", findings);
  if (citation?.["cff-version"] !== "1.2.0") {
    findings.push("CITATION.cff: cff-version must be 1.2.0");
  }
  if (citation?.["repository-code"] !== "https://github.com/cordanaLLM/20-watts-was-enough") {
    findings.push("CITATION.cff: repository-code must name the canonical repository");
  }

  const codeowners = readText(root, ".github/CODEOWNERS");
  if (!codeowners.includes("@lusoris")) {
    findings.push(".github/CODEOWNERS: @lusoris must own the repository policy surface");
  }

  const gitleaks = readText(root, ".gitleaks.toml");
  if (!/^\s*useDefault\s*=\s*true\s*$/mu.test(gitleaks)) {
    findings.push(".gitleaks.toml: extend the default gitleaks ruleset");
  }
}

export function validateCurrentResearchDisclosure(root = defaultRoot) {
  const findings = [];
  let packageManifest;
  try {
    packageManifest = JSON.parse(readText(root, "package.json"));
  } catch (error) {
    findings.push(`package.json: current-version disclosure cannot be resolved: ${error.message}`);
    return findings;
  }

  const version = packageManifest?.version;
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)) {
    findings.push("package.json: version must use MAJOR.MINOR.PATCH before resolving the current disclosure");
    return findings;
  }

  const relativePath = `research/disclosures/v${version}.md`;
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    findings.push(`${relativePath}: current-version research disclosure is missing`);
    return findings;
  }
  const information = fs.lstatSync(absolutePath);
  if (!information.isFile() || information.isSymbolicLink()) {
    findings.push(`${relativePath}: current-version research disclosure must be a regular, unlinked file`);
    return findings;
  }
  try {
    validateResearchDisclosure(readText(root, relativePath), version, relativePath);
  } catch (error) {
    findings.push(error.message);
  }
  return findings;
}

export function validateRepositoryPolicy(root = defaultRoot) {
  const findings = [];

  for (const relativePath of requiredFiles) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      findings.push(`${relativePath}: required policy surface is missing`);
    }
  }
  findings.push(...validateCurrentResearchDisclosure(root));
  findings.push(...validateRetiredHostingPaths(root));
  findings.push(...validatePortableOperationsTree(root));

  if (findings.some((finding) => finding.includes("required policy surface is missing"))) {
    return findings;
  }

  validatePackage(root, findings);
  validateGoModule(root, findings);
  validatePrinciples(root, findings);
  validateRenovate(root, findings);

  const scientificRuntimeLock = loadScientificRuntimeLock(root, findings);
  const npmRuntimeLock = loadNpmRuntimeLock(root, findings);

  if (scientificRuntimeLock) {
    findings.push(...validateScientificRuntimeLock(scientificRuntimeLock));
  }
  if (npmRuntimeLock) {
    findings.push(...validateNpmRuntimeLock(npmRuntimeLock));
  }
  validateScientificRequirements(root, findings);
  findings.push(...validateWorkflowTree(root, scientificRuntimeLock));
  validateIssuePolicy(root, findings);
  validateCitationAndOwnership(root, findings);

  return findings;
}

export function formatFindings(findings) {
  if (findings.length === 0) {
    return "Engineering policy validation passed.";
  }
  return [
    `Engineering policy validation failed with ${findings.length} finding(s):`,
    ...findings.map((finding) => `- ${finding}`),
  ].join("\n");
}

function main() {
  const findings = validateRepositoryPolicy(defaultRoot);
  console.log(formatFindings(findings));
  if (findings.length > 0) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main();
}
