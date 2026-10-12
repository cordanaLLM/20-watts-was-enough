import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  aggregateFindings,
  BASELINE_SCHEMA_VERSION,
  CODE_SHAPE_EXCEPTIONS,
  CODE_SHAPE_POLICY,
  compareSnapshots,
  currentCalendarDate,
  DEFAULT_BASELINE_PATH,
  exceptedFindings,
  readBaseRevisionBaseline,
  runCodeShapeAudit,
  validateBaseline,
  validateExceptions,
} from "./audit-code-shape.mjs";

function snapshot(findings, auditedFileCount = 10) {
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    policy: { ...CODE_SHAPE_POLICY },
    auditedFileCount,
    findings,
  };
}

function finding(rule, count, maxActual, file = "scripts/example.mjs") {
  return { path: file, rule, count, maxActual };
}

test("a new finding count fails the no-regression comparison", () => {
  const baseline = snapshot([finding("complexity", 1, 31)]);
  const current = snapshot([finding("complexity", 2, 31)]);
  assert.deepEqual(compareSnapshots(baseline, current), [
    "scripts/example.mjs · complexity: finding count 1 -> 2",
  ]);
});

test("a worsened maximum fails even when the count is unchanged", () => {
  const baseline = snapshot([finding("max-statements", 2, 70)]);
  const current = snapshot([finding("max-statements", 2, 71)]);
  assert.deepEqual(compareSnapshots(baseline, current), [
    "scripts/example.mjs · max-statements: worst actual 70 -> 71",
  ]);
});

test("new file-rule groups fail", () => {
  const baseline = snapshot([]);
  const current = snapshot([finding("max-lines-per-function", 1, 121)]);
  assert.match(compareSnapshots(baseline, current)[0], /new group/);
});

test("finding and maximum reductions pass, including removed groups", () => {
  const baseline = snapshot([
    finding("complexity", 3, 44),
    finding("max-statements", 1, 80, "worker/example.ts"),
  ]);
  const current = snapshot([finding("complexity", 2, 40)]);
  assert.deepEqual(compareSnapshots(baseline, current), []);
});

test("aggregation ignores source line shifts and canonicalizes file paths", () => {
  const root = path.resolve("code-shape-test-root");
  const result = (line) => [{
    filePath: path.join(root, "src", "example.js"),
    messages: [{
      fatal: false,
      line,
      column: 1,
      ruleId: "complexity",
      message: "Function 'example' has a complexity of 31. Maximum allowed is 30.",
    }],
  }];
  assert.deepEqual(
    aggregateFindings(root, result(3)),
    aggregateFindings(root, result(300)),
  );
  assert.equal(aggregateFindings(root, result(3)).findings[0].path, "src/example.js");
});

test("an unexpectedly empty audited source set fails closed", () => {
  assert.throws(() => aggregateFindings(process.cwd(), []), /unexpectedly vanished/);
});

test("malformed and stale baseline schemas fail closed", () => {
  assert.throws(
    () => validateBaseline({ schemaVersion: 999 }),
    /unsupported baseline schemaVersion/,
  );
  assert.throws(
    () => validateBaseline(snapshot([
      finding("complexity", 1, CODE_SHAPE_POLICY.complexity),
    ])),
    /does not exceed its policy threshold/,
  );
  assert.throws(
    () => validateBaseline({
      ...snapshot([]),
      policy: { ...CODE_SHAPE_POLICY, complexity: 31 },
    }),
    /policy is stale or malformed/,
  );
});

const ENGINE_FILE = "tools/figures/dist/player.js";
const LAST_DAY = "2027-01-09";

function exception(rule = "complexity", file = ENGINE_FILE, expires = LAST_DAY) {
  return { expires, path: file, reason: "engine-written bundle", rule };
}

test("a dated exception covers its group through its last day and not after", () => {
  const baseline = snapshot([]);
  const current = snapshot([finding("complexity", 27, 181, ENGINE_FILE)]);
  const exceptions = [exception()];
  assert.deepEqual(compareSnapshots(baseline, current, { exceptions, today: LAST_DAY }), []);
  assert.deepEqual(compareSnapshots(baseline, current, { exceptions, today: "2027-01-10" }), [
    `${ENGINE_FILE} · complexity: new group with 27 finding(s), worst 181; its exception expired on ${LAST_DAY}`,
  ]);
});

