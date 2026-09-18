import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, open, opendir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collectMathMarkdown, loadMathDocuments, maskMarkdownCode, readMathSnapshot } from "./lib/math-markdown.mjs";
import { normalizeMathRepository, normalizeMathText, replaceNormalizedMath } from "./lib/math-normalization.mjs";
import { validateMathText } from "./lib/math-validation.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));

test("every existing math-validation gate includes the dedicated regression suite", async () => {
  const manifest = JSON.parse(await readFile(path.join(scriptRoot, "../package.json"), "utf8"));
  assert.equal(manifest.scripts["test:math"], "node --test --experimental-test-isolation=none scripts/math-validation.test.mjs");
  assert.equal(manifest.scripts["validate:math"], "npm run test:math && node scripts/validate-math.mjs");
  for (const gate of ["test", "check:full-without-workstation", "check:lane-research"]) {
    assert.ok(manifest.scripts[gate].split(" && ").includes("npm run validate:math"), gate);
  }
});

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-math-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, body] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  return root;
}

// The inventory reports root-relative paths with "/" on every platform; mirror that here.
function relativePosix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function command(root, script = "validate-math.mjs", args = []) {
  const result = spawnSync(process.execPath, [path.join(scriptRoot, script), ...args], {
    cwd: root, encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("literal Markdown code is not a mathematical assertion", async (t) => {
  for (const [name, source] of [
    ["inline", "Use `$HOME` literally.\n"],
    ["unsupported delimiter example", "Describe `\\(x\\)` literally.\n"],
    ["nested backticks", "``one ` tick and $$ and $HOME``\n"],
    ["multiline", "`first $HOME\nsecond $$`\n"],
    ["indented", "    $HOME\n"],
    ["unclosed fence", "````text\n$$\n"],
    ["long fence", "````text\n```\n$$\n````\n"],
    ["Unicode and CRLF", "🧪 `\\(x\\) $HOME`\r\n\r\n$x+1$\r\n"],
  ]) {
    await t.test(name, async (context) => {
      const root = await fixture(context, { "README.md": source });
      const result = command(root);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(await readFile(path.join(root, "README.md"), "utf8"), source);
    });
  }
});

test("actual math assertions keep validation and source-line diagnostics", async (t) => {
  const valid = await fixture(t, { "README.md": "$x^2+1$\n\n$$\n\\frac{1}{2}\n$$\n" });
  assert.equal(command(valid).status, 0);
  for (const source of [
    "🧪 `$HOME`\r\n\r\n$\\notARealMathCommand{x}$\r\n",
    "`literal`\n\n$x+1\n",
    "`literal`\n\n\\(x\\)\n",
    "`literal`\n\n$\\text{`x`}+\\notARealMathCommand{x}$\n",
    "`literal`\n\n` unmatched $\\notARealMathCommand{x}$\n",
  ]) {
    const root = await fixture(t, { "README.md": source });
    const result = command(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /README\.md:3:/);
  }
});

test("noncanonical descendants cannot change canonical math results", async (t) => {
  for (const prefix of [
    ".workingdir2/worktrees/foreign", ".workingdir2/evidence/failed", "build/report",
    "dist-github-pages/documents", "public/repository-files", "sources/imported", "node_modules/package",
  ]) {
    const root = await fixture(t, { "README.md": "$x+1$\n", [`${prefix}/README.md`]: "$broken\n" });
    const result = command(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /0 display and 1 inline/);
  }
  const root = await fixture(t, { "docs/nested/a.md": "$broken\n" });
  assert.equal(command(root).status, 1);
});

test("generated-output exclusions are root-relative, not generic documentation folder names", async (t) => {
  const files = {
    "README.md": "$x$\n", "research/build/a.md": "$broken\n", "docs/coverage/a.md": "$broken\n",
    "docs/.cache/a.md": "$broken\n", "docs/sources/a.md": "$broken\n", "docs/tmp/a.md": "$broken\n",
    "docs/node_modules/package/a.md": "$ignored\n", "docs/.git/a.md": "$ignored\n",
  };
  const root = await fixture(t, files);
  const inventory = await collectMathMarkdown(root);
  assert.deepEqual(inventory.files.map((file) => relativePosix(root, file)), [
    "README.md", "docs/.cache/a.md", "docs/coverage/a.md", "docs/sources/a.md", "docs/tmp/a.md", "research/build/a.md",
  ]);
  const result = command(root);
  assert.equal(result.status, 1);
  for (const name of ["research/build", "docs/coverage", "docs/.cache", "docs/sources", "docs/tmp"]) {
    assert.ok(result.stderr.includes(`${name}/a.md:1:`), name);
  }
});

test("same-inode directory entry changes during enumeration and loading fail closed", async (t) => {
  for (const phase of ["enumeration", "loading"]) {
    for (const change of ["add", "remove", "rename"]) {
      await t.test(`${phase}: ${change}`, async (context) => {
        const root = await fixture(context, { "README.md": "$x$\n", "marker.txt": "marker" });
        const before = await lstat(root, { bigint: true });
        let mutated = false;
        async function mutate() {
          if (mutated) return;
          mutated = true;
          if (change === "add") await writeFile(path.join(root, "new.md"), "$broken\n");
          if (change === "remove") await rm(path.join(root, "marker.txt"));
          if (change === "rename") await rename(path.join(root, "marker.txt"), path.join(root, "renamed.txt"));
        }
        if (phase === "enumeration") {
          await assert.rejects(collectMathMarkdown(root, {}, async function* (directory) {
            for await (const entry of await opendir(directory)) yield entry;
            await mutate();
          }), /Math inventory directory changed/);
        } else {
          await assert.rejects(loadMathDocuments(root, {}, async (...args) => {
            const snapshot = await readMathSnapshot(...args);
            await mutate();
            return snapshot;
          }), /Math inventory directory changed/);
        }
        assert.equal(mutated, true);
        assert.equal((await lstat(root, { bigint: true })).ino, before.ino);
      });
    }
  }
});

test("final inventory preflight catches changes to a previously enumerated ancestor", async (t) => {
  const root = await fixture(t, { "docs/README.md": "$x$\n" });
  let mutated = false;
  await assert.rejects(collectMathMarkdown(root, {}, async function* (directory) {
    for await (const entry of await opendir(directory)) yield entry;
    if (directory !== root) {
      await writeFile(path.join(root, "later.md"), "$broken\n");
      mutated = true;
    }
  }), /Math inventory directory changed/);
  assert.equal(mutated, true);
});

test("normalizer changes only live delimiters and preserves literal code", async (t) => {
  const source = "🧪 `\\(literal\\)`\r\n\r\n\\(x+1\\)\r\n\r\n\\[\r\ny\r\n\\]\r\n";
  const root = await fixture(t, {
    "README.md": source,
    ".workingdir2/evidence/report.md": "\\(retained\\)\n",
  });
  const checked = command(root, "normalize-math-delimiters.mjs");
  assert.equal(checked.status, 1);
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"), source);
  const written = command(root, "normalize-math-delimiters.mjs", ["--write"]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"),
    "🧪 `\\(literal\\)`\r\n\r\n$x+1$\r\n\r\n$$\r\ny\r\n$$\r\n");
  assert.equal(await readFile(path.join(root, ".workingdir2/evidence/report.md"), "utf8"), "\\(retained\\)\n");
  assert.equal(command(root, "normalize-math-delimiters.mjs").status, 0);
});

test("code masking preserves offsets and cannot swallow neighbouring real math", () => {
  const source = "🧪 `$$ \\(x\\)`\r\n$\\text{`x`}+\\notARealMathCommand{x}$\r\n";
  const masked = maskMarkdownCode(source);
  assert.equal(masked.length, source.length);
  assert.deepEqual([...masked.matchAll(/[\r\n]/g)].map((match) => match.index),
    [...source.matchAll(/[\r\n]/g)].map((match) => match.index));
  assert.match(masked, /\$\\text\{`x`\}/);
  assert.match(validateMathText(source).failures.join("\n"), /document\.md:2: KaTeX/);
  for (const literal of ["`literal` \\[\n", "\\[ `literal`\n", "`literal` \\]\n", "\\] `literal`\n"]) {
    assert.equal(normalizeMathText(literal), literal);
  }
  assert.ok(validateMathText("$alpha + frac{1}{2}$").failures.length > 0);
});

test("math input and diagnostic limits fail closed using small fixtures", async (t) => {
  for (const [name, files, limits, expected] of [
    ["empty", {}, {}, /No canonical Markdown/],
    ["depth", { "a/b/README.md": "x" }, { maximumDepth: 1 }, /depth limit/],
    ["entries", { "a.md": "x", "b.md": "x" }, { maximumEntries: 1 }, /entry limit/],
    ["files", { "a.md": "x", "b.md": "x" }, { maximumFiles: 1 }, /file count limit/],
    ["file bytes", { "a.md": "12345" }, { maximumFileBytes: 4 }, /4-byte limit/],
    ["total bytes", { "a.md": "12", "b.md": "34" }, { maximumTotalBytes: 3 }, /total byte limit/],
    ["UTF-8", { "invalid.md": Buffer.from([0xff]) }, {}, /not valid UTF-8: .*invalid\.md/],
  ]) {
    await t.test(name, async (context) => {
      const root = await fixture(context, files);
      await assert.rejects(loadMathDocuments(root, limits), expected);
    });
  }
  const root = await fixture(t, { "README.md": "x" });
  await assert.rejects(loadMathDocuments(path.join(root, "missing")), /ENOENT/);
  assert.throws(() => maskMarkdownCode("abc", { maximumFileBytes: 2 }), /file byte limit/);
  assert.throws(() => maskMarkdownCode("one\n\ntwo", { maximumNodes: 2 }), /node limit/);
  assert.throws(() => validateMathText("\\(x\\)", "a.md", { maximumDiagnostics: 1 }), /diagnostic limit/);
  assert.throws(() => validateMathText("$broken", "a.md", { maximumDiagnosticBytes: 8 }), /diagnostic limit/);
  await assert.rejects(loadMathDocuments(root, { maximumFiles: 0 }), /Invalid math boundary/);
});

test("canonical inventory is sorted and prunes ignored links without following them", async (t) => {
  const root = await fixture(t, { "tooling/README.md": "x", "README.md": "x", "docs/z.md": "x", "docs/a.md": "x" });
  await symlink(path.join(root, "missing"), path.join(root, ".workingdir2"), "dir");
  const inventory = await collectMathMarkdown(root);
  assert.deepEqual(inventory.files.map((file) => relativePosix(root, file)), ["README.md", "docs/a.md", "docs/z.md", "tooling/README.md"]);
  await symlink(path.join(root, "README.md"), path.join(root, "linked.md"));
  await assert.rejects(collectMathMarkdown(root), /must not be linked/);
  await rm(path.join(root, "linked.md"));
  await symlink(path.join(root, "docs"), path.join(root, "linked-docs"), "dir");
  await assert.rejects(collectMathMarkdown(root), /must not be linked/);
  await assert.rejects(collectMathMarkdown(path.join(root, "linked-docs")), /must not be linked/);
});

test("normalizer preflights the whole bounded input and output plan before writing", async (t) => {
  const root = await fixture(t, { "a.md": "\\(x\\)\n", "z.md": Buffer.from([0xff]) });
  await assert.rejects(normalizeMathRepository(root, { write: true }), /not valid UTF-8/);
  assert.equal(await readFile(path.join(root, "a.md"), "utf8"), "\\(x\\)\n");
  await rm(path.join(root, "z.md"));
  await assert.rejects(normalizeMathRepository(root, { write: true, limits: { maximumDiagnosticBytes: 1 } }), /output limit/);
  assert.equal(await readFile(path.join(root, "a.md"), "utf8"), "\\(x\\)\n");
});

test("normalizer rejects directory changes after loading before any replacement", async (t) => {
  const root = await fixture(t, { "README.md": "\\(x\\)\n" });
  let replacements = 0;
  await assert.rejects(normalizeMathRepository(root, {
    write: true,
    load: async (...args) => {
      const inventory = await loadMathDocuments(...args);
      await writeFile(path.join(root, "later.md"), "$broken\n");
      return inventory;
    },
    replace: async () => { replacements += 1; },
  }), /Math inventory directory changed/);
  assert.equal(replacements, 0);
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"), "\\(x\\)\n");
});

test("normalizer preserves file mode, BOM, and has an idempotent write", async (t) => {
  const root = await fixture(t, { "README.md": "\ufeff\\(x\\)\r\n\r\n`\\(literal\\) $HOME 🧪`\r\n" });
  const file = path.join(root, "README.md");
  await chmod(file, 0o640);
  const before = (await lstat(file)).mode & 0o777;
  assert.deepEqual(await normalizeMathRepository(root, { write: true }), ["README.md"]);
  assert.equal(await readFile(file, "utf8"), "\ufeff$x$\r\n\r\n`\\(literal\\) $HOME 🧪`\r\n");
  const after = (await lstat(file)).mode & 0o777;
  assert.equal(after, before);
  await t.test("POSIX permission bits survive the write", {
    skip: process.platform === "win32" && "Windows chmod keeps only the owner write bit; 0o640 reads back as 0o666",
  }, () => {
    assert.equal(after, 0o640);
  });
  assert.deepEqual(await normalizeMathRepository(root, { write: true }), []);
});

test("atomic replacement rejects changed bytes, same-byte replacement and linked ancestors", async (t) => {
  for (const change of ["bytes", "inode", "file link", "directory link"]) {
    const root = await fixture(t, { "docs/a.md": "\\(x\\)\n", "other/a.md": "untouched" });
    const { documents } = await loadMathDocuments(root);
    const document = documents.find((value) => value.relative === "docs/a.md");
    if (change === "bytes") await writeFile(document.file, "changed");
    if (change === "inode") {
      await writeFile(path.join(root, "replacement"), document.bytes);
      await rename(path.join(root, "replacement"), document.file);
    }
    if (change === "file link") {
      await rm(document.file);
      await symlink(path.join(root, "other/a.md"), document.file);
    }
    if (change === "directory link") {
      await rename(path.join(root, "docs"), path.join(root, "old-docs"));
      await symlink(path.join(root, "other"), path.join(root, "docs"), "dir");
    }
    await assert.rejects(replaceNormalizedMath(document, "$x$\n"), /changed|linked|link/);
    assert.equal(await readFile(path.join(root, "other/a.md"), "utf8"), "untouched");
    assert.equal((await readdir(path.join(root, "other"))).length, 1);
  }
});

test("stage and rename failures preserve the original and clean only owned stages", async (t) => {
  for (const failure of ["write", "close", "rename", "collision", "stage substitution"]) {
    const root = await fixture(t, { "README.md": "\\(x\\)\n" });
    const { documents: [document] } = await loadMathDocuments(root);
    let staged;
    const operations = {
      async open(file, ...args) {
        staged = file;
        if (failure === "collision") {
          await writeFile(file, "foreign");
          throw Object.assign(new Error("fixture EEXIST"), { code: "EEXIST" });
        }
        const handle = await open(file, ...args);
        return {
          stat: (...values) => handle.stat(...values), chmod: (...values) => handle.chmod(...values),
          writeFile: (...values) => failure === "write" ? Promise.reject(new Error("fixture write")) : handle.writeFile(...values),
          async close() {
            await handle.close();
            if (failure === "close") throw new Error("fixture close");
            if (failure === "stage substitution") {
              await rm(file);
              await symlink(path.join(root, "README.md"), file);
            }
          },
        };
      },
      rename: (...args) => failure === "rename" ? Promise.reject(new Error("fixture rename")) : rename(...args),
    };
    await assert.rejects(replaceNormalizedMath(document, "$x$\n", operations));
    const current = await readMathSnapshot(document.file);
    assert.deepEqual(current.bytes, document.bytes);
    assert.equal(current.identity.ino, document.identity.ino);
    if (failure === "collision") assert.equal(await readFile(staged, "utf8"), "foreign");
    else if (failure === "stage substitution") assert.equal((await lstat(staged)).isSymbolicLink(), true);
    else await assert.rejects(lstat(staged), /ENOENT/);
  }
});

test("a later per-file failure reports earlier replacements without rollback", async (t) => {
  const root = await fixture(t, { "a.md": "\\(a\\)\n", "b.md": "\\(b\\)\n" });
  await assert.rejects(normalizeMathRepository(root, {
    write: true,
    replace: async (document, after) => {
      if (document.relative === "b.md") throw new Error("fixture second replacement");
      await replaceNormalizedMath(document, after);
    },
  }), /after 1 file replacements \(a\.md\)/);
  assert.equal(await readFile(path.join(root, "a.md"), "utf8"), "$a$\n");
  assert.equal(await readFile(path.join(root, "b.md"), "utf8"), "\\(b\\)\n");
});
