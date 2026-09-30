import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isOfficialEuLanguageCode } from "../app/lib/eu-languages.mjs";
import { publication } from "../app/lib/publication.mjs";
import { readStableOpenedFile } from "./lib/opened-file.mjs";
import { parseStrictJson } from "./lib/strict-json.mjs";

// Decision 0084 defines this registry. No generator reads it yet; this
// validator keeps it well-formed until the consumers of migration step 3 do.
export const topicRegistryPath = "topics.json";

export const topicRegistryLimits = Object.freeze({
  registryBytes: 64 * 1024,
  topics: 32,
  listEntries: 64,
  textCharacters: 160,
  pathCharacters: 256,
  contractEntries: 1024,
});

export const repositoryName = new URL(publication.repository).pathname
  .split("/")
  .filter(Boolean)
  .at(-1)
  .toLowerCase();

const limits = topicRegistryLimits;
const claimLedger = "research/claims.md";
const reservedTopicDirectory = "topics";
// The 44-character slug keeps the GitHub label `topic:<slug>` within the
// 50-character label-name limit (tooling/internal/githublabels/labels.go).
// The first character follows the reader's route-segment grammar
// `[a-z0-9][a-z0-9-]*` (app/lib/language-access.mjs), and a slug cannot
// start with a hyphen that command-line tools would read as an option.
const slugPattern = /^[a-z0-9][a-z0-9-]{1,43}$/u;
const pathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const chapterSectionPattern = /^## \S(?:.*\S)?$/u;
const foundingPdfPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.pdf$/u;
const contractNamePattern = /^([0-9]{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;
// C0 and C1 controls plus the Unicode line and paragraph separators.
const controlOrSeparatorPattern = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const registryFields = Object.freeze(["schema", "topics"]);
const topicFields = Object.freeze([
  "authorities",
  "book",
  "chapterSections",
  "root",
  "routePrefix",
  "slug",
  "status",
  "title",
  "unsupportedPhrases",
]);
const authorityKinds = Object.freeze({
  candidates: "directory",
  chapters: "directory",
  claims: "file",
  fixtures: "directory",
  mathematics: "directory",
});
const authorityFields = Object.freeze(Object.keys(authorityKinds));
const bookFields = Object.freeze(["frontMatter", "pdf", "route"]);
const statuses = new Set(["active", "archived"]);
const contractKinds = Object.freeze([["candidates", "candidate"], ["fixtures", "fixture"]]);

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fieldFindings(value, fields, label) {
  if (!isPlainObject(value)) return [`${label} must be an object`];
  const unknown = Object.keys(value).filter((field) => !fields.includes(field));
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length === 0 && missing.length === 0) return [];
  return [
    `${label} fields are not closed: unknown=[${unknown.join(", ")}], missing=[${missing.join(", ")}]`,
  ];
}

function listFindings(value, label) {
  if (!Array.isArray(value) || value.length > limits.listEntries) {
    return [`${label} must be an array of at most ${limits.listEntries} entries`];
  }
  return [];
}

function textFinding(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > limits.textCharacters
    || value.trim() !== value
    || controlOrSeparatorPattern.test(value)
  ) {
    return `${label} must be single-line text of 1 to ${limits.textCharacters} characters without surrounding space`;
  }
  return null;
}

function relativePathFinding(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > limits.pathCharacters
    || !value.split("/").every((segment) => pathSegmentPattern.test(segment))
  ) {
    return `${label} must be a relative path of letter, digit, ".", "_" or "-" segments joined by "/", without "." or ".." segments`;
  }
  return null;
}

function reservedPathFinding(topic, relative, label) {
  const reserved = relative === reservedTopicDirectory
    || relative.startsWith(`${reservedTopicDirectory}/`);
  if (topic.root === "." && reserved) {
    return `${label} must not lie under ${reservedTopicDirectory}/, which holds the roots of later topics`;
  }
  return null;
}

function repositoryPath(topic, relative) {
  return topic.root === "." ? relative : `${topic.root}/${relative}`;
}

function duplicateFindings(values, label, identity) {
  const seen = new Set();
  const findings = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const key = identity(value);
    if (seen.has(key)) findings.push(`${label} repeats ${JSON.stringify(value)}`);
    seen.add(key);
  }
  return findings;
}

