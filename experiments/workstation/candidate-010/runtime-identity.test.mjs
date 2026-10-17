import assert from "node:assert/strict";
import {
  mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  RUNTIME_IDENTITY_LIMITS,
  RUNTIME_IDENTITY_VERSION,
  RuntimeIdentityError,
  assertRuntimeIdentityEqual,
  captureRuntimeIdentity,
  runtimeIdentityDigest,
  validateRuntimeIdentity,
} from "./runtime-identity.mjs";

const candidateRoot = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const repositoryRoot = path.resolve(candidateRoot, "..", "..", "..");

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-runtime-identity-"));
  const candidate = path.join(root, "experiments", "workstation", "candidate-010");
  const packageRoot = path.join(root, "node_modules", "es-module-lexer");
  await mkdir(candidate, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(candidate, "production.mjs"),
    "import { parse } from \"es-module-lexer\";\nexport const parseModule = parse;\n",
    "utf8",
  );
  await writeFile(
    path.join(candidate, "production.test.mjs"),
    "import ignored from \"test-only-package\";\nvoid ignored;\n",
    "utf8",
  );
  await writeJson(path.join(root, "package.json"), {
    name: "runtime-identity-fixture",
    private: true,
    dependencies: { "es-module-lexer": "2.1.0" },
  });
  await writeJson(path.join(root, "package-lock.json"), {
    name: "runtime-identity-fixture",
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { "es-module-lexer": "2.1.0" } },
      "node_modules/es-module-lexer": { version: "2.1.0" },
    },
  });
  await writeJson(path.join(packageRoot, "package.json"), {
    name: "es-module-lexer",
    version: "2.1.0",
    type: "module",
  });
  await writeFile(path.join(packageRoot, "index.js"), "export const fixture = true;\n", "utf8");
  return { root, candidate, packageRoot };
}

async function withFixture(run) {
  const current = await fixture();
  try {
    await run(current);
  } finally {
    assert.ok(current.root.startsWith(os.tmpdir()));
    await rm(current.root, { recursive: true, force: true });
  }
}

async function createLinkOrSkip(context, target, link, type = "file") {
  try {
    await symlink(target, link, type);
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error?.code)) {
      context.skip(`symlink/reparse creation is unavailable: ${error.code}`);
      return false;
    }
    throw error;
  }
}

test("runtime identity binds the exact Node executable, lock, and installed production dependency bytes", async () => {
  const first = await captureRuntimeIdentity({ repositoryRoot, candidateRoot });
  const second = await captureRuntimeIdentity({ repositoryRoot, candidateRoot });
  const executable = await stat(process.execPath);

  assert.equal(first.contract_version, RUNTIME_IDENTITY_VERSION);
  assert.equal(first.identity_sha256, runtimeIdentityDigest(first));
  assert.equal(first.runtime.version, process.version);
  assert.deepEqual(first.runtime.versions, Object.fromEntries(
    Object.entries(process.versions).sort(([left], [right]) => left.localeCompare(right)),
  ));
  assert.equal(first.runtime.platform, process.platform);
  assert.equal(first.runtime.arch, process.arch);
  assert.equal(first.runtime.executable_bytes, executable.size);
  assert.match(first.runtime.executable_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(first.external_production_dependency_names, ["es-module-lexer"]);
  // The update bot moves the lock; the expected version follows it rather than a copy.
  const lock = JSON.parse(await readFile(path.join(repositoryRoot, "package-lock.json"), "utf8"));
  assert.equal(first.external_production_dependencies[0].version, lock.packages["node_modules/es-module-lexer"].version);
  assert.equal(first.external_production_dependencies[0].production_usage, true);
  assert.equal(first.external_production_dependencies[0].declared_section, "devDependencies");
  assert.ok(first.external_production_dependencies[0].files.some((row) => row.path === "package.json"));
  assertRuntimeIdentityEqual(first, second);
  assert.deepEqual(await validateRuntimeIdentity(first, { repositoryRoot, candidateRoot }), {
    valid: true,
    contract_version: RUNTIME_IDENTITY_VERSION,
    identity_sha256: first.identity_sha256,
    confirmation_claim_eligible: false,
  });
  assert.equal(first.confirmation_claim_eligible, false);
  assert.equal(first.limits.toctou_guarantee, false);
  assert.equal(RUNTIME_IDENTITY_LIMITS.confirmation_claim_eligible, false);
});

test("dependency discovery refuses template, computed, and concatenated dynamic imports", async () => {
  const sources = [
    "export const load = (name) => import(`./locales/${name}.mjs`);\n",
    "export const load = (name) => import(name);\n",
    "export const load = (name) => import(\"./\" + name);\n",
  ];
  for (const source of sources) {
    await withFixture(async ({ root, candidate }) => {
      await writeFile(path.join(candidate, "dynamic.mjs"), source, "utf8");
      await assert.rejects(
        captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate }),
        (error) => error instanceof RuntimeIdentityError
          && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_NON_LITERAL_IMPORT",
        source,
      );
    });
  }
});

