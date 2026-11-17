import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIXTURE_019_PYTHON_VARIABLE,
  assertFixture019Runtime,
  fixture019PythonCommand,
  provisionFixture019Python,
} from "./runner.mjs";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(fixtureRoot, "worker.py");
const pythonTimeoutMilliseconds = 10 * 60 * 1000;
const verifiedRuntimes = new Set();
let provisionedDefaultRuntime = false;

// readEnvironmentLock returns the fixture's pinned Python environment so test interpreters
// can be checked against the same lock as the runner.
function readEnvironmentLock() {
  return JSON.parse(readFileSync(path.join(fixtureRoot, "python-environment.lock.json"), "utf8"));
}

// execPython returns interpreter stdout from the fixture directory with a ten-minute
// timeout, propagating subprocess failures to the calling test.
function execPython(command, args, input, environment = process.env) {
  return execFileSync(command, args, {
    cwd: fixtureRoot,
    env: environment,
    input,
    encoding: "utf8",
    timeout: pythonTimeoutMilliseconds,
    windowsHide: true,
  });
}

// parseWorkerResponse returns a successful worker result and rejects malformed JSON or a
// worker failure so tests cannot treat an error response as output.
function parseWorkerResponse(output) {
  const response = JSON.parse(output.trim());
  if (response.ok !== true) throw new Error(response.error);
  return response.result;
}

// runtimeCacheKey binds command to the sorted environment entries so a cached probe
// never covers a modified environment.
function runtimeCacheKey(command, environment) {
  const entries = Object.entries(environment)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return JSON.stringify([command, entries]);
}

// verifiedFixture019Python lazily provisions the cached runtime via provisionFixture019Python
// once per process when TWENTYW_FIXTURE_019_PYTHON is unset, resolves the interpreter via
// fixture019PythonCommand, and refuses it unless its worker environment matches the lock.
// One probe runs per (command, environment) pair per process.
export function verifiedFixture019Python(environment = process.env) {
  const configured = environment[FIXTURE_019_PYTHON_VARIABLE];
  if (!provisionedDefaultRuntime && (configured === undefined || configured === "")) {
    provisionFixture019Python(environment);
    provisionedDefaultRuntime = true;
  }
  const command = fixture019PythonCommand(environment);
  const runtimeKey = runtimeCacheKey(command, environment);
  if (verifiedRuntimes.has(runtimeKey)) return command;
  const actual = parseWorkerResponse(
    execPython(command, ["-B", workerPath], `${JSON.stringify({ action: "environment" })}\n`, environment),
  );
  assertFixture019Runtime(actual, readEnvironmentLock(), command);
  verifiedRuntimes.add(runtimeKey);
  return command;
}

// runFixture019Python returns stdout from a lock-verified interpreter, allowing tests to
// execute fixture Python code under the runner's runtime contract.
export function runFixture019Python(args, input) {
  return execPython(verifiedFixture019Python(), args, input);
}

// workerRequest sends one JSON request through a verified interpreter and returns its
// successful result, propagating interpreter and worker failures to the test.
export function workerRequest(request) {
  return parseWorkerResponse(runFixture019Python(["-B", workerPath], `${JSON.stringify(request)}\n`));
}

export const firstDevelopmentSeed = "6050310934014137086";
