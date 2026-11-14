import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  validateExecutionManifest,
  workstationPromotionChecks,
} from "../../scripts/lib/workstation-manifests.mjs";

const root = process.cwd();
const realManifest = path.join(root, "experiments", "workstation", "manifests", "candidate-010.json");
const fixture007Manifest = path.join(
  root,
  "experiments",
  "workstation",
  "manifests",
  "fixture-007.json",
);
const fixture019Manifest = path.join(
  root,
  "experiments",
  "workstation",
  "manifests",
  "fixture-019.json",
);
const fixture026Manifest = path.join(
  root,
  "experiments",
  "workstation",
  "manifests",
  "fixture-026.json",
);
const fixture029Manifest = path.join(
  root,
  "experiments",
  "workstation",
  "manifests",
  "fixture-029.json",
);

async function runtimeBindingFixture({
  runtime = {},
  moduleBody = [
    'export const TEST_CONTRACT_VERSION = "test-runtime-contract-v1";',
    "export function assertTestRuntimeRecord() { return true; }",
    "",
  ].join("\n"),
  registerTest = true,
  includeRuntime = true,
  schemaViaJunction = false,
} = {}) {
  const temporary = await mkdtemp(path.join(root, "tmp-runtime-binding-"));
  const storageDirectory = schemaViaJunction ? path.join(temporary, "actual") : temporary;
  const junction = schemaViaJunction ? path.join(temporary, "linked") : null;
  if (schemaViaJunction) {
    await mkdir(storageDirectory);
    await symlink(storageDirectory, junction, "junction");
  }
  const exposedDirectory = junction ?? storageDirectory;
  const relativeDirectory = path.relative(root, exposedDirectory).replaceAll("\\", "/");
  const modulePath = path.join(storageDirectory, "runtime-contract.mjs");
  const testPath = path.join(storageDirectory, "runtime-contract.test.mjs");
  const schemaPath = path.join(storageDirectory, "output.schema.json");
  const manifestPath = path.join(temporary, "manifest.json");
  const manifest = JSON.parse(await readFile(realManifest, "utf8"));
  const metadata = {
    module: "runtime-contract.mjs",
    export: "assertTestRuntimeRecord",
    version_export: "TEST_CONTRACT_VERSION",
    contract_version: "test-runtime-contract-v1",
    test: "runtime-contract.test.mjs",
    ...runtime,
  };
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    ...(includeRuntime ? { "x-runtime-validator": metadata } : {}),
  };
  manifest.outputs.schema = `${relativeDirectory}/output.schema.json`;
  if (registerTest) {
    manifest.implementation.tests = [
      ...manifest.implementation.tests,
      `${relativeDirectory}/runtime-contract.test.mjs`,
    ];
  }
  await writeFile(modulePath, moduleBody);
  await writeFile(testPath, "// registered hostile-test fixture\n");
  await writeFile(schemaPath, JSON.stringify(schema));
  await writeFile(manifestPath, JSON.stringify(manifest));
  return {
    temporary,
    junction,
    result: await validateExecutionManifest(root, manifestPath, "candidate-010"),
  };
}

async function removeRuntimeBindingFixture(fixture) {
  if (fixture.junction) await unlink(fixture.junction);
  await rm(fixture.temporary, { recursive: true, force: true });
}

test("smoke readiness cannot promote an artifact to workstation-ready", async () => {
  const result = await validateExecutionManifest(root, realManifest, "candidate-010");
  assert.equal(result.readiness, "smoke-ready");
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.promotionChecks.filter((check) => check.passed).map((check) => check.id),
    [
      "execution-claim-scope",
      "full-profile",
      "full-tests",
      "hash-chain",
      "resume",
      "energy-provider",
    ],
  );
  assert.deepEqual(
    result.promotionChecks.filter((check) => !check.passed).map((check) => check.id),
    ["confirmation-seeds", "held_out-seeds", "promotion-evidence"],
  );
});

