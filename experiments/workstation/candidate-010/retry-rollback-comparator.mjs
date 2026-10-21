import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { readStableOpenedFile } from "./opened-file.mjs";
import { canonicalJson } from "../lib/canonical-json.mjs";

export const RETRY_ROLLBACK_IMPLEMENTATION_ID = "candidate-010-two-lifecycle-retry-rollback-v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  return canonicalJson(value, { strict: false, label: "Retry/rollback" });
}

function finite(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Retry/rollback ${field} must be a non-negative finite number.`);
  return value;
}

export async function observeFilesystemSnapshot(root, maximumEntries = 10000) {
  const entries = [];
  const stack = [{ type: "explore_dir", directory: root, relativeDirectory: "" }];
  // Each entry is checked once and each directory explored once, so the walk
  // takes at most 2 * maximumEntries + 1 steps before the entry limit trips.
  for (let steps = 0; stack.length > 0 && steps <= 2 * maximumEntries + 1; steps += 1) {
    if (entries.length > maximumEntries) {
      throw new RangeError(`Retry/rollback snapshot exceeded maximum entries limit of ${maximumEntries}.`);
    }
    const item = stack.pop();
    if (item.type === "explore_dir") {
      const names = (await readdir(item.directory)).sort();
      for (let i = names.length - 1; i >= 0; i--) {
        const name = names[i];
        const absolute = path.join(item.directory, name);
        const relative = path.posix.join(item.relativeDirectory, name);
        stack.push({ type: "check_entry", absolute, relative });
      }
    } else if (item.type === "check_entry") {
      const information = await lstat(item.absolute);
      if (information.isSymbolicLink()) throw new Error("Retry/rollback snapshot refuses symbolic links.");
      if (information.isDirectory()) {
        entries.push({ path: item.relative, type: "directory" });
        stack.push({ type: "explore_dir", directory: item.absolute, relativeDirectory: item.relative });
      } else if (information.isFile()) {
        const body = await readStableOpenedFile(item.absolute, {
          label: `retry/rollback snapshot file ${item.relative}`,
          containedBy: root,
        });
        entries.push({ path: item.relative, type: "file", bytes: body.length, sha256: sha256(body) });
      } else {
        throw new Error(`Retry/rollback snapshot refuses unsupported entry: ${item.relative}`);
      }
    }
  }
  if (stack.length > 0 || entries.length > maximumEntries) {
    throw new RangeError(`Retry/rollback snapshot exceeded maximum entries limit of ${maximumEntries}.`);
  }
  const body = { schema: 1, entries };
  return Object.freeze({
    ...body,
    files: entries.filter((entry) => entry.type === "file").length,
    directories: entries.filter((entry) => entry.type === "directory").length,
    bytes: entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
    snapshot_sha256: sha256(canonical(body)),
  });
}

function validateFilesystemSnapshot(snapshot) {
  if (snapshot?.schema !== 1 || !Array.isArray(snapshot.entries)) return false;
  const paths = snapshot.entries.map((entry) => entry.path);
  if (
    paths.length !== new Set(paths).size
    || paths.some((entry) => (
      typeof entry !== "string"
      || entry === ""
      || entry.startsWith("/")
      || entry.startsWith("../")
      || entry.includes("/../")
      || entry.includes("\\")
    ))
  ) return false;
  if (snapshot.snapshot_sha256 !== sha256(canonical({ schema: 1, entries: snapshot.entries }))) return false;
  const files = snapshot.entries.filter((entry) => entry.type === "file");
  const directories = snapshot.entries.filter((entry) => entry.type === "directory");
  return files.every((entry) => Number.isInteger(entry.bytes) && entry.bytes >= 0 && /^[0-9a-f]{64}$/.test(entry.sha256 ?? ""))
    && snapshot.entries.length === files.length + directories.length
    && snapshot.files === files.length
    && snapshot.directories === directories.length
    && snapshot.bytes === files.reduce((sum, entry) => sum + entry.bytes, 0);
}

function attemptSummary(result, filesystemSnapshot, { index, attemptRole, taskFamily, backendId, opportunityId }) {
  const summary = {
    index,
    attempt_role: attemptRole,
    boundary_id: sha256(canonical({
      schema: 1,
      attempt_role: attemptRole,
      task_family: taskFamily,
      backend_id: backendId,
      opportunity_id: opportunityId,
    })),
    staged_bytes_written: finite(result.filesystem?.staged_bytes_written, "staged bytes"),
    durable_bytes_written: finite(result.filesystem?.durable_bytes_written, "durable bytes"),
    boundary_elapsed_ms: finite(result.filesystem?.boundary_elapsed_ms, "boundary time"),
    stage: result.decision?.stage,
    commit: result.decision?.commit,
    reset: result.decision?.reset,
    rollback_complete: result.filesystem?.rollbackComplete,
    commit_complete: result.filesystem?.commitComplete,
    stage_exists: result.filesystem?.stageExists,
    durable_exists: result.filesystem?.durableExists,
    irreversible_violation: result.filesystem?.irreversible_violation === true,
    trace_output_sha256: result.filesystem?.trace_output_sha256,
    filesystem_snapshot: filesystemSnapshot,
  };
  return {
    ...summary,
    state_evidence_sha256: sha256(canonical(summary)),
  };
}

function validateAttemptEvidence(attempt) {
  const { state_evidence_sha256: supplied, ...summary } = attempt;
  return /^[0-9a-f]{64}$/.test(attempt.boundary_id ?? "")
    && supplied === sha256(canonical(summary));
}

function logicalBoundaryId(ownership, attemptRole) {
  return sha256(canonical({
    schema: 1,
    attempt_role: attemptRole,
    task_family: ownership.task_family,
    backend_id: ownership.backend_id,
    opportunity_id: ownership.opportunity_id,
  }));
}

function validateLineageAndOwnership(lineage, expectedOwnership) {
  if (
    lineage?.schema !== 1
    || lineage.comparator !== "retry-rollback"
    || lineage.implementation_id !== RETRY_ROLLBACK_IMPLEMENTATION_ID
    || lineage.first_action_executed !== true
    || lineage.first_rollback_validated !== true
    || lineage.retry_action_executed !== true
    || lineage.state_isolated !== true
    || !Array.isArray(lineage.attempts)
    || lineage.attempts.length !== 2
  ) throw new Error("Retry/rollback skipped a required lifecycle action.");
  const ownership = lineage.ownership;
  if (
    !ownership
    || typeof ownership.task_family !== "string"
    || typeof ownership.backend_id !== "string"
    || typeof ownership.opportunity_id !== "string"
    || (expectedOwnership && Object.entries(expectedOwnership).some(([key, value]) => ownership[key] !== value))
  ) throw new Error("Retry/rollback lineage ownership is absent or mismatched.");
  return ownership;
}

function validateFirstAttempt(first, second, ownership, observedSnapshots) {
  if (
    first.attempt_role !== "first-action"
    || second.attempt_role !== "retry-action"
    || first.boundary_id !== logicalBoundaryId(ownership, "first-action")
    || second.boundary_id !== logicalBoundaryId(ownership, "retry-action")
    || !validateAttemptEvidence(first)
    || !validateAttemptEvidence(second)
    || !validateFilesystemSnapshot(first.filesystem_snapshot)
    || !validateFilesystemSnapshot(second.filesystem_snapshot)
    || (observedSnapshots && canonical(first.filesystem_snapshot) !== canonical(observedSnapshots[0]))
    || (observedSnapshots && canonical(second.filesystem_snapshot) !== canonical(observedSnapshots[1]))
    || first.stage !== true
    || first.commit !== false
    || first.reset !== true
    || first.rollback_complete !== true
    || first.commit_complete !== false
    || first.stage_exists !== false
    || first.durable_exists !== false
    || first.durable_bytes_written !== 0
    || first.irreversible_violation !== false
    || first.trace_output_sha256 !== second.trace_output_sha256
  ) throw new Error("Retry/rollback first action leaked state or did not complete rollback.");
}

function validateSecondAttempt(second, result) {
  if (
    second.stage !== true
    || second.commit === second.reset
    || second.commit !== result.decision?.commit
    || second.reset !== result.decision?.reset
    || second.rollback_complete !== result.filesystem?.rollbackComplete
    || second.commit_complete !== result.filesystem?.commitComplete
    || second.stage_exists !== result.filesystem?.stageExists
    || second.durable_exists !== result.filesystem?.durableExists
    || second.irreversible_violation !== (result.filesystem?.irreversible_violation === true)
    || second.trace_output_sha256 !== result.filesystem?.trace_output_sha256
    || second.stage_exists !== false
    || second.irreversible_violation !== false
    || (second.commit && (
      second.commit_complete !== true
      || second.rollback_complete !== false
      || second.durable_exists !== true
    ))
    || (second.reset && (
      second.rollback_complete !== true
      || second.commit_complete !== false
      || second.durable_exists !== false
      || second.durable_bytes_written !== 0
    ))
  ) throw new Error("Retry/rollback retry action lifecycle evidence is inconsistent.");
}

export function validateRetryRollbackResult(result, expectedOwnership = null, observedSnapshots = null) {
  const lineage = result?.comparator_lineage;
  const ownership = validateLineageAndOwnership(lineage, expectedOwnership);
  const [first, second] = lineage.attempts;
  validateFirstAttempt(first, second, ownership, observedSnapshots);
  validateSecondAttempt(second, result);
  const expectedStaged = first.staged_bytes_written + second.staged_bytes_written;
  const expectedBoundary = first.boundary_elapsed_ms + second.boundary_elapsed_ms;
  if (
    result.filesystem?.staged_bytes_written !== expectedStaged
    || result.filesystem?.durable_bytes_written !== second.durable_bytes_written
    || result.filesystem?.boundary_elapsed_ms !== expectedBoundary
    || result.policy_evaluations !== 2
    || lineage.actual_lifecycle_count !== 2
    || lineage.state_transition_count !== 4
  ) throw new Error("Retry/rollback did not pay or report all lifecycle work.");
  if (
    result.decision?.stage !== true
    || result.decision?.commit === result.decision?.reset
    || (result.decision.commit && result.filesystem.commitComplete !== true)
    || (result.decision.reset && result.filesystem.rollbackComplete !== true)
  ) throw new Error("Retry/rollback second lifecycle did not finalize exactly once.");
  return true;
}

async function executeFirstActionTrial({ executeTrial, firstRoot, taskFamily, backendId, opportunity, config }) {
  const first = await executeTrial({
    task_family: taskFamily,
    backend_id: backendId,
    root: firstRoot,
    opportunity,
    arm: "retry-rollback",
    config,
    revealTrace: false,
    decideWithTrace: () => ({
      arm: "retry-rollback",
      stage: true,
      commit: false,
      reset: true,
      abstain: false,
      observations: 1,
      verifier_calls: 0,
      reason: "mandatory-first-action-rollback",
    }),
  });
  const firstSnapshot = await observeFilesystemSnapshot(firstRoot);
  const firstSummary = attemptSummary(first, firstSnapshot, {
    index: 1,
    attemptRole: "first-action",
    taskFamily,
    backendId,
    opportunityId: opportunity.id,
  });
  if (
    firstSummary.stage !== true
    || firstSummary.commit !== false
    || firstSummary.reset !== true
    || firstSummary.rollback_complete !== true
    || firstSummary.stage_exists !== false
    || firstSummary.durable_exists !== false
    || firstSummary.irreversible_violation
  ) throw new Error("Retry/rollback first staged action did not roll back cleanly.");
  return { first, firstSnapshot, firstSummary };
}

function assembleRetryRollbackResult({ first, firstSummary, retry, retrySummary, config, taskFamily, backendId, opportunity }) {
  const comparatorLineage = Object.freeze({
    schema: 1,
    comparator: "retry-rollback",
    implementation_id: RETRY_ROLLBACK_IMPLEMENTATION_ID,
    first_action_executed: true,
    first_rollback_validated: true,
    retry_action_executed: true,
    state_isolated: firstSummary.boundary_id !== retrySummary.boundary_id,
    ownership: Object.freeze({
      task_family: taskFamily,
      backend_id: backendId,
      opportunity_id: opportunity.id,
    }),
    actual_lifecycle_count: 2,
    state_transition_count: 4,
    attempts: Object.freeze([Object.freeze(firstSummary), Object.freeze(retrySummary)]),
  });
  const filesystem = {
    ...retry.filesystem,
    boundary: "retry-rollback-two-lifecycle-v1",
    staged_bytes_written: firstSummary.staged_bytes_written + retrySummary.staged_bytes_written,
    durable_bytes_written: retrySummary.durable_bytes_written,
    boundary_elapsed_ms: firstSummary.boundary_elapsed_ms + retrySummary.boundary_elapsed_ms,
    retry_rollback_lifecycle: comparatorLineage,
  };
  const decision = {
    ...retry.decision,
    observations: first.decision.observations + retry.decision.observations,
    retry_lifecycle_count: 2,
    first_action_rolled_back: true,
  };
  const additionalModeledEnergyJ = ["temporary_execution", "stage", "reset"]
    .reduce((sum, field) => sum + finite(config.modeled_energy_j?.[field], `modeled ${field} energy`), 0);
  return {
    ...retry,
    decision,
    filesystem,
    policy_evaluations: 2,
    additional_modeled_energy_j: additionalModeledEnergyJ,
    comparator_lineage: comparatorLineage,
  };
}

export async function executeRetryRollbackComparatorTrial({
  executeTrial,
  root,
  task_family: taskFamily,
  backend_id: backendId,
  opportunity,
  config,
  decideRetry,
}) {
  if (typeof executeTrial !== "function" || typeof decideRetry !== "function") {
    throw new Error("Retry/rollback requires an executable backend and retry decision.");
  }
  const firstRoot = path.join(root, "first-action");
  const retryRoot = path.join(root, "retry-action");
  if (path.resolve(firstRoot) === path.resolve(retryRoot)) {
    throw new Error("Retry/rollback requires physically isolated lifecycle roots.");
  }
  const { first, firstSnapshot, firstSummary } = await executeFirstActionTrial({
    executeTrial, firstRoot, taskFamily, backendId, opportunity, config,
  });
  const retry = await executeTrial({
    task_family: taskFamily,
    backend_id: backendId,
    root: retryRoot,
    opportunity,
    arm: "retry-rollback",
    config,
    revealTrace: false,
    decideWithTrace: () => decideRetry(),
  });
  const retrySnapshot = await observeFilesystemSnapshot(retryRoot);
  const retrySummary = attemptSummary(retry, retrySnapshot, {
    index: 2,
    attemptRole: "retry-action",
    taskFamily,
    backendId,
    opportunityId: opportunity.id,
  });
  const result = assembleRetryRollbackResult({
    first, firstSummary, retry, retrySummary, config, taskFamily, backendId, opportunity,
  });
  validateRetryRollbackResult(result, {
    task_family: taskFamily,
    backend_id: backendId,
    opportunity_id: opportunity.id,
  }, [firstSnapshot, retrySnapshot]);
  return result;
}
