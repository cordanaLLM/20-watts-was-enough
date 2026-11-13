import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  alignedScrollTop, CAPTURE_STYLE, inspectLoadingDiagrams, intersectsViewport, isViewReady,
  readCapturePlan, SEO_FALLBACK_SELECTOR, settleDocumentTargets,
} from "./capture-visual-views.mjs";

const capture = { view: "reader", viewport: "mobile", require_visible_selector: "main" };
const visibleBox = { width: 20, height: 10, left: 0, top: 0, right: 20, bottom: 10 };
const loadingSelectors = [".diagram-loading", ".diagram-loading, pre > code.language-mermaid"];

function pageFixture(fragment, box = visibleBox) {
  const scrolled = [];
  const element = {
    scrollIntoView(options) {
      assert.deepEqual(options, { block: "center" });
      const box = element.getBoundingClientRect();
      const scroller = page.document.scrollingElement;
      page.scrollTo(0, Math.max(0, Math.min(box.top + scroller.scrollTop - (page.innerHeight - box.height) / 2,
        scroller.scrollHeight - page.innerHeight)));
    },
    getBoundingClientRect() {
      const scrollTop = page.document.scrollingElement.scrollTop;
      return { ...box, top: box.top - scrollTop, bottom: box.bottom - scrollTop };
    },
  };
  const page = {
    location: { hash: "#chapter%201" }, innerWidth: 100, innerHeight: 100,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 }, scrollY: 0,
    scrollTo(x, top) { scrolled.push([x, top]); page.document.scrollingElement.scrollTop = top; },
    requestAnimationFrame(callback) { callback(); },
    document: {
      scrollingElement: { scrollTop: 0, scrollHeight: 1000 },
      getElementById(id) { assert.equal(id, "chapter 1"); return fragment ? element : null; },
      querySelector(selector) { assert.equal(selector, ".diagram-error"); return null; },
      querySelectorAll(selector) {
        if (loadingSelectors.includes(selector)) return [];
        assert.equal(selector, "main");
        return [{ getBoundingClientRect: () => visibleBox }];
      },
    },
  };
  return { page, scrolled, element };
}

function layoutFixture({ before = true, box = visibleBox, onFrame = () => {} } = {}) {
  const fixture = pageFixture(true);
  const { page, element } = fixture;
  const state = { frames: 0, loading: true, documentTop: 200.25, error: null };
  const diagram = {
    compareDocumentPosition(target) { assert.equal(target, element); return before ? 4 : 2; },
    getBoundingClientRect() { return box; },
  };
  element.getBoundingClientRect = () => {
    const top = state.documentTop - page.document.scrollingElement.scrollTop;
    return { ...visibleBox, top, bottom: top + visibleBox.height };
  };
  page.requestAnimationFrame = (callback) => {
    state.frames += 1;
    onFrame(state, page);
    callback();
  };
  page.document.querySelector = () => state.error;
  const query = page.document.querySelectorAll;
  page.document.querySelectorAll = (selector) => loadingSelectors.includes(selector)
    ? (state.loading ? [diagram] : []) : query(selector);
  return { ...fixture, state };
}

function readyFixture({ fallback = false, ready = true, readyState = "complete", href = "https://example.test/chapter" } = {}) {
  return {
    location: { href },
    document: {
      readyState,
      querySelector(selector) {
        if (selector === SEO_FALLBACK_SELECTOR) return fallback ? {} : null;
        assert.equal(selector, ".prose ol");
        return ready ? {} : null;
      },
    },
  };
}

test("ready selector in SEO fallback cannot satisfy capture readiness", () => {
  assert.equal(isViewReady("https://example.test/chapter", ".prose ol", SEO_FALLBACK_SELECTOR,
    readyFixture({ fallback: true })), false);
});

test("mounted SPA with complete matching navigation satisfies readiness", () => {
  assert.equal(isViewReady("https://example.test/chapter", ".prose ol", SEO_FALLBACK_SELECTOR, readyFixture()), true);
});

test("interactive document cannot satisfy capture readiness", () => {
  assert.equal(isViewReady("https://example.test/chapter", ".prose ol", SEO_FALLBACK_SELECTOR,
    readyFixture({ readyState: "interactive" })), false);
});

test("href mismatch cannot satisfy capture readiness", () => {
  assert.equal(isViewReady("https://example.test/chapter", ".prose ol", SEO_FALLBACK_SELECTOR,
    readyFixture({ href: "https://example.test/other" })), false);
});

test("missing ready selector cannot satisfy capture readiness", () => {
  assert.equal(isViewReady("https://example.test/chapter", ".prose ol", SEO_FALLBACK_SELECTOR,
    readyFixture({ ready: false })), false);
});

