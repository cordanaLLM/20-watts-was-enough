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
    requestAnimationFrame(callback) { callback(); },
    document: {
      getElementById(id) { assert.equal(id, "chapter 1"); return fragment ? element : null; },
      querySelectorAll(selector) {
        assert.equal(selector, "main");
        return [{ getBoundingClientRect: () => visibleBox }];
      },
    },
  };
  return { page, scrolled };
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
