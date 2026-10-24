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

export async function temporaryOutput(prefix, baseRoot = defaultTemporaryRoot) {
  await mkdir(baseRoot, { recursive: true });
  const parent = await mkdtemp(path.join(baseRoot, prefix));
  return Object.freeze({ parent, output: path.join(parent, "run") });
}

export async function cleanup(...fixtures) {
  const boundedFixtures = fixtures.slice(0, 32);
  for (const fixture of boundedFixtures) {
    if (!fixture?.parent) {
      continue;
    }
    assert.ok(fixture.parent.startsWith(defaultTemporaryRoot));
    await rm(fixture.parent, { recursive: true, force: true });
  }
}

export async function assertResumeMatchesUninterruptedExecution({
  execute,
  resumed,
  complete,
  resumedOutput = resumed?.output ?? resumed,
  completeOutput = complete?.output ?? complete,
  maxWorkUnits = 7,
  extraChecks = () => {},
}) {
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
  confirmationPattern = /private partitions are not executable|confirmation and transfer are inaccessible/,
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
  const boundedOptions = rejectedOptions.slice(0, 16);
  for (const option of boundedOptions) {
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
