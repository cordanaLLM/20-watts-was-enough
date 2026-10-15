import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateDurablePromotionEvidence } from "../../experiments/workstation/candidate-010/promotion-evidence.mjs";
import { runCapsulePromotionValidationOperator } from "../../experiments/workstation/candidate-010/runner.mjs";
import {
  CANDIDATE_010_EXECUTION_MANIFEST_FILE,
  assertCandidate010ExecutionManifestProjection,
} from "../../experiments/workstation/candidate-010/source-bundle.mjs";
import {
  SEED_RELEASE_OPERATOR_VERSION,
  SEED_RELEASE_PLAN_VERSION,
  SEED_REVEAL_ATTESTATION_VERSION,
  validateSeedReleaseOperatorArtifacts,
} from "../../experiments/workstation/candidate-010/seed-release-operator.mjs";

const readinessLevels = new Set(["scaffold", "smoke-ready", "workstation-ready"]);
const commandActions = ["prepare", "smoke", "run", "analyze", "validate"];
const claimIdPattern = /^C-\d{3,4}$/;
const fullProfileContracts = new Map([
  ["candidate-010", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["opportunities_per_seed"]) })],
  ["fixture-007", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["opportunities_per_seed"]) })],
  ["fixture-012", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["opportunities_per_seed", "studies_per_seed"]) })],
  ["fixture-019", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["opportunities_per_seed"]) })],
  ["fixture-023", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["t01_episodes_per_seed", "t02_lifecycles_per_seed"]) })],
  ["fixture-024", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["opportunities_per_seed"]) })],
  ["fixture-025", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["worlds_per_seed"]) })],
  ["fixture-026", Object.freeze({ schema: 2, profile: "development", cardinalityFields: Object.freeze(["worlds_per_seed"]) })],
  ["fixture-027", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["worlds_per_seed"]) })],
  ["fixture-029", Object.freeze({ schema: 1, profile: "development", cardinalityFields: Object.freeze(["worlds_per_seed"]) })],
]);
const reviewedNonEnergyScopes = new Map([
  ["fixture-019.c-1481.non-energy.v1", Object.freeze({
    artifact: "fixture-019",
    claims: Object.freeze(["C-1481"]),
  })],
]);
const manifestSchemas = new Map();

function executionClaimScope(manifest) {
  return Array.isArray(manifest.implementation?.execution_claims)
    ? manifest.implementation.execution_claims
    : [];
}

function hasReviewedNonEnergyScope(manifest) {
  const reviewed = reviewedNonEnergyScopes.get(manifest.energy?.scope_binding);
  return Boolean(
    reviewed
    && reviewed.artifact === manifest.artifact
    && JSON.stringify([...executionClaimScope(manifest)].sort()) === JSON.stringify([...reviewed.claims].sort()),
  );
}

