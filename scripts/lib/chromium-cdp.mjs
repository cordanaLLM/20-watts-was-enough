import { access, open } from "node:fs/promises";
import { constants as osConstants } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const maximumPdfPrintTimeoutMs = 300_000;
const maximumPdfPrintRetryDelayMs = 10_000;
const pdfPrintAttemptLimit = 2;
const maximumDevtoolsActivePortBytes = 512;
const maximumBrowserWaitTimeoutMs = 300_000;
const localFetchAttemptTimeoutMs = 2_000;
const localFetchDiagnosticCodes = Object.freeze([
  "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT",
  "EAI_AGAIN", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET", "UND_ERR_ABORTED",
]);

const defaultClock = Object.freeze({
  now: () => performance.now(),
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

export class ChromeDevToolsProtocolError extends Error {
  constructor(method, protocolError) {
    const code = Number.isSafeInteger(protocolError?.code) ? protocolError.code : null;
    const protocolMessage = typeof protocolError?.message === "string"
      ? protocolError.message.slice(0, 512)
      : "unknown protocol error";
    const codeSuffix = code === null ? "" : ` (${code})`;
    super(`Chrome DevTools ${method} failed${codeSuffix}: ${protocolMessage}`);
    this.name = "ChromeDevToolsProtocolError";
    this.method = method;
    this.code = code;
    this.protocolMessage = protocolMessage;
  }
}

export class PdfPrintRetryExhaustedError extends Error {
  constructor({ attempts, cause, totalTimeoutMs }) {
    super(
      `Chrome DevTools Page.printToPDF returned "Printing failed" after ${attempts} `
        + `${attempts === 1 ? "attempt" : "attempts"} within its ${totalTimeoutMs} ms budget.`,
      { cause },
    );
    this.name = "PdfPrintRetryExhaustedError";
    this.attempts = attempts;
    this.totalTimeoutMs = totalTimeoutMs;
  }
}

function boundedMilliseconds(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be an integer from 1 through ${maximum} milliseconds.`);
  }
  return value;
}

function abortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error("Browser operation was aborted.");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function waitWithSignal(milliseconds, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError(signal));
    const timeout = setTimeout(() => finish(resolve), milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryablePdfPrintFailure(error) {
  return error instanceof ChromeDevToolsProtocolError
    && error.method === "Page.printToPDF"
    && error.protocolMessage === "Printing failed";
}

export async function printPageToPdf(cdp, params, {
  clock = defaultClock,
  onRetry,
  retryDelayMs = 1_000,
  totalTimeoutMs = maximumPdfPrintTimeoutMs,
} = {}) {
  if (!cdp || typeof cdp.send !== "function") {
    throw new Error("A Chrome DevTools client is required for PDF printing.");
  }
  if (!clock || typeof clock.now !== "function" || typeof clock.wait !== "function") {
    throw new Error("The PDF print clock must provide now and wait functions.");
  }
  if (onRetry !== undefined && typeof onRetry !== "function") {
    throw new Error("The PDF print retry observer must be a function.");
  }
  const timeout = boundedMilliseconds(
    totalTimeoutMs, "PDF print timeout", maximumPdfPrintTimeoutMs,
  );
  const retryDelay = boundedMilliseconds(
    retryDelayMs, "PDF print retry delay", maximumPdfPrintRetryDelayMs,
  );
  const deadline = clock.now() + timeout;
  let attempts = 0;

  while (attempts < pdfPrintAttemptLimit) {
    const remainingMs = Math.floor(deadline - clock.now());
    if (remainingMs < 1) {
      throw new PdfPrintRetryExhaustedError({ attempts, cause: undefined, totalTimeoutMs: timeout });
    }
    attempts += 1;
    try {
      const result = await cdp.send("Page.printToPDF", params, remainingMs);
      if (typeof result?.data !== "string" || result.data.length === 0) {
        throw new Error("Chrome DevTools Page.printToPDF returned no PDF data.");
      }
      return result;
    } catch (error) {
      if (!retryablePdfPrintFailure(error)) throw error;
      if (attempts === pdfPrintAttemptLimit) {
        throw new PdfPrintRetryExhaustedError({ attempts, cause: error, totalTimeoutMs: timeout });
      }
      const remainingBeforeDelay = Math.floor(deadline - clock.now());
      if (remainingBeforeDelay <= retryDelay) {
        throw new PdfPrintRetryExhaustedError({ attempts, cause: error, totalTimeoutMs: timeout });
      }
      onRetry?.({
        attempt: attempts,
        delayMs: retryDelay,
        nextAttempt: attempts + 1,
        remainingMs: remainingBeforeDelay,
      });
      await clock.wait(retryDelay);
    }
  }
  throw new Error("PDF print attempt bound was exhausted unexpectedly.");
}

export const chromiumCandidates = Object.freeze([
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((candidate) => typeof candidate === "string" && candidate.length > 0));

export async function firstExistingChromium(paths = chromiumCandidates) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next installed browser candidate.
    }
  }
  throw new Error("Chrome, Chromium, or Edge is required for rendered browser verification.");
}

function throwIfRequiredProcessExited(process) {
  if (process?.signalCode !== null && process?.signalCode !== undefined) {
    const signal = Object.hasOwn(osConstants.signals, process.signalCode)
      ? process.signalCode : "unknown";
    throw new Error(`Required process exited with signal ${signal}.`);
  }
  if (process?.exitCode !== null && process?.exitCode !== undefined) {
    const code = Number.isSafeInteger(process.exitCode) ? process.exitCode : "unknown";
    throw new Error(`Required process exited with code ${code}.`);
  }
}

function localUrlDiagnosticLabel(url) {
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol === "http:" || endpoint.protocol === "https:") {
      return `${endpoint.origin}${endpoint.pathname}`.slice(0, 240);
    }
  } catch {
    // Invalid or non-HTTP URLs may contain credentials or inline body data.
  }
  return "local URL";
}

function localFetchFailure(error) {
  const code = error?.cause?.code ?? error?.code;
  if (localFetchDiagnosticCodes.includes(code)) return `fetch failed (${code})`;
  if (error?.name === "TimeoutError") return "fetch timed out";
  if (error?.name === "AbortError") return "fetch aborted";
  if (error instanceof TypeError) return "fetch failed (TypeError)";
  return "fetch failed (unclassified error)";
}

export async function waitForUrl(url, process, timeoutMs = 60_000, signal) {
  const timeout = boundedMilliseconds(
    timeoutMs, "Local URL wait timeout", maximumBrowserWaitTimeoutMs,
  );
  const deadline = Date.now() + timeout;
  let lastFailure = "no completed HTTP attempt";
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    throwIfRequiredProcessExited(process);
    let response;
    try {
      const remaining = Math.max(1, deadline - Date.now());
      const attemptSignal = AbortSignal.timeout(
        Math.min(localFetchAttemptTimeoutMs, remaining),
      );
      response = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, attemptSignal]) : attemptSignal,
      });
      if (response.ok) return response;
      lastFailure = Number.isSafeInteger(response.status) && response.status >= 100 && response.status <= 599
        ? `HTTP ${response.status}` : "non-success HTTP response";
      await response.body?.cancel();
    } catch (error) {
      throwIfAborted(signal);
      lastFailure = response
        ? `${lastFailure}; response cleanup failed` : localFetchFailure(error);
    }
    throwIfAborted(signal);
    throwIfRequiredProcessExited(process);
    const remaining = deadline - Date.now();
    if (remaining > 0) await waitWithSignal(Math.min(350, remaining), signal);
  }
  throwIfAborted(signal);
  throwIfRequiredProcessExited(process);
  throw new Error(`Timed out waiting for ${localUrlDiagnosticLabel(url)}. Last attempt: ${lastFailure}.`);
}

// Chrome publishes the file with an exclusive handle on Windows, so a reader can
// observe a sharing violation (EBUSY) before the content is complete. Both mean
// "not published yet" and stay inside the same bounded wait.
const unpublishedDevtoolsPortErrorCodes = new Set(["ENOENT", "EBUSY"]);

export async function waitForDevtoolsPort(
  profile,
  browserProcess,
  { signal, timeoutMs = 60_000, openFile = open } = {},
) {
  if (typeof profile !== "string" || !path.isAbsolute(profile)) {
    throw new Error("Chrome profile path must be absolute.");
  }
  const timeout = boundedMilliseconds(
    timeoutMs, "DevTools port wait timeout", maximumBrowserWaitTimeoutMs,
  );
  const deadline = Date.now() + timeout;
  const activePortPath = path.join(profile, "DevToolsActivePort");
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    if (processStopped(browserProcess)) {
      throw new Error(`Required browser exited with code ${browserProcess?.exitCode}.`);
    }
    let handle;
    try {
      handle = await openFile(activePortPath, "r");
      const information = await handle.stat();
      if (!information.isFile() || information.size > maximumDevtoolsActivePortBytes) {
        throw new Error("Chrome DevTools active-port file is invalid or oversized.");
      }
      const body = Buffer.alloc(maximumDevtoolsActivePortBytes + 1);
      const { bytesRead } = await handle.read(body, 0, body.length, 0);
      if (bytesRead > maximumDevtoolsActivePortBytes) {
        throw new Error("Chrome DevTools active-port file exceeds its byte limit.");
      }
      const lines = body.subarray(0, bytesRead).toString("utf8").trimEnd().split(/\r?\n/u);
      const port = Number.parseInt(lines[0] ?? "", 10);
      if (
        lines.length === 2
        && /^(?:[1-9]\d{0,4})$/u.test(lines[0])
        && port <= 65_535
        && /^\/devtools\/browser\/[A-Za-z0-9-]{1,128}$/u.test(lines[1])
      ) return port;
    } catch (error) {
      if (
        !unpublishedDevtoolsPortErrorCodes.has(error?.code)
        && !String(error?.message).includes("active-port file")
      ) {
        throw error;
      }
      if (String(error?.message).includes("oversized") || String(error?.message).includes("byte limit")) {
        throw error;
      }
    } finally {
      await handle?.close();
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) await waitWithSignal(Math.min(100, remaining), signal);
  }
  throw new Error("Timed out waiting for Chrome to publish its DevTools port.");
}

export async function devtoolsPage(browserProcess, debugPort, { signal } = {}) {
  if (!Number.isSafeInteger(debugPort) || debugPort < 1 || debugPort > 65_535) {
    throw new Error("Chrome DevTools port must be an integer from 1 through 65535.");
  }
  const endpoint = `http://127.0.0.1:${debugPort}/json/list`;
  const response = await waitForUrl(endpoint, browserProcess, 60_000, signal);
  const targets = await response.json();
  const page = targets.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("The headless browser did not expose a page target.");
  }
  return page.webSocketDebuggerUrl;
}

export async function devtoolsPageFromProfile(browserProcess, profile, options = {}) {
  const port = await waitForDevtoolsPort(profile, browserProcess, options);
  return devtoolsPage(browserProcess, port, options);
}

export async function connectCdp(webSocketUrl, {
  commandTimeoutMs = 240_000,
  openTimeoutMs = 30_000,
  signal,
  webSocketFactory = (url) => new WebSocket(url),
} = {}) {
  const openTimeout = boundedMilliseconds(
    openTimeoutMs, "Chrome DevTools connection timeout", maximumBrowserWaitTimeoutMs,
  );
  const commandTimeout = boundedMilliseconds(
    commandTimeoutMs, "Chrome DevTools command timeout", maximumBrowserWaitTimeoutMs,
  );
  throwIfAborted(signal);
  const socket = webSocketFactory(webSocketUrl);
  await new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearTimeout(timeout);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onOpen = () => finish(resolve);
    const onError = (event) => finish(
      reject,
      event?.error instanceof Error ? event.error : new Error("Chrome DevTools connection failed."),
    );
    const onAbort = () => {
      try { socket.close(); } catch { /* The pending connection is already unusable. */ }
      finish(reject, abortError(signal));
    };
    const timeout = setTimeout(() => {
      try { socket.close(); } catch { /* The pending connection is already unusable. */ }
      finish(reject, new Error("Chrome DevTools connection timed out."));
    }, openTimeout);
    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  let terminalError = null;
  const rejectPending = (error) => {
    for (const { reject, timeout } of pending.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    pending.clear();
  };
  const markTerminal = (error) => {
    if (terminalError === null) terminalError = error;
    rejectPending(terminalError);
  };
  const onAbort = () => {
    markTerminal(abortError(signal));
    try { socket.close(); } catch { /* The connection is already closing. */ }
  };
  const onClose = () => {
    signal?.removeEventListener("abort", onAbort);
    markTerminal(new Error("Chrome DevTools connection closed before a response arrived."));
  };
  const onSocketError = (event) => {
    markTerminal(
      event?.error instanceof Error
        ? event.error
        : new Error("Chrome DevTools connection failed after opening."),
    );
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  socket.addEventListener("close", onClose, { once: true });
  socket.addEventListener("error", onSocketError);
  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      markTerminal(new Error("Chrome DevTools returned an invalid JSON message."));
      try { socket.close(); } catch { /* The connection is already closing. */ }
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const { method, resolve, reject, timeout } = pending.get(message.id);
    clearTimeout(timeout);
    pending.delete(message.id);
    if (message.error) reject(new ChromeDevToolsProtocolError(method, message.error));
    else resolve(message.result);
  });

  function send(method, params = {}, timeoutMs = commandTimeout) {
    throwIfAborted(signal);
    if (terminalError !== null) throw terminalError;
    if (socket.readyState !== 1) {
      throw new Error("Chrome DevTools connection is not open.");
    }
    const timeoutBound = boundedMilliseconds(
      timeoutMs, "Chrome DevTools command timeout", maximumBrowserWaitTimeoutMs,
    );
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome DevTools command timed out: ${method}`));
      }, timeoutBound);
      pending.set(id, { method, resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(error);
      }
    });
  }

  return { socket, send };
}

export async function settleCleanupSteps(steps) {
  if (!Array.isArray(steps) || steps.some((step) => typeof step !== "function")) {
    throw new Error("Browser cleanup requires an ordered function list.");
  }
  const failures = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "One or more browser cleanup steps failed.");
  }
}

function processStopped(process) {
  return process.exitCode !== null || process.signalCode !== null;
}

function stopTimeout(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) {
    throw new Error(`${label} must be an integer from 1 through 60000 milliseconds.`);
  }
  return value;
}

function waitForProcessExit(process, timeoutMs) {
  if (processStopped(process)) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearTimeout(timeout);
      process.off("exit", onExit);
      process.off("error", onError);
      callback(value);
    };
    const onExit = () => finish(resolve, true);
    const onError = (error) => finish(reject, error);
    const timeout = setTimeout(() => finish(resolve, processStopped(process)), timeoutMs);
    process.once("exit", onExit);
    process.once("error", onError);
  });
}

export async function stopProcess(process, {
  terminationGraceMs = 5_000,
  forcedExitWaitMs = 5_000,
} = {}) {
  if (!process || processStopped(process)) return;
  const grace = stopTimeout(terminationGraceMs, "Termination grace");
  const forcedWait = stopTimeout(forcedExitWaitMs, "Forced-exit wait");
  const gracefulExit = waitForProcessExit(process, grace);
  process.kill("SIGTERM");
  if (await gracefulExit) return;
  const forcedExit = waitForProcessExit(process, forcedWait);
  if (!processStopped(process)) process.kill("SIGKILL");
  if (!await forcedExit) {
    throw new Error(`Process ${process.pid ?? "unknown"} did not exit after SIGKILL.`);
  }
}
