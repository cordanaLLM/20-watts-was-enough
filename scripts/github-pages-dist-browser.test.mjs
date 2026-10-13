import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolvePagesBase } from "./lib/pages-base.mjs";
import {
  connectCdp,
  devtoolsPage,
  firstExistingChromium,
  stopProcess,
  waitForUrl,
} from "./lib/chromium-cdp.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const portalPagesBasePath = resolvePagesBase(process.env.PAGES_BASE_PATH);
const distIndexPath = path.join(repositoryRoot, "dist-github-pages", "index.html");

async function assertDistBuilt() {
  try {
    await access(distIndexPath);
  } catch {
    assert.fail("run npm run build first");
  }
}

async function reserveLocalPort() {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  return port;
}

async function evaluateInBrowser(cdp, expression, awaitPromise = true) {
  const evaluation = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
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
    if (snapshot?.documentReady !== false && accepts(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${label}: ${JSON.stringify(snapshot)}`);
}

// Vite preview serves the SPA shell for unknown paths, so a missing chunk
// arrives as HTML with status 200; a script URL answered with HTML is a failure.
function failedResponse(response) {
  const contentType = response?.mimeType ?? response?.headers?.["content-type"] ?? "";
  const htmlForScript = Boolean(response?.url?.endsWith(".js") && contentType.includes("html"));
  if (!response || (response.status < 400 && !htmlForScript)) return undefined;
  return {
    type: "responseReceived",
    status: response.status,
    reason: htmlForScript ? "HTML served for a script URL" : response.statusText,
    url: response.url,
  };
}

function recordFailedRequests(cdp) {
  const failedRequests = [];
  const requestUrls = new Map();
  cdp.socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const params = message?.params ?? {};
    if (message?.method === "Network.requestWillBeSent" && params.requestId && params.request?.url) {
      requestUrls.set(params.requestId, params.request.url);
    } else if (message?.method === "Network.responseReceived") {
      const failure = failedResponse(params.response);
      if (failure) failedRequests.push(failure);
    } else if (message?.method === "Network.loadingFailed") {
      const url = requestUrls.get(params.requestId) ?? "unknown";
      if (!params.canceled || url.endsWith(".js")) {
        failedRequests.push({ type: "loadingFailed", reason: params.errorText, url });
      }
    }
  });
  return failedRequests;
}

function startPreview(serverPort) {
  return spawn(process.execPath, [
    path.join(repositoryRoot, "node_modules", "vite", "bin", "vite.js"),
    "preview",
    "--config",
    path.join(repositoryRoot, "vite.pages.config.ts"),
    "--host",
    "127.0.0.1",
    "--port",
    String(serverPort),
    "--strictPort",
    "--logLevel",
    "silent",
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, PAGES_BASE_PATH: portalPagesBasePath },
    stdio: "ignore",
    windowsHide: true,
  });
}

function startBrowser(browser, debugPort, profile) {
  return spawn(browser, [
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
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
}

async function withBuiltPortalBrowser(run) {
  await assertDistBuilt();
  const browser = await firstExistingChromium();
  const debugPort = await reserveLocalPort();
  const serverPort = await reserveLocalPort();
  const profile = await mkdtemp(path.join(os.tmpdir(), "20w-dist-browser-"));
  const serverOrigin = `http://127.0.0.1:${serverPort}`;
  const portalUrl = `${serverOrigin}${portalPagesBasePath}`;
  let browserProcess;
  let cdp;
  let viteProcess;
  try {
    viteProcess = startPreview(serverPort);
    await waitForUrl(portalUrl, viteProcess);
    browserProcess = startBrowser(browser, debugPort, profile);
    cdp = await connectCdp(await devtoolsPage(browserProcess, debugPort));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const failedRequests = recordFailedRequests(cdp);
    await run({ cdp, portalUrl, serverOrigin, failedRequests });
  } finally {
    cdp?.socket.close();
    await stopProcess(browserProcess);
    await stopProcess(viteProcess);
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

test("built portal browser verification", { timeout: 120_000 }, async (t) => {
  await withBuiltPortalBrowser(async ({ cdp, portalUrl, serverOrigin, failedRequests }) => {
    let documentUrl;

    await t.test("open portal root under base path", async () => {
      const navigation = await cdp.send("Page.navigate", { url: portalUrl });
      assert.equal(navigation.errorText, undefined);
      await waitForBrowserState(
        cdp,
        `document.readyState === "complete" && Boolean(document.querySelector(".portal-action-primary"))`,
        Boolean,
        "portal overview did not render action link",
      );
      const documentTitle = await evaluateInBrowser(cdp, `document.title`);
      assert.ok(
        typeof documentTitle === "string" && documentTitle.trim().length > 0,
        "document.title must be non-empty",
      );
      documentUrl = await evaluateInBrowser(
        cdp,
        `document.querySelector(".portal-action-primary")?.href`,
      );
      assert.ok(documentUrl, ".portal-action-primary href must be defined");
    });

    await t.test("open one document route", async () => {
      const targetUrl = documentUrl;
      const navigation = await cdp.send("Page.navigate", { url: targetUrl });
      assert.equal(navigation.errorText, undefined);
      await waitForBrowserState(
        cdp,
        `Boolean(document.getElementById("portal-reader-title")) && document.querySelectorAll(".portal-prose p").length >= 1`,
        Boolean,
        "document route did not render portal-reader-title and prose paragraphs",
      );
      const readerTitle = await evaluateInBrowser(
        cdp,
        `document.getElementById("portal-reader-title")?.textContent?.trim()`,
      );
      assert.ok(
        typeof readerTitle === "string" && readerTitle.length > 0,
        "#portal-reader-title text must be non-empty",
      );
      const proseParagraphCount = await evaluateInBrowser(
        cdp,
        `document.querySelectorAll(".portal-prose p").length`,
      );
      assert.ok(
        typeof proseParagraphCount === "number" && proseParagraphCount >= 1,
        ".portal-prose must have >= 1 paragraph",
      );
    });

    await t.test("load every script the built entry pages reference", async () => {
      for (const route of ["", "book/"]) {
        const response = await fetch(`${portalUrl}${route}`, { signal: AbortSignal.timeout(10_000) });
        assert.equal(response.status, 200, `entry page ${route || "/"}`);
        const html = await response.text();
        const scripts = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+\.js)"/gu)]
          .map((match) => match[1]);
        assert.ok(scripts.length > 0, `entry page ${route || "/"} references no script`);
        for (const script of scripts) {
          const asset = await fetch(new URL(script, serverOrigin), { signal: AbortSignal.timeout(10_000) });
          const contentType = asset.headers.get("content-type") ?? "";
          assert.equal(asset.status, 200, `${route || "/"} script ${script}`);
          assert.match(contentType, /javascript/u, `${route || "/"} script ${script} served as ${contentType}`);
        }
      }
    });

    await t.test("collect failed network requests during both loads", async () => {
      const sameOriginFailures = failedRequests.filter((item) => {
        try {
          return new URL(item.url).origin === serverOrigin;
        } catch {
          return false;
        }
      });
      assert.deepEqual(
        sameOriginFailures,
        [],
        `found failed same-origin network requests: ${JSON.stringify(sameOriginFailures)}`,
      );
    });
  });
});
