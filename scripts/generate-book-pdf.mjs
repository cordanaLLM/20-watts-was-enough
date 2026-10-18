import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { assertBookSourceRefForVersion } from "../app/lib/book-release-identity.mjs";
import { bookPdfName, bookSourceDigest } from "./book-source.mjs";
import {
  connectCdp,
  devtoolsPage,
  firstExistingChromium,
  printPageToPdf,
  stopProcess,
  waitForUrl,
} from "./lib/chromium-cdp.mjs";
import {
  acquireExclusiveFileLock,
  replaceFilePair,
} from "./lib/atomic-file-pair.mjs";
import { inspectBookPdf } from "./lib/book-pdf-integrity.mjs";
import {
  assertDisplayEquationTags,
  tagDisplayEquationsForPrint,
} from "./lib/book-print-equation-tags.mjs";
import { parseBookPdfGenerationOptions } from "./lib/book-pdf-generation-options.mjs";
import {
  assertBookRendererLockIdentity,
  bookRendererIdentityFromEnvironment,
} from "./lib/book-renderer-identity.mjs";
import { normalizeChromiumPdfMetadata } from "./lib/pdf-metadata.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "public", "downloads");
const outputPdf = path.join(outputDirectory, bookPdfName);
const manifestPath = path.join(outputDirectory, "book-manifest.json");
const stagingIdentity = randomUUID();
const stagedPdf = path.join(outputDirectory, `.${bookPdfName}.${stagingIdentity}.tmp`);
const stagedManifest = path.join(outputDirectory, `.book-manifest.json.${stagingIdentity}.tmp`);
const tempRoot = path.join(projectRoot, "tmp", "pdfs");
const renderLockPath = path.join(projectRoot, "tmp", "pdf-renderer-book.lock");
const sitePort = 3137;
const debugPort = 3138;
const { sourceRef, sourceRevision } = parseBookPdfGenerationOptions(process.argv.slice(2));
const revisionQuery = sourceRevision
  ? `&revision=${encodeURIComponent(sourceRevision)}`
  : "";
const bookUrl = `http://127.0.0.1:${sitePort}/book/?pdf=1&ref=${encodeURIComponent(sourceRef)}${revisionQuery}`;
const cli = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const packageManifest = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
assertBookSourceRefForVersion(sourceRef, packageManifest.version);
const rendererIdentity = assertBookRendererLockIdentity(
  bookRendererIdentityFromEnvironment(),
  await readFile(path.join(projectRoot, "tooling", "pdf-renderer", "lock.json")),
);

