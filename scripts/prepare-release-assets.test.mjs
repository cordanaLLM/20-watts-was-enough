import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  truncate,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSpdxDocument,
  extractChangelogSection,
  parseReleaseArguments,
  parseReleaseTag,
  prepareReleaseAssets,
  validateVersionAgreement,
  verifyReleaseChecksums,
} from "./prepare-release-assets.mjs";

const version = "0.1.0";
const tag = `v${version}`;
const pdfRelativePath = "public/downloads/20-watts-was-enough-full-concept-book.pdf";
const disclosureRelativePath = `research/disclosures/${tag}.md`;
const disclosureAssetName = `research-output-disclosure-${tag}.md`;
const rendererLock = Buffer.from("fixture renderer lock\n");
const rendererLockSHA256 = digest(rendererLock);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureDisclosure(outputVersion = version) {
  return [
    `# Research-output disclosure — v${outputVersion}`,
    "",
    `- **Output:** repository snapshot \`v${outputVersion}\``,
    "- **Record date:** 2026-08-05",
    "- **Authority:** fixture release boundary; no scientific result",
    "",
    "## Contributors and responsibility",
    "",
    "The fixture maintainer is the accountable approver.",
    "",
    "## Funding and material support",
    "",
    "No funding is declared for this fixture.",
    "",
    "## Competing interests",
    "",
    "No separate declaration is supplied for this fixture.",
    "",
    "## Material AI, automation and external services",
    "",
    "The release generator is the only material automated tool in this fixture.",
    "",
    "## Pre-release evidence and publication conditions",
    "",
    "The release-boundary tests were completed.",
    "",
  ].join("\n");
}

