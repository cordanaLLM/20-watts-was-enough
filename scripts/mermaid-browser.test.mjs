import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { createServer as createViteServer } from "vite";

import {
  connectCdp,
  devtoolsPageFromProfile,
  firstExistingChromium,
  settleCleanupSteps,
  stopProcess,
} from "./lib/chromium-cdp.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profileRemovalOptions = Object.freeze({
  force: true,
  maxRetries: 5,
  recursive: true,
  retryDelay: 100,
});

function keyboardTraceFixture() {
  const listeners = [];
  const region = {
    nodeName: "DIV", isConnected: true, scrollLeft: 0, clientWidth: 246, scrollWidth: 480,
    getAttribute: (name) => name === "data-overflow-kind" ? "table" : "x".repeat(1_000),
  };
  const view = {
    performance: { now: () => 10 },
    document: {
      activeElement: region, visibilityState: "visible",
      hasFocus: () => true, querySelector: () => region,
    },
    addEventListener: (type, listener, options) => listeners.push({ type, listener, options }),
    removeEventListener: (type, listener, options) => {
      const index = listeners.findIndex((item) => (
        item.type === type && item.listener === listener && item.options === options
      ));
      if (index !== -1) listeners.splice(index, 1);
    },
  };
  return { view, region, listeners };
}

test("keyboard diagnostics remain bounded, self-contained and removable", () => {
  const { view, region, listeners } = keyboardTraceFixture();
  const create = vm.runInNewContext("(" + createOverflowKeyboardTrace.toString() + ")");
  const trace = create(view, region, "region");
  const emit = (key) => {
    for (const { listener } of listeners.filter((item) => item.type === "keydown")) {
      listener({
        type: "keydown", key, code: key, keyCode: 39, isTrusted: false,
        defaultPrevented: false, target: region, currentTarget: view,
      });
    }
  };
  emit("Unrelated");
  assert.equal(trace.snapshot().events.length, 0);
  for (let index = 0; index < 100; index += 1) emit("ArrowRight");
  const snapshot = trace.snapshot();
  assert.equal(snapshot.events.length, 64);
  assert.ok(snapshot.dropped > 0);
  assert.equal(snapshot.events[0].isTrusted, false);
  assert.equal(snapshot.events[0].targetIsOriginal, true);
  assert.ok(snapshot.events[0].target.label.length <= 192);
  view.document.querySelector = () => ({});
  region.isConnected = false;
  assert.equal(trace.snapshot().selectorStillOriginal, false);
  assert.equal(trace.snapshot().originalConnected, false);
  let removed = 0;
  trace.sentinel = { remove: () => { removed += 1; } };
  trace.dispose();
  trace.dispose();
  assert.equal(listeners.length, 0);
  assert.equal(removed, 1);
});

test("keyboard diagnostics preserve the primary failure when cleanup fails", async () => {
  let calls = 0;
  const cdp = {
    send: async () => {
      calls += 1;
      if (calls === 1) return { result: { value: false } };
      if (calls === 2) return { result: { value: { observed: "retained" } } };
      throw new Error("diagnostic cleanup failed");
    },
  };
  await assert.rejects(assertArrowKeyScrollsRegion(cdp, "table"), (error) => {
    assert.match(error.message, /table focus sentinel was not ready/u);
    assert.match(error.message, /retained/u);
    assert.match(error.message, /diagnostic cleanup failed/u);
    return true;
  });
  assert.equal(calls, 3);
});

test("keyboard diagnostics bound failure text without replacing the original stack", () => {
  const error = new Error("original failure");
  const originalStack = error.stack;
  appendKeyboardDiagnostic(error, "trace", { text: "x".repeat(40_000) });
  assert.ok(error.message.length < 33_000);
  assert.match(error.message, /\[truncated\]$/u);
  assert.ok(error.stack.startsWith(originalStack));
});

