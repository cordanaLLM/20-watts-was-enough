import { ESLint } from "eslint";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.dirname(path.dirname(scriptPath));

export const BASELINE_SCHEMA_VERSION = 1;
export const DEFAULT_BASELINE_PATH = path.join(
  repositoryRoot,
  "scripts",
  "code-shape-baseline.json",
);

export const CODE_SHAPE_POLICY = Object.freeze({
  complexity: 30,
  "max-lines-per-function": 120,
  "max-statements": 60,
});

const SOURCE_GLOB = "**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}";
const EXCLUDED_PATHS = Object.freeze([
  ".git/**",
  ".vite/**",
  "build/**",
  "dist/**",
  "dist-github-pages/**",
  "node_modules/**",
  ".claude/worktrees/**",
  "out/**",
  "tmp/**",
]);

const ACTUAL_VALUE_PATTERNS = Object.freeze({
  complexity: /\bcomplexity of (\d+)\b/i,
  "max-lines-per-function": /\btoo many lines \((\d+)\)/i,
  "max-statements": /\btoo many statements \((\d+)\)/i,
});

function fail(message) {
  throw new Error(message);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function canonicalPath(root, filePath) {
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
  if (
    !relativePath
    || relativePath === ".."
    || relativePath.startsWith("../")
    || path.isAbsolute(relativePath)
  ) {
    fail(`audited path escapes repository root: ${filePath}`);
  }
  return relativePath;
}

function findingKey(finding) {
  return `${finding.path}\0${finding.rule}`;
}

function compareFinding(left, right) {
  return left.path.localeCompare(right.path)
    || left.rule.localeCompare(right.rule);
}

function parseActualValue(ruleId, message) {
  const pattern = ACTUAL_VALUE_PATTERNS[ruleId];
  const match = pattern?.exec(message);
  if (!match) fail(`cannot extract actual value for ${ruleId}: ${message}`);
  const actual = Number(match[1]);
  if (!isPositiveInteger(actual)) {
    fail(`invalid actual value for ${ruleId}: ${message}`);
  }
  return actual;
}

export function aggregateFindings(root, results) {
  if (!Array.isArray(results) || results.length === 0) {
    fail("audited source set unexpectedly vanished");
  }

  const findings = new Map();
  const auditedPaths = new Set();
  const fatalMessages = [];

  for (const result of results) {
    const relativePath = canonicalPath(root, result.filePath);
    auditedPaths.add(relativePath);
    for (const message of result.messages) {
      if (message.fatal) {
        fatalMessages.push(
          `${relativePath}:${message.line ?? 0}:${message.column ?? 0} ${message.message}`,
        );
        continue;
      }
      if (!(message.ruleId in CODE_SHAPE_POLICY)) continue;
      const key = `${relativePath}\0${message.ruleId}`;
      const existing = findings.get(key) ?? {
        path: relativePath,
        rule: message.ruleId,
        count: 0,
        maxActual: 0,
      };
      const actual = parseActualValue(message.ruleId, message.message);
      existing.count += 1;
      existing.maxActual = Math.max(existing.maxActual, actual);
      findings.set(key, existing);
    }
  }

  if (fatalMessages.length > 0) {
    fail(`ESLint parser/configuration failure:\n${fatalMessages.join("\n")}`);
  }

  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    policy: { ...CODE_SHAPE_POLICY },
    auditedFileCount: auditedPaths.size,
    findings: [...findings.values()].sort(compareFinding),
  };
}

function validateFinding(finding, index, seen) {
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
    fail(`baseline finding ${index} must be an object`);
  }
  if (
    typeof finding.path !== "string"
    || finding.path.length === 0
    || finding.path.includes("\\")
    || finding.path.startsWith("/")
    || finding.path === ".."
    || finding.path.startsWith("../")
  ) {
    fail(`baseline finding ${index} has a non-canonical path`);
  }
  if (!(finding.rule in CODE_SHAPE_POLICY)) {
    fail(`baseline finding ${index} has unknown rule ${finding.rule}`);
  }
  if (!isPositiveInteger(finding.count)) {
    fail(`baseline finding ${index} has invalid count`);
  }
  if (!isPositiveInteger(finding.maxActual)) {
    fail(`baseline finding ${index} has invalid maxActual`);
  }
  if (finding.maxActual <= CODE_SHAPE_POLICY[finding.rule]) {
    fail(`baseline finding ${index} does not exceed its policy threshold`);
  }
  const key = findingKey(finding);
  if (seen.has(key)) fail(`baseline contains duplicate file/rule group: ${key}`);
  seen.add(key);
}

