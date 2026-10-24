import { readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";
import { executeFixture026RsdT02 } from "./rsd-t02-runner.mjs";
import { cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";

export { cleanup, temporaryOutput };

export const RAW_FILE = "rsd-t02-raw-events.jsonl";
export const CHECKPOINT_FILE = "rsd-t02-checkpoint.json";
export const RUN_FILE = "rsd-t02-run.json";
export const ARM_COMMITMENT_FILE = "rsd-t02-arm-commitment.json";
export const ARM_ABSTENTION_FILE = "rsd-t02-arm-abstention.json";
export const ARM_ABSTENTION_PENDING_FILE = `${ARM_ABSTENTION_FILE}.pending`;
export const SUMMARY_FILE = path.join("analysis", "rsd-t02-summary.json");
export const ACTIVE_ARM_IDS = Object.freeze([
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

export function rehashArmCommitment(commitment) {
  const body = { ...commitment };
  delete body.commitment_sha256;
  commitment.commitment_sha256 = sha256Hex(canonicalize(body));
  return commitment;
}

export function rechain(records) {
  let previousHash = "0".repeat(64);
  for (const [sequence, record] of records.entries()) {
    let bytes = record.serialized_event_bytes_written;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      record.serialized_event_bytes_written = bytes;
      const payload = { ...record };
      delete payload.integrity;
      record.integrity = {
        sequence,
        previous_sha256: previousHash,
        record_sha256: sha256Hex(`${previousHash}\n${canonicalize(payload)}`),
      };
      const observed = Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8");
      if (observed === bytes) break;
      bytes = observed;
      if (iteration === 7) throw new Error("test ledger byte charge did not converge");
    }
    previousHash = record.integrity.record_sha256;
  }
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export async function corruptPartial(mutate) {
  const fixture = await temporaryOutput("fixture-026-rsd-t02-corrupt-");
  await executeFixture026RsdT02({
    profile: "smoke",
    output: fixture.output,
    maxWorkUnits: 1,
  });
  const rawPath = path.join(fixture.output, RAW_FILE);
  await mutate({ fixture, rawPath, raw: await readFile(rawPath, "utf8") });
  return fixture;
}
