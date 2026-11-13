import { spawn } from "node:child_process";
import path from "node:path";
import { stopProcess, waitForUrl } from "./chromium-cdp.mjs";

const base = "/";
export const VISUAL_PAGES_ORIGIN = "http://127.0.0.1:3137";

export function visualPagesCommand(mode, repositoryRoot, outputRoot, environment = process.env) {
  if (!["build", "preview"].includes(mode)) throw new Error(`Unsupported visual Pages command: ${mode}`);
  const args = [path.join(repositoryRoot, "node_modules/vite/bin/vite.js"), mode,
    "--config", "vite.pages.config.ts", "--configLoader", "runner"];
  if (mode === "preview") args.push("--port", "3137", "--host", "127.0.0.1", "--strictPort");
  return {
    args,
    options: {
      cwd: repositoryRoot,
      env: { ...environment, BROWSER: "none", PAGES_BASE_PATH: base, PAGES_OUTPUT_DIR: outputRoot },
      stdio: ["pipe", "inherit", "inherit"], windowsHide: true,
    },
  };
}

export async function buildVisualPages(repositoryRoot, outputRoot, signal, spawnChild = spawn) {
  signal.throwIfAborted();
  const { args, options } = visualPagesCommand("build", repositoryRoot, outputRoot);
  const child = spawnChild(process.execPath, args, { ...options, signal });
  try {
    await new Promise((resolve, reject) => {
      child.once("error", (cause) => reject(new Error("Visual Pages build failed to run", { cause })));
      child.once("exit", (code, killedBy) => {
        if (code === 0) resolve();
        else reject(new Error(`Visual Pages build failed with exit code ${code} (signal ${killedBy ?? "none"})`));
      });
    });
  } finally {
    await stopProcess(child);
  }
}

export async function startVisualPagesPreview(repositoryRoot, staging, signal, {
  spawnChild = spawn, waitUntilReady = waitForUrl,
} = {}) {
  signal.throwIfAborted();
  const { args, options } = visualPagesCommand("preview", repositoryRoot, staging);
  const server = spawnChild(process.execPath, args, { ...options, signal });
  try {
    await Promise.race([
      waitUntilReady(`${VISUAL_PAGES_ORIGIN}${base}`, server, 60_000, signal),
      new Promise((_, reject) => {
        server.once("error", (cause) => reject(new Error("Visual Pages preview failed to run", { cause })));
      }),
    ]);
    return server;
  } catch (cause) {
    await stopProcess(server);
    throw new Error("Visual Pages preview did not become ready", { cause });
  }
}
