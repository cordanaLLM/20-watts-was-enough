import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

import {
  connectCdp,
  devtoolsPageFromProfile,
  firstExistingChromium,
  settleCleanupSteps,
  stopProcess,
} from "./lib/chromium-cdp.mjs";
import { portalSourceDocuments } from "./lib/portal-documents.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesBasePath = "/research/";
const sourceRevision = "89abcdef0123456789abcdef0123456789abcdef";
const projectVersion = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
).version;
const launchpadDocument = portalSourceDocuments(repositoryRoot).find(
  (document) => document.path === "concept/05-biology-is-a-launchpad.md",
);
assert.ok(launchpadDocument);
const launchpadWords = launchpadDocument.words;

// The portal declares platform font stacks, so Windows renders the toolbar
// title in Palatino Linotype and wraps it one line deeper than the Liberation
// Serif fallback of the Linux gate. The layout contracts below measure glyph
// metrics, so the session pins the design tokens to the core families that
// Windows and macOS ship and that Liberation reproduces metric for metric.
const measurementFontTokens = Object.freeze({
  "--font-serif": '"Times New Roman", serif',
  "--font-sans": "Arial, sans-serif",
  "--font-mono": '"Courier New", monospace',
});

async function pinMeasurementFonts(cdp) {
  const declarations = Object.entries(measurementFontTokens)
    .map(([token, value]) => `${token}: ${value};`)
    .join(" ");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(${JSON.stringify(`:root { ${declarations} }`)});
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    })()`,
  });
}

async function navigate(cdp, url) {
  const result = await cdp.send("Page.navigate", { url });
  assert.equal(result.errorText, undefined);
}

async function waitForExpression(cdp, expression, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result.result?.value === true) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`Browser condition timed out: ${expression}`);
}

async function hydratedResearchObjectSnapshot(cdp) {
  return (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const header = document.querySelector('[data-research-object="focused-document"]');
      const value = (label) => [...header.querySelectorAll('dl > div')]
        .find((row) => row.querySelector('dt')?.textContent.trim() === label)
        ?.querySelector('dd')?.textContent.trim() ?? null;
      const href = (label, root = header) => [...root.querySelectorAll('a')]
        .find((link) => link.textContent.trim() === label)?.href ?? null;
      const clarity = new URL(href('Report clarity'));
      const correction = new URL(href('Correct evidence'));
      const summary = header.querySelector('.research-object-evidence summary');
      const root = document.documentElement;
      const resourceUrls = performance.getEntriesByType('resource').map((entry) => new URL(entry.name));
      const headingId = header.getAttribute('aria-labelledby');
      return {
        type: header.querySelector('.research-object-kicker')?.textContent.trim() ?? null,
        title: headingId ? document.getElementById(headingId)?.textContent.trim() ?? null : null,
        h1Count: document.querySelectorAll('h1').length,
        headerH1Count: header.querySelectorAll('h1').length,
        path: header.querySelector('.research-object-path code')?.textContent.trim() ?? null,
        edition: value('Edition'),
        revision: value('Source revision'),
        extent: value('Extent'),
        publicRoute: value('Public route'),
        editionFields: [...header.querySelectorAll('dt')]
          .filter((node) => node.textContent.trim() === 'Edition').length,
        disclosureLinks: [...header.querySelectorAll('a')]
          .filter((link) => link.textContent.trim() === 'Disclosure').length,
        source: href('Source'),
        history: href('History'),
        book: href('Book'),
        pdf: href('PDF'),
        citation: href('Cite'),
        licence: href('Licence'),
        c018: href('C-018', header.querySelector('.research-object-evidence')),
        clarityLocator: clarity.searchParams.get('location'),
        correctionLocator: correction.searchParams.get('claims'),
        summaryHeight: summary?.getBoundingClientRect().height ?? 0,
        minimumEvidenceTargetHeight: Math.min(...[...header.querySelectorAll('.research-object-evidence a')]
          .map((link) => link.getBoundingClientRect().height)),
        documentRevision: resourceUrls.find((url) =>
          url.pathname.endsWith('/documents/concept/05-biology-is-a-launchpad.md'))
          ?.searchParams.get('revision') ?? null,
        evidenceRevision: resourceUrls.find((url) =>
          url.pathname.endsWith('/research-object-records/concept/05-biology-is-a-launchpad.md.json'))
          ?.searchParams.get('revision') ?? null,
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
      };
    })()`,
    returnByValue: true,
  })).result?.value;
}