async function directorySnapshot(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const snapshot = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryRelative = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) {
      snapshot.push(...await directorySnapshot(root, entryRelative));
    } else {
      snapshot.push([entryRelative, (await readFile(path.join(root, entryRelative))).toString("base64")]);
    }
  }
  return snapshot;
}

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "release-assets-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "public", "downloads"), { recursive: true });
  await mkdir(path.join(root, "LICENSES"));
  await mkdir(path.join(root, "research", "disclosures"), { recursive: true });
  await mkdir(path.join(root, "tooling", "pdf-renderer"), { recursive: true });

  const packageManifest = {
    name: "20-watts-was-enough",
    version,
  };
  const dependencyIntegrity = `sha512-${Buffer.alloc(64, 7).toString("base64")}`;
  const packageLock = {
    name: packageManifest.name,
    version,
    lockfileVersion: 3,
    packages: {
      "": {
        name: packageManifest.name,
        version,
        dependencies: { example: "1.2.3" },
      },
      "node_modules/example": {
        version: "1.2.3",
        resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
        integrity: dependencyIntegrity,
      },
    },
  };
  const packageLockBytes = Buffer.from(`${JSON.stringify(packageLock, null, 2)}\n`);
  const pdf = Buffer.alloc(100_128, 0x20);
  pdf.write("%PDF-1.7\n", 0, "ascii");
  const manifest = {
    schema_version: 3,
    version,
    source_ref: tag,
    source_revision: "c".repeat(40),
    pdf: pdfRelativePath,
    size_bytes: pdf.length,
    pdf_sha256: digest(pdf),
    renderer: {
      lock: "tooling/pdf-renderer/lock.json",
      lock_sha256: rendererLockSHA256,
      image_id: `sha256:${"a".repeat(64)}`,
      platform: "linux/amd64",
    },
  };
  const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Changed",
    "",
    "- Later work.",
    "",
    "## [0.1.0] - 2026-08-05",
    "",
    "### Added",
    "",
    "- Initial research concept.",
    "",
    "## [0.0.9] - 2026-08-01",
    "",
    "### Added",
    "",
    "- Earlier work.",
    "",
  ].join("\n");

  await Promise.all([
    writeFile(path.join(root, "package.json"), `${JSON.stringify(packageManifest, null, 2)}\n`),
    writeFile(path.join(root, "package-lock.json"), packageLockBytes),
    writeFile(path.join(root, "CITATION.cff"), `cff-version: 1.2.0\ntitle: Test\nversion: ${version}\ndate-released: 2026-08-05\n`),
    writeFile(path.join(root, "CHANGELOG.md"), changelog),
    writeFile(path.join(root, pdfRelativePath), pdf),
    writeFile(path.join(root, "public", "downloads", "book-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(root, "LICENSE"), "EUPL fixture\n"),
    writeFile(path.join(root, "LICENSING.md"), "# Licensing fixture\n"),
    writeFile(path.join(root, "THIRD_PARTY_NOTICES.txt"), "Notices fixture\n"),
    writeFile(path.join(root, "LICENSES", "CC-BY-SA-4.0.txt"), "CC fixture\n"),
    writeFile(path.join(root, "LICENSES", "OFL-1.1.txt"), "OFL fixture\n"),
    writeFile(path.join(root, disclosureRelativePath), fixtureDisclosure()),
    writeFile(path.join(root, "tooling", "pdf-renderer", "lock.json"), rendererLock),
  ]);

  return {
    root,
    packageManifest,
    packageLock,
    packageLockSha256: digest(packageLockBytes),
    changelog,
  };
}

test("release preparation binds versions, the locked graph, licence material, notes, and sorted checksums", async (t) => {
  const fixture = await createFixture(t);
  const outputRoot = path.join(fixture.root, "build", "release");
  const result = await prepareReleaseAssets({
    root: fixture.root,
    outputRoot,
    tag,
  });

  assert.equal(result.version, version);
  assert.deepEqual(result.assetNames, [...result.assetNames].sort());
  assert.match(await readFile(path.join(outputRoot, "release-notes.md"), "utf8"), /^## \[0\.1\.0\] - 2026-08-05/mu);
  assert.doesNotMatch(await readFile(path.join(outputRoot, "release-notes.md"), "utf8"), /0\.0\.9/u);
  assert.match(
    await readFile(path.join(outputRoot, "release-notes.md"), "utf8"),
    new RegExp(`https://github\\.com/cordanaLLM/20-watts-was-enough/releases/download/${tag}/${disclosureAssetName}`, "u"),
  );

  const assetsRoot = path.join(outputRoot, "assets");
  const checksums = await verifyReleaseChecksums(assetsRoot);
  assert.deepEqual(checksums.map(({ name }) => name), [...checksums.map(({ name }) => name)].sort());
  for (const expected of [
    "20-watts-was-enough-full-concept-book.pdf",
    "book-manifest.json",
    "CITATION.cff",
    "LICENSE",
    "LICENSING.md",
    "CC-BY-SA-4.0.txt",
    "OFL-1.1.txt",
    disclosureAssetName,
    "THIRD_PARTY_NOTICES.txt",
    "sbom.spdx.json",
  ]) {
    assert(checksums.some(({ name }) => name === expected), `${expected} is not checksummed`);
  }
  assert.equal(
    await readFile(path.join(assetsRoot, disclosureAssetName), "utf8"),
    fixtureDisclosure(),
  );

  const sbom = JSON.parse(await readFile(path.join(assetsRoot, "sbom.spdx.json"), "utf8"));
  assert.equal(sbom.spdxVersion, "SPDX-2.3");
  assert.equal(sbom.creationInfo.created, "2026-08-05T00:00:00Z");
  assert.match(sbom.documentNamespace, new RegExp(fixture.packageLockSha256, "u"));
  assert.deepEqual(sbom.packages.map(({ name }) => name), ["20-watts-was-enough", "example"]);
  assert(sbom.relationships.some(({ relationshipType }) => relationshipType === "DEPENDS_ON"));

  const secondOutputRoot = path.join(fixture.root, "build", "release-again");
  await prepareReleaseAssets({ root: fixture.root, outputRoot: secondOutputRoot, tag });
  assert.deepEqual(
    await directorySnapshot(outputRoot),
    await directorySnapshot(secondOutputRoot),
    "fixed release inputs must produce byte-identical workspaces",
  );
});

test("release preparation ingests additional binary assets into deterministic checksums", async (t) => {
  const fixture = await createFixture(t);
  const additionalAssetsRoot = path.join(fixture.root, "build", "go-assets");
  await mkdir(additionalAssetsRoot, { recursive: true });
  const additionalAssets = new Map([
    ["20w-linux-amd64.tar.gz", Buffer.from("linux binary archive\n")],
    ["20w-extra-test-artifact.bin", Buffer.from("secondary binary artifact\n")],
  ]);
  await Promise.all([...additionalAssets].map(([name, bytes]) => (
    writeFile(path.join(additionalAssetsRoot, name), bytes)
  )));

  const outputRoot = path.join(fixture.root, "build", "release-with-binaries");
  const result = await prepareReleaseAssets({
    root: fixture.root,
    outputRoot,
    additionalAssetsRoot: path.relative(fixture.root, additionalAssetsRoot),
    tag,
  });
  const checksumRecords = await verifyReleaseChecksums(path.join(outputRoot, "assets"));
  const checksums = new Map(checksumRecords.map(({ name, digest: checksum }) => [name, checksum]));
  for (const [name, bytes] of additionalAssets) {
    assert(result.assetNames.includes(name), `${name} is absent from the release inventory`);
    assert.deepEqual(await readFile(path.join(outputRoot, "assets", name)), bytes);
    assert.equal(checksums.get(name), digest(bytes));
  }

  const repeatedOutputRoot = path.join(fixture.root, "build", "release-with-binaries-again");
  await prepareReleaseAssets({
    root: fixture.root,
    outputRoot: repeatedOutputRoot,
    additionalAssetsRoot,
    tag,
  });
  assert.deepEqual(
    await directorySnapshot(outputRoot),
    await directorySnapshot(repeatedOutputRoot),
    "fixed additional assets must produce byte-identical release workspaces",
  );
});

test("release preparation rejects an empty or non-flat additional asset directory", async (t) => {
  const fixture = await createFixture(t);
  const additionalAssetsRoot = path.join(fixture.root, "build", "go-assets");
  await mkdir(additionalAssetsRoot, { recursive: true });
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, additionalAssetsRoot, tag }),
    /must not be empty/u,
  );

  await writeFile(path.join(additionalAssetsRoot, "20w-linux-amd64"), "binary\n");
  await mkdir(path.join(additionalAssetsRoot, "nested"));
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, additionalAssetsRoot, tag }),
    /only top-level regular files/u,
  );
});