function slugFindings(slug, label) {
  if (typeof slug !== "string" || !slugPattern.test(slug)) {
    return [`${label}.slug must be 2 to 44 lowercase letters, digits or hyphens, starting with a letter or digit`];
  }
  const findings = [];
  if (isOfficialEuLanguageCode(slug)) {
    findings.push(`${label}.slug "${slug}" is an EU language code; the reader serves /${slug}/ as a translation route`);
  }
  if (slug === repositoryName) {
    findings.push(`${label}.slug must not be the repository name "${repositoryName}", which the Pages build rejects as a legacy subpath`);
  }
  return findings;
}

function placementFindings(topic, index, label) {
  const founding = index === 0;
  const root = founding ? "." : `${reservedTopicDirectory}/${topic.slug}`;
  const routePrefix = founding ? "" : `${root}/`;
  const findings = [];
  if (topic.root !== root) {
    findings.push(founding
      ? `${label}.root must be "." because the first entry is the founding topic`
      : `${label}.root must be "${root}"`);
  }
  if (topic.routePrefix !== routePrefix) {
    findings.push(`${label}.routePrefix must be "${routePrefix}"`);
  }
  return findings;
}

function authorityFindings(topic, label) {
  const findings = fieldFindings(topic.authorities, authorityFields, `${label}.authorities`);
  if (findings.length > 0) return findings;
  if (topic.authorities.claims !== claimLedger) {
    findings.push(`${label}.authorities.claims must be "${claimLedger}", the ledger location of every topic`);
  }
  const seen = new Set();
  for (const field of authorityFields) {
    const value = topic.authorities[field];
    if (value === null) continue;
    const fieldLabel = `${label}.authorities.${field}`;
    const finding = relativePathFinding(value, fieldLabel)
      ?? reservedPathFinding(topic, value, fieldLabel);
    if (finding !== null) findings.push(finding);
    else if (seen.has(value)) findings.push(`${fieldLabel} repeats the path ${value}`);
    seen.add(value);
  }
  return findings;
}

function sectionFindings(topic, label) {
  const sections = topic.chapterSections;
  const findings = listFindings(sections, `${label}.chapterSections`);
  if (findings.length > 0) return findings;
  if (topic.authorities?.chapters === null && sections.length > 0) {
    findings.push(`${label}.chapterSections must be empty while authorities.chapters is null`);
  }
  for (const [position, section] of sections.entries()) {
    const positionLabel = `${label}.chapterSections[${position}]`;
    if (textFinding(section, positionLabel) !== null || !chapterSectionPattern.test(section)) {
      findings.push(`${positionLabel} must be one H2 heading line such as "## Scope"`);
    }
  }
  findings.push(...duplicateFindings(sections, `${label}.chapterSections`, (value) => value));
  return findings;
}

function phraseFindings(topic, label) {
  const phrases = topic.unsupportedPhrases;
  const findings = listFindings(phrases, `${label}.unsupportedPhrases`);
  if (findings.length > 0) return findings;
  for (const [position, phrase] of phrases.entries()) {
    const finding = textFinding(phrase, `${label}.unsupportedPhrases[${position}]`);
    if (finding !== null) findings.push(finding);
  }
  findings.push(...duplicateFindings(
    phrases,
    `${label}.unsupportedPhrases`,
    (value) => value.toLowerCase(),
  ));
  return findings;
}

// The founding topic keeps its published PDF name and `book/` route; a later
// topic's PDF name and route follow from its slug (decision 0084).
function bookPublicationFindings(topic, index, label) {
  const { pdf, route } = topic.book;
  const findings = [];
  if (index === 0) {
    if (route !== "book/") findings.push(`${label}.book.route must be "book/"`);
    if (typeof pdf !== "string" || !foundingPdfPattern.test(pdf)) {
      findings.push(`${label}.book.pdf must be a lowercase hyphenated .pdf file name`);
    }
    return findings;
  }
  const expectedRoute = `${reservedTopicDirectory}/${topic.slug}/book/`;
  if (route !== expectedRoute) findings.push(`${label}.book.route must be "${expectedRoute}"`);
  if (pdf !== `${topic.slug}-book.pdf`) findings.push(`${label}.book.pdf must be "${topic.slug}-book.pdf"`);
  return findings;
}

