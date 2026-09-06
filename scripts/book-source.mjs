import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { readStableOpenedFile } from "./lib/opened-file.mjs";
import { parseStrictJson } from "./lib/strict-json.mjs";

export const bookPdfName = "20-watts-was-enough-full-concept-book.pdf";
const maximumBookSourceBytes = 256 * 1024 * 1024;
const maximumMarkdownInventoryDepth = 16;
const maximumMarkdownInventoryEntries = 8_192;
const supportInventoryPath = "scripts/book-support-sources.json";
const maximumSupportInventoryBytes = 32 * 1024;
const maximumSupportPaths = 256;
const maximumSupportPathBytes = 512;
const supportPathPattern = /^tooling\/internal\/(?:clrscontext|clrsfixture|clrsshakedown|experimentcli)\/[a-z][a-z0-9_]*\.go$/u;

async function readSupportInventory(projectRoot) {
  const bytes = await readStableOpenedFile(path.join(projectRoot, supportInventoryPath), {
    label: supportInventoryPath,
    containedBy: projectRoot,
    maximumBytes: maximumSupportInventoryBytes,
  });
  const inventory = parseStrictJson(bytes, {
    label: supportInventoryPath,
    maximumDepth: 3,
    maximumContainerEntries: maximumSupportPaths,
  });
  if (
    inventory === null || typeof inventory !== "object" || Array.isArray(inventory)
    || Object.keys(inventory).sort().join(",") !== "paths,schema_version"
    || inventory.schema_version !== 1 || !Array.isArray(inventory.paths)
    || inventory.paths.length < 1 || inventory.paths.length > maximumSupportPaths
  ) {
    throw new Error(`Invalid ${supportInventoryPath}: expected schema 1 and 1–256 paths.`);
  }
  let previous = "";
  for (const source of inventory.paths) {
    if (
      typeof source !== "string" || Buffer.byteLength(source) > maximumSupportPathBytes
      || !supportPathPattern.test(source) || source.endsWith("_test.go")
      || source <= previous
    ) {
      throw new Error(`Invalid ${supportInventoryPath}: paths must be bounded, allowed, sorted and unique.`);
    }
    previous = source;
  }
  return { bytes, paths: inventory.paths };
}

function relativeSourcePaths(projectRoot, files) {
  return files.map((file) => path.relative(projectRoot, file).replaceAll("\\", "/"));
}