test("fixture execution scope resolves the canonical F-prefixed ledger label", async () => {
  const result = await validateExecutionManifest(root, fixture007Manifest, "fixture-007");
  assert.equal(result.readiness, "smoke-ready");
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.executionClaims, ["C-970", "C-972"]);
  assert.equal(
    result.promotionChecks.find((check) => check.id === "execution-claim-scope").passed,
    true,
  );
});

test("Fixture 019 is smoke-ready with an explicit non-energy claim boundary", async () => {
  const result = await validateExecutionManifest(root, fixture019Manifest, "fixture-019");
  assert.equal(result.readiness, "smoke-ready");
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.executionClaims, ["C-1481"]);
  assert.deepEqual(
    result.promotionChecks.filter((check) => check.passed).map((check) => check.id),
    ["execution-claim-scope", "full-profile", "full-tests", "hash-chain", "resume", "energy-provider"],
  );
  assert.deepEqual(
    result.promotionChecks.filter((check) => !check.passed).map((check) => check.id),
    ["confirmation-seeds", "held_out-seeds", "promotion-evidence"],
  );
  assert.match(
    result.promotionChecks.find((check) => check.id === "energy-provider").detail,
    /no energy endpoint/,
  );
  assert.match(
    result.promotionChecks.find((check) => check.id === "promotion-evidence").detail,
    /structurally blocked/,
  );
});

test("Fixture 020 remains A-only public-development smoke with a C-1488 scope ceiling", async () => {
  const manifestPath = path.join(root, "experiments/workstation/manifests/fixture-020.json");
  const result = await validateExecutionManifest(root, manifestPath, "fixture-020");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(result.readiness, "smoke-ready");
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.executionClaims, ["C-1488"]);
  assert.equal(manifest.distribution.authority, "NO_RESULT");
  assert.equal(manifest.energy.mode, "not-measured");
  assert.equal(manifest.energy.energy_conclusion_allowed, false);
  assert.equal(manifest.energy.scope_binding,
    "fixture-020.c-1488.icp-t01-development-smoke.non-energy.v1");
  assert.equal(manifest.promotion_evidence.protocol_eligibility.status, "blocked");
  const checks = new Map(result.promotionChecks.map((check) => [check.id, check]));
  for (const id of ["confirmation-seeds", "held_out-seeds", "promotion-evidence"]) {
    assert.equal(checks.get(id).passed, false, id);
  }
});

test("Fixture 026 is smoke-ready with an exact C-1540 ledger binding", async () => {
  const result = await validateExecutionManifest(root, fixture026Manifest, "fixture-026");
  assert.equal(result.readiness, "smoke-ready");
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.executionClaims, ["C-1540"]);
  const promotionCheck = (id) => result.promotionChecks.find((check) => check.id === id);
  assert.equal(promotionCheck("execution-claim-scope").passed, true);
  assert.equal(promotionCheck("full-profile").passed, true);
  assert.match(promotionCheck("full-profile").detail, /schema 2/);
  assert.match(promotionCheck("full-profile").detail, /worlds_per_seed/);
  for (const id of ["confirmation-seeds", "held_out-seeds", "promotion-evidence"]) {
    assert.equal(promotionCheck(id).passed, false, id);
  }
});

