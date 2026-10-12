import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ChromeDevToolsProtocolError,
  PdfPrintRetryExhaustedError,
  connectCdp,
  devtoolsPage,
  firstExistingChromium,
  printPageToPdf,
  settleCleanupSteps,
  waitForDevtoolsPort,
  waitForUrl,
} from "./chromium-cdp.mjs";

function controlledClock() {
  let milliseconds = 0;
  return {
    advance(value) {
      milliseconds += value;
    },
    now() {
      return milliseconds;
    },
    async wait(value) {
      milliseconds += value;
    },
  };
}

function printingFailed() {
  return new ChromeDevToolsProtocolError(
    "Page.printToPDF",
    { code: -32_000, message: "Printing failed", data: "not exposed" },
  );
}

test("Chrome DevTools protocol errors retain bounded method, code, and message diagnostics", () => {
  const error = new ChromeDevToolsProtocolError(
    "Page.printToPDF",
    { code: -32_000, message: "Printing failed", data: "not exposed" },
  );

  assert.equal(error.name, "ChromeDevToolsProtocolError");
  assert.equal(error.method, "Page.printToPDF");
  assert.equal(error.code, -32_000);
  assert.equal(error.protocolMessage, "Printing failed");
  assert.match(error.message, /Page\.printToPDF failed \(-32000\): Printing failed/u);
  assert.doesNotMatch(error.message, /not exposed/u);
});

test("PDF printing retries the exact terminal Chrome failure once inside the original budget", async () => {
  const clock = controlledClock();
  const calls = [];
  const retries = [];
  const cdp = {
    async send(method, params, timeoutMs) {
      calls.push({ method, params, timeoutMs });
      if (calls.length === 1) {
        clock.advance(20);
        throw printingFailed();
      }
      return { data: "JVBERi0=" };
    },
  };
  const params = { printBackground: true };

  const result = await printPageToPdf(cdp, params, {
    clock,
    onRetry: (retry) => retries.push(retry),
    retryDelayMs: 10,
    totalTimeoutMs: 100,
  });

  assert.deepEqual(result, { data: "JVBERi0=" });
  assert.deepEqual(calls, [
    { method: "Page.printToPDF", params, timeoutMs: 100 },
    { method: "Page.printToPDF", params, timeoutMs: 70 },
  ]);
  assert.deepEqual(retries, [{
    attempt: 1,
    delayMs: 10,
    nextAttempt: 2,
    remainingMs: 80,
  }]);
});

