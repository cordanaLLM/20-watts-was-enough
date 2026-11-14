import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  executeSmokeSuite,
  loadSmokeSuitePlans,
  parseSmokeSuiteArguments,
} from "./smoke-suite.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("argument parser requires an explicit bounded selection and output for real runs", () => {
  assert.throws(() => parseSmokeSuiteArguments([]), /Choose --all/u);
  assert.throws(() => parseSmokeSuiteArguments(["--all"]), /requires --output-root/u);
  assert.throws(
    () => parseSmokeSuiteArguments(["--all", "--artifact", "fixture-027", "--dry-run"]),
    /either --all/u,
  );
  assert.deepEqual(parseSmokeSuiteArguments([
    "--artifact", "fixture-027", "--artifact", "fixture-027", "--dry-run",
  ]).artifacts, ["fixture-027"]);
});

test("all validated smoke manifests produce shell-free bounded plans", async () => {
  const outputRoot = path.join(os.tmpdir(), "smoke-suite-plan-test");
  const plans = await loadSmokeSuitePlans({ repositoryRoot, all: true, outputRoot });
  assert.equal(plans.length, 12);
  assert.deepEqual(plans.map((plan) => plan.artifact), [
    "candidate-010",
    "fixture-007",
    "fixture-012",
    "fixture-019",
    "fixture-020",
    "fixture-022",
    "fixture-023",
    "fixture-024",
    "fixture-025",
    "fixture-026",
    "fixture-027",
    "fixture-029",
  ]);
  for (const plan of plans) {
    assert.equal(plan.readiness, "smoke-ready");
    const entrypoint = plan.artifact === "fixture-029"
      ? "suite-runner.mjs"
      : "runner.mjs";
    for (const action of plan.actions) {
      assert.equal(action.executable, process.execPath);
      assert.equal(
        action.args[0],
        `experiments/workstation/${plan.artifact}/${entrypoint}`,
      );
      assert.ok(!action.args.some((value) => value.includes("<run-directory>")));
    }
  }
  assert.deepEqual(plans[0].actions.map((action) => action.action), ["prepare", "smoke"]);
  assert.deepEqual(plans.at(-1).actions.map((action) => action.action), [
    "prepare", "smoke", "analyze", "validate",
  ]);
  assert.equal(plans.at(-1).outputDirectory, path.join(outputRoot, "fixture-029"));
});

test("unknown and non-smoke-ready artifacts fail closed", async () => {
  await assert.rejects(
    loadSmokeSuitePlans({ repositoryRoot, artifacts: ["fixture-028"] }),
    /Unknown or non-smoke-ready artifact: fixture-028/u,
  );
});

test("suite receipts preserve failure and NO_RESULT authority while continuing", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "smoke-suite-receipt-"));
  try {
    const plans = await loadSmokeSuitePlans({
      repositoryRoot,
      artifacts: ["candidate-010", "fixture-027"],
      outputRoot,
    });
    const calls = [];
    const outcome = await executeSmokeSuite({
      plans,
      outputRoot,
      runAction: async (action) => {
        calls.push(action.action);
        return { exitCode: action.action === "smoke" && calls.length === 2 ? 9 : 0, signal: null };
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.receipt.status, "failed");
    assert.match(outcome.receipt.authority, /NO_RESULT/u);
    assert.deepEqual(Object.keys(outcome.receipt.runtime).sort(), [
      "architecture", "node", "platform",
    ]);
    assert.equal(outcome.receipt.results[0].status, "failed");
    assert.equal(outcome.receipt.results[1].status, "passed");
    assert.deepEqual(calls, ["prepare", "smoke", "prepare", "smoke", "analyze", "validate"]);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
