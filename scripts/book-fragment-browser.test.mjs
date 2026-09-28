import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { bookDocumentId } from "../app/lib/book-document-id.mjs";
import {
  connectCdp,
  devtoolsPageFromProfile,
  firstExistingChromium,
  settleCleanupSteps,
  stopProcess,
} from "./lib/chromium-cdp.mjs";
import { bookSourceDocuments } from "./lib/portal-documents.mjs";
import { renderBookFallback } from "./lib/pages-seo.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectVersion = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
).version;
const bookDocuments = bookSourceDocuments(repositoryRoot);
const bookDocumentIds = bookDocuments.map((document) => bookDocumentId(document.path));
const bookStylesheet = (await readFile(
  path.join(repositoryRoot, "app/globals.css"),
  "utf8",
)).replace(/^@import "tailwindcss";\s*/u, "");
const coldTarget =
  "book-concept-07-cross-domain-convergence-md--candidate-production-is-not-acceptance";
const navigationSource =
  "book-math-visual-models-md--sparselocality-break-even-plane";
const hashTarget = "book-concept-80-energy-model-md--data-movement-ledger";
const pagesBasePath = "/20-watts-was-enough/";
const viewports = Object.freeze([
  { label: "desktop", width: 1440, height: 900, minimumClearance: 8 },
  { label: "mobile", width: 375, height: 844, minimumClearance: 20 },
]);

async function fragmentSnapshot(cdp, targetId) {
  return (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const target = document.getElementById(${JSON.stringify(targetId)});
      const actions = document.querySelector(".book-actions");
      const targetRect = target?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const actionsPosition = actions ? getComputedStyle(actions).position : null;
      const obstructionBottom = actionsPosition === "sticky"
        ? Math.max(0, actionsRect?.bottom ?? 0)
        : 0;
      return {
        actionsBottom: actionsRect?.bottom ?? null,
        actionsPosition,
        hash: location.hash,
        readyState: document.readyState,
        scrollMarginTop: target ? parseFloat(getComputedStyle(target).scrollMarginTop) : null,
        scrollY,
        tagName: target?.tagName ?? null,
        targetBottom: targetRect?.bottom ?? null,
        targetText: target?.textContent?.trim() ?? null,
        targetTop: targetRect?.top ?? null,
        obstructionBottom,
        pathname: location.pathname,
        search: location.search,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
      };
    })()`,
    returnByValue: true,
  })).result?.value;
}

// Cold hydration can block each Runtime.evaluate for seconds. A single
// deadline for loading and settling let a heading that became visible late run
// out of time before its stability count finished (#142). The load deadline
// therefore covers only the first visible observation; stability is then a
// count of consecutive unmoved observations with its own scalar bound.
const fragmentWaitPolicy = Object.freeze({
  intervalMs: 100,
  readyTimeoutMs: 30_000,
  requiredStableObservations: 5,
  stableObservationLimit: 50,
});
const systemClock = Object.freeze({
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

function isVisibleFragment(snapshot, targetId) {
  return snapshot?.readyState === "complete"
    && snapshot.hash === `#${targetId}`
    && /^H[1-6]$/u.test(snapshot.tagName ?? "")
    && snapshot.targetBottom > 0
    && snapshot.targetTop >= snapshot.obstructionBottom
    && snapshot.targetTop < snapshot.viewportHeight;
}

function isUnmovedFragment(snapshot, previous) {
  return previous !== undefined && previous !== null
    && Math.abs(snapshot.targetTop - previous.targetTop) < 0.5
    && Math.abs(snapshot.scrollY - previous.scrollY) < 0.5;
}

async function firstVisibleObservation(observer, clock, policy) {
  const deadline = clock.now() + policy.readyTimeoutMs;
  let snapshot;
  while (clock.now() < deadline) {
    snapshot = await observer.sample();
    if (observer.accepts(snapshot)) return { accepted: true, snapshot };
    await clock.sleep(policy.intervalMs);
  }
  return { accepted: false, snapshot };
}

async function stableVisibleObservation(observer, clock, policy, first) {
  let previous = first;
  let stableObservations = 0;
  for (let observation = 0; observation < policy.stableObservationLimit; observation += 1) {
    await clock.sleep(policy.intervalMs);
    const snapshot = await observer.sample();
    const stable = observer.accepts(snapshot) && observer.unmoved(snapshot, previous);
    stableObservations = stable ? stableObservations + 1 : 0;
    previous = snapshot;
    if (stableObservations >= policy.requiredStableObservations) {
      return { accepted: true, snapshot };
    }
  }
  return { accepted: false, snapshot: previous };
}