test("dependency discovery admits a literal dynamic import and ignores import.meta", async () => {
  await withFixture(async ({ root, candidate }) => {
    await writeFile(
      path.join(candidate, "dynamic.mjs"),
      "export const here = import.meta.url;\nexport const load = () => import(\"./production.mjs\");\n",
      "utf8",
    );
    const identity = await captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate });
    assert.deepEqual(identity.external_production_dependency_names, ["es-module-lexer"]);
  });
});

test("dependency discovery excludes tests and inventory hashes are deterministic but byte-sensitive", async () => {
  await withFixture(async ({ root, candidate, packageRoot }) => {
    const first = await captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate });
    const second = await captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate });
    assert.deepEqual(first.external_production_dependency_names, ["es-module-lexer"]);
    assertRuntimeIdentityEqual(first, second);

    await writeFile(path.join(packageRoot, "index.js"), "export const fixture = false;\n", "utf8");
    const changed = await captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate });
    assert.notEqual(
      changed.external_production_dependencies[0].inventory_sha256,
      first.external_production_dependencies[0].inventory_sha256,
    );
    assert.throws(
      () => assertRuntimeIdentityEqual(first, changed),
      (error) => (
        error instanceof RuntimeIdentityError
        && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_PRE_POST_MISMATCH"
      ),
    );
    await assert.rejects(
      validateRuntimeIdentity(first, { repositoryRoot: root, candidateRoot: candidate }),
      (error) => (
        error instanceof RuntimeIdentityError
        && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_MISMATCH"
      ),
    );
  });
});

test("self-digests cannot conceal a changed runtime field between pre and post capture", async () => {
  await withFixture(async ({ root, candidate }) => {
    const before = await captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate });
    const after = structuredClone(before);
    after.runtime.version = `${after.runtime.version}-substituted`;
    after.identity_sha256 = runtimeIdentityDigest(after);
    assert.throws(
      () => assertRuntimeIdentityEqual(before, after),
      (error) => (
        error instanceof RuntimeIdentityError
        && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_PRE_POST_MISMATCH"
      ),
    );
    const corrupt = structuredClone(before);
    corrupt.identity_sha256 = "0".repeat(64);
    assert.throws(
      () => assertRuntimeIdentityEqual(corrupt, before),
      (error) => (
        error instanceof RuntimeIdentityError
        && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_DOCUMENT"
      ),
    );
  });
});

test("installed package metadata must exactly match root declaration and lock version", async () => {
  await withFixture(async ({ root, candidate, packageRoot }) => {
    const metadataPath = path.join(packageRoot, "package.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.version = "9.9.9";
    await writeJson(metadataPath, metadata);
    await assert.rejects(
      captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate }),
      (error) => (
        error instanceof RuntimeIdentityError
        && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_VERSION_MISMATCH"
      ),
    );
  });
});

test("linked package files and linked package roots are refused", async (context) => {
  await withFixture(async ({ root, candidate, packageRoot }) => {
    const packageFile = path.join(packageRoot, "index.js");
    const externalFile = path.join(root, "external-package-file.js");
    await writeFile(externalFile, await readFile(packageFile));
    await rm(packageFile);
    if (!(await createLinkOrSkip(context, externalFile, packageFile))) return;
    await assert.rejects(
      captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate }),
      (error) => (
        error instanceof RuntimeIdentityError
        && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_LINKED_PATH"
      ),
    );
  });

  await withFixture(async ({ root, candidate, packageRoot }) => {
    const externalRoot = path.join(root, "external-package-root");
    await mkdir(externalRoot);
    await writeJson(path.join(externalRoot, "package.json"), {
      name: "es-module-lexer",
      version: "2.1.0",
    });
    await writeFile(path.join(externalRoot, "index.js"), "export const external = true;\n", "utf8");
    await rm(packageRoot, { recursive: true });
    if (!(await createLinkOrSkip(context, externalRoot, packageRoot, "junction"))) return;
    await assert.rejects(
      captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate }),
      (error) => (
        error instanceof RuntimeIdentityError
        && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_LINKED_PATH"
      ),
    );
  });
});

test("a linked package lock is refused before its bytes are trusted", async (context) => {
  await withFixture(async ({ root, candidate }) => {
    const lockPath = path.join(root, "package-lock.json");
    const external = path.join(path.dirname(root), `${path.basename(root)}-external-lock.json`);
    await writeFile(external, await readFile(lockPath));
    try {
      await rm(lockPath);
      if (!(await createLinkOrSkip(context, external, lockPath))) return;
      await assert.rejects(
        captureRuntimeIdentity({ repositoryRoot: root, candidateRoot: candidate }),
        (error) => (
          error instanceof RuntimeIdentityError
          && error.code === "CANDIDATE_010_RUNTIME_IDENTITY_LINKED_PATH"
        ),
      );
    } finally {
      await rm(external, { force: true });
    }
  });
});
