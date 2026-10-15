import react from "@vitejs/plugin-react";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { normalizePublicationSourceRevision } from "./app/lib/publication-revision.mjs";
import {
  bookSourceDocuments,
  markdownSourceDocument,
  portalSourceDocuments,
} from "./scripts/lib/portal-documents.mjs";
import { portalSourceMetrics } from "./scripts/lib/portal-metrics.mjs";
import { attachResearchObjectEvidence } from "./scripts/lib/research-object-evidence.mjs";
import {
  populateSeoTemplate,
  renderBookFallback,
  renderDocumentFallback,
  renderHelpFallback,
  renderPortalFallback,
  renderSeoHead,
  renderSitemap,
} from "./scripts/lib/pages-seo.mjs";
import { resolvePagesBase } from "./scripts/lib/pages-base.mjs";
import { renderThirdPartyNotices } from "./scripts/lib/third-party-notices.mjs";
import { resolveViteCacheDirectory } from "./scripts/lib/vite-cache-directory.mjs";
import {
  translationAvailabilityRecords,
  translatedSourceDocuments,
  writeTranslationPages,
} from "./scripts/lib/translation-pages.mjs";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const projectVersion = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
).version as string;
const pagesOutputRoot = path.join(repositoryRoot, "dist-github-pages");
const pagesBase = resolvePagesBase(process.env.PAGES_BASE_PATH);
const pagesCacheDirectory = resolveViteCacheDirectory({
  override: process.env.VITE_CACHE_DIR,
  repositoryRoot,
});
const publicationSourceRevision = normalizePublicationSourceRevision(process.env.GITHUB_SHA);
const portalDocumentPrefixes = [...new Set([
  "/documents/",
  `${pagesBase}documents/`,
])];
const portalEvidencePrefixes = [...new Set([
  "/research-object-records/",
  `${pagesBase}research-object-records/`,
])];
const trackedNoticesPath = path.join(repositoryRoot, "THIRD_PARTY_NOTICES.txt");
const portalIndexModuleId = "virtual:portal-document-index";
const resolvedPortalIndexModuleId = `\0${portalIndexModuleId}`;

type PortalSourceDocument = {
  path: string;
  route: string;
  title: string;
  description: string;
  group: "Concept" | "Mathematics" | "Project" | "Research";
  kind: "markdown";
  words: number;
  searchText: string;
  body: string;
  evidenceRecords: Array<{
    kind: "claim" | "principle" | "audit" | "experiment";
    label: string;
    sourcePath: string;
    fragment: string;
  }>;
};

type TranslationSourceDocument = PortalSourceDocument & {
  language: string;
  canonicalSourcePath: string;
  canonicalSourceRoute: string;
  sourceSha256: string;
  targetSha256: string;
  sourceRevision: string;
  reviewedAt: string;
  reviewers: readonly string[];
};

function requestedPortalAsset(requestPath: string) {
  const documentPrefix = portalDocumentPrefixes.find(
    (candidate) => requestPath.startsWith(candidate),
  );
  if (documentPrefix) {
    return { kind: "document", path: requestPath.slice(documentPrefix.length) } as const;
  }
  const evidencePrefix = portalEvidencePrefixes.find(
    (candidate) => requestPath.startsWith(candidate),
  );
  if (!evidencePrefix || !requestPath.endsWith(".json")) return null;
  return {
    kind: "evidence",
    path: requestPath.slice(evidencePrefix.length, -".json".length),
  } as const;
}