test("PDF printing does not retry a different protocol failure", async () => {
  const failure = new ChromeDevToolsProtocolError(
    "Page.printToPDF",
    { code: -32_000, message: "Invalid print parameters" },
  );
  let calls = 0;
  const cdp = {
    async send() {
      calls += 1;
      throw failure;
    },
  };

  await assert.rejects(
    printPageToPdf(cdp, {}, { retryDelayMs: 1, totalTimeoutMs: 10 }),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
});

test("PDF printing reports typed exhaustion after the sole retry also fails", async () => {
  // A controlled clock keeps both attempts inside the 10 ms budget. With the wall clock a
  // loaded host can spend the budget before the retry, which correctly yields one attempt.
  const clock = controlledClock();
  let calls = 0;
  const cdp = {
    async send() {
      calls += 1;
      clock.advance(1);
      throw printingFailed();
    },
  };

  await assert.rejects(
    printPageToPdf(cdp, {}, { clock, retryDelayMs: 1, totalTimeoutMs: 10 }),
    (error) => {
      assert.ok(error instanceof PdfPrintRetryExhaustedError);
      assert.equal(error.attempts, 2);
      assert.equal(error.totalTimeoutMs, 10);
      assert.ok(error.cause instanceof ChromeDevToolsProtocolError);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("PDF printing does not begin a retry that cannot fit inside the total budget", async () => {
  const clock = controlledClock();
  let calls = 0;
  let waited = false;
  clock.wait = async () => {
    waited = true;
  };
  const cdp = {
    async send() {
      calls += 1;
      clock.advance(95);
      throw printingFailed();
    },
  };

  await assert.rejects(
    printPageToPdf(cdp, {}, { clock, retryDelayMs: 10, totalTimeoutMs: 100 }),
    (error) => {
      assert.ok(error instanceof PdfPrintRetryExhaustedError);
      assert.equal(error.attempts, 1);
      return true;
    },
  );
  assert.equal(calls, 1);
  assert.equal(waited, false);
});

test("PDF printing rejects an empty success response without retrying", async () => {
  let calls = 0;
  const cdp = {
    async send() {
      calls += 1;
      return {};
    },
  };

  await assert.rejects(
    printPageToPdf(cdp, {}, { retryDelayMs: 1, totalTimeoutMs: 10 }),
    /returned no PDF data/u,
  );
  assert.equal(calls, 1);
});

test("local URL readiness returns the original successful response and request URL", async (t) => {
  const url = "http://127.0.0.1:3137/book/?pdf=1&ref=main";
  let cancelled = false;
  const response = { ok: true, body: { async cancel() { cancelled = true; } } };
  const request = t.mock.method(globalThis, "fetch", async (requested, options) => {
    assert.equal(requested, url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return response;
  });

  assert.equal(await waitForUrl(url, null), response);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(cancelled, false);
});

test("local URL readiness rejects exited processes before fetching", async (t) => {
  for (const [process, expected] of [
    [{ exitCode: null, signalCode: "SIGKILL" }, /exited with signal SIGKILL/u],
    [{ exitCode: 0, signalCode: null }, /exited with code 0/u],
    [{ exitCode: 7, signalCode: null }, /exited with code 7/u],
  ]) {
    await t.test(expected.source, async (t) => {
      const request = t.mock.method(globalThis, "fetch", async () => ({ ok: true }));
      await assert.rejects(waitForUrl("http://127.0.0.1/book/", process), expected);
      assert.equal(request.mock.callCount(), 0);
    });
  }
});

test("local URL timeout reports HTTP status without credentials, query, fragment or body", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const url = "http://private-user:private-password@127.0.0.1/book/?token=private-query#private-fragment";
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async (requested) => {
    assert.equal(requested, url);
    t.mock.timers.setTime(100);
    return {
      ok: false,
      status: 503,
      statusText: "private-status-text",
      headers: { authorization: "private-header" },
      body: { async cancel() { cancelled = true; } },
      async text() { throw new Error("private-body must not be read"); },
    };
  });

  await assert.rejects(waitForUrl(url, null, 100), (error) => {
    assert.equal(error.message,
      "Timed out waiting for http://127.0.0.1/book/. Last attempt: HTTP 503.");
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(error.stack, /private-/u);
    return true;
  });
  assert.equal(cancelled, true);
});

test("local URL timeout exposes only known fetch classifications", async (t) => {
  const cases = [
    [new TypeError("private-message", { cause: { code: "ECONNREFUSED", message: "private-cause" } }),
      "fetch failed (ECONNREFUSED)"],
    [Object.assign(new Error("private-message"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
      "fetch failed (UND_ERR_CONNECT_TIMEOUT)"],
    [new DOMException("private-message", "TimeoutError"), "fetch timed out"],
    [new DOMException("private-message", "AbortError"), "fetch aborted"],
    [new TypeError("private-message"), "fetch failed (TypeError)"],
    [Object.assign(new Error("private-message"), {
      name: "private-name", code: "private-code".repeat(1_000),
    }), "fetch failed (unclassified error)"],
  ];
  for (const [failure, expected] of cases) {
    await t.test(expected, async (t) => {
      t.mock.timers.enable({ apis: ["Date"], now: 0 });
      t.mock.method(globalThis, "fetch", async () => {
        t.mock.timers.setTime(100);
        throw failure;
      });
      await assert.rejects(waitForUrl("http://127.0.0.1/book/", null, 100), (error) => {
        assert.equal(error.message,
          `Timed out waiting for http://127.0.0.1/book/. Last attempt: ${expected}.`);
        assert.equal(error.cause, undefined);
        assert.doesNotMatch(error.stack, /private-/u);
        return true;
      });
    });
  }
});

test("local URL timeout retains only the latest failure across bounded polling", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "AbortSignal.timeout"], now: 0 });
  let attempts = 0;
  let cancelled = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("private", { cause: { code: "ECONNREFUSED" } });
    t.mock.timers.setTime(700);
    return { ok: false, status: 503, body: { async cancel() { cancelled += 1; } } };
  });
  const waiting = assert.rejects(waitForUrl("http://127.0.0.1/book/", null, 700), (error) => {
    assert.match(error.message, /Last attempt: HTTP 503\./u);
    assert.doesNotMatch(error.message, /ECONNREFUSED/u);
    return true;
  });
  await Promise.resolve();
  t.mock.timers.tick(350);
  await waiting;
  assert.equal(attempts, 2);
  assert.equal(cancelled, 1);
});

