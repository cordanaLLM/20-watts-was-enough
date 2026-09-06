import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import filesystem from "node:fs/promises";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { bookSourceDigest, bookSourceFiles } from "./book-source.mjs";
import { publication } from "../app/lib/publication.mjs";
import {
  isPublicRepositoryArtifact,
  repositoryArtifactHref,
} from "../app/lib/repository-artifacts.ts";
import { resolveViteCacheDirectory } from "./lib/vite-cache-directory.mjs";
import {
  assertBookPdfIntegrity,
  inspectBookPdf,
} from "./lib/book-pdf-integrity.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const page = await readFile(new URL("../github-pages/book.tsx", import.meta.url), "utf8");
const edition = await readFile(
  new URL("../app/components/book-edition.tsx", import.meta.url),
  "utf8",
);
const editionIdentity = await readFile(
  new URL("../app/lib/book-release-identity.mjs", import.meta.url),
  "utf8",
);
const content = await readFile(new URL("../app/portal-content.ts", import.meta.url), "utf8");
const markdownDocument = await readFile(
  new URL("../app/components/markdown-document.tsx", import.meta.url),
  "utf8",
);
const readiness = await readFile(
  new URL("../app/components/readiness-overview.tsx", import.meta.url),
  "utf8",
);
const mermaidDiagram = await readFile(
  new URL("../app/components/mermaid-diagram.tsx", import.meta.url),
  "utf8",
);
const globalStyles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const viteConfig = await readFile(new URL("../vite.pages.config.ts", import.meta.url), "utf8");
const generator = await readFile(
  new URL("./generate-book-pdf.mjs", import.meta.url),
  "utf8",
);

test("the Pages book route selects web and PDF identities without a server runtime", () => {
  assert.match(page, /import \{ BookEdition \}/);
  assert.match(page, /const parameters = new URLSearchParams\(window\.location\.search\)/);
  assert.match(page, /const surface = bookSurfaceFromLocation\(window\.location\)/);
  assert.match(
    editionIdentity,
    /pdfRendererHostnames = new Set\(\["127\.0\.0\.1", "\[::1\]", "localhost"\]\)/,
  );
  assert.match(page, /parameters\.get\("ref"\) \?\? "main"/);
  assert.match(page, /<BookEdition/);
  assert.match(page, /surface=\{surface\}/);
  assert.match(page, /sourceRef=\{sourceRef\}/);
  assert.match(edition, /import \{ bookDocuments as documents \}/);
  assert.match(edition, /import type \{ ResearchDocument \}/);
  assert.match(edition, /export function BookEdition\(/);
});

test("the book renderer is one explicit entry in the static Pages build", () => {
  assert.match(viteConfig, /const portalIndexModuleId = "virtual:portal-document-index"/);
  assert.match(viteConfig, /book:\s*path\.join\(repositoryRoot, "github-pages", "book", "index\.html"\)/);
  assert.doesNotMatch(viteConfig, /vinext|cloudflare|sites\(\)/);
});

test("the renderer Vite cache accepts only its canonical temporary directory", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "20w-vite-cache-test-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const expected = path.join(temporaryRoot, "vite-cache");
  assert.equal(resolveViteCacheDirectory({
    override: expected,
    repositoryRoot,
    systemTemporaryDirectory: temporaryRoot,
  }), expected);
  assert.throws(() => resolveViteCacheDirectory({
    override: path.join(temporaryRoot, "..", "escaped"),
    repositoryRoot,
    systemTemporaryDirectory: temporaryRoot,
  }), /must be exactly/u);
  await mkdir(path.join(temporaryRoot, "target"));
  await symlink(path.join(temporaryRoot, "target"), expected);
  assert.throws(() => resolveViteCacheDirectory({
    override: expected,
    repositoryRoot,
    systemTemporaryDirectory: temporaryRoot,
  }), /non-symlink directory/u);
});

