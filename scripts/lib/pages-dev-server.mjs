import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PAGES_DEV_SERVER_READY_BUDGET_MS = 300_000;
// Module entries of github-pages/index.html and github-pages/book/index.html.
export const PAGES_DEV_SERVER_ENTRIES = Object.freeze(["/main.tsx", "/book.tsx"]);
// Each round awaits every dependency the optimizer discovered so far; a
// round that discovers nothing new ends the settle loop.
const OPTIMIZER_SETTLE_ROUNDS = 8;
// Each round compiles the modules first reached through a dynamic import in
// the previous round; a lazy route nests rarely more than two levels.
const DYNAMIC_IMPORT_ROUNDS = 8;

export function pagesDevServerNotReady(budgetMs, loadPerCpu, cause) {
  const prefix = loadPerCpu > 2 ? "UNDECIDED: host starved; " : "";
  return new Error(
    `${prefix}Pages development server did not finish its cold compile within ${budgetMs} wall ms; `
      + `load per available CPU ${loadPerCpu}`,
    { cause },
  );
}

async function settleDependencyOptimizer(optimizer) {
  if (!optimizer) return;
  await optimizer.scanProcessing;
  let settled = -1;
  for (let round = 0; round < OPTIMIZER_SETTLE_ROUNDS; round += 1) {
    const discovered = Object.values(optimizer.metadata.discovered);
    if (discovered.length === settled) return;
    settled = discovered.length;
    await Promise.all(discovered.map((dependency) => dependency.processing));
  }
  throw new Error(`Dependency optimizer still discovering after ${OPTIMIZER_SETTLE_ROUNDS} rounds`);
}

// Vite pre-transforms static imports only, so a lazily imported module would
// still compile on the browser's first request for it.
async function warmDynamicImports(server) {
  const { moduleGraph } = server.environments.client;
  const warmed = new Set();
  for (let round = 0; round < DYNAMIC_IMPORT_ROUNDS; round += 1) {
    const cold = new Set();
    for (const module of moduleGraph.idToModuleMap.values()) {
      if (!module.transformResult) continue;
      for (const imported of module.importedModules) {
        if (!imported.transformResult && imported.url && !warmed.has(imported.url)) cold.add(imported.url);
      }
    }
    if (cold.size === 0) return;
    for (const url of cold) warmed.add(url);
    await Promise.all([...cold].map((url) => server.warmupRequest(url)));
    await server.waitForRequestsIdle();
  }
  throw new Error(`Dynamic imports still reaching new modules after ${DYNAMIC_IMPORT_ROUNDS} rounds`);
}

// Vite compiles on the first request. Under host load that cold compile can
// outlast a browser wait budget although the page is correct, so the server
// reports ready only once its dependency pre-bundle and the static import
// graph of every entry are finished. The readiness wait has its own deadline.
async function awaitReadiness(server, entries) {
  await Promise.all(entries.map((entry) => server.warmupRequest(entry)));
  await server.waitForRequestsIdle();
  await warmDynamicImports(server);
  await settleDependencyOptimizer(server.environments.client.depsOptimizer);
}

function applyEnvironment(overrides) {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

// vite.pages.config.ts reads PAGES_BASE_PATH and GITHUB_SHA when it loads,
// so the overrides apply only while createViteServer loads the config.
export async function startReadyPagesDevServer({
  cacheDir,
  env = {},
  entries = PAGES_DEV_SERVER_ENTRIES,
  readyBudgetMs = PAGES_DEV_SERVER_READY_BUDGET_MS,
}) {
  const restoreEnvironment = applyEnvironment(env);
  let server;
  try {
    server = await createViteServer({
      configFile: path.join(repositoryRoot, "vite.pages.config.ts"),
      configLoader: "runner",
      cacheDir,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });
  } finally {
    restoreEnvironment();
  }
  const close = () => server.close();
  let timer;
  try {
    await server.listen();
    await Promise.race([
      awaitReadiness(server, entries),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(pagesDevServerNotReady(
          readyBudgetMs,
          os.loadavg()[0] / os.availableParallelism(),
        )), readyBudgetMs);
      }),
    ]);
  } catch (error) {
    await close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const address = server.httpServer?.address();
  if (!address || typeof address !== "object") {
    await close();
    throw new Error("Pages development server exposed no TCP address");
  }
  return { server, origin: `http://127.0.0.1:${address.port}`, close };
}
