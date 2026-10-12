import { ESLint } from "eslint";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.dirname(path.dirname(scriptPath));

export const BASELINE_SCHEMA_VERSION = 1;
export const DEFAULT_BASELINE_PATH = path.join(
  repositoryRoot,
  "scripts",
  "code-shape-baseline.json",
);

const BASELINE_GIT_PATH = "scripts/code-shape-baseline.json";
const runFile = promisify(execFile);
const gitLimits = Object.freeze({ maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });

export const CODE_SHAPE_POLICY = Object.freeze({
  complexity: 30,
  "max-lines-per-function": 120,
  "max-statements": 60,
});

// Dated exceptions: one path, one rule, a reason and an end date each. From the
// day after `expires` an entry no longer covers its group, and an entry that
// matches no finding fails too, so the list cannot outlive its cause.
// Decision 0095, point 10.
const ENGINE_BUNDLE_REASON =
  "minified interfig bundle that the Praetor engine writes and its audit locks byte for byte";
const ENGINE_VENDOR_REASON =
  "interfig source that the Praetor engine vendors byte for byte from upstream";
const ENGINE_RULE_REASON =
  "Markdown rule that the Praetor engine writes and its audit locks byte for byte";
const ENGINE_FILE_EXPIRY = "2027-01-09";

function engineFileException(filePath, rule, reason) {
  return Object.freeze({ expires: ENGINE_FILE_EXPIRY, path: filePath, reason, rule });
}

export const CODE_SHAPE_EXCEPTIONS = Object.freeze([
  engineFileException("tools/figures/dist/player.js", "complexity", ENGINE_BUNDLE_REASON),
  engineFileException("tools/figures/dist/player.js", "max-statements", ENGINE_BUNDLE_REASON),
  engineFileException(
    "tools/figures/third_party/interfig/upstream/src/svg.ts",
    "max-lines-per-function",
    ENGINE_VENDOR_REASON,
  ),
  engineFileException(
    "tools/figures/third_party/interfig/upstream/src/svg.ts",
    "max-statements",
    ENGINE_VENDOR_REASON,
  ),
  engineFileException(
    "tools/markdownlint/no-private-scratch-links.mjs",
    "complexity",
    ENGINE_RULE_REASON,
  ),
]);

const EXCEPTION_KEYS = Object.freeze(["expires", "path", "reason", "rule"]);
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function isCalendarDate(value) {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

function validateException(entry, index, seen) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`code-shape exception ${index} must be an object`);
  }
  if (Object.keys(entry).sort().join() !== EXCEPTION_KEYS.join()) {
    fail(`code-shape exception ${index} must hold exactly expires, path, reason and rule`);
  }
  if (typeof entry.path !== "string" || entry.path.length === 0) {
    fail(`code-shape exception ${index} has no path`);
  }
  if (!Object.hasOwn(CODE_SHAPE_POLICY, entry.rule)) {
    fail(`code-shape exception ${index} has unknown rule ${entry.rule}`);
  }
  if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
    fail(`code-shape exception ${index} has no reason`);
  }
  if (!isCalendarDate(entry.expires)) {
    fail(`code-shape exception ${index} has no calendar end date`);
  }
  const key = findingKey(entry);
  if (seen.has(key)) {
    fail(`duplicate code-shape exception: ${entry.path} · ${entry.rule}`);
  }
  seen.add(key);
}

export function validateExceptions(exceptions) {
  if (!Array.isArray(exceptions)) fail("code-shape exceptions must be an array");
  const seen = new Set();
  exceptions.forEach((entry, index) => validateException(entry, index, seen));
  return exceptions;
}

export function currentCalendarDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function exceptionIsActive(exception, today) {
  return Boolean(exception) && today <= exception.expires;
}

function newGroupRegression(finding, exception, today) {
  const group = `${finding.path} · ${finding.rule}: new group with ${finding.count} finding(s), worst ${finding.maxActual}`;
  if (!exception) return group;
  if (exceptionIsActive(exception, today)) return null;
  return `${group}; its exception expired on ${exception.expires}`;
}

