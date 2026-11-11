import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FIXTURE_019_PYTHON_VARIABLE,
  assertFixture019Runtime,
  fixture019PythonCommand,
  prepareFixture019,
} from "./runner.mjs";
import { verifiedFixture019Python } from "./test-helpers.mjs";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));

// readLock returns the pinned fixture environment for runtime acceptance and refusal tests.
async function readLock() {
  return JSON.parse(await readFile(path.join(fixtureRoot, "python-environment.lock.json"), "utf8"));
}

// lockedRecord returns a worker runtime record matching the lock and required little-endian
// byte order, giving tests a valid baseline for individual field mismatches.
function lockedRecord(lock) {
  return {
    python_implementation: lock.python_implementation,
    python_version: lock.python_version,
    numpy_version: lock.packages.numpy,
    bit_generator: lock.bit_generator,
    byteorder: "little",
  };
}

test("an unset or empty interpreter variable falls back to python from PATH", () => {
  assert.equal(fixture019PythonCommand({}), "python");
  assert.equal(fixture019PythonCommand({ [FIXTURE_019_PYTHON_VARIABLE]: "" }), "python");
});

test("an absolute interpreter path is used as given", () => {
  const interpreter = path.resolve(os.tmpdir(), "venv", "bin", "python");
  assert.equal(fixture019PythonCommand({ [FIXTURE_019_PYTHON_VARIABLE]: interpreter }), interpreter);
});

test("a relative interpreter path is refused with the variable name", () => {
  for (const relative of ["python3", path.join("venv", "bin", "python"), `.${path.sep}python`]) {
    assert.throws(
      () => fixture019PythonCommand({ [FIXTURE_019_PYTHON_VARIABLE]: relative }),
      (error) => error instanceof Error
        && error.message.startsWith(`${FIXTURE_019_PYTHON_VARIABLE} must be an absolute interpreter path`),
    );
  }
});

test("a runtime matching the lock passes and every mismatched field is refused", async () => {
  const lock = await readLock();
  const locked = lockedRecord(lock);
  assert.equal(assertFixture019Runtime(locked, lock, "python"), locked);
  const mismatches = {
    python_implementation: "PyPy",
    python_version: "3.14.9",
    numpy_version: "2.5.3",
    bit_generator: "PCG64",
    byteorder: "big",
  };
  for (const [field, value] of Object.entries(mismatches)) {
    assert.throws(
      () => assertFixture019Runtime({ ...locked, [field]: value }, lock, "/opt/python"),
      (error) => error.message.startsWith("Fixture 019 runtime differs from python-environment.lock.json: /opt/python reports ")
        && error.message.includes(value)
        && error.message.includes(`${lock.python_implementation} ${lock.python_version}, NumPy ${lock.packages.numpy}`)
        && error.message.includes(FIXTURE_019_PYTHON_VARIABLE),
      field,
    );
  }
  assert.throws(() => assertFixture019Runtime(undefined, lock, "python"), /runtime differs/u);
});

test("the configured interpreter is checked against the lock before use", async () => {
  const command = verifiedFixture019Python();
  const executable = execFileSync(command, ["-c", "import sys; print(sys.executable)"], {
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  }).trim();
  assert.ok(path.isAbsolute(executable), executable);
  assert.equal(verifiedFixture019Python({ [FIXTURE_019_PYTHON_VARIABLE]: executable }), executable);
});

const posixStubOnly = {
  skip: process.platform === "win32" ? "the stub interpreter is a POSIX shell script" : false,
};

// withStubInterpreter writes a shell script that answers the first worker request with
// record, drains stdin, and exits with exitCode; body receives the script path.
async function withStubInterpreter(record, exitCode, body) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "f019-python-stub-"));
  try {
    const stub = path.join(directory, "python");
    const response = JSON.stringify({ ok: true, result: record });
    await writeFile(stub, `#!/bin/sh\nIFS= read -r request\nprintf '%s\\n' '${response}'\ncat >/dev/null\nexit ${exitCode}\n`);
    await chmod(stub, 0o755);
    return await body(stub);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// withInterpreterVariable sets the interpreter variable for the runner, which reads
// process.env, and restores the previous value afterwards.
async function withInterpreterVariable(value, body) {
  const previous = process.env[FIXTURE_019_PYTHON_VARIABLE];
  process.env[FIXTURE_019_PYTHON_VARIABLE] = value;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env[FIXTURE_019_PYTHON_VARIABLE];
    else process.env[FIXTURE_019_PYTHON_VARIABLE] = previous;
  }
}

// runtimeDiffers returns the expected refusal prefix for a stub reporting CPython 3.14.9,
// letting failure tests pin both the interpreter identity and the reported runtime.
function runtimeDiffers(stub) {
  return `Fixture 019 runtime differs from python-environment.lock.json: ${stub} reports CPython 3.14.9`;
}

test("a configured interpreter that reports another runtime is refused", posixStubOnly, async () => {
  const lock = await readLock();
  await withStubInterpreter({ ...lockedRecord(lock), python_version: "3.14.9" }, 0, (stub) => {
    assert.throws(
      () => verifiedFixture019Python({ [FIXTURE_019_PYTHON_VARIABLE]: stub }),
      (error) => error.message.startsWith(runtimeDiffers(stub)),
    );
  });
});

test("the runner closes a worker that exits cleanly after a matching runtime", posixStubOnly, async () => {
  const lock = await readLock();
  await withStubInterpreter(lockedRecord(lock), 0, (stub) => withInterpreterVariable(stub, async () => {
    const prepared = await prepareFixture019("smoke");
    assert.equal(prepared.prepared, true);
    assert.deepEqual(prepared.environment, lockedRecord(lock));
  }));
});

test("the runner raises a worker exit failure after an otherwise successful action", posixStubOnly, async () => {
  const lock = await readLock();
  await withStubInterpreter(lockedRecord(lock), 3, (stub) => withInterpreterVariable(stub, async () => {
    await assert.rejects(prepareFixture019("smoke"), (error) => (
      !(error instanceof AggregateError) && error.message.startsWith("Fixture 019 worker exited 3")
    ));
  }));
});

test("the runner keeps an action failure alone when the worker closes cleanly", posixStubOnly, async () => {
  const lock = await readLock();
  const record = { ...lockedRecord(lock), python_version: "3.14.9" };
  await withStubInterpreter(record, 0, (stub) => withInterpreterVariable(stub, async () => {
    await assert.rejects(prepareFixture019("smoke"), (error) => (
      !(error instanceof AggregateError) && error.message.startsWith(runtimeDiffers(stub))
    ));
  }));
});

test("the runner raises an action failure and a worker exit failure together", posixStubOnly, async () => {
  const lock = await readLock();
  const record = { ...lockedRecord(lock), python_version: "3.14.9" };
  await withStubInterpreter(record, 3, (stub) => withInterpreterVariable(stub, async () => {
    await assert.rejects(prepareFixture019("smoke"), (error) => {
      assert.ok(error instanceof AggregateError, String(error));
      assert.equal(error.errors.length, 2);
      assert.equal(error.cause, error.errors[0]);
      assert.ok(error.errors[0].message.startsWith(runtimeDiffers(stub)), error.errors[0].message);
      assert.ok(error.errors[1].message.startsWith("Fixture 019 worker exited 3"), error.errors[1].message);
      assert.ok(error.message.startsWith(runtimeDiffers(stub)), error.message);
      return true;
    });
  }));
});
