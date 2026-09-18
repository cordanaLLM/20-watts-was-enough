import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ChromeDevToolsProtocolError,
  PdfPrintRetryExhaustedError,
  connectCdp,
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
  let calls = 0;
  const cdp = {
    async send() {
      calls += 1;
      throw printingFailed();
    },
  };

  await assert.rejects(
    printPageToPdf(cdp, {}, { retryDelayMs: 1, totalTimeoutMs: 10 }),
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
