import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertFixture019Runtime, fixture019PythonCommand } from "./runner.mjs";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(fixtureRoot, "worker.py");
const pythonTimeoutMilliseconds = 10 * 60 * 1000;
const verifiedCommands = new Set();

function readEnvironmentLock() {
  return JSON.parse(readFileSync(path.join(fixtureRoot, "python-environment.lock.json"), "utf8"));
}

function execPython(command, args, input) {
  return execFileSync(command, args, {
    cwd: fixtureRoot,
    input,
    encoding: "utf8",
    timeout: pythonTimeoutMilliseconds,
    windowsHide: true,
  });
}

function parseWorkerResponse(output) {
  const response = JSON.parse(output.trim());
  if (response.ok !== true) throw new Error(response.error);
  return response.result;
}

// verifiedFixture019Python resolves the interpreter (TWENTYW_FIXTURE_019_PYTHON, else PATH
// `python`) and refuses it unless its worker environment matches the lock. Each command is
// checked once per process.
export function verifiedFixture019Python(environment = process.env) {
  const command = fixture019PythonCommand(environment);
  if (verifiedCommands.has(command)) return command;
  const actual = parseWorkerResponse(execPython(command, ["-B", workerPath], `${JSON.stringify({ action: "environment" })}\n`));
  assertFixture019Runtime(actual, readEnvironmentLock(), command);
  verifiedCommands.add(command);
  return command;
}

export function runFixture019Python(args, input) {
  return execPython(verifiedFixture019Python(), args, input);
}

export function workerRequest(request) {
  return parseWorkerResponse(runFixture019Python(["-B", workerPath], `${JSON.stringify(request)}\n`));
}

export const firstDevelopmentSeed = "6050310934014137086";
