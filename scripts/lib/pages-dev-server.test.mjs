import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { waitForCondition } from "./browser-wait.mjs";
import { pagesDevServerNotReady, startReadyPagesDevServer } from "./pages-dev-server.mjs";

test("a readiness timeout names host starvation only above two runnable tasks per CPU", () => {
  assert.doesNotMatch(pagesDevServerNotReady(1000, 2).message, /UNDECIDED/u);
  assert.match(pagesDevServerNotReady(1000, 2.01).message, /^UNDECIDED: host starved; /u);
  assert.match(pagesDevServerNotReady(1000, 0).message, /within 1000 wall ms; load per available CPU 0$/u);
});

test("a server that misses its readiness budget is refused and the environment is restored", async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "20w-pages-dev-server-"));
  const previous = process.env.PAGES_BASE_PATH;
  process.env.PAGES_BASE_PATH = "/before/";
  try {
    await assert.rejects(
      startReadyPagesDevServer({
        cacheDir: path.join(cacheRoot, "vite-cache"),
        env: { PAGES_BASE_PATH: "/20-watts-was-enough/" },
        readyBudgetMs: 1,
      }),
      /did not finish its cold compile within 1 wall ms/u,
    );
    assert.equal(process.env.PAGES_BASE_PATH, "/before/");
  } finally {
    if (previous === undefined) delete process.env.PAGES_BASE_PATH;
    else process.env.PAGES_BASE_PATH = previous;
    await rm(cacheRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test("starting the server leaves NODE_ENV as the caller had it", async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "20w-pages-dev-server-"));
  const previous = process.env.NODE_ENV;
  try {
    for (const before of [undefined, "production"]) {
      if (before === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = before;
      await assert.rejects(
        startReadyPagesDevServer({ cacheDir: path.join(cacheRoot, "vite-cache"), readyBudgetMs: 1 }),
        /did not finish its cold compile within 1 wall ms/u,
      );
      assert.equal(process.env.NODE_ENV, before);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    await rm(cacheRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test("the first browser that connects after readiness receives no stale full reload", {
  timeout: 360_000,
}, async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "20w-pages-dev-server-"));
  let pagesServer;
  let socket;
  try {
    pagesServer = await startReadyPagesDevServer({
      cacheDir: path.join(cacheRoot, "vite-cache"),
      env: { PAGES_BASE_PATH: "/20-watts-was-enough/" },
    });
    const url = new URL(pagesServer.server.config.base, pagesServer.origin);
    url.protocol = "ws:";
    url.searchParams.set("token", pagesServer.server.config.webSocketToken);
    socket = new WebSocket(url, "vite-hmr");
    const messages = [];
    socket.addEventListener("message", (event) => messages.push(JSON.parse(event.data).type));
    await waitForCondition({
      probe: () => messages.includes("connected"), budgetMs: 10_000, label: "HMR socket sent no connected message",
    });
    // Vite sends a buffered message right after "connected" on the same socket.
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepEqual(messages, ["connected"]);
  } finally {
    socket?.close();
    await pagesServer?.close();
    await rm(cacheRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test("a server whose creation outlasts the readiness budget rejects promptly and closes once resolved", async () => {
  let closeCalls = 0;
  // listen never settles: a deadline armed after creation would fire only
  // after the 300 ms creation and fail the elapsed assertion below.
  const fakeServer = {
    close() {
      closeCalls += 1;
    },
    listen: () => new Promise(() => {}),
  };
  const createServer = () => new Promise((resolve) => {
    setTimeout(() => resolve(fakeServer), 300);
  });
  const startedAt = performance.now();
  await assert.rejects(
    startReadyPagesDevServer({
      createServer,
      readyBudgetMs: 50,
    }),
    /did not finish its cold compile within 50 wall ms/u,
  );
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 250, `expected rejection in well under 300 ms, took ${elapsed} ms`);
  await waitForCondition({
    probe: () => closeCalls === 1,
    budgetMs: 5_000,
    label: "fake server was not closed exactly once after resolving",
  });
  assert.equal(closeCalls, 1);
});

test("an environment change by a creation that outlasts the deadline is undone when it settles", async () => {
  const previous = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  let closeCalls = 0;
  const createServer = () => new Promise((resolve) => {
    setTimeout(() => {
      // createViteServer sets NODE_ENV when it is unset, after its config load.
      process.env.NODE_ENV = "development";
      resolve({ close() { closeCalls += 1; } });
    }, 100);
  });
  try {
    await assert.rejects(
      startReadyPagesDevServer({ createServer, readyBudgetMs: 20 }),
      /did not finish its cold compile within 20 wall ms/u,
    );
    assert.equal(process.env.NODE_ENV, undefined);
    await waitForCondition({
      probe: () => closeCalls === 1, budgetMs: 5_000, label: "abandoned server was not closed",
    });
    assert.equal(process.env.NODE_ENV, undefined);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
