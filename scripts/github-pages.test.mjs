import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import {
  decodePortalFragment,
  encodePortalFragment,
} from "../app/lib/portal-fragment.mjs";
import { publication } from "../app/lib/publication.mjs";
import {
  connectCdp,
  devtoolsPage,
  firstExistingChromium,
  stopProcess,
  waitForUrl,
} from "./lib/chromium-cdp.mjs";
import {
  decodeBasicHtmlEntitiesOnce,
  stripHtmlTagSyntax,
} from "./lib/plain-text.mjs";
import { assertExactPublicationCopy } from "./lib/publication-copy-integrity.mjs";
import { renderThirdPartyNotices } from "./lib/third-party-notices.mjs";
import { collectMathMarkdown } from "./lib/math-markdown.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function source(relative) {
  return readFile(path.join(repositoryRoot, relative), "utf8");
}

function assertCorpusDrawerSource(portal) {
  assert.match(portal, /const selectGroup = \(candidate: LibraryGroup\)/);
  assert.match(portal, /setGroup\(candidate\);[\s\S]*setCatalogLimit\(catalogPageSize\);/);
  assert.match(portal, /className="portal-mobile-menu"/);
  assert.match(portal, /className="portal-mobile-outline"/);
  assert.match(portal, /id="portal-corpus-trigger"/);
  assert.match(portal, /id="portal-corpus-drawer"/);
  assert.match(portal, /aria-controls="portal-corpus-results"/);
  assert.match(portal, /closeDrawer\(false\);[\s\S]*onNavigate\(path\);/);
  assert.match(portal, /mobileMenuRef\.current\?\.removeAttribute\("open"\)/);
  assert.match(portal, /mobileOutlineRef\.current\?\.removeAttribute\("open"\)/);
  assert.match(portal, /selectHeading\(heading\.id\)/);
  assert.doesNotMatch(portal, /--portal-reader-stack-top/);
  assert.doesNotMatch(portal, /ResizeObserver/);
  assert.match(portal, /function revealFocusedElement\(/);
  assert.match(portal, /const clearance = outlineWidth \+ outlineOffset \+ 1/);
  assert.match(portal, /revealFocusedElement\(libraryRef\.current, target\)/);
  assert.doesNotMatch(portal, /listRef/);
  assert.doesNotMatch(portal, /list\.scrollTop/);
  assert.match(portal, /className="portal-document-list"[\s\S]*<a[\s\S]*href=\{portalDocumentLocation\(document\.path, assetBasePath\)\}/);
  assert.match(portal, /aria-current=\{document\.path === selectedDocument\.path \? "page" : undefined\}/);
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
    if (snapshot?.documentReady !== false && accepts(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${label}: ${JSON.stringify(snapshot)}`);
}

const portalStateExpression = `(() => {
  const documentElement = document.documentElement;
  if (!documentElement) return { documentReady: false };
  const active = document.activeElement;
  const title = document.getElementById("portal-reader-title");
  const header = document.querySelector(".portal-header");
  const drawer = document.getElementById("portal-corpus-drawer");
  const drawerScroller = drawer?.querySelector(".portal-library");
  const documentList = drawer?.querySelector(".portal-document-list");
  const mobileOutline = document.querySelector(".portal-mobile-outline");
  const outline = document.querySelector(".portal-outline");
  const hashTarget = location.hash
    ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
    : null;
  const hashBounds = hashTarget?.getBoundingClientRect();
  const documentLinks = [...document.querySelectorAll(".portal-document-list > a")];
  const activeBounds = active?.getBoundingClientRect();
  const headerBounds = header?.getBoundingClientRect();
  const titleBounds = title?.getBoundingClientRect();
  const drawerScrollerBounds = drawerScroller?.getBoundingClientRect();
  const activeStyle = active ? getComputedStyle(active) : null;
  const focusPaintExtent = activeStyle
    ? (Number.parseFloat(activeStyle.outlineWidth) || 0)
      + Math.max(Number.parseFloat(activeStyle.outlineOffset) || 0, 0)
    : 0;
  return {
    documentReady: true,
    activeFocusPaintFullyVisible: Boolean(
      activeBounds
      && drawerScrollerBounds
      && activeBounds.top - focusPaintExtent >= drawerScrollerBounds.top
      && activeBounds.bottom + focusPaintExtent <= drawerScrollerBounds.bottom
    ),
    activeId: active?.id ?? "",
    activeIsFirstDocumentLink: active === documentLinks[0],
    activeTag: active?.tagName ?? "",
    activeWithinDrawer: Boolean(drawer?.contains(document.activeElement)),
    activeFocusVisible: Boolean(active?.matches?.(":focus-visible")),
    articleTabIndex: document.getElementById("portal-reader")?.getAttribute("tabindex") ?? null,
    currentLinks: documentLinks.filter((link) => link.getAttribute("aria-current") === "page").length,
    documentLinkCount: documentLinks.length,
    documentLinkTags: [...new Set(documentLinks.map((link) => link.tagName))],
    documentListOverflowY: documentList ? getComputedStyle(documentList).overflowY : "missing",
    drawerOpen: Boolean(drawer?.open),
    drawerScrollerClientHeight: drawerScroller?.clientHeight ?? null,
    drawerScrollerOverflowY: drawerScroller ? getComputedStyle(drawerScroller).overflowY : "missing",
    drawerScrollerScrollHeight: drawerScroller?.scrollHeight ?? null,
    hash: location.hash,
    hashTargetTop: hashBounds?.top ?? null,
    hashTargetVisible: Boolean(hashBounds && hashBounds.bottom > 0 && hashBounds.top < innerHeight),
    headerBottom: headerBounds?.bottom ?? null,
    pathname: location.pathname,
    pageClientWidth: documentElement.clientWidth,
    pageScrollWidth: documentElement.scrollWidth,
    readerPresent: Boolean(document.getElementById("portal-reader")),
    searchValue: document.getElementById("portal-library-search")?.value ?? null,
    mobileOutlineDisplay: mobileOutline ? getComputedStyle(mobileOutline).display : "missing",
    outlineDisplay: outline ? getComputedStyle(outline).display : "missing",
    triggerExpanded: document.getElementById("portal-corpus-trigger")?.getAttribute("aria-expanded"),
    titleTabIndex: title?.getAttribute("tabindex") ?? null,
    titleText: title?.textContent?.trim() ?? "",
    titleFocusTop: titleBounds && active === title
      ? titleBounds.top - focusPaintExtent
      : null,
    titleScrollMarginTop: title ? getComputedStyle(title).scrollMarginTop : null,
    viewportWidth: innerWidth,
  };
})()`;

const portalPagesBasePath = "/20-watts-was-enough/";

async function withPortalBrowser(run) {
  const browser = await firstExistingChromium();
  const debugPort = await reserveLocalPort();
  const serverPort = await reserveLocalPort();
  const profile = await mkdtemp(path.join(os.tmpdir(), "20w-portal-routing-"));
  let browserProcess;
  let cdp;
  let viteProcess;

  try {
    const portalUrl = `http://127.0.0.1:${serverPort}${portalPagesBasePath}`;
    viteProcess = spawn(process.execPath, [
      path.join(repositoryRoot, "node_modules", "vite", "bin", "vite.js"),
      "--config",
      path.join(repositoryRoot, "vite.pages.config.ts"),
      "--host",
      "127.0.0.1",
      "--port",
      String(serverPort),
      "--strictPort",
      "--force",
      "--logLevel",
      "silent",
    ], {
      cwd: repositoryRoot,
      env: { ...process.env, PAGES_BASE_PATH: portalPagesBasePath },
      stdio: "ignore",
      windowsHide: true,
    });
    await waitForUrl(portalUrl, viteProcess);
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
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: "ignore", windowsHide: true });

    cdp = await connectCdp(await devtoolsPage(browserProcess, debugPort));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await run(cdp, portalUrl);
  } finally {
    cdp?.socket.close();
    await stopProcess(browserProcess);
    await stopProcess(viteProcess);
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

async function openThesisRoute(cdp, portalUrl) {
  const navigation = await cdp.send("Page.navigate", { url: portalUrl });
  assert.equal(navigation.errorText, undefined);
  await waitForBrowserState(
    cdp,
    `document.readyState === "complete" && Boolean(document.querySelector(".portal-action-primary"))`,
    Boolean,
    "portal overview did not render",
  );
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
  });
  const focusRings = await evaluateInBrowser(cdp, `(() => (
    ["portal-overview", "research-system", "library"].map((id) => {
      const target = document.getElementById(id);
      target.focus({ preventScroll: true });
      const style = getComputedStyle(target);
      return {
        active: document.activeElement === target,
        focusVisible: target.matches(":focus-visible"),
        outlineOffset: style.outlineOffset,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    })
  ))()`);
  assert.deepEqual(focusRings, Array.from({ length: 3 }, () => ({
    active: true,
    focusVisible: true,
    outlineOffset: "3px",
    outlineStyle: "solid",
    outlineWidth: "3px",
  })));
  const thesis = await evaluateInBrowser(cdp, `(() => {
    const link = document.querySelector(".portal-action-primary");
    return { pathname: new URL(link.href).pathname };
  })()`);
  await evaluateInBrowser(cdp, `document.querySelector(".portal-action-primary").click()`);
  const state = await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => snapshot.pathname === thesis.pathname
      && snapshot.activeId === "portal-reader-title"
      && snapshot.documentLinkCount > 1,
    "thesis route did not focus its title",
  );
  assert.equal(state.activeTag, "H1");
  assert.equal(state.articleTabIndex, null);
  assert.equal(state.titleTabIndex, "-1");
  assert.deepEqual(state.documentLinkTags, ["A"]);
  assert.equal(state.currentLinks, 1);
  return { state, thesis };
}

