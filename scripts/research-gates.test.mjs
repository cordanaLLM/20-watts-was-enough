import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Each research gate runs once against an unchanged copy of its inputs and then
// against planted defects; a gate that accepts a planted defect fails here.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateTimeoutMs = 120_000;

async function withSandbox(copied, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "research-gates-"));
  try {
    const copiedTops = new Set(copied.map((entry) => entry.split("/")[0]));
    for (const entry of copied) {
      await mkdir(path.dirname(path.join(root, entry)), { recursive: true });
      await cp(path.join(projectRoot, entry), path.join(root, entry), { recursive: true });
    }
    // Manifest validation refuses symbolic-link traversal for root files such
    // as lockfiles, so root files are copied and only directories are linked.
    for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
      if (entry.name === ".git" || copiedTops.has(entry.name)) continue;
      const source = path.join(projectRoot, entry.name);
      if (entry.isFile()) await cp(source, path.join(root, entry.name));
      else await symlink(source, path.join(root, entry.name));
    }
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function runGate(root, script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: gateTimeoutMs,
  });
  assert.equal(result.error, undefined, `${script} did not finish: ${result.error}`);
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

async function withPlant(root, relativePath, mutate, callback) {
  const absolutePath = path.join(root, relativePath);
  const original = await readFile(absolutePath);
  try {
    const planted = await mutate(original);
    if (planted === null) await rm(absolutePath);
    else await writeFile(absolutePath, planted);
    await callback();
  } finally {
    await writeFile(absolutePath, original);
  }
}

function editJson(edit) {
  return (bytes) => {
    const document = JSON.parse(bytes.toString("utf8"));
    edit(document);
    return `${JSON.stringify(document, null, 2)}\n`;
  };
}

function assertRefused(run, pattern) {
  assert.notEqual(run.status, 0, `gate accepted a planted defect:\n${run.output}`);
  assert.match(run.output, pattern);
}

test("science taxonomy validator accepts the tree and refuses planted taxonomy defects", async (t) => {
  await withSandbox(
    ["research", "sources/taxonomies", "scripts/validate-science-taxonomies.mjs"],
    async (root) => {
      const gate = path.join(root, "scripts", "validate-science-taxonomies.mjs");
      const run = () => runGate(root, gate);

      await t.test("baseline passes", () => {
        const result = run();
        assert.equal(result.status, 0, result.output);
        assert.match(result.output, /Science taxonomies validated: 214 DFG subjects/u);
      });
      await t.test("a repeated DFG subject code is refused", () =>
        withPlant(
          root,
          "research/taxonomies/fine-grained-fields.json",
          editJson((data) => {
            data.dfg.subjects[1].code = data.dfg.subjects[0].code;
          }),
          () => assertRefused(run(), /DFG subjects repeats code /u),
        ));
      await t.test("a route to an undefined claim is refused", () =>
        withPlant(
          root,
          "research/taxonomies/fine-grained-routing.json",
          editJson((routing) => {
            routing.assignments[0].claims.push("C-99999");
          }),
          () => assertRefused(run(), /references undefined central claim C-99999/u),
        ));
      await t.test("a changed source byte is refused", () =>
        withPlant(
          root,
          "sources/taxonomies/2026-08-25/anzsrc2020_for.csv",
          (bytes) => Buffer.concat([bytes, Buffer.from("\n")]),
          () => assertRefused(run(), /source hash mismatch: .*anzsrc2020_for\.csv/u),
        ));
    },
  );
});

test("taxonomy depth check accepts the tree and refuses a stale page", async (t) => {
  await withSandbox(["research"], async (root) => {
    const run = () => runGate(root, path.join(projectRoot, "scripts", "generate-taxonomy-depth.mjs"), ["--check"]);
    const stale = /field-depth\.md is stale/u;

    await t.test("baseline passes", () => {
      const result = run();
      assert.equal(result.status, 0, result.output);
    });
    await t.test("an edited page is refused", () =>
      withPlant(
        root,
        "research/taxonomies/field-depth.md",
        (bytes) => Buffer.concat([bytes, Buffer.from("planted line\n")]),
        () => assertRefused(run(), stale),
      ));
    await t.test("a renamed source subject is refused", () =>
      withPlant(
        root,
        "research/taxonomies/fine-grained-fields.json",
        editJson((data) => {
          data.dfg.subjects[0].name = `${data.dfg.subjects[0].name} planted`;
        }),
        () => assertRefused(run(), stale),
      ));
  });
});

test("field coverage check accepts the tree and refuses planted coverage defects", async (t) => {
  await withSandbox(["research", "public/plots/global-field-coverage.svg"], async (root) => {
    const run = () => runGate(root, path.join(projectRoot, "scripts", "generate-field-coverage.mjs"), ["--check"]);

    await t.test("baseline passes", () => {
      const result = run();
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /Field coverage validated:/u);
    });
    await t.test("an edited plot is refused", () =>
      withPlant(
        root,
        "public/plots/global-field-coverage.svg",
        (bytes) => Buffer.concat([bytes, Buffer.from("<!-- planted -->\n")]),
        () => assertRefused(run(), /generated file is stale: public\/plots\/global-field-coverage\.svg/u),
      ));
    await t.test("a missing page is refused", () =>
      withPlant(
        root,
        "research/field-coverage.md",
        () => null,
        () => assertRefused(run(), /missing generated file research\/field-coverage\.md/u),
      ));
    await t.test("a repeated OECD field code is refused", () =>
      withPlant(
        root,
        "research/field-coverage.json",
        editJson((data) => {
          data.oecdFields[1].code = data.oecdFields[0].code;
        }),
        () => assertRefused(run(), /contains duplicate code /u),
      ));
  });
});

test("test coverage check accepts the tree and refuses stale or missing reports", async (t) => {
  await withSandbox(["experiments", "research"], async (root) => {
    const run = () => runGate(root, path.join(projectRoot, "scripts", "audit-test-coverage.mjs"), ["--check"]);

    await t.test("baseline passes", () => {
      const result = run();
      assert.equal(result.status, 0, result.output);
    });
    await t.test("an edited JSON report is refused", () =>
      withPlant(
        root,
        "experiments/test-coverage.json",
        (bytes) => Buffer.concat([bytes, Buffer.from("\n")]),
        () => assertRefused(run(), /Stale generated report: experiments\/test-coverage\.json/u),
      ));
    await t.test("a missing Markdown report is refused", () =>
      withPlant(
        root,
        "experiments/test-coverage.md",
        () => null,
        () => assertRefused(run(), /Missing generated report: experiments\/test-coverage\.md/u),
      ));
  });
});

test("plot check accepts the committed plots and refuses a stale or missing plot", async (t) => {
  await withSandbox(["public/plots"], async (root) => {
    const run = () => runGate(root, path.join(projectRoot, "scripts", "generate-plots.mjs"), ["--check"]);
    const plot = "public/plots/repeated-stimulus-skipping-cell.svg";

    await t.test("baseline passes", () => {
      const result = run();
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /Validated \d+ plots in public\/plots/u);
    });
    await t.test("an edited plot is refused", () =>
      withPlant(
        root,
        plot,
        (bytes) => Buffer.from(bytes.toString("utf8").replace("540.4540308838538", "540.4540308838539")),
        () => assertRefused(run(), /Plots are missing or stale.*\n(?:.*\n)*public\/plots\/repeated-stimulus-skipping-cell\.svg/u),
      ));
    await t.test("a missing plot is refused", () =>
      withPlant(
        root,
        plot,
        () => null,
        () => assertRefused(run(), /public\/plots\/repeated-stimulus-skipping-cell\.svg/u),
      ));
  });
});