async function assertHydratedResearchObject(cdp, origin) {
  await navigate(
    cdp,
    `${origin}${pagesBasePath}concept/05-biology-is-a-launchpad/#scope`,
  );
  await waitForExpression(
    cdp,
    `document.readyState === "complete"
      && document.querySelector('[data-research-object="focused-document"]')
      && [...document.querySelectorAll('.research-object-evidence a')]
        .some((link) => link.textContent.trim() === "C-018")`,
  );
  const snapshot = await hydratedResearchObjectSnapshot(cdp);

  const edition = `Site v${projectVersion} · continuous main snapshot`;
  assert.equal(snapshot.type, "Concept document");
  assert.equal(snapshot.title, launchpadDocument.title);
  assert.equal(snapshot.h1Count, 1);
  assert.equal(snapshot.headerH1Count, 0);
  assert.equal(snapshot.path, "concept/05-biology-is-a-launchpad.md");
  assert.equal(snapshot.edition, edition);
  assert.equal(snapshot.revision, sourceRevision);
  assert.equal(snapshot.extent, `${launchpadWords.toLocaleString("en-GB")} words`);
  assert.equal(
    snapshot.publicRoute,
    "https://www.cordana.dev/concept/05-biology-is-a-launchpad/",
  );
  assert.equal(snapshot.editionFields, 1);
  assert.equal(snapshot.documentRevision, sourceRevision);
  assert.equal(snapshot.evidenceRevision, sourceRevision);
  assert.equal(snapshot.disclosureLinks, 0);
  assert.equal(
    snapshot.source,
    `https://github.com/cordanaLLM/20-watts-was-enough/blob/${sourceRevision}/concept/05-biology-is-a-launchpad.md#scope`,
  );
  assert.equal(
    snapshot.history,
    `https://github.com/cordanaLLM/20-watts-was-enough/commits/${sourceRevision}/concept/05-biology-is-a-launchpad.md`,
  );
  assert.equal(snapshot.book, `${origin}${pagesBasePath}book/`);
  assert.equal(
    snapshot.pdf,
    `${origin}${pagesBasePath}downloads/20-watts-was-enough-full-concept-book.pdf`,
  );
  assert.equal(
    snapshot.citation,
    `https://github.com/cordanaLLM/20-watts-was-enough/blob/${sourceRevision}/CITATION.cff`,
  );
  assert.equal(
    snapshot.licence,
    `https://github.com/cordanaLLM/20-watts-was-enough/blob/${sourceRevision}/LICENSING.md`,
  );
  assert.equal(
    snapshot.c018,
    `https://github.com/cordanaLLM/20-watts-was-enough/blob/${sourceRevision}/research/claims.md#c-018`,
  );
  const expectedLocator = [
    "Canonical path: concept/05-biology-is-a-launchpad.md",
    "Public route: https://www.cordana.dev/concept/05-biology-is-a-launchpad/",
    `Edition: ${edition}`,
    `Source revision: ${sourceRevision}`,
    "Current fragment: #scope",
  ].join("; ");
  for (const locator of [snapshot.clarityLocator, snapshot.correctionLocator]) {
    assert.equal(locator, expectedLocator);
    assert.doesNotMatch(locator, /[\r\n]/u);
  }
  assert.ok(snapshot.summaryHeight >= 44, JSON.stringify(snapshot));
  assert.ok(snapshot.minimumEvidenceTargetHeight >= 24, JSON.stringify(snapshot));
  assert.ok(snapshot.scrollWidth <= snapshot.clientWidth, JSON.stringify(snapshot));
}