test("local URL timeout still cleans non-success responses when cancellation fails", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  let cancelled = 0;
  t.mock.method(globalThis, "fetch", async () => {
    t.mock.timers.setTime(100);
    return {
      ok: false,
      status: 503,
      body: { async cancel() { cancelled += 1; throw new Error("private-cleanup"); } },
    };
  });
  await assert.rejects(waitForUrl("http://127.0.0.1/book/", null, 100), (error) => {
    assert.match(error.message, /Last attempt: HTTP 503; response cleanup failed\./u);
    assert.doesNotMatch(error.stack, /private-cleanup/u);
    return true;
  });
  assert.equal(cancelled, 1);
});

test("local URL readiness reports a process signal during the final failed request", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const process = { exitCode: null, signalCode: null };
  const request = t.mock.method(globalThis, "fetch", async () => {
    process.signalCode = "SIGKILL";
    t.mock.timers.setTime(100);
    throw new TypeError("private-failure");
  });
  await assert.rejects(waitForUrl("http://127.0.0.1/book/", process, 100),
    /Required process exited with signal SIGKILL\./u);
  assert.equal(request.mock.callCount(), 1);
});

test("local URL readiness reports a process signal during the final polling delay", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "AbortSignal.timeout"], now: 0 });
  const process = { exitCode: null, signalCode: null };
  const request = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("unavailable"); });
  const waiting = assert.rejects(waitForUrl("http://127.0.0.1/book/", process, 350),
    /Required process exited with signal SIGKILL\./u);
  await Promise.resolve();
  process.signalCode = "SIGKILL";
  t.mock.timers.tick(350);
  await waiting;
  assert.equal(request.mock.callCount(), 1);
});

test("local URL requests expire within the remaining overall budget", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("test deadline", "TimeoutError")), milliseconds);
    return controller.signal;
  });
  let attemptSignal;
  const request = t.mock.method(globalThis, "fetch", async (url, { signal }) => {
    attemptSignal = signal;
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  const waiting = assert.rejects(waitForUrl("http://127.0.0.1/book/", null, 100),
    /Last attempt: fetch timed out\./u);
  t.mock.timers.tick(99);
  assert.equal(attemptSignal.aborted, false);
  t.mock.timers.tick(1);
  await waiting;
  assert.equal(attemptSignal.aborted, true);
  assert.equal(request.mock.callCount(), 1);
});

test("local URL diagnostics bound or omit unusual endpoint labels", async (t) => {
  for (const url of [
    `http://127.0.0.1/${"x".repeat(10_000)}?private-query`,
    "data:text/plain,private-body",
    "invalid private-url",
  ]) {
    await t.test(url.slice(0, 32), async (t) => {
      t.mock.timers.enable({ apis: ["Date"], now: 0 });
      t.mock.method(globalThis, "fetch", async () => {
        t.mock.timers.setTime(100);
        throw new TypeError("private-failure");
      });
      await assert.rejects(waitForUrl(url, null, 100), (error) => {
        assert.ok(error.message.length < 400);
        assert.doesNotMatch(error.stack, /private-/u);
        return true;
      });
    });
  }
});