test("Fixture 029 is smoke-ready with an exact C-1574/C-1580 suite scope ceiling", async () => {
  const result = await validateExecutionManifest(root, fixture029Manifest, "fixture-029");
  const manifest = JSON.parse(await readFile(fixture029Manifest, "utf8"));
  const fullProfile = JSON.parse(await readFile(
    path.join(root, manifest.data.full_profile),
    "utf8",
  ));
  assert.equal(result.readiness, "smoke-ready");
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.executionClaims, ["C-1574", "C-1580"]);
  assert.equal(manifest.outputs.schema,
    "experiments/workstation/fixture-029/suite-receipt.schema.json");
  assert.equal(manifest.outputs.analysis_schema,
    "experiments/workstation/fixture-029/suite-output.schema.json");
  assert.equal(fullProfile.seed_value_domain, "unsigned-uint32");
  assert.match(fullProfile.shared_seed_pack_sha256, /^[0-9a-f]{64}$/u);
  assert.ok(fullProfile.tracks.every((track) => /^[0-9a-f]{64}$/u.test(
    track.configuration_sha256,
  )));
  const promotionCheck = (id) => result.promotionChecks.find((check) => check.id === id);
  assert.equal(promotionCheck("execution-claim-scope").passed, true);
  assert.equal(promotionCheck("full-profile").passed, true);
  for (const id of ["confirmation-seeds", "held_out-seeds", "promotion-evidence"]) {
    assert.equal(promotionCheck(id).passed, false, id);
  }
});

