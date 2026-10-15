import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const REQUEST_VERSION = "fixture-026.rsd-t02-isolated-request.v2";
const CALL_VERSION = "fixture-026.rsd-t02-policy-call.v2";
const RESPONSE_VERSION = "fixture-026.rsd-t02-isolated-response.v2";
const MAX_STDIN_BYTES = 24 * 1024 * 1024;
const MAX_POLICY_RESPONSE_BYTES = 256 * 1024;
const VM_TIMEOUT_MS = 5_000;
const ACTIVE_ARM_IDS = Object.freeze([
  "A-RAW",
  "B-STATIC-DIV",
  "B-STREAM",
  "B-LOG-RATIO",
  "B-DIFFERENCE",
  "B-STATE-SPACE",
  "B-RECURRENT",
  "C-MECHANISM-BANK",
  "C-DUAL",
]);
const REQUEST_KEYS = Object.freeze([
  "schema", "contract_version", "active_arm_ids", "packet_encoding", "packet_utf8_bytes",
  "packet_base64", "config_encoding", "config_utf8_bytes", "config_base64",
]);

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(value[key])}`
    )).join(",")}}`;
  }
  throw new TypeError(`Non-canonical ${typeof value} value.`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_STDIN_BYTES) throw new RangeError("stdin exceeds protocol bound");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function decodeExactBase64(value, expectedBytes) {
  if (
    typeof value !== "string"
    || !Number.isSafeInteger(expectedBytes)
    || expectedBytes < 1
  ) throw new TypeError("invalid encoded byte field");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== expectedBytes || bytes.toString("base64") !== value) {
    throw new Error("non-canonical base64 field");
  }
  return bytes;
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function validateRequest(raw) {
  const text = decodeUtf8(raw);
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n")) {
    throw new Error("request is not one LF-terminated record");
  }
  const request = JSON.parse(text.slice(0, -1));
  if (`${canonical(request)}\n` !== text) throw new Error("request is not canonical JSON");
  if (
    !exactKeys(request, REQUEST_KEYS)
    || request.schema !== 1
    || request.contract_version !== REQUEST_VERSION
    || canonical(request.active_arm_ids) !== canonical(ACTIVE_ARM_IDS)
    || request.packet_encoding !== "canonical-json-utf8-base64"
    || request.config_encoding !== "exact-checked-in-json-utf8-base64"
  ) throw new Error("request shape is invalid");
  const packetBytes = decodeExactBase64(request.packet_base64, request.packet_utf8_bytes);
  const configBytes = decodeExactBase64(request.config_base64, request.config_utf8_bytes);
  const packetJson = decodeUtf8(packetBytes);
  const configJson = decodeUtf8(configBytes);
  const packet = JSON.parse(packetJson);
  JSON.parse(configJson);
  if (canonical(packet) !== packetJson) throw new Error("packet bytes are not canonical JSON");
  return { request, packetBytes, configBytes, packetJson, configJson };
}

const LOCKDOWN_SOURCE = `"use strict";
for (const name of [
  "process", "require", "module", "fetch", "XMLHttpRequest", "WebSocket",
  "EventSource", "Date", "performance", "setTimeout", "setInterval",
  "setImmediate", "queueMicrotask", "crypto", "Deno", "Bun", "eval",
  "Function", "Promise", "WebAssembly", "SharedArrayBuffer", "Atomics", "console",
  "__fixture026_evaluator__"
]) {
  Object.defineProperty(globalThis, name, {
    value: undefined, configurable: false, enumerable: false, writable: false
  });
}
Object.defineProperty(Math, "random", {
  value: undefined, configurable: false, enumerable: false, writable: false
});
Object.freeze(Math);
Object.freeze(JSON);
`;

