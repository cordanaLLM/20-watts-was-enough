import fs from "node:fs";
import path from "node:path";

const MAX_SCANNED_ENTRIES = 20_000;
const ignoredPrefixes = Object.freeze([
  ".claude/worktrees",
  ".git",
  ".workingdir2",
  "build",
  "coverage",
  "dist",
  "dist-github-pages",
  "experiments/workstation/runs",
  "node_modules",
  "tmp",
]);
const hostScriptExtensions = new Set([
  ".bat",
  ".cmd",
  ".ps1",
  ".psd1",
  ".psm1",
  ".reg",
  ".vbs",
  ".wsf",
]);
const retiredHostExecutionPaths = new Set([
  "experiments/workstation/fixture-012/WORKSTATION-RUNBOOK.md",
  "experiments/workstation/fixture-012/configs/process-adapter.template.json",
  "experiments/workstation/fixture-012/configs/workload-manifest.template.json",
  "experiments/workstation/fixture-012/configs/workstation-development.template.json",
  "experiments/workstation/fixture-012/process-workstation-adapter.mjs",
  "experiments/workstation/fixture-012/windows-job-supervisor.cs",
  "experiments/workstation/fixture-012/workstation-acquisition.mjs",
  "experiments/workstation/fixture-012/workstation-acquisition.test.mjs",
  "experiments/workstation/fixture-012/workstation-cli.mjs",
  "experiments/workstation/fixture-012/workstation-output.schema.json",
  "experiments/workstation/fixture-012/workstation-path-safety.mjs",
]);
const windowsRunnerPattern = /(^|[^a-z0-9])windows(?:-[a-z0-9]+)*(?=$|[^a-z0-9])/iu;
const powershellInvocationPattern = /(?:^|[\s;&|])(?:pwsh|powershell)(?:\.exe)?(?=\s|$)/imu;

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function isIgnored(relativePath) {
  return ignoredPrefixes.some((prefix) => (
    relativePath === prefix || relativePath.startsWith(`${prefix}/`)
  ));
}

function listRepositoryFiles(root) {
  const pending = [""];
  const files = [];
  let scannedEntries = 0;

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = fs.readdirSync(path.join(root, directory), { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      scannedEntries += 1;
      if (scannedEntries > MAX_SCANNED_ENTRIES) {
        throw new Error(`repository operation scan exceeds ${MAX_SCANNED_ENTRIES} entries`);
      }
      const relativePath = toPosix(path.join(directory, entry.name));
      if (isIgnored(relativePath)) continue;
      if (entry.isDirectory()) pending.push(relativePath);
      else files.push(relativePath);
    }
  }

  return files.sort();
}

function containsWindowsRunner(value) {
  if (typeof value === "string") return windowsRunnerPattern.test(value);
  if (Array.isArray(value)) return value.some(containsWindowsRunner);
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsWindowsRunner);
}

export function validateOperationalFilePaths(relativePaths) {
  return relativePaths
    .filter((relativePath) => {
      const normalized = relativePath.replaceAll("\\", "/");
      return retiredHostExecutionPaths.has(normalized)
        || hostScriptExtensions.has(path.posix.extname(normalized).toLowerCase());
    })
    .sort()
    .map((relativePath) => (
      `${relativePath}: host-specific operational artifact is forbidden; use the portable Go command or a scoped container`
    ));
}

export function validatePortableOperationsTree(root) {
  try {
    return validateOperationalFilePaths(listRepositoryFiles(root));
  } catch (error) {
    return [`repository: portable-operation scan failed: ${error.message}`];
  }
}

export function validatePortableWorkflowObject(workflow, relativePath = "workflow.yml") {
  const findings = [];
  for (const [jobName, job] of Object.entries(workflow?.jobs ?? {})) {
    if (
      containsWindowsRunner(job?.["runs-on"])
      || containsWindowsRunner(job?.strategy?.matrix)
    ) {
      findings.push(`${relativePath}: job ${jobName} must not add a Windows runner lane`);
    }
    for (const [stepIndex, step] of (job?.steps ?? []).entries()) {
      const shell = typeof step?.shell === "string"
        ? step.shell.trim().split(/\s+/u)[0].replace(/\.exe$/iu, "").toLowerCase()
        : "";
      if (["cmd", "powershell", "pwsh"].includes(shell)) {
        findings.push(`${relativePath}: job ${jobName} step ${stepIndex} must not use ${shell}`);
      }
      if (typeof step?.run === "string" && powershellInvocationPattern.test(step.run)) {
        findings.push(`${relativePath}: job ${jobName} step ${stepIndex} must not invoke PowerShell`);
      }
    }
  }
  return findings;
}