function portalDocumentAssets(): Plugin {
  const currentDocuments = () => attachResearchObjectEvidence(
    repositoryRoot,
    portalSourceDocuments(repositoryRoot),
  ) as PortalSourceDocument[];
  let documents = currentDocuments();
  const refreshDocuments = () => {
    documents = currentDocuments();
    return documents;
  };
  return {
    name: "portal-document-assets",
    resolveId(id: string) {
      return id === portalIndexModuleId ? resolvedPortalIndexModuleId : null;
    },
    async load(id: string) {
      if (id !== resolvedPortalIndexModuleId) return null;
      const index = refreshDocuments().map((document) => ({
        path: document.path,
        route: document.route,
        title: document.title,
        description: document.description,
        group: document.group,
        kind: document.kind,
        words: document.words,
        searchText: document.searchText,
      }));
      const metrics = await portalSourceMetrics(repositoryRoot);
      return `export const portalMetrics = ${JSON.stringify(metrics)};\nexport default ${JSON.stringify(index)};`;
    },
    configureServer(server: ViteDevServer) {
      const sourceRoots = [
        path.join(repositoryRoot, "concept"),
        path.join(repositoryRoot, "math"),
        path.join(repositoryRoot, "research", "principle-registry.md"),
        path.join(repositoryRoot, "research", "claims.md"),
        path.join(repositoryRoot, "research", "audits"),
        path.join(repositoryRoot, "experiments", "candidates"),
        path.join(repositoryRoot, "experiments", "fixtures"),
        path.join(repositoryRoot, "sources"),
      ];
      const reloadPortal = (file: string) => {
        const relative = path.relative(repositoryRoot, file).replaceAll("\\", "/");
        if (!/^(?:(?:concept|math)\/.+\.md|research\/(?:claims|principle-registry)\.md|research\/audits\/.+\.md|experiments\/(?:candidates|fixtures)\/.+\.md|sources\/.+)$/i.test(relative)) return;
        refreshDocuments();
        const indexModule = server.moduleGraph.getModuleById(resolvedPortalIndexModuleId);
        if (indexModule) server.moduleGraph.invalidateModule(indexModule);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.add(sourceRoots);
      server.watcher.on("add", reloadPortal);
      server.watcher.on("change", reloadPortal);
      server.watcher.on("unlink", reloadPortal);

      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          next();
          return;
        }
        let requestPath: string;
        try {
          requestPath = decodeURIComponent(
            new URL(request.url ?? "/", "http://localhost").pathname,
          );
        } catch {
          next();
          return;
        }
        const requested = requestedPortalAsset(requestPath);
        if (!requested) {
          next();
          return;
        }
        const document = documents.find(
          (candidate) => candidate.path === requested.path,
        );
        if (!document) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          requested.kind === "evidence"
            ? "application/json; charset=utf-8"
            : "text/markdown; charset=utf-8",
        );
        response.setHeader("Cache-Control", "no-store");
        const body = requested.kind === "evidence"
          ? `${JSON.stringify(document.evidenceRecords)}\n`
          : document.body;
        response.end(request.method === "HEAD" ? undefined : body);
      });
    },
    generateBundle() {
      for (const document of refreshDocuments()) {
        this.emitFile({
          type: "asset",
          fileName: `documents/${document.path}`,
          source: document.body,
        });
        this.emitFile({
          type: "asset",
          fileName: `research-object-records/${document.path}.json`,
          source: `${JSON.stringify(document.evidenceRecords)}\n`,
        });
      }
    },
  };
}