async function dispatchKeyboardKey(cdp, key, code, virtualKeyCode, modifiers = 0) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
}

async function openCorpusDrawer(cdp) {
  await evaluateInBrowser(cdp, `document.getElementById("portal-corpus-trigger").click()`);
  return waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => snapshot.drawerOpen
      && snapshot.triggerExpanded === "true"
      && snapshot.activeId === "portal-library-search"
      && snapshot.activeWithinDrawer,
    "corpus drawer did not open and focus its search",
  );
}

async function exerciseSearchEscape(cdp) {
  const query = "concept/";
  await openCorpusDrawer(cdp);
  await cdp.send("Input.insertText", { text: query });
  await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => snapshot.searchValue === query,
    "corpus search did not receive the keyboard query",
  );
  await dispatchKeyboardKey(cdp, "Escape", "Escape", 27);
  await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => !snapshot.drawerOpen
      && snapshot.triggerExpanded === "false"
      && snapshot.searchValue === query
      && snapshot.activeId === "portal-corpus-trigger"
      && snapshot.activeFocusVisible,
    "Escape from a populated corpus search did not close once and restore its invoker",
  );

  const reopened = await openCorpusDrawer(cdp);
  assert.equal(reopened.searchValue, query);
  await dispatchKeyboardKey(cdp, "a", "KeyA", 65, 2);
  await dispatchKeyboardKey(cdp, "Backspace", "Backspace", 8);
  await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => snapshot.searchValue === "",
    "corpus search did not clear after the Escape-state regression",
  );
  await dispatchKeyboardKey(cdp, "Escape", "Escape", 27);
  await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => !snapshot.drawerOpen
      && snapshot.triggerExpanded === "false"
      && snapshot.activeId === "portal-corpus-trigger",
    "native empty-search Escape did not close the corpus drawer",
  );
}