async function exists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function localPath(root, value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const absolute = path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

async function fileSha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function embeddedFullProfileClosureFrozen(root, fullProfile, profile) {
  const tracks = Array.isArray(profile?.tracks) ? profile.tracks : [];
  const declaresClosure = Object.hasOwn(profile ?? {}, "shared_seed_pack_sha256")
    || tracks.some((track) => Object.hasOwn(track ?? {}, "configuration_sha256"));
  if (!declaresClosure) return true;

  try {
    const profileRoot = path.resolve(path.dirname(fullProfile), "..");
    if (
      typeof profile.shared_seed_pack !== "string"
      || !/^[0-9a-f]{64}$/u.test(profile.shared_seed_pack_sha256 ?? "")
      || tracks.length === 0
    ) return false;
    const seedPack = await repositoryRegularFile(
      root,
      path.resolve(profileRoot, profile.shared_seed_pack),
      "full-profile embedded seed pack",
      { absoluteInput: true },
    );
    if (await fileSha256(seedPack) !== profile.shared_seed_pack_sha256) return false;

    for (const [index, track] of tracks.entries()) {
      if (
        typeof track?.configuration !== "string"
        || !/^[0-9a-f]{64}$/u.test(track.configuration_sha256 ?? "")
      ) return false;
      const configuration = await repositoryRegularFile(
        root,
        path.resolve(profileRoot, track.configuration),
        `full-profile embedded track configuration ${index}`,
        { absoluteInput: true },
      );
      if (await fileSha256(configuration) !== track.configuration_sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function resolveLocalSchemaReference(rootSchema, reference) {
  if (typeof reference !== "string" || !reference.startsWith("#/")) {
    throw new Error(`unsupported manifest schema reference ${reference}`);
  }
  return reference.slice(2).split("/").reduce((node, component) => (
    node?.[component.replaceAll("~1", "/").replaceAll("~0", "~")]
  ), rootSchema);
}

function validateJsonSchemaNode(schema, value, rootSchema, location, errors) {
  const supportedKeywords = new Set([
    "$schema", "$id", "$defs", "$ref", "title", "description", "type", "const", "enum",
    "required", "properties", "additionalProperties", "minLength", "pattern", "minItems",
    "maxItems", "uniqueItems", "items", "oneOf",
  ]);
  for (const keyword of Object.keys(schema)) {
    if (!supportedKeywords.has(keyword)) {
      errors.push(`${location || "/"} uses unsupported schema keyword ${keyword}`);
    }
  }
  if (schema.$ref) {
    const resolved = resolveLocalSchemaReference(rootSchema, schema.$ref);
    if (!resolved) errors.push(`${location} has an unresolved schema reference ${schema.$ref}`);
    else validateJsonSchemaNode(resolved, value, rootSchema, location, errors);
    return;
  }
  if (Array.isArray(schema.oneOf)) {
    const alternatives = schema.oneOf.map((alternative) => {
      const alternativeErrors = [];
      validateJsonSchemaNode(alternative, value, rootSchema, location, alternativeErrors);
      return alternativeErrors;
    });
    const matching = alternatives.filter((alternativeErrors) => alternativeErrors.length === 0);
    if (matching.length !== 1) {
      errors.push(`${location || "/"} must match exactly one schema alternative`);
      if (matching.length === 0 && alternatives.length > 0) {
        const closest = alternatives.reduce((left, right) => (
          right.length < left.length ? right : left
        ));
        errors.push(...closest);
      }
    }
  }
  if (Object.hasOwn(schema, "const") && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${location} must equal the declared constant`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) {
    errors.push(`${location} must equal one of the declared enum values`);
  }
  const actualType = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  if (schema.type && actualType !== schema.type) {
    errors.push(`${location} must be ${schema.type}`);
    return;
  }
  if (actualType === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      errors.push(`${location} must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) {
      errors.push(`${location} must match ${schema.pattern}`);
    }
  }
  if (actualType === "array") {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${location} must contain at least ${schema.minItems} item(s)`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(`${location} must contain at most ${schema.maxItems} item(s)`);
    }
    if (schema.uniqueItems === true) {
      const identities = value.map((entry) => JSON.stringify(entry));
      if (new Set(identities).size !== identities.length) errors.push(`${location} must contain unique items`);
    }
    if (schema.items) {
      value.forEach((entry, index) => validateJsonSchemaNode(
        schema.items,
        entry,
        rootSchema,
        `${location}/${index}`,
        errors,
      ));
    }
  }
  if (actualType === "object") {
    for (const field of schema.required ?? []) {
      if (!Object.hasOwn(value, field)) errors.push(`${location}/${field} is required`);
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        if (!Object.hasOwn(properties, field)) errors.push(`${location} contains additional properties: ${field}`);
      }
    }
    for (const [field, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, field)) {
        validateJsonSchemaNode(childSchema, value[field], rootSchema, `${location}/${field}`, errors);
      }
    }
  }
}

async function validateAgainstManifestSchema(root, manifest) {
  const schemaPath = path.join(root, "experiments", "workstation", "manifest.schema.json");
  const source = await readFile(schemaPath, "utf8");
  const identity = createHash("sha256").update(source).digest("hex");
  let schema = manifestSchemas.get(identity);
  if (!schema) {
    schema = JSON.parse(source);
    manifestSchemas.clear();
    manifestSchemas.set(identity, schema);
  }
  const errors = [];
  validateJsonSchemaNode(schema, manifest, schema, "", errors);
  return errors.map((error) => `manifest schema ${error}`);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function repositoryRegularFile(root, value, label, { absoluteInput = false } = {}) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) {
    throw new Error(`${label} must be a repository-relative regular file`);
  }
  const rootAbsolute = path.resolve(root);
  const absolute = absoluteInput ? path.resolve(value) : localPath(rootAbsolute, value);
  if (!absolute || !isInside(rootAbsolute, absolute)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  const relative = path.relative(rootAbsolute, absolute);
  let current = rootAbsolute;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let information;
    try {
      information = await lstat(current);
    } catch (error) {
      const failure = new Error(`${label} does not resolve to an existing file: ${error.message}`);
      failure.code = error.code;
      throw failure;
    }
    if (information.isSymbolicLink()) {
      throw new Error(`${label} refuses symbolic-link or reparse-point traversal`);
    }
  }
  const [rootReal, resolved, information] = await Promise.all([
    realpath(rootAbsolute),
    realpath(absolute),
    lstat(absolute),
  ]);
  if (!information.isFile()) throw new Error(`${label} must be a regular file`);
  if (!isInside(rootReal, resolved)) throw new Error(`${label} resolves outside the repository`);
  return resolved;
}

async function schemaRelativeFile(root, schemaPath, value, label, extension) {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || value.includes("\0")
    || value.includes("?")
    || value.includes("#")
    || path.isAbsolute(value)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
    || !value.endsWith(extension)
  ) {
    throw new Error(`${label} must be a schema-relative ${extension} repository path`);
  }
  const absolute = path.resolve(path.dirname(schemaPath), value);
  if (!isInside(path.resolve(root), absolute)) {
    throw new Error(`${label} escapes the repository`);
  }
  return repositoryRegularFile(root, absolute, label, { absoluteInput: true });
}

async function validateRuntimeSchemaBinding(root, manifest) {
  const errors = [];
  let schemaPath;
  try {
    schemaPath = await repositoryRegularFile(
      root,
      manifest.outputs?.schema,
      "outputs.schema",
    );
  } catch (error) {
    return [error.message];
  }
  let schema;
  try {
    schema = JSON.parse(await readFile(schemaPath, "utf8"));
  } catch (error) {
    return [`outputs.schema is not valid JSON: ${error.message}`];
  }
  const runtime = schema?.["x-runtime-validator"];
  const requiredFields = ["module", "export", "version_export", "contract_version", "test"];
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    return ["outputs.schema must declare an x-runtime-validator object"];
  }
  const actualFields = Object.keys(runtime).sort();
  if (JSON.stringify(actualFields) !== JSON.stringify([...requiredFields].sort())) {
    errors.push(`outputs.schema x-runtime-validator must contain exactly ${requiredFields.join(", ")}`);
  }
  const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  if (!identifier.test(runtime.export ?? "")) {
    errors.push("outputs.schema runtime validator export must be a named JavaScript export");
  }
  if (!identifier.test(runtime.version_export ?? "")) {
    errors.push("outputs.schema runtime validator version_export must be a named JavaScript export");
  }
  if (
    typeof runtime.contract_version !== "string"
    || !/^[a-z0-9][a-z0-9._-]*$/.test(runtime.contract_version)
    || /placeholder|todo|tbd/i.test(runtime.contract_version)
  ) {
    errors.push("outputs.schema runtime validator contract_version must be a concrete version identifier");
  }

  let modulePath;
  let testPath;
  try {
    modulePath = await schemaRelativeFile(
      root,
      schemaPath,
      runtime.module,
      "outputs.schema runtime validator module",
      ".mjs",
    );
  } catch (error) {
    errors.push(error.message);
  }
  try {
    testPath = await schemaRelativeFile(
      root,
      schemaPath,
      runtime.test,
      "outputs.schema runtime validator test",
      ".test.mjs",
    );
  } catch (error) {
    errors.push(error.message);
  }

  if (testPath) {
    const registeredTests = Array.isArray(manifest.implementation?.tests)
      ? manifest.implementation.tests
      : [];
    const registeredRealPaths = await Promise.all(registeredTests.map(async (value) => {
      const candidate = localPath(root, value);
      if (!candidate || !(await exists(candidate))) return null;
      try {
        return await realpath(candidate);
      } catch {
        return null;
      }
    }));
    if (!registeredRealPaths.includes(testPath)) {
      errors.push("outputs.schema runtime validator test must be registered in implementation.tests");
    }
  }

  if (modulePath && identifier.test(runtime.export ?? "")
    && identifier.test(runtime.version_export ?? "") && errors.length === 0) {
    try {
      const moduleUrl = pathToFileURL(modulePath);
      moduleUrl.searchParams.set("source_sha256", await fileSha256(modulePath));
      const implementation = await import(moduleUrl.href);
      if (typeof implementation[runtime.export] !== "function") {
        errors.push(`outputs.schema runtime validator export ${runtime.export} is not a function`);
      }
      if (typeof implementation[runtime.version_export] !== "string") {
        errors.push(`outputs.schema runtime validator version export ${runtime.version_export} is not a string`);
      } else if (implementation[runtime.version_export] !== runtime.contract_version) {
        errors.push("outputs.schema runtime validator version does not match contract_version");
      }
    } catch (error) {
      errors.push(`outputs.schema runtime validator module could not be imported: ${error.message}`);
    }
  }
  return errors;
}

async function validateCandidate010ExecutionProjection(root, manifestPath, manifest) {
  const registryPath = path.resolve(root, "experiments/workstation/manifests/candidate-010.json");
  if (manifest.artifact !== "candidate-010" || path.resolve(manifestPath) !== registryPath) return [];
  try {
    const projectionPath = await repositoryRegularFile(
      root,
      CANDIDATE_010_EXECUTION_MANIFEST_FILE,
      "candidate-010 immutable execution manifest",
    );
    const projection = JSON.parse(await readFile(projectionPath, "utf8"));
    assertCandidate010ExecutionManifestProjection({ manifest, projection });
    return [];
  } catch (error) {
    return [`candidate-010 immutable execution manifest is invalid: ${error.message}`];
  }
}

async function validateExecutionClaimScope(root, manifest, executionClaims) {
  if (
    executionClaims.length === 0
    || executionClaims.some((claim) => !claimIdPattern.test(claim))
    || new Set(executionClaims).size !== executionClaims.length
  ) return false;
  const claims = (await readFile(path.join(root, "research", "claims.md"), "utf8")).replaceAll("\r\n", "\n");
  const artifactNumber = manifest.artifact?.split("-")[1];
  const artifactLabels = manifest.artifact?.startsWith("candidate-")
    ? [`[Candidate ${artifactNumber}]`]
    : [`[Fixture F-${artifactNumber}]`, `[F-${artifactNumber} `];
  for (const claim of executionClaims) {
    const start = claims.indexOf(`### ${claim}\n`);
    if (start < 0) return false;
    const next = claims.indexOf("\n### C-", start + 1);
    const block = claims.slice(start, next < 0 ? claims.length : next);
    if (!artifactLabels.some((label) => block.includes(label))) return false;
  }
  return true;
}

function collectReferencedPaths(manifest) {
  return [
    ...(Array.isArray(manifest.environment?.lockfiles)
      ? manifest.environment.lockfiles.map((value) => ["environment.lockfiles", value])
      : []),
    ["seeds.development", manifest.seeds?.development],
    ["seeds.confirmation", manifest.seeds?.confirmation],
    ["seeds.held_out", manifest.seeds?.held_out],
    ["data.generator", manifest.data?.generator],
    ["outputs.schema", manifest.outputs?.schema],
    ["implementation.entrypoint", manifest.implementation?.entrypoint],
    ...(manifest.artifact === "candidate-010"
      ? [["seed_integrity.artifact_schema", manifest.seed_integrity?.artifact_schema]]
      : []),
    ...(Array.isArray(manifest.implementation?.tests)
      ? manifest.implementation.tests.map((value) => ["implementation.tests", value])
      : []),
  ];
}

function fixture019PrivateEscrowCheck(field) {
  return {
    id: `${field}-seeds`,
    label: field === "confirmation" ? "Frozen confirmation seeds" : "Frozen held-out seeds",
    passed: false,
    detail: `FM-v1/FM-T02 rejects every seeds.${field} reveal or escrow claim until a reviewed successor protocol replaces the structural block`,
  };
}

async function committedSeedCheck(root, manifest, field, label) {
  const seedPath = localPath(root, manifest.seeds?.[field]);
  if (!seedPath || !(await exists(seedPath))) {
    return {
      id: `${field}-seeds`,
      label,
      passed: false,
      detail: `seeds.${field} must reference an existing committed seed manifest`,
    };
  }

  try {
    const seedDocument = JSON.parse(await readFile(seedPath, "utf8"));
    const expectedPartition = field === "held_out" ? "held-out" : field;
    if (!Array.isArray(seedDocument.seeds) || !seedDocument.seeds.length) {
      return {
        id: `${field}-seeds`,
        label,
        passed: false,
        detail: seedDocument.state === "pending-implementation-freeze"
          ? `seeds.${field} is explicitly pending the implementation/pilot freeze and has no sealed reveal`
          : `seeds.${field} does not disclose a frozen non-empty seed list`,
      };
    }
    const canonicalSeed = (seed) => {
      if (Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff) return BigInt(seed).toString();
      if (typeof seed === "string" && /^(?:0|[1-9][0-9]{0,19})$/.test(seed)) {
        const parsed = BigInt(seed);
        if (parsed <= 0xffff_ffff_ffff_ffffn) return parsed.toString();
      }
      return null;
    };
    const canonicalSeeds = Array.isArray(seedDocument.seeds)
      ? seedDocument.seeds.map(canonicalSeed)
      : [];
    if (
      seedDocument.schema !== 1
      || seedDocument.state !== "frozen-reveal"
      || seedDocument.partition !== expectedPartition
      || seedDocument.algorithm !== "sha256-json-array-v1"
      || canonicalSeeds.some((seed) => seed === null)
      || new Set(canonicalSeeds).size !== canonicalSeeds.length
    ) {
      return {
        id: `${field}-seeds`,
        label,
        passed: false,
        detail: `seeds.${field} is not a valid frozen reveal for ${expectedPartition}`,
      };
    }
    const commitment = createHash("sha256")
      .update(JSON.stringify(seedDocument.seeds))
      .digest("hex");
    if (seedDocument.commitment !== commitment) {
      return {
        id: `${field}-seeds`,
        label,
        passed: false,
        detail: `seeds.${field} commitment does not match its seed list`,
      };
    }
    if (!seedPath.endsWith(".reveal.json")) {
      return {
        id: `${field}-seeds`,
        label,
        passed: false,
        detail: `seeds.${field} must reference a versioned .reveal.json file`,
      };
    }
    const sealedPath = seedPath.replace(/\.reveal\.json$/, ".commit.json");
    const sealedDocument = JSON.parse(await readFile(sealedPath, "utf8"));
    if (
      sealedDocument.schema !== 1
      || sealedDocument.state !== "sealed"
      || sealedDocument.partition !== expectedPartition
      || sealedDocument.algorithm !== seedDocument.algorithm
      || sealedDocument.seed_count !== seedDocument.seeds.length
      || sealedDocument.commitment !== commitment
      || "seeds" in sealedDocument
    ) {
      return {
        id: `${field}-seeds`,
        label,
        passed: false,
        detail: `seeds.${field} reveal does not satisfy its sealed commitment`,
      };
    }
    if (manifest.artifact === "fixture-019") {
      const privateEscrowFailure = fixture019PrivateEscrowCheck(field);
      if (privateEscrowFailure) return privateEscrowFailure;
    }
    return {
      id: `${field}-seeds`,
      label,
      passed: true,
      detail: `seeds.${field} is frozen and its commitment matches`,
    };
  } catch (error) {
    return {
      id: `${field}-seeds`,
      label,
      passed: false,
      detail: `seeds.${field} is invalid: ${error.message}`,
    };
  }
}

async function candidate010SeedReleaseIntegrityCheck(root, manifest, confirmationSeeds, heldOutSeeds) {
  if (manifest.artifact !== "candidate-010") return null;
  const fail = (message) => {
    confirmationSeeds.passed = false;
    heldOutSeeds.passed = false;
    confirmationSeeds.detail = `Candidate 010 seed-release integrity failed: ${message}`;
    heldOutSeeds.detail = confirmationSeeds.detail;
  };
  try {
    const integrity = manifest.seed_integrity;
    if (
      !integrity
      || integrity.operator_contract_version !== SEED_RELEASE_OPERATOR_VERSION
      || integrity.release_plan_contract_version !== SEED_RELEASE_PLAN_VERSION
      || integrity.reveal_attestation_contract_version !== SEED_REVEAL_ATTESTATION_VERSION
      || integrity.required_generation_method !== "system-cryptographic-entropy-v1"
      || integrity.require_claim_eligible !== true
      || integrity.require_joint_release_set !== true
      || !/^[0-9a-f]{64}$/.test(integrity.artifact_schema_sha256 ?? "")
    ) throw new Error("manifest.seed_integrity does not freeze the production operator, plan, attestation, and joint-release requirements");
    const artifactSchema = await repositoryRegularFile(
      root,
      integrity.artifact_schema,
      "Candidate 010 seed artifact schema",
    );
    if (await fileSha256(artifactSchema) !== integrity.artifact_schema_sha256) {
      throw new Error("seed artifact schema SHA-256 does not match the frozen manifest identity");
    }
    const schema = JSON.parse(await readFile(artifactSchema, "utf8"));
    if (
      schema?.$id !== "https://20-watts-was-enough.local/schemas/candidate-010-seed-release-artifacts-v1.json"
      || schema?.definitions?.sealedCommitment?.properties?.operator_contract_version?.const
        !== SEED_RELEASE_OPERATOR_VERSION
      || schema?.definitions?.releasePlan?.properties?.contract_version?.const
        !== SEED_RELEASE_PLAN_VERSION
      || schema?.definitions?.revealAttestation?.properties?.contract_version?.const
        !== SEED_REVEAL_ATTESTATION_VERSION
    ) throw new Error("seed artifact schema does not declare the registered executable contract versions");
    if (!confirmationSeeds.passed || !heldOutSeeds.passed) return null;

    const confirmationPath = await repositoryRegularFile(
      root,
      manifest.seeds.confirmation,
      "Candidate 010 confirmation reveal",
    );
    const heldOutPath = await repositoryRegularFile(
      root,
      manifest.seeds.held_out,
      "Candidate 010 held-out reveal",
    );
    const revealRoot = path.dirname(confirmationPath);
    if (
      path.basename(revealRoot) !== "revealed"
      || path.dirname(heldOutPath) !== revealRoot
      || path.basename(confirmationPath) !== "confirmation.reveal.json"
      || path.basename(heldOutPath) !== "held-out.reveal.json"
    ) throw new Error("both manifest seed roles must name the exact jointly revealed operator directory");
    const validated = await validateSeedReleaseOperatorArtifacts({
      bindingDirectory: path.dirname(revealRoot),
      requireClaimEligible: true,
    });
    if (
      validated.state !== "explicitly-revealed"
      || validated.claim_eligible !== true
      || !/^[0-9a-f]{64}$/.test(validated.plan_sha256 ?? "")
      || !/^[0-9a-f]{64}$/.test(validated.attestation_sha256 ?? "")
    ) throw new Error("the joint operator release is not an explicit claim-eligible reveal");
    const bindingRoot = await realpath(path.dirname(revealRoot));
    const [plan, attestation, confirmationReveal, heldOutReveal] = await Promise.all([
      readFile(path.join(bindingRoot, "seed-release-plan.json"), "utf8").then(JSON.parse),
      readFile(path.join(revealRoot, "seed-reveal-attestation.json"), "utf8").then(JSON.parse),
      readFile(confirmationPath, "utf8").then(JSON.parse),
      readFile(heldOutPath, "utf8").then(JSON.parse),
    ]);
    confirmationSeeds.detail = "seeds.confirmation is an exact claim-eligible joint operator reveal with validated plan, snapshots, commitment, attestation, and disjointness";
    heldOutSeeds.detail = "seeds.held_out is an exact claim-eligible joint operator reveal with validated plan, snapshots, commitment, attestation, and disjointness";
    return Object.freeze({
      bindingRoot,
      revealRoot,
      plan,
      attestation,
      confirmation: Object.freeze({ path: confirmationPath, document: confirmationReveal }),
      heldOut: Object.freeze({ path: heldOutPath, document: heldOutReveal }),
    });
  } catch (error) {
    fail(error.message);
    return null;
  }
}

function sameRealPath(left, right) {
  return path.relative(left, right) === "" && path.relative(right, left) === "";
}

async function candidate010PromotionSeedCrossBinding({
  root,
  manifest,
  seedRelease,
  promotionReleaseRoot,
  promotionReleasePath,
  promotionDisjointPaths,
  evidence,
}) {
  if (manifest.artifact !== "candidate-010") return;
  if (!seedRelease) {
    throw new Error("Candidate 010 promotion requires one validated joint seed-operator release");
  }
  const releaseRoot = await realpath(promotionReleaseRoot);
  if (!isInside(releaseRoot, seedRelease.bindingRoot) || sameRealPath(releaseRoot, seedRelease.bindingRoot)) {
    throw new Error("Candidate 010 seed-operator binding root must be contained by the promotion release root");
  }
  const releaseFile = await repositoryRegularFile(
    root,
    promotionReleasePath,
    "Candidate 010 promotion release",
    { absoluteInput: true },
  );
  const release = JSON.parse(await readFile(releaseFile, "utf8"));
  const snapshotNames = [
    "source_bundle",
    "execution_descriptor",
    "runtime_identity",
    "config",
    "design",
    "backend_registry",
    "preregistration",
  ];
  const evidenceRows = Array.isArray(evidence?.input_files) ? evidence.input_files : [];
  const requireEvidenceIdentity = async (file, scope, label) => {
    const relative = path.relative(releaseRoot, file).replaceAll("\\", "/");
    const digest = await fileSha256(file);
    if (!evidenceRows.some((row) => (
      row.scope === scope
      && row.path === relative
      && row.sha256 === digest
    ))) throw new Error(`Candidate 010 promotion evidence omits the exact ${label}`);
  };
  for (const name of snapshotNames) {
    const operatorBinding = seedRelease.plan.bindings?.[name];
    const releaseBinding = release.bindings?.[name];
    if (
      !operatorBinding
      || !releaseBinding
      || releaseBinding.sha256 !== operatorBinding.sha256
    ) throw new Error(`Candidate 010 promotion release ${name} digest differs from the selected seed-operator plan`);
    const operatorFile = await repositoryRegularFile(
      root,
      path.join(seedRelease.revealRoot, operatorBinding.path),
      `Candidate 010 seed-operator ${name}`,
      { absoluteInput: true },
    );
    const releaseBindingFile = await repositoryRegularFile(
      root,
      path.resolve(releaseRoot, releaseBinding.path),
      `Candidate 010 promotion release ${name}`,
      { absoluteInput: true },
    );
    if (!sameRealPath(operatorFile, releaseBindingFile)) {
      throw new Error(`Candidate 010 promotion release does not consume the selected seed-operator ${name} snapshot`);
    }
    await requireEvidenceIdentity(releaseBindingFile, "release-binding", `${name} snapshot`);
  }

  const exactOperatorFiles = {
    commitment: await repositoryRegularFile(
      root,
      path.join(seedRelease.revealRoot, "confirmation.commit.json"),
      "Candidate 010 operator confirmation commitment",
      { absoluteInput: true },
    ),
    reveal: seedRelease.confirmation.path,
  };
  for (const [name, operatorFile] of Object.entries(exactOperatorFiles)) {
    const releaseBinding = release.bindings?.[name];
    if (!releaseBinding) throw new Error(`Candidate 010 promotion release omits ${name}`);
    const releaseBindingFile = await repositoryRegularFile(
      root,
      path.resolve(releaseRoot, releaseBinding.path),
      `Candidate 010 promotion release ${name}`,
      { absoluteInput: true },
    );
    if (!sameRealPath(operatorFile, releaseBindingFile)) {
      throw new Error(`Candidate 010 promotion release does not consume the exact operator confirmation ${name}`);
    }
    await requireEvidenceIdentity(releaseBindingFile, "release-binding", `operator confirmation ${name}`);
  }
  if (
    release.release_version !== seedRelease.plan.release_version
    || release.source_identity?.source_sha256 !== seedRelease.plan.source_identity.source_sha256
    || release.source_identity?.source_commit !== seedRelease.plan.source_identity.source_commit
    || release.execution_identity?.descriptor_sha256 !== seedRelease.plan.execution_identity.descriptor_sha256
    || release.execution_identity?.source_inventory_sha256 !== seedRelease.plan.execution_identity.source_inventory_sha256
    || release.execution_identity?.dependency_inventory_sha256
      !== seedRelease.plan.execution_identity.dependency_inventory_sha256
    || release.runtime_identity?.identity_sha256 !== seedRelease.plan.runtime_identity.identity_sha256
    || release.runtime_identity?.executable_sha256 !== seedRelease.plan.runtime_identity.executable_sha256
    || release.runtime_identity?.package_lock_sha256 !== seedRelease.plan.runtime_identity.package_lock_sha256
    || release.seed_pack?.commitment !== seedRelease.plan.partitions.confirmation.commitment
    || release.seed_pack?.commitment !== seedRelease.confirmation.document.commitment
    || evidence.release?.seed_commitment !== seedRelease.confirmation.document.commitment
    || evidence.release?.version !== seedRelease.plan.release_version
  ) throw new Error("Candidate 010 promotion release/evidence identities differ from the selected seed-operator plan");

  if (
    promotionDisjointPaths.length !== 1
    || !sameRealPath(await realpath(promotionDisjointPaths[0]), seedRelease.heldOut.path)
  ) throw new Error("Candidate 010 promotion must use the exact operator held-out reveal as its disjoint pack");
  await requireEvidenceIdentity(seedRelease.heldOut.path, "disjoint-seed-pack", "operator held-out reveal");
  if (
    seedRelease.attestation.partitions?.confirmation?.commitment
      !== seedRelease.confirmation.document.commitment
    || seedRelease.attestation.partitions?.["held-out"]?.commitment
      !== seedRelease.heldOut.document.commitment
    || seedRelease.attestation.plan_sha256 !== seedRelease.plan.plan_sha256
  ) throw new Error("Candidate 010 reveal attestation is not bound to the promotion seed partitions");
}

async function artifactProtocolEligibility(root, manifest) {
  const declaration = manifest.promotion_evidence?.protocol_eligibility;
  const claims = executionClaimScope(manifest);
  if (
    !declaration
    || typeof declaration.protocol_version !== "string"
    || declaration.protocol_version.trim() === ""
    || JSON.stringify([...(declaration.claim_scope ?? [])].sort()) !== JSON.stringify([...claims].sort())
    || !Array.isArray(declaration.blockers)
  ) {
    return {
      eligible: false,
      detail: "artifact-declared promotion lacks a claim-bound protocol-eligibility declaration",
      binding: null,
    };
  }
  if (declaration.status === "blocked") {
    return {
      eligible: false,
      detail: declaration.blockers.length > 0
        ? `artifact protocol is structurally blocked: ${declaration.blockers.join(" ")}`
        : "artifact protocol is structurally blocked without a reviewed eligibility release",
      binding: null,
    };
  }
  if (declaration.status !== "reviewed-eligible" || declaration.blockers.length !== 0) {
    return {
      eligible: false,
      detail: "artifact protocol eligibility status is invalid or retains blockers",
      binding: null,
    };
  }
  try {
    const reviewPath = await repositoryRegularFile(
      root,
      declaration.review_path,
      "protocol eligibility review",
    );
    const reviewSha256 = await fileSha256(reviewPath);
    if (reviewSha256 !== declaration.review_sha256) {
      return { eligible: false, detail: "protocol eligibility review hash does not match", binding: null };
    }
    return {
      eligible: true,
      detail: "claim-bound protocol eligibility has a content-identified review",
      binding: {
        artifact: manifest.artifact,
        status: "reviewed-eligible",
        protocol_version: declaration.protocol_version,
        claim_scope: [...claims],
        review_sha256: reviewSha256,
      },
    };
  } catch (error) {
    return { eligible: false, detail: `protocol eligibility review is invalid: ${error.message}`, binding: null };
  }
}

async function workstationTestPipelineCovers(root) {
  const packagePath = await repositoryRegularFile(root, "package.json", "package.json");
  const packageDocument = JSON.parse(await readFile(packagePath, "utf8"));
  return packageDocument.scripts?.test?.includes("npm run test:workstation") === true
    && packageDocument.scripts?.["test:workstation"]
      === "go -C tooling run ./cmd/20w ci run-workstation --root ..";
}

export async function workstationPromotionChecks(root, manifest) {
  const fullProfile = localPath(root, manifest.data?.full_profile);
  const fullProfileExists = Boolean(fullProfile && (await exists(fullProfile)));
  let fullProfileFrozen = false;
  let fullProfileSchemaVersion = null;
  let fullProfileCardinalityFields = [];
  if (fullProfileExists && /^[0-9a-f]{64}$/.test(manifest.data?.full_profile_sha256 ?? "")) {
    try {
      const profile = JSON.parse(await readFile(fullProfile, "utf8"));
      const profileContract = fullProfileContracts.get(manifest.artifact);
      const declaredPerSeedFields = Object.keys(profile)
        .filter((field) => /^[a-z][a-z0-9_]*_per_seed$/.test(field))
        .sort();
      const expectedPerSeedFields = [...(profileContract?.cardinalityFields ?? [])].sort();
      fullProfileSchemaVersion = profile.schema;
      fullProfileCardinalityFields = expectedPerSeedFields;
      fullProfileFrozen = Boolean(profileContract)
        && profile.schema === profileContract.schema
        && profile.artifact === manifest.artifact
        && profile.profile === profileContract.profile
        && JSON.stringify(declaredPerSeedFields) === JSON.stringify(expectedPerSeedFields)
        && expectedPerSeedFields.every((field) => Number.isSafeInteger(profile[field]) && profile[field] > 0)
        && await fileSha256(fullProfile) === manifest.data.full_profile_sha256
        && await embeddedFullProfileClosureFrozen(root, fullProfile, profile);
    } catch {
      fullProfileFrozen = false;
    }
  }
  const fullTests = Array.isArray(manifest.implementation?.full_tests)
    ? manifest.implementation.full_tests
    : [];
  const fullTestPaths = fullTests.map((value) => localPath(root, value));
  let workstationTestPipeline;
  try {
    workstationTestPipeline = await workstationTestPipelineCovers(root);
  } catch {
    workstationTestPipeline = false;
  }
  const fullTestsExist = fullTests.length > 0 && fullTestPaths.every(Boolean)
    && fullTests.every((value) => manifest.implementation?.tests?.includes(value))
    && fullTests.every((value) => value.endsWith(".test.mjs"))
    && (await Promise.all(fullTestPaths.map((value) => exists(value)))).every(Boolean)
    && workstationTestPipeline;
  const energyProvider = localPath(root, manifest.energy?.provider_config);
  let energyProviderValid = false;
  if (
    manifest.energy?.required === true
    && energyProvider
    && await exists(energyProvider)
    && /^[0-9a-f]{64}$/.test(manifest.energy?.provider_config_sha256 ?? "")
  ) {
    try {
      const provider = JSON.parse(await readFile(energyProvider, "utf8"));
      const providerModule = localPath(root, provider.provider_module);
      energyProviderValid = provider.schema === 1
        && provider.artifact === manifest.artifact
        && provider.confirmation_record_kind === "hardware-observation"
        && provider.software_telemetry_is_measured_energy === false
        && provider.test_fixtures_are_claim_eligible === false
        && provider.modeled_energy_is_claim_eligible === false
        && provider.missing_or_invalid_reading_policy === "fail-confirmation-closed"
        && Boolean(providerModule && await exists(providerModule))
        && await fileSha256(energyProvider) === manifest.energy.provider_config_sha256
        && manifest.implementation?.tests?.some((value) => value.endsWith("energy-provider.test.mjs"));
    } catch {
      energyProviderValid = false;
    }
  }
  const explicitNonEnergyScope = manifest.energy?.required === false
    && manifest.energy?.mode === "not-measured"
    && manifest.energy?.applicability === "not-applicable-to-scoped-claim"
    && manifest.energy?.energy_conclusion_allowed === false
    && typeof manifest.energy?.not_applicable_reason === "string"
    && manifest.energy.not_applicable_reason.trim().length > 0
    && hasReviewedNonEnergyScope(manifest);
  const energyBoundaryValid = energyProviderValid || explicitNonEnergyScope;
  const resumeModule = localPath(root, manifest.resume?.module);
  const resumeTest = localPath(root, manifest.resume?.test);
  let resumeIntegrated = false;
  if (
    manifest.resume?.supported === true
    && resumeModule
    && resumeTest
    && await exists(resumeModule)
    && await exists(resumeTest)
    && manifest.implementation?.tests?.includes(manifest.resume.test)
  ) {
    const entrypoint = localPath(root, manifest.implementation?.entrypoint);
    const source = entrypoint && await exists(entrypoint) ? await readFile(entrypoint, "utf8") : "";
    resumeIntegrated = source.includes("openCheckpointLedger") && source.includes("remainingWorkUnits");
  }
  const executionClaims = executionClaimScope(manifest);
  const validExecutionClaimScope = await validateExecutionClaimScope(root, manifest, executionClaims);
  const confirmationSeeds = await committedSeedCheck(root, manifest, "confirmation", "Frozen confirmation seeds");
  const heldOutSeeds = await committedSeedCheck(root, manifest, "held_out", "Frozen held-out seeds");
  if (confirmationSeeds.passed && heldOutSeeds.passed) {
    try {
      const developmentPath = localPath(root, manifest.seeds?.development);
      const confirmationPath = localPath(root, manifest.seeds?.confirmation);
      const heldOutPath = localPath(root, manifest.seeds?.held_out);
      const packs = await Promise.all([developmentPath, confirmationPath, heldOutPath].map(async (file) => (
        JSON.parse(await readFile(file, "utf8")).seeds
      )));
      const normalizeSeed = (seed) => {
        if (Number.isInteger(seed) && seed >= 0) return BigInt(seed).toString();
        if (typeof seed === "string" && /^(?:0|[1-9][0-9]{0,19})$/.test(seed)) {
          return BigInt(seed).toString();
        }
        return `invalid:${String(seed)}`;
      };
      const allSeeds = packs.flat().map(normalizeSeed);
      if (allSeeds.length !== new Set(allSeeds).size) {
        confirmationSeeds.passed = false;
        heldOutSeeds.passed = false;
        confirmationSeeds.detail = "development, confirmation, and held-out seed packs must be disjoint";
        heldOutSeeds.detail = confirmationSeeds.detail;
      }
    } catch {
      confirmationSeeds.passed = false;
      heldOutSeeds.passed = false;
      confirmationSeeds.detail = "seed-pack disjointness could not be verified";
      heldOutSeeds.detail = confirmationSeeds.detail;
    }
  }
  const candidate010SeedRelease = await candidate010SeedReleaseIntegrityCheck(
    root,
    manifest,
    confirmationSeeds,
    heldOutSeeds,
  );
  const hashChainIntegrated = manifest.outputs?.hash_chain === true
    && resumeIntegrated
    && manifest.implementation?.tests?.some((value) => /checkpoint|runner/.test(value));
  const promotion = manifest.promotion_evidence;
  const promotionEvidencePath = localPath(root, promotion?.evidence_path);
  const promotionValidationReceiptPath = localPath(root, promotion?.promotion_validation_receipt_path);
  const promotionRunDirectory = localPath(root, promotion?.run_directory);
  const promotionReleaseRoot = localPath(root, promotion?.release_root);
  const promotionReleasePath = localPath(root, promotion?.release_path);
  const promotionEnergyPath = localPath(root, promotion?.energy_assignments_path);
  const promotionDisjointPaths = Array.isArray(promotion?.disjoint_seed_pack_paths)
    ? promotion.disjoint_seed_pack_paths.map((value) => localPath(root, value))
    : [];
  const declaredArtifactValidator = manifest.artifact !== "candidate-010" && Boolean(promotion?.validator);
  const protocolEligibility = declaredArtifactValidator
    ? await artifactProtocolEligibility(root, manifest)
    : { eligible: true, detail: "candidate-specific promotion contract", binding: null };
  let promotionEvidenceValid = false;
  let promotionEvidenceDetail = "strict promotion evidence is pending and no claim-eligible bundle exists";
  if (declaredArtifactValidator && !protocolEligibility.eligible) {
    promotionEvidenceDetail = protocolEligibility.detail;
  } else if (
    manifest.readiness === "workstation-ready"
    && promotion?.status === "present"
    && promotionEvidencePath
    && promotionValidationReceiptPath
    && promotionRunDirectory
    && promotionReleaseRoot
    && promotionReleasePath
    && promotionEnergyPath
    && promotionDisjointPaths.length > 0
    && promotionDisjointPaths.every(Boolean)
    && await exists(promotionEvidencePath)
    && await exists(promotionValidationReceiptPath)
    && await exists(promotionRunDirectory)
    && await exists(promotionReleaseRoot)
    && await exists(promotionReleasePath)
    && await exists(promotionEnergyPath)
    && (await Promise.all(promotionDisjointPaths.map((value) => exists(value)))).every(Boolean)
    && (
      manifest.artifact === "candidate-010"
        ? manifest.implementation?.tests?.includes("experiments/workstation/candidate-010/promotion-evidence.test.mjs")
        : manifest.implementation?.tests?.includes(promotion?.validator?.test)
    )
  ) {
    try {
      const [evidenceFile, receiptFile] = await Promise.all([
        repositoryRegularFile(root, promotionEvidencePath, "promotion evidence", { absoluteInput: true }),
        repositoryRegularFile(
          root,
          promotionValidationReceiptPath,
          "promotion validation launch receipt",
          { absoluteInput: true },
        ),
      ]);
      const [evidence, launchReceipt] = await Promise.all([
        readFile(evidenceFile, "utf8").then(JSON.parse),
        readFile(receiptFile, "utf8").then(JSON.parse),
      ]);
      const promotionPaths = {
        runDirectory: promotionRunDirectory,
        releaseBindingRoot: promotionReleaseRoot,
        releasePath: promotionReleasePath,
        energyAssignmentsPath: promotionEnergyPath,
        disjointSeedPackPaths: promotionDisjointPaths,
      };
      if (manifest.artifact === "candidate-010") {
        await candidate010PromotionSeedCrossBinding({
          root,
          manifest,
          seedRelease: candidate010SeedRelease,
          promotionReleaseRoot,
          promotionReleasePath,
          promotionDisjointPaths,
          evidence,
        });
        const persistedValidation = await validateDurablePromotionEvidence(
          evidence,
          launchReceipt,
          promotionPaths,
        );
        // The stored v1 receipt is self-digested diagnostic provenance only.
        // Claim authority comes from this new live capsule recomputation.
        const fresh = await runCapsulePromotionValidationOperator({
          evidence,
          paths: promotionPaths,
          capsuleParent: os.tmpdir(),
        });
        const freshValidation = await validateDurablePromotionEvidence(
          evidence,
          fresh.launch_receipt,
          promotionPaths,
        );
        promotionEvidenceValid = persistedValidation.valid === true
          && freshValidation.valid === true
          && fresh.capsule_destroyed === true
          && fresh.action_result?.evidence_sha256 === evidence.evidence_sha256;
        if (promotionEvidenceValid) {
          promotionEvidenceDetail = "fresh live capsule recomputation validated every bound input and its exact joint seed-operator plan/reveals; stored receipt integrity is diagnostic, not authenticity";
        }
      } else {
        const validator = promotion?.validator;
        if (
          !validator
          || typeof validator.export !== "string"
          || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(validator.export)
        ) throw new Error("artifact-declared promotion validator binding is missing or invalid");
        const [modulePath, testPath] = await Promise.all([
          repositoryRegularFile(root, validator.module, "promotion validator module"),
          repositoryRegularFile(root, validator.test, "promotion validator test"),
        ]);
        const registeredTests = manifest.implementation?.tests ?? [];
        const registeredRealPaths = await Promise.all(registeredTests.map(async (value) => {
          const candidate = localPath(root, value);
          return candidate && await exists(candidate) ? realpath(candidate) : null;
        }));
        if (!registeredRealPaths.includes(testPath)) {
          throw new Error("promotion validator test is not registered in implementation.tests");
        }
        const moduleUrl = pathToFileURL(modulePath);
        moduleUrl.searchParams.set("source_sha256", await fileSha256(modulePath));
        const implementation = await import(moduleUrl.href);
        if (typeof implementation[validator.export] !== "function") {
          throw new Error(`promotion validator export ${validator.export} is not a function`);
        }
        const result = await implementation[validator.export]({
          repositoryRoot: path.resolve(root),
          manifest,
          evidence,
          launchReceipt,
          paths: promotionPaths,
        });
        const actualBinding = result?.eligibility_binding;
        const expectedBinding = protocolEligibility.binding;
        const eligibilityBindingMatches = actualBinding?.artifact === expectedBinding.artifact
          && actualBinding.status === expectedBinding.status
          && actualBinding.protocol_version === expectedBinding.protocol_version
          && actualBinding.review_sha256 === expectedBinding.review_sha256
          && JSON.stringify([...(actualBinding.claim_scope ?? [])].sort())
            === JSON.stringify([...expectedBinding.claim_scope].sort());
        promotionEvidenceValid = result?.valid === true
          && result?.fresh_recomputation === true
          && eligibilityBindingMatches;
        promotionEvidenceDetail = promotionEvidenceValid
          ? "artifact-declared validator freshly recomputed every bound input under the reviewed protocol binding"
          : "artifact-declared promotion validator did not return a fresh valid recomputation bound to the reviewed protocol";
      }
    } catch (error) {
      promotionEvidenceValid = false;
      promotionEvidenceDetail = `strict promotion evidence validation failed: ${error.message}`;
    }
  } else if (promotion?.status === "present") {
    promotionEvidenceDetail = "present promotion evidence is missing required repository paths, files, or its registered hostile test";
  }

  return [
    {
      id: "execution-claim-scope",
      label: "Explicit execution-track claim scope",
      passed: validExecutionClaimScope,
      detail: validExecutionClaimScope
        ? `execution track is limited to ${executionClaims.join(", ")}`
        : "implementation.execution_claims must name at least one exact claim ID",
    },
    {
      id: "full-profile",
      label: "Frozen full profile",
      passed: fullProfileFrozen,
      detail: fullProfileFrozen
        ? `data.full_profile schema ${fullProfileSchemaVersion}, development identity, ${fullProfileCardinalityFields.join(", ")} workload cardinality, direct SHA-256, and any declared embedded seed/config hashes match repository files`
        : "data.full_profile must match its registered artifact, development profile, schema version, exact positive safe-integer workload cardinality fields, full_profile_sha256, and any declared embedded seed/config hashes",
    },
    {
      id: "full-tests",
      label: "Full experiment-path tests",
      passed: fullTestsExist,
      detail: fullTestsExist
        ? "implementation.full_tests is part of the workstation suite executed by npm test"
        : "implementation.full_tests must name an existing test in the workstation suite executed by npm test",
    },
    {
      id: "hash-chain",
      label: "Corruption-evident output ledger",
      passed: hashChainIntegrated,
      detail: hashChainIntegrated
        ? "hash-chain output is wired through the tested checkpoint ledger"
        : "outputs.hash_chain must be wired through a tested ledger implementation",
    },
    {
      id: "resume",
      label: "Deterministic resume",
      passed: resumeIntegrated,
      detail: resumeIntegrated
        ? "runner imports the declared, tested checkpoint/resume implementation"
        : "resume must declare an existing module/test and be integrated by the runner",
    },
    {
      id: "energy-provider",
      label: "Measured-energy or explicit non-energy boundary",
      passed: energyBoundaryValid,
      detail: energyProviderValid
        ? "external-meter provider capability, exclusions, test, and frozen config hash match"
        : explicitNonEnergyScope
          ? "the scoped claim has no energy endpoint and the manifest forbids energy conclusions"
          : "energy provider config/module/test and frozen hash must enforce measured energy, or a non-energy claim must explicitly forbid energy conclusions",
    },
    confirmationSeeds,
    heldOutSeeds,
    {
      id: "promotion-evidence",
      label: "Strict recomputed promotion evidence",
      passed: promotionEvidenceValid,
      detail: promotionEvidenceDetail,
    },
  ];
}

export async function validateExecutionManifest(root, manifestPath, expectedArtifact = null) {
  const errors = [];
  let resolvedManifest;
  let manifest;
  try {
    resolvedManifest = await repositoryRegularFile(
      root,
      manifestPath,
      "execution manifest",
      { absoluteInput: true },
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ready: false, readiness: "absent", errors: ["manifest"] };
    }
    return { ready: false, readiness: "invalid", errors: [error.message] };
  }
  try {
    manifest = JSON.parse(await readFile(resolvedManifest, "utf8"));
  } catch (error) {
    return { ready: false, readiness: "invalid", errors: [`invalid JSON: ${error.message}`] };
  }

  try {
    errors.push(...await validateAgainstManifestSchema(root, manifest));
  } catch (error) {
    errors.push(`manifest schema validation failed: ${error.message}`);
  }

  if (manifest.schema !== 1) errors.push("schema must equal 1");
  if (!/^candidate-\d{3}$|^fixture-\d{3}$/.test(manifest.artifact ?? "")) {
    errors.push("artifact must be candidate-NNN or fixture-NNN");
  }
  if (expectedArtifact && manifest.artifact !== expectedArtifact) {
    errors.push(`artifact must equal ${expectedArtifact}`);
  }
  if (!readinessLevels.has(manifest.readiness)) {
    errors.push("readiness must be scaffold, smoke-ready, or workstation-ready");
  }

  for (const action of commandActions) {
    if (typeof manifest.command?.[action] !== "string" || !manifest.command[action].trim()) {
      errors.push(`command.${action} is required`);
    }
  }
  if (!Array.isArray(manifest.environment?.lockfiles) || !manifest.environment.lockfiles.length) {
    errors.push("environment.lockfiles must name at least one lockfile");
  }
  if (!manifest.hardware?.smoke || !manifest.hardware?.workstation) {
    errors.push("hardware.smoke and hardware.workstation are required");
  }
  if (!manifest.data || !manifest.outputs || !manifest.implementation) {
    errors.push("data, outputs, and implementation objects are required");
  }
  if (manifest.outputs?.append_only !== true) {
    errors.push("outputs.append_only must be true");
  }
  if (!Array.isArray(manifest.implementation?.tests) || !manifest.implementation.tests.length) {
    errors.push("implementation.tests must name at least one test file");
  }
  const promotion = manifest.promotion_evidence;
  if (!promotion || !new Set(["pending", "present"]).has(promotion.status)) {
    errors.push("promotion_evidence.status must be pending or present");
  } else {
    const promotionPaths = [
      ["promotion_evidence.evidence_path", promotion.evidence_path],
      ["promotion_evidence.run_directory", promotion.run_directory],
      ["promotion_evidence.release_root", promotion.release_root],
      ["promotion_evidence.release_path", promotion.release_path],
      ["promotion_evidence.energy_assignments_path", promotion.energy_assignments_path],
      ...(Array.isArray(promotion.disjoint_seed_pack_paths)
        ? promotion.disjoint_seed_pack_paths.map((value) => ["promotion_evidence.disjoint_seed_pack_paths", value])
        : []),
    ];
    if (!Array.isArray(promotion.disjoint_seed_pack_paths) || promotion.disjoint_seed_pack_paths.length === 0) {
      errors.push("promotion_evidence.disjoint_seed_pack_paths must name at least one repository-relative artifact");
    }
    for (const [field, value] of promotionPaths) {
      if (!localPath(root, value)) errors.push(`${field} must be a repository-relative path`);
    }
  }
  const executionClaims = executionClaimScope(manifest);
  if (!executionClaims.length) {
    errors.push("implementation.execution_claims must name at least one claim");
  } else {
    if (executionClaims.some((claim) => !claimIdPattern.test(claim))) {
      errors.push("implementation.execution_claims must contain exact C-NNN or C-NNNN identifiers");
    }
    if (new Set(executionClaims).size !== executionClaims.length) {
      errors.push("implementation.execution_claims must not contain duplicates");
    }
  }

  for (const [field, value] of collectReferencedPaths(manifest)) {
    try {
      await repositoryRegularFile(root, value, field);
    } catch (error) {
      errors.push(error.message);
    }
  }
  errors.push(...await validateRuntimeSchemaBinding(root, manifest));
  errors.push(...await validateCandidate010ExecutionProjection(root, manifestPath, manifest));

  if (manifest.readiness === "workstation-ready") {
    if (manifest.outputs?.hash_chain !== true) errors.push("workstation-ready outputs.hash_chain must be true");
    if (manifest.resume?.supported !== true) errors.push("workstation-ready resume.supported must be true");
    const explicitNonEnergyScope = manifest.energy?.required === false
      && manifest.energy?.mode === "not-measured"
      && manifest.energy?.applicability === "not-applicable-to-scoped-claim"
      && manifest.energy?.energy_conclusion_allowed === false
      && typeof manifest.energy?.not_applicable_reason === "string"
      && manifest.energy.not_applicable_reason.trim().length > 0
      && hasReviewedNonEnergyScope(manifest);
    if (manifest.energy?.required !== true && !explicitNonEnergyScope) {
      errors.push("workstation-ready requires measured energy unless the scoped claim explicitly has no energy endpoint and forbids energy conclusions");
    }
    const fullReferences = [
      ["data.full_profile", manifest.data?.full_profile],
      ...(manifest.energy?.required === true
        ? [["energy.provider_config", manifest.energy?.provider_config]]
        : []),
      ...(Array.isArray(manifest.implementation?.full_tests)
        ? manifest.implementation.full_tests.map((value) => ["implementation.full_tests", value])
        : []),
    ];
    if (!manifest.implementation?.full_tests?.length) {
      errors.push("workstation-ready implementation.full_tests must name at least one test");
    }
    for (const [field, value] of fullReferences) {
      const absolute = localPath(root, value);
      if (!absolute || !(await exists(absolute))) errors.push(`${field} must reference an existing repository file`);
    }
    for (const field of ["confirmation", "held_out"]) {
      const seedPath = localPath(root, manifest.seeds?.[field]);
      if (!seedPath || !(await exists(seedPath))) continue;
      try {
        const seedDocument = JSON.parse(await readFile(seedPath, "utf8"));
        if (!Array.isArray(seedDocument.seeds) || !seedDocument.seeds.length) {
          errors.push(`workstation-ready seeds.${field} must disclose a non-empty seed list`);
          continue;
        }
        const commitment = createHash("sha256")
          .update(JSON.stringify(seedDocument.seeds))
          .digest("hex");
        if (seedDocument.commitment !== commitment) {
          errors.push(`workstation-ready seeds.${field} commitment does not match its seed list`);
        }
      } catch (error) {
        errors.push(`workstation-ready seeds.${field} is invalid: ${error.message}`);
      }
    }
  }

  const promotionChecks = await workstationPromotionChecks(root, manifest);
  if (manifest.readiness === "workstation-ready") {
    for (const check of promotionChecks.filter((entry) => !entry.passed)) {
      errors.push(`workstation-ready promotion check failed: ${check.id} — ${check.detail}`);
    }
  }

  return {
    ready: errors.length === 0
      && manifest.readiness === "workstation-ready"
      && promotionChecks.every((check) => check.passed),
    readiness: errors.length ? "invalid" : manifest.readiness,
    errors,
    manifest,
    executionClaims,
    promotionChecks,
  };
}

export async function validateAllExecutionManifests(root) {
  const directory = path.join(root, "experiments", "workstation", "manifests");
  let entries;
  try {
    entries = (await readdir(directory)).filter((entry) => entry.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    const manifestPath = path.join(directory, entry);
    const expectedArtifact = path.basename(entry, ".json");
    results.push({
      path: manifestPath,
      expectedArtifact,
      ...(await validateExecutionManifest(root, manifestPath, expectedArtifact)),
    });
  }
  return results;
}