test("release preparation rejects unsafe, colliding, and excessive additional assets", async (t) => {
  const fixture = await createFixture(t);
  const additionalAssetsRoot = path.join(fixture.root, "build", "go-assets");
  await mkdir(additionalAssetsRoot, { recursive: true });
  await writeFile(path.join(additionalAssetsRoot, "unsafe name"), "binary\n");
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, additionalAssetsRoot, tag }),
    /not a safe release basename/u,
  );

  await rm(additionalAssetsRoot, { recursive: true });
  await mkdir(additionalAssetsRoot);
  await writeFile(path.join(additionalAssetsRoot, "license"), "collision\n");
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, additionalAssetsRoot, tag }),
    /unique without case distinctions/u,
  );

  await rm(additionalAssetsRoot, { recursive: true });
  await mkdir(additionalAssetsRoot);
  await Promise.all(Array.from({ length: 65 }, (_, index) => (
    writeFile(path.join(additionalAssetsRoot, `asset-${String(index).padStart(2, "0")}`), "x")
  )));
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, additionalAssetsRoot, tag }),
    /64-file limit/u,
  );
});

test("release preparation rejects an oversized additional asset before reading it", async (t) => {
  const fixture = await createFixture(t);
  const additionalAssetsRoot = path.join(fixture.root, "build", "go-assets");
  const oversized = path.join(additionalAssetsRoot, "20w-linux-amd64.tar.gz");
  await mkdir(additionalAssetsRoot, { recursive: true });
  await writeFile(oversized, "x");
  await truncate(oversized, 256 * 1024 * 1024 + 1);

  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, additionalAssetsRoot, tag }),
    /file exceeds the 268435456-byte limit/u,
  );
});

test("version validation rejects disagreement and extracts only the exact release section", async (t) => {
  const fixture = await createFixture(t);
  assert.equal(parseReleaseTag(tag), version);
  assert.throws(() => parseReleaseTag("v0.1"), /vMAJOR\.MINOR\.PATCH/u);
  const agreement = validateVersionAgreement({
    tag,
    packageManifest: fixture.packageManifest,
    packageLock: fixture.packageLock,
    citation: { version, "date-released": "2026-08-05" },
    changelog: fixture.changelog,
  });
  assert.equal(agreement.releaseNotes, extractChangelogSection(fixture.changelog, version));
  assert.throws(() => validateVersionAgreement({
    tag,
    packageManifest: fixture.packageManifest,
    packageLock: { ...fixture.packageLock, version: "0.1.1" },
    citation: { version, "date-released": "2026-08-05" },
    changelog: fixture.changelog,
  }), /package-lock\.json="0\.1\.1"/u);
  assert.throws(() => validateVersionAgreement({
    tag,
    packageManifest: fixture.packageManifest,
    packageLock: fixture.packageLock,
    citation: { version, "date-released": "2026-08-06" },
    changelog: fixture.changelog,
  }), /date-released 2026-08-06 disagrees with CHANGELOG\.md \[0\.1\.0\] date 2026-08-05/u);
  assert.throws(() => validateVersionAgreement({
    tag,
    packageManifest: fixture.packageManifest,
    packageLock: fixture.packageLock,
    citation: { version, "date-released": "2026-02-30" },
    changelog: fixture.changelog,
  }), /date-released is not a real calendar date/u);
  assert.throws(() => extractChangelogSection(fixture.changelog, "9.9.9"), /exactly one dated/u);
});