async function observeStableVisibility(observer, clock = systemClock, policy = fragmentWaitPolicy) {
  const ready = await firstVisibleObservation(observer, clock, policy);
  if (!ready.accepted) return { ...ready, phase: "visibility" };
  const settled = await stableVisibleObservation(observer, clock, policy, ready.snapshot);
  return { ...settled, phase: "stability" };
}

async function waitForVisibleFragment(cdp, targetId) {
  const result = await observeStableVisibility({
    sample: () => fragmentSnapshot(cdp, targetId),
    accepts: (snapshot) => isVisibleFragment(snapshot, targetId),
    unmoved: isUnmovedFragment,
  });
  if (result.accepted) return result.snapshot;
  const failure = result.phase === "visibility"
    ? `Fragment did not become visible within ${fragmentWaitPolicy.readyTimeoutMs} ms`
    : `Fragment did not stay visible and unmoved for ${fragmentWaitPolicy.requiredStableObservations} `
      + `consecutive observations within ${fragmentWaitPolicy.stableObservationLimit} `
      + "observations after it first became visible";
  assert.fail(`${failure}: ${JSON.stringify(result.snapshot)}`);
}

function assertFragmentClearance(snapshot, viewport, mode) {
  assert.equal(snapshot.viewportWidth, viewport.width, JSON.stringify(snapshot));
  assert.ok(snapshot.targetText, `${mode}: missing target text`);
  assert.ok(
    snapshot.targetTop >= snapshot.obstructionBottom + viewport.minimumClearance,
    `${mode}: heading is not clear of the action bar: ${JSON.stringify(snapshot)}`,
  );
  assert.ok(
    snapshot.targetBottom > 0 && snapshot.targetTop < snapshot.viewportHeight,
    `${mode}: heading is outside the viewport: ${JSON.stringify(snapshot)}`,
  );
  assert.ok(
    snapshot.scrollMarginTop >= viewport.minimumClearance,
    `${mode}: heading lacks fragment clearance: ${JSON.stringify(snapshot)}`,
  );
}

function assertFragmentLocation(snapshot, viewport) {
  assert.equal(snapshot.pathname, `${pagesBasePath}book/`, JSON.stringify(snapshot));
  assert.equal(snapshot.search, `?fragment-test=${viewport.label}`, JSON.stringify(snapshot));
}

async function retainFragmentEvidence(cdp, label, snapshot) {
  const outputRoot = process.env.BOOK_FRAGMENT_EVIDENCE_DIR?.trim();
  if (!outputRoot) return;
  await mkdir(outputRoot, { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true,
  });
  await Promise.all([
    writeFile(
      path.join(outputRoot, `${label}.png`),
      Buffer.from(screenshot.data, "base64"),
      { flag: "wx" },
    ),
    writeFile(
      path.join(outputRoot, `${label}.json`),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      { flag: "wx" },
    ),
  ]);
}

async function navigate(cdp, url) {
  const navigation = await cdp.send("Page.navigate", { url });
  assert.equal(navigation.errorText, undefined);
}

async function evaluateInBrowser(cdp, expression) {
  const evaluation = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  if (evaluation.exceptionDetails) {
    assert.fail(`Browser evaluation failed: ${JSON.stringify(evaluation.exceptionDetails)}`);
  }
  return evaluation.result?.value;
}

