import assert from "node:assert/strict";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

import { bookSourceDocuments, portalSourceDocuments } from "./lib/portal-documents.mjs";
import { publication } from "../app/lib/publication.mjs";
import { bookDocumentHeadingId, bookDocumentId } from "../app/lib/book-document-id.mjs";
import { encodePortalFragment } from "../app/lib/portal-fragment.mjs";
import {
  isPublicRepositoryArtifact,
  isRepositoryArtifact,
  repositoryArtifactHref,
} from "../app/lib/repository-artifacts.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

function diffSnippet(expected, actual) {
  let index = 0;
  while (index < expected.length && index < actual.length && expected[index] === actual[index]) {
    index += 1;
  }
  const start = Math.max(0, index - 40);
  const end = Math.min(Math.max(expected.length, actual.length), index + 160);
  return `Diff at character index ${index}:\nExpected: ${JSON.stringify(expected.slice(start, end))}\nActual:   ${JSON.stringify(actual.slice(start, end))}`;
}

function joinBasePath(basePath, subPath) {
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${base}${subPath.replace(/^\/+/, "")}`;
}

function buildHelpers(root) {
  const portalDocs = portalSourceDocuments(root);
  const portalSet = new Set(portalDocs.map((doc) => doc.path));
  const portalRouteMap = new Map(portalDocs.map((doc) => [doc.path, doc.route]));

  const bookDocs = bookSourceDocuments(root);
  const bookDocumentPaths = new Set(bookDocs.map((doc) => doc.path));

  const surfaceDocumentHref = (docPath, hash = "") =>
    `${publication.repository}/blob/main/${docPath}${hash ? `#${encodeURIComponent(hash)}` : ""}`;

  function portalLocation(docPath, basePath, hash = "") {
    const route = portalRouteMap.get(docPath);
    const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
    return route
      ? `${base}${route}${encodePortalFragment(hash)}`
      : `${base}${docPath}${encodePortalFragment(hash)}`;
  }

  function repositoryDocumentHref(docPath, hash = "") {
    return `${publication.repository}/blob/main/${docPath}${hash ? `#${encodeURIComponent(hash)}` : ""}`;
  }

  const bookHref = (docPath, hash = "") => {
    if (bookDocumentPaths.has(docPath)) {
      return hash ? `#${bookDocumentHeadingId(docPath, hash)}` : `#${bookDocumentId(docPath)}`;
    }
    if (isRepositoryArtifact(docPath)) {
      if (!isPublicRepositoryArtifact(docPath)) {
        return surfaceDocumentHref(docPath, hash);
      }
      return joinBasePath("/", repositoryArtifactHref(docPath));
    }
    return surfaceDocumentHref(docPath, hash);
  };

  const documentMap = new Map();
  for (const doc of portalDocs) documentMap.set(doc.path, doc);
  for (const doc of bookDocs) documentMap.set(doc.path, doc);

  return {
    allDocuments: [...documentMap.values()],
    portalOptions: (doc) => ({
      currentPath: doc.path,
      headingOffset: 1,
      internalHref: (p, h) => portalLocation(p, "/", h),
      isNavigablePath: (p) => portalSet.has(p),
      nonNavigableHref: repositoryDocumentHref,
      assetBasePath: "/",
    }),
    bookOptions: (doc) => ({
      currentPath: doc.path,
      headingOffset: 1,
      internalHref: bookHref,
      imageLoading: "lazy",
      renderExternalImages: true,
      assetBasePath: "/",
    }),
  };
}

async function runNegativeCases(t, MarkdownDocument, renderMarkdownDocument) {
  await t.test("negative case (a): body with $x$ contains katex class", () => {
    const rendered = renderMarkdownDocument("Math $x$", { currentPath: "concept/00-motivation.md" });
    assert.match(rendered, /class="[^"]*\bkatex\b[^"]*"/);
  });

  await t.test("negative case (b): mutated headingOffset 0 does not equal oracle with offset 1", () => {
    const body = "# Section Heading\n\nBody content.";
    const oracle = renderToStaticMarkup(createElement(MarkdownDocument, {
      body,
      currentPath: "concept/00-motivation.md",
      headingOffset: 1,
      onNavigate: () => {},
    }));
    const mutated = renderMarkdownDocument(body, {
      currentPath: "concept/00-motivation.md",
      headingOffset: 0,
    });
    assert.notStrictEqual(mutated, oracle);
  });

  await t.test("negative case (c): raw script tag is dropped from output", () => {
    const rendered = renderMarkdownDocument("<script>alert('xss')</script>\n\nSafe paragraph.", {
      currentPath: "concept/00-motivation.md",
    });
    assert.doesNotMatch(rendered, /<script/i);
    assert.doesNotMatch(rendered, /alert/);
  });

  await t.test("negative case (d): mermaid fence yields MermaidDiagram static markup", () => {
    const body = "```mermaid\ngraph TD;\nA-->B;\n```";
    const rendered = renderMarkdownDocument(body, { currentPath: "concept/00-motivation.md" });
    assert.strictEqual(rendered, '<div class="diagram diagram-loading">Rendering diagram…</div>');
  });

  await runOracleNegativeCases(t, MarkdownDocument, renderMarkdownDocument);
}

