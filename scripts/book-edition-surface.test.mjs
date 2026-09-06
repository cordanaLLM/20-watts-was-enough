import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import postcss from "postcss";
import ts from "typescript";
import {
  bookEditionIdentity,
  bookSurfaceFromLocation,
  repositoryDocumentHref,
  repositoryRefForSurface,
  repositoryTreeHref,
} from "../app/lib/book-release-identity.mjs";
import { assertBookManifestContract } from "./lib/book-manifest-contract.mjs";
import { parseBookPdfGenerationOptions } from "./lib/book-pdf-generation-options.mjs";
import {
  assertBookRendererLockIdentity,
  bookRendererIdentityFromEnvironment,
  bookRendererLockSHA256,
} from "./lib/book-renderer-identity.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relative) {
  return readFile(path.join(repositoryRoot, relative), "utf8");
}

async function parsedSource(relative) {
  return ts.createSourceFile(relative, await source(relative), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function moduleImport(syntax, name) {
  const declarations = syntax.statements.filter((node) => (
    ts.isImportDeclaration(node) && node.moduleSpecifier.text === name
  ));
  assert.equal(declarations.length, 1, `${syntax.fileName}: expected one ${name} import`);
  return declarations[0];
}

async function productionMathPlugin() {
  const owner = "app/components/markdown-document.tsx";
  const syntax = await parsedSource(owner);
  const declaration = moduleImport(syntax, "rehype-katex");
  const binding = declaration.importClause?.name?.text;
  assert.ok(binding, "production math plugin must retain its default import");
  const pending = [syntax];
  let visited = 0;
  let enabled = 0;
  while (pending.length > 0) {
    assert.ok(++visited <= 16_384, "production Markdown syntax traversal exceeds its bound");
    const node = pending.pop();
    if (ts.isJsxAttribute(node) && node.name.text === "rehypePlugins") {
      const expression = node.initializer?.expression;
      assert.ok(expression && ts.isArrayLiteralExpression(expression), "review changed production plugin options");
      enabled += expression.elements.filter((element) => ts.isIdentifier(element) && element.text === binding).length;
    }
    ts.forEachChild(node, (child) => { pending.push(child); });
  }
  assert.equal(enabled, 1, "the imported math plugin must occur in the actual rehypePlugins pipeline");
  const require = createRequire(path.join(repositoryRoot, owner));
  return require.resolve(declaration.moduleSpecifier.text);
}

async function installedKatex(require, lock) {
  const filename = await realpath(require.resolve("katex/package.json"));
  const relative = path.relative(repositoryRoot, path.dirname(filename)).replaceAll("\\", "/");
  assert.ok(relative.startsWith("node_modules/") && !relative.includes("../"), "KaTeX must belong to this installation");
  const metadata = JSON.parse(await readFile(filename, "utf8"));
  const identity = lock.packages[relative];
  assert.equal(metadata.name, "katex");
  assert.equal(metadata.version, identity?.version, `${relative}: installed KaTeX differs from the lock`);
  assert.ok(identity.integrity && identity.resolved, `${relative}: missing locked package identity`);
  return { metadata, identity };
}

test("production KaTeX renderer and public styles share the exact locked package", async () => {
  const manifest = JSON.parse(await source("package.json"));
  const lock = JSON.parse(await source("package-lock.json"));
  const pluginEntry = await productionMathPlugin();
  const renderer = await installedKatex(createRequire(pluginEntry), lock);
  assert.match(manifest.dependencies.katex, /^\d+\.\d+\.\d+$/u);
  assert.equal(lock.packages[""].dependencies.katex, manifest.dependencies.katex);
  for (const owner of ["github-pages/main.tsx", "github-pages/book.tsx"]) {
    const declaration = moduleImport(await parsedSource(owner), "katex/dist/katex.min.css");
    assert.equal(declaration.importClause, undefined, `${owner}: stylesheet must remain a side-effect import`);
    const require = createRequire(path.join(repositoryRoot, owner));
    const stylesheet = await installedKatex(require, lock);
    assert.equal(renderer.metadata.version, stylesheet.metadata.version, `${owner}: renderer/style version mismatch`);
    assert.equal(stylesheet.metadata.version, manifest.dependencies.katex, `${owner}: stylesheet differs from direct pin`);
    for (const key of ["integrity", "resolved"]) assert.equal(renderer.identity[key], stylesheet.identity[key], `${owner}: ${key} mismatch`);
    const css = postcss.parse(await readFile(require.resolve(declaration.moduleSpecifier.text), "utf8"));
    const selectors = [];
    css.walkRules((rule) => { selectors.push(...rule.selectors); });
    assert.ok(selectors.some((selector) => /\.katex-strut\b/u.test(selector)), `${owner}: missing aligned structural styles`);
  }
  assert.equal(manifest.dependencies["rehype-katex"], "7.0.1", "review the compatibility override when the plugin changes");
  assert.deepEqual(manifest.overrides?.["rehype-katex@7.0.1"], { katex: "$katex" });
});

function mathElements(tree) {
  const pending = [tree];
  const elements = [];
  let visited = 0;
  while (pending.length > 0) {
    assert.ok(++visited <= 8_192, "bounded math fixture produced excessive HAST");
    const node = pending.pop();
    if (node.type === "element") elements.push(node);
    if (node.children) pending.push(...node.children);
  }
  return elements;
}

test("the actual production math plugin preserves display, MathML, errors and untrusted input", async () => {
  const pluginEntry = await productionMathPlugin();
  const { default: plugin } = await import(pathToFileURL(pluginEntry).href);
  const { VFile } = await import(pathToFileURL(createRequire(pluginEntry).resolve("vfile")).href);
  const cases = [
    { name: "inline", value: String.raw`\frac{a_1}{\sqrt{b}}`, display: false },
    { name: "display", value: String.raw`\frac{a_1}{\sqrt{b}} \tag{A}`, display: true },
    { name: "malformed", value: String.raw`\frac{`, display: true, error: true },
    { name: "untrusted", value: String.raw`\href{javascript:alert(1)}{unsafe}`, display: false },
  ];
  for (const fixture of cases) {
    const file = new VFile();
    const tree = { type: "root", children: [{
      type: "element", tagName: "span", properties: { className: [fixture.display ? "math-display" : "math-inline"] },
      children: [{ type: "text", value: fixture.value }],
    }] };
    plugin()(tree, file);
    const elements = mathElements(tree);
    const classes = elements.flatMap((node) => node.properties.className ?? []);
    assert.ok(elements.every((node) => !["script", "a"].includes(node.tagName)), `${fixture.name}: unsafe element`);
    if (fixture.error) {
      assert.ok(classes.includes("katex-error"), "malformed input must retain visible error output");
      assert.equal(file.messages.length, 1, "malformed input must retain its parse diagnostic");
      assert.equal(file.messages[0].ruleId, "parseerror");
      continue;
    }
    assert.equal(file.messages.length, 0, `${fixture.name}: unexpected parse diagnostic`);
    assert.ok(elements.some((node) => node.tagName === "math"), `${fixture.name}: MathML missing`);
    const annotations = elements.filter((node) => node.tagName === "annotation");
    assert.equal(annotations.length, 1, `${fixture.name}: expected one source annotation`);
    assert.equal(annotations[0].properties.encoding, "application/x-tex");
    assert.equal(annotations[0].children.length, 1, `${fixture.name}: split source annotation`);
    assert.equal(annotations[0].children[0].type, "text");
    assert.equal(annotations[0].children[0].value, fixture.value);
    if (["inline", "display"].includes(fixture.name)) {
      for (const tag of ["mfrac", "msqrt", "msub"]) {
        assert.ok(elements.some((node) => node.tagName === tag), `${fixture.name}: ${tag} meaning missing`);
      }
    }
    assert.ok(classes.includes("katex-html"), `${fixture.name}: visual HTML missing`);
    assert.equal(classes.includes("katex-display"), fixture.display, `${fixture.name}: display mode changed`);
    assert.ok(classes.includes("katex-strut"), `${fixture.name}: old renderer structural classes`);
  }
});

test("the factual-record status domain remains exact display math within its list item", async () => {
  const [{ unified }, { default: remarkParse }, { default: remarkMath }] = await Promise.all([
    import("unified"), import("remark-parse"), import("remark-math"),
  ]);
  const domain = String.raw`\sigma\in\{\text{active},\text{superseded},\text{revoked},\text{disputed}\}`;
  const parser = unified().use(remarkParse).use(remarkMath);
  const assertStatusDisplay = (markdown) => {
    assert.ok(Buffer.byteLength(markdown) <= 2 * 1024 * 1024, "bounded status source");
    const pending = [{ node: parser.parse(markdown), item: null }];
    const matches = [];
    let visited = 0;
    while (pending.length > 0) {
      assert.ok(++visited <= 16_384, "bounded status Markdown traversal");
      const { node, item } = pending.pop();
      const owner = node.type === "listItem" ? node : item;
      if (["math", "inlineMath"].includes(node.type) && node.value === domain) matches.push({ node, owner });
      for (const child of node.children ?? []) pending.push({ node: child, item: owner });
    }
    assert.equal(matches.length, 1, "preserve the exact four-state domain once");
    const { node, owner } = matches[0];
    assert.equal(node.type, "math", "the wide status domain needs the existing display overflow owner");
    assert.ok(owner, "the status equation must remain within its definition list item");
    assert.ok(owner.children.some((paragraph) => paragraph.type === "paragraph"
      && paragraph.children.some((child) => child.type === "inlineMath" && child.value === String.raw`\sigma`)),
    "retain the status symbol in the list-item introduction");
  };
  assertStatusDisplay(await source("concept/60-hardening-and-factual-memory.md"));
  const fixture = `- $\\sigma$ identifies the allowed states.\n\n  $$\n  ${domain}\n  $$\n`;
  assertStatusDisplay(fixture);
  assert.throws(() => assertStatusDisplay(`- $${domain}$ is record status.\n`), /existing display overflow owner/u);
  assert.throws(() => assertStatusDisplay(fixture.replace("revoked", "withdrawn")), /exact four-state domain/u);
  assert.throws(() => assertStatusDisplay(fixture.replace("$\\sigma$", "$s$")), /status symbol/u);
});

test("book editions retain their ref while source links bind an available exact commit", () => {
  const releasePdfRef = repositoryRefForSurface("public-pdf", "v0.2.0", "0.2.0");
  const currentPdfRef = repositoryRefForSurface("public-pdf", "main", "0.2.0");
  const pagesRef = repositoryRefForSurface("github-pages", "main", "0.2.0");

  assert.equal(releasePdfRef, "v0.2.0");
  assert.equal(currentPdfRef, "main");
  assert.equal(pagesRef, "main");
  assert.equal(
    repositoryDocumentHref(releasePdfRef, "concept/01-core-thesis.md", "efficiency model"),
    "https://github.com/lusoris/20-watts-was-enough/blob/v0.2.0/concept/01-core-thesis.md#efficiency%20model",
  );
  assert.equal(
    repositoryDocumentHref(pagesRef, "concept/01-core-thesis.md"),
    "https://github.com/lusoris/20-watts-was-enough/blob/main/concept/01-core-thesis.md",
  );
  assert.equal(
    repositoryTreeHref(releasePdfRef),
    "https://github.com/lusoris/20-watts-was-enough/tree/v0.2.0",
  );
  assert.throws(
    () => repositoryRefForSurface("public-pdf", "v0.3.0", "0.2.0"),
    /does not match edition version/u,
  );
  const revision = "b".repeat(40);
  assert.deepEqual(bookEditionIdentity({
    surface: "github-pages",
    sourceRef: "main",
    editionVersion: "0.2.0",
    sourceRevision: revision,
  }), {
    repositoryRef: "main",
    repositoryLinkRef: revision,
    sourceRevision: revision,
    edition: "Site v0.2.0 · continuous main snapshot",
    sourceLabel: "Git main snapshot",
    isReleaseSnapshot: false,
  });
  assert.deepEqual(bookEditionIdentity({
    surface: "public-pdf",
    sourceRef: "v0.2.0",
    editionVersion: "0.2.0",
    sourceRevision: revision,
  }), {
    repositoryRef: "v0.2.0",
    repositoryLinkRef: revision,
    sourceRevision: revision,
    edition: "Release v0.2.0 · immutable snapshot",
    sourceLabel: "Immutable release tag v0.2.0",
    isReleaseSnapshot: true,
  });
  assert.throws(
    () => bookEditionIdentity({
      surface: "public-pdf",
      sourceRef: "v0.2.0",
      editionVersion: "0.2.0",
    }),
    /requires the exact source commit/u,
  );
});

test("only the loopback renderer may select a query-defined release identity", () => {
  const releaseQuery = "?pdf=1&ref=v0.2.0&revision=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  for (const hostname of ["127.0.0.1", "[::1]", "localhost"]) {
    assert.equal(
      bookSurfaceFromLocation({ hostname, search: releaseQuery }),
      "public-pdf",
    );
  }
  for (const hostname of ["www.cordana.dev", "lusoris.github.io", "127.0.0.1.example"]) {
    assert.equal(
      bookSurfaceFromLocation({ hostname, search: releaseQuery }),
      "github-pages",
    );
  }
  assert.equal(
    bookSurfaceFromLocation({ hostname: "127.0.0.1", search: "?pdf=0" }),
    "github-pages",
  );
});

test("PDF generation accepts only bounded source identity options", () => {
  const revision = "c".repeat(40);
  assert.deepEqual(parseBookPdfGenerationOptions([]), {
    sourceRef: "main",
    sourceRevision: null,
  });
  assert.deepEqual(
    parseBookPdfGenerationOptions(["--ref", "v0.2.0", "--revision", revision]),
    { sourceRef: "v0.2.0", sourceRevision: revision },
  );
  assert.deepEqual(
    parseBookPdfGenerationOptions(["--revision", revision, "--ref", "v0.2.0"]),
    { sourceRef: "v0.2.0", sourceRevision: revision },
  );
  assert.throws(() => parseBookPdfGenerationOptions(["--ref"]), /Usage:/u);
  assert.throws(() => parseBookPdfGenerationOptions(["--other", "main"]), /Usage:/u);
  assert.throws(
    () => parseBookPdfGenerationOptions(["--ref", "v0.2.0"]),
    /requires --revision/u,
  );
  assert.throws(
    () => parseBookPdfGenerationOptions(["--revision", "ABC"]),
    /exact lowercase 40-character Git commit SHA/u,
  );
  assert.throws(
    () => parseBookPdfGenerationOptions(["--revision", revision, "--revision", revision]),
    /Usage:/u,
  );
  assert.throws(
    () => parseBookPdfGenerationOptions(["--ref", "release/latest"]),
    /main or vMAJOR\.MINOR\.PATCH/u,
  );
});

test("PDF renderer identity is exact and source-lock-bound", () => {
  const lockSHA256 = bookRendererLockSHA256(Buffer.from("locked renderer\n"));
  const identity = bookRendererIdentityFromEnvironment({
    BOOK_RENDERER_LOCK_SHA256: lockSHA256,
    BOOK_RENDERER_IMAGE_ID: `sha256:${"d".repeat(64)}`,
    BOOK_RENDERER_PLATFORM: "linux/amd64",
  });
  assert.deepEqual(identity, {
    lock: "tooling/pdf-renderer/lock.json",
    lock_sha256: lockSHA256,
    image_id: `sha256:${"d".repeat(64)}`,
    platform: "linux/amd64",
  });
  assert.equal(assertBookRendererLockIdentity(identity, Buffer.from("locked renderer\n")), identity);
  assert.throws(
    () => assertBookRendererLockIdentity(identity, Buffer.from("changed renderer\n")),
    /does not match the checked-in lock bytes/u,
  );
  assert.throws(() => bookRendererIdentityFromEnvironment({}), /lock SHA-256 is missing/u);
  assert.throws(
    () => bookRendererIdentityFromEnvironment({
      BOOK_RENDERER_LOCK_SHA256: lockSHA256,
      BOOK_RENDERER_IMAGE_ID: "renderer:latest",
      BOOK_RENDERER_PLATFORM: "linux/amd64",
    }),
    /image ID is missing or invalid/u,
  );
});

test("the book manifest must carry the package version and explicit source ref", () => {
  const rendererLockSHA256 = "a".repeat(64);
  const manifest = {
    schema_version: 3,
    version: "0.2.0",
    source_ref: "main",
    source_revision: null,
    pdf: "public/downloads/20-watts-was-enough-full-concept-book.pdf",
    renderer: {
      lock: "tooling/pdf-renderer/lock.json",
      lock_sha256: rendererLockSHA256,
      image_id: `sha256:${"b".repeat(64)}`,
      platform: "linux/amd64",
    },
  };
  const contract = {
    expectedVersion: "0.2.0",
    expectedPdf: manifest.pdf,
    expectedSourceRef: "main",
    expectedSourceRevision: null,
    expectedRendererLockSHA256: rendererLockSHA256,
  };

  assert.equal(assertBookManifestContract({ manifest, ...contract }), manifest);
  assert.throws(
    () => assertBookManifestContract({
      manifest: { ...manifest, version: "0.1.0" },
      ...contract,
    }),
    /does not match package version "0\.2\.0"/u,
  );
  assert.throws(
    () => assertBookManifestContract({
      manifest,
      ...contract,
      expectedSourceRef: "v0.2.0",
    }),
    /does not match expected ref "v0\.2\.0"/u,
  );
  assert.throws(
    () => assertBookManifestContract({
      manifest,
      ...contract,
      expectedRendererLockSHA256: "c".repeat(64),
    }),
    /renderer lock SHA-256 does not match/u,
  );
  assert.throws(
    () => assertBookManifestContract({
      manifest: { ...manifest, source_ref: "v0.2.0", source_revision: null },
      ...contract,
      expectedSourceRef: "v0.2.0",
      expectedSourceRevision: undefined,
    }),
    /release manifest requires the exact source commit/u,
  );
  assert.throws(
    () => assertBookManifestContract({
      manifest: { ...manifest, source_revision: "A".repeat(40) },
      ...contract,
    }),
    /exact lowercase 40-character Git commit SHA/u,
  );
});

test("the book namespaces fragments beneath one title and exposes a web-only skip path", async () => {
  const [edition, readiness, stylesheet] = await Promise.all([
    source("app/components/book-edition.tsx"),
    source("app/components/readiness-overview.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(edition, /bookDocumentHeadingId,/);
  assert.match(edition, /bookDocumentId,/);
  assert.match(edition, /heading\.dataset\.bookLegacyHeadingId \?\? heading\.id/);
  assert.match(edition, /heading\.id = bookDocumentHeadingId\(researchDocument\.path, legacyId\)/);
  assert.match(edition, /return hash \? `#\$\{bookDocumentHeadingId\(path, hash\)\}` : `#\$\{bookDocumentId\(path\)\}`/);
  assert.match(edition, /id=\{bookDocumentId\(document\.path\)\}/);
  assert.match(edition, /headingOffset=\{1\}/);
  assert.match(edition, /function BookSkipLink\(\{ path \}: \{ path: string \}\)/);
  assert.match(
    edition,
    /\{isGitHubPages && bookDocuments\[0\] \? <BookSkipLink path=\{bookDocuments\[0\]\.path\} \/> : null\}/,
  );
  assert.match(edition, /window\.addEventListener\("hashchange", restoreFragment\)/);
  assert.match(edition, /window\.removeEventListener\("hashchange", restoreFragment\)/);
  assert.match(
    edition,
    /if \(bookDocumentPaths\.has\(path\)\) \{[\s\S]*window\.location\.assign\([\s\S]*bookDocumentHeadingId\(path, hash\)/,
  );
  assert.match(readiness, /const PrimaryHeading = mode === "book" \? "h2" : "h1"/);
  assert.match(readiness, /const SectionHeading = mode === "book" \? "h3" : "h2"/);
  assert.match(readiness, /const CardHeading = mode === "book" \? "h4" : "h3"/);
  assert.match(
    stylesheet,
    /\.book-shell-web \.book-document,[\s\S]*\.book-prose h6 \{\s*scroll-margin-top:\s*96px;/,
  );
  assert.match(stylesheet, /\.book-prose > h2:first-child\s*\{[^}]*font-size:\s*clamp\(36px, 4\.2vw, 52px\)/s);
  assert.match(stylesheet, /@media print[\s\S]*\.book-prose > h2:first-child\s*\{[^}]*font-size:\s*30pt/s);
});

test("printed chapter headings preserve natural word separation and wrapping", async () => {
  const stylesheet = postcss.parse(await source("app/globals.css"));
  const printOwners = [];
  stylesheet.walkRules(".book-prose > h2:first-child", (rule) => {
    if (rule.parent.type === "atrule"
        && rule.parent.name === "media"
        && rule.parent.params === "print") printOwners.push(rule);
  });
  assert.equal(printOwners.length, 1, "one print owner controls chapter-title tracking");
  const tracking = printOwners[0].nodes.filter(
    (node) => node.type === "decl" && node.prop === "letter-spacing",
  );
  assert.equal(tracking.length, 1, "print must override compressed screen tracking explicitly");
  assert.equal(tracking[0].value, "normal");
  const wrapping = printOwners[0].nodes.filter(
    (node) => node.type === "decl" && node.prop === "text-wrap",
  );
  assert.equal(wrapping.length, 0, "natural wrapping preserves literal hyphens in PDF extraction");
  const appendix = await source("research/field-coverage.md");
  assert.equal(appendix.split(/\r?\n/u)[0], "# Global field coverage");
});

test("printed readiness stages preserve paint order without changing screen positioning", async () => {
  const stylesheet = postcss.parse(await source("app/globals.css"));
  const bookOwners = [];
  const screenOwners = [];
  stylesheet.walkRules((rule) => {
    if (rule.selectors.includes(".readiness-overview-book .readiness-stage")) bookOwners.push(rule);
    if (rule.selectors.includes(".readiness-stage") && rule.parent.type === "root") screenOwners.push(rule);
  });
  assert.equal(bookOwners.length, 1, "one book-stage owner avoids a competing screen override");
  const owner = bookOwners[0];
  assert.equal(owner.parent.type, "atrule");
  assert.equal(owner.parent.name, "media");
  assert.equal(owner.parent.params, "print", "the paint-order correction is print-only");
  const positions = owner.nodes.filter((node) => node.type === "decl" && node.prop === "position");
  assert.equal(positions.length, 1, "print positioning has one explicit declaration");
  assert.equal(positions[0].value, "static");
  assert.ok(!positions[0].important, "the owning rule needs no cascade escalation");
  assert.equal(screenOwners.length, 1);
  assert.deepEqual(
    screenOwners[0].nodes.filter((node) => node.type === "decl" && node.prop === "position")
      .map((node) => node.value),
    ["relative"],
    "screen stage arrows retain their existing positioning context",
  );
});

test("printed document canvas keeps white on html without a body background", async () => {
  const stylesheet = postcss.parse(await source("app/globals.css"));
  const declarationsFor = (selector, scope, property) => {
    const declarations = [];
    stylesheet.walkRules((rule) => {
      const print = rule.parent.type === "atrule"
        && rule.parent.name === "media" && rule.parent.params === "print";
      if (scope === "print" ? !print : rule.parent.type !== "root") return;
      if (!rule.selectors.includes(selector)) return;
      for (const node of rule.nodes) {
        if (node.type !== "decl") continue;
        if (node.prop !== property && !(property === "background" && node.prop.startsWith("background-"))) continue;
        declarations.push({ property: node.prop, value: node.value, important: Boolean(node.important) });
      }
    });
    return declarations;
  };
  const declaration = (property, value) => [{ property, value, important: false }];

  assert.deepEqual(declarationsFor("html", "print", "background"), declaration("background", "#fff"));
  assert.deepEqual(
    declarationsFor("body", "print", "background"),
    declaration("background", "transparent"),
    "the print body must not add a white fragment background over the html canvas",
  );
  for (const selector of [".book-shell", ".book-cover", ".book-toc", ".book-document"]) {
    assert.deepEqual(
      declarationsFor(selector, "print", "background"),
      declaration("background", "#fff"),
      `${selector} retains its white print background`,
    );
  }
  for (const selector of ["html", "body"]) {
    for (const property of ["height", "min-height"]) {
      assert.deepEqual(declarationsFor(selector, "print", property), declaration(property, "auto"));
    }
  }
  for (const [selector, background] of [["html", "var(--shell)"], ["body", "var(--paper)"]]) {
    assert.deepEqual(
      declarationsFor(selector, "root", "background"),
      declaration("background", background),
      `${selector} retains its screen background`,
    );
  }
  for (const [property, value] of [["background", "#10251d"], ["color", "#f6f1df"]]) {
    assert.deepEqual(declarationsFor(".book-legal", "root", property), declaration(property, value));
    assert.deepEqual(declarationsFor(".book-legal", "print", property), []);
  }
});

test("the web book defers media work while PDF rendering stays eager", async () => {
  const [edition, stylesheet] = await Promise.all([
    source("app/components/book-edition.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(edition, /imageLoading=\{isPublicPdf \? "eager" : "lazy"\}/);
  assert.match(edition, /isGitHubPages \? "book-shell-web" : "book-shell-print"/);
  assert.match(stylesheet, /\.book-shell-web \.book-document\s*\{[^}]*content-visibility:\s*auto;/s);
  assert.match(stylesheet, /contain-intrinsic-size:\s*auto 900px/);
  assert.match(stylesheet, /\.book-cover-support\s*\{[^}]*display:\s*flex;/s);
  assert.match(
    stylesheet,
    /@media print[\s\S]*\.book-cover-support\s*\{[^}]*break-inside:\s*avoid;/s,
  );
});

test("the biomimetic transfer figure uses a print-safe flow and caption", async () => {
  const [chapter, stylesheet] = await Promise.all([
    source("concept/07-cross-domain-convergence.md"),
    source("app/globals.css"),
  ]);
  const sectionStart = chapter.indexOf(
    "### Biomimetic transfer is a search method, not an evidence grade",
  );
  const sectionEnd = chapter.indexOf("### Five solution families", sectionStart);
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
  const section = chapter.slice(sectionStart, sectionEnd);

  assert.match(section, /```mermaid\s+flowchart TB/u);
  assert.doesNotMatch(section, /```mermaid\s+flowchart LR/u);

  const printStart = stylesheet.lastIndexOf("@media print");
  assert.ok(printStart >= 0);
  const print = stylesheet.slice(printStart);
  assert.match(
    print,
    /\.book-prose \.diagram-layout-note\s*\{[^}]*display:\s*none;/s,
  );
  assert.match(
    print,
    /\.book-prose \.diagram\.semantic-figure > figcaption\s*\{[^}]*position:\s*static;[^}]*left:\s*auto;[^}]*width:\s*auto;/s,
  );
});

test("portal utility text and card accents retain readable contrast", async () => {
  const [globalStylesheet, portal] = await Promise.all([
    source("app/globals.css"),
    source("app/portal.css"),
  ]);
  const stylesheet = `${globalStylesheet}\n${portal}`;

  assert.doesNotMatch(portal, /font-size:\s*(?:8|9|10)px/);
  assert.match(stylesheet, /\.portal-dashboard-funnel\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(portal, /\.portal-shell\s*\{[^}]*overflow-x:\s*clip/s);
  assert.match(stylesheet, /\.prose table\s*\{[^}]*font-size:\s*14px/s);
  assert.match(stylesheet, /\.diagram-scroll-region\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(stylesheet, /\.portal-mobile-menu nav a\s*\{[^}]*min-height:\s*44px/s);
  assert.match(
    portal,
    /\.portal-mobile-menu nav\s*\{[^}]*max-height:\s*calc\(100dvh - 72px\);[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/s,
  );
  assert.match(stylesheet, /\.prose th\s*\{[^}]*font-size:\s*14px;[^}]*line-height:\s*1\.35/s);
  assert.doesNotMatch(stylesheet, /\.portal-header nav a:(?:first-child|nth-child\()/);
  assert.match(
    portal,
    /#portal-overview:focus-visible,\s*#research-system:focus-visible,\s*#library:focus-visible,\s*\.portal-prose[^{]+\{[^}]*outline:\s*3px solid var\(--portal-blue\)/s,
  );

  const publicationPass = portal;
  const mobilePublicationStart = publicationPass.indexOf(
    "@media screen and (max-width: 700px)",
  );
  assert.ok(mobilePublicationStart >= 0);
  const mobilePublicationPass = publicationPass.slice(mobilePublicationStart);
  assert.match(
    mobilePublicationPass,
    /\.portal-funnel-step a\s*\{[^}]*min-height:\s*44px/s,
  );
  assert.doesNotMatch(
    mobilePublicationPass,
    /\.portal-funnel-step a\s*\{[^}]*min-height:\s*(?:[0-9]|[1-3][0-9]|4[0-3])px/s,
  );
  assert.match(
    mobilePublicationPass,
    /\.portal-dashboard \.portal-action-tertiary\s*\{[^}]*min-height:\s*44px/s,
  );
  assert.doesNotMatch(
    mobilePublicationPass,
    /\.portal-dashboard \.portal-action-tertiary\s*\{[^}]*min-height:\s*(?:[0-9]|[1-3][0-9]|4[0-3])px/s,
  );
  assert.match(publicationPass, /\.portal-funnel-step strong\s*\{[^}]*color:\s*#285d41/s);
  assert.match(publicationPass, /\.portal-start-card > span\s*\{[^}]*color:\s*#596c61/s);
  assert.match(publicationPass, /\.portal-start-card:hover\s*\{[^}]*background:\s*transparent;[^}]*color:\s*#0f5534/s);
  assert.match(publicationPass, /\.portal-dashboard\s*\{[^}]*grid-template-columns:\s*minmax\(0, 650px\) minmax\(380px, 520px\)[^}]*background:\s*var\(--portal-cream\)/s);
  assert.match(publicationPass, /\.portal-status-outcome\s*\{[^}]*border-left:\s*3px solid #b37b1c[^}]*background:\s*transparent/s);
  assert.match(publicationPass, /\.portal-funnel\s*\{[^}]*grid-template-columns:\s*1fr[^}]*border:\s*0/s);
  assert.match(publicationPass, /\.portal-reader-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 900px\) 195px[^}]*border:\s*0/s);
  assert.match(publicationPass, /\.portal-prose\s*\{[^}]*font-size:\s*18px[^}]*line-height:\s*1\.66/s);
  assert.match(publicationPass, /@media screen and \(max-width: 460px\)[\s\S]*\.portal-wordmark strong\s*\{[^}]*display:\s*block/s);
});

test("the focused reader has one outline rail and a bounded corpus drawer", async () => {
  const [portalComponent, stylesheet, globalStylesheet] = await Promise.all([
    source("app/components/public-research-portal.tsx"),
    source("app/portal.css"),
    source("app/globals.css"),
  ]);
  const ownerMarker = "/* Public research publication: one selector and breakpoint authority. */";
  const ownerStart = stylesheet.indexOf(ownerMarker);
  assert.ok(ownerStart >= 0);
  assert.equal(stylesheet.split(ownerMarker).length - 1, 1);
  assert.doesNotMatch(stylesheet, /Screen reading pass/u);

  for (const selector of [
    "portal-reader-page",
    "portal-reader-toolbar",
    "portal-reader-workspace",
    "portal-reader-grid",
    "portal-reader-context",
    "portal-reader-browse",
    "portal-corpus-drawer",
    "portal-corpus-header",
    "portal-corpus-current",
    "portal-library",
    "portal-document-list",
    "portal-reader",
    "portal-reader-header",
    "portal-reader-meta",
    "portal-prose",
    "portal-document-state",
    "portal-outline",
    "portal-mobile-outline",
  ]) {
    assert.doesNotMatch(
      globalStylesheet,
      new RegExp(`^\\s*\\.${selector}\\s*\\{`, "mu"),
      `${selector} must be owned by app/portal.css`,
    );
  }

  assert.doesNotMatch(
    stylesheet,
    /^\.(?:research-shell|topbar|sidebar|reader-main|document-wrap|document-pager|outline)\s*\{/mu,
  );
  assert.doesNotMatch(portalComponent, /portal-reader-stack-top|readerToolbarRef|ResizeObserver/u);

  const reader = stylesheet;
  assert.match(reader, /\.portal-reader\s*\{[^}]*--reading-measure:\s*68ch/s);
  assert.match(reader, /\.portal-prose\s*\{[^}]*font-size:\s*18px;[^}]*line-height:\s*1\.66/s);
  assert.match(reader, /\.portal-prose > :is\([^)]*\)\s*\{[^}]*max-width:\s*var\(--reading-measure\)/s);
  assert.match(reader, /\.portal-library \.portal-filter-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(reader, /\.portal-library \.portal-filter-tabs button:last-child\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(reader, /\.portal-reader-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 900px\) 195px/s);
  assert.match(reader, /\.portal-corpus-drawer\s*\{[^}]*position:\s*fixed;[^}]*width:\s*min\(440px, 100%\);[^}]*height:\s*100dvh/s);
  assert.match(reader, /\.portal-corpus-drawer\[open\]\s*\{[^}]*display:\s*grid/s);
  assert.match(reader, /\.portal-corpus-drawer::backdrop\s*\{[^}]*background:/s);
  assert.match(reader, /\.portal-library\s*\{[^}]*overflow:\s*hidden auto/s);
  assert.match(reader, /\.portal-library \.portal-document-list\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*visible/s);
  assert.match(reader, /@media screen and \(max-width: 1180px\)[\s\S]*\.portal-reader-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 900px\)/s);
  assert.match(reader, /@media screen and \(max-width: 1180px\)[\s\S]*\.portal-outline\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(reader, /\.portal-reader-page \.portal-library\s*\{[^}]*display:\s*none/s);
  assert.match(reader, /\.portal-mobile-outline summary\s*\{[^}]*min-height:\s*44px/s);
  assert.match(reader, /\.portal-document-state\s*\{[^}]*font-size:\s*14px/s);
  assert.match(reader, /\.portal-document-state\[role="alert"\]\s*\{[^}]*border-left-color:\s*#a92d31/s);

  assert.match(portalComponent, /aria-controls="portal-corpus-drawer"[\s\S]*aria-haspopup="dialog"/s);
  assert.match(portalComponent, /<dialog[\s\S]*aria-labelledby="portal-corpus-title"/s);
  assert.match(portalComponent, /dialog\.showModal\(\)/);
  assert.match(portalComponent, /invokerRef\.current\?\.focus\(\)/);
  assert.match(portalComponent, /<span>Currently reading<\/span>/);
  assert.doesNotMatch(portalComponent, /<aside className="portal-library"/);
});