function frontMatterFinding(topic, label) {
  const { frontMatter } = topic.book;
  const fieldLabel = `${label}.book.frontMatter`;
  const pathFinding = relativePathFinding(frontMatter, fieldLabel)
    ?? reservedPathFinding(topic, frontMatter, fieldLabel);
  if (pathFinding !== null) return pathFinding;
  return frontMatter.endsWith(".md") ? null : `${fieldLabel} must name a Markdown file`;
}

function bookFindings(topic, index, label) {
  if (topic.book === null) return [];
  const findings = fieldFindings(topic.book, bookFields, `${label}.book`);
  if (findings.length > 0) return findings;
  findings.push(...bookPublicationFindings(topic, index, label));
  const frontMatter = frontMatterFinding(topic, label);
  if (frontMatter !== null) findings.push(frontMatter);
  return findings;
}

function topicFindings(topic, index) {
  const label = `topics[${index}]`;
  const fields = fieldFindings(topic, topicFields, label);
  if (fields.length > 0) return fields;
  const title = textFinding(topic.title, `${label}.title`);
  return [
    ...slugFindings(topic.slug, label),
    ...(title === null ? [] : [title]),
    ...(statuses.has(topic.status) ? [] : [`${label}.status must be "active" or "archived"`]),
    ...placementFindings(topic, index, label),
    ...authorityFindings(topic, label),
    ...sectionFindings(topic, label),
    ...phraseFindings(topic, label),
    ...bookFindings(topic, index, label),
  ];
}

function uniquenessFindings(topics) {
  const findings = [];
  const selectors = [
    ["slug", (topic) => topic?.slug],
    ["title", (topic) => topic?.title],
    ["book.pdf", (topic) => topic?.book?.pdf],
  ];
  for (const [field, select] of selectors) {
    const seen = new Map();
    for (const [index, topic] of topics.entries()) {
      const value = select(topic);
      if (typeof value !== "string") continue;
      if (seen.has(value)) {
        findings.push(`topics[${index}].${field} repeats topics[${seen.get(value)}].${field} ${JSON.stringify(value)}`);
      } else {
        seen.set(value, index);
      }
    }
  }
  return findings;
}

/**
 * Check the registry's schema, slug rules and uniqueness without reading the
 * file system. The first entry is the founding topic at root ".".
 */
export function topicRegistryFindings(registry) {
  const findings = fieldFindings(registry, registryFields, "registry");
  if (findings.length > 0) return findings;
  if (registry.schema !== 1) findings.push("schema must be 1");
  const { topics } = registry;
  if (!Array.isArray(topics) || topics.length < 1 || topics.length > limits.topics) {
    findings.push(`topics must hold the founding topic and at most ${limits.topics} entries in all`);
    return findings;
  }
  findings.push(...topics.flatMap((topic, index) => topicFindings(topic, index)));
  findings.push(...uniquenessFindings(topics));
  return findings;
}

