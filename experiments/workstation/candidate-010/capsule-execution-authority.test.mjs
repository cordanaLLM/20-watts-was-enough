import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  buildExecutionCapsule,
  destroyExecutionCapsule,
} from "./execution-capsule.mjs";
import { captureRuntimeIdentity } from "./runtime-identity.mjs";
import { computeSourceBundle } from "./source-bundle.mjs";

const executeFile = promisify(execFile);
const worktreeCandidateRoot = path.dirname(fileURLToPath(import.meta.url));
const worktreeRepositoryRoot = path.resolve(worktreeCandidateRoot, "..", "..", "..");
const candidateDirectory = "experiments/workstation/candidate-010";
const authorityRelative = `${candidateDirectory}/capsule-execution-authority.mjs`;
const moduleNames = Object.freeze([
  "capsule-execution-authority.mjs",
  "checkpoint.mjs",
  "execution-capsule.mjs",
  "immutable-capsule.mjs",
  "opened-file.mjs",
  "runtime-identity.mjs",
  "source-bundle.mjs",
]);
const sourcePaths = Object.freeze([
  "package-lock.json",
  "package.json",
  ...moduleNames.map((name) => `${candidateDirectory}/${name}`),
].sort());

async function git(repositoryRoot, ...args) {
  return executeFile("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fixture() {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "20w authority fixture ü-"));
  const repositoryRoot = path.join(testRoot, "repository Ω with spaces");
  const firstParent = path.join(testRoot, "outer one 漢字");
  const secondParent = path.join(testRoot, "outer two ü");
  const candidateRoot = path.join(repositoryRoot, ...candidateDirectory.split("/"));
  await mkdir(candidateRoot, { recursive: true });
  await mkdir(firstParent);
  await mkdir(secondParent);
  for (const name of moduleNames) {
    await copyFile(path.join(worktreeCandidateRoot, name), path.join(candidateRoot, name));
  }

  const dependencyMetadata = JSON.parse(await readFile(
    path.join(worktreeRepositoryRoot, "node_modules", "es-module-lexer", "package.json"),
    "utf8",
  ));
  const requirement = `^${dependencyMetadata.version}`;
  await writeJson(path.join(repositoryRoot, "package.json"), {
    name: "capsule-authority-fixture",
    private: true,
    devDependencies: { "es-module-lexer": requirement },
  });
  await writeJson(path.join(repositoryRoot, "package-lock.json"), {
    name: "capsule-authority-fixture",
    lockfileVersion: 3,
    packages: {
      "": { devDependencies: { "es-module-lexer": requirement } },
      "node_modules/es-module-lexer": { version: dependencyMetadata.version },
    },
  });
  await cp(
    path.join(worktreeRepositoryRoot, "node_modules", "es-module-lexer"),
    path.join(repositoryRoot, "node_modules", "es-module-lexer"),
    { recursive: true },
  );
  await git(repositoryRoot, "init", "--quiet");
  await git(repositoryRoot, "config", "user.name", "Capsule Authority Test");
  await git(repositoryRoot, "config", "user.email", "authority@example.invalid");
  await git(repositoryRoot, "config", "commit.gpgsign", "false");
  await git(repositoryRoot, "config", "core.autocrlf", "false");
  await git(repositoryRoot, "add", "--", ...sourcePaths);
  await git(repositoryRoot, "commit", "--quiet", "-m", "authority fixture");
  const headCommit = (await git(repositoryRoot, "rev-parse", "HEAD")).stdout.trim();
  const expectedSourceBundle = await computeSourceBundle({
    root: repositoryRoot,
    sourceFiles: sourcePaths,
    vcs: { source_commit: headCommit, worktree_state: "clean-fixture" },
  });
  const runtimeIdentity = await captureRuntimeIdentity({ repositoryRoot, candidateRoot });
  return {
    testRoot,
    repositoryRoot,
    candidateRoot,
    firstParent,
    secondParent,
    expectedSourceBundle,
    runtimeIdentity,
  };
}

async function build(value, executionParent = value.firstParent) {
  return buildExecutionCapsule({
    repositoryRoot: value.repositoryRoot,
    executionParent,
    runtimeIdentity: value.runtimeIdentity,
    sourcePaths,
    candidateDirectory,
  });
}

async function authorityModule(capsule, query = "") {
  const file = path.join(capsule.local.source_root, ...authorityRelative.split("/"));
  return import(`${pathToFileURL(file).href}${query}`);
}

async function cleanup(value, capsules = []) {
  for (const capsule of capsules) {
    if (capsule) await destroyExecutionCapsule(capsule).catch(() => {});
  }
  assert.ok(value.testRoot.startsWith(os.tmpdir()));
  await rm(value.testRoot, { recursive: true, force: true });
}

test("worktree authority module import fails closed before exporting a usable factory", async () => {
  const url = new URL(`./capsule-execution-authority.mjs?worktree-refusal=${Date.now()}`, import.meta.url);
  await assert.rejects(
    import(url.href),
    (error) => (
      error.name === "CapsuleExecutionAuthorityError"
      && error.code === "CANDIDATE_010_CAPSULE_EXECUTION_AUTHORITY_WORKTREE_IMPORT"
    ),
  );
});

test("capsule-relative creator issues a callback-scoped nonserializable capability bound to every identity", async () => {
  const value = await fixture();
  let capsule;
  let escapedCapability;
  try {
    capsule = await build(value);
    const authority = await authorityModule(capsule);
    const input = { executionCapsule: capsule, expectedSourceBundle: value.expectedSourceBundle };
    const result = await authority.withVerifiedCapsuleExecutionAuthority(input, async (capability) => {
      escapedCapability = capability;
      assert.equal(JSON.stringify(capability), undefined);
      assert.throws(() => structuredClone(capability), /could not be cloned|DataCloneError/i);
      assert.throws(() => capability(), /opaque capability and is not callable/i);
      const binding = await authority.assertCapsuleExecutionAuthority(capability, input);
      assert.deepEqual(binding, {
        authority_version: authority.CAPSULE_EXECUTION_AUTHORITY_VERSION,
        execution_descriptor_sha256: capsule.descriptor.descriptor_sha256,
        source_bundle_sha256: value.expectedSourceBundle.source_sha256,
        source_inventory_sha256: capsule.descriptor.source.inventory_sha256,
        runtime_identity_sha256: capsule.descriptor.runtime_identity.identity_sha256,
        dependency_inventory_sha256: capsule.descriptor.dependencies.inventory.inventory_sha256,
        source_root: capsule.local.source_root,
        head_commit: capsule.descriptor.source.head_commit,
      });
      return "executed only inside verified callback";
    });
    assert.equal(result, "executed only inside verified callback");
    await assert.rejects(
      authority.assertCapsuleExecutionAuthority(escapedCapability, input),
      /forged, cloned, foreign, or revoked/,
    );
    assert.equal(authority.CAPSULE_EXECUTION_AUTHORITY_LIMITS.confirmation_claim_eligible, false);
    assert.equal(authority.CAPSULE_EXECUTION_AUTHORITY_LIMITS.release_authority, false);
    assert.equal(authority.CAPSULE_EXECUTION_AUTHORITY_LIMITS.malicious_host_toctou_closed, false);
  } finally {
    await cleanup(value, [capsule]);
  }
});

test("field forgery, serialization reconstruction, and a different module instance cannot assert authority", async () => {
  const value = await fixture();
  let capsule;
  try {
    capsule = await build(value);
    const authority = await authorityModule(capsule);
    const foreignInstance = await authorityModule(capsule, "?foreign-instance=1");
    const input = { executionCapsule: capsule, expectedSourceBundle: value.expectedSourceBundle };
    await authority.withVerifiedCapsuleExecutionAuthority(input, async (capability) => {
      const forgedFunction = Object.assign(() => {}, {
        execution_descriptor_sha256: capsule.descriptor.descriptor_sha256,
        source_bundle_sha256: value.expectedSourceBundle.source_sha256,
      });
      await assert.rejects(authority.assertCapsuleExecutionAuthority(forgedFunction, input), /forged|cloned/);
      await assert.rejects(authority.assertCapsuleExecutionAuthority({}, input), /forged|cloned/);
      await assert.rejects(
        foreignInstance.assertCapsuleExecutionAuthority(capability, input),
        /forged, cloned, foreign, or revoked/,
      );
    });
  } finally {
    await cleanup(value, [capsule]);
  }
});

test("different capsule root and mutable expected identity are rejected", async () => {
  const value = await fixture();
  let first;
  let second;
  try {
    first = await build(value, value.firstParent);
    second = await build(value, value.secondParent);
    const authority = await authorityModule(first);
    const firstInput = { executionCapsule: first, expectedSourceBundle: value.expectedSourceBundle };
    const secondInput = { executionCapsule: second, expectedSourceBundle: value.expectedSourceBundle };
    await authority.withVerifiedCapsuleExecutionAuthority(firstInput, async (capability) => {
      await assert.rejects(
        authority.assertCapsuleExecutionAuthority(capability, secondInput),
        /different source root/,
      );
    });

    const mutableBundle = structuredClone(value.expectedSourceBundle);
    const mutableInput = { executionCapsule: first, expectedSourceBundle: mutableBundle };
    await assert.rejects(
      authority.withVerifiedCapsuleExecutionAuthority(mutableInput, async (capability) => {
        mutableBundle.files[0].sha256 = "0".repeat(64);
        await assert.rejects(
          authority.assertCapsuleExecutionAuthority(capability, mutableInput),
          /validation failed|source/i,
        );
      }),
      /validation failed|source/i,
    );
  } finally {
    await cleanup(value, [first, second]);
  }
});

test("dependency byte mutation during callback invalidates authority before it can escape", async () => {
  const value = await fixture();
  let capsule;
  try {
    capsule = await build(value);
    const authority = await authorityModule(capsule);
    const input = { executionCapsule: capsule, expectedSourceBundle: value.expectedSourceBundle };
    const target = path.join(capsule.local.dependency_root, "es-module-lexer", "dist", "lexer.js");
    await assert.rejects(
      authority.withVerifiedCapsuleExecutionAuthority(input, async (capability) => {
        await chmod(target, 0o600);
        const body = await readFile(target);
        body[0] ^= 1;
        await writeFile(target, body);
        await assert.rejects(
          authority.assertCapsuleExecutionAuthority(capability, input),
          /validation failed|dependency/i,
        );
      }),
      /validation failed|dependency/i,
    );
  } finally {
    await cleanup(value, [capsule]);
  }
});
