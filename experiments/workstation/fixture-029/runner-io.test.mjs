import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  exists,
  fileSha256,
  isInside,
  loadJson,
  parseRunnerOptions,
  resolveOutput,
  validateSeedDocument,
  writeJsonStable,
} from "./runner-io.mjs";

test("exists, loadJson, and fileSha256 inspect files accurately", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "runner-io-test-"));
  try {
    const filePath = path.join(directory, "sample.json");
    assert.equal(await exists(filePath), false);

    const payload = { test: true, count: 42 };
    const content = JSON.stringify(payload);
    await writeFile(filePath, content, "utf8");

    assert.equal(await exists(filePath), true);
    assert.deepEqual(await loadJson(filePath), payload);
    const expectedHash = createHash("sha256").update(content).digest("hex");
    assert.equal(await fileSha256(filePath), expectedHash);

    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(invalidPath, "not-valid-json", "utf8");
    await assert.rejects(() => loadJson(invalidPath), SyntaxError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("isInside and resolveOutput guard directory boundaries per label", async () => {
  const root = "/repo/root";
  assert.equal(isInside(root, "/repo/root/sub/dir"), true);
  assert.equal(isInside(root, "/repo/root"), true);
  assert.equal(isInside(root, "/repo/other"), false);
  assert.equal(isInside(root, "/outside"), false);

  assert.equal(
    resolveOutput(root, "experiments/workstation/out", "CMB-X01"),
    "/repo/root/experiments/workstation/out",
  );

  // Boundary: path exactly at root
  assert.throws(
    () => resolveOutput(root, ".", "CMB-X01"),
    /CMB-X01 output must stay inside the repository\./,
  );
  assert.throws(
    () => resolveOutput(root, ".", "Fixture 029 suite"),
    /Fixture 029 suite output must stay inside the repository\./,
  );
  assert.throws(
    () => resolveOutput(root, ".", "Fixture 029"),
    /Fixture 029 output must stay inside the repository\./,
  );

  // Boundary: path outside root
  assert.throws(
    () => resolveOutput(root, "../outside", "CMB-X01"),
    /CMB-X01 output must stay inside the repository\./,
  );
  assert.throws(
    () => resolveOutput(root, "../outside", "Fixture 029 suite"),
    /Fixture 029 suite output must stay inside the repository\./,
  );
  assert.throws(
    () => resolveOutput(root, "../outside", "Fixture 029"),
    /Fixture 029 output must stay inside the repository\./,
  );
});

test("writeJsonStable writes stable json and refuses divergent overwrite", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "runner-io-write-"));
  try {
    const file = path.join(directory, "stable.json");
    const dataA = { b: 2, a: 1 };
    await writeJsonStable(file, dataA);

    // Idempotent rewrite with same keys/values in different object order
    const dataIdentical = { a: 1, b: 2 };
    await assert.doesNotReject(() => writeJsonStable(file, dataIdentical));

    // Refuse divergent rewrite
    const divergent = { a: 1, b: 99 };
    await assert.rejects(
      () => writeJsonStable(file, divergent),
      /Refusing to replace non-identical stable\.json\./,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("validateSeedDocument validates schema, partition, and uint32 seeds per message", () => {
  const validDoc = {
    schema: 1,
    artifact: "fixture-029",
    partition: "development",
    state: "public-development",
    algorithm: "literal-public-seed-list-v1",
    encoding: "unsigned-little-endian-uint32",
    seeds: [100, 200, 300],
  };
  assert.equal(validateSeedDocument(validDoc), validDoc);

  const cmbMsg = "CMB-X01 public development seed document is invalid.";
  const suiteMsg = "Fixture 029 suite shared seed document is invalid.";
  const f29Msg = "Fixture 029 public development seed document is invalid.";

  for (const msg of [cmbMsg, suiteMsg, f29Msg]) {
    assert.throws(() => validateSeedDocument(null, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, schema: 2 }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, artifact: "other" }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, partition: "test" }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, state: "draft" }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, algorithm: "custom" }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, encoding: "utf8" }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, seeds: [42] }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, seeds: [-1, 200] }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, seeds: [0x1_0000_0000, 200] }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, seeds: [1.5, 200] }, msg), new RegExp(msg));
    assert.throws(() => validateSeedDocument({ ...validDoc, seeds: [100, 100] }, msg), new RegExp(msg));
  }
});

test("parseRunnerOptions parses valid invocations across runner actions", () => {
  assert.deepEqual(
    parseRunnerOptions(["node", "cmb.mjs", "prepare", "--profile", "smoke"], { label: "CMB-X01" }),
    { action: "prepare", options: { profile: "smoke" } },
  );
  assert.deepEqual(
    parseRunnerOptions(["node", "cmb.mjs", "prepare", "--profile", "development"], { label: "CMB-X01" }),
    { action: "prepare", options: { profile: "development" } },
  );
  assert.deepEqual(
    parseRunnerOptions(
      ["node", "cmb.mjs", "smoke", "--profile", "smoke", "--output", "out/smoke"],
      { label: "CMB-X01" },
    ),
    { action: "smoke", options: { profile: "smoke", output: "out/smoke" } },
  );
  assert.deepEqual(
    parseRunnerOptions(
      ["node", "cmb.mjs", "run", "--profile", "development", "--output", "out/run", "--resume", "true"],
      { label: "CMB-X01" },
    ),
    { action: "run", options: { profile: "development", output: "out/run", resume: "true" } },
  );
  assert.deepEqual(
    parseRunnerOptions(["node", "cmb.mjs", "analyze", "--output", "out/run"], { label: "CMB-X01" }),
    { action: "analyze", options: { output: "out/run" } },
  );
  assert.deepEqual(
    parseRunnerOptions(["node", "cmb.mjs", "validate", "--output", "out/run"], { label: "CMB-X01" }),
    { action: "validate", options: { output: "out/run" } },
  );
});