function recordedGroupRegressions(finding, prior, exception) {
  const regressions = [];
  if (exception) {
    regressions.push(
      `${finding.path} · ${finding.rule}: exception names a group the baseline already records`,
    );
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
  return regressions;
}

function unusedExceptionRegressions(exceptions, current) {
  const currentKeys = new Set(current.findings.map(findingKey));
  return exceptions
    .filter((exception) => !currentKeys.has(findingKey(exception)))
    .map((exception) => (
      `${exception.path} · ${exception.rule}: exception matches no finding; remove the entry`
    ));
}

export function compareSnapshots(
  baseline,
  current,
  { exceptions = [], today = currentCalendarDate() } = {},
) {
  validateBaseline(baseline);
  validateBaseline(current);
  validateExceptions(exceptions);
  if (!isCalendarDate(today)) fail("code-shape comparison date must be a calendar date");

  const baselineByKey = new Map(
    baseline.findings.map((finding) => [findingKey(finding), finding]),
  );
  const exceptionByKey = new Map(
    exceptions.map((exception) => [findingKey(exception), exception]),
  );
  const regressions = [];

  for (const finding of current.findings) {
    const key = findingKey(finding);
    const prior = baselineByKey.get(key);
    const exception = exceptionByKey.get(key);
    if (prior) {
      regressions.push(...recordedGroupRegressions(finding, prior, exception));
      continue;
    }
    const regression = newGroupRegression(finding, exception, today);
    if (regression) regressions.push(regression);
  }

  return [...regressions, ...unusedExceptionRegressions(exceptions, current)];
}

// The groups an unexpired exception covers. They stay out of a written
// baseline, so an exception can never turn into recorded debt.
export function exceptedFindings(
  current,
  { exceptions = [], today = currentCalendarDate() } = {},
) {
  validateExceptions(exceptions);
  const exceptionByKey = new Map(
    exceptions.map((exception) => [findingKey(exception), exception]),
  );
  return current.findings
    .map((finding) => ({ exception: exceptionByKey.get(findingKey(finding)), finding }))
    .filter(({ exception }) => exceptionIsActive(exception, today));
}

function readBaseline(baselinePath) {
  if (!existsSync(baselinePath)) {
    fail(`code-shape baseline is missing: ${baselinePath}`);
  }
  return parseBaseline(readFileSync(baselinePath, "utf8"));
}

function parseBaseline(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`cannot parse code-shape baseline: ${error.message}`);
  }
  return validateBaseline(parsed);
}

// The baseline a change is compared with in CI: the one recorded at the
// change's base commit. A base that is malformed, absent from the checkout or
// without a baseline fails; none of them may pass as "nothing to compare".
export async function readBaseRevisionBaseline(baseRevision, { gitRoot = repositoryRoot } = {}) {
  if (typeof baseRevision !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(baseRevision) || /^0+$/.test(baseRevision)) {
    fail(`base revision must be a full commit object name: ${baseRevision || "(empty)"}`);
  }
  const options = { ...gitLimits, cwd: gitRoot };
  try {
    await runFile("git", ["cat-file", "-e", `${baseRevision}^{commit}`], options);
  } catch (error) {
    fail(`base revision ${baseRevision} is not a commit in this checkout: ${error.message.trim()}`);
  }
  let text;
  try {
    ({ stdout: text } = await runFile("git", ["show", `${baseRevision}:${BASELINE_GIT_PATH}`], options));
  } catch (error) {
    fail(`base revision ${baseRevision} records no ${BASELINE_GIT_PATH}: ${error.message.trim()}`);
  }
  return parseBaseline(text);
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

function withoutExceptedFindings(current, excepted) {
  const exceptedKeys = new Set(excepted.map(({ finding }) => findingKey(finding)));
  return {
    ...current,
    findings: current.findings.filter((finding) => !exceptedKeys.has(findingKey(finding))),
  };
}

function printExceptedFindings(excepted) {
  for (const { exception, finding } of excepted) {
    console.log(
      `  dated exception until ${exception.expires}: ${finding.path} · ${finding.rule}, ${finding.count} finding(s), worst ${finding.maxActual}.`,
    );
  }
}

export async function runCodeShapeAudit({
  root = repositoryRoot,
  baselinePath = DEFAULT_BASELINE_PATH,
  baseRevision,
  gitRoot = root,
  write = false,
  exceptions = CODE_SHAPE_EXCEPTIONS,
  today = currentCalendarDate(),
} = {}) {
  const current = await createCurrentSnapshot({ root });
  const excepted = exceptedFindings(current, { exceptions, today });
  if (write) {
    const recorded = withoutExceptedFindings(current, excepted);
    writeFileSync(baselinePath, serializeBaseline(recorded), "utf8");
    printSummary(recorded, "baseline written");
    printExceptedFindings(excepted);
    return recorded;
  }

  const baseline = baseRevision === undefined
    ? readBaseline(baselinePath)
    : await readBaseRevisionBaseline(baseRevision, { gitRoot });
  const regressions = compareSnapshots(baseline, current, { exceptions, today });
  printSummary(current, "check");
  printExceptedFindings(excepted);
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
  let baseRevision;
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
    else if (argument === "--base-revision") {
      // An empty value is kept so that the comparison refuses it by name.
      baseRevision = arguments_[index + 1] ?? "";
      index += 1;
    }
    else fail(`unknown argument: ${argument}`);
  }
  if (write && check) fail("--write and --check are mutually exclusive");
  if (write && (baselinePath !== DEFAULT_BASELINE_PATH || baseRevision !== undefined)) {
    fail("--write cannot target an alternate comparison baseline");
  }
  if (baseRevision !== undefined && baselinePath !== DEFAULT_BASELINE_PATH) {
    fail("--baseline and --base-revision are mutually exclusive");
  }
  return { write, baselinePath, baseRevision };
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