export function validateBaseline(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("baseline must be a JSON object");
  }
  if (value.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    fail(`unsupported baseline schemaVersion: ${value.schemaVersion}`);
  }
  if (JSON.stringify(value.policy) !== JSON.stringify(CODE_SHAPE_POLICY)) {
    fail("baseline policy is stale or malformed");
  }
  if (!isPositiveInteger(value.auditedFileCount)) {
    fail("baseline auditedFileCount must be a positive integer");
  }
  if (!Array.isArray(value.findings)) fail("baseline findings must be an array");

  const seen = new Set();
  value.findings.forEach((finding, index) => validateFinding(finding, index, seen));
  const sorted = [...value.findings].sort(compareFinding);
  if (JSON.stringify(sorted) !== JSON.stringify(value.findings)) {
    fail("baseline findings are not in canonical file/rule order");
  }
  return value;
}

export function compareSnapshots(baseline, current) {
  validateBaseline(baseline);
  validateBaseline(current);

  const baselineByKey = new Map(
    baseline.findings.map((finding) => [findingKey(finding), finding]),
  );
  const regressions = [];

  for (const finding of current.findings) {
    const prior = baselineByKey.get(findingKey(finding));
    if (!prior) {
      regressions.push(
        `${finding.path} · ${finding.rule}: new group with ${finding.count} finding(s), worst ${finding.maxActual}`,
      );
      continue;
    }
    if (finding.count > prior.count) {
      regressions.push(
        `${finding.path} · ${finding.rule}: finding count ${prior.count} -> ${finding.count}`,
      );
    }
    if (finding.maxActual > prior.maxActual) {
      regressions.push(
        `${finding.path} · ${finding.rule}: worst actual ${prior.maxActual} -> ${finding.maxActual}`,
      );
    }
  }

  return regressions;
}

function readBaseline(baselinePath) {
  if (!existsSync(baselinePath)) {
    fail(`code-shape baseline is missing: ${baselinePath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch (error) {
    fail(`cannot parse code-shape baseline: ${error.message}`);
  }
  return validateBaseline(parsed);
}

function serializeBaseline(snapshot) {
  validateBaseline(snapshot);
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function printSummary(snapshot, action) {
  const totalByRule = new Map(
    Object.keys(CODE_SHAPE_POLICY).map((rule) => [rule, {
      findings: 0,
      files: 0,
      maxActual: 0,
    }]),
  );
  for (const finding of snapshot.findings) {
    const summary = totalByRule.get(finding.rule);
    summary.findings += finding.count;
    summary.files += 1;
    summary.maxActual = Math.max(summary.maxActual, finding.maxActual);
  }
  console.log(`Code-shape ${action}: ${snapshot.auditedFileCount} audited files.`);
  for (const [rule, summary] of totalByRule) {
    console.log(
      `  ${rule}: ${summary.findings} finding(s) in ${summary.files} file(s); worst actual ${summary.maxActual || 0}.`,
    );
  }
}

export async function createCurrentSnapshot({ root = repositoryRoot } = {}) {
  const eslint = new ESLint({
    cwd: root,
    errorOnUnmatchedPattern: false,
    overrideConfigFile: path.join(repositoryRoot, "eslint.config.mjs"),
    overrideConfig: [
      {
        ignores: EXCLUDED_PATHS,
      },
      {
        files: [SOURCE_GLOB],
        rules: {
          complexity: ["error", CODE_SHAPE_POLICY.complexity],
          "max-lines-per-function": [
            "error",
            {
              max: CODE_SHAPE_POLICY["max-lines-per-function"],
              skipBlankLines: true,
              skipComments: true,
              IIFEs: true,
            },
          ],
          "max-statements": ["error", CODE_SHAPE_POLICY["max-statements"]],
        },
      },
    ],
    warnIgnored: false,
  });
  const results = await eslint.lintFiles([SOURCE_GLOB]);
  return aggregateFindings(root, results);
}

export async function runCodeShapeAudit({
  root = repositoryRoot,
  baselinePath = DEFAULT_BASELINE_PATH,
  write = false,
} = {}) {
  const current = await createCurrentSnapshot({ root });
  if (write) {
    writeFileSync(baselinePath, serializeBaseline(current), "utf8");
    printSummary(current, "baseline written");
    return current;
  }

  const baseline = readBaseline(baselinePath);
  const regressions = compareSnapshots(baseline, current);
  printSummary(current, "check");
  if (regressions.length > 0) {
    fail(`code-shape regression(s):\n- ${regressions.join("\n- ")}`);
  }
  console.log("Code-shape baseline permits this change.");
  return current;
}

function parseArguments(arguments_) {
  let write = false;
  let check = false;
  let baselinePath = DEFAULT_BASELINE_PATH;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--write") write = true;
    else if (argument === "--check") check = true;
    else if (argument === "--baseline") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) fail("--baseline requires a path");
      baselinePath = path.resolve(value);
      index += 1;
    }
    else fail(`unknown argument: ${argument}`);
  }
  if (write && check) fail("--write and --check are mutually exclusive");
  if (write && baselinePath !== DEFAULT_BASELINE_PATH) {
    fail("--write cannot target an alternate comparison baseline");
  }
  return { write, baselinePath };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await runCodeShapeAudit(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`Code-shape audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
