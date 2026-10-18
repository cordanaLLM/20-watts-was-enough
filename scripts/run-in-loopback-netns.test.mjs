import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { namespacedCommand, parseCommand, probeLoopbackNamespace, selectPath } from "./run-in-loopback-netns.mjs";

const wrapperScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "run-in-loopback-netns.mjs");
// Probe the host independently of the module, so a broken probe cannot turn the namespace tests into skips.
const namespaceAvailable =
  process.platform === "linux" &&
  spawnSync("unshare", ["--user", "--map-root-user", "--net", "--", "ip", "link", "set", "lo", "up"], { timeout: 10_000 })
    .status === 0;
const noNamespaceReason = "unprivileged user namespaces or iproute2 unavailable on this host";

const listInterfaces = [
  "-e",
  "process.stdout.write(JSON.stringify(Object.keys(require('node:os').networkInterfaces()).sort()))",
];

function runWrapper(args, env) {
  return spawnSync(process.execPath, [wrapperScript, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
    timeout: 30_000,
  });
}

test("positive: the namespaced command holds only loopback", { skip: !namespaceAvailable && noNamespaceReason }, () => {
  const result = runWrapper([process.execPath, ...listInterfaces], {});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ["lo"]);
});

test("positive: loopback serves inside the namespace", { skip: !namespaceAvailable && noNamespaceReason }, () => {
  const script = [
    "const http = require('node:http');",
    "const server = http.createServer((_, res) => res.end('ok'));",
    "server.listen(0, '127.0.0.1', () => {",
    "  http.get(`http://127.0.0.1:${server.address().port}/`, (res) => {",
    "    let body = ''; res.on('data', (c) => { body += c; });",
    "    res.on('end', () => { process.stdout.write(body); server.close(); });",
    "  });",
    "});",
  ].join("\n");
  const result = runWrapper([process.execPath, "-e", script], {});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "ok");
});

test("positive: the wrapper returns the command's exit status", { skip: !namespaceAvailable && noNamespaceReason }, () => {
  const result = runWrapper([process.execPath, "-e", "process.exit(7)"], {});
  assert.equal(result.status, 7, result.stderr);
});

test("positive: the module probe agrees with the host", { skip: process.platform !== "linux" && "unshare is Linux-only" }, () => {
  assert.equal(probeLoopbackNamespace() === null, namespaceAvailable);
});

test("positive: arguments reach the command without word splitting", () => {
  const [file, args] = namespacedCommand(["node", "--test", "a b.mjs", "$HOME"]);
  assert.equal(file, "unshare");
  assert.deepEqual(args.slice(-4), ["node", "--test", "a b.mjs", "$HOME"]);
  assert.equal(args[args.indexOf("-c") + 1], 'ip link set lo up && exec "$@"');
});

test("negative: a missing namespace refuses by name instead of running without it", () => {
  const selected = selectPath({}, () => "unshare --user --net failed: Operation not permitted");
  assert.equal(selected.mode, "refuse");
  assert.match(selected.note, /loopback network namespace unavailable \(unshare --user --net failed: Operation not permitted\)/u);
});

test("negative: the probe reports a missing unshare binary", () => {
  const failure = probeLoopbackNamespace(() => ({ error: new Error("spawnSync unshare ENOENT") }));
  assert.equal(failure, "unshare could not run: spawnSync unshare ENOENT");
});

test("negative: the probe reports a refused namespace with unshare's message", () => {
  const failure = probeLoopbackNamespace(() => ({ status: 1, stderr: "unshare: unshare failed: Operation not permitted\n" }));
  assert.equal(failure, "unshare --user --net failed: unshare: unshare failed: Operation not permitted");
});

test("negative: an empty command exits 2 with usage", () => {
  const result = runWrapper([], {});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: run-in-loopback-netns\.mjs <command>/u);
});

test("negative: the refusal reaches the exit status when the namespace is unavailable", { skip: process.platform !== "linux" && "unshare is Linux-only" }, () => {
  const result = runWrapper([process.execPath, "-e", "process.exit(0)"], { PATH: "/nonexistent" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /loopback network namespace unavailable \(unshare could not run: /u);
});

test("boundary: CI=true runs directly and names the path", () => {
  const selected = selectPath({ CI: "true" }, () => assert.fail("probe must not run on CI"));
  assert.equal(selected.mode, "direct");
  assert.match(selected.note, /CI=true: running without the loopback network namespace/u);
  const result = runWrapper([process.execPath, "-e", "process.exit(0)"], { CI: "true" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /CI=true: running without the loopback network namespace/u);
});

test("boundary: any other CI value takes the namespace path", () => {
  for (const value of ["", "1", "false", "TRUE"]) {
    assert.equal(selectPath({ CI: value }, () => null).mode, "namespace", `CI=${value}`);
  }
});

test("boundary: argument count is bounded", () => {
  assert.equal(parseCommand(Array.from({ length: 256 }, () => "x")).length, 256);
  assert.throws(() => parseCommand(Array.from({ length: 257 }, () => "x")), /257 arguments, above the bound of 256/u);
});
