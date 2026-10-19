import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { publication } from "../app/lib/publication.mjs";
import { createAjv } from "../experiments/workstation/lib/ajv.mjs";
import { bookPdfName } from "./book-source.mjs";
import topicsSchema from "./schemas/topics.schema.json" with { type: "json" };
import {
  repositoryName,
  topicRegistryFindings,
  topicRegistryLimits,
  validateTopicRegistry,
} from "./validate-topics.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(projectRoot, "scripts", "validate-topics.mjs");

function foundingTopic(overrides = {}) {
  return {
    slug: "20w",
    title: "Founding topic",
    root: ".",
    authorities: {
      chapters: "concept",
      mathematics: "math",
      claims: "research/claims.md",
      candidates: "experiments/candidates",
      fixtures: "experiments/fixtures",
    },
    chapterSections: ["## Scope", "## Evidence status"],
    unsupportedPhrases: ["zero-energy physical reflex"],
    book: { pdf: "founding-book.pdf", route: "book/", frontMatter: "README.md" },
    routePrefix: "",
    status: "active",
    ...overrides,
  };
}

// A smaller hypothesis under decision 0084: a claim ledger and no book.
function hypothesisTopic(slug, overrides = {}) {
  return {
    slug,
    title: `Hypothesis ${slug}`,
    root: `topics/${slug}`,
    authorities: {
      chapters: null,
      mathematics: null,
      claims: "research/claims.md",
      candidates: null,
      fixtures: null,
    },
    chapterSections: [],
    unsupportedPhrases: [],
    book: null,
    routePrefix: `topics/${slug}/`,
    status: "active",
    ...overrides,
  };
}

function registry(...topics) {
  return { schema: 1, topics };
}

function registryText(topics) {
  return `${JSON.stringify(registry(...topics), null, 2)}\n`;
}

const foundingFiles = Object.freeze({
  "README.md": "# Founding topic\n",
  "concept/00-thesis.md": "# Thesis\n",
  "math/README.md": "# Mathematics\n",
  "research/claims.md": "# Claims\n",
  "experiments/candidates/README.md": "# Candidates\n",
  "experiments/candidates/001-first-candidate.md": "# Candidate\n",
  "experiments/fixtures/001-first-fixture.md": "# Fixture\n",
  "public/downloads/founding-book.pdf": "%PDF-1.7\n",
});

