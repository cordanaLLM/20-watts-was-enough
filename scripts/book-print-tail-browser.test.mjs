import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  connectCdp,
  devtoolsPageFromProfile,
  firstExistingChromium,
  settleCleanupSteps,
  stopProcess,
} from "./lib/chromium-cdp.mjs";

// Main run 38372782567 printed the book once with 414 pages and once with a
// blank 415th page from the same image: the legal footer ended 133 CSS px
// above the bottom of the last page, and an unpainted node after #root
// extended the printed flow past it. This test rebuilds that geometry.

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bookStylesheet = (await readFile(
  path.join(repositoryRoot, "app/globals.css"),
  "utf8",
)).replace(/^@import "tailwindcss";\s*/u, "");
const bodyGuardRule = /\n\s*body > :not\(#root\) \{\s*display: none !important;\s*\}/u;
const footerSlackPx = 133;
// A4 height minus the 16 mm top and 18 mm bottom page margins of @page.
const contentHeightPx = (263 * 96) / 25.4;
const plantedNode = '<div id="dplanted"><svg width="100%"><g></g></svg></div>';

function bookHtml(stylesheet, planted) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${stylesheet}</style></head>`
    + '<body><div id="root"><main class="book-shell book-shell-print">'
    + '<div id="filler" style="height:100px"></div>'
    + '<footer class="book-legal" aria-label="Legal information"><strong>Licences and notices</strong>'
    + '<span>Source: test</span><a href="#licence">EUPL 1.2</a></footer>'
    + `</main></div>${planted}</body></html>`;
}

function pdfPageCount(base64) {
  return Buffer.from(base64, "base64").toString("latin1")
    .match(/\/Type\s*\/Page(?![a-zA-Z])/gu)?.length ?? 0;
}

async function printedPages(cdp, stylesheet, planted) {
  const { frameTree } = await cdp.send("Page.getFrameTree");
  await cdp.send("Page.setDocumentContent", {
    frameId: frameTree.frame.id,
    html: bookHtml(stylesheet, planted),
  });
  await cdp.send("Emulation.setEmulatedMedia", { media: "print" });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 688,
    height: 994,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const legalBottom = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const filler = document.getElementById("filler");
      const legal = document.querySelector(".book-legal");
      const gap = ${contentHeightPx - footerSlackPx} - (legal.getBoundingClientRect().bottom + scrollY);
      filler.style.height = (100 + gap) + "px";
      return legal.getBoundingClientRect().bottom + scrollY;
    })()`,
    returnByValue: true,
  })).result?.value;
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.send("Emulation.setEmulatedMedia", { media: "" });
  assert.ok(
    Math.abs(legalBottom - (contentHeightPx - footerSlackPx)) < 1,
    `legal footer must end ${footerSlackPx} px above the page bottom, got ${legalBottom}`,
  );
  const printed = await cdp.send("Page.printToPDF", {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  return pdfPageCount(printed.data);
}

test("the guard rule is present exactly once in the stylesheet", () => {
  assert.equal(bookStylesheet.match(new RegExp(bodyGuardRule, "gu"))?.length, 1);
});

test("an unpainted node after the root adds no trailing printed page", {
  timeout: 90_000,
}, async (t) => {
  const browser = await firstExistingChromium();
  const profile = await mkdtemp(path.join(os.tmpdir(), "20w-book-print-tail-"));
  let browserProcess;
  let cdp;
  try {
    browserProcess = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      "--no-sandbox",
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

    const unguarded = bookStylesheet.replace(bodyGuardRule, "");
    assert.notEqual(unguarded, bookStylesheet, "the guard rule must be removable for the control");
    assert.equal(await printedPages(cdp, bookStylesheet, ""), 1, "baseline prints one page");
    assert.equal(
      await printedPages(cdp, unguarded, plantedNode),
      2,
      "control: without the guard the planted node must add a page",
    );
    assert.equal(
      await printedPages(cdp, bookStylesheet, plantedNode),
      1,
      "the guard keeps the planted node out of the printed flow",
    );
  } finally {
    await settleCleanupSteps([
      async () => cdp?.socket.close(),
      async () => stopProcess(browserProcess),
      async () => rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
    ]);
  }
});