test("Fixture 029 full-profile freezing includes referenced configs and seed pack", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-f029-profile-closure-"));
  const sourceRoot = path.join(root, "experiments", "workstation", "fixture-029");
  const profilePath = path.join(temporary, "configs", "suite-development.json");
  try {
    const manifest = JSON.parse(await readFile(fixture029Manifest, "utf8"));
    const profileBytes = await readFile(
      path.join(sourceRoot, "configs", "suite-development.json"),
    );
    const profile = JSON.parse(profileBytes.toString("utf8"));
    await mkdir(path.dirname(profilePath), { recursive: true });
    await mkdir(path.join(temporary, "seeds"), { recursive: true });
    await writeFile(profilePath, profileBytes);
    await writeFile(
      path.join(temporary, profile.shared_seed_pack),
      await readFile(path.join(sourceRoot, profile.shared_seed_pack)),
    );
    for (const track of profile.tracks) {
      await writeFile(
        path.join(temporary, track.configuration),
        await readFile(path.join(sourceRoot, track.configuration)),
      );
    }
    manifest.data.full_profile = path.relative(root, profilePath).replaceAll("\\", "/");
    manifest.data.full_profile_sha256 = createHash("sha256").update(profileBytes).digest("hex");

    let checks = await workstationPromotionChecks(root, manifest);
    assert.equal(checks.find((check) => check.id === "full-profile").passed, true);

    const firstTrackPath = path.join(temporary, profile.tracks[0].configuration);
    await writeFile(firstTrackPath, `${await readFile(firstTrackPath, "utf8")}\n`);
    checks = await workstationPromotionChecks(root, manifest);
    assert.equal(checks.find((check) => check.id === "full-profile").passed, false);

    await writeFile(
      firstTrackPath,
      await readFile(path.join(sourceRoot, profile.tracks[0].configuration)),
    );
    const seedPath = path.join(temporary, profile.shared_seed_pack);
    await writeFile(seedPath, `${await readFile(seedPath, "utf8")}\n`);
    checks = await workstationPromotionChecks(root, manifest);
    assert.equal(checks.find((check) => check.id === "full-profile").passed, false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("registered full-profile contracts preserve every canonical passing artifact", async () => {
  for (const artifact of [
    "candidate-010", "fixture-007", "fixture-012", "fixture-019", "fixture-023",
    "fixture-024", "fixture-025", "fixture-026", "fixture-027", "fixture-029",
  ]) {
    const manifest = JSON.parse(await readFile(
      path.join(root, "experiments", "workstation", "manifests", `${artifact}.json`),
      "utf8",
    ));
    const checks = await workstationPromotionChecks(root, manifest);
    assert.equal(checks.find((check) => check.id === "full-profile").passed, true, artifact);
  }
});

test("the full-profile gate rejects unregistered schema, artifact, and cardinality substitutions", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-full-profile-cardinality-"));
  const profilePath = path.join(temporary, "development.json");
  try {
    for (const { artifact = "fixture-026", ...profileShape } of [
      { schema: 1, worlds_per_seed: 0, opportunities_per_seed: 1 },
      { schema: 1, worlds_per_seed: 1, opportunities_per_seed: 0 },
      { schema: 0, worlds_per_seed: 1 },
      { schema: "2", worlds_per_seed: 1 },
      { schema: 999, worlds_per_seed: 1 },
      { schema: 2, opportunities_per_seed: 1 },
      { schema: 2, batch_size: 1 },
      { schema: 2, worlds_per_seed: 1, foo_per_seed: 1 },
      { artifact: "fixture-999", schema: 2, worlds_per_seed: 1 },
    ]) {
      const profile = {
        artifact,
        profile: "development",
        ...profileShape,
      };
      const profileBytes = `${JSON.stringify(profile, null, 2)}\n`;
      await writeFile(profilePath, profileBytes);
      const manifest = JSON.parse(await readFile(fixture026Manifest, "utf8"));
      manifest.artifact = artifact;
      manifest.data.full_profile = path.relative(root, profilePath).replaceAll("\\", "/");
      manifest.data.full_profile_sha256 = createHash("sha256").update(profileBytes).digest("hex");
      const checks = await workstationPromotionChecks(root, manifest);
      const fullProfile = checks.find((check) => check.id === "full-profile");
      assert.equal(fullProfile.passed, false);
      assert.match(fullProfile.detail, /registered artifact.*schema version.*workload cardinality/);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Fixture 019 cannot escape its protocol block with present self-asserted evidence", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-f019-structural-block-"));
  const manifestPath = path.join(temporary, "fixture-019.json");
  try {
    const manifest = JSON.parse(await readFile(fixture019Manifest, "utf8"));
    manifest.readiness = "workstation-ready";
    manifest.promotion_evidence.status = "present";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await validateExecutionManifest(root, manifestPath, "fixture-019");
    assert.equal(result.ready, false);
    const promotion = result.promotionChecks.find((entry) => entry.id === "promotion-evidence");
    assert.equal(promotion.passed, false);
    assert.match(promotion.detail, /structurally blocked/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("existing fixtures without the explicit non-energy boundary still fail the energy promotion gate", async () => {
  const result = await validateExecutionManifest(root, fixture007Manifest, "fixture-007");
  assert.equal(result.promotionChecks.find((check) => check.id === "energy-provider").passed, false);
});

test("free-text non-energy self-exemptions fail without the reviewed artifact/claim binding", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-f019-energy-scope-"));
  const manifestPath = path.join(temporary, "fixture-019.json");
  try {
    const manifest = JSON.parse(await readFile(fixture019Manifest, "utf8"));
    manifest.energy.scope_binding = "self-asserted-free-text";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await validateExecutionManifest(root, manifestPath, "fixture-019");
    const check = result.promotionChecks.find((entry) => entry.id === "energy-provider");
    assert.equal(check.passed, false);
    assert.match(check.detail, /must enforce measured energy|explicitly forbid/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("canonical decimal uint64 seed reveals pass while noncanonical strings fail closed", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-uint64-seeds-"));
  const relative = path.relative(root, temporary).replaceAll("\\", "/");
  const manifest = JSON.parse(await readFile(fixture007Manifest, "utf8"));
  const manifestPath = path.join(temporary, "fixture-007.json");
  const makePack = (partition, seeds, escrowSha256) => ({
    schema: 1,
    state: "frozen-reveal",
    partition,
    algorithm: "sha256-json-array-v1",
    generation_method: "system-cryptographic-entropy-v1",
    escrow_sha256: escrowSha256,
    seeds,
    commitment: createHash("sha256").update(JSON.stringify(seeds)).digest("hex"),
  });
  const writePack = async (name, document) => {
    await writeFile(path.join(temporary, `${name}.reveal.json`), JSON.stringify(document));
    await writeFile(path.join(temporary, `${name}.commit.json`), JSON.stringify({
      schema: 1,
      state: "sealed",
      partition: document.partition,
      algorithm: document.algorithm,
      generation_method: document.generation_method,
      escrow_sha256: document.escrow_sha256,
      seed_count: document.seeds.length,
      commitment: document.commitment,
    }));
  };
  try {
    const confirmation = makePack("confirmation", [
      "18446744073709551615",
      ...Array.from({ length: 255 }, (_, index) => (10_000_000_000_000_000_000n + BigInt(index)).toString()),
    ], "a".repeat(64));
    const heldOut = makePack(
      "held-out",
      Array.from({ length: 256 }, (_, index) => (11_000_000_000_000_000_000n + BigInt(index)).toString()),
      "b".repeat(64),
    );
    for (const [name, document] of [["confirmation", confirmation], ["held-out", heldOut]]) {
      await writePack(name, document);
    }
    manifest.seeds.confirmation = `${relative}/confirmation.reveal.json`;
    manifest.seeds.held_out = `${relative}/held-out.reveal.json`;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const accepted = await validateExecutionManifest(root, manifestPath, "fixture-007");
    assert.equal(accepted.promotionChecks.find((check) => check.id === "confirmation-seeds").passed, true);
    assert.equal(accepted.promotionChecks.find((check) => check.id === "held_out-seeds").passed, true);

    confirmation.seeds[0] = "01";
    confirmation.commitment = createHash("sha256").update(JSON.stringify(confirmation.seeds)).digest("hex");
    await writePack("confirmation", confirmation);
    const rejected = await validateExecutionManifest(root, manifestPath, "fixture-007");
    assert.equal(rejected.promotionChecks.find((check) => check.id === "confirmation-seeds").passed, false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Candidate 010 rejects standalone rehashed seed pairs without the joint operator plan and attestation", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-c010-seed-integrity-"));
  const revealed = path.join(temporary, "revealed");
  const relative = path.relative(root, revealed).replaceAll("\\", "/");
  const manifest = JSON.parse(await readFile(realManifest, "utf8"));
  const writePair = async (partition, seeds) => {
    const commitment = createHash("sha256").update(JSON.stringify(seeds)).digest("hex");
    await writeFile(path.join(revealed, `${partition}.commit.json`), JSON.stringify({
      schema: 1,
      partition,
      state: "sealed",
      algorithm: "sha256-json-array-v1",
      seed_count: seeds.length,
      commitment,
    }));
    await writeFile(path.join(revealed, `${partition}.reveal.json`), JSON.stringify({
      schema: 1,
      partition,
      state: "frozen-reveal",
      algorithm: "sha256-json-array-v1",
      commitment,
      seeds,
    }));
  };
  try {
    await mkdir(revealed);
    await writePair("confirmation", [1, 2]);
    await writePair("held-out", [3, 4]);
    manifest.seeds.confirmation = `${relative}/confirmation.reveal.json`;
    manifest.seeds.held_out = `${relative}/held-out.reveal.json`;
    const checks = await workstationPromotionChecks(root, manifest);
    for (const id of ["confirmation-seeds", "held_out-seeds"]) {
      const check = checks.find((entry) => entry.id === id);
      assert.equal(check.passed, false);
      assert.match(check.detail, /Candidate 010 seed-release integrity failed/);
      assert.match(check.detail, /seed-release-plan|does not resolve to an existing file/);
    }

    manifest.seed_integrity.artifact_schema_sha256 = "0".repeat(64);
    const schemaChecks = await workstationPromotionChecks(root, manifest);
    assert.match(
      schemaChecks.find((entry) => entry.id === "confirmation-seeds").detail,
      /schema SHA-256 does not match/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Candidate 010 validates its frozen seed schema identity while seed creation is still pending", async () => {
  const manifest = JSON.parse(await readFile(realManifest, "utf8"));
  manifest.seed_integrity.artifact_schema_sha256 = "0".repeat(64);
  const checks = await workstationPromotionChecks(root, manifest);
  for (const id of ["confirmation-seeds", "held_out-seeds"]) {
    const check = checks.find((entry) => entry.id === id);
    assert.equal(check.passed, false);
    assert.match(check.detail, /schema SHA-256 does not match/);
  }
});

test("public-label-derived Fixture 019 packs fail the confirmation readiness gate", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-f019-public-labels-"));
  const relative = path.relative(root, temporary).replaceAll("\\", "/");
  const manifest = JSON.parse(await readFile(fixture019Manifest, "utf8"));
  const manifestPath = path.join(temporary, "fixture-019.json");
  const derive = (split, regime, count) => Array.from({ length: count }, (_, replicate) => {
    const digest = createHash("sha256")
      .update(`FM-v1|FM-T02|${split}|${regime}|${replicate}`)
      .digest();
    return digest.readBigUInt64BE(digest.length - 8).toString();
  });
  const packs = {
    confirmation: derive("confirmation", "base", 256),
    "held-out": [
      ...derive("transfer-a", "overlap-impact", 128),
      ...derive("transfer-b", "funding", 128),
    ],
  };
  try {
    for (const [name, seeds] of Object.entries(packs)) {
      const commitment = createHash("sha256").update(JSON.stringify(seeds)).digest("hex");
      const escrowSha256 = name === "confirmation" ? "c".repeat(64) : "d".repeat(64);
      await writeFile(path.join(temporary, `${name}.reveal.json`), JSON.stringify({
        schema: 1,
        state: "frozen-reveal",
        partition: name,
        algorithm: "sha256-json-array-v1",
        generation_method: "system-cryptographic-entropy-v1",
        escrow_sha256: escrowSha256,
        seeds,
        commitment,
      }));
      await writeFile(path.join(temporary, `${name}.commit.json`), JSON.stringify({
        schema: 1,
        state: "sealed",
        partition: name,
        algorithm: "sha256-json-array-v1",
        generation_method: "system-cryptographic-entropy-v1",
        escrow_sha256: escrowSha256,
        seed_count: seeds.length,
        commitment,
      }));
    }
    manifest.seeds.confirmation = `${relative}/confirmation.reveal.json`;
    manifest.seeds.held_out = `${relative}/held-out.reveal.json`;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await validateExecutionManifest(root, manifestPath, "fixture-019");
    for (const id of ["confirmation-seeds", "held_out-seeds"]) {
      const check = result.promotionChecks.find((entry) => entry.id === id);
      assert.equal(check.passed, false);
      assert.match(check.detail, /rejects every seeds\./);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("six truthy placeholder fields cannot pass the execution gate", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-20w-manifest-"));
  const manifestPath = path.join(temporary, "candidate-010.json");
  try {
    await writeFile(
      manifestPath,
      JSON.stringify({
        schema: 1,
        artifact: "candidate-010",
        readiness: "workstation-ready",
        command: "yes",
        environment: "yes",
        hardware: "yes",
        seeds: "yes",
        data: "yes",
        outputs: "yes",
      }),
    );
    const result = await validateExecutionManifest(root, manifestPath, "candidate-010");
    assert.equal(result.ready, false);
    assert.ok(result.errors.length >= 10);
  } finally {
    assert.ok(temporary.startsWith(root));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("the checked manifest JSON Schema rejects unknown root properties", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-f019-schema-"));
  const manifestPath = path.join(temporary, "fixture-019.json");
  try {
    const manifest = JSON.parse(await readFile(fixture019Manifest, "utf8"));
    manifest.self_asserted_eligibility = true;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await validateExecutionManifest(root, manifestPath, "fixture-019");
    assert.equal(result.ready, false);
    assert.ok(result.errors.some((error) => /manifest schema.*additional properties/.test(error)));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("changing only the readiness label still fails the full gate", async () => {
  const source = JSON.parse(await readFile(realManifest, "utf8"));
  source.readiness = "workstation-ready";
  const temporary = await mkdtemp(path.join(root, "tmp-20w-manifest-full-"));
  const manifestPath = path.join(temporary, "candidate-010.json");
  try {
    await writeFile(manifestPath, JSON.stringify(source));
    const result = await validateExecutionManifest(root, manifestPath, "candidate-010");
    assert.equal(result.ready, false);
    assert.ok(result.errors.some((error) => error.includes("confirmation")));
    assert.ok(result.errors.some((error) => error.includes("held_out")));
    assert.equal(result.promotionChecks.find((check) => check.id === "promotion-evidence").passed, false);
    assert.equal(result.promotionChecks.find((check) => check.id === "full-tests").passed, true);
  } finally {
    assert.ok(temporary.startsWith(root));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("the canonical Candidate 010 registry must exactly match its committed execution projection", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-c010-execution-projection-"));
  const manifestPath = path.join(
    temporary,
    "experiments",
    "workstation",
    "manifests",
    "candidate-010.json",
  );
  const projectionPath = path.join(
    temporary,
    "experiments",
    "workstation",
    "candidate-010",
    "execution-manifest.json",
  );
  try {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await mkdir(path.dirname(projectionPath), { recursive: true });
    await mkdir(path.join(temporary, "research"), { recursive: true });
    await writeFile(path.join(temporary, "research", "claims.md"), "### C-170\n[Candidate 010]\n");
    await writeFile(manifestPath, await readFile(realManifest));
    const projection = JSON.parse(await readFile(
      path.join(root, "experiments", "workstation", "candidate-010", "execution-manifest.json"),
      "utf8",
    ));
    projection.execution_contract.command.run = "node substituted-runner.mjs";
    await writeFile(projectionPath, JSON.stringify(projection));
    const result = await validateExecutionManifest(temporary, manifestPath, "candidate-010");
    assert.ok(result.errors.some((error) => /does not exactly match the immutable projection/.test(error)));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("fake manifest hashes and a favorable summary JSON cannot replace strict evidence", async () => {
  const source = JSON.parse(await readFile(realManifest, "utf8"));
  source.readiness = "workstation-ready";
  const temporary = await mkdtemp(path.join(root, "tmp-c010-manifest-evidence-"));
  const relative = path.relative(root, temporary).replaceAll("\\", "/");
    const evidencePath = path.join(temporary, "evidence.json");
    const receiptPath = path.join(temporary, "promotion-validation-receipt.json");
    const releaseRoot = path.join(temporary, "release");
    const releasePath = path.join(releaseRoot, "release.json");
    const runDirectory = path.join(temporary, "run");
    const energyPath = path.join(runDirectory, "energy.json");
    const disjointPath = path.join(releaseRoot, "held-out.json");
  const manifestPath = path.join(temporary, "candidate-010.json");
  try {
    await mkdir(runDirectory, { recursive: true });
    await mkdir(releaseRoot, { recursive: true });
    await writeFile(evidencePath, JSON.stringify({
      schema: 1,
      artifact: "candidate-010",
      status: "validated-hardware-confirmation",
      source_commit_sha: "a".repeat(40),
      implemented_task_families: ["signed-publication", "actuator-command"],
      ledger: {
        valid: true,
        scientific_payload_sha256: "b".repeat(64),
        hash_chain_sha256: "c".repeat(64),
      },
      external_energy: {
        record_kind: "hardware-observation",
        provenance_reviewed: true,
        raw_reading_sha256: "d".repeat(64),
      },
      confirmatory_analysis: {
        decision: "eligible",
        frozen_release: true,
        validation_errors: 0,
      },
    }));
    await writeFile(receiptPath, JSON.stringify({
      contract_version: "candidate-010.capsule-launch-receipt.v1",
      status: "verified",
      receipt_sha256: "f".repeat(64),
    }));
    await writeFile(releasePath, "{}\n");
    await writeFile(energyPath, JSON.stringify({ schema: 1, valid: true }));
    await writeFile(disjointPath, JSON.stringify({ partition: "held-out", seeds: [999] }));
    source.promotion_evidence = {
      status: "present",
      evidence_path: `${relative}/evidence.json`,
      promotion_validation_receipt_path: `${relative}/promotion-validation-receipt.json`,
      run_directory: `${relative}/run`,
      release_root: `${relative}/release`,
      release_path: `${relative}/release/release.json`,
      energy_assignments_path: `${relative}/run/energy.json`,
      disjoint_seed_pack_paths: [`${relative}/release/held-out.json`],
      sha256: "e".repeat(64),
    };
    await writeFile(manifestPath, JSON.stringify(source));
    const result = await validateExecutionManifest(root, manifestPath, "candidate-010");
    const promotion = result.promotionChecks.find((check) => check.id === "promotion-evidence");
    assert.equal(result.ready, false);
    assert.equal(promotion.passed, false);
    assert.match(promotion.detail, /canonical digest|strict promotion evidence validation failed/);
  } finally {
    assert.ok(temporary.startsWith(root));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("output schema is bound to an importable versioned runtime validator and registered test", async () => {
  const fixture = await runtimeBindingFixture();
  try {
    assert.equal(fixture.result.readiness, "smoke-ready");
    assert.deepEqual(fixture.result.errors, []);
  } finally {
    await removeRuntimeBindingFixture(fixture);
  }
});

test("manifest and runtime-schema paths refuse symbolic-link or reparse-point traversal", async () => {
  const fixture = await runtimeBindingFixture({ schemaViaJunction: true });
  try {
    assert.equal(fixture.result.ready, false);
    assert.ok(fixture.result.errors.some((error) => /symbolic-link|reparse-point/.test(error)));
  } finally {
    await removeRuntimeBindingFixture(fixture);
  }
});

test("runtime binding rejects declarative placeholders, wrong exports, versions, tests, and paths", async () => {
  const cases = [
    {
      options: { includeRuntime: false },
      pattern: /must declare an x-runtime-validator object/,
    },
    {
      options: { runtime: { export: "missingValidator" } },
      pattern: /export missingValidator is not a function/,
    },
    {
      options: {
        runtime: { export: "declarativePlaceholder" },
        moduleBody: [
          'export const TEST_CONTRACT_VERSION = "test-runtime-contract-v1";',
          "export const declarativePlaceholder = true;",
          "",
        ].join("\n"),
      },
      pattern: /export declarativePlaceholder is not a function/,
    },
    {
      options: { runtime: { version_export: "MISSING_CONTRACT_VERSION" } },
      pattern: /version export MISSING_CONTRACT_VERSION is not a string/,
    },
    {
      options: { runtime: { contract_version: "test-runtime-contract-v2" } },
      pattern: /version does not match contract_version/,
    },
    {
      options: { runtime: { contract_version: "TODO-placeholder" } },
      pattern: /must be a concrete version identifier/,
    },
    {
      options: { registerTest: false },
      pattern: /test must be registered in implementation.tests/,
    },
    {
      options: { runtime: { module: "../../../../outside-runtime.mjs" } },
      pattern: /module escapes the repository/,
    },
    {
      options: { runtime: { test: "../../../../outside-runtime.test.mjs" } },
      pattern: /test escapes the repository/,
    },
    {
      options: { runtime: { module: "output.schema.json" } },
      pattern: /module must be a schema-relative \.mjs repository path/,
    },
  ];
  for (const { options, pattern } of cases) {
    const fixture = await runtimeBindingFixture(options);
    try {
      assert.equal(fixture.result.ready, false);
      assert.ok(
        fixture.result.errors.some((error) => pattern.test(error)),
        `${pattern} not found in ${JSON.stringify(fixture.result.errors)}`,
      );
    } finally {
      await removeRuntimeBindingFixture(fixture);
    }
  }
});