async function exerciseResponsiveCorpusDrawer(cdp) {
  const layouts = [
    { width: 1440, height: 900, outline: "block", mobileOutline: "none" },
    { width: 768, height: 1024, outline: "none", mobileOutline: "block" },
    { width: 720, height: 760, outline: "none", mobileOutline: "block" },
    { width: 375, height: 844, outline: "none", mobileOutline: "block" },
    { width: 320, height: 720, outline: "none", mobileOutline: "block" },
    // Equivalent CSS viewport for a 1440 x 900 browser at 200% page zoom.
    { width: 720, height: 450, outline: "none", mobileOutline: "block", zoomed: true },
  ];
  for (const layout of layouts) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: layout.width,
      height: layout.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await waitForBrowserState(
      cdp,
      portalStateExpression,
      (snapshot) => snapshot.viewportWidth === layout.width
        && snapshot.outlineDisplay === layout.outline
        && snapshot.mobileOutlineDisplay === layout.mobileOutline
        && snapshot.pageScrollWidth <= snapshot.pageClientWidth,
      `reader layout did not reflow at ${layout.width}px`,
    );
    await openCorpusDrawer(cdp);
    const tabCount = layout.zoomed ? 4 : 1;
    for (let index = 0; index < tabCount; index += 1) {
      await dispatchKeyboardKey(cdp, "Tab", "Tab", 9);
    }
    await waitForBrowserState(
      cdp,
      portalStateExpression,
      (snapshot) => snapshot.drawerOpen
        && snapshot.activeWithinDrawer
        && snapshot.activeFocusVisible
        && (!layout.zoomed || (
          snapshot.activeIsFirstDocumentLink
          && snapshot.activeFocusPaintFullyVisible
          && snapshot.drawerScrollerOverflowY === "auto"
          && snapshot.documentListOverflowY === "visible"
          && snapshot.drawerScrollerScrollHeight > snapshot.drawerScrollerClientHeight
        )),
      layout.zoomed
        ? "200% zoom clipped the focused corpus result"
        : `keyboard focus escaped the drawer at ${layout.width}px`,
    );
    await dispatchKeyboardKey(cdp, "Escape", "Escape", 27);
    await waitForBrowserState(
      cdp,
      portalStateExpression,
      (snapshot) => !snapshot.drawerOpen
        && snapshot.triggerExpanded === "false"
        && snapshot.activeId === "portal-corpus-trigger"
        && snapshot.activeFocusVisible,
      `closing the drawer did not restore visible focus at ${layout.width}px`,
    );
  }
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function exerciseSkipToDocumentClearance(cdp, portalUrl) {
  const route = new URL("concept/80-energy-model/", portalUrl);
  const layouts = [
    { width: 720, height: 600 },
    { width: 320, height: 720 },
  ];

  for (const layout of layouts) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: layout.width,
      height: layout.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send("Page.navigate", { url: route.href });
    await waitForBrowserState(
      cdp,
      portalStateExpression,
      (snapshot) => snapshot.pathname === route.pathname && snapshot.readerPresent,
      `energy-model route did not render at ${layout.width}px`,
    );
    await evaluateInBrowser(cdp, `(() => {
      window.scrollTo(0, document.scrollingElement.scrollHeight);
      document.querySelector(".portal-skip-link").focus({ preventScroll: true });
    })()`);
    await waitForBrowserState(
      cdp,
      `({ activeClass: document.activeElement?.className ?? "", scrollY })`,
      (snapshot) => snapshot.activeClass === "portal-skip-link" && snapshot.scrollY > 0,
      `skip link was not keyboard-ready at ${layout.width}px`,
    );
    await dispatchKeyboardKey(cdp, "Enter", "Enter", 13);
    const state = await waitForBrowserState(
      cdp,
      portalStateExpression,
      (snapshot) => snapshot.hash === "#portal-reader-title"
        && snapshot.activeId === "portal-reader-title"
        && snapshot.activeFocusVisible,
      `skip link did not focus the document title at ${layout.width}px`,
    );
    assert.ok(
      state.titleFocusTop >= state.headerBottom,
      `focused title starts at ${state.titleFocusTop}px behind a header ending at ${state.headerBottom}px at ${layout.width}px`,
    );
    assert.ok(Number.parseFloat(state.titleScrollMarginTop) > state.headerBottom);
  }
}

async function openSidebarRoute(cdp) {
  await openCorpusDrawer(cdp);
  const route = await evaluateInBrowser(cdp, `(() => {
    const link = [...document.querySelectorAll(".portal-document-list > a")]
      .find((candidate) => candidate.getAttribute("aria-current") !== "page");
    const probe = (options) => {
      let preventedBeforeBrowserDefault = null;
      window.addEventListener("click", (event) => {
        preventedBeforeBrowserDefault = event.defaultPrevented;
        event.preventDefault();
      }, { once: true });
      const event = new MouseEvent("click", {
        bubbles: true, cancelable: true, ...options,
      });
      link.dispatchEvent(event);
      return preventedBeforeBrowserDefault;
    };
    const modifierPrevented = ["altKey", "ctrlKey", "metaKey", "shiftKey"]
      .map((modifier) => probe({ button: 0, [modifier]: true }));
    return {
      href: link.getAttribute("href"),
      middlePrevented: probe({ button: 1 }),
      modifierPrevented,
      pathname: new URL(link.href).pathname,
      title: link.querySelector("span").textContent.trim(),
    };
  })()`);
  assert.equal(route.middlePrevented, false);
  assert.deepEqual(route.modifierPrevented, [false, false, false, false]);
  assert.ok(route.href);
  const navigation = await evaluateInBrowser(cdp, `(() => {
    const link = [...document.querySelectorAll(".portal-document-list > a")]
      .find((candidate) => new URL(candidate.href).pathname === ${JSON.stringify(route.pathname)});
    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.dispatchEvent(event);
    return { prevented: event.defaultPrevented };
  })()`);
  assert.equal(navigation.prevented, true);
  const state = await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => snapshot.pathname === route.pathname
      && snapshot.titleText === route.title
      && snapshot.activeId === "portal-reader-title"
      && !snapshot.drawerOpen,
    "drawer route did not close and focus its title",
  );
  assert.equal(state.activeTag, "H1");
  assert.equal(state.currentLinks, 1);
  return route;
}

