import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FIXTURE_019_PYTHON_VARIABLE,
  assertFixture019Runtime,
  fixture019PythonCommand,
  prepareFixture019,
  provisionFixture019Python,
} from "./runner.mjs";
import { verifiedFixture019Python } from "./test-helpers.mjs";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const posixStubOnly = {
  skip: process.platform === "win32" ? "the stub interpreter is a POSIX shell script" : false,
};

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

// versionedName returns python{major}.{minor} derived from the pinned lock version.
function versionedName(lock) {
  const [major, minor] = lock.python_version.split(".");
  return `python${major}.${minor}`;
}

// writeWorkerStub writes an executable POSIX shell script that answers the first worker
// request with record, drains remaining stdin with shell builtins, and exits exitCode.
async function writeWorkerStub(filePath, record, exitCode = 0) {
  const response = JSON.stringify({ ok: true, result: record });
  const script = [
    "#!/bin/sh",
    "IFS= read -r request",
    `printf '%s\\n' '${response}'`,
    "while IFS= read -r _; do :; done",
    `exit ${exitCode}`,
    "",
  ].join("\n");
  await writeFile(filePath, script);
  await chmod(filePath, 0o755);
}

// writePythonPathStub writes an executable POSIX shell script that answers the first worker
// request with defaultRecord when PYTHONPATH is unset or empty and pythonPathRecord when
// PYTHONPATH is set.
async function writePythonPathStub(filePath, defaultRecord, pythonPathRecord) {
  const defaultResponse = JSON.stringify({ ok: true, result: defaultRecord });
  const pythonPathResponse = JSON.stringify({ ok: true, result: pythonPathRecord });
  const script = [
    "#!/bin/sh",
    "IFS= read -r _",
    "if [ -z \"${PYTHONPATH:-}\" ]; then",
    `  printf '%s\\n' '${defaultResponse}'`,
    "else",
    `  printf '%s\\n' '${pythonPathResponse}'`,
    "fi",
    "while IFS= read -r _; do :; done",
    "exit 0",
    "",
  ].join("\n");
  await writeFile(filePath, script);
  await chmod(filePath, 0o755);
}

// writeCachedVenvStub creates <xdgDir>/fixture-019-python/venv-<version>/bin/python
// answering the worker environment action with record, and returns that interpreter path.
async function writeCachedVenvStub(xdgDir, version, record) {
  const binDir = path.join(xdgDir, "fixture-019-python", `venv-${version}`, "bin");
  await mkdir(binDir, { recursive: true });
  const venvBin = path.join(binDir, "python");
  await writeWorkerStub(venvBin, record, 0);
  return venvBin;
}

