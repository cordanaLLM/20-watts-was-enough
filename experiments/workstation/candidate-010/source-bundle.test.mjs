import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  CANDIDATE_010_SOURCE_FILES,
  CANDIDATE_010_TEST_SUPPORT_FILES,
  candidate010ExecutionManifestProjection,
  captureCandidate010SourceBundle,
  computeSourceBundle,
  discoverCandidate010SourceFiles,
  readCandidate010SourceCommit,
  verifyCandidate010SourceBundleAtRoot,
} from "./source-bundle.mjs";

const executeFile = promisify(execFile);

async function git(repositoryRoot, ...arguments_) {
  return executeFile("git", ["-C", repositoryRoot, ...arguments_], {
    encoding: "utf8",
    env: {
      ...process.env,
      // Git's documented "skip this level" literal; Git for Windows maps it to
      // NUL, whereas the `os.devNull` spelling `\\.\nul` is unopenable for Git.
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
    maxBuffer: 64 * 1024,
    timeout: 10_000,
    windowsHide: true,
  });
}

async function unlinkIfPresent(file) {
  try {
    await unlink(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

test("source commit resolution follows linked-worktree common loose and packed refs", async () => {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-linked-worktree-"));
  const repositoryRoot = path.join(container, "repository");
  const linkedRoot = path.join(container, "linked worktree");
  try {
    await mkdir(repositoryRoot);
    await git(repositoryRoot, "init", "--quiet");
    await git(repositoryRoot, "config", "user.name", "Candidate 010 Test");
    await git(repositoryRoot, "config", "user.email", "candidate-010@example.invalid");
    await git(repositoryRoot, "config", "commit.gpgsign", "false");
    await writeFile(path.join(repositoryRoot, "source.txt"), "bound source\n");
    await git(repositoryRoot, "add", "--", "source.txt");
    await git(repositoryRoot, "commit", "--quiet", "-m", "fixture");
    const { stdout } = await git(repositoryRoot, "rev-parse", "HEAD");
    const expectedCommit = stdout.trim();
    const branch = "linked/source-bundle-test";
    await git(repositoryRoot, "worktree", "add", "--quiet", "-b", branch, linkedRoot, "HEAD");

    assert.equal(await readCandidate010SourceCommit(linkedRoot), expectedCommit);

    await git(repositoryRoot, "pack-refs", "--all", "--prune");
    await assert.rejects(
      access(path.join(repositoryRoot, ".git", "refs", "heads", ...branch.split("/"))),
      (error) => error.code === "ENOENT",
    );
    assert.equal(await readCandidate010SourceCommit(linkedRoot), expectedCommit);

    const looseReference = path.join(repositoryRoot, ".git", "refs", "heads", ...branch.split("/"));
    await mkdir(path.dirname(looseReference), { recursive: true });
    await writeFile(looseReference, "not-a-commit\n");
    await assert.rejects(readCandidate010SourceCommit(linkedRoot), /loose reference .* is malformed/);
    await rm(looseReference);
    assert.equal(await readCandidate010SourceCommit(linkedRoot), expectedCommit);
  } finally {
    await rm(container, { recursive: true, force: true });
  }
});

test("Candidate 010 source identity covers every executable layer and is deterministic", async () => {
  const coverage = await discoverCandidate010SourceFiles();
  const first = await captureCandidate010SourceBundle();
  const second = await captureCandidate010SourceBundle();
  assert.deepEqual(first, second);
  assert.match(first.source_sha256, /^[0-9a-f]{64}$/);
  assert.match(first.vcs.source_commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(
    first.files.map((entry) => entry.path),
    coverage.source_files,
  );
  assert.ok(CANDIDATE_010_SOURCE_FILES.every((file) => coverage.source_files.includes(file)));
  assert.ok(coverage.production_modules.every((file) => coverage.source_files.includes(file)));
  assert.ok(coverage.registered_tests.every((file) => coverage.source_files.includes(file)));
  assert.ok(CANDIDATE_010_TEST_SUPPORT_FILES.every((file) => coverage.source_files.includes(file)));
  for (const policyInput of [
    "package.json",
    "package-lock.json",
    "research/claims.md",
    "scripts/lib/workstation-manifests.mjs",
    "scripts/validate-workstation.mjs",
    "experiments/workstation/manifest.schema.json",
  ]) {
    assert.ok(coverage.source_files.includes(policyInput), `${policyInput} is absent from source identity`);
  }
  assert.equal(coverage.manifest_file, "experiments/workstation/manifests/candidate-010.json");
  assert.equal(coverage.source_files.includes(coverage.manifest_file), false);
  assert.equal(
    coverage.execution_manifest_projection.contract_version,
    "candidate-010.execution-manifest-projection.v1",
  );
  assert.ok(coverage.import_closure.length > 0);
  assert.ok(coverage.import_closure.every((edge) => (
    (coverage.production_modules.includes(edge.importer) || coverage.registered_tests.includes(edge.importer))
    && coverage.source_files.includes(edge.imported)
  )));
  assert.ok(coverage.import_closure.some((edge) => (
    edge.importer === "scripts/validate-workstation.mjs"
    && edge.imported === "scripts/lib/workstation-manifests.mjs"
  )));
  assert.ok(coverage.import_closure.some((edge) => (
    edge.importer === "scripts/lib/workstation-manifests.mjs"
    && edge.imported === "experiments/workstation/candidate-010/promotion-evidence.mjs"
  )));
  assert.ok(coverage.exclusions.every((entry) => entry.path && entry.reason));

  const manifest = JSON.parse(await readFile("experiments/workstation/manifests/candidate-010.json", "utf8"));
  assert.deepEqual(coverage.registered_tests, [...manifest.implementation.tests].sort());
});

test("one source byte changes the bundle and escaping or duplicate paths are refused", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-source-bundle-"));
  try {
    await writeFile(path.join(temporary, "a.mjs"), "export const value = 1;\n");
    await writeFile(path.join(temporary, "b.mjs"), "export const value = 2;\n");
    const first = await computeSourceBundle({ root: temporary, sourceFiles: ["a.mjs", "b.mjs"] });
    await writeFile(path.join(temporary, "b.mjs"), "export const value = 3;\n");
    const second = await computeSourceBundle({ root: temporary, sourceFiles: ["a.mjs", "b.mjs"] });
    assert.notEqual(first.source_sha256, second.source_sha256);
    await assert.rejects(
      computeSourceBundle({ root: temporary, sourceFiles: ["../outside.mjs"] }),
      /stay relative/,
    );
    await assert.rejects(
      computeSourceBundle({ root: temporary, sourceFiles: ["a.mjs", "a.mjs"] }),
      /unique/,
    );
  } finally {
    assert.ok(temporary.startsWith(os.tmpdir()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("a frozen bundle verifies at an exact capsule root without Git metadata", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "20w-c010-frozen-source-"));
  try {
    await mkdir(path.join(sourceRoot, "nested"));
    await writeFile(path.join(sourceRoot, "entry.mjs"), "export const value = 1;\n");
    await writeFile(path.join(sourceRoot, "nested", "config.json"), "{\"schema\":1}\n");
    const expectedBundle = await computeSourceBundle({
      root: sourceRoot,
      sourceFiles: ["entry.mjs", "nested/config.json"],
      vcs: {
        source_commit: "b".repeat(40),
        worktree_state: "committed-capsule-fixture",
      },
    });
    const verified = await verifyCandidate010SourceBundleAtRoot({ sourceRoot, expectedBundle });
    assert.deepEqual(verified, expectedBundle);
    await assert.rejects(readFile(path.join(sourceRoot, ".git", "HEAD")), /ENOENT/);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
  }
});

test("frozen source verification refuses substitutions, extras, escapes, and linked roots", async () => {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-hostile-source-"));
  const sourceRoot = path.join(container, "source");
  const linkedRoot = path.join(container, "linked-source");
  await mkdir(sourceRoot);
  try {
    await writeFile(path.join(sourceRoot, "entry.mjs"), "export const value = 1;\n");
    const expectedBundle = await computeSourceBundle({
      root: sourceRoot,
      sourceFiles: ["entry.mjs"],
      vcs: {
        source_commit: "c".repeat(40),
        worktree_state: "committed-capsule-fixture",
      },
    });

    await writeFile(path.join(sourceRoot, "entry.mjs"), "export const value = 2;\n");
    await assert.rejects(
      verifyCandidate010SourceBundleAtRoot({ sourceRoot, expectedBundle }),
      /bytes or hashes/,
    );
    await writeFile(path.join(sourceRoot, "entry.mjs"), "export const value = 1;\n");
    await writeFile(path.join(sourceRoot, "unbound.mjs"), "export {};\n");
    await assert.rejects(
      verifyCandidate010SourceBundleAtRoot({ sourceRoot, expectedBundle }),
      /inventory does not exactly match/,
    );
    await rm(path.join(sourceRoot, "unbound.mjs"));
    await mkdir(path.join(sourceRoot, "unbound-directory"));
    await assert.rejects(
      verifyCandidate010SourceBundleAtRoot({ sourceRoot, expectedBundle }),
      /inventory does not exactly match/,
    );
    await rm(path.join(sourceRoot, "unbound-directory"), { recursive: true });

    const escaping = {
      ...expectedBundle,
      files: [{ ...expectedBundle.files[0], path: "../entry.mjs" }],
    };
    await assert.rejects(
      verifyCandidate010SourceBundleAtRoot({ sourceRoot, expectedBundle: escaping }),
      /stay relative/,
    );

    await symlink(sourceRoot, linkedRoot, "junction");
    await assert.rejects(
      verifyCandidate010SourceBundleAtRoot({ sourceRoot: linkedRoot, expectedBundle }),
      /symbolic link|reparse point/,
    );
  } finally {
    await unlinkIfPresent(linkedRoot);
    await rm(container, { recursive: true, force: true });
  }
});

async function temporaryCoverageFixture() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-discovery-"));
  const candidateDirectory = "experiments/workstation/candidate-010";
  const candidateRoot = path.join(temporary, ...candidateDirectory.split("/"));
  const manifestFile = "experiments/workstation/manifests/candidate-010.json";
  const manifestPath = path.join(temporary, ...manifestFile.split("/"));
  const executionManifestFile = `${candidateDirectory}/execution-manifest.json`;
  const executionManifestPath = path.join(temporary, ...executionManifestFile.split("/"));
  await mkdir(candidateRoot, { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const entry = `${candidateDirectory}/entry.mjs`;
  const helper = `${candidateDirectory}/helper.mjs`;
  const testFile = `${candidateDirectory}/helper.test.mjs`;
  await writeFile(path.join(candidateRoot, "entry.mjs"), 'import { helper } from "./helper.mjs";\nexport const value = helper;\n');
  await writeFile(path.join(candidateRoot, "helper.mjs"), "export const helper = 1;\n");
  await writeFile(path.join(candidateRoot, "helper.test.mjs"), 'import "./helper.mjs";\n');
  await writeFile(path.join(candidateRoot, "README.md"), "fixture documentation\n");
  const manifest = {
    schema: 1,
    artifact: "candidate-010",
    readiness: "smoke-ready",
    command: { run: "node entry.mjs" },
    seeds: {
      development: "seeds/development.json",
      confirmation: "seeds/confirmation.commit.json",
      held_out: "seeds/held-out.commit.json",
    },
    implementation: {
      entrypoint: entry,
      tests: [testFile],
      full_tests: [testFile],
      execution_claims: ["C-170"],
    },
    promotion_evidence: {
      status: "pending",
      evidence_path: "promotion/evidence.json",
      promotion_validation_receipt_path: "promotion/receipt.json",
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    executionManifestPath,
    `${JSON.stringify(candidate010ExecutionManifestProjection(manifest), null, 2)}\n`,
  );
  return {
    temporary,
    candidateRoot,
    manifestPath,
    executionManifestPath,
    options: {
      root: temporary,
      candidateDirectory,
      manifestFile,
      executionManifestFile,
      productionFiles: [entry, executionManifestFile, helper],
      testSupportFiles: [],
      exclusions: [{ path: "README.md", reason: "fixture documentation" }],
    },
  };
}

test("discovery rejects an unlisted production module and an unregistered test", async () => {
  const fixture = await temporaryCoverageFixture();
  try {
    const initial = await discoverCandidate010SourceFiles(fixture.options);
    assert.equal(initial.production_modules.length, 2);
    assert.equal(initial.registered_tests.length, 1);

    const unlistedProduction = path.join(fixture.candidateRoot, "unlisted.mjs");
    await writeFile(unlistedProduction, "export const unlisted = true;\n");
    await assert.rejects(
      discoverCandidate010SourceFiles(fixture.options),
      /production module coverage mismatch.*unlisted\.mjs/,
    );
    await rm(unlistedProduction);

    const unregisteredTest = path.join(fixture.candidateRoot, "unregistered.test.mjs");
    await writeFile(unregisteredTest, 'import "./helper.mjs";\n');
    await assert.rejects(
      discoverCandidate010SourceFiles(fixture.options),
      /test coverage mismatch.*unregistered\.test\.mjs/,
    );
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test("discovery enforces production and registered-test import closure and classifies every candidate file", async () => {
  const fixture = await temporaryCoverageFixture();
  try {
    const outside = path.join(fixture.temporary, "experiments", "workstation", "outside.mjs");
    await writeFile(outside, "export const outside = true;\n");
    await writeFile(
      path.join(fixture.candidateRoot, "entry.mjs"),
      'import "./helper.mjs";\nimport "../outside.mjs";\n',
    );
    await assert.rejects(
      discoverCandidate010SourceFiles(fixture.options),
      /outside the frozen source closure.*outside\.mjs/,
    );

    await writeFile(path.join(fixture.candidateRoot, "entry.mjs"), 'import "./helper.mjs";\n');
    await writeFile(
      path.join(fixture.candidateRoot, "helper.test.mjs"),
      'import "../../../outside-test-helper.mjs";\n',
    );
    await writeFile(path.join(fixture.temporary, "outside-test-helper.mjs"), "export const outside = true;\n");
    await assert.rejects(
      discoverCandidate010SourceFiles(fixture.options),
      /outside the frozen source closure.*outside-test-helper\.mjs/,
    );

    await writeFile(path.join(fixture.candidateRoot, "helper.test.mjs"), 'import "./helper.mjs";\n');
    await writeFile(path.join(fixture.candidateRoot, "unclassified.json"), "{}\n");
    await assert.rejects(
      discoverCandidate010SourceFiles(fixture.options),
      /unclassified files.*unclassified\.json/,
    );
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test("tests and immutable execution-manifest semantics participate while readiness/result state does not", async () => {
  const fixture = await temporaryCoverageFixture();
  try {
    const coverage = await discoverCandidate010SourceFiles(fixture.options);
    const first = await computeSourceBundle({
      root: fixture.temporary,
      sourceFiles: coverage.source_files,
      executionManifestProjection: coverage.execution_manifest_projection,
    });
    await writeFile(path.join(fixture.candidateRoot, "helper.test.mjs"), 'import "./helper.mjs";\n// changed\n');
    const secondCoverage = await discoverCandidate010SourceFiles(fixture.options);
    const second = await computeSourceBundle({
      root: fixture.temporary,
      sourceFiles: secondCoverage.source_files,
      executionManifestProjection: secondCoverage.execution_manifest_projection,
    });
    assert.notEqual(first.source_sha256, second.source_sha256);

    const stableManifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    stableManifest.readiness = "workstation-ready";
    stableManifest.promotion_evidence.status = "present";
    stableManifest.promotion_evidence.evidence_path = "new-results/evidence.json";
    stableManifest.promotion_evidence.promotion_validation_receipt_path = "new-results/receipt.json";
    stableManifest.seeds.confirmation = "new-results/confirmation.reveal.json";
    stableManifest.seeds.held_out = "new-results/held-out.reveal.json";
    await writeFile(
      fixture.manifestPath,
      `${JSON.stringify(stableManifest, null, 2)}\n`,
    );
    const thirdCoverage = await discoverCandidate010SourceFiles(fixture.options);
    const third = await computeSourceBundle({
      root: fixture.temporary,
      sourceFiles: thirdCoverage.source_files,
      executionManifestProjection: thirdCoverage.execution_manifest_projection,
    });
    assert.equal(second.source_sha256, third.source_sha256);

    stableManifest.command.run = "node substituted-entry.mjs";
    stableManifest.seeds.development = "substituted-development.json";
    stableManifest.implementation.execution_claims = ["C-999"];
    delete stableManifest.promotion_evidence.promotion_validation_receipt_path;
    await writeFile(fixture.manifestPath, `${JSON.stringify(stableManifest, null, 2)}\n`);
    await assert.rejects(
      discoverCandidate010SourceFiles(fixture.options),
      /does not exactly match the immutable projection/,
    );
    await writeFile(
      fixture.executionManifestPath,
      `${JSON.stringify(candidate010ExecutionManifestProjection(stableManifest), null, 2)}\n`,
    );
    const changedCoverage = await discoverCandidate010SourceFiles(fixture.options);
    const changed = await computeSourceBundle({
      root: fixture.temporary,
      sourceFiles: changedCoverage.source_files,
      executionManifestProjection: changedCoverage.execution_manifest_projection,
    });
    assert.notEqual(third.source_sha256, changed.source_sha256);
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test("dirty workstation-policy bytes change the frozen source identity", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-policy-source-"));
  const relative = "scripts/lib/workstation-manifests.mjs";
  const policyPath = path.join(temporary, ...relative.split("/"));
  try {
    await mkdir(path.dirname(policyPath), { recursive: true });
    const original = await readFile(relative, "utf8");
    await writeFile(policyPath, original);
    const first = await computeSourceBundle({ root: temporary, sourceFiles: [relative] });
    await writeFile(policyPath, `${original}\n// dirty policy byte\n`);
    const second = await computeSourceBundle({ root: temporary, sourceFiles: [relative] });
    assert.notEqual(first.source_sha256, second.source_sha256);
    assert.notEqual(first.files[0].sha256, second.files[0].sha256);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("source discovery and hashing refuse junction or symbolic-link traversal", async () => {
  const fixture = await temporaryCoverageFixture();
  const actualCandidateRoot = `${fixture.candidateRoot}-actual`;
  const linkedDirectory = path.join(fixture.temporary, "linked-policy");
  try {
    await rename(fixture.candidateRoot, actualCandidateRoot);
    await symlink(actualCandidateRoot, fixture.candidateRoot, "junction");
    await assert.rejects(
      discoverCandidate010SourceFiles(fixture.options),
      /symbolic-link|reparse-point/,
    );
    await unlink(fixture.candidateRoot);

    const actualDirectory = path.join(fixture.temporary, "actual-policy");
    await mkdir(actualDirectory);
    await writeFile(path.join(actualDirectory, "policy.mjs"), "export const policy = true;\n");
    await symlink(actualDirectory, linkedDirectory, "junction");
    await assert.rejects(
      computeSourceBundle({
        root: fixture.temporary,
        sourceFiles: ["linked-policy/policy.mjs"],
      }),
      /symbolic-link|reparse-point/,
    );
    await unlink(linkedDirectory);
  } finally {
    await unlinkIfPresent(fixture.candidateRoot);
    await unlinkIfPresent(linkedDirectory);
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});