async function traverseDocumentHistory(cdp, thesis, thesisState, route) {
  await evaluateInBrowser(cdp, "history.back()");
  await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => snapshot.pathname === thesis.pathname
      && snapshot.titleText === thesisState.titleText
      && snapshot.activeId === "portal-reader-title",
    "back navigation did not restore and focus the thesis title",
  );
  await evaluateInBrowser(cdp, "history.forward()");
  await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => snapshot.pathname === route.pathname
      && snapshot.titleText === route.title
      && snapshot.activeId === "portal-reader-title",
    "forward navigation did not restore and focus the document title",
  );
}

async function openOutlineFragment(cdp) {
  const target = await waitForBrowserState(
    cdp,
    `(() => {
      const link = [...document.querySelectorAll(".portal-outline a")].find((candidate) => {
        const heading = document.getElementById(candidate.hash.slice(1));
        return heading && heading.getBoundingClientRect().height > 0;
      });
      return link ? { found: true, id: link.hash.slice(1) } : { found: false };
    })()`,
    (snapshot) => snapshot.found,
    "document outline did not expose a visible heading target",
  );
  const navigation = await evaluateInBrowser(cdp, `(() => {
    const link = [...document.querySelectorAll(".portal-outline a")]
      .find((candidate) => candidate.hash === ${JSON.stringify(`#${target.id}`)});
    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.dispatchEvent(event);
    return { prevented: event.defaultPrevented };
  })()`);
  assert.equal(navigation.prevented, true);
  const state = await waitForBrowserState(
    cdp,
    portalStateExpression,
    (snapshot) => snapshot.hash === `#${target.id}`
      && snapshot.activeId === target.id
      && snapshot.hashTargetVisible,
    "outline navigation did not preserve and focus its heading fragment",
  );
  assert.match(state.activeTag, /^H[2-6]$/u);
  return target;
}

async function traverseFragmentHistory(cdp, thesis, route, target) {
  for (const step of [
    { direction: "back", hash: "", pathname: route.pathname, activeId: "portal-reader-title" },
    { direction: "back", hash: "", pathname: thesis.pathname, activeId: "portal-reader-title" },
    { direction: "forward", hash: "", pathname: route.pathname, activeId: "portal-reader-title" },
    { direction: "forward", hash: `#${target.id}`, pathname: route.pathname, activeId: target.id },
  ]) {
    await evaluateInBrowser(cdp, `history.${step.direction}()`);
    await waitForBrowserState(
      cdp,
      portalStateExpression,
      (snapshot) => snapshot.pathname === step.pathname
        && snapshot.hash === step.hash
        && snapshot.activeId === step.activeId
        && (!step.hash || snapshot.hashTargetVisible),
      `${step.direction} navigation did not restore ${step.activeId}`,
    );
  }
}

