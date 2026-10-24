import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalize } from "../lib/checkpoint-ledger.mjs";

const VALID_ACTIONS = new Set(["prepare", "smoke", "run", "analyze", "validate"]);
const DEFAULT_ALLOWED_OPTIONS = new Set(["profile", "output", "resume"]);
const PROFILE_ACTIONS = new Set(["prepare", "smoke", "run"]);

export async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function fileSha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveOutput(root, value, labelOrMessage) {
  const resolved = path.resolve(root, value);
  if (!isInside(root, resolved) || resolved === root) {
    const message = labelOrMessage.includes(" must stay inside ")
      ? labelOrMessage
      : `${labelOrMessage} output must stay inside the repository.`;
    throw new Error(message);
  }
  return resolved;
}

export async function writeJsonStable(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(file, body, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const prior = JSON.parse(await readFile(file, "utf8"));
    if (canonicalize(prior) !== canonicalize(value)) {
      throw new Error(`Refusing to replace non-identical ${path.basename(file)}.`, { cause: error });
    }
  }
}

export function validateSeedDocument(document, message = "Seed document is invalid.") {
  if (
    document?.schema !== 1
    || document.artifact !== "fixture-029"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "literal-public-seed-list-v1"
    || document.encoding !== "unsigned-little-endian-uint32"
    || !Array.isArray(document.seeds)
    || document.seeds.length < 2
    || document.seeds.some((seed) => (
      !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff
    ))
    || new Set(document.seeds).size !== document.seeds.length
  ) throw new Error(message);
  return document;
}

function parseOptionPairs(argv, label, invalidPairErrorMessage, allowedOptions) {
  if ((argv.length - 3) % 2 !== 0) {
    throw new Error("Options require explicit --name value pairs.");
  }
  const options = {};
  for (let index = 3; index < argv.length && index < 64; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/u.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error(invalidPairErrorMessage ?? `Invalid ${label} option pair.`);
    }
    const key = token.slice(2);
    if (!allowedOptions.has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate ${label} option --${key}.`);
    }
    options[key] = value;
  }
  return options;
}

function validateActionConstraints(action, options) {
  if (PROFILE_ACTIONS.has(action)) {
    if (!new Set(["smoke", "development"]).has(options.profile)) {
      throw new Error(`${action} requires --profile.`);
    }
  } else if (options.profile !== undefined || options.resume !== undefined) {
    throw new Error(`${action} does not accept profile or resume.`);
  }
  if (action === "smoke" && options.profile !== "smoke") {
    throw new Error("smoke requires --profile smoke.");
  }
  if (action === "run" && options.profile !== "development") {
    throw new Error("run requires --profile development.");
  }
  if (action === "prepare" && (options.output !== undefined || options.resume !== undefined)) {
    throw new Error("prepare does not accept output or resume.");
  }
  if (action !== "prepare" && !options.output) {
    throw new Error(`${action} requires --output.`);
  }
  if (options.resume !== undefined && !new Set(["true", "false"]).has(options.resume)) {
    throw new Error("--resume must be true or false.");
  }
}

export function parseRunnerOptions(argv, {
  label = "CMB-X01",
  actionErrorMessage,
  invalidPairErrorMessage,
  allowedOptions = DEFAULT_ALLOWED_OPTIONS,
} = {}) {
  const action = argv[2];
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(actionErrorMessage ?? `${label} action must be prepare, smoke, run, analyze, or validate.`);
  }
  const options = parseOptionPairs(argv, label, invalidPairErrorMessage, allowedOptions);
  validateActionConstraints(action, options);
  return { action, options };
}
