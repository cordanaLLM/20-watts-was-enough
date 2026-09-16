import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { publication } from "../app/lib/publication.mjs";
import { createSeoStaticPages } from "../vite.pages.config.ts";
import {
  bookSourceDocuments,
  markdownSourceDocument,
  portalSourceDocuments,
} from "./lib/portal-documents.mjs";
import {
  canonicalSite,
  populateSeoTemplate,
  renderBookFallback,
  renderDocumentFallback,
  renderHelpFallback,
  renderLanguageAvailability,
  renderPortalFallback,
  renderRobots,
  renderSeoHead,
  renderSitemap,
} from "./lib/pages-seo.mjs";
import { resolvePagesBase } from "./lib/pages-base.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portalStylesheet = await readFile(path.join(repositoryRoot, "app/portal.css"), "utf8");
const projectVersion = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
).version;
const documents = portalSourceDocuments(repositoryRoot);
const bookDocuments = bookSourceDocuments(repositoryRoot);
const helpDocument = markdownSourceDocument(
  repositoryRoot,
  "docs/how-to-help.md",
  "Project",
);

test("portal documents have unique descriptive routes and search metadata", () => {
  assert.equal(documents.length, 49);
  assert.equal(new Set(documents.map((document) => document.path)).size, documents.length);
  assert.equal(new Set(documents.map((document) => document.route)).size, documents.length);
  assert.equal(new Set(documents.map((document) => document.title)).size, documents.length);
  assert.equal(new Set(documents.map((document) => document.description)).size, documents.length);
  for (const document of documents) {
    assert.match(document.route, /^(?:concept|math)\/[a-z0-9-]+\/$/);
    assert.ok(document.description.length >= 45 && document.description.length <= 221);
  }
});

test("the canonical book source inventory wraps the exact portal corpus", () => {
  assert.equal(bookDocuments.length, 51);
  assert.deepEqual(bookDocuments.map((document) => document.path), [
    "README.md",
    ...documents.map((document) => document.path),
    "research/field-coverage.md",
  ]);
});