test("release preparation rejects a missing, wrong-version, or malformed disclosure before output", async (t) => {
  const fixture = await createFixture(t);
  const disclosurePath = path.join(fixture.root, disclosureRelativePath);
  const outputRoot = path.join(fixture.root, "build", "release");

  await rm(disclosurePath);
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, outputRoot, tag }),
    /Release input research\/disclosures\/v0\.1\.0\.md is missing/u,
  );

  await writeFile(disclosurePath, fixtureDisclosure("0.1.1"));
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, outputRoot, tag }),
    /must begin with # Research-output disclosure — v0\.1\.0/u,
  );

  await writeFile(
    disclosurePath,
    fixtureDisclosure().replace("repository snapshot `v0.1.0`", "repository snapshot `v0.1.1`"),
  );
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, outputRoot, tag }),
    /Output identity must name only v0\.1\.0/u,
  );

  await writeFile(
    disclosurePath,
    fixtureDisclosure().replace("## Pre-release evidence and publication conditions\n\nThe release-boundary tests were completed.\n", ""),
  );
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, outputRoot, tag }),
    /must contain exactly one ## Pre-release evidence and publication conditions/u,
  );
  await assert.rejects(readFile(path.join(outputRoot, "release-notes.md")), /ENOENT/u);
});

test("release arguments accept one optional additional asset root", () => {
  assert.deepEqual(
    parseReleaseArguments(["--additional-assets-root", "build/go-assets", "--tag", tag]),
    { additional_assets_root: "build/go-assets", tag },
  );
  assert.throws(
    () => parseReleaseArguments(["--tag", tag, "--tag", tag]),
    /--tag may be specified only once/u,
  );
  assert.throws(
    () => parseReleaseArguments(["--additional-assets-root", "build/go-assets"]),
    /--tag is required/u,
  );
});

test("release preparation rejects a PDF generated from main", async (t) => {
  const fixture = await createFixture(t);
  const manifestPath = path.join(fixture.root, "public", "downloads", "book-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, source_ref: "main" }, null, 2)}\n`);

  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, tag }),
    /does not match expected ref "v0\.1\.0"/u,
  );
});

test("release preparation rejects a manifest that drops the tag commit", async (t) => {
  const fixture = await createFixture(t);
  const manifestPath = path.join(fixture.root, "public", "downloads", "book-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.source_revision;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, tag }),
    /must carry its source revision/u,
  );
});

test("release preparation rejects renderer-lock drift", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(
    path.join(fixture.root, "tooling", "pdf-renderer", "lock.json"),
    "changed renderer lock\n",
  );
  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, tag }),
    /renderer lock SHA-256 does not match/u,
  );
});

test("release preparation rejects a same-size PDF substitution before writing output", async (t) => {
  const fixture = await createFixture(t);
  const pdfPath = path.join(fixture.root, pdfRelativePath);
  const pdf = await readFile(pdfPath);
  pdf[pdf.length - 1] ^= 0xff;
  await writeFile(pdfPath, pdf);
  const outputRoot = path.join(fixture.root, "build", "release");

  await assert.rejects(
    prepareReleaseAssets({ root: fixture.root, outputRoot, tag }),
    /PDF SHA-256 does not match/u,
  );
  await assert.rejects(readFile(path.join(outputRoot, "release-notes.md")), /ENOENT/u);
});

test("checksum verification detects post-packaging asset tampering", async (t) => {
  const fixture = await createFixture(t);
  const outputRoot = path.join(fixture.root, "build", "release");
  await prepareReleaseAssets({ root: fixture.root, outputRoot, tag });
  const assetsRoot = path.join(outputRoot, "assets");
  await appendFile(path.join(assetsRoot, disclosureAssetName), "tampered\n");
  await assert.rejects(
    verifyReleaseChecksums(assetsRoot),
    /checksum mismatch: research-output-disclosure-v0\.1\.0\.md/u,
  );
});

test("SPDX generation rejects an unlocked graph or invalid timestamp", () => {
  assert.throws(() => buildSpdxDocument({
    tag,
    version,
    packageLock: { lockfileVersion: 2, packages: {} },
    packageLockSha256: "0".repeat(64),
    releaseDate: "2026-08-05",
  }), /lockfileVersion 3/u);
  assert.throws(() => buildSpdxDocument({
    tag,
    version,
    packageLock: {
      name: "fixture",
      lockfileVersion: 3,
      packages: { "": { name: "fixture", version } },
    },
    packageLockSha256: "0".repeat(64),
    releaseDate: "not-a-date",
  }), /releaseDate/u);
});
