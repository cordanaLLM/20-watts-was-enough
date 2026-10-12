import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { readStableOpenedFileSync } from "./opened-file.mjs";

const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/iu;
const LICENSE_OVERRIDES = Object.freeze({
  "fastdom@1.0.12": {
    path: "LICENSES/fastdom-MIT.txt",
    source: "fastdom 1.0.12 npm package README licence section",
  },
  "rehype-katex@7.0.1": {
    path: "LICENSES/remark-math-MIT.txt",
    source: "remarkjs/remark-math tag rehype-katex@7.0.1, root license",
  },
  "remark-math@6.0.0": {
    path: "LICENSES/remark-math-MIT.txt",
    source: "remarkjs/remark-math upstream root license shared by the package",
  },
});

const VIRTUAL_MODULE_PACKAGES = Object.freeze({
  "\0rolldown/runtime.js": {
    expectedIdentity: "rolldown@1.2.12",
    packagePath: "node_modules/rolldown",
  },
  "\0vite/modulepreload-polyfill.js": {
    expectedIdentity: "vite@8.3.2",
    packagePath: "node_modules/vite",
  },
  "\0vite/preload-helper.js": {
    expectedIdentity: "vite@8.3.2",
    packagePath: "node_modules/vite",
  },
});
const PROJECT_VIRTUAL_MODULES = new Set([
  "\0virtual:portal-document-index",
]);

function normalizedVirtualModuleId(moduleId) {
  const normalized = moduleId.split("?", 1)[0].replaceAll("\\", "/");
  return normalized.charCodeAt(0) === 0 ? normalized : null;
}

function normalizedModuleId(moduleId) {
  return moduleId.replace(/^\0/u, "").split("?", 1)[0].replaceAll("\\", "/");
}

function packageRoot(moduleId) {
  const normalized = normalizedModuleId(moduleId);
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const prefix = normalized.slice(0, markerIndex + marker.length);
  const remainder = normalized.slice(markerIndex + marker.length);
  const segments = remainder.split("/");
  const packageSegments = segments[0]?.startsWith("@")
    ? segments.slice(0, 2)
    : segments.slice(0, 1);
  if (packageSegments.length === 0 || packageSegments.some((segment) => !segment)) {
    return null;
  }
  return realpathSync(path.normalize(`${prefix}${packageSegments.join("/")}`));
}

function textFile(pathname, containedBy) {
  const normalized = readStableOpenedFileSync(pathname, {
    label: `third-party notice ${pathname}`,
    containedBy,
    maximumBytes: 1_000_000,
  }).toString("utf8")
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/u, ""))
    .join("\n")
    .trimEnd();
  return `${normalized}\n`;
}

function packageMetadata(root) {
  const bytes = readStableOpenedFileSync(path.join(root, "package.json"), {
    label: `package metadata under ${root}`,
    containedBy: root,
    maximumBytes: 1_000_000,
  });
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function collectPackageNotices(root, repositoryRoot, texts, expectedIdentity = null) {
  const rootBefore = lstatSync(root, { bigint: true });
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) {
    throw new Error(`Unsafe bundled-package root: ${root}`);
  }
  const initialNames = readdirSync(root).sort((left, right) => left.localeCompare(right, "en"));
  const metadataRecord = packageMetadata(root);
  const metadata = metadataRecord.value;
  const candidates = initialNames.filter((name) => LICENSE_FILE.test(name));
  const packageIdentity = `${metadata.name}@${metadata.version}`;
  if (expectedIdentity !== null && packageIdentity !== expectedIdentity) {
    throw new Error(`Bundled package expected ${expectedIdentity}, found ${packageIdentity}`);
  }
  const notices = candidates.map((candidate) => ({
    filename: candidate,
    pathname: path.join(root, candidate),
    containedBy: root,
  }));
  const override = LICENSE_OVERRIDES[packageIdentity];
  if (notices.length === 0 && override) {
    notices.push({
      filename: `${override.path} (${override.source})`,
      pathname: path.join(repositoryRoot, ...override.path.split("/")),
      containedBy: repositoryRoot,
    });
  }
  if (notices.length === 0) {
    throw new Error(`Bundled package lacks a redistributable notice file: ${packageIdentity}`);
  }
  const noticeDigests = [];
  for (const notice of notices) {
    const source = textFile(notice.pathname, notice.containedBy);
    notice.source = source;
    const digest = createHash("sha256").update(source).digest("hex");
    noticeDigests.push(digest);
    const record = texts.get(digest) ?? { source, packages: new Set(), filenames: new Set() };
    record.packages.add(packageIdentity);
    record.filenames.add(notice.filename);
    texts.set(digest, record);
  }
  const finalMetadata = packageMetadata(root);
  if (!finalMetadata.bytes.equals(metadataRecord.bytes)) {
    throw new Error(`Bundled-package metadata changed while notices were read: ${root}`);
  }
  for (const notice of notices) {
    if (textFile(notice.pathname, notice.containedBy) !== notice.source) {
      throw new Error(`Bundled-package notice changed while notices were read: ${notice.pathname}`);
    }
  }
  const finalNames = readdirSync(root).sort((left, right) => left.localeCompare(right, "en"));
  const rootAfter = lstatSync(root, { bigint: true });
  if (
    rootBefore.dev !== rootAfter.dev
    || rootBefore.ino !== rootAfter.ino
    || rootBefore.mtimeNs !== rootAfter.mtimeNs
    || rootBefore.ctimeNs !== rootAfter.ctimeNs
    || JSON.stringify(initialNames) !== JSON.stringify(finalNames)
  ) {
    throw new Error(`Bundled-package inventory changed while notices were read: ${root}`);
  }
  return {
    identity: packageIdentity,
    license: typeof metadata.license === "string" ? metadata.license : "see included notice",
    noticeDigests,
  };
}