await mkdir(outputDirectory, { recursive: true });
await mkdir(tempRoot, { recursive: true });
const renderLock = await acquireExclusiveFileLock(renderLockPath, "full-book PDF generation");
try {
const resolvedSystemTemp = path.resolve(tmpdir()) + path.sep;
const resolvedProfile = path.resolve(
  await mkdtemp(path.join(resolvedSystemTemp, "20w-book-chrome-")),
);
if (!resolvedProfile.startsWith(resolvedSystemTemp)) {
  throw new Error("Temporary browser profile escaped the operating-system temp directory.");
}

const sourceSnapshot = await bookSourceDigest(projectRoot);
const citationDocument = parseDocument(
  await readFile(path.join(projectRoot, "CITATION.cff"), "utf8"),
  { prettyErrors: true, strict: true, uniqueKeys: true },
);
if (citationDocument.errors.length > 0) {
  throw new Error(`CITATION.cff is invalid: ${citationDocument.errors[0].message}`);
}
const citation = citationDocument.toJS();
if (String(citation?.version ?? "") !== packageManifest.version) {
  throw new Error("CITATION.cff version must match package.json before PDF generation.");
}
const releaseDate = citation?.["date-released"];
const bookMarkdown = sourceSnapshot.files.filter(
  (file) =>
    file === "README.md" ||
    file === "research/field-coverage.md" ||
    file.startsWith("concept/") ||
    file.startsWith("math/"),
);
const expectedBookSections = bookMarkdown.length + 1;
let expectedDiagrams = 0;
for (const relative of bookMarkdown) {
  const body = await readFile(path.join(projectRoot, relative), "utf8");
  expectedDiagrams += [...body.matchAll(/^```mermaid\s*$/gm)].length;
}

const browser = await firstExistingChromium();
const server = spawn(
  process.execPath,
  [
    cli,
    "--config",
    "vite.pages.config.ts",
    "--configLoader",
    "runner",
    "--port",
    String(sitePort),
    "--host",
    "127.0.0.1",
    "--strictPort",
  ],
  {
    cwd: projectRoot,
    env: { ...process.env, BROWSER: "none" },
    // Keep stdin open: Vite treats an immediate EOF as a request to stop the
    // development server, which races the headless browser navigation.
    stdio: ["pipe", "inherit", "inherit"],
    windowsHide: true,
  },
);
let browserProcess;
let cdp;
let observedRenderedDiagrams = 0;

try {
  await waitForUrl(bookUrl, server);
  browserProcess = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      "--disable-features=NetworkServiceSandbox",
      "--no-sandbox",
      "--no-proxy-server",
      "--allow-insecure-localhost",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--window-size=1440,1200",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${resolvedProfile}`,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  const webSocketUrl = await devtoolsPage(browserProcess, debugPort);
  cdp = await connectCdp(webSocketUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const navigation = await cdp.send("Page.navigate", { url: bookUrl });
  if (navigation.errorText) {
    throw new Error(
      `Headless Chrome navigation failed: ${navigation.errorText}; preview exit=${server.exitCode}`,
    );
  }

  const navigationDeadline = Date.now() + 60_000;
  let navigated = false;
  let lastNavigationValue;
  while (Date.now() < navigationDeadline) {
    const location = await cdp.send("Runtime.evaluate", {
      expression:
        "({ href: location.href, state: document.readyState, documents: document.querySelectorAll('.book-document').length })",
      returnByValue: true,
    });
    const value = location.result?.value;
    lastNavigationValue = value;
    if (value?.href === bookUrl && value.documents > 0) {
      navigated = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!navigated) {
    throw new Error(
      `Headless Chrome did not navigate to the rendered book page: ${JSON.stringify(lastNavigationValue)}`,
    );
  }

  const readinessExpression = `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const inspectDiagrams = () => {
        const nodes = [...document.querySelectorAll('.diagram')];
        const invalid = nodes.flatMap((node, index) => {
          const svgs = node.querySelectorAll('.diagram-canvas > svg');
          const svg = svgs[0];
          const bounds = svg?.getBoundingClientRect();
          if (
            svgs.length === 1 &&
            svg.childElementCount > 0 &&
            bounds.width > 0 &&
            bounds.height > 0
          ) return [];
          return [{
            index,
            caption: node.querySelector('figcaption')?.textContent?.slice(0, 240) ?? '',
            svgCount: svgs.length,
            svgChildren: svg?.childElementCount ?? 0,
            width: bounds?.width ?? 0,
            height: bounds?.height ?? 0,
          }];
        });
        return {
          diagrams: nodes.length,
          renderedDiagrams: nodes.length - invalid.length,
          invalidDiagrams: invalid,
        };
      };
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        const documents = document.querySelectorAll('.book-document').length;
        const diagramInspection = inspectDiagrams();
        const { diagrams, renderedDiagrams } = diagramInspection;
        const loading = document.querySelectorAll('.diagram-loading').length;
        const errors = [...document.querySelectorAll('.diagram-error')]
          .map((node) => node.textContent?.slice(0, 500) ?? 'unknown diagram error');
        const images = [...document.images];
        const imagesReady = images.every((image) => image.complete && image.naturalWidth > 0);
        if (errors.length) {
          return {
            ready: false,
            errors,
            documents,
            ...diagramInspection,
            loading,
          };
        }
        if (
          document.readyState === 'complete' &&
          documents === ${expectedBookSections} &&
          diagrams === ${expectedDiagrams} &&
          renderedDiagrams === ${expectedDiagrams} &&
          loading === 0 &&
          imagesReady
        ) {
          await document.fonts.ready;
          await Promise.all(images.map((image) => image.decode?.().catch(() => undefined)));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await wait(750);
          const stableInspection = inspectDiagrams();
          if (stableInspection.renderedDiagrams !== ${expectedDiagrams}) {
            return {
              ready: false,
              unstable: true,
              documents,
              ...stableInspection,
            };
          }
          return {
            ready: true,
            documents,
            ...stableInspection,
            images: images.length,
          };
        }
        await wait(250);
      }
      return {
        ready: false,
        timeout: true,
        documents: document.querySelectorAll('.book-document').length,
        ...inspectDiagrams(),
        loading: document.querySelectorAll('.diagram-loading').length,
        incompleteImages: [...document.images]
          .filter((image) => !image.complete || image.naturalWidth <= 0)
          .map((image) => ({
            src: image.currentSrc || image.src,
            complete: image.complete,
            naturalWidth: image.naturalWidth,
          })),
        errors: [...document.querySelectorAll('.diagram-error')]
          .map((node) => node.textContent?.slice(0, 500) ?? 'unknown diagram error'),
      };
    })()
  `;
  const readiness = await cdp.send("Runtime.evaluate", {
    expression: readinessExpression,
    awaitPromise: true,
    returnByValue: true,
  });
  const readinessValue = readiness.result?.value;
  if (!readinessValue?.ready) {
    throw new Error(`Book page did not become print-ready: ${JSON.stringify(readinessValue)}`);
  }
  observedRenderedDiagrams = readinessValue.renderedDiagrams;

  const equationTags = await cdp.send("Runtime.evaluate", {
    expression: `(${tagDisplayEquationsForPrint.toString()})(document)`,
    returnByValue: true,
  });
  assertDisplayEquationTags(equationTags.result?.value);

  const printed = await printPageToPdf(
    cdp,
    {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    },
    {
      onRetry: ({ delayMs, remainingMs }) => console.warn(
        `Headless Chrome returned "Printing failed"; retrying Page.printToPDF once after `
          + `${delayMs} ms with ${remainingMs} ms left in the original print budget.`,
      ),
    },
  );
  const normalizedPdf = normalizeChromiumPdfMetadata(
    Buffer.from(printed.data, "base64"),
    releaseDate,
  );
  await writeFile(stagedPdf, normalizedPdf, { flag: "wx", mode: 0o600 });
} catch (error) {
  await Promise.all([
    rm(stagedPdf, { force: true }),
    rm(stagedManifest, { force: true }),
  ]);
  throw error;
} finally {
  cdp?.socket.close();
  if (browserProcess) await stopProcess(browserProcess);
  await stopProcess(server);
  await rm(resolvedProfile, { recursive: true, force: true });
}

let pdfIntegrity;
try {
  const finalSourceSnapshot = await bookSourceDigest(projectRoot);
  if (finalSourceSnapshot.digest !== sourceSnapshot.digest) {
    throw new Error(
      "Book sources changed during rendering; the existing PDF and manifest were preserved. Re-run from a stable source tree.",
    );
  }

  pdfIntegrity = await inspectBookPdf(stagedPdf);

  const manifest = {
    schema_version: 3,
    title: "20 Watts Was Enough — Full Concept Book",
    version: packageManifest.version,
    source_ref: sourceRef,
    source_revision: sourceRevision,
    pdf: `public/downloads/${bookPdfName}`,
    source_digest: sourceSnapshot.digest,
    source_files: sourceSnapshot.files,
    renderer: rendererIdentity,
    book_documents: bookMarkdown.length,
    generated_front_matter_sections: 1,
    rendered_diagrams: observedRenderedDiagrams,
    size_bytes: pdfIntegrity.size_bytes,
    pdf_sha256: pdfIntegrity.pdf_sha256,
  };
  await writeFile(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await replaceFilePair([
    { staged: stagedPdf, destination: outputPdf },
    { staged: stagedManifest, destination: manifestPath },
  ]);
} catch (error) {
  await Promise.all([
    rm(stagedPdf, { force: true }),
    rm(stagedManifest, { force: true }),
  ]);
  throw error;
}

console.log(
  `Generated ${path.relative(projectRoot, outputPdf)} from ${sourceRef} (${pdfIntegrity.size_bytes} bytes, ${bookMarkdown.length} documents, ${observedRenderedDiagrams} observed diagrams, sha256:${pdfIntegrity.pdf_sha256}).`,
);
} finally {
  await renderLock.release();
}