export function createSeoStaticPages({
  outputRoot = pagesOutputRoot,
  translationDocuments = null,
  sourceRevision = publicationSourceRevision,
}: {
  outputRoot?: string;
  translationDocuments?: readonly TranslationSourceDocument[] | null;
  sourceRevision?: string | null;
} = {}): Plugin {
  const renderCurrentHelpPage = (template: string) => {
    const documents = portalSourceDocuments(repositoryRoot) as PortalSourceDocument[];
    const helpDocument = markdownSourceDocument(
      repositoryRoot,
      "docs/how-to-help.md",
      "Project",
    );
    return populateSeoTemplate(
      template,
      renderSeoHead("help", helpDocument, pagesBase),
      renderHelpFallback(helpDocument, documents, pagesBase),
    );
  };
  return {
    name: "seo-static-pages",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        if (!context.server) return undefined;
        const requestPath = context.path.replace(/index\.html$/u, "");
        if (requestPath !== `${pagesBase}help/`) return undefined;
        return renderCurrentHelpPage(html);
      },
    },
    writeBundle() {
      const documents = attachResearchObjectEvidence(
        repositoryRoot,
        portalSourceDocuments(repositoryRoot),
      ) as PortalSourceDocument[];
      const bookDocuments = bookSourceDocuments(repositoryRoot) as PortalSourceDocument[];
      const translations = translationDocuments
        ?? translatedSourceDocuments(repositoryRoot) as TranslationSourceDocument[];
      const translationAvailability = translationAvailabilityRecords(translations);
      const portalPath = path.join(outputRoot, "index.html");
      const bookPath = path.join(outputRoot, "book", "index.html");
      const helpPath = path.join(outputRoot, "help", "index.html");
      const portalTemplate = readFileSync(portalPath, "utf8");
      const staticTemplate = readFileSync(helpPath, "utf8");
      writeFileSync(portalPath, populateSeoTemplate(
        portalTemplate,
        renderSeoHead("portal", null, pagesBase),
        renderPortalFallback(documents, pagesBase, translationAvailability),
      ), "utf8");
      writeFileSync(bookPath, populateSeoTemplate(
        readFileSync(bookPath, "utf8"),
        renderSeoHead("book", null, pagesBase),
        renderBookFallback(bookDocuments, pagesBase, {
          translationDocuments: translationAvailability,
          editionVersion: projectVersion,
          sourceRevision,
        }),
      ), "utf8");
      writeFileSync(helpPath, renderCurrentHelpPage(readFileSync(helpPath, "utf8")), "utf8");
      for (const document of documents) {
        const output = path.join(outputRoot, ...document.route.split("/"), "index.html");
        mkdirSync(path.dirname(output), { recursive: true });
        writeFileSync(output, populateSeoTemplate(
          portalTemplate,
          renderSeoHead("document", document, pagesBase, translationAvailability),
          renderDocumentFallback(
            document,
            documents,
            pagesBase,
            {
              translationDocuments: translationAvailability,
              editionVersion: projectVersion,
              sourceRevision,
            },
          ),
        ), "utf8");
      }
      writeTranslationPages({
        outputRoot,
        template: staticTemplate,
        documents: translations,
        basePath: pagesBase,
      });
      writeFileSync(
        path.join(outputRoot, "sitemap.xml"),
        renderSitemap([...documents, ...translations]),
        "utf8",
      );
    },
  };
}

function legalReleaseAssets(): Plugin {
  return {
    name: "legal-release-assets",
    generateBundle(_options, bundle) {
      const moduleIds = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const moduleId of Object.keys(output.modules ?? {})) moduleIds.add(moduleId);
      }
      const notices = renderThirdPartyNotices({ moduleIds, repositoryRoot });
      if (process.env.UPDATE_THIRD_PARTY_NOTICES === "1") {
        writeFileSync(trackedNoticesPath, notices, "utf8");
      } else if (readFileSync(trackedNoticesPath, "utf8") !== notices) {
        throw new Error(
          "THIRD_PARTY_NOTICES.txt is stale; run npm run generate:third-party-notices",
        );
      }
      for (const [fileName, sourcePath] of [
        ["LICENSE", path.join(repositoryRoot, "LICENSE")],
        ["LICENSING.md", path.join(repositoryRoot, "LICENSING.md")],
        ["LICENSES/CC-BY-SA-4.0.txt", path.join(repositoryRoot, "LICENSES", "CC-BY-SA-4.0.txt")],
        ["LICENSES/OFL-1.1.txt", path.join(repositoryRoot, "LICENSES", "OFL-1.1.txt")],
      ]) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(sourcePath) });
      }
      this.emitFile({ type: "asset", fileName: "THIRD_PARTY_NOTICES.txt", source: notices });
    },
  };
}

export default defineConfig({
  root: path.join(repositoryRoot, "github-pages"),
  cacheDir: pagesCacheDirectory,
  base: pagesBase,
  publicDir: path.join(repositoryRoot, "public"),
  assetsInclude: ["**/*.md", "**/*.mmd", "**/*.bib"],
  plugins: [react(), portalDocumentAssets(), legalReleaseAssets(), createSeoStaticPages()],
  define: {
    __PUBLICATION_SOURCE_REVISION__: JSON.stringify(publicationSourceRevision),
  },
  build: {
    outDir: pagesOutputRoot,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        portal: path.join(repositoryRoot, "github-pages", "index.html"),
        book: path.join(repositoryRoot, "github-pages", "book", "index.html"),
        help: path.join(repositoryRoot, "github-pages", "help", "index.html"),
      },
    },
  },
});
