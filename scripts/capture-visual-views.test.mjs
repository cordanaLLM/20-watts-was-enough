import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { intersectsViewport, readCapturePlan, settleDocumentTargets } from "./capture-visual-views.mjs";

const capture = { view: "reader", viewport: "mobile", require_visible_selector: "main" };
const visibleBox = { width: 20, height: 10, left: 0, top: 0, right: 20, bottom: 10 };

function pageFixture(fragment, box = visibleBox) {
  const scrolled = [];
  const element = {
    scrollIntoView(options) { scrolled.push(options); },
    getBoundingClientRect() { return box; },
  };
  const page = {
    location: { hash: "#chapter%201" }, innerWidth: 100, innerHeight: 100,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 }, scrollY: 0,
    requestAnimationFrame(callback) { callback(); },
    document: {
      scrollingElement: { scrollTop: 0 },
      getElementById(id) { assert.equal(id, "chapter 1"); return fragment ? element : null; },
      querySelector(selector) { assert.equal(selector, ".diagram-error"); return null; },
      querySelectorAll(selector) {
        if (selector === ".diagram-loading") return [];
        assert.equal(selector, "main");
        return [{ getBoundingClientRect: () => visibleBox }];
      },
    },
  };
  return { page, scrolled, element };
}

function layoutFixture({ before = true, box = visibleBox, onFrame = () => {} } = {}) {
  const fixture = pageFixture(true);
  const { page, element, scrolled } = fixture;
  const state = { frames: 0, loading: true, documentTop: 200.25, error: null };
  const diagram = {
    compareDocumentPosition(target) { assert.equal(target, element); return before ? 4 : 2; },
    getBoundingClientRect() { return box; },
  };
  element.getBoundingClientRect = () => {
    const top = state.documentTop - page.document.scrollingElement.scrollTop;
    return { ...visibleBox, top, bottom: top + visibleBox.height };
  };
  element.scrollIntoView = (options) => {
    scrolled.push(options);
    page.document.scrollingElement.scrollTop = state.documentTop - 40;
  };
  page.requestAnimationFrame = (callback) => {
    state.frames += 1;
    onFrame(state, page);
    callback();
  };
  page.document.querySelector = () => state.error;
  const query = page.document.querySelectorAll;
  page.document.querySelectorAll = (selector) => selector === ".diagram-loading"
    ? (state.loading ? [diagram] : []) : query(selector);
  return { ...fixture, state };
}

test("missing fragment fails despite another visible selector", async () => {
  const { page } = pageFixture(false);
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*chapter 1.*missing/u);
});

test("present fragment scrolls and intersects the viewport", async () => {
  const { page, scrolled } = pageFixture(true);
  await settleDocumentTargets(capture, intersectsViewport, page);
  assert.deepEqual(scrolled, [{ block: "center" }]);
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
  assert.equal(element.getBoundingClientRect().top, 40);
  assert.equal(page.document.scrollingElement.scrollTop, 260.75);
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
  assert.equal(scrolled.length, 2);
  assert.equal(element.getBoundingClientRect().top, 40);
  assert.equal(page.document.scrollingElement.scrollTop, 161);
});

test("diagram error appearing during settling fails with its text", async () => {
  const { page, state } = layoutFixture({
    onFrame(state) { if (state.frames === 2) state.error = { textContent: "late render error" }; },
  });
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*late render error/u);
  assert.equal(state.frames, 2);
});

test("target position drift exhausts the scalar sample bound", async () => {
  const { page, state, element } = layoutFixture({ onFrame(state) { state.documentTop += 0.25; } });
  state.loading = false;
  element.scrollIntoView = () => {};
  await assert.rejects(settleDocumentTargets(capture, intersectsViewport, page), /reader\/mobile.*500 samples.*"top":450.25.*"scrollTop":0/u);
  assert.equal(state.frames, 1000);
});

test("scroll drift alone exhausts the bound even with a stable target top", async () => {
  const { page, state, element } = layoutFixture({
    onFrame(state, page) { page.document.scrollingElement.scrollTop += 0.25; },
  });
  state.loading = false;
  element.getBoundingClientRect = () => visibleBox;
  element.scrollIntoView = () => {};
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