test("local URL readiness retains the default total and per-request timeout", { timeout: 1_000 }, async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const attemptTimeout = t.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  const request = t.mock.method(globalThis, "fetch", async () => {
    t.mock.timers.setTime(60_000);
    throw new TypeError("unavailable");
  });
  await assert.rejects(waitForUrl("http://127.0.0.1/book/", null), /Timed out waiting/u);
  assert.equal(request.mock.callCount(), 1);
  assert.deepEqual(attemptTimeout.mock.calls.map((call) => call.arguments), [[2_000]]);
});

test("local URL readiness stops at caller cancellation", async (t) => {
  const controller = new AbortController();
  const reason = new Error("cancel URL wait");
  const request = t.mock.method(globalThis, "fetch", async (url, { signal }) => {
    assert.equal(signal.aborted, false);
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  const waiting = waitForUrl(
    "http://127.0.0.1:1/not-listening",
    null,
    60_000,
    controller.signal,
  );
  controller.abort(reason);
  await assert.rejects(waiting, (error) => error === reason);
  assert.equal(request.mock.callCount(), 1);
  await assert.rejects(waitForUrl("http://127.0.0.1/book/", null, 60_000, controller.signal),
    (error) => error === reason);
  assert.equal(request.mock.callCount(), 1);
});

test("Chrome-assigned debugging port is read from one bounded profile file", async (t) => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "20w-devtools-port-test-"));
  t.after(() => rm(profile, { recursive: true, force: true }));
  await writeFile(
    path.join(profile, "DevToolsActivePort"),
    "37587\n/devtools/browser/01234567-89ab-cdef-0123-456789abcdef\n",
  );
  const browserProcess = { exitCode: null, signalCode: null };
  assert.equal(await waitForDevtoolsPort(profile, browserProcess), 37_587);

  await writeFile(
    path.join(profile, "DevToolsActivePort"),
    Buffer.alloc(513, "x"),
  );
  await assert.rejects(
    waitForDevtoolsPort(profile, browserProcess),
    /invalid or oversized|exceeds its byte limit/u,
  );
});

test("a busy DevTools port file is retried inside the bounded wait", async (t) => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "20w-devtools-port-busy-test-"));
  t.after(() => rm(profile, { recursive: true, force: true }));
  await writeFile(
    path.join(profile, "DevToolsActivePort"),
    "37587\n/devtools/browser/01234567-89ab-cdef-0123-456789abcdef\n",
  );
  const browserProcess = { exitCode: null, signalCode: null };
  const { open } = await import("node:fs/promises");
  let attempts = 0;
  const busyTwice = (file, flags) => {
    attempts += 1;
    if (attempts <= 2) throw Object.assign(new Error("resource busy or locked"), { code: "EBUSY" });
    return open(file, flags);
  };
  assert.equal(await waitForDevtoolsPort(profile, browserProcess, { openFile: busyTwice }), 37_587);
  assert.equal(attempts, 3);

  const alwaysBusy = () => { throw Object.assign(new Error("resource busy or locked"), { code: "EBUSY" }); };
  await assert.rejects(
    waitForDevtoolsPort(profile, browserProcess, { openFile: alwaysBusy, timeoutMs: 250 }),
    /Timed out waiting for Chrome to publish its DevTools port/u,
  );

  const denied = () => { throw Object.assign(new Error("operation not permitted"), { code: "EACCES" }); };
  await assert.rejects(
    waitForDevtoolsPort(profile, browserProcess, { openFile: denied }),
    (error) => error.code === "EACCES",
  );
});

function targetList(targets) {
  return { ok: true, async json() { return targets; } };
}

const pageSocket = "ws://127.0.0.1:37587/devtools/page/0123456789ABCDEF0123456789ABCDEF";
const runningBrowser = Object.freeze({ exitCode: null, signalCode: null });

test("a target list without a page is read again until the page target appears", async (t) => {
  const lists = [
    [],
    [{ type: "browser", webSocketDebuggerUrl: "ws://127.0.0.1:37587/devtools/browser/0" }],
    [{ type: "page" }],
    [{ type: "service_worker" }, { type: "page", webSocketDebuggerUrl: pageSocket }],
  ];
  const request = t.mock.method(globalThis, "fetch", async (requested) => {
    assert.equal(requested, "http://127.0.0.1:37587/json/list");
    return targetList(lists[Math.min(request.mock.callCount(), lists.length - 1)]);
  });

  assert.equal(await devtoolsPage(runningBrowser, 37_587), pageSocket);
  assert.equal(request.mock.callCount(), 4);
});