test("unrendered Mermaid source counts as a loading diagram", () => {
  const { page, element } = pageFixture(true);
  page.document.querySelectorAll = selector => selector.includes("pre > code.language-mermaid")
    ? [{ getBoundingClientRect: () => visibleBox, compareDocumentPosition: () => 4 }] : [];
  assert.equal(inspectLoadingDiagrams(element, intersectsViewport, page, "reader/mobile"), 1);
});

test("rendered diagrams without raw Mermaid source do not block", () => {
  const { page, element } = pageFixture(true);
  assert.equal(inspectLoadingDiagrams(element, intersectsViewport, page, "reader/mobile"), 0);
});

test("measured layouts request the same integer scroll alignment", () => {
  for (const [top, scrollY] of [[449.938, 10236], [450.938, 10235]]) {
    assert.equal(alignedScrollTop({ top, height: 22.094 }, scrollY, 844, 18512), 10275);
  }
});

test("settling applies integer alignment to both measured portal layouts", async () => {
  for (const scrollTop of [10236, 10235]) {
    const { page, state, element } = layoutFixture();
    state.loading = false;
    page.innerHeight = 844;
    page.document.scrollingElement = { scrollTop, scrollHeight: 18512 };
    element.getBoundingClientRect = () => {
      const top = 10685.938 - page.document.scrollingElement.scrollTop;
      return { ...visibleBox, top, height: 22.094, bottom: top + 22.094 };
    };
    await settleDocumentTargets(capture, intersectsViewport, page);
    assert.equal(page.document.scrollingElement.scrollTop, 10275);
  }
});

test("scroll alignment clamps at the start, end and a short document", () => {
  assert.equal(alignedScrollTop({ top: 10.4, height: 22.094 }, 0, 844, 18512), 0);
  assert.equal(alignedScrollTop({ top: 18500.4, height: 22.094 }, 0, 844, 18512), 17668);
  assert.equal(alignedScrollTop({ top: 100, height: 10 }, 0, 844, 500), 0);
});

test("capture style disables scroll anchoring", () => {
  assert.match(CAPTURE_STYLE, /overflow-anchor:\s*none\s*!important/u);
});

test("settling rejects a fractional final scroll offset when scrollTo is ignored", async () => {
  const { page, state } = layoutFixture();
  state.loading = false;
  page.document.scrollingElement.scrollTop = 155.25;
  page.scrollTo = () => {};
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page),
    /reader\/mobile.*fragment #chapter 1.*expected 155, actual 155.25/u);
});

test("settling rejects a different integer final scroll offset when scrollTo is ignored", async () => {
  const { page, state } = layoutFixture();
  state.loading = false;
  page.document.scrollingElement.scrollTop = 154;
  page.scrollTo = () => {};
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page),
    /reader\/mobile.*fragment #chapter 1.*expected 155, actual 154/u);
});

test("missing fragment fails despite another visible selector", async () => {
  const { page } = pageFixture(false);
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*chapter 1.*missing/u);
});

test("present fragment scrolls and intersects the viewport", async () => {
  const { page, scrolled } = pageFixture(true);
  await settleDocumentTargets(capture, intersectsViewport, page);
  assert.deepEqual(scrolled, [[0, 0], [0, 0]]);
});

test("offscreen fragment fails despite another visible selector", async () => {
  const { page } = pageFixture(true, { ...visibleBox, left: 100, right: 120 });
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*chapter 1.*viewport/u);
});

test("empty fragment retains selector checks", async () => {
  const { page } = pageFixture(false);
  page.location.hash = "";
  await settleDocumentTargets(capture, intersectsViewport, page);
  page.document.querySelectorAll = () => [];
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /no visible match/u);
});

test("viewport intersection excludes zero size and touching edges", () => {
  assert.equal(intersectsViewport(visibleBox, 100, 100), true);
  for (const change of [{ width: 0 }, { height: 0 }, { right: 0 }, { bottom: 0 }, { left: 100 }, { top: 100 }]) {
    assert.equal(intersectsViewport({ ...visibleBox, ...change }, 100, 100), false);
  }
  assert.equal(intersectsViewport({ ...visibleBox, left: -1, top: -1 }, 100, 100), true);
});

test("diagram above fragment finishes before consecutive stable layout samples", async () => {
  const { page, state, scrolled, element } = layoutFixture({
    box: { ...visibleBox, top: -30, bottom: -20 },
    onFrame(state) {
      if (state.frames === 6) {
        state.loading = false;
        state.documentTop += 100.5;
      }
    },
  });
  await settleDocumentTargets(capture, intersectsViewport, page);
  assert.equal(state.loading, false);
  assert.equal(state.frames, 10);
  assert.equal(element.getBoundingClientRect().top, 44.75);
  assert.equal(page.document.scrollingElement.scrollTop, 256);
  assert.ok(scrolled.length >= 2);
});

