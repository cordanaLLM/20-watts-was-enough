import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCurrentExperimentExecutionIdentity,
  assertExperimentExecutionReceipt,
  createExperimentExecutionReceipt,
} from "./execution-receipt.mjs";

const runtime = Object.freeze({ version: "v26.12.0", platform: "linux", arch: "x64" });
const releaseEnvironment = Object.freeze({
  EXPERIMENT_ARTIFACT: "fixture-007",
  EXPERIMENT_IMAGE_NAME: "ghcr.io/cordanallm/20-watts-was-enough-fixture-007",
  EXPERIMENT_IMAGE_VERSION: "v1.2.3",
  EXPERIMENT_SOURCE_REVISION: "a".repeat(40),
  EXPERIMENT_RESULT_AUTHORITY: "NO_RESULT",
  EXPERIMENT_IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
});

function receipt(environment = {}) {
  return createExperimentExecutionReceipt({
    artifact: "fixture-007",
    command: "smoke",
    profile: "smoke",
    environment,
    runtime,
  });
}

test("source execution records typed local states", () => {
  const actual = receipt();
  assert.equal(actual.execution_mode, "source");
  assert.deepEqual(actual.image.digest, { state: "unavailable-local", value: null });
  assert.deepEqual(actual.source_revision, { state: "local-worktree", value: null });
  assert.deepEqual(actual.runtime, { node: "v26.12.0", os: "linux", architecture: "x64" });
  assert.equal(assertExperimentExecutionReceipt(actual, {
    artifact: "fixture-007",
    profile: "smoke",
  }), actual);
});

test("development image records a typed unavailable digest", () => {
  const actual = receipt({
    ...releaseEnvironment,
    EXPERIMENT_IMAGE_VERSION: "development",
    EXPERIMENT_SOURCE_REVISION: "unknown",
    EXPERIMENT_IMAGE_DIGEST: undefined,
  });
  assert.equal(actual.execution_mode, "development-image");
  assert.deepEqual(actual.image.digest, { state: "unavailable-development", value: null });
  assert.deepEqual(actual.source_revision, { state: "unavailable-development", value: null });
});

test("release image records the caller-supplied exact digest", () => {
  const actual = receipt(releaseEnvironment);
  assert.equal(actual.execution_mode, "release-image");
  assert.deepEqual(actual.image.name, {
    state: "declared",
    value: "ghcr.io/cordanallm/20-watts-was-enough-fixture-007",
  });
  assert.deepEqual(actual.image.digest, {
    state: "explicit",
    value: `sha256:${"b".repeat(64)}`,
  });
  assert.equal(actual.command, "smoke");
  assert.equal(actual.profile, "smoke");
  assert.equal(actual.result_authority, "NO_RESULT");
});

test("image versions accept canonical candidates and retain development and final forms", () => {
  for (const version of ["v0.5.0-rc.1", "v1.2.3-rc.0", "1.2.3-rc.10", "development", "v1.2.3", "1.2.3"]) {
    const actual = receipt({ ...releaseEnvironment, EXPERIMENT_IMAGE_VERSION: version });
    assert.equal(actual.image.version.value, version);
    assert.equal(actual.execution_mode, version === "development" ? "development-image" : "release-image");
    assert.equal(assertExperimentExecutionReceipt(actual), actual);
  }
});

test("image versions reject malformed candidates in environment and stored receipts", () => {
  for (const version of ["v1.2.3-rc.01", "v1.2.3-rc", "v1.2.3-beta.1", "v1.2.3-rc.1+x", "v1.2.3-rc.-1", "v01.2.3-rc.1"]) {
    assert.throws(
      () => receipt({ ...releaseEnvironment, EXPERIMENT_IMAGE_VERSION: version }),
      /image version is invalid/u,
      version,
    );
    const stored = structuredClone(receipt(releaseEnvironment));
    stored.image.version.value = version;
    assert.throws(() => assertExperimentExecutionReceipt(stored), /closed contract/u, version);
    const local = structuredClone(receipt());
    local.image.version.value = version;
    assert.throws(() => assertExperimentExecutionReceipt(local), /closed contract/u, version);
  }
  const local = structuredClone(receipt());
  local.image.version.value = "v0.5.0-rc.1";
  assert.equal(assertExperimentExecutionReceipt(local), local);
});

test("release image fails closed without exact digest and source revision", () => {
  const withoutDigest = { ...releaseEnvironment };
  delete withoutDigest.EXPERIMENT_IMAGE_DIGEST;
  assert.throws(() => receipt(withoutDigest), /requires EXPERIMENT_IMAGE_DIGEST/u);
  assert.throws(
    () => receipt({ ...releaseEnvironment, EXPERIMENT_IMAGE_DIGEST: "sha256:not-a-digest" }),
    /exact sha256 digest/u,
  );
  assert.throws(
    () => receipt({ ...releaseEnvironment, EXPERIMENT_SOURCE_REVISION: "unknown" }),
    /exact source revision/u,
  );
});

test("partial image metadata and mutable authority are rejected", () => {
  assert.throws(
    () => receipt({ EXPERIMENT_IMAGE_NAME: releaseEnvironment.EXPERIMENT_IMAGE_NAME }),
    /metadata is incomplete/u,
  );
  assert.throws(
    () => receipt({ ...releaseEnvironment, EXPERIMENT_RESULT_AUTHORITY: "RESULT" }),
    /must remain NO_RESULT/u,
  );
});

test("stored receipts reject execution modes inconsistent with their typed fields", () => {
  const inconsistent = structuredClone(receipt(releaseEnvironment));
  inconsistent.execution_mode = "source";
  assert.throws(
    () => assertExperimentExecutionReceipt(inconsistent),
    /closed contract/u,
  );
});

test("analysis actions require the exact stored execution identity", () => {
  const stored = receipt(releaseEnvironment);
  assert.equal(assertCurrentExperimentExecutionIdentity(stored, {
    artifact: "fixture-007",
    environment: releaseEnvironment,
    runtime,
  }), stored);
  const mismatches = [
    { environment: { ...releaseEnvironment, EXPERIMENT_IMAGE_NAME: `${releaseEnvironment.EXPERIMENT_IMAGE_NAME}-other` }, runtime },
    { environment: { ...releaseEnvironment, EXPERIMENT_IMAGE_VERSION: "v1.2.4" }, runtime },
    { environment: { ...releaseEnvironment, EXPERIMENT_SOURCE_REVISION: "c".repeat(40) }, runtime },
    { environment: { ...releaseEnvironment, EXPERIMENT_IMAGE_DIGEST: `sha256:${"d".repeat(64)}` }, runtime },
    { environment: releaseEnvironment, runtime: { ...runtime, arch: "arm64" } },
  ];
  for (const current of mismatches) {
    assert.throws(
      () => assertCurrentExperimentExecutionIdentity(stored, {
        artifact: "fixture-007",
        ...current,
      }),
      /does not match the stored execution receipt/u,
    );
  }
  assert.throws(
    () => assertCurrentExperimentExecutionIdentity(stored, {
      artifact: "fixture-007",
      environment: {},
      runtime,
    }),
    /does not match the stored execution receipt/u,
  );
});
