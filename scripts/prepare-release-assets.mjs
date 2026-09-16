import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseDocument } from "yaml";

import { assertBookManifestContract } from "./lib/book-manifest-contract.mjs";
import { assertBookPdfBytesIntegrity } from "./lib/book-pdf-integrity.mjs";
import {
  bookRendererLockPath,
  bookRendererLockSHA256,
} from "./lib/book-renderer-identity.mjs";
import { readStableOpenedFile } from "./lib/opened-file.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");
const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const releaseDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const checksumLinePattern = /^([0-9a-f]{64}) {2}([^/\\]+)$/u;
const additionalAssetNamePattern = /^[a-z0-9][a-z0-9._-]{0,199}$/u;
const bookPdfRelativePath = "public/downloads/20-watts-was-enough-full-concept-book.pdf";
const bookManifestRelativePath = "public/downloads/book-manifest.json";
const maximumReleaseAssetBytes = 256 * 1024 * 1024;
const maximumAdditionalAssetCount = 64;
const maximumAdditionalAssetBytes = 512 * 1024 * 1024;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function directorySnapshot(root, label) {
  const before = await lstat(root, { bigint: true });
  invariant(before.isDirectory() && !before.isSymbolicLink(), `${label} must be a real directory`);
  const entries = (await readdir(root, { withFileTypes: true }))
    .map((entry) => ({
      name: entry.name,
      regular: entry.isFile() && !entry.isSymbolicLink(),
    }))
    .sort((left, right) => compareText(left.name, right.name));
  const after = await lstat(root, { bigint: true });
  invariant(
    before.dev === after.dev && before.ino === after.ino,
    `${label} changed identity while its inventory was read`,
  );
  return { information: after, entries };
}

function sameDirectorySnapshot(left, right) {
  return left.information.dev === right.information.dev
    && left.information.ino === right.information.ino
    && left.information.mtimeNs === right.information.mtimeNs
    && left.information.ctimeNs === right.information.ctimeNs
    && JSON.stringify(left.entries) === JSON.stringify(right.entries);
}

function parseJson(bytes, relativePath) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

