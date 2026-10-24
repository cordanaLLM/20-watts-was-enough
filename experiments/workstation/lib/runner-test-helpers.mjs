import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const defaultTemporaryRoot = path.join(process.cwd(), "tmp");

const maxCleanupFixtures = 32;
const maxRejectedOptions = 16;

export async function temporaryOutput(prefix) {
  await mkdir(defaultTemporaryRoot, { recursive: true });
  const parent = await mkdtemp(path.join(defaultTemporaryRoot, prefix));
  return Object.freeze({ parent, output: path.join(parent, "run") });
}

export async function cleanup(...fixtures) {
  assert.ok(fixtures.length <= maxCleanupFixtures, `cleanup accepts at most ${maxCleanupFixtures} fixtures`);
  for (const fixture of fixtures) {
    assert.ok(fixture.parent.startsWith(defaultTemporaryRoot));
    await rm(fixture.parent, { recursive: true, force: true });
  }
}

export async function assertResumeMatchesUninterruptedExecution({
  execute,
  resumed,
  complete,
  maxWorkUnits = 7,
  extraChecks = () => {},
}) {
  const resumedOutput = resumed.output;
  const completeOutput = complete.output;
  const partial = await execute({
    profile: "smoke",
    output: resumedOutput,
    maxWorkUnits,
  });
  assert.equal(partial.complete, false);
  extraChecks(partial);
  const finished = await execute({
    profile: "smoke",
    output: resumedOutput,
    resume: true,
  });
  assert.equal(finished.complete, true);
  extraChecks(finished);
  await execute({ profile: "smoke", output: completeOutput });
  assert.equal(
    await readFile(path.join(resumedOutput, "raw-events.jsonl"), "utf8"),
    await readFile(path.join(completeOutput, "raw-events.jsonl"), "utf8"),
  );
  assert.equal(
    await readFile(path.join(resumedOutput, "checkpoint.json"), "utf8"),
    await readFile(path.join(completeOutput, "checkpoint.json"), "utf8"),
  );
}

export async function assertCliExecutionRejections({
  main,
  confirmationPattern,
  rejectedOptions = [["--seeds", "private.json"]],
}) {
  await assert.rejects(
    () => main(["node", "runner.mjs", "confirmation", "--profile", "development"]),
    confirmationPattern,
  );
  await assert.rejects(
    () => main(["node", "runner.mjs", "smoke", "--profile", "smoke"]),
    /requires --output/,
  );
  assert.ok(
    rejectedOptions.length <= maxRejectedOptions,
    `at most ${maxRejectedOptions} rejected options`,
  );
  for (const option of rejectedOptions) {
    await assert.rejects(
      () => main(["node", "runner.mjs", "prepare", "--profile", "smoke", ...option]),
      /Unknown or duplicate/,
    );
  }
}

export async function assertCliOptionRejections(main) {
  await assert.rejects(
    () => main(["node", "runner.mjs", "smoke", "--profile", "smoke"]),
    /requires --output/,
  );
  await assert.rejects(
    () => main(["node", "runner.mjs", "prepare", "--profile", "smoke", "--oracle", "yes"]),
    /Unknown or duplicate/,
  );
}

export function releaseEnvironment(artifact = "fixture-019") {
  return {
    EXPERIMENT_ARTIFACT: artifact,
    EXPERIMENT_IMAGE_NAME: `ghcr.io/cordanallm/20-watts-was-enough-${artifact}`,
    EXPERIMENT_IMAGE_VERSION: "v1.2.3",
    EXPERIMENT_SOURCE_REVISION: "a".repeat(40),
    EXPERIMENT_RESULT_AUTHORITY: "NO_RESULT",
    EXPERIMENT_IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
  };
}

export function releaseIdentityMismatches(environment) {
  return [
    { ...environment, EXPERIMENT_IMAGE_NAME: `${environment.EXPERIMENT_IMAGE_NAME}-other` },
    { ...environment, EXPERIMENT_IMAGE_VERSION: "v1.2.4" },
    { ...environment, EXPERIMENT_SOURCE_REVISION: "c".repeat(40) },
    { ...environment, EXPERIMENT_IMAGE_DIGEST: `sha256:${"d".repeat(64)}` },
  ];
}

export async function assertReleaseExecutionRequiresDigest({
  execute,
  main,
  environment,
  output,
}) {
  await assert.rejects(
    () => execute(),
    /requires EXPERIMENT_IMAGE_DIGEST/u,
  );
  await assert.rejects(
    () => main(
      ["node", "runner.mjs", "prepare", "--profile", "smoke"],
      environment,
    ),
    /requires EXPERIMENT_IMAGE_DIGEST/u,
  );
  await assert.rejects(() => readFile(path.join(output, "run.json")), /ENOENT/u);
}

export async function assertDeterministicSmokeExecution(execute, leftOutput, rightOutput) {
  await execute({ profile: "smoke", output: leftOutput });
  await execute({ profile: "smoke", output: rightOutput });
  assert.equal(
    await readFile(path.join(leftOutput, "raw-events.jsonl"), "utf8"),
    await readFile(path.join(rightOutput, "raw-events.jsonl"), "utf8"),
  );
}

export async function corruptRawEventsFirstRow(
  directory,
  mutate = (record) => {
    record.loss += 0.1;
  },
) {
  const rawPath = path.join(directory, "raw-events.jsonl");
  const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
  const first = JSON.parse(rows[0]);
  mutate(first);
  rows[0] = JSON.stringify(first);
  await writeFile(rawPath, `${rows.join("\n")}\n`);
}
