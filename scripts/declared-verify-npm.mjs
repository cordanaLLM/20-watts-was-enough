#!/usr/bin/env node
// Runs one npm script for `make verify-all`. Inside the Praetor gate's
// declared-verify stage the isolated worktree holds no git-ignored
// `node_modules`, so every npm step fails there (cordanaLLM/praetor#1385).
// Until the engine fix lands, the step is skipped only when the stage sets
// PRAETOR_GATE_DECLARED_VERIFY and `node_modules` is absent, and it says so.
// Outside the stage, or with dependencies installed, the npm script runs
// unchanged. From the day after `expires` the skip fails instead.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DECLARED_VERIFY_EXCEPTION = Object.freeze({
  category: "B",
  expires: "2026-10-25",
  issue: "cordanaLLM/praetor#1385",
  path: "Makefile",
  reason:
    "the declared-verify gate stage runs make verify-all in a worktree without node_modules; category B renewal while cordanaLLM/praetor#1385 stays open; removed in the engine pin bump that carries the fix",
  rule: "declared-verify-deps",
});

const STAGE_ENV = "PRAETOR_GATE_DECLARED_VERIFY";
// Upper bound for one npm step; the full `npm run check` chain takes well under it.
const STEP_TIMEOUT_MS = 3 * 60 * 60 * 1000;

// Returns "run", "skip" or "expired" for one npm step.
export function declaredVerifyAction({ env, hasNodeModules, today, exception = DECLARED_VERIFY_EXCEPTION }) {
  if (!env[STAGE_ENV] || hasNodeModules) return "run";
  return today > exception.expires ? "expired" : "skip";
}

function main(argv) {
  if (argv.length === 0) {
    process.stderr.write("usage: declared-verify-npm.mjs <npm script> [args...]\n");
    return 2;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const today = new Date().toISOString().slice(0, 10);
  const action = declaredVerifyAction({
    env: process.env,
    hasNodeModules: existsSync(path.join(root, "node_modules")),
    today,
  });
  const step = `npm run ${argv.join(" ")}`;
  const { expires, issue } = DECLARED_VERIFY_EXCEPTION;
  if (action === "skip") {
    process.stdout.write(`SKIPPED ${step}: declared-verify stage worktree has no node_modules (${issue}); exception expires ${expires}\n`);
    return 0;
  }
  if (action === "expired") {
    process.stderr.write(`${step}: the declared-verify exception for ${issue} expired on ${expires}; land the engine fix or renew the exception\n`);
    return 1;
  }
  const result = spawnSync("npm", ["run", ...argv], { cwd: root, stdio: "inherit", timeout: STEP_TIMEOUT_MS });
  if (result.error) throw new Error(`${step} could not start`, { cause: result.error });
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