test("a dated exception covers one path and one rule only", () => {
  const baseline = snapshot([]);
  const options = { exceptions: [exception()], today: "2026-10-11" };
  const covered = finding("complexity", 27, 181, ENGINE_FILE);
  for (const other of [
    finding("max-statements", 3, 733, ENGINE_FILE),
    finding("complexity", 1, 31, "tools/figures/dist/loader.js"),
    finding("complexity", 1, 31, `${ENGINE_FILE}.map.js`),
    finding("complexity", 1, 31, "tools/figures/dist"),
  ]) {
    const findings = [covered, other].sort((left, right) => (
      left.path.localeCompare(right.path, "en") || left.rule.localeCompare(right.rule, "en")
    ));
    const regressions = compareSnapshots(baseline, snapshot(findings), options);
    assert.equal(regressions.length, 1, JSON.stringify(regressions));
    assert.match(regressions[0], /new group with/);
    assert.ok(regressions[0].startsWith(`${other.path} · ${other.rule}:`));
  }
});

test("an exception path is literal, never a pattern", () => {
  const current = snapshot([finding("complexity", 27, 181, ENGINE_FILE)]);
  for (const pattern of ["tools/figures/dist/*.js", "tools/figures/**", "tools/figures/dist/"]) {
    const regressions = compareSnapshots(snapshot([]), current, {
      exceptions: [exception("complexity", pattern)],
      today: "2026-10-11",
    });
    assert.deepEqual(regressions, [
      `${ENGINE_FILE} · complexity: new group with 27 finding(s), worst 181`,
      `${pattern} · complexity: exception matches no finding; remove the entry`,
    ]);
  }
});

test("an exception that no finding uses fails, also after its last day", () => {
  for (const today of ["2026-10-11", "2027-01-10"]) {
    assert.deepEqual(
      compareSnapshots(snapshot([]), snapshot([]), { exceptions: [exception()], today }),
      [`${ENGINE_FILE} · complexity: exception matches no finding; remove the entry`],
    );
  }
});

test("an exception cannot name a group the baseline records", () => {
  const recorded = snapshot([finding("complexity", 27, 181, ENGINE_FILE)]);
  assert.deepEqual(
    compareSnapshots(recorded, recorded, { exceptions: [exception()], today: "2026-10-11" }),
    [`${ENGINE_FILE} · complexity: exception names a group the baseline already records`],
  );
});

test("malformed exception lists and comparison dates fail closed", () => {
  const cases = [
    ["not a list", { 0: exception() }, /must be an array/],
    ["not an object", ["tools/figures/dist/player.js"], /must be an object/],
    ["extra key", [{ ...exception(), files: ["a.js"] }], /must hold exactly/],
    ["missing reason key", [{ expires: LAST_DAY, path: ENGINE_FILE, rule: "complexity" }], /must hold exactly/],
    ["empty path", [exception("complexity", "")], /has no path/],
    ["unknown rule", [exception("no-undef")], /unknown rule no-undef/],
    ["inherited rule name", [exception("toString")], /unknown rule toString/],
    ["blank reason", [{ ...exception(), reason: "  " }], /has no reason/],
    ["no end date", [{ ...exception(), expires: "" }], /no calendar end date/],
    ["end date in another form", [{ ...exception(), expires: "09.01.2027" }], /no calendar end date/],
    ["impossible end date", [{ ...exception(), expires: "2027-02-30" }], /no calendar end date/],
    ["declared twice", [exception(), exception()], /duplicate code-shape exception/],
  ];
  for (const [name, exceptions, message] of cases) {
    assert.throws(() => validateExceptions(exceptions), message, name);
    assert.throws(
      () => compareSnapshots(snapshot([]), snapshot([]), { exceptions, today: "2026-10-11" }),
      message,
      name,
    );
  }
  for (const today of ["", "11.10.2026", "2026-13-01"]) {
    assert.throws(
      () => compareSnapshots(snapshot([]), snapshot([]), { exceptions: [], today }),
      /comparison date must be a calendar date/,
    );
  }
});

test("excepted groups are listed only while the exception is in force", () => {
  const covered = finding("complexity", 27, 181, ENGINE_FILE);
  const current = snapshot([covered, finding("complexity", 1, 31)]);
  const exceptions = [exception()];
  assert.deepEqual(exceptedFindings(current, { exceptions, today: LAST_DAY }), [
    { exception: exceptions[0], finding: covered },
  ]);
  assert.deepEqual(exceptedFindings(current, { exceptions, today: "2027-01-10" }), []);
  assert.deepEqual(exceptedFindings(current, { exceptions: [], today: LAST_DAY }), []);
});

test("the comparison day is the UTC calendar day", () => {
  assert.equal(currentCalendarDate(new Date("2027-01-09T23:59:59Z")), "2027-01-09");
  assert.equal(currentCalendarDate(new Date("2027-01-10T00:00:00Z")), "2027-01-10");
});