function executeBundle(bundleText, bundleSha256, request) {
  const context = vm.createContext(Object.create(null), {
    name: "fixture-026-rsd-t02-policy-bank",
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: "afterEvaluate",
  });
  new vm.Script(LOCKDOWN_SOURCE, {
    filename: "fixture-026-rsd-t02-lockdown.js",
  }).runInContext(context, { timeout: VM_TIMEOUT_MS });
  new vm.Script(bundleText, {
    filename: `sha256-${bundleSha256}.js`,
  }).runInContext(context, { timeout: VM_TIMEOUT_MS });
  const policyCall = canonical({
    schema: 1,
    contract_version: CALL_VERSION,
    active_arm_ids: ACTIVE_ARM_IDS,
    packet_json: request.packetJson,
    config_json: request.configJson,
  });
  Object.defineProperty(context, "__fixture026_policy_call_json__", {
    value: policyCall,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  const responseText = new vm.Script(
    "__fixture026_rsd_t02_policy_execute__(__fixture026_policy_call_json__)",
    { filename: "fixture-026-rsd-t02-invoke.js" },
  ).runInContext(context, { timeout: VM_TIMEOUT_MS });
  delete context.__fixture026_policy_call_json__;
  if (
    typeof responseText !== "string"
    || Buffer.byteLength(responseText, "utf8") > MAX_POLICY_RESPONSE_BYTES
  ) throw new Error("policy response is absent or exceeds its bound");
  const response = JSON.parse(responseText);
  if (canonical(response) !== responseText) throw new Error("policy response is not canonical JSON");
  return response;
}

function runtimeBinding() {
  return {
    node_version: process.versions.node,
    v8_version: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    numeric_model: "IEEE-754-binary64",
  };
}

function protocolBinding(rawRequest, opened, bundleSha256) {
  return {
    active_arm_ids: ACTIVE_ARM_IDS,
    request_sha256: sha256(rawRequest),
    request_bytes: rawRequest.length,
    packet_sha256: sha256(opened.packetBytes),
    packet_utf8_bytes: opened.packetBytes.length,
    config_sha256: sha256(opened.configBytes),
    config_utf8_bytes: opened.configBytes.length,
    bundle_sha256: bundleSha256,
    runtime: runtimeBinding(),
  };
}

function partialProtocolBinding(rawRequest, bundleSha256) {
  return {
    active_arm_ids: ACTIVE_ARM_IDS,
    request_sha256: rawRequest === null ? null : sha256(rawRequest),
    request_bytes: rawRequest === null ? null : rawRequest.length,
    packet_sha256: null,
    packet_utf8_bytes: null,
    config_sha256: null,
    config_utf8_bytes: null,
    bundle_sha256: bundleSha256 ?? null,
    runtime: runtimeBinding(),
  };
}

function abstention(reasonCode, binding = null) {
  return {
    schema: 1,
    contract_version: RESPONSE_VERSION,
    status: "abstained",
    arm_outcomes: ACTIVE_ARM_IDS.map((armId) => ({
      arm_id: armId,
      status: "abstained",
      arm_result: null,
      reason_codes: [reasonCode],
    })),
    reason_codes: [reasonCode],
    active_arm_ids: ACTIVE_ARM_IDS,
    request_sha256: binding?.request_sha256 ?? null,
    request_bytes: binding?.request_bytes ?? null,
    packet_sha256: binding?.packet_sha256 ?? null,
    packet_utf8_bytes: binding?.packet_utf8_bytes ?? null,
    config_sha256: binding?.config_sha256 ?? null,
    config_utf8_bytes: binding?.config_utf8_bytes ?? null,
    bundle_sha256: binding?.bundle_sha256 ?? null,
    runtime: binding?.runtime ?? runtimeBinding(),
    authority: "public-development-policy-base-v2-only",
    comparison_inference_permitted: false,
    claim_eligible: false,
    result_label: "NO_RESULT",
    no_result: true,
  };
}

async function main() {
  let rawRequest = null;
  let opened;
  let binding = null;
  try {
    if (![3, 4].includes(process.argv.length)) throw new Error("invalid worker arguments");
    const bundlePath = path.resolve(process.argv.at(-2));
    const expectedBundleSha256 = process.argv.at(-1);
    if (
      !/^[0-9a-f]{64}$/u.test(expectedBundleSha256)
      || path.basename(bundlePath) !== `${expectedBundleSha256}.js`
    ) throw new Error("bundle is not content addressed");
    rawRequest = await readBoundedStdin();
    try {
      opened = validateRequest(rawRequest);
    } catch {
      return abstention(
        "isolated-worker-request-rejected",
        partialProtocolBinding(rawRequest, expectedBundleSha256),
      );
    }
    const bundleBytes = await readFile(bundlePath);
    if (sha256(bundleBytes) !== expectedBundleSha256) {
      binding = protocolBinding(rawRequest, opened, expectedBundleSha256);
      return abstention("isolated-worker-bundle-rejected", binding);
    }
    binding = protocolBinding(rawRequest, opened, expectedBundleSha256);
    const bundleText = decodeUtf8(bundleBytes);
    let armOutcomes;
    try {
      const base = executeBundle(
        bundleText,
        expectedBundleSha256,
        { packetJson: opened.packetJson, configJson: opened.configJson },
      );
      if (!Array.isArray(base.arm_results) || base.arm_results.length !== ACTIVE_ARM_IDS.length) {
        throw new Error("policy bank response is incomplete");
      }
      armOutcomes = ACTIVE_ARM_IDS.map((armId, index) => ({
        arm_id: armId,
        status: "completed",
        arm_result: base.arm_results[index],
        reason_codes: [],
      }));
    } catch {
      armOutcomes = ACTIVE_ARM_IDS.map((armId) => ({
        arm_id: armId,
        status: "abstained",
        arm_result: null,
        reason_codes: ["isolated-policy-runtime-rejected"],
      }));
    }
    const completed = armOutcomes.every((outcome) => outcome.status === "completed");
    return {
      schema: 1,
      contract_version: RESPONSE_VERSION,
      status: completed ? "completed" : "abstained",
      arm_outcomes: armOutcomes,
      reason_codes: completed ? [] : ["isolated-policy-bank-incomplete"],
      ...binding,
      authority: "public-development-policy-base-v2-only",
      comparison_inference_permitted: false,
      claim_eligible: false,
      result_label: "NO_RESULT",
      no_result: true,
    };
  } catch {
    return abstention(
      "isolated-worker-bootstrap-rejected",
      binding ?? partialProtocolBinding(rawRequest, process.argv.at(-1)),
    );
  }
}

const response = await main();
process.stdout.write(`${canonical(response)}\n`);
