import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { buildVisualPages, startVisualPagesPreview, visualPagesCommand } from "./visual-pages-server.mjs";

test("visual capture builds then previews one staged Pages output", () => {
  const environment = { VITE_CACHE_DIR: "/tmp/vite-cache", PAGES_BASE_PATH: "/old/" };
  for (const mode of ["build", "preview"]) {
    const { args, options } = visualPagesCommand(mode, "/workspace", "/workspace/tmp/stage", environment);
    assert.deepEqual(args.slice(0, 8), ["/workspace/node_modules/vite/bin/vite.js", mode,
      "--config", "vite.pages.config.ts", "--configLoader", "runner", "--logLevel", "warn"]);
    assert.deepEqual(args.slice(8), mode === "build" ? []
      : ["--port", "3137", "--host", "127.0.0.1", "--strictPort"]);
    assert.equal(options.cwd, "/workspace");
    assert.deepEqual(options.env, { VITE_CACHE_DIR: "/tmp/vite-cache", BROWSER: "none",
      PAGES_BASE_PATH: "/", PAGES_OUTPUT_DIR: "/workspace/tmp/stage" });
  }
  assert.equal(environment.PAGES_BASE_PATH, "/old/");
  assert.throws(() => visualPagesCommand("dev", "/workspace", "/workspace/tmp/stage"), /Unsupported/u);
});

test("visual build propagates the child exit code and shared deadline", async () => {
  const signal = AbortSignal.timeout(1000);
  for (const code of [0, 17]) {
    const spawnChild = (executable, args, options) => {
      assert.equal(executable, process.execPath);
      assert.equal(args[1], "build");
      assert.equal(options.signal, signal);
      const child = new EventEmitter();
      child.signalCode = null;
      queueMicrotask(() => { child.exitCode = code; child.emit("exit", code, null); });
      return child;
    };
    const result = buildVisualPages("/workspace", "/workspace/tmp/stage", signal, spawnChild);
    if (code === 0) await result;
    else await assert.rejects(result, /Visual Pages build failed with exit code 17/u);
  }
});

test("visual build refuses an expired render deadline before spawning", async () => {
  await assert.rejects(buildVisualPages("/workspace", "/workspace/tmp/stage", AbortSignal.abort(), () => {
    assert.fail("expired build must not spawn");
  }), { name: "AbortError" });
});

test("visual build reports process launch failure with its cause", async () => {
  const cause = new Error("fixture launch failed");
  const spawnChild = () => {
    const child = new EventEmitter();
    child.exitCode = -2;
    child.signalCode = null;
    queueMicrotask(() => child.emit("error", cause));
    return child;
  };
  await assert.rejects(buildVisualPages("/workspace", "/workspace/tmp/stage", AbortSignal.timeout(1000), spawnChild),
    error => /Visual Pages build failed to run/u.test(error.message) && error.cause === cause);
});

test("visual build cancellation stops the child before rejecting", async () => {
  const controller = new AbortController();
  const cause = new Error("render deadline");
  let stopped = false;
  const spawnChild = (_executable, _args, { signal }) => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => {
      stopped = true;
      child.signalCode = "SIGTERM";
      child.emit("exit", null, "SIGTERM");
    };
    signal.addEventListener("abort", () => child.emit("error", cause), { once: true });
    queueMicrotask(() => controller.abort(cause));
    return child;
  };
  await assert.rejects(buildVisualPages("/workspace", "/workspace/tmp/stage", controller.signal, spawnChild),
    error => error.cause === cause);
  assert.equal(stopped, true);
});

function previewChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => { child.signalCode = "SIGTERM"; child.emit("exit", null, "SIGTERM"); };
  return child;
}

test("visual preview uses the build output and shared readiness deadline", async () => {
  const child = previewChild();
  const signal = AbortSignal.timeout(1000);
  const actual = await startVisualPagesPreview("/workspace", "/workspace/tmp/stage", signal, {
    spawnChild(_executable, args, options) {
      assert.equal(args[1], "preview");
      assert.equal(options.env.PAGES_OUTPUT_DIR, "/workspace/tmp/stage");
      assert.equal(options.signal, signal);
      return child;
    },
    async waitUntilReady(url, required, timeout, received) {
      assert.equal(url, "http://127.0.0.1:3137/");
      assert.equal(required, child);
      assert.equal(timeout, 60_000);
      assert.equal(received, signal);
    },
  });
  assert.equal(actual, child);
  assert.equal(child.signalCode, null);
});

test("visual preview stops its child if readiness fails", async () => {
  const child = previewChild();
  const cause = new Error("fixture readiness failed");
  await assert.rejects(startVisualPagesPreview("/workspace", "/workspace/tmp/stage", AbortSignal.timeout(1000), {
    spawnChild: () => child,
    waitUntilReady: async () => { throw cause; },
  }), error => /Visual Pages preview did not become ready/u.test(error.message) && error.cause === cause);
  assert.equal(child.signalCode, "SIGTERM");
});

test("visual preview reports launch failure and stops its child", async () => {
  const child = previewChild();
  const cause = new Error("fixture preview launch failed");
  await assert.rejects(startVisualPagesPreview("/workspace", "/workspace/tmp/stage", AbortSignal.timeout(1000), {
    spawnChild: () => child,
    waitUntilReady: () => new Promise(() => queueMicrotask(() => child.emit("error", cause))),
  }), error => error.cause?.cause === cause);
  assert.equal(child.signalCode, "SIGTERM");
});