function assertNoLegacyDeploymentHost(html, label) {
  const references = [...html.matchAll(/\b(?:href|src|content)=["']([^"']+)["']/gu)]
    .map((match) => match[1]);
  for (const reference of references) {
    if (!/^https?:\/\//u.test(reference)) continue;
    assert.notEqual(new URL(reference).hostname, "lusoris.github.io", label);
  }
}

test("reader labels strip complete and unterminated tags and decode entities once", () => {
  assert.equal(stripHtmlTagSyntax("alpha <em>beta</em> gamma"), "alpha  beta  gamma");
  assert.equal(stripHtmlTagSyntax("safe comparison 4 < 5"), "safe comparison 4 < 5");
  assert.equal(stripHtmlTagSyntax("safe <script"), "safe ");
  assert.equal(decodeBasicHtmlEntitiesOnce("&lt;safe&gt; &amp;lt;"), "<safe> &lt;");
});

test("portal fragments preserve existing escapes without double encoding", () => {
  assert.equal(encodePortalFragment("section details"), "#section%20details");
  assert.equal(encodePortalFragment("section%20details"), "#section%20details");
  assert.equal(encodePortalFragment("literal%2520escape"), "#literal%2520escape");
  assert.equal(decodePortalFragment("malformed%fragment"), "malformed%fragment");
});

test("Pages publication copies reject stale PDF and manifest bytes", async () => {
  const sourceBytes = Buffer.from("current publication bytes");
  for (const label of [
    "downloads/20-watts-was-enough-full-concept-book.pdf",
    "downloads/book-manifest.json",
  ]) {
    assert.doesNotThrow(() => assertExactPublicationCopy(
      sourceBytes,
      Buffer.from(sourceBytes),
      label,
    ));
    assert.throws(
      () => assertExactPublicationCopy(
        sourceBytes,
        Buffer.from("stale publication bytes"),
        label,
      ),
      new RegExp(`${label.replaceAll(".", "\\.")} differs from its current public source`),
    );
  }

  const validator = await source("scripts/validate-github-pages-build.mjs");
  assert.match(validator, /assertExactPublicationCopy\(publicPdf, pdfHeader, pdfPath\)/u);
  assert.match(
    validator,
    /assertExactPublicationCopy\(publicBookManifest, builtBookManifest, bookManifestPath\)/u,
  );
});

test("Pages builds portal, book, and source-bound help routes with a configurable safe base", async () => {
  const [config, portalEntry, portalHtml, bookEntry, bookIdentity, bookHtml, helpCss, helpHtml] = await Promise.all([
    source("vite.pages.config.ts"),
    source("github-pages/main.tsx"),
    source("github-pages/index.html"),
    source("github-pages/book.tsx"),
    source("app/lib/book-release-identity.mjs"),
    source("github-pages/book/index.html"),
    source("github-pages/help.css"),
    source("github-pages/help/index.html"),
  ]);

  assert.match(config, /import \{ resolvePagesBase \} from ["']\.\/scripts\/lib\/pages-base\.mjs["']/);
  assert.match(config, /const pagesBase = resolvePagesBase\(process\.env\.PAGES_BASE_PATH\)/);
  assert.match(config, /base:\s*pagesBase/);
  assert.doesNotMatch(config, /base:\s*["']\/20-watts-was-enough\/["']/);
  assert.match(config, /root:\s*path\.join\(repositoryRoot,\s*["']github-pages["']\)/);
  assert.match(config, /publicDir:\s*path\.join\(repositoryRoot,\s*["']public["']\)/);
  assert.match(config, /input:\s*\{/);
  assert.match(config, /portal:\s*path\.join\(repositoryRoot,\s*["']github-pages["'],\s*["']index\.html["']\)/);
  assert.match(config, /book:\s*path\.join\(repositoryRoot,\s*["']github-pages["'],\s*["']book["'],\s*["']index\.html["']\)/);
  assert.match(config, /help:\s*path\.join\(repositoryRoot,\s*["']github-pages["'],\s*["']help["'],\s*["']index\.html["']\)/);

  assert.match(portalHtml, /<div id=["']root["']><!-- pages-seo:fallback -->/);
  assert.match(portalHtml, /src=["']\/main\.tsx["']/);
  assert.match(portalHtml, /https:\/\/www\.cordana\.dev\//);
  assert.match(portalHtml, /pages-seo:head/);
  assert.match(portalHtml, /rel=["']canonical["'] href=["']https:\/\/www\.cordana\.dev\/["']/);
  assert.match(portalHtml, /source-linked library below remains available/);
  assertNoLegacyDeploymentHost(portalHtml, "portal HTML must not reference the legacy Pages host");
  assert.doesNotMatch(portalEntry, /vinext|next\/headers|next\/server/);

  assert.match(bookEntry, /<BookEdition/);
  assert.match(bookEntry, /bookSurfaceFromLocation\(window\.location\)/u);
  assert.match(bookIdentity, /parameters\.get\("pdf"\) === "1" && pdfRendererHostnames\.has\(location\.hostname\)/u);
  assert.match(bookEntry, /surface=\{surface\}/);
  assert.match(bookEntry, /assetBasePath=\{import\.meta\.env\.BASE_URL\}/);
  assert.match(bookEntry, /sourceRef=\{sourceRef\}/);
  assert.match(bookHtml, /<div id=["']root["']><!-- pages-seo:fallback -->/);
  assert.match(bookHtml, /src=["']\.\.\/book\.tsx["']/);
  assert.match(bookHtml, /https:\/\/www\.cordana\.dev\/book\//);
  assert.match(bookHtml, /pages-seo:head/);
  assert.match(bookHtml, /rel=["']canonical["'] href=["']https:\/\/www\.cordana\.dev\/book\/["']/);
  assert.match(bookHtml, /complete manuscript above remains readable without JavaScript/);
  assert.match(bookHtml, /Interactive diagrams and edition controls need JavaScript/);
  assertNoLegacyDeploymentHost(bookHtml, "book HTML must not reference the legacy Pages host");
  assert.doesNotMatch(bookEntry, /vinext|next\/headers|next\/server/);

  assert.match(helpCss, /@import ["']\.\.\/app\/globals\.css["']/);
  assert.match(helpHtml, /<div id=["']root["']><!-- pages-seo:fallback -->/);
  assert.match(helpHtml, /href=["']\.\.\/help\.css["']/);
  assert.doesNotMatch(helpHtml, /<script\b/);
  assert.match(helpHtml, /https:\/\/www\.cordana\.dev\/help\//);
  assertNoLegacyDeploymentHost(helpHtml, "help HTML must not reference the legacy Pages host");
});

test("the workflow uses GitHub's Pages artifact and deployment actions", async () => {
  const workflow = await source(".github/workflows/github-pages.yml");
  const packageManifest = JSON.parse(await source("package.json"));

  for (const required of [
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7",
    "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6",
    "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5",
    "actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5",
    "npm ci --no-audit",
    "npm run validate:sources",
    "node --test scripts/source-boundary.test.mjs",
    "npm run test:github-pages",
    "path: dist-github-pages",
    "include-hidden-files: true",
  ]) {
    assert.match(workflow, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /build:\s*\n\s+permissions:\s*\n\s+contents:\s*read/);
  assert.match(workflow, /deploy:\s*\n\s+permissions:\s*\n\s+pages:\s*write\s*\n\s+id-token:\s*write/);
  const topLevelPermissions = workflow.match(/^permissions:\r?\n((?: {2}[^\r\n]+\r?\n)*)/m)?.[1] ?? "";
  assert.match(topLevelPermissions, /contents:\s*read/);
  assert.doesNotMatch(topLevelPermissions, /(?:pages|id-token):/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /env:\s*\n\s+PAGES_BASE_PATH:\s*["']?\/["']?/);
  assert.doesNotMatch(workflow, /\.openai\/hosting|lusoris\.chatgpt\.site/);
  assert.match(workflow, /actions\/(?:checkout|setup-node|configure-pages|upload-pages-artifact|deploy-pages)@[0-9a-f]{40}/);
  assert.ok(
    packageManifest.scripts["test:github-pages"].indexOf("node --test")
      < packageManifest.scripts["test:github-pages"].indexOf("npm run build:github-pages"),
    "focused Pages tests must run before the public build",
  );
});

test("the portal keeps clean-route history and native Markdown links honest on the Pages base", async () => {
  const [portal, markdown, content, entry, portalSeo] = await Promise.all([
    source("app/components/public-research-portal.tsx"),
    source("app/components/markdown-document.tsx"),
    source("app/portal-content.ts"),
    source("github-pages/main.tsx"),
    source("app/lib/portal-seo.ts"),
  ]);

  assert.match(portal, /function initialDocumentPath\(basePath: string\): string \| null/);
  assert.match(portal, /portalDocumentPathFromLocation\(window\.location, basePath\)/);
  assert.match(
    portal,
    /if \(!selectedPath\) return;[\s\S]*loadPortalDocument\([\s\S]*selectedPath,[\s\S]*assetBasePath,[\s\S]*__PUBLICATION_SOURCE_REVISION__/u,
  );
  assert.match(portal, /\{selectedPath && selectedMetadata \? \(/);
  assert.match(portal, /className="portal-dashboard"/);
  assert.match(portal, /NO_RESULT/);
  assert.match(portal, /smokeReady\} development smoke harnesses/);
  assert.doesNotMatch(portal, /smokeReady\} artifacts ready/);
  assert.match(portal, /className="portal-system-figure"/);
  assert.match(portal, /Repository logic, not an experimental result/);
  assert.match(portal, /const catalogPageSize = 8/);
  assert.match(portal, /readerPageRef\.current\?\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.doesNotMatch(portal, /readerRef\.current\?\.scrollIntoView/);
  assert.match(portal, />Read<\/a>/);
  assert.match(portal, />Evidence<\/a>/);
  assert.match(portal, />Experiments /);
  assert.match(portal, />Contribute<\/a>/);
  assertCorpusDrawerSource(portal);
  assert.match(portal, /event\.button === 0[\s\S]*!event\.ctrlKey[\s\S]*!event\.metaKey/);
  assert.match(portal, /section heading match/);
  assert.match(portal, /Open \{step\.label\}/);
  assert.match(portal, /document\.getElementById\(targetId\)\?\.focus\(\)/);
  assert.match(portal, /nonNavigableHref=\{repositoryDocumentHref\}/);
  assert.match(portal, /window\.open\(\s*repositoryDocumentHref\(path, hash\)/);
  assert.match(portal, /portalDocumentLocation\(path, assetBasePath, hash\)/);
  assert.match(portal, /internalHref=\{\(path, hash\) => portalDocumentLocation\(path, assetBasePath, hash\)\}/);
  assert.match(portal, /usePortalSeo\(selectedMetadata\)/);
  assert.doesNotMatch(portal, /`\?doc=\$\{encodeURIComponent\(path\)\}`/);
  assert.match(content, /document\.route === route/);
  assert.match(content, /encodePortalFragment\(hash\)/);
  assert.match(content, /publicationSourceRevisionQuery\(sourceRevision\)/u);
  assert.match(
    content,
    /loadPortalTextAsset\(portalDocumentAssetLocation\(\s*metadata\.path,\s*assetBasePath,\s*sourceRevision,\s*\), \{/u,
  );
  assert.match(
    content,
    /`\$\{normalizedBasePath\(assetBasePath\)\}research-object-records\/\$\{encodedPath\}\.json\$\{publicationSourceRevisionQuery\(sourceRevision\)\}`/u,
  );
  assert.doesNotMatch(content, /documentLocation\.replace\("\/documents\/"/u);
  assert.match(content, /\^\(\?:concept\|math\).*\\\.md\$/);
  assert.match(entry, /new URLSearchParams\(window\.location\.search\)\.get\("doc"\)/);
  assert.match(entry, /window\.location\.replace\(portalDocumentLocation\(/);
  assert.match(entry, /window\.location\.hash\.slice\(1\)/);

  assert.match(markdown, /nonNavigableHref\?:\s*\(path: string, hash: string\) => string/);
  assert.match(
    markdown,
    /href=\{joinAssetBase\(assetBasePath, repositoryArtifactHref\(internal\.path\)\)\}/,
  );
  assert.match(
    markdown,
    /href=\{nonNavigableHref\(internal\.path, internal\.hash\)\}/,
  );
  assert.match(markdown, /const resolvedHref = internalHref && isNavigable/);
  assert.match(markdown, /navigateInternalLink\(event, internal, onNavigate\)/);
  assert.doesNotMatch(markdown, /href=\{repositoryArtifactHref\(internal\.path\)\}/);

  for (const requiredMetadata of [
    'window.document.title = descriptor.title',
    '["name", "description", descriptor.description]',
    '["name", "robots", "index,follow,max-image-preview:large"]',
    '["property", "og:title", descriptor.title]',
    '["property", "og:url", descriptor.canonical]',
    '["name", "twitter:title", descriptor.title]',
    "upsertCanonical(descriptor.canonical)",
    "upsertStructuredData(descriptor.structuredData)",
  ]) {
    assert.ok(portalSeo.includes(requiredMetadata), `portal SEO sync lacks ${requiredMetadata}`);
  }
});

test("portal snapshots stay pending while navigation has no document root", () => {
  const context = {
    document: {
      activeElement: null,
      documentElement: null,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    location: { hash: "", pathname: "/concept/80-energy-model/" },
    innerHeight: 720,
    innerWidth: 320,
  };
  const pending = runInNewContext(portalStateExpression, context, { timeout: 1000 });
  assert.equal(pending.documentReady, false);
  assert.equal(pending.pageClientWidth, undefined);

  context.document.documentElement = { clientWidth: 320, scrollWidth: 320 };
  const ready = runInNewContext(portalStateExpression, context, { timeout: 1000 });
  assert.equal(ready.documentReady, true);
  assert.equal(ready.readerPresent, false);
  assert.equal(ready.pageClientWidth, 320);
  assert.equal(ready.pageScrollWidth, 320);
});

test("portal polling skips only explicit pending snapshots and propagates evaluation errors", async () => {
  let requests = 0;
  let acceptedSnapshots = 0;
  const ready = { documentReady: true, readerPresent: true };
  const cdp = {
    async send(method, { expression }) {
      assert.equal(method, "Runtime.evaluate");
      assert.equal(expression, portalStateExpression);
      requests += 1;
      return { result: { value: requests === 1 ? { documentReady: false } : ready } };
    },
  };
  const observed = await waitForBrowserState(cdp, portalStateExpression, (snapshot) => {
    acceptedSnapshots += 1;
    assert.equal(snapshot.documentReady, true);
    return snapshot.readerPresent;
  }, "pending portal snapshot did not become ready");
  assert.equal(observed, ready);
  assert.equal(requests, 2);
  assert.equal(acceptedSnapshots, 1);

  await assert.rejects(waitForBrowserState({
    async send() {
      return { exceptionDetails: { text: "unexpected evaluation error" } };
    },
  }, portalStateExpression, () => true, "unexpected evaluation failure"), /Browser evaluation failed/);
});

test("portal document routes preserve native links and focus their destination headings", {
  timeout: 120_000,
}, async () => {
  await withPortalBrowser(async (cdp, portalUrl) => {
    const { state: thesisState, thesis } = await openThesisRoute(cdp, portalUrl);
    await exerciseResponsiveCorpusDrawer(cdp);
    await exerciseSearchEscape(cdp);
    const route = await openSidebarRoute(cdp);
    await traverseDocumentHistory(cdp, thesis, thesisState, route);
    const fragment = await openOutlineFragment(cdp);
    await traverseFragmentHistory(cdp, thesis, route, fragment);
    await exerciseSkipToDocumentClearance(cdp, portalUrl);
  });
});

test("only genuinely overflowing Markdown tables become labelled keyboard regions", async () => {
  const [markdown, overflowRegion] = await Promise.all([
    source("app/components/markdown-document.tsx"),
    source("app/components/overflow-region.tsx"),
  ]);

  assert.match(overflowRegion, /region\.scrollWidth > region\.clientWidth \+ 1/);
  assert.match(overflowRegion, /"aria-label": label/);
  assert.match(overflowRegion, /\.\.\.\(descriptionId \? \{ "aria-describedby": descriptionId \} : \{\}\)/);
  assert.match(overflowRegion, /typeof ResizeObserver === "undefined"/);
  assert.match(markdown, /`Scrollable table \$\{tableIndex\} in \$\{documentLabel\}`/);
  assert.match(markdown, /overflowLabel \?\? "Scrollable table"/);
  assert.doesNotMatch(markdown, /tabIndex=\{0\}/);
});

test("focused portal documents have a coherent heading hierarchy", async () => {
  const [portal, researchObjectHeader, markdown] = await Promise.all([
    source("app/components/public-research-portal.tsx"),
    source("app/components/research-object-header.tsx"),
    source("app/components/markdown-document.tsx"),
  ]);

  assert.match(
    portal,
    /<h1 id="portal-reader-title" ref=\{readerTitleRef\} tabIndex=\{-1\}>/,
  );
  assert.doesNotMatch(
    portal,
    /<article[\s\S]{0,200}id="portal-reader"[\s\S]{0,200}tabIndex=\{-1\}/,
  );
  assert.match(portal, /headingId="portal-reader-title"/);
  assert.match(researchObjectHeader, /aria-labelledby=\{headingId\}/);
  assert.doesNotMatch(researchObjectHeader, /<h1/u);
  assert.match(portal, /headingOffset=\{1\}/);
  assert.match(markdown, /headingOffset\?: number/);
  assert.match(markdown, /h1: shiftedHeading\(1, headingOffset\)/);
  assert.match(markdown, /h2: shiftedHeading\(2, headingOffset\)/);
});

test("wide diagrams expose a keyboard region only when they really overflow", async () => {
  const [diagram, overflowRegion] = await Promise.all([
    source("app/components/mermaid-diagram.tsx"),
    source("app/components/overflow-region.tsx"),
  ]);

  assert.match(overflowRegion, /region\.scrollWidth > region\.clientWidth \+ 1/);
  assert.match(
    diagram,
    /\{ descriptionId: captionId, refreshKey: rendered, role: "region" \}/,
  );
  assert.match(overflowRegion, /region\.removeAttribute\("aria-describedby"\)/);
  assert.match(diagram, /\{\.\.\.regionProps\}/);
  assert.match(diagram, /\{overflows \? \(\s*<p className="diagram-layout-note">/);
});

test("code and display math share conditional overflow-region behavior", async () => {
  const [markdown, overflowRegion, stylesheet] = await Promise.all([
    source("app/components/markdown-document.tsx"),
    source("app/components/overflow-region.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(markdown, /useHorizontalOverflowRegion<HTMLPreElement>\(label\)/);
  assert.match(markdown, /useHorizontalOverflowRegion<HTMLSpanElement>\(label\)/);
  assert.match(markdown, /data-overflow-kind="code"/);
  assert.match(markdown, /data-overflow-kind="equation"/);
  assert.match(markdown, /katex-display/);
  assert.match(overflowRegion, /role = "group"/);
  assert.match(overflowRegion, /document\.fonts\?\.ready\.then\(scheduleMeasure\)/);
  assert.match(overflowRegion, /window\.matchMedia\("print"\)/);
  assert.match(overflowRegion, /window\.addEventListener\("beforeprint", retireForPrint\)/);
  assert.match(overflowRegion, /retireAttributes\(\)/);
  assert.match(stylesheet, /\.prose \[data-overflow-kind\]:focus-visible/);
});

test("the portal loads canonical documents on demand and keeps book code off its initial path", async () => {
  const [portal, content, config, validator] = await Promise.all([
    source("app/components/public-research-portal.tsx"),
    source("app/portal-content.ts"),
    source("vite.pages.config.ts"),
    source("scripts/validate-github-pages-build.mjs"),
  ]);

  assert.doesNotMatch(portal, /from ["']\.\.\/book-content["']/);
  assert.match(portal, /from ["']\.\.\/portal-content["']/);
  assert.match(portal, /lazy\(\(\) => import\(["']\.\/markdown-document["']\)/);
  assert.match(
    content,
    /loadPortalTextAsset\(portalDocumentAssetLocation\(\s*metadata\.path,\s*assetBasePath,\s*sourceRevision,\s*\), \{/u,
  );
  assert.match(content, /contentType\.includes\("text\/html"\)/);
  assert.match(content, /Document request returned HTML instead of Markdown/);
  assert.match(config, /virtual:portal-document-index/);
  assert.match(config, /fileName: `documents\/\$\{document\.path\}`/);
  assert.match(validator, /maximumPortalInitialJavaScriptBytes = 400_000/);
  assert.match(validator, /portal document assets do not exactly match the canonical concept\/math corpus/);
  assert.match(validator, /legacyDeploymentReference/);
  assert.match(validator, /if \(pagesBase === ["']\/["']\)/);
  assert.match(validator, /legacy repository-subpath deployment reference/);
});

test("the Pages development server live-reloads canonical Markdown without an HTML fallback", async () => {
  const [config, packageJson] = await Promise.all([
    source("vite.pages.config.ts"),
    source("package.json"),
  ]);

  assert.match(packageJson, /"dev:github-pages":\s*"npm run prepare:reader-artifacts && vite --config vite\.pages\.config\.ts"/);
  assert.match(packageJson, /"build:github-pages":\s*"npm run prepare:reader-artifacts && npm run validate:book-pdf && vite build --config vite\.pages\.config\.ts"/);
  assert.match(config, /configureServer\(server: ViteDevServer\)/);
  assert.match(config, /server\.watcher\.on\("change", reloadPortal\)/);
  assert.match(config, /server\.ws\.send\(\{ type: "full-reload" \}\)/);
  assert.match(
    config,
    /"application\/json; charset=utf-8"[\s\S]*"text\/markdown; charset=utf-8"/u,
  );
  assert.match(config, /const portalDocumentPrefixes = \[\.\.\.new Set\(/);
  assert.match(config, /const portalEvidencePrefixes = \[\.\.\.new Set\(/);
  assert.match(config, /fileName: `research-object-records\/\$\{document\.path\}\.json`/u);
  assert.match(config, /path\.join\(repositoryRoot, "research", "audits"\)/u);
  assert.match(config, /path\.join\(repositoryRoot, "experiments", "candidates"\)/u);
  assert.match(config, /path\.join\(repositoryRoot, "experiments", "fixtures"\)/u);
  assert.match(config, /const document = documents\.find\(/u);
  assert.match(config, /`\$\{pagesBase\}documents\/`/);
  assert.doesNotMatch(config, /["']\/20-watts-was-enough\/documents\/["']/);
});

test("generated Pages Markdown cannot inflate canonical math validation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-pages-math-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "README.md"), "$x$\n");
  for (const directory of ["dist-github-pages/documents", "public/repository-files"]) {
    await mkdir(path.join(root, directory), { recursive: true });
    await writeFile(path.join(root, directory, "generated.md"), "$broken\n");
  }
  const inventory = await collectMathMarkdown(root);
  assert.deepEqual(inventory.files, [path.join(root, "README.md")]);
});

test("the sole public reader names its Git source and release identity", async () => {
  const [portal, book, identity] = await Promise.all([
    source("app/components/public-research-portal.tsx"),
    source("app/components/book-edition.tsx"),
    source("app/lib/book-release-identity.mjs"),
  ]);

  assert.equal(publication.repository, "https://github.com/cordanaLLM/20-watts-was-enough");
  assert.match(portal, /const repositoryUrl = publication\.repository/);
  assert.doesNotMatch(portal, /Owner-only|private Git source/);
  assert.match(identity, /Git main snapshot/);
  assert.match(identity, /Immutable release tag \$\{repositoryRef\}/);
  assert.doesNotMatch(book, /Owner-only|chatgpt\.site/);
});

test("third-party notices include bundler runtimes and accept the project portal index", () => {
  const notices = renderThirdPartyNotices({
    moduleIds: new Set([
      "\0rolldown/runtime.js",
      "\0vite/modulepreload-polyfill.js",
      "\0vite/preload-helper.js",
      "\0virtual:portal-document-index",
    ]),
    repositoryRoot,
  });

  assert.match(notices, /- rolldown@1\.2\.6 — MIT/);
  assert.match(notices, /- vite@8\.2\.2 — MIT/);
  assert.match(notices, /Copyright \(c\) 2024-present VoidZero Inc\. & Contributors/);
  assert.match(notices, /Copyright \(c\) 2019-present, VoidZero Inc\. and Vite contributors/);
});

test("third-party notices fail closed on an unknown virtual bundle module", () => {
  assert.throws(
    () => renderThirdPartyNotices({
      moduleIds: new Set(["\0vite/future-runtime.js"]),
      repositoryRoot,
    }),
    /Unmapped virtual bundle module:.*vite\/future-runtime\.js/,
  );
});