async function waitForBrowserState(cdp, expression, accepts, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  while (Date.now() < deadline) {
    snapshot = await evaluateInBrowser(cdp, expression);
    if (accepts(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${label}: ${JSON.stringify(snapshot)}`);
}

async function pressKey(cdp, key, code, windowsVirtualKeyCode) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode,
  });
}

const semanticSnapshotExpression = `(() => {
  const documentSections = [...document.querySelectorAll(
    ".book-document:not(.book-readiness-frontmatter)",
  )];
  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  const hashLinks = [...document.querySelectorAll('a[href^="#"]')]
    .map((link) => link.getAttribute("href").slice(1));
  const tabbable = [...document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
  const tables = [...document.querySelectorAll(".book-prose .table-region")];
  return {
    chapterH2Count: document.querySelectorAll(
      ".book-document:not(.book-readiness-frontmatter) > .book-prose > h2:first-child",
    ).length,
    documentIds: documentSections.map((section) => section.id),
    duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
    firstInteractiveClass: tabbable[0]?.className ?? null,
    firstInteractiveText: tabbable[0]?.textContent?.trim() ?? null,
    h1Count: document.querySelectorAll("h1").length,
    readyState: document.readyState,
    tableContractMismatches: tables.filter((region) => {
      const overflows = region.scrollWidth > region.clientWidth + 1;
      return (region.tabIndex === 0) !== overflows
        || (region.getAttribute("role") === "region") !== overflows
        || region.hasAttribute("aria-label") !== overflows;
    }).length,
    tableCount: tables.length,
    unresolvedFragments: hashLinks.filter((id) => !document.getElementById(id)),
  };
})()`;

function assertHydratedSemantics(semantics) {
  assert.equal(semantics.h1Count, 1, JSON.stringify(semantics));
  assert.equal(semantics.chapterH2Count, 51, JSON.stringify(semantics));
  assert.deepEqual(semantics.documentIds, bookDocumentIds);
  assert.deepEqual(semantics.duplicateIds, []);
  assert.deepEqual(semantics.unresolvedFragments, []);
  assert.equal(semantics.firstInteractiveClass, "portal-skip-link");
  assert.equal(semantics.firstInteractiveText, "Skip to first chapter");
  assert.ok(semantics.tableCount > 0, JSON.stringify(semantics));
  assert.equal(semantics.tableContractMismatches, 0, JSON.stringify(semantics));
}

async function exerciseHydratedKeyboard(cdp, bookUrl) {
  await navigate(cdp, "about:blank");
  await navigate(cdp, bookUrl);
  await waitForBrowserState(
    cdp,
    semanticSnapshotExpression,
    (snapshot) => snapshot.readyState === "complete"
      && snapshot.documentIds.length === bookDocumentIds.length,
    "book did not settle before keyboard navigation",
  );
  await pressKey(cdp, "Tab", "Tab", 9);
  const skipFocus = await evaluateInBrowser(cdp, `(() => ({
    className: document.activeElement?.className ?? null,
    href: document.activeElement?.getAttribute("href") ?? null,
    text: document.activeElement?.textContent?.trim() ?? null,
  }))()`);
  assert.deepEqual(skipFocus, {
    className: "portal-skip-link",
    href: `#${bookDocumentIds[0]}`,
    text: "Skip to first chapter",
  });
  await pressKey(cdp, "Enter", "Enter", 13);
  await waitForBrowserState(
    cdp,
    `location.hash === "#${bookDocumentIds[0]}"`,
    Boolean,
    "skip link did not navigate to the first chapter",
  );
  await pressKey(cdp, "Tab", "Tab", 9);
  const continuation = await evaluateInBrowser(cdp, `(() => ({
    activeTag: document.activeElement?.tagName ?? null,
    sectionId: document.activeElement?.closest(".book-document")?.id ?? null,
  }))()`);
  assert.equal(continuation.sectionId, bookDocumentIds[0], JSON.stringify(continuation));
  assert.equal(continuation.activeTag, "A", JSON.stringify(continuation));
}

async function exerciseHydratedViewport(cdp, address, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 760,
  });

  const bookUrl = `http://127.0.0.1:${address.port}${pagesBasePath}book/?fragment-test=${viewport.label}`;
  await navigate(cdp, "about:blank");
  await navigate(cdp, `${bookUrl}#${coldTarget}`);
  const coldSnapshot = await waitForVisibleFragment(cdp, coldTarget);
  assertFragmentClearance(coldSnapshot, viewport, `${viewport.label} cold load`);
  assertFragmentLocation(coldSnapshot, viewport);
  await retainFragmentEvidence(cdp, `${viewport.label}-cold`, coldSnapshot);

  await navigate(cdp, `${bookUrl}#${navigationSource}`);
  await waitForVisibleFragment(cdp, navigationSource);
  const click = await evaluateInBrowser(cdp, `(() => {
    const link = document.querySelector('a[href="#${hashTarget}"]');
    const href = link?.getAttribute("href") ?? null;
    link?.click();
    return { found: Boolean(link), href };
  })()`);
  assert.deepEqual(click, { found: true, href: `#${hashTarget}` });
  const hashSnapshot = await waitForVisibleFragment(cdp, hashTarget);
  assertFragmentClearance(hashSnapshot, viewport, `${viewport.label} hash navigation`);
  assertFragmentLocation(hashSnapshot, viewport);
  await retainFragmentEvidence(cdp, `${viewport.label}-hash`, hashSnapshot);

  const semantics = await waitForBrowserState(
    cdp,
    semanticSnapshotExpression,
    (snapshot) => snapshot.readyState === "complete"
      && snapshot.documentIds.length === bookDocumentIds.length
      && snapshot.chapterH2Count === bookDocumentIds.length,
    `${viewport.label} book semantics did not settle`,
  );
  assertHydratedSemantics(semantics);
  if (viewport.label === "mobile") await exerciseHydratedKeyboard(cdp, bookUrl);
}

