import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import { pathToFileURL } from "node:url";

// Local browser tests run in a network namespace that holds only loopback.
// Interface churn on the host (container veths) otherwise makes Chromium abort
// loopback module loads with net::ERR_NETWORK_CHANGED. CI hosts have no such
// churn and run the command directly.
const PROBE_TIMEOUT_MS = 10_000;
const MAX_ARGUMENT_COUNT = 256;
const UNSHARE_ARGUMENTS = ["--user", "--map-root-user", "--net", "--"];
const LOOPBACK_UP_SCRIPT = 'ip link set lo up && exec "$@"';

export function parseCommand(argv) {
  if (argv.length === 0) {
    throw new Error("usage: run-in-loopback-netns.mjs <command> [arguments...]");
  }
  if (argv.length > MAX_ARGUMENT_COUNT) {
    throw new Error(`command has ${argv.length} arguments, above the bound of ${MAX_ARGUMENT_COUNT}`);
  }
  return argv;
}

export function namespacedCommand(command) {
  return ["unshare", [...UNSHARE_ARGUMENTS, "sh", "-c", LOOPBACK_UP_SCRIPT, "sh", ...command]];
}

export function probeLoopbackNamespace(run = spawnSync) {
  const result = run("unshare", [...UNSHARE_ARGUMENTS, "ip", "link", "set", "lo", "up"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
  });
  if (result.error) {
    return `unshare could not run: ${result.error.message}`;
  }
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ""}`.trim() || `exit ${result.status ?? result.signal}`;
    return `unshare --user --net failed: ${detail}`;
  }
  return null;
}

export function selectPath(env, probe = probeLoopbackNamespace) {
  if (env.CI === "true") {
    return { mode: "direct", note: "CI=true: running without the loopback network namespace" };
  }
  const failure = probe();
  if (failure !== null) {
    return {
      mode: "refuse",
      note: `loopback network namespace unavailable (${failure}); local browser tests need unprivileged user namespaces and iproute2`,
    };
  }
  return { mode: "namespace", note: null };
}

function runCommand(file, args) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { stdio: "inherit", shell: false });
    const forward = (signal) => child.kill(signal);
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    child.on("error", (error) => {
      console.error(`run-in-loopback-netns: could not start ${file}: ${error.message}`);
      resolve(127);
    });
    child.on("close", (code, signal) => {
      resolve(code ?? 128 + (os.constants.signals[signal] ?? 0));
    });
  });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let command;
  try {
    command = parseCommand(argv);
  } catch (error) {
    console.error(`run-in-loopback-netns: ${error.message}`);
    return 2;
  }
  const selected = selectPath(env);
  if (selected.mode === "refuse") {
    console.error(`run-in-loopback-netns: ${selected.note}`);
    return 2;
  }
  if (selected.mode === "direct") {
    console.error(`run-in-loopback-netns: ${selected.note}`);
    return runCommand(command[0], command.slice(1));
  }
  const [file, args] = namespacedCommand(command);
  return runCommand(file, args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main());
}