// withIsolatedEnvironment creates temporary XDG_CACHE_HOME and PATH directories and cleans
// up the temporary tree afterwards.
async function withIsolatedEnvironment(body) {
  const root = await mkdtemp(path.join(os.tmpdir(), "f019-env-"));
  const xdgDir = path.join(root, "xdg");
  const pathDir = path.join(root, "bin");
  await mkdir(xdgDir, { recursive: true });
  await mkdir(pathDir, { recursive: true });
  try {
    return await body({ root, xdgDir, pathDir });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// withStubInterpreter writes a shell script that answers the first worker request with
// record, drains stdin, and exits with exitCode; body receives the script path.
async function withStubInterpreter(record, exitCode, body) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "f019-python-stub-"));
  try {
    const stub = path.join(directory, "python");
    await writeWorkerStub(stub, record, exitCode);
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

// writeBaseProvisionStub writes a base interpreter stub on pathDir that reports baseVersion
// to the stdlib base probe and populates staging via Node when `-m venv` is invoked.
async function writeBaseProvisionStub(root, pathDir, name, { baseVersion, stagedRecord }) {
  const makerPath = path.join(root, "make-staged.mjs");
  const stagedResponse = JSON.stringify({ ok: true, result: stagedRecord });
  const stagedBody = [
    "#!/bin/sh",
    "if [ \"$1\" = \"-m\" ] && [ \"$2\" = \"pip\" ]; then exit 0; fi",
    "IFS= read -r _",
    `printf '%s\\n' '${stagedResponse}'`,
    "while IFS= read -r _; do :; done",
    "exit 0",
    "",
  ].join("\n");
  const makerSource = [
    "import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';",
    "import path from 'node:path';",
    "const binDir = path.join(process.argv[2], 'bin');",
    "mkdirSync(binDir, { recursive: true });",
    "const py = path.join(binDir, 'python');",
    `writeFileSync(py, ${JSON.stringify(stagedBody)});`,
    "chmodSync(py, 0o755);",
    "",
  ].join("\n");
  await writeFile(makerPath, makerSource);
  const baseInfo = JSON.stringify({
    python_implementation: "CPython",
    python_version: baseVersion,
  });
  const stub = path.join(pathDir, name);
  const script = [
    "#!/bin/sh",
    "if [ \"$1\" = \"-B\" ] && [ \"$2\" = \"-c\" ]; then",
    `  printf '%s\\n' '${baseInfo}'`,
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"-m\" ] && [ \"$2\" = \"venv\" ]; then",
    `  exec "${process.execPath}" "${makerPath}" "$3"`,
    "fi",
    "exit 1",
    "",
  ].join("\n");
  await writeFile(stub, script);
  await chmod(stub, 0o755);
  return stub;
}

test("unset or empty interpreter override resolves cached venv, matching PATH python, then bare python", posixStubOnly, async () => {
  const lock = await readLock();
  const locked = lockedRecord(lock);
  const versioned = versionedName(lock);
  await withIsolatedEnvironment(async ({ xdgDir, pathDir }) => {
    const env = { XDG_CACHE_HOME: xdgDir, PATH: pathDir };
    assert.equal(fixture019PythonCommand(env), "python");
    assert.equal(fixture019PythonCommand({ ...env, [FIXTURE_019_PYTHON_VARIABLE]: "" }), "python");

    await writeWorkerStub(path.join(pathDir, versioned), { ...locked, numpy_version: "2.5.3" });
    assert.equal(fixture019PythonCommand(env), "python");

    await writeWorkerStub(path.join(pathDir, versioned), locked);
    assert.equal(fixture019PythonCommand(env), versioned);

    const venvBin = await writeCachedVenvStub(xdgDir, lock.python_version, locked);
    assert.equal(fixture019PythonCommand(env), venvBin);
    assert.equal(fixture019PythonCommand({ ...env, [FIXTURE_019_PYTHON_VARIABLE]: "" }), venvBin);
  });
});

test("relative or empty XDG_CACHE_HOME is ignored during interpreter resolution", posixStubOnly, async () => {
  const lock = await readLock();
  await withIsolatedEnvironment(async ({ xdgDir, pathDir }) => {
    const relStubBin = await writeCachedVenvStub(xdgDir, lock.python_version, lockedRecord(lock));
    const relXdg = `${"../".repeat(20)}${xdgDir.slice(1)}`;
    assert.equal(path.isAbsolute(relXdg), false);
    const baseline = fixture019PythonCommand({ PATH: pathDir });
    const withRelative = fixture019PythonCommand({ XDG_CACHE_HOME: relXdg, PATH: pathDir });
    const withEmpty = fixture019PythonCommand({ XDG_CACHE_HOME: "", PATH: pathDir });
    assert.equal(withRelative, baseline);
    assert.equal(withEmpty, baseline);
    assert.notEqual(withRelative, relStubBin);
    assert.notEqual(withRelative, path.join(relXdg, "fixture-019-python", `venv-${lock.python_version}`, "bin", "python"));
  });
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

test("a configured interpreter that reports another runtime is refused", posixStubOnly, async () => {
  const lock = await readLock();
  await withStubInterpreter({ ...lockedRecord(lock), python_version: "3.14.9" }, 0, (stub) => {
    assert.throws(
      () => verifiedFixture019Python({ [FIXTURE_019_PYTHON_VARIABLE]: stub }),
      (error) => error.message.startsWith(runtimeDiffers(stub)),
    );
  });
});

test("a cached verification does not cover another environment", posixStubOnly, async () => {
  const lock = await readLock();
  const locked = lockedRecord(lock);
  const directory = await mkdtemp(path.join(os.tmpdir(), "f019-python-stub-"));
  try {
    const stub = path.join(directory, "python");
    const pythonPath = path.join(directory, "site-packages");
    await mkdir(pythonPath);
    await writePythonPathStub(stub, locked, { ...locked, python_version: "3.14.9" });
    assert.equal(verifiedFixture019Python({ [FIXTURE_019_PYTHON_VARIABLE]: stub }), stub);
    assert.equal(verifiedFixture019Python({ [FIXTURE_019_PYTHON_VARIABLE]: stub, PYTHONPATH: "" }), stub);
    assert.throws(
      () => verifiedFixture019Python({ [FIXTURE_019_PYTHON_VARIABLE]: stub, PYTHONPATH: pythonPath }),
      (error) => error.message.startsWith(runtimeDiffers(stub)),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

test("a cached venv is refused when micro version, numpy version, or implementation differs from the lock", posixStubOnly, async () => {
  const lock = await readLock();
  const locked = lockedRecord(lock);
  const cases = [
    { ...locked, python_version: "3.15.1" },
    { ...locked, numpy_version: "2.5.3" },
    { ...locked, python_implementation: "PyPy" },
  ];
  for (const mismatched of cases) {
    await withIsolatedEnvironment(async ({ xdgDir, pathDir }) => {
      const venvBin = await writeCachedVenvStub(xdgDir, lock.python_version, mismatched);
      const resolved = fixture019PythonCommand({ XDG_CACHE_HOME: xdgDir, PATH: pathDir });
      assert.equal(resolved, "python");
      assert.notEqual(resolved, venvBin);
    });
  }
});

test("a cached venv is refused when venvDir or cache root is a symbolic link to a matching venv", posixStubOnly, async () => {
  const lock = await readLock();
  const locked = lockedRecord(lock);
  await withIsolatedEnvironment(async ({ root, xdgDir, pathDir }) => {
    const targetRoot = path.join(root, "real-xdg");
    await writeCachedVenvStub(targetRoot, lock.python_version, locked);
    const cacheRoot = path.join(xdgDir, "fixture-019-python");
    await mkdir(cacheRoot, { recursive: true });
    await symlink(
      path.join(targetRoot, "fixture-019-python", `venv-${lock.python_version}`),
      path.join(cacheRoot, `venv-${lock.python_version}`),
    );
    assert.equal(fixture019PythonCommand({ XDG_CACHE_HOME: xdgDir, PATH: pathDir }), "python");

    const xdgLinkRoot = path.join(root, "xdg-link-root");
    await mkdir(xdgLinkRoot, { recursive: true });
    await symlink(path.join(targetRoot, "fixture-019-python"), path.join(xdgLinkRoot, "fixture-019-python"));
    assert.equal(fixture019PythonCommand({ XDG_CACHE_HOME: xdgLinkRoot, PATH: pathDir }), "python");
  });
});

test("fixture019PythonCommand kills a SIGTERM-ignoring cached venv stub within 15 seconds", { ...posixStubOnly, timeout: 15_000 }, async () => {
  const lock = await readLock();
  const sleepBin = execFileSync("sh", ["-c", "command -v sleep"], { encoding: "utf8", timeout: 5_000 }).trim();
  await withIsolatedEnvironment(async ({ xdgDir, pathDir }) => {
    const binDir = path.join(xdgDir, "fixture-019-python", `venv-${lock.python_version}`, "bin");
    await mkdir(binDir, { recursive: true });
    const hungStub = path.join(binDir, "python");
    await writeFile(hungStub, `#!/bin/sh\ntrap '' TERM\nexec "${sleepBin}" 60\n`);
    await chmod(hungStub, 0o755);
    const started = performance.now();
    const resolved = fixture019PythonCommand({ XDG_CACHE_HOME: xdgDir, PATH: pathDir });
    const elapsedMs = performance.now() - started;
    assert.equal(resolved, "python");
    assert.notEqual(resolved, hungStub);
    assert.ok(elapsedMs < 15_000, `expected timeout recovery under 15000 ms, took ${elapsedMs} ms`);
  });
});

test("provisionFixture019Python refuses a relative override and returns a matching PATH stub without creating a venv", posixStubOnly, async () => {
  const lock = await readLock();
  const versioned = versionedName(lock);
  assert.throws(
    () => provisionFixture019Python({ [FIXTURE_019_PYTHON_VARIABLE]: path.join("venv", "bin", "python") }),
    (error) => error instanceof Error
      && error.message.startsWith(`${FIXTURE_019_PYTHON_VARIABLE} must be an absolute interpreter path`),
  );
  await withIsolatedEnvironment(async ({ root, pathDir }) => {
    const uncreatedXdg = path.join(root, "never-created-xdg");
    await writeWorkerStub(path.join(pathDir, versioned), lockedRecord(lock));
    const resolved = provisionFixture019Python({ XDG_CACHE_HOME: uncreatedXdg, PATH: pathDir });
    assert.equal(resolved, versioned);
    assert.equal(existsSync(path.join(uncreatedXdg, "fixture-019-python", `venv-${lock.python_version}`)), false);
    assert.equal(existsSync(uncreatedXdg), false);
  });
});

test("provisionFixture019Python refuses a base stub reporting 3.15.1 without leaving venv or staging directories", posixStubOnly, async () => {
  const lock = await readLock();
  const versioned = versionedName(lock);
  await withIsolatedEnvironment(async ({ root, xdgDir, pathDir }) => {
    await writeBaseProvisionStub(root, pathDir, versioned, {
      baseVersion: "3.15.1",
      stagedRecord: lockedRecord(lock),
    });
    assert.throws(
      () => provisionFixture019Python({ XDG_CACHE_HOME: xdgDir, PATH: pathDir }),
      (error) => error instanceof Error
        && error.message.includes("3.15.1")
        && error.message.includes(lock.python_version),
    );
    const cacheRoot = path.join(xdgDir, "fixture-019-python");
    const venvDir = path.join(cacheRoot, `venv-${lock.python_version}`);
    assert.equal(existsSync(venvDir), false);
    const entries = existsSync(cacheRoot) ? await readdir(cacheRoot) : [];
    assert.deepEqual(entries.filter((name) => name.includes(".staging-")), []);
  });
});

test("provisionFixture019Python removes failed staging without deleting venvDir and publishes valid staging atomically", posixStubOnly, async () => {
  const lock = await readLock();
  const locked = lockedRecord(lock);
  const versioned = versionedName(lock);
  await withIsolatedEnvironment(async ({ root, xdgDir, pathDir }) => {
    const cacheRoot = path.join(xdgDir, "fixture-019-python");
    const venvDir = path.join(cacheRoot, `venv-${lock.python_version}`);
    await mkdir(venvDir, { recursive: true });
    const markerPath = path.join(venvDir, "keep.txt");
    await writeFile(markerPath, "preserve-on-failed-staging");

    await writeBaseProvisionStub(root, pathDir, versioned, {
      baseVersion: lock.python_version,
      stagedRecord: { ...locked, numpy_version: "2.5.3" },
    });
    assert.throws(
      () => provisionFixture019Python({ XDG_CACHE_HOME: xdgDir, PATH: pathDir }),
      /staged venv failed locked runtime validation/u,
    );
    assert.equal(await readFile(markerPath, "utf8"), "preserve-on-failed-staging");
    assert.deepEqual(await readdir(cacheRoot), [`venv-${lock.python_version}`]);

    await writeBaseProvisionStub(root, pathDir, versioned, {
      baseVersion: lock.python_version,
      stagedRecord: locked,
    });
    const publishedBin = provisionFixture019Python({ XDG_CACHE_HOME: xdgDir, PATH: pathDir });
    assert.equal(publishedBin, path.join(venvDir, "bin", "python"));
    assert.equal(existsSync(markerPath), false);
    assert.deepEqual(await readdir(cacheRoot), [`venv-${lock.python_version}`]);
    assert.equal(fixture019PythonCommand({ XDG_CACHE_HOME: xdgDir, PATH: pathDir }), publishedBin);
  });
});

test("test-helpers does not provision at import or when TWENTYW_FIXTURE_019_PYTHON is set", posixStubOnly, async () => {
  const lock = await readLock();
  await withIsolatedEnvironment(async ({ root, xdgDir, pathDir }) => {
    const stub = path.join(root, "explicit-python");
    await writeWorkerStub(stub, lockedRecord(lock));
    const helperUrl = pathToFileURL(path.join(fixtureRoot, "test-helpers.mjs")).href;
    const script = `import { verifiedFixture019Python } from ${JSON.stringify(helperUrl)};\nprocess.stdout.write(verifiedFixture019Python(${JSON.stringify({ [FIXTURE_019_PYTHON_VARIABLE]: stub })}));\n`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: fixtureRoot,
      env: { XDG_CACHE_HOME: xdgDir, PATH: pathDir },
      encoding: "utf8",
      timeout: 15_000,
      killSignal: "SIGKILL",
      windowsHide: true,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, stub);
    assert.deepEqual(await readdir(xdgDir), []);
  });
});
