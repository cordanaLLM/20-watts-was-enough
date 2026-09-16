import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  openSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initialiseFixtureGitRepository } from "./lib/git-test-fixture.mjs";

import {
  renderTranslationPage,
  translatedSourceDocuments,
  writeTranslationPages,
} from "./lib/translation-pages.mjs";

async function translationFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-translation-pages-"));
  const source = Buffer.from([
    "# Source title",
    "",
    "Canonical text.",
    "",
    "[Project README](../README.md)",
    "",
    "![Plot](../public/plots/example.svg)",
    "",
  ].join("\n"));
  const target = [
    "# Deutscher Titel",
    "",
    "Geprüfter deutscher Text.",
    "",
    "## Abschnitt",
    "",
    "[Zum Abschnitt](#abschnitt)",
    "",
    "[Projekt-README](../README.md)",
    "",
    "![Diagramm](../public/plots/example.svg)",
    "",
  ].join("\n");
  await mkdir(path.join(root, "concept"), { recursive: true });
  await mkdir(path.join(root, "translations", "de", "concept"), { recursive: true });
  await writeFile(path.join(root, "concept", "00-source.md"), source);
  const sourceRevision = initialiseFixtureGitRepository(root, ["concept/00-source.md"]);
  await writeFile(path.join(root, "translations", "de", "concept", "00-source.md"), target);
  await writeFile(
    path.join(root, "translations", "manifest.json"),
    `${JSON.stringify({
      schema: 2,
      sourceLanguage: "en-GB",
      documents: [{
        language: "de",
        source: "concept/00-source.md",
        target: "translations/de/concept/00-source.md",
        sourceRoute: "/concept/00-source/",
        route: "/de/concept/00-source/",
        sourceSha256: createHash("sha256").update(source).digest("hex"),
        targetSha256: createHash("sha256").update(target).digest("hex"),
        sourceRevision,
        reviewedAt: "2026-09-05T00:00:00Z",
        reviewers: ["reviewer-handle"],
      }],
    }, null, 2)}\n`,
  );
  return { root, sourceRevision };
}

test("a reviewed non-English manifest entry produces a static locale route", async (t) => {
  const { root, sourceRevision } = await translationFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = path.join(root, "dist");
  const template = `<!doctype html>
<html lang="en"><head><!-- pages-seo:head --><!-- /pages-seo:head -->
<link rel="stylesheet" href="/assets/help.css"></head>
<body><div id="root"><!-- pages-seo:fallback --><!-- /pages-seo:fallback --></div></body></html>`;
  const documents = translatedSourceDocuments(root);

  assert.equal(documents.length, 1);
  assert.equal(documents[0].route, "de/concept/00-source/");
  assert.equal(documents[0].language, "de");
  assert.equal(documents[0].canonicalSourcePath, "concept/00-source.md");
  assert.equal(documents[0].sourceRevision, sourceRevision);
  assert.equal(documents[0].reviewedAt, "2026-09-05T00:00:00Z");
  assert.deepEqual(
    writeTranslationPages({ outputRoot, template, documents, basePath: "/" }),
    ["de/concept/00-source/index.html"],
  );

  const html = await readFile(path.join(outputRoot, "de", "concept", "00-source", "index.html"), "utf8");
  assert.match(html, /<html lang="de">/u);
  assert.match(html, /rel="canonical" href="https:\/\/www\.cordana\.dev\/de\/concept\/00-source\/"/u);
  assert.match(html, /rel="alternate" hreflang="en" href="https:\/\/www\.cordana\.dev\/concept\/00-source\/"/u);
  assert.match(html, /rel="alternate" hreflang="de" href="https:\/\/www\.cordana\.dev\/de\/concept\/00-source\/"/u);
  assert.match(html, /<h1>Deutscher Titel<\/h1>/u);
  assert.match(html, /Geprüfter deutscher Text\./u);
  assert.match(html, /<section class="translation-review-context" lang="en"/u);
  assert.ok(html.includes(`/blob/${sourceRevision}/concept/00-source.md`));
  assert.ok(html.includes(
    `<code>${sourceRevision.match(/.{1,8}/gu).join("<wbr>")}</code>`,
  ));
  assert.match(
    html,
    /<time datetime="2026-09-05T00:00:00Z">2026-09-05T00:00:00Z<\/time>/u,
  );
  assert.match(html, /<strong>Read this page<\/strong>/u);
  assert.match(html, /href="\/concept\/00-source\/">English<\/a>/u);
  assert.match(html, /<span aria-current="page"><span lang="de">Deutsch<\/span> · current<\/span>/u);
  assert.match(html, />Help add or review a language<\/a>/u);
  assert.doesNotMatch(html, />Français<\/a>/u);
  assert.match(html, /href="#abschnitt"/u);
  assert.match(
    html,
    /href="https:\/\/github\.com\/cordanaLLM\/20-watts-was-enough\/blob\/main\/README\.md"/u,
  );
  assert.match(html, /src="\/plots\/example\.svg"/u);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/u);
});

test("translated route generation rejects path aliases before writing", async (t) => {
  const { root } = await translationFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const [document] = translatedSourceDocuments(root);
  const outputRoot = path.join(root, "dist");

  assert.throws(
    () => writeTranslationPages({
      outputRoot,
      template: '<html lang="en"><head><!-- pages-seo:head --><!-- /pages-seo:head --></head><body><!-- pages-seo:fallback --><!-- /pages-seo:fallback --></body></html>',
      documents: [{ ...document, route: "de/concept//00-source/" }],
      basePath: "/",
    }),
    /Unsafe translated publication route/,
  );
});

test("translation rendering rejects omitted maintained review provenance", async (t) => {
  const { root } = await translationFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const [document] = translatedSourceDocuments(root);
  const template = '<html lang="en"><head><!-- pages-seo:head --><!-- /pages-seo:head --></head><body><!-- pages-seo:fallback --><!-- /pages-seo:fallback --></body></html>';

  for (const [field, pattern] of [
    ["sourceRevision", /source revision is not an exact Git commit/u],
    ["reviewedAt", /review time is not canonical UTC/u],
  ]) {
    const malformed = { ...document };
    delete malformed[field];
    assert.throws(
      () => renderTranslationPage({
        template,
        document: malformed,
        documents: [malformed],
        basePath: "/",
      }),
      pattern,
      field,
    );
  }
});

test("translation rendering rejects a pathname replacement during its reviewed read", async (t) => {
  const { root } = await translationFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const movedPath = path.join(root, "translations", "de", "concept", "opened-original.md");

  try {
    assert.throws(
      () => translatedSourceDocuments(root, {
        afterTargetRead({ targetPath }) {
          renameSync(targetPath, movedPath);
          writeFileSync(targetPath, "# Unreviewed replacement\n");
        },
      }),
      /opened file changed while it was read|named path is linked, invalid, or no longer identifies the opened file/u,
    );
  } catch (error) {
    if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
    t.skip(`open translation replacement is unavailable: ${error.code}`);
  }
});

test("translation rendering rejects same-inode mutation during its reviewed read", async (t) => {
  const { root } = await translationFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.throws(
    () => translatedSourceDocuments(root, {
      afterTargetRead({ targetPath }) {
        const descriptor = openSync(targetPath, "r+");
        try {
          const replacement = Buffer.alloc(fstatSync(descriptor).size, 0x58);
          writeSync(descriptor, replacement, 0, replacement.length, 0);
        } finally {
          closeSync(descriptor);
        }
      },
    }),
    /opened file changed while it was read/u,
  );
});