test("parseRunnerOptions rejects invalid actions and options with exact messages per label", () => {
  const labels = ["CMB-X01", "Fixture 029 suite"];
  for (const label of labels) {
    assert.throws(
      () => parseRunnerOptions(["node", "run.mjs", "unknown"], { label }),
      new RegExp(`${label} action must be prepare, smoke, run, analyze, or validate\\.`),
    );
    assert.throws(
      () => parseRunnerOptions(["node", "run.mjs", "smoke", "--profile", "smoke", "--bad"], { label }),
      /Options require explicit --name value pairs\./,
    );
    assert.throws(
      () => parseRunnerOptions(["node", "run.mjs", "smoke", "invalid", "value"], { label }),
      new RegExp(`Invalid ${label} option pair\\.`),
    );
    assert.throws(
      () => parseRunnerOptions(["node", "run.mjs", "smoke", "--profile", "--output"], { label }),
      new RegExp(`Invalid ${label} option pair\\.`),
    );
    assert.throws(
      () => parseRunnerOptions(["node", "run.mjs", "smoke", "--unknown", "value"], { label }),
      new RegExp(`Unknown or duplicate ${label} option --unknown\\.`),
    );
    assert.throws(
      () => parseRunnerOptions(
        ["node", "run.mjs", "smoke", "--profile", "smoke", "--profile", "development"],
        { label },
      ),
      new RegExp(`Unknown or duplicate ${label} option --profile\\.`),
    );
  }

  // Custom actionErrorMessage and invalidPairErrorMessage as used by runner.mjs
  assert.throws(
    () => parseRunnerOptions(["node", "runner.mjs", "custom"], {
      label: "Fixture 029",
      actionErrorMessage: "Fixture 029 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable.",
      invalidPairErrorMessage: "Invalid option pair.",
    }),
    /Fixture 029 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable\./,
  );
  assert.throws(
    () => parseRunnerOptions(["node", "runner.mjs", "smoke", "bad-pair", "val"], {
      label: "Fixture 029",
      actionErrorMessage: "Fixture 029 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable.",
      invalidPairErrorMessage: "Invalid option pair.",
    }),
    /Invalid option pair\./,
  );
});

test("parseRunnerOptions enforces action-specific constraint rules", () => {
  // prepare/smoke/run require --profile
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "prepare"], { label: "CMB-X01" }),
    /prepare requires --profile\./,
  );
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "smoke", "--output", "out"], { label: "CMB-X01" }),
    /smoke requires --profile\./,
  );
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "run", "--output", "out"], { label: "CMB-X01" }),
    /run requires --profile\./,
  );

  // analyze/validate do not accept profile or resume
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "analyze", "--profile", "smoke", "--output", "out"], { label: "CMB-X01" }),
    /analyze does not accept profile or resume\./,
  );
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "validate", "--resume", "true", "--output", "out"], { label: "CMB-X01" }),
    /validate does not accept profile or resume\./,
  );

  // smoke requires profile smoke
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "smoke", "--profile", "development", "--output", "out"], { label: "CMB-X01" }),
    /smoke requires --profile smoke\./,
  );

  // run requires profile development
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "run", "--profile", "smoke", "--output", "out"], { label: "CMB-X01" }),
    /run requires --profile development\./,
  );

  // prepare does not accept output or resume
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "prepare", "--profile", "smoke", "--output", "out"], { label: "CMB-X01" }),
    /prepare does not accept output or resume\./,
  );
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "prepare", "--profile", "smoke", "--resume", "true"], { label: "CMB-X01" }),
    /prepare does not accept output or resume\./,
  );

  // action !== "prepare" requires --output
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "smoke", "--profile", "smoke"], { label: "CMB-X01" }),
    /smoke requires --output\./,
  );
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "run", "--profile", "development"], { label: "CMB-X01" }),
    /run requires --output\./,
  );
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "analyze"], { label: "CMB-X01" }),
    /analyze requires --output\./,
  );
  assert.throws(
    () => parseRunnerOptions(["node", "run.mjs", "validate"], { label: "CMB-X01" }),
    /validate requires --output\./,
  );

  // resume value must be true or false
  assert.throws(
    () => parseRunnerOptions(
      ["node", "run.mjs", "run", "--profile", "development", "--output", "out", "--resume", "maybe"],
      { label: "CMB-X01" },
    ),
    /--resume must be true or false\./,
  );
});