async function assertFocusedDocumentEntry(cdp, origin) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate(
    cdp,
    `${origin}${pagesBasePath}math/measurement-contract/`,
  );
  await waitForExpression(
    cdp,
    `document.readyState === "complete"
      && document.querySelector('[data-research-object="focused-document"]')
      && document.querySelector('.portal-prose p')?.getBoundingClientRect().height > 0`,
  );

  const snapshot = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const header = document.querySelector('[data-research-object="focused-document"]');
      const firstParagraph = document.querySelector('.portal-prose p');
      const firstParagraphStyle = getComputedStyle(firstParagraph);
      const firstParagraphTop = firstParagraph.getBoundingClientRect().top;
      const root = document.documentElement;
      const labels = (selector) => [...header.querySelectorAll(selector)]
        .map((node) => node.textContent.trim());
      const headerActionLinks = [...header.querySelectorAll('.research-object-routes a')];
      return {
        bookPdfRoutes: labels('.research-object-routes a')
          .filter((label) => label === 'Book' || label === 'PDF'),
        clientWidth: root.clientWidth,
        feedbackRoutes: labels('nav[aria-label="Research object feedback"] a'),
        firstParagraphLineBottom:
          firstParagraphTop + Number.parseFloat(firstParagraphStyle.lineHeight),
        firstParagraphTop,
        fontTokens: Object.fromEntries(
          ${JSON.stringify(Object.keys(measurementFontTokens))}.map((token) =>
            [token, getComputedStyle(root).getPropertyValue(token).trim()]),
        ),
        identityLabels: labels('dl > div > dt'),
        minimumHeaderActionHeight: Math.min(...headerActionLinks.map(
          (link) => link.getBoundingClientRect().height,
        )),
        recordRoutes: labels('nav[aria-label="Research object records"] a'),
        scrollWidth: root.scrollWidth,
        scrollY,
        toolbarActionGroups: document.querySelectorAll(
          '.portal-reader-toolbar nav[aria-label="Document actions"]',
        ).length,
        toolbarHeight: document.querySelector('.portal-reader-toolbar')
          .getBoundingClientRect().height,
        viewportHeight: innerHeight,
      };
    })()`,
    returnByValue: true,
  })).result?.value;

  assert.equal(snapshot.scrollY, 0, JSON.stringify(snapshot));
  assert.deepEqual(snapshot.fontTokens, measurementFontTokens);
  assert.deepEqual(
    snapshot.identityLabels,
    ["Edition", "Source revision", "Extent", "Public route"],
  );
  assert.deepEqual(
    snapshot.recordRoutes,
    ["Source", "History", "Book", "PDF", "Cite", "Licence"],
  );
  assert.deepEqual(snapshot.bookPdfRoutes, ["Book", "PDF"]);
  assert.deepEqual(snapshot.feedbackRoutes, ["Report clarity", "Correct evidence"]);
  assert.ok(snapshot.minimumHeaderActionHeight >= 24, JSON.stringify(snapshot));
  assert.ok(
    snapshot.firstParagraphLineBottom <= snapshot.viewportHeight,
    JSON.stringify(snapshot),
  );
  assert.equal(snapshot.toolbarActionGroups, 0, JSON.stringify(snapshot));
  assert.ok(snapshot.scrollWidth <= snapshot.clientWidth, JSON.stringify(snapshot));
}

async function assertDenseResearchObjectReflow(cdp, origin) {
  await navigate(
    cdp,
    `${origin}${pagesBasePath}concept/90-research-roadmap/`,
  );
  await waitForExpression(
    cdp,
    `document.readyState === "complete"
      && document.querySelector('[data-research-object="focused-document"]')
      && document.querySelectorAll('.research-object-evidence a').length === 100`,
  );

  const collapsedCue = (await cdp.send("Runtime.evaluate", {
    expression: `getComputedStyle(
      document.querySelector('.research-object-evidence summary'),
      '::after',
    ).content`,
    returnByValue: true,
  })).result?.value;
  assert.equal(collapsedCue, '"Show"');

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('.research-object-evidence summary').click()`,
  });
  for (const width of [320, 375]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const snapshot = (await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const details = document.querySelector('.research-object-evidence');
        const summary = details.querySelector('summary');
        const links = [...details.querySelectorAll('a')];
        const root = document.documentElement;
        return {
          width: ${width},
          open: details.open,
          cue: getComputedStyle(summary, '::after').content,
          records: links.length,
          minimumTargetHeight: Math.min(...links.map((link) => link.getBoundingClientRect().height)),
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
        };
      })()`,
      returnByValue: true,
    })).result?.value;
    assert.equal(snapshot.width, width);
    assert.equal(snapshot.open, true);
    assert.equal(snapshot.cue, '"Hide"');
    assert.equal(snapshot.records, 100);
    assert.ok(snapshot.minimumTargetHeight >= 24, JSON.stringify(snapshot));
    assert.ok(snapshot.clientWidth <= width && snapshot.clientWidth >= width - 20, JSON.stringify(snapshot));
    assert.ok(snapshot.scrollWidth <= snapshot.clientWidth, JSON.stringify(snapshot));
  }
}

async function bookSnapshot(cdp) {
  return (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const cover = document.querySelector('.book-cover');
      const value = (label) => [...cover.querySelectorAll('dl > div')]
        .find((row) => row.querySelector('dt')?.textContent.trim() === label)
        ?.querySelector('dd')?.textContent.trim() ?? null;
      return {
        edition: value('Edition'),
        source: value('Source'),
        sourceHref: [...document.querySelectorAll('.book-actions a')]
          .find((link) => link.textContent.trim() === 'View source on GitHub')?.href ?? null,
        reportLocator: new URL([...document.querySelectorAll('.book-cover-support a')]
          .find((link) => link.textContent.trim() === 'Report this edition')?.href)
          .searchParams.get('location'),
      };
    })()`,
    returnByValue: true,
  })).result?.value;
}