function keyboardSyntaxNodes(fn) {
  const source = ts.createSourceFile("keyboard.js", fn.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(source.parseDiagnostics.length, 0);
  const nodes = [];
  const pending = [source];
  while (pending.length > 0) {
    assert.ok(nodes.length < 4_096);
    const node = pending.pop();
    nodes.push(node);
    const children = [];
    ts.forEachChild(node, (child) => { children.push(child); });
    pending.push(...children.reverse());
  }
  return { source, nodes };
}

test("keyboard diagnostics preserve the exact key protocol and five-second bound", () => {
  const { source, nodes } = keyboardSyntaxNodes(exerciseArrowKeyScrollsRegion);
  const keyCalls = nodes.filter((node) => (
    ts.isCallExpression(node) && node.expression.getText(source) === "cdp.send"
      && node.arguments[0]?.text === "Input.dispatchKeyEvent"
  ));
  const values = keyCalls.map((node) => Object.fromEntries(node.arguments[1].properties.map((property) => {
    assert.ok(ts.isPropertyAssignment(property));
    const value = property.initializer;
    assert.ok(ts.isStringLiteral(value) || ts.isNumericLiteral(value));
    return [property.name.getText(source), ts.isNumericLiteral(value) ? Number(value.text) : value.text];
  })));
  assert.deepEqual(values, [
    { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
    { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
    { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
    { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
  ]);
  const deadline = nodes.find((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === "scrollDeadline");
  assert.ok(ts.isBinaryExpression(deadline.initializer));
  assert.equal(deadline.initializer.left.getText(source), "Date.now()");
  assert.equal(deadline.initializer.operatorToken.kind, ts.SyntaxKind.PlusToken);
  assert.equal(Number(deadline.initializer.right.text), 5_000);
  const timers = nodes.filter((node) => ts.isCallExpression(node) && node.expression.getText(source) === "setTimeout");
  assert.equal(timers.length, 1);
  assert.equal(Number(timers[0].arguments[1].text), 50);
  const { source: overflowSource, nodes: overflowNodes } = keyboardSyntaxNodes(assertBookOverflowRegions);
  const kinds = overflowNodes.find((node) => ts.isVariableDeclaration(node) && node.name.getText(overflowSource) === "requiredKinds");
  assert.deepEqual(kinds.initializer.elements.map((node) => node.text), ["code", "equation", "table", "diagram"]);
});

test("browser process shutdown waits for a stubborn child before profile cleanup", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "20w-browser-stop-"));
  const browserProcess = spawn(process.execPath, [
    "-e",
    `const fs = require("node:fs");
const path = require("node:path");
const profile = process.argv[1];
const active = path.join(profile, "Default");
fs.mkdirSync(active, { recursive: true });
process.on("SIGTERM", () => {});
let sequence = 0;
setInterval(() => fs.writeFileSync(path.join(active, String(sequence++)), "active"), 5);
process.stdout.write("ready\\n");`,
    profile,
  ], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  let exited = false;
  browserProcess.once("exit", () => {
    exited = true;
  });
  try {
    const [ready] = await once(browserProcess.stdout, "data");
    assert.equal(String(ready), "ready\n");
    await stopProcess(browserProcess, { terminationGraceMs: 50, forcedExitWaitMs: 2_000 });
    assert.equal(exited, true, "stopProcess returned before the child exit event");
    if (process.platform !== "win32") assert.equal(browserProcess.signalCode, "SIGKILL");
    await rm(profile, profileRemovalOptions);
    await assert.rejects(access(profile), (error) => error.code === "ENOENT");
  } finally {
    if (!exited) {
      await stopProcess(browserProcess, { terminationGraceMs: 50, forcedExitWaitMs: 2_000 });
    }
    await rm(profile, profileRemovalOptions);
  }
});

test("browser process shutdown is a no-op after exit", async () => {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore", windowsHide: true });
  await once(child, "exit");
  const state = { exitCode: child.exitCode, signalCode: child.signalCode };
  await stopProcess(child, { terminationGraceMs: 1, forcedExitWaitMs: 1 });
  assert.deepEqual({ exitCode: child.exitCode, signalCode: child.signalCode }, state);
});

const diagramSnapshotExpression = `(() => {
  const nodes = [...document.querySelectorAll('.diagram')];
  return {
    href: location.href,
    state: document.readyState,
    loading: document.querySelectorAll('.diagram-loading').length,
    errors: [...document.querySelectorAll('.diagram-error')]
      .map((node) => node.textContent?.slice(0, 500) ?? 'unknown diagram error'),
    diagrams: nodes.length,
    rendered: nodes.filter((node) => node.querySelectorAll('.diagram-canvas > svg').length === 1).length,
    invalid: nodes.flatMap((node, index) => {
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
    }),
    svgIds: nodes.map((node) => node.querySelector('.diagram-canvas > svg')?.id ?? ''),
  };
})()`;

async function overflowRegionSnapshot(cdp) {
  return (await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      regions: [...document.querySelectorAll('.book-prose [data-overflow-kind]')].map((region) => {
        const kind = region.getAttribute('data-overflow-kind');
        const cue = region.parentElement?.querySelector(
          kind === 'diagram'
            ? ':scope > .diagram-layout-note'
            : ':scope > .overflow-region-cue',
        );
        return {
          kind,
          overflows: region.scrollWidth > region.clientWidth + 1,
          role: region.getAttribute('role'),
          label: region.getAttribute('aria-label'),
          describedBy: region.getAttribute('aria-describedby'),
          tabIndex: region.getAttribute('tabindex'),
          tabIndexProperty: region.tabIndex,
          cue: cue
            ? (cue.matches('.overflow-region-cue')
                ? [...cue.children].map((part) => part.textContent?.trim() ?? '').join(' ')
                : cue.textContent?.replace(/\\s+/gu, ' ').trim())
            : null,
          cueHidden: cue?.getAttribute('aria-hidden') ?? null,
        };
      }),
    }))()`,
    returnByValue: true,
  })).result?.value;
}

function assertConditionalOverflowSemantics(snapshot) {
  assert.ok(snapshot.regions.length > 0, JSON.stringify(snapshot));
  for (const region of snapshot.regions) {
    if (region.overflows) {
      const expectedRole = ["code", "equation"].includes(region.kind)
        ? "group"
        : "region";
      assert.equal(region.role, expectedRole, JSON.stringify(region));
      assert.equal(region.tabIndex, "0", JSON.stringify(region));
      assert.equal(region.tabIndexProperty, 0, JSON.stringify(region));
      if (region.kind === "code") {
        assert.match(region.label, /^Scrollable (?:\S+ )?code \d+ in /u);
        assert.equal(region.cue, "Wide code Scroll horizontally ↔");
      } else if (region.kind === "equation") {
        assert.match(region.label, /^Scrollable equation \d+ in /u);
        assert.equal(region.cue, "Wide equation Scroll horizontally ↔");
      } else if (region.kind === "table") {
        assert.match(region.label, /^Scrollable table \d+ in /u);
        assert.equal(region.cue, "Wide table Scroll horizontally ↔");
      } else {
        assert.equal(region.kind, "diagram", JSON.stringify(region));
        assert.match(region.label, /^Scrollable diagram \d+ in /u);
        assert.ok(region.describedBy, JSON.stringify(region));
        assert.equal(
          region.cue,
          "Wide diagram · scroll horizontally on narrow screens",
        );
      }
      if (region.kind !== "diagram") {
        assert.equal(region.describedBy, null, JSON.stringify(region));
      }
      assert.equal(
        region.cueHidden,
        region.kind === "diagram" ? null : "true",
        JSON.stringify(region),
      );
    } else {
      assert.equal(region.role, null, JSON.stringify(region));
      assert.equal(region.label, null, JSON.stringify(region));
      assert.equal(region.describedBy, null, JSON.stringify(region));
      assert.equal(region.tabIndex, null, JSON.stringify(region));
      assert.equal(region.tabIndexProperty, -1, JSON.stringify(region));
      assert.equal(region.cue, null, JSON.stringify(region));
    }
  }
  const labels = snapshot.regions
    .filter((region) => region.overflows)
    .map((region) => region.label);
  assert.equal(new Set(labels).size, labels.length, "Overflow-region labels must be unique");
}

// Serialized into the test page; keep this collector independent of Node scope.
// Handlers observe metadata only. Geometry is read only when a failure is reported.
// A phase's defaultPrevented value does not expose Blink's default-handled state.
function createOverflowKeyboardTrace(view, original, selector) {
  const events = [];
  const listeners = [];
  const identities = new WeakMap();
  let nextIdentity = 0;
  let dropped = 0;
  let disposed = false;
  const describe = (node) => {
    if (!node || typeof node !== "object") return null;
    if (!identities.has(node)) identities.set(node, ++nextIdentity);
    return {
      id: identities.get(node),
      node: node === view ? "window" : String(node.nodeName ?? "").slice(0, 32),
      kind: node.getAttribute?.("data-overflow-kind")?.slice(0, 32) ?? null,
      label: node.getAttribute?.("aria-label")?.slice(0, 192) ?? null,
    };
  };
  const originalIdentity = describe(original);
  const record = (event, phase) => {
    if (disposed) return;
    if (["keydown", "keyup"].includes(event.type) && !["Tab", "ArrowRight"].includes(event.key)) return;
    if (events.length >= 64) { dropped += 1; return; }
    events.push({
      time: view.performance.now(), type: event.type, phase,
      target: describe(event.target), currentTarget: describe(event.currentTarget),
      targetIsOriginal: event.target === original,
      activeIsOriginal: view.document.activeElement === original,
      isTrusted: event.isTrusted, defaultPrevented: event.defaultPrevented,
      key: event.key?.slice(0, 32) ?? null, code: event.code?.slice(0, 32) ?? null,
      keyCode: event.keyCode ?? null, hasFocus: view.document.hasFocus(),
    });
  };
  for (const type of ["keydown", "keyup", "focus", "blur", "focusin", "focusout", "scroll", "scrollend"]) {
    for (const capture of [true, false]) {
      const listener = (event) => record(event, capture ? "capture" : "bubble");
      view.addEventListener(type, listener, capture);
      listeners.push({ type, listener, capture });
    }
  }
  const trace = {
    sentinel: null,
    snapshot: () => ({
      original: originalIdentity, originalConnected: original.isConnected,
      selectorStillOriginal: view.document.querySelector(selector) === original,
      activeIsOriginal: view.document.activeElement === original,
      hasFocus: view.document.hasFocus(), visibility: view.document.visibilityState,
      clientWidth: original.clientWidth, scrollWidth: original.scrollWidth,
      scrollLeft: original.scrollLeft, events: [...events], dropped,
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const { type, listener, capture } of listeners) {
        view.removeEventListener(type, listener, capture);
      }
      trace.sentinel?.remove();
    },
  };
  return trace;
}

function appendKeyboardDiagnostic(error, label, value) {
  const text = JSON.stringify(value);
  const bounded = text.length > 32_768 ? text.slice(0, 32_768) + " [truncated]" : text;
  const detail = label + ": " + bounded;
  const originalStack = error.stack;
  error.message += "\n" + detail;
  if (originalStack) error.stack = originalStack + "\n" + detail;
}

async function disposeOverflowKeyboardTrace(cdp, primary) {
  try {
    const cleanup = await cdp.send("Runtime.evaluate", {
      expression: "try { window.__20wOverflowKeyboardTrace?.dispose(); } finally { delete window.__20wOverflowKeyboardTrace; }",
    }, 2_000);
    if (cleanup.exceptionDetails) throw new Error("Page-side keyboard diagnostic cleanup failed");
  } catch (cleanupError) {
    if (!primary) throw cleanupError;
    appendKeyboardDiagnostic(primary, "Keyboard diagnostic cleanup failed", String(cleanupError).slice(0, 240));
  }
}

async function assertArrowKeyScrollsRegion(cdp, kind) {
  let primary;
  try {
    await exerciseArrowKeyScrollsRegion(cdp, kind);
  } catch (error) {
    primary = error;
    try {
      const diagnostic = await cdp.send("Runtime.evaluate", {
        expression: "window.__20wOverflowKeyboardTrace?.snapshot() ?? null",
        returnByValue: true,
      }, 2_000);
      appendKeyboardDiagnostic(error, kind + " keyboard diagnostic", diagnostic.result?.value ?? diagnostic.exceptionDetails ?? null);
    } catch (diagnosticError) {
      appendKeyboardDiagnostic(error, "Keyboard diagnostic unavailable", String(diagnosticError).slice(0, 240));
    }
    throw error;
  } finally {
    await disposeOverflowKeyboardTrace(cdp, primary);
  }
}

async function exerciseArrowKeyScrollsRegion(cdp, kind) {
  const selector = `.book-prose [data-overflow-kind="${kind}"][tabindex="0"]`;
  const prepared = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const region = document.querySelector(${JSON.stringify(selector)});
      if (!region) return null;
      if (window.__20wOverflowKeyboardTrace) throw new Error('Previous keyboard trace was not disposed');
      window.__20wOverflowKeyboardTrace = (${createOverflowKeyboardTrace.toString()})(window, region, ${JSON.stringify(selector)});
      region.scrollLeft = 0;
      const sentinel = document.createElement('button');
      sentinel.id = 'overflow-focus-sentinel';
      sentinel.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0';
      region.before(sentinel);
      window.__20wOverflowKeyboardTrace.sentinel = sentinel;
      sentinel.focus();
      return document.activeElement === sentinel;
    })()`,
    returnByValue: true,
  })).result?.value;
  assert.equal(prepared, true, `${kind} focus sentinel was not ready`);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  const focused = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const region = document.activeElement;
      const style = getComputedStyle(region);
      document.querySelector('#overflow-focus-sentinel')?.remove();
      return {
        active: region?.getAttribute('data-overflow-kind') === ${JSON.stringify(kind)},
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    })()`,
    returnByValue: true,
  })).result?.value;
  assert.ok(focused?.active, `${kind} overflow region was not focusable`);
  assert.notEqual(focused.outlineStyle, "none", JSON.stringify(focused));
  assert.ok(Number.parseFloat(focused.outlineWidth) > 0, JSON.stringify(focused));

  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
    nativeVirtualKeyCode: 39,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
    nativeVirtualKeyCode: 39,
  });
  const scrollDeadline = Date.now() + 5_000;
  let scrollState;
  do {
    scrollState = (await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const region = document.querySelector(${JSON.stringify(selector)});
        return region ? {
          active: document.activeElement === region,
          clientWidth: region.clientWidth,
          scrollLeft: region.scrollLeft,
          scrollWidth: region.scrollWidth,
        } : null;
      })()`,
      returnByValue: true,
    })).result?.value;
    if (scrollState?.scrollLeft > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < scrollDeadline);
  assert.equal(scrollState?.active, true, JSON.stringify(scrollState));
  assert.ok(
    scrollState?.scrollLeft > 0,
    `${kind} overflow region did not respond to ArrowRight: ${JSON.stringify(scrollState)}`,
  );
}