test("the declared exceptions are five engine-file groups with one last day", () => {
  validateExceptions(CODE_SHAPE_EXCEPTIONS);
  assert.deepEqual(
    CODE_SHAPE_EXCEPTIONS.map((entry) => `${entry.path} · ${entry.rule} · ${entry.expires}`),
    [
      "tools/figures/dist/player.js · complexity · 2027-01-09",
      "tools/figures/dist/player.js · max-statements · 2027-01-09",
      "tools/figures/third_party/interfig/upstream/src/svg.ts · max-lines-per-function · 2027-01-09",
      "tools/figures/third_party/interfig/upstream/src/svg.ts · max-statements · 2027-01-09",
      "tools/markdownlint/no-private-scratch-links.mjs · complexity · 2027-01-09",
    ],
  );
});

test("the live audit fails once the declared exceptions have ended", async () => {
  await assert.rejects(
    () => runCodeShapeAudit({ today: "2027-01-10" }),
    /player\.js · complexity: new group with 27 finding\(s\), worst 181; its exception expired on 2027-01-09/,
  );
});

test("the live audit fails without the declared exceptions", async () => {
  await assert.rejects(
    () => runCodeShapeAudit({ exceptions: [] }),
    /svg\.ts · max-statements: new group with 1 finding\(s\), worst 61\n/,
  );
});

test("the tracked repository baseline passes the live ESLint audit", async () => {
  const snapshot = await runCodeShapeAudit();
  assert.ok(snapshot.auditedFileCount > 0);
});

// A throwaway repository with one commit per entry in `commits`; an entry is
// the baseline text to record, or null for a commit without a baseline.
function baseRepository(t, commits) {
  const root = mkdtempSync(path.join(os.tmpdir(), "code-shape-base-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const git = (...argumentsList) => execFileSync("git", [
    "-c", "user.name=Code Shape Test", "-c", "user.email=code-shape@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...argumentsList,
  ], { cwd: root, encoding: "utf8", timeout: 30_000 }).trim();
  git("init", "--quiet");
  mkdirSync(path.join(root, "scripts"));
  const baselineFile = path.join(root, "scripts", "code-shape-baseline.json");
  return commits.map((text, index) => {
    if (text === null) rmSync(baselineFile, { force: true });
    else writeFileSync(baselineFile, text, "utf8");
    git("add", "--all");
    git("commit", "--quiet", "--allow-empty", "--message", `commit ${index}`);
    return { root, revision: git("rev-parse", "HEAD") };
  });
}

const trackedBaselineText = readFileSync(DEFAULT_BASELINE_PATH, "utf8");

test("the base revision's recorded baseline is the comparison baseline", async (t) => {
  const [base] = baseRepository(t, [trackedBaselineText]);
  assert.deepEqual(
    await readBaseRevisionBaseline(base.revision, { gitRoot: base.root }),
    JSON.parse(trackedBaselineText),
  );
});

test("a base revision without a recorded baseline fails instead of passing", async (t) => {
  const [base] = baseRepository(t, [null]);
  await assert.rejects(
    () => readBaseRevisionBaseline(base.revision, { gitRoot: base.root }),
    /records no scripts\/code-shape-baseline\.json/,
  );
});

test("a base revision missing from the checkout fails instead of passing", async (t) => {
  const [base] = baseRepository(t, [trackedBaselineText]);
  const absent = base.revision.replace(/^./, (first) => (first === "0" ? "1" : "0"));
  await assert.rejects(
    () => readBaseRevisionBaseline(absent, { gitRoot: base.root }),
    /is not a commit in this checkout/,
  );
});

test("an empty, null or abbreviated base revision fails by name", async () => {
  for (const revision of ["", undefined, "0".repeat(40), "abc1234", `${"a".repeat(40)}\n`]) {
    await assert.rejects(
      () => readBaseRevisionBaseline(revision),
      /base revision must be a full commit object name/,
    );
  }
});

test("a base revision whose baseline is stricter rejects the live tree", async (t) => {
  const stricter = JSON.parse(trackedBaselineText);
  stricter.findings = stricter.findings.slice(1);
  const [base] = baseRepository(t, [`${JSON.stringify(stricter, null, 2)}\n`]);
  await assert.rejects(
    () => runCodeShapeAudit({ baseRevision: base.revision, gitRoot: base.root }),
    /code-shape regression\(s\):/,
  );
});

test("the live tree passes against its own tracked baseline as a base revision", async (t) => {
  const [base] = baseRepository(t, [trackedBaselineText]);
  const snapshot = await runCodeShapeAudit({ baseRevision: base.revision, gitRoot: base.root });
  assert.ok(snapshot.auditedFileCount > 0);
});