test("a page target in the first list is returned after one read", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () => targetList([
    { type: "page", webSocketDebuggerUrl: pageSocket },
  ]));

  assert.equal(await devtoolsPage(runningBrowser, 37_587), pageSocket);
  assert.equal(request.mock.callCount(), 1);
});

test("a browser that never lists a page target fails inside the bounded wait", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () => targetList([{ type: "browser" }]));
  const started = Date.now();

  await assert.rejects(
    devtoolsPage(runningBrowser, 37_587, { timeoutMs: 250 }),
    /The headless browser did not expose a page target/u,
  );
  assert.ok(request.mock.callCount() >= 2, "the list must be read more than once");
  assert.ok(Date.now() - started < 2_000, "the wait must end near its own bound");
});

test("the page target wait rejects invalid ports, bounds and an exited browser before reading", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () => targetList([]));

  for (const port of [0, 65_536, 1.5, "37587"]) {
    await assert.rejects(devtoolsPage(runningBrowser, port), /port must be an integer from 1 through 65535/u);
  }
  for (const timeoutMs of [0, 300_001, 1.5]) {
    await assert.rejects(
      devtoolsPage(runningBrowser, 37_587, { timeoutMs }),
      /DevTools page target wait timeout must be an integer from 1 through 300000 milliseconds/u,
    );
  }
  await assert.rejects(
    devtoolsPage({ exitCode: 1, signalCode: null }, 37_587),
    /exited with code 1/u,
  );
  assert.equal(request.mock.callCount(), 0);
});

test("the page target wait stops at caller cancellation between two reads", async (t) => {
  const controller = new AbortController();
  const reason = new Error("caller stopped the browser start");
  const request = t.mock.method(globalThis, "fetch", async () => {
    queueMicrotask(() => controller.abort(reason));
    return targetList([]);
  });

  await assert.rejects(
    devtoolsPage(runningBrowser, 37_587, { signal: controller.signal }),
    (error) => error === reason,
  );
  assert.equal(request.mock.callCount(), 1);
});

test("caller cancellation closes DevTools and rejects pending commands", async () => {
  class FakeSocket extends EventTarget {
    readyState = 0;

    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }

    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }

    send() {}
  }

  const socket = new FakeSocket();
  const controller = new AbortController();
  const connected = connectCdp("ws://127.0.0.1/devtools/page/test", {
    commandTimeoutMs: 10_000,
    openTimeoutMs: 10_000,
    signal: controller.signal,
    webSocketFactory: () => socket,
  });
  queueMicrotask(() => socket.open());
  const cdp = await connected;
  const pending = cdp.send("Runtime.evaluate");
  const reason = new Error("cancel DevTools");
  controller.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(socket.readyState, 3);
});

test("DevTools commands reject immediately after closing or while closing", async () => {
  class FakeSocket extends EventTarget {
    readyState = 0;

    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }

    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }

    send() {}
  }

  for (const state of [2, 3]) {
    const socket = new FakeSocket();
    const connected = connectCdp("ws://127.0.0.1/devtools/page/test", {
      webSocketFactory: () => socket,
    });
    queueMicrotask(() => socket.open());
    const cdp = await connected;
    if (state === 3) socket.close();
    else socket.readyState = state;
    await assert.rejects(
      async () => cdp.send("Runtime.evaluate"),
      state === 3 ? /closed before a response/u : /is not open/u,
    );
  }
});