function parseYaml(bytes, relativePath) {
  const document = parseDocument(bytes.toString("utf8"), {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(`${relativePath} is not valid YAML: ${document.errors[0].message}`);
  }
  return document.toJS();
}

async function readRegularFile(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return await readStableOpenedFile(absolutePath, {
      label: `release input ${relativePath}`,
      containedBy: root,
      maximumBytes: maximumReleaseAssetBytes,
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Release input ${relativePath} is missing`, { cause: error });
    }
    throw error;
  }
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function loadAdditionalAssetRecords({ repositoryRoot, additionalAssetsRoot, outputRoot }) {
  if (additionalAssetsRoot === undefined || additionalAssetsRoot === null) return [];
  invariant(
    typeof additionalAssetsRoot === "string" && additionalAssetsRoot.trim().length > 0,
    "Additional asset root must be a non-empty path",
  );
  const assetsRoot = path.resolve(repositoryRoot, additionalAssetsRoot);
  const resolvedOutputRoot = path.resolve(outputRoot);
  invariant(
    !isInside(assetsRoot, resolvedOutputRoot) && !isInside(resolvedOutputRoot, assetsRoot),
    "Additional asset root and release output root must be disjoint",
  );

  const initialSnapshot = await directorySnapshot(assetsRoot, "Additional asset directory");
  invariant(initialSnapshot.entries.length > 0, "Additional asset directory must not be empty");
  invariant(
    initialSnapshot.entries.length <= maximumAdditionalAssetCount,
    `Additional asset directory exceeds the ${maximumAdditionalAssetCount}-file limit`,
  );
  invariant(
    initialSnapshot.entries.every((entry) => entry.regular),
    "Additional asset directory may contain only top-level regular files",
  );

  let totalBytes = 0;
  const records = [];
  for (const entry of initialSnapshot.entries) {
    invariant(
      additionalAssetNamePattern.test(entry.name),
      `Additional asset name is not a safe release basename: ${entry.name}`,
    );
    const bytes = await readStableOpenedFile(path.join(assetsRoot, entry.name), {
      label: `additional release asset ${entry.name}`,
      containedBy: assetsRoot,
      maximumBytes: maximumReleaseAssetBytes,
    });
    totalBytes += bytes.byteLength;
    invariant(
      totalBytes <= maximumAdditionalAssetBytes,
      `Additional assets exceed the ${maximumAdditionalAssetBytes}-byte aggregate limit`,
    );
    records.push({ name: entry.name, bytes });
  }

  const finalSnapshot = await directorySnapshot(assetsRoot, "Additional asset directory");
  invariant(
    sameDirectorySnapshot(initialSnapshot, finalSnapshot),
    "Additional asset inventory changed while release inputs were read",
  );
  return records;
}

export function parseReleaseTag(tag) {
  invariant(typeof tag === "string" && tagPattern.test(tag), "Release tag must have the exact form vMAJOR.MINOR.PATCH");
  return tag.slice(1);
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertCalendarDate(value, label) {
  invariant(
    typeof value === "string" && releaseDatePattern.test(value),
    `${label} must use the exact YYYY-MM-DD form`,
  );
  invariant(
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
    `${label} is not a real calendar date`,
  );
  return value;
}

export function validateResearchDisclosure(disclosure, version, relativePath = `research/disclosures/v${version}.md`) {
  invariant(typeof disclosure === "string", `${relativePath} must be text`);
  invariant(tagPattern.test(`v${version}`), `${relativePath} version must use MAJOR.MINOR.PATCH`);
  invariant(!disclosure.includes("\0"), `${relativePath} must not contain NUL bytes`);
  invariant(disclosure.endsWith("\n"), `${relativePath} must end with a newline`);

  const lines = disclosure.replaceAll("\r\n", "\n").split("\n");
  const expectedTitle = `# Research-output disclosure — v${version}`;
  invariant(lines[0] === expectedTitle, `${relativePath} must begin with ${expectedTitle}`);

  const outputLines = lines.filter((line) => line.startsWith("- **Output:**"));
  invariant(outputLines.length === 1, `${relativePath} must contain exactly one Output identity`);
  const outputTags = [...outputLines[0].matchAll(/`v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)`/gu)]
    .map(([outputTag]) => outputTag);
  invariant(
    outputTags.length === 1 && outputTags[0] === `\`v${version}\``,
    `${relativePath} Output identity must name only v${version}`,
  );

  const recordDateLines = lines.filter((line) => line.startsWith("- **Record date:**"));
  invariant(recordDateLines.length === 1, `${relativePath} must contain exactly one Record date`);
  assertCalendarDate(recordDateLines[0].slice("- **Record date:**".length).trim(), `${relativePath} Record date`);
  invariant(
    lines.filter((line) => line.startsWith("- **Authority:**")).length === 1,
    `${relativePath} must contain exactly one Authority boundary`,
  );

  const requiredHeadings = [
    ["## Contributors and responsibility"],
    ["## Funding and material support"],
    ["## Competing interests"],
    ["## Material AI, automation and external services", "## Material AI, automation, and external services"],
    ["## Pre-release evidence and publication conditions"],
  ];
  let precedingIndex = 0;
  const headingIndexes = [];
  for (const alternatives of requiredHeadings) {
    const matches = lines
      .map((line, index) => ({ index, line }))
      .filter(({ line }) => alternatives.includes(line));
    invariant(matches.length === 1, `${relativePath} must contain exactly one ${alternatives[0]}`);
    invariant(matches[0].index > precedingIndex, `${relativePath} disclosure sections are out of order`);
    headingIndexes.push(matches[0].index);
    precedingIndex = matches[0].index;
  }
  for (const [index, headingIndex] of headingIndexes.entries()) {
    const followingIndex = headingIndexes[index + 1] ?? lines.length;
    invariant(
      lines.slice(headingIndex + 1, followingIndex).some((line) => (
        line.trim().length > 0 && !/^#{1,6}\s/u.test(line)
      )),
      `${relativePath} ${requiredHeadings[index][0]} section must contain content`,
    );
  }
  return disclosure;
}

export function extractChangelogSection(changelog, version) {
  invariant(typeof changelog === "string", "CHANGELOG.md must be text");
  const normalized = changelog.replaceAll("\r\n", "\n");
  const releaseHeading = new RegExp(
    `^## \\[${escapedRegex(version)}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`,
    "gmu",
  );
  const matches = [...normalized.matchAll(releaseHeading)];
  invariant(matches.length === 1, `CHANGELOG.md must contain exactly one dated [${version}] release section`);

  const start = matches[0].index;
  const followingHeading = /^## \[/gmu;
  followingHeading.lastIndex = start + matches[0][0].length;
  const next = followingHeading.exec(normalized);
  const section = normalized.slice(start, next?.index ?? normalized.length).trimEnd();
  invariant(/^### /mu.test(section), `CHANGELOG.md [${version}] release section has no content heading`);
  return `${section}\n`;
}

function changelogReleaseDate(changelog, version) {
  const normalized = changelog.replaceAll("\r\n", "\n");
  const releaseHeading = new RegExp(
    `^## \\[${escapedRegex(version)}\\] - (\\d{4}-\\d{2}-\\d{2})\\s*$`,
    "gmu",
  );
  const matches = [...normalized.matchAll(releaseHeading)];
  invariant(matches.length === 1, `CHANGELOG.md must contain exactly one dated [${version}] release section`);
  return assertCalendarDate(matches[0][1], `CHANGELOG.md [${version}] release date`);
}

export function validateVersionAgreement({ tag, packageManifest, packageLock, citation, changelog }) {
  const version = parseReleaseTag(tag);
  const releaseDate = changelogReleaseDate(changelog, version);
  const observed = [
    ["package.json", packageManifest?.version],
    ["package-lock.json", packageLock?.version],
    ["package-lock.json packages['']", packageLock?.packages?.[""]?.version],
    ["CITATION.cff", citation?.version],
  ];
  const disagreements = observed
    .filter(([, candidate]) => String(candidate ?? "") !== version)
    .map(([source, candidate]) => `${source}=${JSON.stringify(candidate)}`);
  invariant(
    disagreements.length === 0,
    `Release version ${version} disagrees with ${disagreements.join(", ")}`,
  );
  invariant(
    packageManifest?.name === packageLock?.name && packageManifest?.name === packageLock?.packages?.[""]?.name,
    "package.json and package-lock.json package names disagree",
  );
  const citationReleaseDate = assertCalendarDate(
    citation?.["date-released"],
    "CITATION.cff date-released",
  );
  invariant(
    citationReleaseDate === releaseDate,
    `CITATION.cff date-released ${citationReleaseDate} disagrees with CHANGELOG.md [${version}] date ${releaseDate}`,
  );
  return Object.freeze({
    version,
    releaseDate,
    releaseNotes: extractChangelogSection(changelog, version),
  });
}

function packageNameFromLockPath(lockPath, rootName) {
  if (lockPath === "") return rootName;
  const marker = "node_modules/";
  const position = lockPath.lastIndexOf(marker);
  invariant(position >= 0, `Unsupported package-lock path: ${lockPath}`);
  const remainder = lockPath.slice(position + marker.length);
  const components = remainder.split("/");
  return components[0].startsWith("@") ? components.slice(0, 2).join("/") : components[0];
}

function parentLockPath(lockPath) {
  if (lockPath === "") return null;
  const match = /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/u.exec(lockPath);
  invariant(match, `Unsupported package-lock path: ${lockPath}`);
  return lockPath.slice(0, match.index);
}

function resolveLockedDependency(packages, ownerPath, dependencyName) {
  let cursor = ownerPath;
  while (cursor !== null) {
    const candidate = cursor === ""
      ? `node_modules/${dependencyName}`
      : `${cursor}/node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    cursor = parentLockPath(cursor);
  }
  return null;
}

function integrityChecksum(integrity) {
  if (typeof integrity !== "string") return undefined;
  const token = integrity.split(/\s+/u).find((entry) => entry.startsWith("sha512-"));
  if (!token) return undefined;
  const bytes = Buffer.from(token.slice("sha512-".length), "base64");
  return bytes.length === 64 ? [{ algorithm: "SHA512", checksumValue: bytes.toString("hex") }] : undefined;
}

function spdxTimestamp(releaseDate) {
  invariant(releaseDatePattern.test(releaseDate), "releaseDate must use YYYY-MM-DD");
  const timestamp = `${releaseDate}T00:00:00Z`;
  invariant(new Date(timestamp).toISOString() === `${releaseDate}T00:00:00.000Z`, "releaseDate is not a real calendar date");
  return timestamp;
}

export function buildSpdxDocument({ tag, version, packageLock, packageLockSha256, releaseDate }) {
  invariant(packageLock?.lockfileVersion === 3, "package-lock.json must use lockfileVersion 3");
  invariant(packageLock?.packages && typeof packageLock.packages === "object", "package-lock.json has no locked package graph");
  invariant(sha256Pattern.test(packageLockSha256), "packageLockSha256 must be a lowercase SHA-256 digest");
  const entries = Object.entries(packageLock.packages)
    .filter(([, metadata]) => metadata && typeof metadata === "object" && typeof metadata.version === "string")
    .sort(([left], [right]) => compareText(left, right));
  invariant(entries.some(([lockPath]) => lockPath === ""), "package-lock.json has no root package entry");

  const identifiers = new Map(entries.map(([lockPath], index) => [
    lockPath,
    lockPath === "" ? "SPDXRef-Package-root" : `SPDXRef-Package-${String(index).padStart(5, "0")}`,
  ]));
  const packages = entries.map(([lockPath, metadata]) => {
    const record = {
      name: packageNameFromLockPath(lockPath, packageLock.name),
      SPDXID: identifiers.get(lockPath),
      versionInfo: metadata.version,
      downloadLocation: metadata.resolved ?? "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      copyrightText: "NOASSERTION",
    };
    const checksums = integrityChecksum(metadata.integrity);
    if (checksums) record.checksums = checksums;
    return record;
  });

  const relationships = [{
    spdxElementId: "SPDXRef-DOCUMENT",
    relationshipType: "DESCRIBES",
    relatedSpdxElement: identifiers.get(""),
  }];
  for (const [lockPath, metadata] of entries) {
    const dependencyNames = new Set([
      ...Object.keys(metadata.dependencies ?? {}),
      ...Object.keys(metadata.devDependencies ?? {}),
      ...Object.keys(metadata.optionalDependencies ?? {}),
    ]);
    for (const dependencyName of [...dependencyNames].sort(compareText)) {
      const dependencyPath = resolveLockedDependency(packageLock.packages, lockPath, dependencyName);
      if (!dependencyPath || !identifiers.has(dependencyPath)) continue;
      relationships.push({
        spdxElementId: identifiers.get(lockPath),
        relationshipType: "DEPENDS_ON",
        relatedSpdxElement: identifiers.get(dependencyPath),
      });
    }
  }
  relationships.sort((left, right) => compareText(
    `${left.spdxElementId}\0${left.relationshipType}\0${left.relatedSpdxElement}`,
    `${right.spdxElementId}\0${right.relationshipType}\0${right.relatedSpdxElement}`,
  ));

  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${packageLock.name}-${version}`,
    documentNamespace: `https://github.com/cordanaLLM/20-watts-was-enough/releases/download/${tag}/sbom.${packageLockSha256}.spdx.json`,
    creationInfo: {
      created: spdxTimestamp(releaseDate),
      creators: [
        "Tool: 20-watts-was-enough/prepare-release-assets",
        "Organization: lusoris contributors",
      ],
    },
    packages,
    relationships,
  };
}

function checksumManifest(records) {
  return `${records
    .map(({ name, bytes }) => ({ name, digest: sha256(bytes) }))
    .sort((left, right) => compareText(left.name, right.name))
    .map(({ name, digest }) => `${digest}  ${name}`)
    .join("\n")}\n`;
}

export async function verifyReleaseChecksums(assetsRoot) {
  const initialSnapshot = await directorySnapshot(assetsRoot, "Release asset directory");
  invariant(initialSnapshot.entries.every((entry) => entry.regular), "Release asset directory may contain only regular files");
  const assetNames = initialSnapshot.entries.map((entry) => entry.name)
    .filter((name) => name !== "SHA256SUMS").sort(compareText);
  const checksumBytes = await readStableOpenedFile(path.join(assetsRoot, "SHA256SUMS"), {
    label: "release checksum manifest",
    containedBy: assetsRoot,
    maximumBytes: 1_000_000,
  });
  const lines = checksumBytes.toString("utf8").trimEnd().split("\n");
  const records = lines.map((line) => {
    const match = checksumLinePattern.exec(line);
    invariant(match, `Malformed SHA256SUMS line: ${line}`);
    return { digest: match[1], name: match[2] };
  });
  const names = records.map(({ name }) => name);
  invariant(JSON.stringify(names) === JSON.stringify([...names].sort(compareText)), "SHA256SUMS entries are not sorted");
  invariant(new Set(names).size === names.length, "SHA256SUMS contains duplicate asset names");
  invariant(JSON.stringify(names) === JSON.stringify(assetNames), "SHA256SUMS does not cover the exact release asset set");
  for (const { digest, name } of records) {
    const bytes = await readStableOpenedFile(path.join(assetsRoot, name), {
      label: `release asset ${name}`,
      containedBy: assetsRoot,
      maximumBytes: maximumReleaseAssetBytes,
    });
    invariant(sha256(bytes) === digest, `Release asset checksum mismatch: ${name}`);
  }
  const finalChecksumBytes = await readStableOpenedFile(path.join(assetsRoot, "SHA256SUMS"), {
    label: "release checksum manifest final verification",
    containedBy: assetsRoot,
    maximumBytes: 1_000_000,
  });
  invariant(finalChecksumBytes.equals(checksumBytes), "SHA256SUMS changed during checksum verification");
  for (const { digest, name } of records) {
    const finalBytes = await readStableOpenedFile(path.join(assetsRoot, name), {
      label: `release asset final verification ${name}`,
      containedBy: assetsRoot,
      maximumBytes: maximumReleaseAssetBytes,
    });
    invariant(sha256(finalBytes) === digest, `Release asset changed during checksum verification: ${name}`);
  }
  const finalSnapshot = await directorySnapshot(assetsRoot, "Release asset directory");
  invariant(
    sameDirectorySnapshot(initialSnapshot, finalSnapshot),
    "Release asset inventory changed during checksum verification",
  );
  return records;
}

async function loadReleaseInputs(root, version) {
  const paths = [
    "package.json",
    "package-lock.json",
    "CITATION.cff",
    "CHANGELOG.md",
    bookPdfRelativePath,
    bookManifestRelativePath,
    bookRendererLockPath,
    "LICENSE",
    "LICENSING.md",
    "THIRD_PARTY_NOTICES.txt",
    `research/disclosures/v${version}.md`,
  ];
  const bytesByPath = new Map(await Promise.all(paths.map(async (relativePath) => [
    relativePath,
    await readRegularFile(root, relativePath),
  ])));
  const licensesRoot = path.join(root, "LICENSES");
  const initialLicenseSnapshot = await directorySnapshot(licensesRoot, "LICENSES");
  const licenseEntries = initialLicenseSnapshot.entries;
  invariant(licenseEntries.length > 0, "LICENSES must contain at least one licence text");
  invariant(
    licenseEntries.every((entry) => entry.regular),
    "LICENSES may contain only regular files for release packaging",
  );
  for (const entry of licenseEntries) {
    const relativePath = `LICENSES/${entry.name}`;
    bytesByPath.set(relativePath, await readRegularFile(root, relativePath));
  }
  const finalLicenseSnapshot = await directorySnapshot(licensesRoot, "LICENSES");
  invariant(
    sameDirectorySnapshot(initialLicenseSnapshot, finalLicenseSnapshot),
    "LICENSES inventory changed while release inputs were read",
  );
  return bytesByPath;
}

export async function prepareReleaseAssets({
  root = defaultRoot,
  outputRoot = path.join(root, "build", "release"),
  additionalAssetsRoot,
  tag,
} = {}) {
  const requestedVersion = parseReleaseTag(tag);
  const disclosureRelativePath = `research/disclosures/v${requestedVersion}.md`;
  const disclosureAssetName = `research-output-disclosure-${tag}.md`;
  const bytesByPath = await loadReleaseInputs(root, requestedVersion);
  const packageManifest = parseJson(bytesByPath.get("package.json"), "package.json");
  const packageLock = parseJson(bytesByPath.get("package-lock.json"), "package-lock.json");
  const citation = parseYaml(bytesByPath.get("CITATION.cff"), "CITATION.cff");
  const changelog = bytesByPath.get("CHANGELOG.md").toString("utf8");
  const { version, releaseDate, releaseNotes } = validateVersionAgreement({
    tag,
    packageManifest,
    packageLock,
    citation,
    changelog,
  });
  const disclosureBytes = bytesByPath.get(disclosureRelativePath);
  validateResearchDisclosure(disclosureBytes.toString("utf8"), version, disclosureRelativePath);
  const releaseNotesWithDisclosure = [
    releaseNotes.trimEnd(),
    "",
    "## Research-output disclosure",
    "",
    `[Research-output disclosure for ${tag}](https://github.com/cordanaLLM/20-watts-was-enough/releases/download/${tag}/${disclosureAssetName})`,
    "",
  ].join("\n");
  const bookManifest = parseJson(bytesByPath.get(bookManifestRelativePath), bookManifestRelativePath);
  assertBookManifestContract({
    manifest: bookManifest,
    expectedVersion: version,
    expectedPdf: bookPdfRelativePath,
    expectedSourceRef: tag,
    expectedRendererLockSHA256: bookRendererLockSHA256(bytesByPath.get(bookRendererLockPath)),
  });
  assertBookPdfBytesIntegrity(bytesByPath.get(bookPdfRelativePath), bookManifest);

  const assetRecords = [
    { name: path.basename(bookPdfRelativePath), bytes: bytesByPath.get(bookPdfRelativePath) },
    { name: "book-manifest.json", bytes: bytesByPath.get(bookManifestRelativePath) },
    { name: "CITATION.cff", bytes: bytesByPath.get("CITATION.cff") },
    { name: "LICENSE", bytes: bytesByPath.get("LICENSE") },
    { name: "LICENSING.md", bytes: bytesByPath.get("LICENSING.md") },
    { name: "THIRD_PARTY_NOTICES.txt", bytes: bytesByPath.get("THIRD_PARTY_NOTICES.txt") },
    { name: disclosureAssetName, bytes: disclosureBytes },
    ...[...bytesByPath.entries()]
      .filter(([relativePath]) => relativePath.startsWith("LICENSES/"))
      .map(([relativePath, bytes]) => ({ name: path.basename(relativePath), bytes })),
    ...await loadAdditionalAssetRecords({
      repositoryRoot: root,
      additionalAssetsRoot,
      outputRoot,
    }),
  ];
  const names = assetRecords.map(({ name }) => name);
  invariant(new Set(names).size === names.length, "Release asset basenames must be unique");
  invariant(
    new Set(names.map((name) => name.toLowerCase())).size === names.length,
    "Release asset basenames must be unique without case distinctions",
  );
  invariant(!names.includes("SHA256SUMS") && !names.includes("sbom.spdx.json"), "Canonical files collide with generated release assets");

  const sbom = buildSpdxDocument({
    tag,
    version,
    packageLock,
    packageLockSha256: sha256(bytesByPath.get("package-lock.json")),
    releaseDate,
  });
  assetRecords.push({ name: "sbom.spdx.json", bytes: Buffer.from(`${JSON.stringify(sbom, null, 2)}\n`) });
  assetRecords.sort((left, right) => compareText(left.name, right.name));
  const checksums = Buffer.from(checksumManifest(assetRecords));

  const outputParent = path.dirname(outputRoot);
  await mkdir(outputParent, { recursive: true });
  const stagingRoot = await mkdtemp(path.join(outputParent, ".release-stage-"));
  try {
    const assetsRoot = path.join(stagingRoot, "assets");
    await mkdir(assetsRoot);
    for (const { name, bytes } of assetRecords) {
      await writeFile(path.join(assetsRoot, name), bytes, { flag: "wx" });
    }
    await writeFile(path.join(assetsRoot, "SHA256SUMS"), checksums, { flag: "wx" });
    await writeFile(path.join(stagingRoot, "release-notes.md"), releaseNotesWithDisclosure, { flag: "wx" });
    await verifyReleaseChecksums(assetsRoot);
    await rm(outputRoot, { recursive: true, force: true });
    await rename(stagingRoot, outputRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }

  return Object.freeze({
    tag,
    version,
    outputRoot,
    assetNames: Object.freeze([...assetRecords.map(({ name }) => name), "SHA256SUMS"].sort(compareText)),
  });
}

export function parseReleaseArguments(argv) {
  const values = {};
  const allowedArguments = new Set(["--additional-assets-root", "--tag"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    invariant(allowedArguments.has(argument), `Unknown argument: ${argument}`);
    invariant(index + 1 < argv.length, `${argument} requires a value`);
    const key = argument.slice(2).replaceAll("-", "_");
    invariant(values[key] === undefined, `${argument} may be specified only once`);
    values[key] = argv[index + 1];
    index += 1;
  }
  invariant(values.tag, "--tag is required");
  return values;
}

async function main() {
  const arguments_ = parseReleaseArguments(process.argv.slice(2));
  const result = await prepareReleaseAssets({
    additionalAssetsRoot: arguments_.additional_assets_root,
    tag: arguments_.tag,
  });
  console.log(`Prepared ${result.assetNames.length} release assets for ${result.tag} under ${path.relative(defaultRoot, result.outputRoot)}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
