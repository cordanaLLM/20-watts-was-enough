import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  connectCdp, devtoolsPage, settleCleanupSteps, stopProcess,
} from "./lib/chromium-cdp.mjs";
import { waitForCondition } from "./lib/browser-wait.mjs";
import {
  assertBookRendererLockIdentity, bookRendererIdentityFromEnvironment,
} from "./lib/book-renderer-identity.mjs";
import { buildVisualPages, startVisualPagesPreview, VISUAL_PAGES_ORIGIN } from "./lib/visual-pages-server.mjs";
import { readStableOpenedFile } from "./lib/opened-file.mjs";

const root = "/workspace";
const base = "/";
const output = path.join(root, "tmp/visual-capture");
const origin = VISUAL_PAGES_ORIGIN;
let server;
let browser;
let cdp;

async function evaluate(expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (response.exceptionDetails) throw new Error(`Visual page evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
  return response.result?.value;
}

async function settleView(capture, url) {
  await waitForCondition({
    budgetMs: 60_000,
    label: `${capture.view}/${capture.viewport} did not become ready`,
    probe: () => evaluate(`location.href === ${JSON.stringify(url)}
      && document.readyState === "complete"
      && Boolean(document.querySelector(${JSON.stringify(capture.ready_selector)}))`),
  });
  await evaluate(`(async () => {
    await document.fonts.ready;
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }";
    document.head.append(style);
  })()`);
  await evaluate(`(${settleDocumentTargets.toString()})(${JSON.stringify(capture)}, ${intersectsViewport.toString()})`);
}

export function intersectsViewport(box, width, height) {
  return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0
    && box.left < width && box.top < height;
}

export async function settleDocumentTargets(capture, intersects, page = globalThis) {
  const { document, location, innerWidth, innerHeight } = page;
  const fragment = decodeURIComponent(location.hash.slice(1));
  const target = fragment ? document.getElementById(fragment) : null;
  const label = `${capture.view}/${capture.viewport}: fragment #${fragment}`;
  if (fragment && !target) throw new Error(`${label} missing`);
  target?.scrollIntoView({ block: "center" });
  await new Promise(resolve => page.requestAnimationFrame(() => page.requestAnimationFrame(resolve)));
  if (target && !intersects(target.getBoundingClientRect(), innerWidth, innerHeight)) {
    throw new Error(`${label} does not intersect viewport`);
  }
  if (capture.require_visible_selector) {
    const elements = document.querySelectorAll(capture.require_visible_selector);
    if (elements.length > 10000) throw new Error("Visible selector exceeds 10000 elements");
    const visible = Array.from(elements).some(element => intersects(element.getBoundingClientRect(), innerWidth, innerHeight));
    if (!visible) throw new Error(`${capture.view}: require_visible_selector has no visible match`);
  }
}

async function captureView(capture, product) {
  const url = new URL(capture.url, origin).href;
  if (!url.startsWith(`${origin}${base}`)) throw new Error(`${capture.view}: URL escaped the Pages base`);
  if (!/^[a-z0-9-]{3,81}\.png$/u.test(capture.file)) throw new Error(`${capture.view}: invalid output filename`);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: capture.width, height: capture.height, deviceScaleFactor: 1, mobile: capture.mobile,
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: "light" },
    ],
  });
  await cdp.send("Page.navigate", { url: "about:blank" });
  const navigation = await cdp.send("Page.navigate", { url });
  if (navigation.errorText) throw new Error(`${capture.view}: ${navigation.errorText}`);
  await settleView(capture, url);
  await maskView(capture);
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: false, fromSurface: true,
  });
  if (screenshot.data.length > 112 * 1024 * 1024) throw new Error(`${capture.view}: PNG exceeds output bound`);
  await writeFile(path.join(output, capture.file), Buffer.from(screenshot.data, "base64"));
  return {
    file: capture.file, view: capture.view, viewport: capture.viewport,
    width: capture.width, height: capture.height, url, browser_product: product,
  };
}