test("sitemap contains exactly the canonical public HTML routes", () => {
  const sitemap = renderSitemap(documents);
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, [
    canonicalSite,
    `${canonicalSite}book/`,
    `${canonicalSite}help/`,
    ...documents.map((document) => `${canonicalSite}${document.route}`),
  ]);
  assert.doesNotMatch(sitemap, /<(?:priority|changefreq|lastmod)>/);
  assert.doesNotMatch(locations.join("\n"), /[?#]/);
});

test("help metadata and fallback come from the canonical contribution map", () => {
  const head = renderSeoHead("help", helpDocument, "/research/");
  const jsonLd = JSON.parse(
    head.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1] ?? "",
  );
  assert.equal(jsonLd["@type"], "WebPage");
  assert.equal(jsonLd.url, `${canonicalSite}help/`);
  assert.match(head, new RegExp(`rel="canonical" href="${canonicalSite}help/"`));

  const fallback = renderHelpFallback(helpDocument, documents, "/research/");
  assert.match(fallback, /<h1>Help one bounded part move forward<\/h1>/);
  assert.match(fallback, /Current workstreams/);
  assert.match(fallback, /template=experiment-run-failure\.yml/);
  assert.match(fallback, /Short failed-run form/);
  assert.match(fallback, /href="https:\/\/github\.com\/cordanaLLM\/20-watts-was-enough\/blob\/main\/experiments\/workstation\/README\.md/);
  assert.match(fallback, /<details class="portal-mobile-menu"><summary>Menu<\/summary><nav aria-label="Mobile navigation">/);
  assert.match(fallback, /<nav aria-label="Primary navigation">/);
  assert.match(
    fallback,
    /role="region" aria-label="Scrollable contribution table" tabindex="0"/,
  );
  assert.doesNotMatch(fallback, /<script\b/);
  assert.match(
    portalStylesheet,
    /\.help-page \.help-prose table\s*\{[^}]*min-width:\s*960px;/s,
  );
});

test("the local Pages server renders the canonical no-JavaScript help page", async () => {
  const template = await readFile(
    path.join(repositoryRoot, "github-pages", "help", "index.html"),
    "utf8",
  );
  const transform = createSeoStaticPages().transformIndexHtml;
  const handler = typeof transform === "function" ? transform : transform?.handler;
  assert.ok(handler);
  const rendered = await handler.call({}, template, {
    path: `${resolvePagesBase(process.env.PAGES_BASE_PATH)}help/`,
    filename: path.join(repositoryRoot, "github-pages", "help", "index.html"),
    server: {},
  });

  assert.match(rendered, /<h1>Help one bounded part move forward<\/h1>/u);
  assert.match(rendered, /template=experiment-run-failure\.yml/u);
  assert.match(rendered, /<link rel="stylesheet" href="\.\.\/help\.css" \/>/u);
  assert.ok(
    template.indexOf('<link rel="stylesheet" href="../help.css" />')
      > template.indexOf("<!-- /pages-seo:head -->"),
    "the development stylesheet must survive SEO-head replacement",
  );
  assert.doesNotMatch(rendered, /<script\b[^>]*(?:\bsrc=|\btype=["']module["'])/u);
});

test("no-JS reading fallbacks expose help and source-bound issue routes", () => {
  const document = documents[0];
  const cases = [
    {
      fallback: renderPortalFallback(documents, "/research/"),
      identity: "research portal",
      reportLabel: "Report a portal problem",
    },
    {
      fallback: renderBookFallback(documents, "/research/", {
        editionVersion: projectVersion,
      }),
      identity: "book/",
      reportLabel: "Report a book problem",
    },
    {
      fallback: renderDocumentFallback(document, documents, "/research/"),
      identity: document.path,
      reportLabel: "Report this document",
    },
  ];

  for (const { fallback, identity, reportLabel } of cases) {
    assert.match(fallback, /<nav aria-label="Reader support">/);
    assert.ok(fallback.includes('href="/research/help/">How to help</a>'));
    assert.ok(fallback.includes(`>${reportLabel}</a>`));
    assert.match(fallback, /template=site-documentation-problem\.yml/u);
    const title = encodeURIComponent(`[Site/Docs] ${identity} @ main`).replaceAll("%20", "+");
    assert.ok(fallback.includes(title));
  }
});

test("no-JS language navigation separates published editions from contribution", () => {
  const route = "/concept/00-thesis-and-principles/";
  const translationDocuments = [{
    language: "de",
    sourceRoute: route,
    route: `/de${route}`,
  }];
  const canonical = renderLanguageAvailability(route, translationDocuments, "/research/");
  assert.match(canonical, /<strong>Read this page<\/strong>/u);
  assert.match(canonical, /<span aria-current="page"><span lang="en">English<\/span> · current<\/span>/u);
  assert.match(canonical, /lang="de" hreflang="de" href="\/research\/de\/concept\/00-thesis-and-principles\/">Deutsch<\/a>/u);
  assert.match(canonical, />Help add or review a language<\/a>/u);
  assert.doesNotMatch(canonical, />Français<\/a>/u);

  const translated = renderLanguageAvailability(`/de${route}`, translationDocuments, "/research/");
  assert.match(translated, /href="\/research\/concept\/00-thesis-and-principles\/">English<\/a>/u);
  assert.match(translated, /<span aria-current="page"><span lang="de">Deutsch<\/span> · current<\/span>/u);
});

test("the no-JS book fallback carries the canonical manuscript and nested headings", () => {
  const sample = [
    {
      path: "concept/a.md",
      route: "concept/a/",
      title: "First chapter",
      description: "First chapter summary",
      group: "Concept",
      kind: "markdown",
      words: 8,
      body: "# First chapter\n\n## Scope\n\n[Peer answer](./b.md#answer)\n\nCanonical first body with $x^2$.\n\n| Metric | Value |\n| --- | --- |\n| Energy | 20 W |",
    },
    {
      path: "concept/b.md",
      route: "concept/b/",
      title: "Second chapter",
      description: "Second chapter summary",
      group: "Concept",
      kind: "markdown",
      words: 6,
      body: "# Second chapter\n\n## Answer\n\nCanonical second body.",
    },
  ];
  const fallback = renderBookFallback(sample, "/research/", {
    editionVersion: projectVersion,
  });

  assert.match(fallback, /class="portal-skip-link" href="#book-concept-a-md"/u);
  assert.equal([...fallback.matchAll(/<h1>/gu)].length, 1);
  assert.equal([...fallback.matchAll(/<section id="book-/gu)].length, sample.length);
  assert.ok(fallback.includes("<h2>First chapter</h2>"));
  assert.match(fallback, /<h3 id="book-concept-a-md--scope">Scope<\/h3>/u);
  assert.match(fallback, /href="#book-concept-b-md--answer"/u);
  assert.match(fallback, /Canonical first body with/u);
  assert.match(fallback, /Canonical second body\./u);
  assert.match(fallback, /<math/u);
  assert.doesNotMatch(fallback, /class="katex-html"/u);
  assert.match(
    fallback,
    /class="table-region" role="region" aria-label="Data table in First chapter; use arrow keys to scroll when needed" tabindex="0"/u,
  );
  assert.doesNotMatch(
    renderDocumentFallback(sample[0], sample, "/research/"),
    /class="table-region"[^>]*tabindex/u,
  );
  assert.match(fallback, /<article class="prose markdown-body">[\s\S]+<\/article>/u);
  assert.throws(
    () => renderBookFallback([], "/research/", { editionVersion: projectVersion }),
    /requires at least one canonical document/u,
  );
});

test("robots allows rendering and identifies the canonical sitemap", () => {
  assert.equal(
    renderRobots(),
    "User-agent: *\nAllow: /\n\nSitemap: https://www.cordana.dev/sitemap.xml\n",
  );
  assert.doesNotMatch(renderRobots(), /Disallow:/);
});

test("document metadata and fallback are self-canonical, truthful, and subpath-safe", () => {
  const document = documents[0];
  const head = renderSeoHead("document", document, "/research/");
  const jsonLd = JSON.parse(head.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1] ?? "");
  assert.equal(jsonLd["@type"], "TechArticle");
  assert.equal(jsonLd.url, `${canonicalSite}${document.route}`);
  assert.equal(jsonLd.headline, document.title);
  assert.equal(jsonLd.wordCount, document.words);
  assert.match(head, new RegExp(`rel="canonical" href="${canonicalSite}${document.route}"`));
  assert.match(head, /href="\/research\/favicon\.svg"/);
  assert.match(head, /name="robots" content="index,follow,max-image-preview:large"/);

  const fallback = renderDocumentFallback(document, documents, "/research/");
  assert.match(fallback, /<main class="seo-static-page">/);
  assert.match(fallback, /href="\/research\/concept\//);
  assert.match(fallback, /<article class="prose markdown-body">/);
  assert.doesNotMatch(fallback, /\?doc=|node="\[object Object\]"/);
});

test("document metadata carries a reviewed translation language", () => {
  const document = { ...documents[0], language: "de" };
  const head = renderSeoHead("document", document, "/research/");
  const jsonLd = JSON.parse(
    head.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1] ?? "",
  );

  assert.equal(jsonLd.inLanguage, "de");
  assert.match(head, /name="citation_language" content="de"/);
  assert.match(head, /property="og:locale" content="de_DE"/);
  assert.equal(publication.htmlLanguage, "en");
  assert.match(
    renderSeoHead("document", documents[0], "/research/"),
    /name="citation_language" content="en"/,
  );
  assert.throws(
    () => renderSeoHead("document", { ...documents[0], language: "xx" }, "/research/"),
    /No Open Graph locale is registered/,
  );
});

test("canonical and translated document heads expose reciprocal language alternates", () => {
  const source = documents[0];
  const sourceRoute = `/${source.route}`;
  const translatedRoute = `/de/${source.route}`;
  const translationDocuments = [{
    language: "de",
    sourceRoute,
    route: translatedRoute,
  }];
  const translated = {
    ...source,
    language: "de",
    route: translatedRoute.slice(1),
  };
  const expected = [
    `<link rel="alternate" hreflang="en" href="${canonicalSite}${source.route}" data-language-alternate="" />`,
    `<link rel="alternate" hreflang="de" href="${canonicalSite}${translated.route}" data-language-alternate="" />`,
  ];

  for (const page of [source, translated]) {
    const head = renderSeoHead("document", page, "/research/", translationDocuments);
    for (const alternate of expected) assert.ok(head.includes(alternate));
    assert.equal((head.match(/rel="alternate" hreflang=/gu) ?? []).length, 2);
  }

  assert.doesNotMatch(
    renderSeoHead("document", source, "/research/"),
    /rel="alternate" hreflang=/u,
  );
  assert.throws(
    () => renderSeoHead("document", source, "/research/", [{
      language: "de",
      sourceRoute,
      route: `/fr/${source.route}`,
    }]),
    /unsafe routes/u,
  );
});

test("translated Markdown resolves media and links from its canonical source", () => {
  const source = documents[0];
  const peer = documents[1];
  const translatedPath = `translations/de/${source.path}`;
  const translated = {
    ...source,
    body: [
      "# Übersetzter Titel",
      "",
      `[Self](./${path.basename(source.path)}#scope)`,
      `[Peer](./${path.basename(peer.path)})`,
      "![Diagram](../assets/diagrams/example.svg)",
      "[Claims](../research/claims.md)",
    ].join("\n"),
    canonicalSourcePath: source.path,
    language: "de",
    path: translatedPath,
    route: `de/${source.route}`,
    sourceSha256: "a".repeat(64),
    targetSha256: "b".repeat(64),
    sourceRevision: "facac8c699a5c6e2ac258f30209a96ba06dca741",
    reviewedAt: "2026-09-05T00:00:00Z",
    reviewers: ["reviewer-handle"],
  };
  const translatedPeer = {
    ...peer,
    canonicalSourcePath: peer.path,
    language: "de",
    path: `translations/de/${peer.path}`,
    route: `de/${peer.route}`,
  };
  const fallback = renderDocumentFallback(
    translated,
    [translated, translatedPeer],
    "/research/",
    [{
      language: "de",
      sourceRoute: `/${source.route}`,
      route: `/${translated.route}`,
    }],
  );

  assert.ok(fallback.includes('href="#scope"'));
  assert.ok(fallback.includes(`href="/research/${translatedPeer.route}"`));
  assert.match(fallback, /src="\/research\/assets\/diagrams\/example\.svg"/);
  assert.ok(fallback.includes(
    `href="${publication.repository}/blob/main/research/claims.md"`,
  ));
  assert.match(fallback, /<p lang="en"><a href="\/research\/">Research portal<\/a><\/p>/);
  assert.match(fallback, /<nav lang="en" aria-label="Reader support">/);
  assert.match(fallback, /<nav lang="en" aria-label="Document sequence">/);
  assert.match(fallback, /<nav class="seo-language-access" lang="en" aria-label="Language availability">/);
  assert.match(fallback, /<span aria-current="page"><span lang="de">Deutsch<\/span> · current<\/span>/u);
  assert.match(fallback, /aria-labelledby="translation-review-context-heading"/u);
  assert.match(
    fallback,
    /blob\/facac8c699a5c6e2ac258f30209a96ba06dca741\/concept\//u,
  );
  assert.match(fallback, /datetime="2026-09-05T00:00:00Z"/u);
  assert.match(fallback, /<span lang="de">/);
  const issue = new URL(
    fallback.match(/href="([^"]+)">Report this translation<\/a>/u)?.[1].replaceAll("&amp;", "&") ?? "",
  );
  assert.equal(issue.searchParams.get("template"), "translation-problem.yml");
  assert.equal(issue.searchParams.get("language"), "de");
  assert.equal(
    issue.searchParams.get("source"),
    `${source.path} at commit facac8c699a5c6e2ac258f30209a96ba06dca741 (source SHA-256 ${"a".repeat(64)})`,
  );
  assert.match(issue.searchParams.get("detail"), new RegExp(`${translated.route}`));
  assert.match(issue.searchParams.get("detail"), /Reviewed at: 2026-09-05T00:00:00Z/u);
  assert.match(issue.searchParams.get("competence"), /^Recorded reviewer\(s\): /u);
  assert.doesNotMatch(fallback, /template=site-documentation-problem\.yml/u);
});

test("SEO template population fails closed when a marker is absent", () => {
  const template = "<!-- pages-seo:head -->old<!-- /pages-seo:head --><div><!-- pages-seo:fallback -->old<!-- /pages-seo:fallback --></div>";
  assert.equal(
    populateSeoTemplate(template, "new-head", "new-body"),
    "<!-- pages-seo:head -->\n    new-head\n    <!-- /pages-seo:head --><div><!-- pages-seo:fallback -->new-body<!-- /pages-seo:fallback --></div>",
  );
  assert.throws(
    () => populateSeoTemplate("<!-- pages-seo:head --><!-- /pages-seo:head -->", "head", "body"),
    /missing an SEO generation marker/,
  );
});