async function installStaticBook(cdp) {
  await navigate(cdp, "about:blank");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const frameTree = await cdp.send("Page.getFrameTree");
  await cdp.send("Page.setDocumentContent", {
    frameId: frameTree.frameTree.frame.id,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${bookStylesheet}</style></head><body>${renderBookFallback(bookDocuments, pagesBasePath, { editionVersion: projectVersion })}</body></html>`,
  });
}

const staticSemanticSnapshotExpression = `(() => {
  const sections = [...document.querySelectorAll(".seo-static-page > section[id^=book-]")];
  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  const fragments = [...document.querySelectorAll('a[href^="#"]')]
    .map((link) => link.getAttribute("href").slice(1));
  const tabbable = [...document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
  const tables = [...document.querySelectorAll(".table-region")];
  const overflowingTables = tables.filter(
    (region) => region.scrollWidth > region.clientWidth + 1,
  );
  return {
    chapterH2Count: document.querySelectorAll(
      ".seo-static-page > section[id^=book-] > header > h2",
    ).length,
    documentIds: sections.map((section) => section.id),
    duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
    firstInteractiveClass: tabbable[0]?.className ?? null,
    firstInteractiveText: tabbable[0]?.textContent?.trim() ?? null,
    h1Count: document.querySelectorAll("h1").length,
    overflowingTableCount: overflowingTables.length,
    readyState: document.readyState,
    tableCount: tables.length,
    tableFallbackMismatches: tables.filter((region) => (
      region.getAttribute("role") !== "region"
        || region.getAttribute("tabindex") !== "0"
        || !region.getAttribute("aria-label")?.includes("use arrow keys to scroll when needed")
    )).length,
    unresolvedFragments: fragments.filter((id) => !document.getElementById(id)),
  };
})()`;

function assertStaticSemantics(semantics) {
  assert.equal(semantics.h1Count, 1, JSON.stringify(semantics));
  assert.equal(semantics.chapterH2Count, 51, JSON.stringify(semantics));
  assert.deepEqual(semantics.documentIds, bookDocumentIds);
  assert.deepEqual(semantics.duplicateIds, []);
  assert.deepEqual(semantics.unresolvedFragments, []);
  assert.equal(semantics.firstInteractiveClass, "portal-skip-link");
  assert.equal(semantics.firstInteractiveText, "Skip to first chapter");
  assert.ok(semantics.tableCount > 0, JSON.stringify(semantics));
  assert.ok(semantics.overflowingTableCount > 0, JSON.stringify(semantics));
  assert.equal(semantics.tableFallbackMismatches, 0, JSON.stringify(semantics));
}

async function exerciseStaticNavigation(cdp) {
  await pressKey(cdp, "Tab", "Tab", 9);
  const staticSkipFocus = await evaluateInBrowser(cdp, `(() => ({
    className: document.activeElement?.className ?? null,
    href: document.activeElement?.getAttribute("href") ?? null,
  }))()`);
  assert.deepEqual(staticSkipFocus, {
    className: "portal-skip-link",
    href: `#${bookDocumentIds[0]}`,
  });
  await pressKey(cdp, "Enter", "Enter", 13);
  await waitForBrowserState(
    cdp,
    `location.hash === "#${bookDocumentIds[0]}"`,
    Boolean,
    "no-JavaScript skip link did not navigate to the first chapter",
  );
  await pressKey(cdp, "Tab", "Tab", 9);
  const continuation = await evaluateInBrowser(cdp, `(() => ({
    activeTag: document.activeElement?.tagName ?? null,
    sectionId: document.activeElement?.closest("section[id^=book-]")?.id ?? null,
  }))()`);
  assert.equal(continuation.sectionId, bookDocumentIds[0], JSON.stringify(continuation));
  assert.equal(continuation.activeTag, "A", JSON.stringify(continuation));
}

async function exerciseStaticTable(cdp) {
  const overflowProbe = await evaluateInBrowser(cdp, `(() => {
    const region = [...document.querySelectorAll(".table-region")].find(
      (candidate) => candidate.scrollWidth > candidate.clientWidth + 1,
    );
    if (!region) return null;
    region.dataset.keyboardScrollProbe = "true";
    region.scrollLeft = 0;
    region.focus({ preventScroll: true });
    return {
      ariaLabel: region.getAttribute("aria-label"),
      clientWidth: region.clientWidth,
      focused: document.activeElement === region,
      role: region.getAttribute("role"),
      scrollLeft: region.scrollLeft,
      scrollWidth: region.scrollWidth,
      tabIndex: region.getAttribute("tabindex"),
    };
  })()`);
  assert.ok(overflowProbe, "no overflowing no-JavaScript table was available for keyboard testing");
  assert.equal(overflowProbe.focused, true, JSON.stringify(overflowProbe));
  assert.equal(overflowProbe.role, "region", JSON.stringify(overflowProbe));
  assert.equal(overflowProbe.tabIndex, "0", JSON.stringify(overflowProbe));
  assert.match(overflowProbe.ariaLabel, /use arrow keys to scroll when needed/u);
  assert.ok(overflowProbe.scrollWidth > overflowProbe.clientWidth, JSON.stringify(overflowProbe));
  await pressKey(cdp, "ArrowRight", "ArrowRight", 39);
  const scrollLeft = await waitForBrowserState(
    cdp,
    `document.querySelector('[data-keyboard-scroll-probe="true"]')?.scrollLeft ?? 0`,
    (value) => value > 0,
    "focused no-JavaScript table did not scroll with ArrowRight",
  );
  assert.ok(scrollLeft > 0);
}

async function exerciseStaticBook(cdp) {
  await installStaticBook(cdp);
  const semantics = await waitForBrowserState(
    cdp,
    staticSemanticSnapshotExpression,
    (snapshot) => snapshot.readyState === "complete"
      && snapshot.documentIds.length === bookDocumentIds.length,
    "no-JavaScript fallback did not settle",
  );
  assertStaticSemantics(semantics);
  await exerciseStaticNavigation(cdp);
  await exerciseStaticTable(cdp);
}

function fragmentAt(scrollY, overrides = {}) {
  return {
    hash: `#${coldTarget}`,
    obstructionBottom: 76,
    readyState: "complete",
    scrollY,
    tagName: "H4",
    targetBottom: 117,
    targetTop: 96,
    viewportHeight: 900,
    ...overrides,
  };
}

const hydratingFragment = fragmentAt(0, {
  readyState: "interactive",
  tagName: null,
  targetBottom: null,
  targetTop: null,
});

function scriptedFragmentObservation(snapshots, sampleCostsMs = []) {
  let now = 0;
  let samples = 0;
  const clock = {
    now: () => now,
    sleep: async (milliseconds) => { now += milliseconds; },
  };
  const observer = {
    sample: async () => {
      now += sampleCostsMs[samples] ?? 0;
      samples += 1;
      return snapshots[Math.min(samples, snapshots.length) - 1];
    },
    accepts: (snapshot) => isVisibleFragment(snapshot, coldTarget),
    unmoved: isUnmovedFragment,
  };
  return { clock, observer, elapsedMs: () => now, samples: () => samples };
}

function movingThenSettled(movingObservations) {
  const moving = Array.from({ length: movingObservations + 1 }, (_, index) => fragmentAt(index));
  return [...moving, ...Array(5).fill(fragmentAt(movingObservations))];
}

test("fragment visibility accepts heading geometry exactly at the documented bounds", () => {
  assert.equal(isVisibleFragment(fragmentAt(0, { targetTop: 76 }), coldTarget), true);
  assert.equal(isVisibleFragment(fragmentAt(0, { targetTop: 899.9 }), coldTarget), true);
  assert.equal(isVisibleFragment(fragmentAt(0, { targetTop: 75.9 }), coldTarget), false);
  assert.equal(isVisibleFragment(fragmentAt(0, { targetTop: 900 }), coldTarget), false);
  assert.equal(isVisibleFragment(fragmentAt(0, { targetBottom: 0 }), coldTarget), false);
  assert.equal(isVisibleFragment(fragmentAt(0, { tagName: "P" }), coldTarget), false);
  assert.equal(isVisibleFragment(fragmentAt(0, { hash: `#${hashTarget}` }), coldTarget), false);
  assert.equal(isVisibleFragment(fragmentAt(0, { readyState: "interactive" }), coldTarget), false);
  assert.equal(isVisibleFragment(hydratingFragment, coldTarget), false);
  assert.equal(isVisibleFragment(undefined, coldTarget), false);
  assert.equal(isUnmovedFragment(fragmentAt(0.49, { targetTop: 96.49 }), fragmentAt(0)), true);
  assert.equal(isUnmovedFragment(fragmentAt(0.5), fragmentAt(0)), false);
  assert.equal(isUnmovedFragment(fragmentAt(0, { targetTop: 96.5 }), fragmentAt(0)), false);
  assert.equal(isUnmovedFragment(fragmentAt(0), undefined), false);
});

test("fragment stability is counted after a slow cold load reaches the heading", async () => {
  const run = scriptedFragmentObservation(
    [hydratingFragment, ...Array(6).fill(fragmentAt(22_532))],
    [20_000, 9_850],
  );
  const result = await observeStableVisibility(run.observer, run.clock);

  assert.deepEqual(result, { accepted: true, phase: "stability", snapshot: fragmentAt(22_532) });
  assert.equal(run.samples(), 7);
  assert.ok(run.elapsedMs() > fragmentWaitPolicy.readyTimeoutMs, `${run.elapsedMs()} ms`);
});

test("fragment stability needs consecutive unmoved observations within its limit", async () => {
  const limit = fragmentWaitPolicy.stableObservationLimit;
  const lastChance = scriptedFragmentObservation(movingThenSettled(limit - 5));
  const settled = await observeStableVisibility(lastChance.observer, lastChance.clock);
  assert.equal(settled.accepted, true);
  assert.equal(lastChance.samples(), limit + 1);

  const tooLate = scriptedFragmentObservation(movingThenSettled(limit - 4));
  const drifting = await observeStableVisibility(tooLate.observer, tooLate.clock);
  assert.equal(drifting.accepted, false);
  assert.equal(drifting.phase, "stability");
  assert.equal(tooLate.samples(), limit + 1);

  const obscured = fragmentAt(10, { targetTop: 70 });
  const interrupted = scriptedFragmentObservation([
    ...Array(5).fill(fragmentAt(10)),
    obscured,
    ...Array(6).fill(fragmentAt(10)),
  ]);
  assert.equal((await observeStableVisibility(interrupted.observer, interrupted.clock)).accepted, true);
  assert.equal(interrupted.samples(), 12);

  const unanswered = scriptedFragmentObservation([
    fragmentAt(10),
    undefined,
    ...Array(6).fill(fragmentAt(10)),
  ]);
  assert.equal((await observeStableVisibility(unanswered.observer, unanswered.clock)).accepted, true);
  assert.equal(unanswered.samples(), 8);
});

test("fragment visibility fails at the load deadline when the heading never appears", async () => {
  const run = scriptedFragmentObservation([hydratingFragment]);
  const result = await observeStableVisibility(run.observer, run.clock);

  assert.deepEqual(result, { accepted: false, phase: "visibility", snapshot: hydratingFragment });
  assert.equal(
    run.samples(),
    fragmentWaitPolicy.readyTimeoutMs / fragmentWaitPolicy.intervalMs,
  );
});

test("the full book preserves fragment, semantic, and keyboard contracts", {
  timeout: 120_000,
}, async (t) => {
  const browser = await firstExistingChromium();
  const profile = await mkdtemp(path.join(os.tmpdir(), "20w-book-fragment-"));
  const previousPagesBasePath = process.env.PAGES_BASE_PATH;
  process.env.PAGES_BASE_PATH = pagesBasePath;
  let vite;
  let browserProcess;
  let cdp;

  try {
    vite = await createViteServer({
      configFile: path.join(repositoryRoot, "vite.pages.config.ts"),
      configLoader: "runner",
      cacheDir: path.join(profile, "vite-cache"),
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
    });
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.equal(typeof address, "object");
    browserProcess = spawn(browser, [
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
      "--window-size=1440,900",
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

    for (const viewport of viewports) {
      await exerciseHydratedViewport(cdp, address, viewport);
    }
    await exerciseStaticBook(cdp);
  } finally {
    await settleCleanupSteps([
      async () => cdp?.socket.close(),
      async () => stopProcess(browserProcess),
      async () => vite?.close(),
      async () => rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
      async () => {
        if (previousPagesBasePath === undefined) delete process.env.PAGES_BASE_PATH;
        else process.env.PAGES_BASE_PATH = previousPagesBasePath;
      },
    ]);
  }
});
