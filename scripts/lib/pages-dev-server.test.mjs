import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

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