async function setEmulatedMediaAfterTransition(cdp, media) {
  assert.ok(["print", "screen"].includes(media));
  // Applying print media can paginate the full book before its change event.
  // Keep that driver transition separate from the five-second semantic wait.
  const transitionTimeoutMs = 20_000;
  const deadline = Date.now() + transitionTimeoutMs;
  const remainingMs = () => Math.max(1, deadline - Date.now());
  try {
    const registered = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const query = matchMedia('print');
        const expected = ${media === "print"};
        const previous = query.matches;
        let timer;
        let finish;
        const changed = (event) => {
          if (event.matches === expected) finish(true);
        };
        const promise = new Promise((resolve) => {
          finish = (observed) => {
            clearTimeout(timer);
            query.removeEventListener('change', changed);
            resolve({ observed, matches: query.matches });
          };
          query.addEventListener('change', changed);
          timer = setTimeout(() => finish(false), ${transitionTimeoutMs});
        });
        window.__overflowMediaTransition = { promise, cancel: () => finish(false) };
        return previous;
      })()`,
      returnByValue: true,
    }, remainingMs());
    assert.equal(registered.result?.value, media !== "print");
    await cdp.send("Emulation.setEmulatedMedia", { media }, remainingMs());
    const transitioned = await cdp.send("Runtime.evaluate", {
      expression: "window.__overflowMediaTransition.promise",
      awaitPromise: true,
      returnByValue: true,
    }, remainingMs());
    assert.deepEqual(transitioned.result?.value, {
      observed: true,
      matches: media === "print",
    }, `${media} media-change event did not complete before semantic inspection`);
  } finally {
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        window.__overflowMediaTransition?.cancel();
        delete window.__overflowMediaTransition;
      })()`,
    }, 5_000);
  }
}