test("a failing socket close stays attached to the failure it accompanies", async (t) => {
  const closeFailure = new Error("close failed");
  class StuckSocket extends EventTarget {
    readyState = 0;

    close() {
      throw closeFailure;
    }

    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }

    send() {}
  }
  const connect = (options) => connectCdp("ws://127.0.0.1/devtools/page/test", {
    commandTimeoutMs: 10_000,
    openTimeoutMs: 10_000,
    ...options,
  });

  await t.test("open timeout", async () => {
    await assert.rejects(
      connect({ openTimeoutMs: 1, webSocketFactory: () => new StuckSocket() }),
      (error) => /connection timed out/u.test(error.message) && error.cause === closeFailure,
    );
  });

  await t.test("cancellation while opening", async () => {
    const controller = new AbortController();
    const reason = new Error("cancel DevTools");
    const connected = connect({ signal: controller.signal, webSocketFactory: () => new StuckSocket() });
    queueMicrotask(() => controller.abort(reason));
    await assert.rejects(connected, (error) => error === reason && error.cause === closeFailure);
  });

  await t.test("a reason that already names a cause keeps it", async () => {
    const controller = new AbortController();
    const original = new Error("first failure");
    const reason = new Error("cancel DevTools", { cause: original });
    const connected = connect({ signal: controller.signal, webSocketFactory: () => new StuckSocket() });
    queueMicrotask(() => controller.abort(reason));
    await assert.rejects(connected, (error) => error === reason && error.cause === original);
  });

  await t.test("a frozen reason is reported unchanged", async () => {
    const controller = new AbortController();
    const reason = Object.freeze(new Error("cancel DevTools"));
    const connected = connect({ signal: controller.signal, webSocketFactory: () => new StuckSocket() });
    queueMicrotask(() => controller.abort(reason));
    await assert.rejects(connected, (error) => error === reason && error.cause === undefined);
  });

  await t.test("invalid message after opening", async () => {
    const socket = new StuckSocket();
    const connected = connect({ webSocketFactory: () => socket });
    queueMicrotask(() => socket.open());
    const cdp = await connected;
    const pending = cdp.send("Runtime.evaluate");
    socket.dispatchEvent(new MessageEvent("message", { data: "{" }));
    await assert.rejects(
      pending,
      (error) => /invalid JSON message/u.test(error.message) && error.cause === closeFailure,
    );
  });

  await t.test("cancellation after opening", async () => {
    const socket = new StuckSocket();
    const controller = new AbortController();
    const connected = connect({ signal: controller.signal, webSocketFactory: () => socket });
    queueMicrotask(() => socket.open());
    const cdp = await connected;
    const pending = cdp.send("Runtime.evaluate");
    const reason = new Error("cancel DevTools");
    controller.abort(reason);
    await assert.rejects(pending, (error) => error === reason && error.cause === closeFailure);
  });
});

test("browser discovery returns the first accessible candidate", async () => {
  const missing = path.join(path.dirname(process.execPath), "no-such-browser-a");
  assert.equal(
    await firstExistingChromium([missing, process.execPath, missing]),
    process.execPath,
  );
});

test("browser discovery reports why each candidate was refused", async () => {
  const candidates = ["a", "b"].map(
    (name) => path.join(path.dirname(process.execPath), `no-such-browser-${name}`),
  );
  await assert.rejects(firstExistingChromium(candidates), (error) => {
    assert.equal(
      error.message,
      "Chrome, Chromium, or Edge is required for rendered browser verification.",
    );
    assert.ok(error.cause instanceof AggregateError);
    assert.deepEqual(error.cause.errors.map((failure) => failure.code), ["ENOENT", "ENOENT"]);
    return true;
  });
});

test("browser discovery refuses an empty candidate list", async () => {
  await assert.rejects(firstExistingChromium([]), (error) => {
    assert.match(error.message, /is required for rendered browser verification/u);
    assert.deepEqual(error.cause.errors, []);
    return true;
  });
});

test("ordered browser cleanup settles every step before reporting failures", async () => {
  const order = [];
  await assert.rejects(
    settleCleanupSteps([
      async () => order.push("socket"),
      async () => {
        order.push("browser");
        throw new Error("browser stop failed");
      },
      async () => order.push("server"),
      async () => order.push("profile"),
    ]),
    AggregateError,
  );
  assert.deepEqual(order, ["socket", "browser", "server", "profile"]);
});
