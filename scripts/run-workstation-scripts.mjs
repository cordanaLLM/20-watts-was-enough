import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT_NAME_PATTERN = /^test:workstation:[a-z0-9:-]+$/u;
const MAX_SCRIPTS_COUNT = 19;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export function parseAndValidateScriptNames(rawScripts, definedScripts) {
  if (typeof rawScripts !== "string" || !rawScripts.trim()) {
    throw new Error("SCRIPTS environment variable is empty or not set");
  }
  const names = rawScripts.split(" ");
  if (names.length === 0 || names.length > MAX_SCRIPTS_COUNT) {
    throw new Error(`SCRIPTS count ${names.length} is outside allowed bound 1..${MAX_SCRIPTS_COUNT}`);
  }
  for (const name of names) {
    if (!SCRIPT_NAME_PATTERN.test(name)) {
      throw new Error(`invalid workstation script name format: ${name}`);
    }
    if (!Object.hasOwn(definedScripts, name)) {
      throw new Error(`workstation script is not defined in package.json: ${name}`);
    }
  }
  return names;
}

export function loadPackageScripts(workingDirectory = process.cwd()) {
  const packageJsonPath = path.resolve(workingDirectory, "package.json");
  let content;
  try {
    content = fs.readFileSync(packageJsonPath, "utf8");
  } catch (error) {
    throw new Error(`failed to read package.json at ${packageJsonPath}: ${error.message}`, { cause: error });
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`failed to parse package.json: ${error.message}`, { cause: error });
  }
  return parsed?.scripts ?? {};
}

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    // ESRCH: the group already exited, which is the outcome termination wants.
    if (error?.code !== "ESRCH") {
      throw new Error(`failed to send ${signal} to process group ${pid}: ${error.message}`, { cause: error });
    }
  }
}

function terminateProcessGroup(child) {
  if (process.platform === "win32") {
    child.kill("SIGTERM");
    return;
  }
  signalProcessGroup(child.pid, "SIGTERM");
  setTimeout(() => signalProcessGroup(child.pid, "SIGKILL"), 5000).unref();
}

export function runSingleScript(scriptName, {
  workingDirectory = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  stdio = "inherit",
} = {}) {
  return new Promise((resolve) => {
    const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
    let timedOut = false;
    let settled = false;
    const child = spawn(npmExecutable, ["run", scriptName], {
      cwd: workingDirectory,
      shell: false,
      stdio,
      detached: process.platform !== "win32",
    });

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessGroup(child);
    }, timeoutMs);
    timer.unref();

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: 1, timedOut: false, error: error.message });
    });

    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const exitCode = timedOut ? 124 : (Number.isInteger(code) ? code : 1);
      resolve({ exitCode, timedOut, signal: signal ?? null });
    });
  });
}

export function recordStepSummary(failures, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!summaryPath || failures.length === 0) return;
  const lines = [
    "### Workstation script failures",
    "",
    ...failures.map((item) => `- \`${item.name}\` (exit ${item.exitCode})`),
    "",
  ];
  fs.appendFileSync(summaryPath, lines.join("\n"), "utf8");
}

export async function runWorkstationScripts({
  rawScripts = process.env.SCRIPTS,
  workingDirectory = process.cwd(),
  timeoutMs = Number(process.env.WORKSTATION_SCRIPT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
  stdio = "inherit",
  log = (msg) => process.stdout.write(`${msg}\n`),
  logError = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  let definedScripts;
  try {
    definedScripts = loadPackageScripts(workingDirectory);
  } catch (error) {
    logError(error.message);
    return 2;
  }

  let names;
  try {
    names = parseAndValidateScriptNames(rawScripts, definedScripts);
  } catch (error) {
    logError(error.message);
    return 2;
  }

  const failures = [];
  for (const name of names) {
    const outcome = await runSingleScript(name, { workingDirectory, timeoutMs, stdio });
    if (outcome.exitCode === 0) {
      log(`workstation script passed: ${name}`);
    } else {
      log(`workstation script failed: ${name} (exit ${outcome.exitCode})`);
      failures.push({ name, exitCode: outcome.exitCode });
    }
  }

  if (summaryPath && failures.length > 0) {
    recordStepSummary(failures, summaryPath);
  }

  if (failures.length > 0) {
    logError(`workstation scripts failed: ${failures.map((item) => item.name).join(" ")}`);
    return 1;
  }
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const exitCode = await runWorkstationScripts();
  process.exit(exitCode);
}