test("the generated PDF uses public links and zero-state readiness copy", () => {
  assert.match(edition, /"github-pages" \| "public-pdf"/);
  assert.match(edition, /const identity = currentBookIdentity\(surface, sourceRef, editionVersion, sourceRevision\)/);
  assert.match(editionIdentity, /export function bookEditionIdentity\(input\)/);
  assert.match(edition, /const surfaceDocumentHref = repositoryDocumentHrefFor\(identity\.repositoryLinkRef\)/);
  assert.equal(publication.canonicalSite, "https://www.cordana.dev/");
  assert.match(edition, /const canonicalPublicSite = publication\.canonicalSite/);
  assert.match(edition, /publication\.bookPath,[\s\S]*publication\.canonicalSite/u);
  assert.match(edition, /isPublicPdf \? canonicalPublicSite : assetBasePath/);
  assert.match(edition, /publication\.bookPdfPath/u);
  assert.match(edition, />View source on GitHub<\/a>/);
  assert.match(edition, /helpHref: joinBasePath\(supportBasePath, "help\/"\)/);
  assert.match(
    edition,
    /`\[Site\/Docs\] book\/ @ \$\{identity\.sourceRevision\?\.slice\(0, 12\) \?\? identity\.repositoryRef\}`/,
  );
  assert.match(edition, /className="book-cover-support" aria-label="Edition support"/);
  assert.match(edition, /<a href=\{support\.helpHref\}>How to help<\/a>/);
  assert.match(edition, /<a href=\{support\.issueHref\}>Report this edition<\/a>/);
  assert.doesNotMatch(edition, /issues\/new\/choose/);
  assert.match(readiness, /ledgerOnly\.proposedArtifactFamilies === 0/);
  assert.match(readiness, /No ledger-only record currently requires a new experiment family/);
  assert.match(readiness, /The public Git repository contains the complete artifact table/);
  assert.match(generator, /parseBookPdfGenerationOptions\(process\.argv\.slice\(2\)\)/);
  assert.match(generator, /ref=\$\{encodeURIComponent\(sourceRef\)\}/);
  assert.match(generator, /revision=\$\{encodeURIComponent\(sourceRevision\)\}/);
  assert.match(generator, /source_ref: sourceRef/);
  assert.match(generator, /source_revision: sourceRevision/);
  assert.match(generator, /schema_version: 3/);
  assert.match(generator, /renderer: rendererIdentity/);
  assert.match(generator, /"--configLoader",\s*"runner"/s);
  assert.match(viteConfig, /cacheDir: pagesCacheDirectory/);
  assert.match(mermaidDiagram, /diagramRenderId\(reactId, \+\+renderAttemptRef\.current\)/);
  assert.match(mermaidDiagram, /-\$\{attempt\}`/);
  assert.match(generator, /\.diagram-canvas > svg/);
  assert.match(generator, /rendered_diagrams: observedRenderedDiagrams/);
  assert.match(generator, /invalidDiagrams: invalid/);
  assert.match(generator, /replaceFilePair/);
  assert.match(edition, /renderExternalImages=\{!isPublicPdf\}/);
  assert.match(markdownDocument, /!renderExternalImages && isExternalImageSource\(source\)/);
  assert.match(markdownDocument, /className="external-image-reference"/);
});

test("the public reader loads canonical Markdown and exposes linked source artifacts", () => {
  assert.match(content, /loadPortalDocument/);
  assert.match(content, /Document request returned HTML instead of Markdown/);
  assert.match(markdownDocument, /repositoryArtifactHref\(internal\.path\)/);
  assert.match(markdownDocument, /isPublicRepositoryArtifact\(internal\.path\)/);
  assert.match(markdownDocument, /data-repository-artifact/);
});

test("only explicitly public repository artifacts receive static reader copies", () => {
  assert.equal(isPublicRepositoryArtifact("assets/plots/core-models.json"), true);
  assert.equal(isPublicRepositoryArtifact(".github/milestones.json"), false);
  assert.equal(
    repositoryArtifactHref("assets/plots/core-models.json"),
    "/repository-files/assets/plots/core-models.json.txt",
  );
  assert.match(edition, /!isPublicRepositoryArtifact\(path\)/);
});

test("the book constrains readiness grids and keeps wide diagrams readable on narrow screens", () => {
  assert.match(
    globalStyles,
    /\.readiness-overview\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(globalStyles, /\.readiness-overview\s*>\s*\*\s*\{[^}]*min-width:\s*0/s);
  assert.match(
    globalStyles,
    /\.readiness-table-wrap\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s,
  );
  assert.match(
    globalStyles,
    /@media\s*\(max-width:\s*760px\)[\s\S]*\.diagram-wide\s+\.diagram-canvas\s*\{[^}]*min-width:\s*min\(var\(--diagram-width\),\s*760px\)/,
  );
  assert.match(
    globalStyles,
    /\.diagram-wide\s+\.diagram-canvas\s+svg\s*\{[^}]*width:\s*min\(var\(--diagram-width\),\s*760px\)[^}]*max-width:\s*none/s,
  );
  assert.match(mermaidDiagram, /Wide diagram · scroll horizontally on narrow screens/);
});

test("the full-book source identity includes the locked renderer dependency graph", async () => {
  const sources = (await bookSourceFiles(repositoryRoot)).map((file) => (
    path.relative(repositoryRoot, file).replaceAll("\\", "/")
  ));
  const requiredClosure = [
    "tooling/internal/experimentcli/clrs_compare.go",
    "tooling/internal/clrsfixture/compare.go",
    "tooling/internal/clrsfixture/compare_files.go",
    "tooling/internal/experimentcli/clrs_sbom.go",
    "tooling/internal/clrsfixture/sbom.go",
    "tooling/internal/clrsfixture/sbom_execution.go",
    "tooling/internal/clrsfixture/sbom_files.go",
    "tooling/internal/clrsfixture/sbom_inventory.go",
    "tooling/internal/clrsfixture/sbom_receipt.go",
    "tooling/internal/experimentcli/clrs_invocation.go",
    "tooling/internal/clrsfixture/invocation.go",
    "tooling/internal/clrsfixture/invocation_payload.go",
    "tooling/internal/experimentcli/clrs_generation.go",
    "tooling/internal/clrsfixture/generation_run.go",
    "tooling/internal/clrsfixture/generation_run_command.go",
    "tooling/internal/clrsfixture/generation_run_container.go",
    "tooling/internal/clrsfixture/generation_run_files.go",
    "tooling/internal/clrsfixture/generation_run_image.go",
    "tooling/internal/clrsfixture/generation_run_inputs.go",
    "tooling/internal/clrsfixture/generation_run_inspection.go",
    "tooling/internal/clrsfixture/generation_run_output.go",
    "tooling/internal/clrsfixture/generation_run_payload.go",
    "tooling/internal/clrsfixture/generation_run_publish.go",
    "tooling/internal/clrsfixture/generation_run_receipt.go",
    "tooling/internal/experimentcli/clrs_context.go",
    "tooling/internal/clrscontext/context.go",
    "tooling/internal/clrscontext/dockerfile.go",
    "tooling/internal/clrscontext/files.go",
    "tooling/internal/clrscontext/publish.go",
    "tooling/internal/clrscontext/source.go",
    "tooling/internal/clrscontext/tar.go",
    "CITATION.cff",
    "app/components/language-access.tsx",
    "app/components/overflow-region.tsx",
    "app/lib/book-release-identity.mjs",
    "app/lib/eu-languages.mjs",
    "app/lib/language-access.mjs",
    "app/lib/publication.mjs",
    "experiments/candidates/001-adaptive-topology.md",
    "experiments/fixtures/001-shared-clock-free-coadaptation.md",
    "github-pages/public-artifacts.json",
    "app/project-metadata.ts",
    "package-lock.json",
    "public/og-v2.jpg",
    "research/audits/2026-08-06-biomimetics-transfer-methodology.md",
    "research/claims.md",
    "research/principle-registry.md",
    "scripts/lib/book-pdf-generation-options.mjs",
    "scripts/lib/book-pdf-integrity.mjs",
    "scripts/lib/book-renderer-identity.mjs",
    "scripts/lib/pages-base.mjs",
    "scripts/lib/pages-seo.mjs",
    "scripts/lib/pdf-metadata.mjs",
    "scripts/lib/plain-text.mjs",
    "scripts/lib/portal-documents.mjs",
    "scripts/lib/portal-metrics.mjs",
    "scripts/lib/source-boundary.mjs",
    "scripts/lib/strict-json.mjs",
    "scripts/lib/translation-manifest.mjs",
    "scripts/lib/translation-pages.mjs",
    "scripts/lib/vite-cache-directory.mjs",
    "scripts/install-locked-npm.mjs",
    "scripts/npm-runtime-lock.json",
    "tooling/cmd/20w/main.go",
    "tooling/cmd/20w/pdf_reproducibility.go",
    "tooling/cmd/ci-plan/main.go",
    "tooling/cmd/pdf-proof/main.go",
    "tooling/internal/ciplancli/cli.go",
    "tooling/internal/experimentcli/catalog.go",
    "tooling/internal/experimentcli/cli.go",
    "tooling/internal/experimentcli/clrs_promise.go",
    "tooling/internal/experimentcli/clrs_wheelhouse.go",
    "tooling/internal/experimentcli/node_image.go",
    "tooling/internal/pdfrendercli/cli.go",
    "tooling/cmd/20w/translation.go",
    "tooling/go.mod",
    "tooling/internal/buildinfo/buildinfo.go",
    "tooling/internal/docscheck/check.go",
    "tooling/internal/docscheck/mermaid-duplicate-baseline.json",
    "tooling/internal/docscheck/mermaid.go",
    "tooling/internal/experiment/catalog.go",
    "tooling/internal/githubapi/client.go",
    "tooling/internal/githublabels/labels.go",
    "tooling/internal/nodeimage/package.go",
    "tooling/internal/ocimanifest/manifest.go",
    "tooling/internal/pdfrender/dockerfile.go",
    "tooling/internal/pdfrender/generation_mismatch.go",
    "tooling/internal/pdfrender/image_proof.go",
    "tooling/internal/pdfrender/image_proof_command.go",
    "tooling/internal/pdfrender/image_proof_process_linux.go",
    "tooling/internal/pdfrender/image_proof_process_unsupported.go",
    "tooling/internal/pdfrender/image_proof_tar.go",
    "tooling/internal/pdfrender/installed_dependencies.go",
    "tooling/internal/pdfrender/installed_inventory.go",
    "tooling/internal/pdfrender/publication.go",
    "tooling/internal/pdfrender/render.go",
    "tooling/internal/pdfrender/reproducibility.go",
    "tooling/internal/pdfrender/reproducibility_receipt.go",
    "tooling/internal/releasecheck/inventory.go",
    "tooling/internal/releasecheck/release_state.go",
    "tooling/internal/releasecheck/remote_assets.go",
    "tooling/internal/releasecheck/tag.go",
    "tooling/internal/releaseimage/inspect.go",
    "tooling/internal/strictjson/validate.go",
    "tooling/internal/translationbundle/bundle.go",
    "tooling/internal/translationbundle/files.go",
    "tooling/internal/translationbundle/languages.go",
    "tooling/internal/translationbundle/shape.go",
    "tooling/pdf-renderer/lock.json",
    "translations/eu-languages.json",
    "translations/manifest.json",
  ];
  for (const source of requiredClosure) assert.equal(sources.includes(source), true, source);
});

test("the PDF source closure includes its cache and renderer-lock owners", async () => {
  const sources = await bookSourceFiles(repositoryRoot);
  for (const source of [
    "tooling/internal/pdfrender/build_cache.go",
    "tooling/internal/pdfrender/build_cache_inventory.go",
    "tooling/internal/pdfrenderlock/lock.go",
  ]) assert.equal(sources.includes(path.join(repositoryRoot, source)), true, source);
});

test("the PDF source digest changes with portal evidence authority", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "20w-book-source-closure-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const sources = await bookSourceFiles(repositoryRoot);
  for (const source of sources) {
    const relative = path.relative(repositoryRoot, source);
    const destination = path.join(temporaryRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  const before = await bookSourceDigest(temporaryRoot);
  const claimsPath = path.join(temporaryRoot, "research", "claims.md");
  await writeFile(claimsPath, `${await readFile(claimsPath, "utf8")}\n`);
  const after = await bookSourceDigest(temporaryRoot);

  assert.notEqual(after.digest, before.digest);
  assert.deepEqual(after.files, before.files);
});

const supportInventory = "scripts/book-support-sources.json";
const supportPrefix = "tooling/internal/clrsfixture/";

async function bookSourceFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-support-inventory-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = await bookSourceFiles(repositoryRoot);
  for (const source of files) {
    const relative = path.relative(repositoryRoot, source);
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, `source: ${relative}\n`);
  }
  await copyFile(path.join(repositoryRoot, supportInventory), path.join(root, supportInventory));
  return root;
}

async function writeSupportPaths(root, paths) {
  await writeFile(path.join(root, supportInventory), JSON.stringify({ schema_version: 1, paths }));
}

function mutateOnSourceHash(t, mutate) {
  const prototype = Object.getPrototypeOf(createHash("sha256"));
  const update = prototype.update;
  t.mock.method(prototype, "update", function (value, ...arguments_) {
    if (typeof value === "string") mutate(value);
    return update.call(this, value, ...arguments_);
  });
}

test("support inventory binds its original bytes, selected source bytes and new entries", async (t) => {
  const root = await bookSourceFixture(t);
  const inventoryFile = path.join(root, supportInventory);
  const original = await readFile(inventoryFile);
  const inventory = JSON.parse(original);
  const before = await bookSourceDigest(root);
  assert(before.files.includes(supportInventory));
  assert.equal(new Set(before.files).size, before.files.length);
  for (const source of inventory.paths) assert(before.files.includes(source), source);

  await writeFile(inventoryFile, Buffer.concat([original, Buffer.from("\n")]));
  const formatting = await bookSourceDigest(root);
  assert.notEqual(formatting.digest, before.digest);
  assert.deepEqual(formatting.files, before.files);
  await writeFile(inventoryFile, original);
  await writeFile(path.join(root, inventory.paths[0]), "changed source\n");
  const sourceChange = await bookSourceDigest(root);
  assert.notEqual(sourceChange.digest, before.digest);
  assert.deepEqual(sourceChange.files, before.files);

  const added = `${supportPrefix}new_production_source.go`;
  await writeFile(path.join(root, added), "new source\n");
  await writeSupportPaths(root, [...inventory.paths, added].sort());
  const addition = await bookSourceDigest(root);
  assert.notEqual(addition.digest, sourceChange.digest);
  assert.deepEqual(addition.files.filter((file) => file !== added), sourceChange.files);
  assert.equal(addition.files.filter((file) => file === added).length, 1);
});

test("support inventory binds the CLRS shakedown owner without admitting sibling packages or tests", async (t) => {
  const root = await bookSourceFixture(t);
  const prefix = "tooling/internal/clrsshakedown/";
  const inventory = JSON.parse(await readFile(path.join(root, supportInventory), "utf8"));
  const selected = inventory.paths.filter((source) => source.startsWith(prefix));
  assert(selected.includes(`${prefix}run.go`));
  const before = await bookSourceDigest(root);
  for (const source of selected) {
    assert.equal(before.files.filter((file) => file === source).length, 1, source);
  }

  const target = path.join(root, `${prefix}run.go`);
  await writeFile(target, "changed shakedown source\n");
  const changed = await bookSourceDigest(root);
  assert.notEqual(changed.digest, before.digest);
  assert.deepEqual(changed.files, before.files);
  await rm(target);
  await assert.rejects(bookSourceDigest(root), /run\.go/u);

  for (const source of [
    `${prefix}run_test.go`, `${prefix}nested/run.go`, `${prefix}../run.go`,
    "tooling/internal/clrsrunner/registry.go", "tooling/internal/clrsshakedown_extra/run.go",
  ]) {
    await writeSupportPaths(root, [source]);
    await assert.rejects(bookSourceFiles(root), /paths must be bounded, allowed, sorted and unique/u);
  }
});

test("support inventory rejects malformed schema and unsafe source names", async (t) => {
  const root = await bookSourceFixture(t);
  const good = `${supportPrefix}compare.go`;
  const documents = [
    "null", "[]", "true", '"text"', "{}", '{"schema_version":1}',
    '{"schema_version":null,"paths":[]}', '{"schema_version":2,"paths":[]}',
    '{"schema_version":1,"paths":null}', '{"schema_version":1,"paths":[]}',
    '{"schema_version":1,"paths":[1]}', '{"schema_version":1,"paths":[{}]}',
    '{"schema_version":1,"paths":[[[[]]]]}',
    `{"schema_version":1,"paths":["${good}"],"extra":true}`,
    `{"schema_version":1,"paths":["${good}"],"Paths":[]}`,
    `{"schema_version":1,"schema_version":1,"paths":["${good}"]}`,
    `{"schema_version":1,"paths":["${good}"],"p\\u0061ths":[]}`,
    `{"schema_version":1,"paths":["${good}"]} false`,
    '{"schema_version":1,"paths":[}', Buffer.from([0xff]),
  ];
  for (const document of documents) {
    await writeFile(path.join(root, supportInventory), document);
    await assert.rejects(bookSourceFiles(root), /book-support-sources\.json/u);
  }
  const invalidNames = [
    "", "/tmp/escape.go", "../escape.go", "tooling/internal/pdfrender/render.go",
    "scripts/book-source.mjs", `${supportPrefix}../escape.go`, `${supportPrefix}/compare.go`,
    `${supportPrefix}nested/compare.go`, `${supportPrefix}*.go`, `${supportPrefix}.go`,
    `${supportPrefix}_ignored.go`, `${supportPrefix}compare_test.go`, `${supportPrefix}Compare.go`,
    `${supportPrefix}é.go`, `${supportPrefix}compare.go\n`, `${supportPrefix}compare.go\0`,
    `${supportPrefix}compare.go/`, good.replaceAll("/", "\\"), `${supportPrefix}%2e%2e.go`,
  ];
  for (const name of invalidNames) {
    await writeSupportPaths(root, [name]);
    await assert.rejects(bookSourceFiles(root), /paths must be bounded, allowed, sorted and unique/u);
  }
  for (const paths of [[good, good], [`${supportPrefix}z.go`, good]]) {
    await writeSupportPaths(root, paths);
    await assert.rejects(bookSourceFiles(root), /sorted and unique/u);
  }
});

test("support inventory enforces exact byte, path-count and path-length limits", async (t) => {
  const root = await bookSourceFixture(t);
  const good = `${supportPrefix}compare.go`;
  const small = JSON.stringify({ schema_version: 1, paths: [good] });
  const exact = small.padEnd(32 * 1024, " ");
  await writeFile(path.join(root, supportInventory), exact);
  assert((await bookSourceFiles(root)).includes(path.join(root, good)));
  await writeFile(path.join(root, supportInventory), `${exact} `);
  await assert.rejects(bookSourceFiles(root), /32768-byte limit/u);

  const paths = Array.from({ length: 256 }, (_, index) => (
    `${supportPrefix}source_${String(index).padStart(3, "0")}.go`
  ));
  await writeSupportPaths(root, paths);
  const files = await bookSourceFiles(root);
  assert(paths.every((source) => files.includes(path.join(root, source))));
  await writeSupportPaths(root, [...paths, `${supportPrefix}source_256.go`]);
  await assert.rejects(bookSourceFiles(root), /array exceeds its item limit/u);

  // The listing API preserves its path-only contract; actual byte reads below
  // independently require regular files. A 512-byte path can exceed host NAME_MAX.
  const longest = `${supportPrefix}${"a".repeat(512 - supportPrefix.length - 3)}.go`;
  await writeSupportPaths(root, [longest]);
  assert.equal(Buffer.byteLength(longest), 512);
  assert((await bookSourceFiles(root)).includes(path.join(root, longest)));
  await writeSupportPaths(root, [longest.replace(/\.go$/u, "a.go")]);
  await assert.rejects(bookSourceFiles(root), /paths must be bounded/u);
});

test("support inventory and selected bytes reject absent, linked and nonregular files", async (t) => {
  for (const targetKind of ["inventory", "source"]) {
    for (const mutation of ["missing", "symlink", "directory"]) {
      await t.test(`${targetKind}: ${mutation}`, async (child) => {
        const root = await bookSourceFixture(child);
        const target = path.join(root, targetKind === "inventory"
          ? supportInventory : `${supportPrefix}compare.go`);
        const original = await readFile(target);
        await rm(target);
        if (mutation === "symlink") {
          const preserved = path.join(root, "preserved-original");
          await writeFile(preserved, original);
          await symlink(preserved, target);
        } else if (mutation === "directory") {
          await mkdir(target);
        }
        await assert.rejects(bookSourceDigest(root), /ENOENT|not a regular file|linked, invalid/u);
        assert.equal((await filesystem.lstat(root)).isDirectory(), true);
      });
    }
  }
});

test("support inventory cannot route selected source bytes through an escaping parent", async (t) => {
  const root = await bookSourceFixture(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), "20w-support-escape-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const packagePath = path.join(root, "tooling/internal/clrscontext");
  await filesystem.rename(packagePath, path.join(outside, "clrscontext"));
  await symlink(path.join(outside, "clrscontext"), packagePath);
  await assert.rejects(bookSourceDigest(root), /resolves outside its containment root/u);
  assert.equal((await filesystem.lstat(packagePath)).isSymbolicLink(), true);
});

test("book inventory rejects colliding discovered paths rather than deduplicating", async (t) => {
  const root = await bookSourceFixture(t);
  const readdir = filesystem.readdir;
  const mock = t.mock.method(filesystem, "readdir", async (directory, options) => {
    const entries = await readdir(directory, options);
    return directory === path.join(root, "public", "plots") ? [...entries, entries[0]] : entries;
  });
  syncBuiltinESMExports();
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
  await assert.rejects(bookSourceFiles(root), /contains colliding paths/u);
  assert(mock.mock.callCount() > 0);
});

test("book digest uses captured inventory bytes, never a separate mid-loop reread", async (t) => {
  const root = await bookSourceFixture(t);
  const target = path.join(root, supportInventory);
  const original = await readFile(target);
  const expected = await bookSourceDigest(root);
  let mutations = 0;
  mutateOnSourceHash(t, (source) => {
    if (source === "README.md") {
      writeFileSync(target, Buffer.concat([original, Buffer.from("\n")]));
      mutations += 1;
    } else if (source === "tooling/go.mod") {
      writeFileSync(target, original);
      mutations += 1;
    }
  });
  assert.deepEqual(await bookSourceDigest(root), expected);
  assert.equal(mutations, 2);
  assert.deepEqual(await readFile(target), original);
});

test("book digest rejects final raw inventory drift, source omission and discovered-path drift", async (t) => {
  for (const mutation of ["inventory bytes", "source omission", "discovered path"]) {
    await t.test(mutation, async (child) => {
      const root = await bookSourceFixture(child);
      const target = path.join(root, supportInventory);
      const original = await readFile(target);
      let mutations = 0;
      mutateOnSourceHash(child, (source) => {
        if (source !== "vite.pages.config.ts") return;
        if (mutation === "inventory bytes") {
          writeFileSync(target, Buffer.concat([original, Buffer.from("\n")]));
        } else if (mutation === "source omission") {
          const inventory = JSON.parse(original);
          inventory.paths.shift();
          writeFileSync(target, JSON.stringify(inventory));
        } else {
          writeFileSync(path.join(root, "public/plots/new.svg"), "new plot\n");
        }
        mutations += 1;
      });
      await assert.rejects(bookSourceDigest(root), /inventory changed while its digest was computed/u);
      assert.equal(mutations, 1);
    });
  }
});

test("the book manifest rejects a same-size PDF byte replacement", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "20w-book-integrity-"));
  const pdf = path.join(directory, "book.pdf");
  try {
    const bytes = Buffer.alloc(100_000, 0x20);
    bytes.write("%PDF-1.7\n", 0, "ascii");
    await writeFile(pdf, bytes);
    const manifest = await inspectBookPdf(pdf);
    await assertBookPdfIntegrity(pdf, manifest);

    bytes[bytes.length - 1] = 0x21;
    await writeFile(pdf, bytes);
    await assert.rejects(
      assertBookPdfIntegrity(pdf, manifest),
      /PDF SHA-256 does not match/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