test("diagram error fails immediately with view, viewport and bounded text", async () => {
  const { page, state } = layoutFixture();
  state.error = { textContent: `Mermaid failed: ${"x".repeat(240)}TAIL` };
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), (error) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes("reader/mobile"));
    assert.ok(error.message.endsWith(state.error.textContent.slice(0, 200)));
    assert.ok(!error.message.includes("TAIL"));
    return true;
  });
  assert.equal(state.frames, 0);
});

test("layout movement triggers a re-scroll and two fresh stable samples", async () => {
  const { page, state, scrolled, element } = layoutFixture({
    onFrame(state) {
      if (state.frames === 2) state.documentTop += 0.25;
      if (state.frames === 4) state.documentTop += 0.5;
    },
  });
  state.loading = false;
  await settleDocumentTargets(capture, intersectsViewport, page);
  assert.equal(state.frames, 8);
  assert.equal(scrolled.length, 4);
  assert.equal(element.getBoundingClientRect().top, 45);
  assert.equal(page.document.scrollingElement.scrollTop, 156);
});

test("diagram error appearing during settling fails with its text", async () => {
  const { page, state } = layoutFixture({
    onFrame(state) { if (state.frames === 2) state.error = { textContent: "late render error" }; },
  });
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*late render error/u);
  assert.equal(state.frames, 2);
});

test("target position drift exhausts the scalar sample bound", async () => {
  const { page, state } = layoutFixture({ onFrame(state) { state.documentTop += 0.25; } });
  state.loading = false;
  page.scrollTo = () => {};
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*500 samples.*"top":450.25.*"scrollTop":0/u);
  assert.equal(state.frames, 1000);
});

test("scroll drift alone exhausts the bound even with a stable target top", async () => {
  const { page, state, element } = layoutFixture({
    onFrame(state, page) { page.document.scrollingElement.scrollTop += 0.25; },
  });
  state.loading = false;
  element.getBoundingClientRect = () => visibleBox;
  page.scrollTo = () => {};
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*500 samples.*"top":0.*"scrollTop":250/u);
  assert.equal(state.frames, 1000);
});

test("loading diagram above the fragment never finishes and fails at the bound", async () => {
  const { page, state } = layoutFixture({ box: { ...visibleBox, top: -30, bottom: -20 } });
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*500 samples.*"loading":1/u);
  assert.equal(state.frames, 1000);
});

test("loading diagram below viewport and after fragment does not block", async () => {
  const { page, state } = layoutFixture({ before: false, box: { ...visibleBox, top: 100, bottom: 110 } });
  await settleDocumentTargets(capture, intersectsViewport, page);
  assert.equal(state.loading, true);
  assert.equal(state.frames, 4);
});

test("visible loading diagram after fragment still blocks", async () => {
  const { page, state } = layoutFixture({ before: false });
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*"loading":1/u);
  assert.equal(state.frames, 1000);
});

test("no-fragment view ignores offscreen loading diagrams on either side", async () => {
  for (const top of [-10, 100]) {
    const { page, state } = layoutFixture({ box: { ...visibleBox, top, bottom: top + 10 } });
    page.location.hash = "";
    await settleDocumentTargets(capture, intersectsViewport, page);
    assert.equal(state.loading, true);
    assert.equal(state.frames, 4);
  }
});

test("no-fragment view waits for visible loading diagrams", async () => {
  const { page, state } = layoutFixture({ onFrame(state) { if (state.frames === 6) state.loading = false; } });
  page.location.hash = "";
  await settleDocumentTargets(capture, intersectsViewport, page);
  assert.equal(state.loading, false);
  assert.equal(state.frames, 10);
});

test("scrollY supplies the layout sample when scrollingElement is absent", async () => {
  const { page, state } = layoutFixture({
    onFrame(state, page) { page.scrollY += 0.25; },
  });
  page.location.hash = "";
  page.document.scrollingElement = null;
  state.loading = false;
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*500 samples.*"top":null.*"scrollTop":250/u);
  assert.equal(state.frames, 1000);
});

test("loading diagram traversal rejects more than 10000 nodes before sampling", async () => {
  const { page, state } = layoutFixture();
  page.document.querySelectorAll = () => Array(10001).fill({
    compareDocumentPosition: () => 2,
    getBoundingClientRect: () => ({ ...visibleBox, top: 100, bottom: 110 }),
  });
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*loading diagrams exceed 10000/u);
  assert.equal(state.frames, 0);
});


test("capture plan reuses a bounded opened-file reader", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "visual-plan-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "plan.json");
  const plan = { schema: 1, captures: [{}] };
  await writeFile(file, JSON.stringify(plan));
  assert.deepEqual(await readCapturePlan(file), plan);
  const link = path.join(directory, "linked.json");
  await symlink(file, link);
  await assert.rejects(readCapturePlan(link), /linked/u);
  await writeFile(file, " ".repeat(128 * 1024 + 1));
  await assert.rejects(readCapturePlan(file), /limit/u);
});