async function runOracleNegativeCases(t, MarkdownDocument, renderMarkdownDocument) {
  await t.test("negative case (f): Markdown HTML is dropped exactly as the oracle drops it", () => {
    const body = "Before <span id=\"injected\">inline</span> after.\n\n<div id=\"block\">block</div>";
    const options = { currentPath: "concept/00-motivation.md" };
    const oracle = renderToStaticMarkup(createElement(MarkdownDocument, { ...options, body, onNavigate: () => {} }));
    const rendered = renderMarkdownDocument(body, options);
    assert.doesNotMatch(rendered, /injected|block<|<div id/);
    assert.strictEqual(rendered, oracle);
  });

  await t.test("negative case (g): links carry no leaked node attribute", () => {
    const options = { currentPath: "concept/00-motivation.md" };
    const body = "[external](https://example.org) and [local](01-other.md#part)";
    const oracle = renderToStaticMarkup(createElement(MarkdownDocument, { ...options, body, onNavigate: () => {} }));
    const rendered = renderMarkdownDocument(body, options);
    assert.match(oracle, / node="\[object Object\]"/);
    assert.doesNotMatch(rendered, /\bnode=/);
    assert.strictEqual(rendered, withoutLeakedNodeProp(oracle));
  });

  await t.test("negative case (e): boundary empty body renders empty string in both", () => {
    const oracle = renderToStaticMarkup(createElement(MarkdownDocument, {
      body: "",
      currentPath: "concept/00-motivation.md",
      onNavigate: () => {},
    }));
    const rendered = renderMarkdownDocument("", { currentPath: "concept/00-motivation.md" });
    assert.strictEqual(oracle, "");
    assert.strictEqual(rendered, "");
  });
}

// The React link component spreads react-markdown's `node` prop onto <a>, so the
// oracle carries node="[object Object]"; the server renderer does not copy that defect.
function withoutLeakedNodeProp(html) {
  return html.replaceAll(' node="[object Object]"', "");
}

async function assertDocumentParity(t, doc, label, options, MarkdownDocument, renderMarkdownDocument) {
  await t.test(`${label} parity: ${doc.path}`, () => {
    const oracle = withoutLeakedNodeProp(renderToStaticMarkup(createElement(MarkdownDocument, {
      ...options,
      body: doc.body,
      onNavigate: () => {},
    })));
    const actual = renderMarkdownDocument(doc.body, options);
    if (oracle !== actual) {
      assert.fail(`Mismatch on document ${doc.path} with ${label}.\n${diffSnippet(oracle, actual)}`);
    }
  });
}

async function runDocumentTests(t, allDocuments, helpers, MarkdownDocument, renderMarkdownDocument) {
  for (const doc of allDocuments) {
    const portalOpts = helpers.portalOptions(doc);
    await assertDocumentParity(t, doc, "portal option", portalOpts, MarkdownDocument, renderMarkdownDocument);

    const bookOpts = helpers.bookOptions(doc);
    await assertDocumentParity(t, doc, "book option", bookOpts, MarkdownDocument, renderMarkdownDocument);
  }
}

test("markdown rendering parity against React oracle", { timeout: 300_000 }, async (t) => {
  const vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    plugins: [react()],
  });

  after(async () => {
    await vite.close();
  });

  const reactModule = await vite.ssrLoadModule("/app/components/markdown-document.tsx");
  const MarkdownDocument = reactModule.MarkdownDocument;

  const serverModule = await vite.ssrLoadModule("/src/lib/server/render-markdown.ts");
  const renderMarkdownDocument = serverModule.renderMarkdownDocument;

  const helpers = buildHelpers(repositoryRoot);

  await runNegativeCases(t, MarkdownDocument, renderMarkdownDocument);
  await runDocumentTests(t, helpers.allDocuments, helpers, MarkdownDocument, renderMarkdownDocument);
});