async function assertPrintRetiresOverflowSemantics(cdp, expectedRegionCount) {
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      window.__overflowPrintBoundary = null;
      window.addEventListener('beforeprint', () => {
        const regions = [...document.querySelectorAll('.book-prose [data-overflow-kind]')];
        window.__overflowPrintBoundary = {
          count: regions.length,
          labels: regions.filter((region) => region.hasAttribute('aria-label')).length,
          descriptions: regions.filter((region) => region.hasAttribute('aria-describedby')).length,
          roles: regions.filter((region) => region.hasAttribute('role')).length,
          tabStops: regions.filter((region) => region.getAttribute('tabindex') === '0').length,
        };
      }, { once: true });
    })()`,
  });
  // One page triggers the lifecycle boundary without rendering the 400-page book.
  const printed = await cdp.send("Page.printToPDF", {
    pageRanges: "1",
    preferCSSPageSize: true,
    printBackground: true,
  });
  assert.ok(printed.data?.length > 1_000, "Chrome did not return PDF bytes");
  const printBoundary = (await cdp.send("Runtime.evaluate", {
    expression: "window.__overflowPrintBoundary",
    returnByValue: true,
  })).result?.value;
  assert.deepEqual(printBoundary, {
    count: expectedRegionCount,
    labels: 0,
    descriptions: 0,
    roles: 0,
    tabStops: 0,
  });

  const restoreDeadline = Date.now() + 5_000;
  let restored;
  while (Date.now() < restoreDeadline) {
    restored = await overflowRegionSnapshot(cdp);
    if (
      restored.regions.some((region) => region.role === "group")
      && restored.regions.every((region) => region.overflows === (region.role !== null))
    ) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assertConditionalOverflowSemantics(restored);

  await setEmulatedMediaAfterTransition(cdp, "print");
  let print;
  const printDeadline = Date.now() + 5_000;
  while (Date.now() < printDeadline) {
    print = await overflowRegionSnapshot(cdp);
    if (
      print.regions.length === expectedRegionCount
      && print.regions.every((region) => !region.overflows && region.role === null)
    ) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assertConditionalOverflowSemantics(print);
  assert.equal(
    print.regions.every((region) => !region.overflows),
    true,
    `Print content retained horizontal overflow: ${JSON.stringify(print)}`,
  );
  await setEmulatedMediaAfterTransition(cdp, "screen");
}

async function assertBookOverflowRegions(cdp) {
  const requiredKinds = ["code", "equation", "table", "diagram"];
  let narrow;
  const narrowDeadline = Date.now() + 5_000;
  while (Date.now() < narrowDeadline) {
    narrow = await overflowRegionSnapshot(cdp);
    if (
      requiredKinds.every((kind) => (
        narrow.regions.some((region) => region.kind === kind && region.overflows)
      ))
      && narrow.regions.every((region) => region.overflows === (region.role !== null))
    ) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assertConditionalOverflowSemantics(narrow);
  for (const kind of requiredKinds) {
    assert.equal(
      narrow.regions.some((region) => region.kind === kind && region.overflows),
      true,
      `No overflowing ${kind} region was exercised: ${JSON.stringify(narrow)}`,
    );
  }
  const accessibilityTree = await cdp.send("Accessibility.getFullAXTree");
  for (const kind of requiredKinds) {
    const label = narrow.regions.find(
      (region) => region.kind === kind && region.overflows,
    )?.label;
    assert.ok(label, `No overflowing ${kind} label was available`);
    const role = ["code", "equation"].includes(kind) ? "group" : "region";
    assert.equal(
      accessibilityTree.nodes.some((node) => (
        !node.ignored && node.role?.value === role && node.name?.value === label
      )),
      true,
      `${kind} overflow ${role} was absent from the accessibility tree`,
    );
  }
  assert.ok(narrow.scrollWidth <= narrow.clientWidth, JSON.stringify(narrow));
  for (const kind of requiredKinds) await assertArrowKeyScrollsRegion(cdp, kind);

  const narrowOverflowCount = narrow.regions.filter((region) => region.overflows).length;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  let wide;
  const wideDeadline = Date.now() + 5_000;
  while (Date.now() < wideDeadline) {
    wide = await overflowRegionSnapshot(cdp);
    const wideOverflowCount = wide.regions.filter((region) => region.overflows).length;
    if (
      wide.regions.length === narrow.regions.length
      && wide.regions.every((region) => region.overflows === (region.role !== null))
      && wideOverflowCount < narrowOverflowCount
    ) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assertConditionalOverflowSemantics(wide);
  assert.ok(
    wide.regions.filter((region) => region.overflows).length < narrowOverflowCount,
    `Resize did not retire any overflow regions: ${JSON.stringify({ narrow, wide })}`,
  );
  assert.ok(wide.scrollWidth <= wide.clientWidth, JSON.stringify(wide));
  await assertPrintRetiresOverflowSemantics(cdp, wide.regions.length);
}

async function assertBookReflowSurface(cdp, address) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const reflow = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const root = document.documentElement;
      const fieldCoverage = document.querySelector('#book-research-field-coverage-md .book-prose');
      const wideRegions = [...document.querySelectorAll('.diagram-wide .diagram-scroll-region')];
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        fieldCoverage: fieldCoverage && {
          clientWidth: fieldCoverage.clientWidth,
          scrollWidth: fieldCoverage.scrollWidth,
        },
        wideRegions: wideRegions.length,
        locallyOverflowing: wideRegions.filter(
          (region) => region.scrollWidth > region.clientWidth + 1,
        ).length,
      };
    })()`,
    returnByValue: true,
  })).result?.value;
  assert.ok(reflow.fieldCoverage, JSON.stringify(reflow));
  assert.ok(reflow.wideRegions > 0, JSON.stringify(reflow));
  assert.equal(reflow.locallyOverflowing, reflow.wideRegions, JSON.stringify(reflow));
  assert.ok(reflow.fieldCoverage.scrollWidth <= reflow.fieldCoverage.clientWidth, JSON.stringify(reflow));
  assert.ok(reflow.scrollWidth <= reflow.clientWidth, JSON.stringify(reflow));
  await assertBookOverflowRegions(cdp);

  // This layout models a 1,440-device-pixel surface at DPR 2.
  // DPR emulation alone is not a browser-zoom or text-zoom assertion.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 600,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const bookUrl = `http://127.0.0.1:${address.port}/book/`;
  const navigation = await cdp.send("Page.navigate", { url: bookUrl });
  assert.equal(navigation.errorText, undefined);
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `document.readyState === "complete" && document.querySelectorAll(".book-actions > *").length === 4`,
      returnByValue: true,
    });
    ready = result.result?.value === true;
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "Web-book actions did not render in the 720 CSS pixel lane");
  const denseViewport = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const root = document.documentElement;
      const actions = document.querySelector('.book-actions');
      const bounds = actions?.getBoundingClientRect();
      const controls = [...(actions?.children ?? [])].map((control) => {
        const rect = control.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        devicePixelRatio,
        actions: bounds && { left: bounds.left, right: bounds.right },
        controls,
      };
    })()`,
    returnByValue: true,
  })).result?.value;
  assert.equal(denseViewport.devicePixelRatio, 2, JSON.stringify(denseViewport));
  assert.ok(denseViewport.actions, JSON.stringify(denseViewport));
  assert.ok(
    denseViewport.actions.left >= 0 && denseViewport.actions.right <= denseViewport.clientWidth,
    JSON.stringify(denseViewport),
  );
  assert.equal(
    denseViewport.controls.every(
      (control) => control.left >= 0 && control.right <= denseViewport.clientWidth,
    ),
    true,
    JSON.stringify(denseViewport),
  );
  assert.ok(
    denseViewport.scrollWidth <= denseViewport.clientWidth,
    JSON.stringify(denseViewport),
  );
}

async function assertMobilePortalSurface(cdp, address) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const portalUrl = `http://127.0.0.1:${address.port}/`;
  const navigation = await cdp.send("Page.navigate", { url: portalUrl });
  assert.equal(navigation.errorText, undefined);
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `document.readyState === "complete" && Boolean(document.querySelector(".language-access > summary"))`,
      returnByValue: true,
    });
    ready = result.result?.value === true;
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "Portal language control did not render");
  await openLanguageControlWithKeyboard(cdp);
  const snapshot = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const panel = document.querySelector(".language-access-panel");
      const select = panel?.querySelector("select");
      const help = panel?.querySelector(".language-access-help");
      const panelRect = panel?.getBoundingClientRect();
      const selectRect = select?.getBoundingClientRect();
      const parseColour = (value) => {
        const channels = value.match(/[0-9.]+/g)?.map(Number) ?? [];
        return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
      };
      const composite = (foreground, background) => {
        const alpha = foreground[3];
        return [
          foreground[0] * alpha + background[0] * (1 - alpha),
          foreground[1] * alpha + background[1] * (1 - alpha),
          foreground[2] * alpha + background[2] * (1 - alpha),
          1,
        ];
      };
      const backgroundFor = (node) => {
        const chain = [];
        for (let current = node; current; current = current.parentElement) chain.push(current);
        return chain.reverse().reduce((background, current) => (
          composite(parseColour(getComputedStyle(current).backgroundColor), background)
        ), [255, 255, 255, 1]);
      };
      const luminance = (colour) => {
        const values = colour.slice(0, 3).map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
      };
      const contrastFor = (selector) => {
        const node = document.querySelector(selector);
        const background = backgroundFor(node);
        const foreground = composite(parseColour(getComputedStyle(node).color), background);
        const light = Math.max(luminance(foreground), luminance(background));
        const dark = Math.min(luminance(foreground), luminance(background));
        return (light + 0.05) / (dark + 0.05);
      };
      return {
        clientWidth: document.documentElement.clientWidth,
        contrast: {
          funnelIndex: contrastFor(".portal-funnel-index"),
          statusLabel: contrastFor(".portal-overview-metrics dt"),
        },
        scrollWidth: document.documentElement.scrollWidth,
        expandedByKeyboard: document.querySelector(".language-access")?.open === true,
        focusedOutline: getComputedStyle(document.activeElement).outlineStyle,
        focusedOutlineWidth: getComputedStyle(document.activeElement).outlineWidth,
        label: panel?.querySelector('label[for="site-language"]')?.textContent,
        optionCodes: [...(select?.options ?? [])].map((option) => option.value),
        help: help && { href: help.href, text: help.textContent.trim() },
        panel: panelRect && { left: panelRect.left, right: panelRect.right, width: panelRect.width },
        select: selectRect && { left: selectRect.left, right: selectRect.right, width: selectRect.width },
      };
    })()`,
    returnByValue: true,
  })).result?.value;
  assert.ok(snapshot.panel, JSON.stringify(snapshot));
  assert.ok(snapshot.select, JSON.stringify(snapshot));
  assert.equal(snapshot.expandedByKeyboard, true, JSON.stringify(snapshot));
  assert.equal(snapshot.focusedOutline, "solid", JSON.stringify(snapshot));
  assert.equal(snapshot.focusedOutlineWidth, "3px", JSON.stringify(snapshot));
  assert.equal(snapshot.label, "Read this page", JSON.stringify(snapshot));
  assert.deepEqual(snapshot.optionCodes, ["en"], JSON.stringify(snapshot));
  assert.equal(snapshot.help?.text, "Help add or review a language", JSON.stringify(snapshot));
  assert.match(snapshot.help?.href ?? "", /template=translation-problem\.yml/u);
  assert.ok(snapshot.panel.left >= 0, JSON.stringify(snapshot));
  assert.ok(snapshot.panel.right <= snapshot.clientWidth, JSON.stringify(snapshot));
  assert.ok(snapshot.select.left >= 0, JSON.stringify(snapshot));
  assert.ok(snapshot.select.right <= snapshot.clientWidth, JSON.stringify(snapshot));
  assert.ok(snapshot.scrollWidth <= snapshot.clientWidth, JSON.stringify(snapshot));
  assert.ok(snapshot.contrast.statusLabel >= 4.5, JSON.stringify(snapshot));
  assert.ok(snapshot.contrast.funnelIndex >= 4.5, JSON.stringify(snapshot));
  await assertConstrainedMobileMenu(cdp);
}

async function assertConstrainedMobileMenu(cdp) {
  // This is the 360 x 225 CSS-pixel reflow boundary produced by a 720 x 450
  // device-pixel surface at DPR 2. It checks containment, not zoom conformance.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 225,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const snapshot = (await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      document.querySelector(".language-access")?.removeAttribute("open");
      const menu = document.querySelector(".portal-mobile-menu");
      menu?.setAttribute("open", "");
      const panel = menu?.querySelector("nav");
      const lastLink = panel?.querySelector("a:last-child");
      lastLink?.focus();
      const root = document.documentElement;
      const panelRect = panel?.getBoundingClientRect();
      const lastLinkRect = lastLink?.getBoundingClientRect();
      return {
        activeIsLastLink: document.activeElement === lastLink,
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        viewportHeight: innerHeight,
        panel: panel && panelRect && {
          bottom: panelRect.bottom,
          clientHeight: panel.clientHeight,
          overflowY: getComputedStyle(panel).overflowY,
          scrollHeight: panel.scrollHeight,
          scrollTop: panel.scrollTop,
          top: panelRect.top,
        },
        lastLink: lastLinkRect && {
          bottom: lastLinkRect.bottom,
          top: lastLinkRect.top,
        },
      };
    })()`,
    returnByValue: true,
  })).result?.value;
  assert.ok(snapshot.panel, JSON.stringify(snapshot));
  assert.ok(snapshot.lastLink, JSON.stringify(snapshot));
  assert.equal(snapshot.panel.overflowY, "auto", JSON.stringify(snapshot));
  assert.ok(snapshot.panel.bottom <= snapshot.viewportHeight + 1, JSON.stringify(snapshot));
  assert.ok(snapshot.panel.scrollHeight > snapshot.panel.clientHeight, JSON.stringify(snapshot));
  assert.ok(snapshot.panel.scrollTop > 0, JSON.stringify(snapshot));
  assert.equal(snapshot.activeIsLastLink, true, JSON.stringify(snapshot));
  assert.ok(snapshot.lastLink.top >= snapshot.panel.top - 1, JSON.stringify(snapshot));
  assert.ok(snapshot.lastLink.bottom <= snapshot.panel.bottom + 1, JSON.stringify(snapshot));
  assert.ok(snapshot.scrollWidth <= snapshot.clientWidth, JSON.stringify(snapshot));
}