async function assertContinuousBook(cdp, origin, edition) {
  await navigate(cdp, `${origin}${pagesBasePath}book/`);
  await waitForExpression(
    cdp,
    `document.readyState === "complete"
      && document.querySelector('.book-cover code')?.textContent === ${JSON.stringify(sourceRevision)}`,
  );
  const snapshot = await bookSnapshot(cdp);
  assert.equal(snapshot.edition, edition);
  assert.equal(snapshot.source, `Git main snapshot · commit ${sourceRevision}`);
  assert.equal(
    snapshot.sourceHref,
    `https://github.com/cordanaLLM/20-watts-was-enough/tree/${sourceRevision}`,
  );
  assert.equal(
    snapshot.reportLocator,
    [
      "Public route: https://www.cordana.dev/book/",
      `Edition: ${edition}`,
      `Source revision: ${sourceRevision}`,
    ].join("; "),
  );
  assert.doesNotMatch(snapshot.reportLocator, /[\r\n]/u);
}

async function assertReleaseBook(cdp, origin) {
  const releaseTag = `v${projectVersion}`;
  await navigate(
    cdp,
    `${origin}${pagesBasePath}book/?pdf=1&ref=${releaseTag}&revision=${sourceRevision}`,
  );
  await waitForExpression(
    cdp,
    `document.readyState === "complete"
      && [...document.querySelectorAll('.book-cover dt')]
        .some((node) => node.textContent.trim() === "Edition"
          && node.nextElementSibling?.textContent.trim() === ${JSON.stringify(`Release ${releaseTag} · immutable snapshot`)})`,
  );
  const releaseSnapshot = await bookSnapshot(cdp);
  assert.equal(releaseSnapshot.edition, `Release ${releaseTag} · immutable snapshot`);
  assert.equal(
    releaseSnapshot.source,
    `Immutable release tag ${releaseTag} · commit ${sourceRevision}`,
  );
  assert.equal(
    releaseSnapshot.sourceHref,
    `https://github.com/cordanaLLM/20-watts-was-enough/tree/${sourceRevision}`,
  );
  assert.equal(
    releaseSnapshot.reportLocator,
    [
      "Public route: https://www.cordana.dev/book/",
      `Edition: Release ${releaseTag} · immutable snapshot`,
      `Source revision: ${sourceRevision}`,
    ].join("; "),
  );
  assert.doesNotMatch(releaseSnapshot.reportLocator, /[\r\n]/u);
}