async function writeTree(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

// `changes` adds or replaces files; a null value leaves that file out.
async function withRepository(topics, changes, callback) {
  const files = { ...foundingFiles, "topics.json": registryText(topics), ...changes };
  const root = await mkdtemp(path.join(os.tmpdir(), "topic-registry-"));
  try {
    await writeTree(root, Object.fromEntries(
      Object.entries(files).filter(([, content]) => content !== null),
    ));
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function goStringSlice(source, name) {
  const block = new RegExp(`var ${name} = \\[\\]string\\{([^}]*)\\}`, "u").exec(source);
  assert.ok(block, `tooling/internal/docscheck/check.go must define ${name}`);
  return [...block[1].matchAll(/"([^"\\]*)"/gu)].map((match) => match[1]);
}

function assertFinding(findings, pattern) {
  assert.ok(
    findings.some((finding) => pattern.test(finding)),
    `expected a finding matching ${pattern}; got ${JSON.stringify(findings)}`,
  );
}

test("the repository registry names the founding topic at its published paths", async () => {
  const { findings, topics } = await validateTopicRegistry(projectRoot);
  assert.deepEqual(findings, []);
  assert.equal(topics.length, 1);
  const [founding] = topics;
  assert.equal(founding.slug, "20w");
  assert.equal(founding.title, publication.siteName);
  assert.equal(founding.root, ".");
  assert.equal(founding.routePrefix, "");
  assert.equal(founding.status, "active");
  // The strict parser builds null-prototype objects; compare the members.
  assert.deepEqual({ ...founding.book }, {
    pdf: bookPdfName,
    route: publication.bookPath,
    frontMatter: "README.md",
  });
  assert.equal(publication.bookPdfPath, `downloads/${founding.book.pdf}`);
});

test("the founding entry repeats the docscheck chapter contract and phrase list", async () => {
  const source = await readFile(path.join(projectRoot, "tooling", "internal", "docscheck", "check.go"), "utf8");
  const { topics } = await validateTopicRegistry(projectRoot);
  assert.deepEqual(topics[0].chapterSections, goStringSlice(source, "requiredChapterSections"));
  assert.deepEqual(topics[0].unsupportedPhrases, goStringSlice(source, "unsupportedPhrases"));
});

test("a claims-only hypothesis passes with slugs at both length bounds", async () => {
  const shortest = "ab";
  const longest = "a".repeat(44);
  const topics = [foundingTopic(), hypothesisTopic(shortest), hypothesisTopic(longest)];
  assert.deepEqual(topicRegistryFindings(registry(...topics)), []);
  await withRepository(topics, {
    [`topics/${shortest}/research/claims.md`]: "# Claims\n",
    [`topics/${longest}/research/claims.md`]: "# Claims\n",
  }, async (root) => {
    const result = await validateTopicRegistry(root);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.topics.map((topic) => topic.slug), ["20w", shortest, longest]);
  });
});

test("the registry holds the founding topic and at most 32 entries", () => {
  const limit = topicRegistryLimits.topics;
  assert.equal(limit, 32);
  const topics = [foundingTopic()];
  for (let index = 1; index < limit; index += 1) topics.push(hypothesisTopic(`hypothesis-${index}`));
  assert.deepEqual(topicRegistryFindings(registry(...topics)), []);
  const bound = /^\/topics must NOT have more than 32 items$/u;
  assertFinding(topicRegistryFindings(registry(...topics, hypothesisTopic("hypothesis-32"))), bound);
  assertFinding(topicRegistryFindings(registry()), /^\/topics must NOT have fewer than 1 items$/u);
  assertFinding(topicRegistryFindings({ schema: 2, topics: [foundingTopic()] }), /^\/schema must be equal to constant$/u);
  assertFinding(topicRegistryFindings([]), /^\/ must be object$/u);
});

test("slugs outside the record's rules are rejected", () => {
  const cases = [
    ["a", /\/topics\/1\/slug must match pattern/u],
    ["a".repeat(45), /\/topics\/1\/slug must match pattern/u],
    ["Topic", /\/topics\/1\/slug must match pattern/u],
    ["topic_one", /\/topics\/1\/slug must match pattern/u],
    ["-topic", /\/topics\/1\/slug must match pattern/u],
    ["de", /slug "de" is an EU language code/u],
    ["en", /slug "en" is an EU language code/u],
    [repositoryName, /must not be the repository name "20-watts-was-enough"/u],
  ];
  for (const [slug, pattern] of cases) {
    assertFinding(topicRegistryFindings(registry(foundingTopic(), hypothesisTopic(slug))), pattern);
  }
  assertFinding(topicRegistryFindings(registry(foundingTopic({ slug: 7 }))), /\/topics\/0\/slug must be string/u);
});

test("closed fields and topic placement are enforced", () => {
  const cases = [
    [[foundingTopic({ extra: true })], /\/topics\/0 must NOT have additional properties/u],
    [[foundingTopic({ status: "draft" })], /\/topics\/0\/status must be equal to one of the allowed values/u],
    [[foundingTopic({ root: "topics/20w" })], /topics\[0\]\.root must be "\." because the first entry/u],
    [[foundingTopic({ routePrefix: "topics/20w/" })], /topics\[0\]\.routePrefix must be ""/u],
    [[foundingTopic(), hypothesisTopic("second", { root: "." })], /topics\[1\]\.root must be "topics\/second"/u],
    [[foundingTopic(), hypothesisTopic("second", { routePrefix: "" })], /routePrefix must be "topics\/second\/"/u],
    [[foundingTopic({ title: "Line\u2028break" })], /\/topics\/0\/title must match pattern/u],
    [[foundingTopic({ title: "Tab\tseparated" })], /\/topics\/0\/title must match pattern/u],
    [[foundingTopic({ title: "C1\u0085control" })], /\/topics\/0\/title must match pattern/u],
    [[foundingTopic({ title: " Padded" })], /\/topics\/0\/title must match pattern/u],
    [[foundingTopic({ title: "x".repeat(161) })], /\/topics\/0\/title must NOT have more than 160 characters/u],
  ];
  for (const [topics, pattern] of cases) assertFinding(topicRegistryFindings(registry(...topics)), pattern);
  const missing = foundingTopic();
  delete missing.status;
  assertFinding(topicRegistryFindings(registry(missing)), /\/topics\/0 must have required property 'status'/u);
});

test("authority paths stay relative, distinct and outside the topics directory", () => {
  const authorities = (overrides) => foundingTopic({
    authorities: { ...foundingTopic().authorities, ...overrides },
  });
  const cases = [
    [authorities({ claims: "research/other-claims.md" }), /authorities\.claims must be "research\/claims\.md"/u],
    [authorities({ claims: null }), /authorities\.claims must be "research\/claims\.md"/u],
    [authorities({ chapters: "../concept" }), /\/topics\/0\/authorities\/chapters must match pattern/u],
    [authorities({ chapters: "/concept" }), /\/topics\/0\/authorities\/chapters must match pattern/u],
    [authorities({ chapters: "concept\\part" }), /\/topics\/0\/authorities\/chapters must match pattern/u],
    [authorities({ chapters: "topics/other/concept" }), /must not lie under topics\//u],
    [authorities({ mathematics: "concept" }), /authorities\.mathematics repeats the path concept/u],
    [authorities({ audits: "research/audits" }), /\/topics\/0\/authorities must NOT have additional properties/u],
  ];
  for (const [topic, pattern] of cases) assertFinding(topicRegistryFindings(registry(topic)), pattern);
  const nested = hypothesisTopic("second", {
    authorities: { ...hypothesisTopic("second").authorities, chapters: "topics/concept" },
    chapterSections: ["## Scope"],
  });
  assert.deepEqual(topicRegistryFindings(registry(foundingTopic(), nested)), []);
});

test("chapter sections, unsupported phrases and book entries are checked", () => {
  const cases = [
    [foundingTopic({ chapterSections: ["# Scope"] }), /\/topics\/0\/chapterSections\/0 must match pattern/u],
    [foundingTopic({ chapterSections: ["## Scope", "## Scope"] }), /chapterSections repeats "## Scope"/u],
    [foundingTopic({ chapterSections: "## Scope" }), /\/topics\/0\/chapterSections must be array/u],
    [foundingTopic({ unsupportedPhrases: ["Upwards of 70%", "upwards of 70%"] }), /unsupportedPhrases repeats/u],
    [foundingTopic({ unsupportedPhrases: [""] }), /\/topics\/0\/unsupportedPhrases\/0 must NOT have fewer than 1 characters/u],
    [foundingTopic({ book: { pdf: "Book.pdf", route: "book/", frontMatter: "README.md" } }), /\/topics\/0\/book\/pdf must match pattern/u],
    [foundingTopic({ book: { pdf: "book.pdf", route: "books/", frontMatter: "README.md" } }), /book\.route must be "book\/"/u],
    [foundingTopic({ book: { pdf: "book.pdf", route: "book/", frontMatter: "README.txt" } }), /frontMatter must name a Markdown file/u],
    [foundingTopic({ book: { pdf: "book.pdf", route: "book/" } }), /\/topics\/0\/book must have required property 'frontMatter'/u],
  ];
  for (const [topic, pattern] of cases) assertFinding(topicRegistryFindings(registry(topic)), pattern);
  const withoutChapters = hypothesisTopic("second", { chapterSections: ["## Scope"] });
  assertFinding(topicRegistryFindings(registry(foundingTopic(), withoutChapters)), /must be empty while authorities\.chapters is null/u);
  const book = (pdf, route) => ({ pdf, route, frontMatter: "README.md" });
  const wrongPdf = hypothesisTopic("second", { book: book("second.pdf", "topics/second/book/") });
  assertFinding(topicRegistryFindings(registry(foundingTopic(), wrongPdf)), /topics\[1\]\.book\.pdf must be "second-book\.pdf"/u);
  const wrongRoute = hypothesisTopic("second", { book: book("second-book.pdf", "book/") });
  assertFinding(topicRegistryFindings(registry(foundingTopic(), wrongRoute)), /book\.route must be "topics\/second\/book\/"/u);
  const published = hypothesisTopic("second", { book: book("second-book.pdf", "topics/second/book/") });
  assert.deepEqual(topicRegistryFindings(registry(foundingTopic(), published)), []);
});

test("slugs, titles and book files are unique across topics", () => {
  const duplicateTitle = hypothesisTopic("second", { title: "Founding topic" });
  assertFinding(
    topicRegistryFindings(registry(foundingTopic(), duplicateTitle)),
    /topics\[1\]\.title repeats topics\[0\]\.title "Founding topic"/u,
  );
  const duplicateSlug = [foundingTopic(), hypothesisTopic("second"), hypothesisTopic("second", { title: "Other" })];
  assertFinding(topicRegistryFindings(registry(...duplicateSlug)), /topics\[2\]\.slug repeats topics\[1\]\.slug "second"/u);
  const book = { pdf: "second-book.pdf", route: "topics/second/book/", frontMatter: "README.md" };
  const collidingPdf = [foundingTopic({ book: { ...book, route: "book/" } }), hypothesisTopic("second", { book })];
  assertFinding(topicRegistryFindings(registry(...collidingPdf)), /topics\[1\]\.book\.pdf repeats topics\[0\]\.book\.pdf/u);
});

test("missing and mistyped paths fail after the schema passes", async () => {
  const cases = [
    [{ "public/downloads/founding-book.pdf": null }, /^topics\[0\]\.book\.pdf public\/downloads\/founding-book\.pdf does not exist \(ENOENT\)$/u],
    [{ "README.md": null }, /^topics\[0\]\.book\.frontMatter README\.md does not exist/u],
    [{ "math/README.md": null }, /^topics\[0\]\.authorities\.mathematics math does not exist/u],
    [{ "research/claims.md": null, "research/claims.md/part.md": "# Part\n" }, /authorities\.claims research\/claims\.md must be a regular file$/u],
    [{ "concept/00-thesis.md": null, concept: "# Not a directory\n" }, /authorities\.chapters concept must be a directory$/u],
  ];
  for (const [changes, pattern] of cases) {
    await withRepository([foundingTopic()], changes, async (root) => {
      const { findings, topics } = await validateTopicRegistry(root);
      assertFinding(findings, pattern);
      assert.deepEqual(topics, []);
    });
  }
  const second = hypothesisTopic("second", {
    book: { pdf: "second-book.pdf", route: "topics/second/book/", frontMatter: "README.md" },
  });
  await withRepository([foundingTopic(), second], {}, async (root) => {
    const { findings } = await validateTopicRegistry(root);
    assertFinding(findings, /^topics\[1\]\.root topics\/second does not exist/u);
    assertFinding(findings, /^topics\[1\]\.authorities\.claims topics\/second\/research\/claims\.md does not exist/u);
    assertFinding(findings, /^topics\[1\]\.book\.frontMatter topics\/second\/README\.md does not exist/u);
    assert.ok(!findings.some((finding) => finding.includes("second-book.pdf")), "a later topic renders its PDF after its entry exists");
  });
});

test("linked and differently cased authority paths fail", async (context) => {
  await withRepository([foundingTopic()], {
    "concept/00-thesis.md": null,
    "chapters/00-thesis.md": "# Thesis\n",
  }, async (root) => {
    try {
      await symlink(path.join(root, "chapters"), path.join(root, "concept"), "junction");
    } catch (error) {
      if (error.code !== "EPERM" && error.code !== "EACCES") throw error;
      context.skip(`this host cannot create a directory link (${error.code})`);
      return;
    }
    assertFinding((await validateTopicRegistry(root)).findings, /^topics\[0\]\.authorities\.chapters concept must not be a symbolic link$/u);
  });
  const cased = foundingTopic({ authorities: { ...foundingTopic().authorities, chapters: "Concept" } });
  await withRepository([cased], {}, async (root) => {
    // Case-insensitive file systems find the directory under another case;
    // case-sensitive ones do not find it at all. Both must fail.
    assertFinding(
      (await validateTopicRegistry(root)).findings,
      /^topics\[0\]\.authorities\.chapters Concept (?:does not exist|differs in letter case from concept)/u,
    );
  });
});

function contractTopic(slug) {
  return hypothesisTopic(slug, {
    authorities: {
      ...hypothesisTopic(slug).authorities,
      candidates: "experiments/candidates",
      fixtures: "experiments/fixtures",
    },
  });
}

test("candidate and fixture numbers are global across topics", async () => {
  const topics = [foundingTopic(), contractTopic("second")];
  const secondFiles = (candidate) => ({
    "topics/second/research/claims.md": "# Claims\n",
    [`topics/second/experiments/candidates/${candidate}`]: "# Candidate\n",
    "topics/second/experiments/fixtures/002-next-fixture.md": "# Fixture\n",
  });
  await withRepository(topics, secondFiles("002-next-candidate.md"), async (root) => {
    // Candidate 002 and fixture 002 share a number but not a kind.
    const { findings, topics: validated } = await validateTopicRegistry(root);
    assert.deepEqual(findings, []);
    assert.equal(validated.length, 2);
  });
  await withRepository(topics, secondFiles("001-reused-candidate.md"), async (root) => {
    assert.deepEqual((await validateTopicRegistry(root)).findings, [
      "candidate-001 is numbered by both experiments/candidates/001-first-candidate.md and "
        + "topics/second/experiments/candidates/001-reused-candidate.md; candidate numbers are global across topics",
    ]);
  });
});

test("contract file names carry one number from 001 to 999", async () => {
  const cases = [
    ["experiments/candidates/01-short.md", /candidates experiments\/candidates\/01-short\.md must be named NNN-name\.md/u],
    ["experiments/candidates/000-zero.md", /000-zero\.md must be named NNN-name\.md with NNN from 001 to 999/u],
    ["experiments/fixtures/002_Upper.md", /fixtures experiments\/fixtures\/002_Upper\.md must be named NNN-name\.md/u],
    ["experiments/fixtures/002-folder.md/part.txt", /fixtures experiments\/fixtures\/002-folder\.md must be a regular file/u],
    ["experiments/fixtures/001-repeated-fixture.md", /^fixture-001 is numbered by both experiments\/fixtures\/001-first-fixture\.md and experiments\/fixtures\/001-repeated-fixture\.md/u],
  ];
  for (const [file, pattern] of cases) {
    await withRepository([foundingTopic()], { [file]: "# Contract\n" }, async (root) => {
      assertFinding((await validateTopicRegistry(root)).findings, pattern);
    });
  }
  await withRepository([foundingTopic()], {
    "experiments/candidates/notes.txt": "Not a contract.\n",
    "experiments/candidates/999-last-candidate.md": "# Candidate\n",
  }, async (root) => {
    assert.deepEqual((await validateTopicRegistry(root)).findings, []);
  });
});

test("a contract directory is listed up to 1024 entries", async () => {
  const limit = topicRegistryLimits.contractEntries;
  assert.equal(limit, 1024);
  await withRepository([foundingTopic()], {}, async (root) => {
    const directory = path.join(root, "experiments", "candidates");
    // README.md and one contract are already present.
    for (let index = 2; index < limit; index += 1) {
      await writeFile(path.join(directory, `note-${String(index).padStart(4, "0")}.txt`), "");
    }
    assert.deepEqual((await validateTopicRegistry(root)).findings, []);
    await writeFile(path.join(directory, "note-over.txt"), "");
    assert.deepEqual((await validateTopicRegistry(root)).findings, [
      "topics[0].authorities.candidates experiments/candidates holds more than 1024 entries",
    ]);
  });
});

test("the registry file is read strictly and within its byte bound", async () => {
  const valid = registryText([foundingTopic()]);
  const limit = topicRegistryLimits.registryBytes;
  const atLimit = `${valid}${" ".repeat(limit - Buffer.byteLength(valid))}`;
  const cases = [
    [atLimit, null],
    [`${atLimit} `, /^Refusing topics\.json: file exceeds the 65536-byte limit$/u],
    ['{"schema":1,"schema":1,"topics":[]}', /^Invalid topics\.json: object repeats name "schema"$/u],
    [`${valid}{}`, /^Invalid topics\.json: contains trailing data/u],
    [Buffer.from([0x7b, 0xff, 0x7d]), /^Invalid topics\.json: input is not valid UTF-8$/u],
    [null, /ENOENT/u],
  ];
  for (const [text, pattern] of cases) {
    await withRepository([foundingTopic()], { "topics.json": text }, async (root) => {
      const { findings } = await validateTopicRegistry(root);
      if (pattern === null) assert.deepEqual(findings, []);
      else assertFinding(findings, pattern);
    });
  }
});

test("schema findings stop the run before any path is inspected", async () => {
  await withRepository([foundingTopic({ slug: "de" })], { "concept/00-thesis.md": null }, async (root) => {
    assert.deepEqual((await validateTopicRegistry(root)).findings, [
      'topics[0].slug "de" is an EU language code; the reader serves /de/ as a translation route',
    ]);
  });
});

test("the command exits non-zero with file-level findings", async () => {
  const run = (cwd) => spawnSync(process.execPath, [validatorPath], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
  const passing = run(projectRoot);
  assert.equal(passing.status, 0, passing.stderr);
  assert.equal(passing.stdout, "Topic registry validation passed: 1 topic(s), founding topic 20w.\n");
  await withRepository([foundingTopic({ status: "draft" })], {}, async (root) => {
    const failing = run(root);
    assert.equal(failing.status, 1);
    assert.equal(failing.stdout, "");
    assert.equal(
      failing.stderr,
      "Topic registry validation failed with 1 finding(s):\n"
        + "- topics.json: /topics/0/status must be equal to one of the allowed values\n",
    );
  });
});

test("topic registry schema limits equal exported topicRegistryLimits", () => {
  assert.equal(topicsSchema.properties.topics.maxItems, topicRegistryLimits.topics);
  assert.equal(topicsSchema.$defs.topic.properties.chapterSections.maxItems, topicRegistryLimits.listEntries);
  assert.equal(topicsSchema.$defs.topic.properties.unsupportedPhrases.maxItems, topicRegistryLimits.listEntries);
  assert.equal(topicsSchema.$defs.topic.properties.title.maxLength, topicRegistryLimits.textCharacters);
  assert.equal(topicsSchema.$defs.topic.properties.chapterSections.items.maxLength, topicRegistryLimits.textCharacters);
  assert.equal(topicsSchema.$defs.topic.properties.unsupportedPhrases.items.maxLength, topicRegistryLimits.textCharacters);
  assert.equal(topicsSchema.$defs.topic.properties.root.maxLength, topicRegistryLimits.pathCharacters);
  assert.equal(topicsSchema.$defs.topic.properties.routePrefix.maxLength, topicRegistryLimits.pathCharacters);
  assert.equal(topicsSchema.$defs.relativePath.maxLength, topicRegistryLimits.pathCharacters);
  assert.equal(topicsSchema.$defs.nullableRelativePath.maxLength, topicRegistryLimits.pathCharacters);
  assert.equal(topicsSchema.$defs.book.properties.pdf.maxLength, topicRegistryLimits.pathCharacters);
  assert.equal(topicsSchema.$defs.book.properties.route.maxLength, topicRegistryLimits.pathCharacters);
});

test("planted cases: extra property and invalid slugs rejected by validator and schema directly", () => {
  const ajv = createAjv({ allErrors: true });
  const contract = { ...topicsSchema };
  delete contract.$schema;
  const validateSchema = ajv.compile(contract);

  // Planted case (1): topics.json topic with extra property "unexpected": true -> rejected
  const docExtra = registry(foundingTopic({ unexpected: true }));
  assert.equal(validateSchema(docExtra), false);
  assertFinding(topicRegistryFindings(docExtra), /\/topics\/0 must NOT have additional properties/u);

  // Planted case (2a): slug "-bad" -> rejected
  const docSlugDash = registry(foundingTopic(), hypothesisTopic("-bad"));
  assert.equal(validateSchema(docSlugDash), false);
  assertFinding(topicRegistryFindings(docSlugDash), /\/topics\/1\/slug must match pattern/u);

  // Planted case (2b): slug 45 chars -> rejected
  const docSlug45 = registry(foundingTopic(), hypothesisTopic("a".repeat(45)));
  assert.equal(validateSchema(docSlug45), false);
  assertFinding(topicRegistryFindings(docSlug45), /\/topics\/1\/slug must match pattern/u);
});