export function renderThirdPartyNotices({ moduleIds, repositoryRoot }) {
  const roots = new Map();
  for (const root of [...moduleIds].map(packageRoot).filter((value) => value !== null)) {
    roots.set(root, null);
  }
  for (const moduleId of moduleIds) {
    const virtualModuleId = normalizedVirtualModuleId(moduleId);
    if (virtualModuleId === null) continue;
    if (PROJECT_VIRTUAL_MODULES.has(virtualModuleId)) continue;
    const mapping = VIRTUAL_MODULE_PACKAGES[virtualModuleId];
    if (!mapping) {
      throw new Error(`Unmapped virtual bundle module: ${JSON.stringify(virtualModuleId)}`);
    }
    const root = realpathSync(
      path.join(repositoryRoot, ...mapping.packagePath.split("/")),
    );
    const priorExpectation = roots.get(root);
    if (priorExpectation !== undefined && priorExpectation !== null
      && priorExpectation !== mapping.expectedIdentity) {
      throw new Error(`Conflicting identities for virtual bundle root ${root}`);
    }
    roots.set(root, mapping.expectedIdentity);
  }
  const packages = [];
  const texts = new Map();

  for (const [root, expectedIdentity] of roots) {
    packages.push(collectPackageNotices(root, repositoryRoot, texts, expectedIdentity));
  }

  packages.sort((left, right) => left.identity.localeCompare(right.identity, "en"));
  const blocks = [...texts.entries()].sort(([left], [right]) => left.localeCompare(right, "en"));
  const ofl = textFile(path.join(repositoryRoot, "LICENSES", "OFL-1.1.txt"), repositoryRoot);
  const inventory = packages
    .map(({ identity, license }) => `- ${identity} — ${license}`)
    .join("\n");
  const licenseBlocks = blocks.map(([digest, record]) => [
    "================================================================================",
    `Packages: ${[...record.packages].sort().join(", ")}`,
    `Upstream notice file(s): ${[...record.filenames].sort().join(", ")}`,
    `SHA-256: ${digest}`,
    "--------------------------------------------------------------------------------",
    record.source.trimEnd(),
  ].join("\n")).join("\n\n");

  return [
    "THIRD-PARTY NOTICES — 20 Watts Was Enough static web edition",
    "",
    "Generated from the exact packages bundled by Vite. These components retain",
    "their own licences; inclusion here does not place them under the project's",
    "EUPL or CC BY-SA grants.",
    "",
    "Bundled package inventory",
    "-------------------------",
    inventory,
    "",
    "Upstream licence and notice texts",
    "----------------------------------",
    licenseBlocks,
    "",
    "================================================================================",
    "KaTeX font software notice",
    "--------------------------------------------------------------------------------",
    "Copyright (c) 2009-2010, Design Science, Inc. (www.mathjax.org)",
    "Copyright (c) 2014-2018 Khan Academy (www.khanacademy.org)",
    "Copyright 1995, 2009 American Mathematical Society.",
    "The distributed binaries carry their substituted family and reserved-name data",
    "in embedded font metadata. The families distributed here are KaTeX_AMS,",
    "KaTeX_Caligraphic, KaTeX_Fraktur, KaTeX_Main, KaTeX_Math, KaTeX_SansSerif,",
    "KaTeX_Script, KaTeX_Size1, KaTeX_Size2, KaTeX_Size3, KaTeX_Size4, and",
    "KaTeX_Typewriter. Those embedded records control for each binary.",
    "The complete, unmodified official OFL follows. Its opening <dates>, holder,",
    "and reserved-name lines are the licence's template example, not missing project",
    "attribution; the actual font notices are stated above and embedded in the files.",
    "",
    ofl.trimEnd(),
    "",
  ].join("\n");
}