async function assertPublicBookIgnoresRendererQuery(cdp, origin, edition) {
  const releaseTag = `v${projectVersion}`;
  const spoofedRevision = "f".repeat(40);
  const spoofedOrigin = origin.replace("127.0.0.1", "spoofed.localhost");
  await navigate(
    cdp,
    `${spoofedOrigin}${pagesBasePath}book/?pdf=1&ref=${releaseTag}&revision=${spoofedRevision}`,
  );
  await waitForExpression(
    cdp,
    `location.hostname === "spoofed.localhost"
      && document.readyState === "complete"
      && [...document.querySelectorAll('.book-cover dt')]
        .some((node) => node.textContent.trim() === "Edition"
          && node.nextElementSibling?.textContent.trim() === ${JSON.stringify(edition)})`,
  );
  const publicSnapshot = await bookSnapshot(cdp);
  assert.equal(publicSnapshot.edition, edition);
  assert.equal(publicSnapshot.source, `Git main snapshot · commit ${sourceRevision}`);
  assert.equal(
    publicSnapshot.sourceHref,
    `https://github.com/cordanaLLM/20-watts-was-enough/tree/${sourceRevision}`,
  );
}

async function assertHydratedBook(cdp, origin) {
  const edition = `Site v${projectVersion} · continuous main snapshot`;
  await assertContinuousBook(cdp, origin, edition);
  await assertReleaseBook(cdp, origin);
  await assertPublicBookIgnoresRendererQuery(cdp, origin, edition);
}

test("hydrated research objects and the book preserve the static Pages identity", {
  timeout: 120_000,
}, async (t) => {
  const browser = await firstExistingChromium();
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "20w-object-parity-"));
  const profile = path.join(temporaryRoot, "chrome-profile");
  const previousSourceRevision = process.env.GITHUB_SHA;
  const previousPagesBasePath = process.env.PAGES_BASE_PATH;
  process.env.GITHUB_SHA = sourceRevision;
  process.env.PAGES_BASE_PATH = pagesBasePath;
  let vite;
  let browserProcess;
  let cdp;

  try {
    vite = await createViteServer({
      configFile: path.join(repositoryRoot, "vite.pages.config.ts"),
      configLoader: "runner",
      cacheDir: path.join(temporaryRoot, "vite-cache"),
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
    });
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.equal(typeof address, "object");
    const origin = `http://127.0.0.1:${address.port}`;

    browserProcess = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--no-proxy-server",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=375,844",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: "ignore", windowsHide: true });
    cdp = await connectCdp(
      await devtoolsPageFromProfile(browserProcess, profile, { signal: t.signal }),
      { signal: t.signal },
    );
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await pinMeasurementFonts(cdp);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });

    await assertHydratedResearchObject(cdp, origin);
    await assertFocusedDocumentEntry(cdp, origin);
    await assertDenseResearchObjectReflow(cdp, origin);
    await assertHydratedBook(cdp, origin);
  } finally {
    await settleCleanupSteps([
      async () => cdp?.socket.close(),
      async () => stopProcess(browserProcess),
      async () => vite?.close(),
      async () => rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
      async () => {
        if (previousSourceRevision === undefined) delete process.env.GITHUB_SHA;
        else process.env.GITHUB_SHA = previousSourceRevision;
        if (previousPagesBasePath === undefined) delete process.env.PAGES_BASE_PATH;
        else process.env.PAGES_BASE_PATH = previousPagesBasePath;
      },
    ]);
  }
});