async function maskView(capture) {
  const selectors = capture.mask_selectors ?? [];
  if (!Array.isArray(selectors) || selectors.length > 8) {
    throw new Error(`${capture.view}: mask_selectors must contain at most 8 entries`);
  }
  await evaluate(`(async () => {
    let masked = 0;
    for (const selector of ${JSON.stringify(selectors)}) {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) throw new Error(${JSON.stringify(capture.view)} + ": mask selector " + selector + " matched nothing");
      masked += elements.length;
      if (masked > 256) throw new Error(${JSON.stringify(capture.view)} + ": masked elements exceed 256");
      for (const element of elements) {
        element.textContent = "masked";
        element.style.setProperty("visibility", "hidden", "important");
      }
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
}

async function captureWithDeadline(capture, product) {
  let timer;
  try {
    return await Promise.race([
      captureView(capture, product),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${capture.view}/${capture.viewport}: capture exceeded 60 s`)), 60_000);
      }),
    ]);
  } catch (cause) {
    throw new Error(`${capture.view}/${capture.viewport}: visual capture failed`, { cause });
  } finally {
    clearTimeout(timer);
  }
}

async function runCaptures(plan, lock, signal, profile) {
  let staging;
  try {
    staging = await mkdtemp(path.join(root, "tmp/visual-pages-"));
    await buildVisualPages(root, staging, signal);
    server = await startVisualPagesPreview(root, staging, signal);
    browser = spawn(lock.chrome_for_testing.executable_path, [
      "--headless=new", "--disable-gpu", "--disable-extensions", "--disable-background-networking",
      "--disable-dev-shm-usage", "--disable-features=NetworkServiceSandbox", "--no-sandbox",
      "--no-proxy-server", "--allow-insecure-localhost", "--no-first-run", "--no-default-browser-check",
      "--hide-scrollbars", "--window-size=1440,900", "--remote-debugging-port=3138",
      "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none",
      "--force-device-scale-factor=1", `--user-data-dir=${profile}`, "about:blank",
    ], { stdio: "ignore", windowsHide: true });
    cdp = await connectCdp(await devtoolsPage(browser, 3138, { signal }), {
      signal, commandTimeoutMs: 60_000,
    });
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const version = await cdp.send("Browser.getVersion");
    const captures = [];
    for (const capture of plan.captures) captures.push(await captureWithDeadline(capture, version.product));
    await writeFile(path.join(output, "capture-manifest.json"), `${JSON.stringify({ schema: 1, captures }, null, 2)}\n`);
  } finally {
    await settleCleanupSteps([
      async () => cdp?.socket.close(),
      async () => stopProcess(browser),
      async () => stopProcess(server),
      async () => { if (staging) await rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); },
      async () => rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
    ]);
  }
}

export async function readCapturePlan(file) {
  const bytes = await readStableOpenedFile(file, { label: "visual capture plan", maximumBytes: 128 * 1024 });
  const plan = JSON.parse(bytes.toString("utf8"));
  if (plan.schema !== 1 || !Array.isArray(plan.captures) || plan.captures.length < 1 || plan.captures.length > 32) {
    throw new Error("Visual capture plan needs schema 1 and 1..32 captures");
  }
  return plan;
}

async function main() {
  const plan = await readCapturePlan(path.join(root, "tmp/capture-plan.json"));
  const lockBytes = await readFile(path.join(root, "tooling/pdf-renderer/lock.json"));
  assertBookRendererLockIdentity(bookRendererIdentityFromEnvironment(), lockBytes);
  const lock = JSON.parse(lockBytes);
  const signal = AbortSignal.timeout(lock.limits.render_seconds * 1000);
  await mkdir(output, { recursive: true });
  const profile = await mkdtemp(path.join(tmpdir(), "20w-visual-chrome-"));
  await runCaptures(plan, lock, signal, profile);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