function canonicalPath(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

async function pathFinding(repositoryRoot, relative, kind, label) {
  const absolute = path.join(repositoryRoot, ...relative.split("/"));
  let information;
  try {
    information = await lstat(absolute);
  } catch (error) {
    return `${label} ${relative} does not exist (${error.code ?? "unreadable"})`;
  }
  if (information.isSymbolicLink()) return `${label} ${relative} must not be a symbolic link`;
  const expected = kind === "directory" ? information.isDirectory() : information.isFile();
  if (!expected) return `${label} ${relative} must be a ${kind === "directory" ? "directory" : "regular file"}`;
  const resolved = await realpath(absolute);
  if (canonicalPath(resolved) !== canonicalPath(absolute)) {
    return `${label} ${relative} must not resolve through a symbolic link`;
  }
  if (resolved !== absolute) return `${label} ${relative} differs in letter case from ${path.relative(repositoryRoot, resolved)}`;
  return null;
}

// Only the founding PDF name is free text, so only it must name the released
// file. A later topic's PDF name follows from its slug, and its first render
// happens after its registry entry exists.
function topicPathChecks(topic, index, label) {
  const checks = [[topic.root, "directory", `${label}.root`]];
  for (const field of authorityFields) {
    const value = topic.authorities[field];
    if (value !== null) {
      checks.push([repositoryPath(topic, value), authorityKinds[field], `${label}.authorities.${field}`]);
    }
  }
  if (topic.book !== null) {
    checks.push([repositoryPath(topic, topic.book.frontMatter), "file", `${label}.book.frontMatter`]);
    if (index === 0) checks.push([`public/downloads/${topic.book.pdf}`, "file", `${label}.book.pdf`]);
  }
  return checks;
}

async function topicPathFindings(repositoryRoot, topics) {
  const findings = [];
  for (const [index, topic] of topics.entries()) {
    for (const [relative, kind, label] of topicPathChecks(topic, index, `topics[${index}]`)) {
      const finding = await pathFinding(repositoryRoot, relative, kind, label);
      if (finding !== null) findings.push(finding);
    }
  }
  return findings;
}

async function contractEntries(repositoryRoot, directory, label) {
  const entries = [];
  const handle = await opendir(path.join(repositoryRoot, ...directory.split("/")));
  for await (const entry of handle) {
    if (entries.length >= limits.contractEntries) {
      return { entries: [], finding: `${label} ${directory} holds more than ${limits.contractEntries} entries` };
    }
    entries.push({ name: entry.name, file: entry.isFile() });
  }
  entries.sort((left, right) => compareText(left.name, right.name));
  return { entries, finding: null };
}

async function directoryContracts(repositoryRoot, directory, kind, label) {
  const { entries, finding } = await contractEntries(repositoryRoot, directory, label);
  const findings = finding === null ? [] : [finding];
  const contracts = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md") || entry.name === "README.md") continue;
    const contractPath = `${directory}/${entry.name}`;
    const match = contractNamePattern.exec(entry.name);
    if (!entry.file) {
      findings.push(`${label} ${contractPath} must be a regular file`);
    } else if (match === null || match[1] === "000") {
      findings.push(`${label} ${contractPath} must be named NNN-name.md with NNN from 001 to 999`);
    } else {
      contracts.push({ identity: `${kind}-${match[1]}`, path: contractPath });
    }
  }
  return { contracts, findings };
}

/**
 * Decision 0084 keeps one candidate and one fixture number sequence across
 * all topics, so a contract number may appear in only one registered topic.
 */
async function numberingFindings(repositoryRoot, topics) {
  const findings = [];
  const owners = new Map();
  for (const [index, topic] of topics.entries()) {
    for (const [field, kind] of contractKinds) {
      const directory = topic.authorities[field];
      if (directory === null) continue;
      const label = `topics[${index}].authorities.${field}`;
      const result = await directoryContracts(repositoryRoot, repositoryPath(topic, directory), kind, label);
      findings.push(...result.findings);
      for (const contract of result.contracts) {
        const owner = owners.get(contract.identity);
        if (owner === undefined) owners.set(contract.identity, contract.path);
        else findings.push(`${contract.identity} is numbered by both ${owner} and ${contract.path}; ${kind} numbers are global across topics`);
      }
    }
  }
  return findings;
}

export async function readTopicRegistry(repositoryRoot) {
  const bytes = await readStableOpenedFile(path.join(repositoryRoot, topicRegistryPath), {
    label: topicRegistryPath,
    containedBy: repositoryRoot,
    maximumBytes: limits.registryBytes,
  });
  return parseStrictJson(bytes, {
    label: topicRegistryPath,
    maximumDepth: 4,
    maximumContainerEntries: limits.listEntries,
  });
}

/**
 * Validate topics.json under a repository root. Schema findings stop the run
 * before any path is inspected; path findings stop it before the contract
 * directories are listed.
 */
export async function validateTopicRegistry(root) {
  const repositoryRoot = await realpath(path.resolve(root));
  let registry;
  try {
    registry = await readTopicRegistry(repositoryRoot);
  } catch (error) {
    return { findings: [error.message], topics: [] };
  }
  const schemaFindings = topicRegistryFindings(registry);
  if (schemaFindings.length > 0) return { findings: schemaFindings, topics: [] };
  const pathFindings = await topicPathFindings(repositoryRoot, registry.topics);
  if (pathFindings.length > 0) return { findings: pathFindings, topics: [] };
  const findings = await numberingFindings(repositoryRoot, registry.topics);
  return { findings, topics: findings.length > 0 ? [] : registry.topics };
}

async function main() {
  const { findings, topics } = await validateTopicRegistry(process.cwd());
  if (findings.length > 0) {
    console.error(`Topic registry validation failed with ${findings.length} finding(s):`);
    for (const finding of findings) console.error(`- ${topicRegistryPath}: ${finding}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Topic registry validation passed: ${topics.length} topic(s), founding topic ${topics[0].slug}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Topic registry validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
