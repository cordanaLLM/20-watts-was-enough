import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import path from "node:path";

const temporaryRoot = path.join(process.cwd(), "tmp");

export function createFixture029SuiteTestSupport({ defaultSubdir = "suite" } = {}) {
  const fixtures = [];

  async function temporaryOutput(prefix, subdir = defaultSubdir) {
    await mkdir(temporaryRoot, { recursive: true });
    const parent = await mkdtemp(path.join(temporaryRoot, prefix));
    const fixture = Object.freeze({ parent, output: path.join(parent, subdir) });
    fixtures.push(fixture);
    return fixture;
  }

  async function clonedBase(base, prefix, subdir = defaultSubdir) {
    const fixture = await temporaryOutput(prefix, subdir);
    await cp(base.output, fixture.output, { recursive: true, errorOnExist: true });
    return fixture;
  }

  async function sha256(file) {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  }

  async function cleanup() {
    for (const fixture of [...fixtures].reverse()) {
      assert.ok(fixture.parent.startsWith(temporaryRoot));
      await rm(fixture.parent, { recursive: true, force: true });
    }
  }

  return Object.freeze({ cleanup, clonedBase, sha256, temporaryOutput });
}