async function openLanguageControlWithKeyboard(cdp) {
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector(".language-access > summary").focus()`,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "char",
    text: " ",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
}

test("browser rendering keeps Mermaid stable and wide publication content keyboard operable", {
  // The tighter phase deadlines remain authoritative. This outer budget lets
  // each phase exhaust its own bound and still covers deterministic cleanup.
  timeout: 360_000,
}, async (t) => {
  const browser = await firstExistingChromium();
  const profile = await mkdtemp(path.join(os.tmpdir(), "20w-mermaid-browser-"));
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
    const bookUrl = `http://127.0.0.1:${address.port}/book/?pdf=1&ref=main`;
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
      "--window-size=1440,1200",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: "ignore", windowsHide: true });

    cdp = await connectCdp(
      await devtoolsPageFromProfile(browserProcess, profile, { signal: t.signal }),
      { signal: t.signal },
    );
    const version = await cdp.send("Browser.getVersion");
    t.diagnostic("Browser identity: " + JSON.stringify({
      path: browser.slice(0, 512),
      product: String(version.product ?? "").slice(0, 192),
      revision: String(version.revision ?? "").slice(0, 192),
      protocolVersion: String(version.protocolVersion ?? "").slice(0, 64),
    }));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const navigation = await cdp.send("Page.navigate", { url: bookUrl });
    assert.equal(navigation.errorText, undefined);

    const deadline = Date.now() + 180_000;
    let ready = false;
    let snapshot;
    while (Date.now() < deadline) {
      const result = await cdp.send("Runtime.evaluate", {
        expression: diagramSnapshotExpression,
        returnByValue: true,
      });
      snapshot = result.result?.value;
      if (snapshot?.errors?.length) break;
      if (
        snapshot?.href === bookUrl &&
        snapshot.state === "complete" &&
        snapshot.diagrams >= 2 &&
        snapshot.loading === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    assert.equal(ready, true, `Book diagrams did not become ready: ${JSON.stringify(snapshot)}`);
    assert.ok(snapshot?.diagrams >= 2, `Book diagrams did not render: ${JSON.stringify(snapshot)}`);
    assert.deepEqual(snapshot.errors, []);
    await new Promise((resolve) => setTimeout(resolve, 1_250));

    const first = (await cdp.send("Runtime.evaluate", {
      expression: diagramSnapshotExpression,
      returnByValue: true,
    })).result?.value;
    assert.equal(first.rendered, first.diagrams, JSON.stringify(first.invalid));
    assert.deepEqual(first.invalid, []);
    assert.equal(new Set(first.svgIds).size, first.diagrams, "Mermaid SVG IDs must be unique");
    assert.equal(first.svgIds.every(Boolean), true, "Every Mermaid SVG must retain an ID");

    await new Promise((resolve) => setTimeout(resolve, 750));
    const stable = (await cdp.send("Runtime.evaluate", {
      expression: diagramSnapshotExpression,
      returnByValue: true,
    })).result?.value;
    assert.deepEqual(stable.invalid, []);
    assert.equal(stable.rendered, stable.diagrams);
    assert.deepEqual(stable.svgIds, first.svgIds, "Mermaid SVG identity changed after readiness");

    await assertBookReflowSurface(cdp, address);
    await assertMobilePortalSurface(cdp, address);
  } finally {
    await settleCleanupSteps([
      async () => cdp?.socket.close(),
      async () => stopProcess(browserProcess),
      async () => vite?.close(),
      async () => rm(profile, profileRemovalOptions),
    ]);
  }
});
