// Dated exceptions for files that the Praetor engine writes and its audit locks
// byte for byte, under this repository's own lint and type check. An entry
// names one path and the exact rules or diagnostics it covers. From the day
// after `expires` it covers nothing, so the gate fails as if the entry were
// absent. Decision 0095, point 10.

const BUNDLE_REASON = "minified interfig bundle that the Praetor engine writes and its audit locks byte for byte";
const RULE_REASON = "Markdown gate script that the Praetor engine writes and its audit locks byte for byte";
const VENDOR_REASON = "interfig source that the Praetor engine vendors byte for byte from upstream";

export const ENGINE_FILE_LAST_DAY = "2027-01-09";

function lintException(filePath, reason, rules) {
  return Object.freeze({ expires: ENGINE_FILE_LAST_DAY, path: filePath, reason, rules: Object.freeze(rules) });
}

export const LINT_EXCEPTIONS = Object.freeze([
  lintException("tools/figures/dist/loader.js", BUNDLE_REASON, [
    "@typescript-eslint/no-unused-expressions",
  ]),
  lintException("tools/figures/dist/player.js", BUNDLE_REASON, [
    "@typescript-eslint/no-this-alias",
    "@typescript-eslint/no-unused-expressions",
    "getter-return",
    "no-cond-assign",
    "no-constant-condition",
    "no-control-regex",
    "no-empty",
    "no-fallthrough",
    "no-misleading-character-class",
    "no-prototype-builtins",
    "no-undef",
    "no-unreachable",
    "no-useless-escape",
    "valid-typeof",
  ]),
  // The two Markdown gate scripts leave this list when the engine pin moves to
  // the commit that fixes their findings.
  lintException("tools/markdownlint/no-private-scratch-links.mjs", RULE_REASON, [
    "no-useless-escape",
  ]),
  lintException("tools/markdownlint/verify.mjs", RULE_REASON, [
    "no-regex-spaces",
    "no-useless-escape",
  ]),
]);

// svg.ts imports its siblings with a `.ts` suffix, which this repository's
// compiler options refuse (TS5097). No checked file imports it.
export const TYPE_CHECK_EXCEPTIONS = Object.freeze([
  Object.freeze({
    diagnostics: Object.freeze(["TS5097"]),
    expires: ENGINE_FILE_LAST_DAY,
    path: "tools/figures/third_party/interfig/upstream/src/svg.ts",
    reason: VENDOR_REASON,
  }),
]);

const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const PATTERN_CHARACTERS = /[*?[\]{}()|!\\]|\/$|^\.{0,2}\//u;

export function isCalendarDay(value) {
  if (typeof value !== "string" || !CALENDAR_DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function currentCalendarDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function isSortedUniqueStrings(values) {
  return Array.isArray(values)
    && values.length > 0
    && values.every((value) => typeof value === "string" && value.length > 0)
    && values.every((value, index) => index === 0 || values[index - 1] < value);
}

function entryFindings(entry, index, listKey) {
  const label = `engine-file exception ${index}`;
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return [`${label} must be an object`];
  }
  const findings = [];
  if (Object.keys(entry).sort().join() !== ["expires", "path", "reason", listKey].sort().join()) {
    findings.push(`${label} must hold exactly expires, path, reason and ${listKey}`);
  }
  if (typeof entry.path !== "string" || entry.path.length === 0 || PATTERN_CHARACTERS.test(entry.path)) {
    findings.push(`${label} must name one file by its literal repository path`);
  }
  if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
    findings.push(`${label} has no reason`);
  }
  if (!isCalendarDay(entry.expires)) {
    findings.push(`${label} has no calendar end day`);
  }
  if (!isSortedUniqueStrings(entry[listKey])) {
    findings.push(`${label} must list its ${listKey} as sorted, unique names`);
  }
  return findings;
}

// Returns the findings of a malformed list; an empty array means well formed.
export function engineFileExceptionFindings(exceptions, listKey) {
  if (!Array.isArray(exceptions)) return ["engine-file exceptions must be an array"];
  const findings = exceptions.flatMap((entry, index) => entryFindings(entry, index, listKey));
  const paths = exceptions.map((entry) => entry?.path);
  for (const [index, filePath] of paths.entries()) {
    if (paths.indexOf(filePath) !== index) {
      findings.push(`engine-file exception ${index} repeats the path ${filePath}`);
    }
  }
  return findings;
}

function assertWellFormed(exceptions, listKey, today) {
  const findings = engineFileExceptionFindings(exceptions, listKey);
  if (!isCalendarDay(today)) findings.push(`the comparison day must be a calendar day; got ${today}`);
  if (findings.length > 0) throw new Error(findings.join("\n"));
}

export function activeExceptions(exceptions, today) {
  return exceptions.filter((entry) => today <= entry.expires);
}

// ESLint flat-config objects that switch off the declared rules for the
// declared paths, for unexpired entries only.
export function lintExceptionOverrides(exceptions = LINT_EXCEPTIONS, today = currentCalendarDay()) {
  assertWellFormed(exceptions, "rules", today);
  return activeExceptions(exceptions, today).map((entry) => ({
    files: [entry.path],
    rules: Object.fromEntries(entry.rules.map((rule) => [rule, "off"])),
  }));
}