async function markdownFiles(directory) {
  const files = [];
  const pending = [{ directory, depth: 0 }];
  let entriesVisited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await readdir(current.directory, { withFileTypes: true });
    entriesVisited += entries.length;
    if (entriesVisited > maximumMarkdownInventoryEntries) {
      throw new Error(
        `Book Markdown inventory exceeds ${maximumMarkdownInventoryEntries} entries under ${directory}.`,
      );
    }
    for (const entry of entries) {
      const entryPath = path.join(current.directory, entry.name);
      if (entry.isDirectory()) {
        if (current.depth >= maximumMarkdownInventoryDepth) {
          throw new Error(
            `Book Markdown inventory exceeds depth ${maximumMarkdownInventoryDepth} under ${directory}.`,
          );
        }
        pending.push({ directory: entryPath, depth: current.depth + 1 });
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

const bookSupportSourcePaths = [
  "LICENSE",
  "LICENSING.md",
  "LICENSES/CC-BY-SA-4.0.txt",
  "LICENSES/OFL-1.1.txt",
  "LICENSES/remark-math-MIT.txt",
  "CITATION.cff",
  "README.md",
  "THIRD_PARTY_NOTICES.txt",
  "app/book-content.ts",
  "app/components/book-edition.tsx",
  "app/components/language-access.tsx",
  "app/components/markdown-document.tsx",
  "app/components/mermaid-diagram.tsx",
  "app/components/overflow-region.tsx",
  "app/components/readiness-overview.tsx",
  "app/globals.css",
  "app/lib/book-release-identity.mjs",
  "app/lib/book-document-id.mjs",
  "app/lib/eu-languages.mjs",
  "app/lib/language-access.mjs",
  "app/lib/publication.mjs",
  "app/lib/publication-revision.mjs",
  "app/lib/readiness.ts",
  "app/lib/research-object.mjs",
  "app/lib/repository-artifacts.ts",
  "app/project-metadata.ts",
  "app/research-document.ts",
  "app/research-object.ts",
  "experiments/test-readiness-summary.json",
  "github-pages/book.tsx",
  "github-pages/public-artifacts.json",
  "github-pages/book/index.html",
  "package-lock.json",
  "package.json",
  "public/og-v2.jpg",
  "research/field-coverage.md",
  "scripts/book-source.mjs",
  supportInventoryPath,
  "scripts/generate-book-pdf.mjs",
  "scripts/install-locked-npm.mjs",
  "scripts/lib/atomic-file-pair.mjs",
  "scripts/lib/chromium-cdp.mjs",
  "scripts/lib/book-pdf-generation-options.mjs",
  "scripts/lib/book-pdf-integrity.mjs",
  "scripts/lib/book-renderer-identity.mjs",
  "scripts/lib/opened-file.mjs",
  "scripts/lib/pages-base.mjs",
  "scripts/lib/pages-seo.mjs",
  "scripts/lib/pdf-metadata.mjs",
  "scripts/lib/plain-text.mjs",
  "scripts/lib/portal-documents.mjs",
  "scripts/lib/portal-metrics.mjs",
  "scripts/lib/research-object-evidence.mjs",
  "scripts/lib/source-boundary.mjs",
  "scripts/lib/strict-json.mjs",
  "scripts/lib/third-party-notices.mjs",
  "scripts/lib/translation-manifest.mjs",
  "scripts/lib/translation-pages.mjs",
  "scripts/lib/vite-cache-directory.mjs",
  "scripts/npm-runtime-lock.json",
  "sources/taxonomies/2026-08-25/README.md",
  "tooling/cmd/20w/main.go",
  "tooling/cmd/20w/pdf_reproducibility.go",
  "tooling/cmd/20w/translation.go",
  "tooling/cmd/ci-plan/main.go",
  "tooling/cmd/pdf-proof/main.go",
  "tooling/go.mod",
  "tooling/go.sum",
  "tooling/internal/buildinfo/buildinfo.go",
  "tooling/internal/ciplancli/cli.go",
  "tooling/internal/docscheck/check.go",
  "tooling/internal/docscheck/mermaid-duplicate-baseline.json",
  "tooling/internal/docscheck/mermaid.go",
  "tooling/internal/experiment/catalog.go",
  "tooling/internal/githubapi/client.go",
  "tooling/internal/githublabels/labels.go",
  "tooling/internal/nodeimage/package.go",
  "tooling/internal/ocimanifest/manifest.go",
  "tooling/internal/pdfrender/archive.go",
  "tooling/internal/pdfrender/build_cache.go",
  "tooling/internal/pdfrender/build_cache_inventory.go",
  "tooling/internal/pdfrender/command.go",
  "tooling/internal/pdfrender/dockerfile.go",
  "tooling/internal/pdfrender/generation_mismatch.go",
  "tooling/internal/pdfrender/image_proof.go",
  "tooling/internal/pdfrender/image_proof_command.go",
  "tooling/internal/pdfrender/image_proof_process_linux.go",
  "tooling/internal/pdfrender/image_proof_process_unsupported.go",
  "tooling/internal/pdfrender/image_proof_tar.go",
  "tooling/internal/pdfrender/installed_dependencies.go",
  "tooling/internal/pdfrender/installed_inventory.go",
  "tooling/internal/pdfrender/lock.go",
  "tooling/internal/pdfrender/publication.go",
  "tooling/internal/pdfrender/render.go",
  "tooling/internal/pdfrender/reproducibility.go",
  "tooling/internal/pdfrender/reproducibility_receipt.go",
  "tooling/internal/pdfrendercli/cli.go",
  "tooling/internal/pdfrenderlock/lock.go",
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
  "translations/manifest.json",
  "translations/eu-languages.json",
  "vite.pages.config.ts",
];

async function bookSourceSnapshot(projectRoot) {
  const inventory = await readSupportInventory(projectRoot);
  const conceptFiles = (await markdownFiles(path.join(projectRoot, "concept")))
    .filter((file) => path.basename(file) !== "README.md");
  const mathFiles = (await markdownFiles(path.join(projectRoot, "math")))
    .filter((file) => path.basename(file) !== "README.md");
  const evidenceAuthorityFiles = [
    path.join(projectRoot, "research", "claims.md"),
    path.join(projectRoot, "research", "principle-registry.md"),
    ...await markdownFiles(path.join(projectRoot, "research", "audits")),
    ...await markdownFiles(path.join(projectRoot, "experiments", "candidates")),
    ...await markdownFiles(path.join(projectRoot, "experiments", "fixtures")),
  ];
  const supportFiles = [...bookSupportSourcePaths, ...inventory.paths]
    .map((file) => path.join(projectRoot, file));
  const plotFiles = await readdir(path.join(projectRoot, "public", "plots"), {
    withFileTypes: true,
  });
  const files = [...supportFiles, ...conceptFiles, ...mathFiles, ...evidenceAuthorityFiles, ...plotFiles
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(projectRoot, "public", "plots", entry.name))]
    .sort((left, right) => left.localeCompare(right));
  if (new Set(files).size !== files.length) {
    throw new Error("Book source inventory contains colliding paths.");
  }
  return { files, inventory };
}

export async function bookSourceFiles(projectRoot) {
  return (await bookSourceSnapshot(projectRoot)).files;
}

export async function bookSourceDigest(projectRoot) {
  const { files, inventory } = await bookSourceSnapshot(projectRoot);
  const relativeFiles = relativeSourcePaths(projectRoot, files);
  const hash = createHash("sha256");
  for (const [index, file] of files.entries()) {
    const relative = relativeFiles[index];
    hash.update(relative);
    hash.update("\0");
    const bytes = relative === supportInventoryPath ? inventory.bytes : await readStableOpenedFile(file, {
      label: `book source ${relative}`,
      containedBy: projectRoot,
      maximumBytes: maximumBookSourceBytes,
    });
    hash.update(bytes);
    hash.update("\0");
  }
  const final = await bookSourceSnapshot(projectRoot);
  const finalFiles = relativeSourcePaths(projectRoot, final.files);
  if (!inventory.bytes.equals(final.inventory.bytes)
    || JSON.stringify(finalFiles) !== JSON.stringify(relativeFiles)) {
    throw new Error("Book source inventory changed while its digest was computed.");
  }
  return {
    digest: hash.digest("hex"),
    files: relativeFiles,
  };
}
