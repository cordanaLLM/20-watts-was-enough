import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { bookSourceDigest } from "../book-source.mjs";
import { bookPdfSemanticDebtMessage } from "../audit-book-pdf-semantics.mjs";
import {
  auditBookPdfSemanticCaptures,
  assertBookPdfSemanticArtifactIdentity,
  BOOK_PDF_SEMANTIC_BASELINE_SCHEMA_VERSION,
  BOOK_PDF_SEMANTIC_CLAIM_BOUNDARY,
  captureBookPdfSemanticOutputs,
  parseBookPdfSemanticBaseline,
  summarizeBookPdfSemanticCapture,
  validateBookPdfSemanticBaseline,
  writeBookPdfSemanticEvidence,
} from "./book-pdf-semantic-audit.mjs";
import { readStableOpenedFile } from "./opened-file.mjs";
import { normalizeChromiumPdfMetadata } from "./pdf-metadata.mjs";

const knownDiagnostic = "Syntax Error: StructElem object is wrong type (Strong)";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function semanticCapture(stdout, stderr = "") {
  return {
    signal: null,
    status: 0,
    stderr: Buffer.from(stderr),
    stdout: Buffer.from(stdout),
  };
}

function semanticCaptures(outcome) {
  const diagnostic = outcome === "known-debt" ? `${knownDiagnostic}\n` : "";
  return {
    metadata: semanticCapture([
      "Tagged:          yes",
      "Pages:           1",
      "Page size:       594.96 x 841.92 pts (A4)",
      "PDF version:     1.4",
      "",
    ].join("\n")),
    structure: semanticCapture("Document\n", diagnostic),
    structure_text: semanticCapture(
      "Dashboard tagged tail\nEquation tagged tail\nFigure tagged tail\n",
      diagnostic,
    ),
    default_text: semanticCapture(
      "Dashboard anchor default tail\nEquation anchor default tail\nFigure anchor default tail\f",
    ),
    raw_text: semanticCapture("Dashboard raw debt\nEquation raw debt\nFigure raw debt\f"),
  };
}

function semanticSentinels(outcome) {
  return [
    ["dashboard", "dashboard-status", "Dashboard"],
    ["equation", "table-displayed-equation", "Equation"],
    ["figure", "diagram-figure", "Figure"],
  ].map(([id, className, prefix]) => ({
    id,
    class: className,
    recorded_page: 1,
    default_anchor: `${prefix} anchor`,
    default_fragments: [`${prefix} anchor`, "default tail"],
    struct_text_fragments: [`${prefix} tagged`, "tail"],
    raw_fragments: [`${prefix} raw`, "debt"],
    state: outcome,
    defect: outcome === "known-debt" ? `${prefix} debt remains.` : `${prefix} is clean.`,
  }));
}

function semanticFixture(outcome = "known-debt") {
  const pdfBytes = Buffer.alloc(100_000, 0x20);
  pdfBytes.write("%PDF-1.4\n", 0, "ascii");
  const pdfSha256 = sha256(pdfBytes);
  const sourceDigest = "a".repeat(64);
  const manifest = {
    pdf: "public/downloads/test.pdf",
    pdf_sha256: pdfSha256,
    size_bytes: pdfBytes.length,
    source_ref: "main",
    source_revision: null,
    source_digest: sourceDigest,
    version: "0.0.0",
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const captures = semanticCaptures(outcome);
  const diagnostics = outcome === "known-debt"
    ? [{ message: knownDiagnostic, count: 1 }]
    : [];
  const outputs = Object.fromEntries(Object.entries(captures).map(([name, capture]) => [
    name,
    summarizeBookPdfSemanticCapture(capture),
  ]));
  const baseline = {
    schema_version: BOOK_PDF_SEMANTIC_BASELINE_SCHEMA_VERSION,
    authority: "engineering-regression-sentinel",
    claim_boundary: BOOK_PDF_SEMANTIC_CLAIM_BOUNDARY,
    expected_outcome: outcome,
    artifact: {
      pdf: manifest.pdf,
      manifest: "public/downloads/test-manifest.json",
      pdf_sha256: pdfSha256,
      manifest_sha256: sha256(manifestBytes),
      size_bytes: pdfBytes.length,
      pages: 1,
      page_size_name: "A4",
      page_size_points: { width: 594.96, height: 841.92 },
      pdf_version: "1.4",
      tagged: true,
      source_ref: manifest.source_ref,
      source_digest: sourceDigest,
      version: manifest.version,
    },
    tools: {
      pdfinfo: { command: "pdfinfo", version: "26.08.0" },
      pdftotext: { command: "pdftotext", version: "26.08.0" },
    },
    outputs,
    diagnostics: { structure: diagnostics, structure_text: diagnostics },
    sentinels: semanticSentinels(outcome),
  };
  return {
    baseline,
    captures,
    manifestBytes,
    pdfBytes,
    toolIdentities: { pdfinfo: "26.08.0", pdftotext: "26.08.0" },
  };
}

function fixture(
  timestamp,
  firstNode = "node00000384",
  secondNode = "node00000392",
  options = {},
) {
  const chunks = [];
  const offsets = Array(8).fill(0);
  let length = 0;
  const append = (value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "latin1");
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (number, body) => {
    offsets[number] = length;
    append(`${number} 0 obj\n`);
    append(body);
    append("\nendobj\n");
  };

  append(Buffer.from("%PDF-1.4\n%\x80\x81\x82\x83\n", "latin1"));
  object(1, `<< /CreationDate (${timestamp}) /ModDate (${timestamp}) `
    + `/ID (${firstNode}) /Headers [(${secondNode}) (${firstNode})] >>`);
  object(2, `<< /${options.catalogTypeKey ?? "Type"} /Catalog /Pages 6 0 R `
    + `/${options.structureRootKey ?? "StructTreeRoot"} 3 0 R ${options.catalogEntry ?? ""}>>`);
  object(3, `<< /${options.rootTypeKey ?? "Type"} /StructTreeRoot `
    + `/K [4 0 R 5 0 R] ${options.roleMap ?? ""}${options.rootEntry ?? ""}>>`);
  object(4, `<< /${options.elementTypeKey ?? "Type"} /StructElem `
    + `/${options.structureKey ?? "S"} /${options.firstStructureType ?? "Strong"} `
    + `/P 3 0 R ${options.elementEntry ?? ""}>>`);
  object(5, "<< /Type /StructElem /S /Em /P 3 0 R >>");
  object(6, "<< /Type /Pages /Count 0 /Kids [] >>");
  object(7, Buffer.concat([
    Buffer.from("<< /Length 4 >>\nstream\n", "latin1"),
    Buffer.from([0x00, 0x7f, 0x80, 0xff]),
    Buffer.from("\nendstream", "latin1"),
  ]));

  const xrefOffset = length;
  append("xref\n0 8\n0000000000 65535 f \n");
  for (let number = 1; number < offsets.length; number += 1) {
    append(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
  }
  append("trailer\n");
  append(`<< /${options.sizeKey ?? "Size"} 8 /${options.trailerRootKey ?? "Root"} 2 0 R `
    + `/Info 1 0 R ${options.trailerEntry ?? ""}>>\n`);
  append(`startxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

function withStartXref(bytes, offset) {
  return Buffer.from(
    bytes.toString("latin1").replace(/startxref\s+\d+\s+%%EOF\s*$/u,
      `startxref\n${offset}\n%%EOF\n`),
    "latin1",
  );
}

function withUnrecognizedIncrementalRevision(bytes) {
  const source = bytes.toString("latin1");
  const previousXref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/u.exec(source)[1]);
  const separator = source.endsWith("\n") || source.endsWith("\r") ? "" : "\n";
  const objectOffset = bytes.length + Buffer.byteLength(separator, "latin1");
  const object = "1 0 obj\n<< /Producer (unrecognized revision) >>\nendobj\n";
  const xrefOffset = objectOffset + Buffer.byteLength(object, "latin1");
  const revision = separator + object + "xref\n1 1\n"
    + `${String(objectOffset).padStart(10, "0")} 00000 n \n`
    + "trailer\n"
    + `<< /Size 8 /Root 2 0 R /Info 1 0 R /Prev ${previousXref}>>\n`
    + `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.concat([bytes, Buffer.from(revision, "latin1")]);
}

function withUnindexedObjectBeforeFinalXref(bytes) {
  const source = bytes.toString("latin1");
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(source);
  const xrefOffset = Number(match[1]);
  const insertion = "99999 0 obj\n(null)\nendobj\n";
  const tampered = Buffer.from(
    source.slice(0, xrefOffset) + insertion + source.slice(xrefOffset),
    "latin1",
  );
  return withStartXref(
    tampered,
    xrefOffset + Buffer.byteLength(insertion, "latin1"),
  );
}

function fakePopplerSource(logPath, behavior = "normal") {
  return `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
if (args[0] === "-v") {
  process.stderr.write(name + " version " + ${JSON.stringify(
    behavior === "wrong-version" ? "99.0.0" : "26.08.0",
  )} + "\\n");
  process.exit(0);
}
const bytes = readFileSync("book.pdf");
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({
  name,
  args,
  directory_mode: (statSync(".").mode & 0o777).toString(8),
  file_mode: (statSync("book.pdf").mode & 0o777).toString(8),
  sha256: createHash("sha256").update(bytes).digest("hex"),
}) + "\\n");
if (${JSON.stringify(behavior)} === "timeout" && args[0] === "-struct") {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
}
if (${JSON.stringify(behavior)} === "nonzero" && args[0] === "-struct") process.exit(7);
if (${JSON.stringify(behavior)} === "oversize") process.stdout.write("x".repeat(4096));
else if (name === "pdfinfo" && args[0] === "book.pdf") {
  process.stdout.write("Tagged: yes\\nPages: 1\\nPage size: 594.96 x 841.92 pts (A4)\\nPDF version: 1.4\\n");
} else if (name === "pdfinfo") process.stdout.write("Document\\n");
else process.stdout.write("Dashboard anchor default tail\\nEquation anchor default tail\\nFigure anchor default tail\\f");
`;
}

async function fakePopplerTools(root, behavior = "normal") {
  const bin = path.join(root, `bin-${behavior}`);
  const log = path.join(root, `${behavior}.jsonl`);
  await mkdir(bin);
  for (const name of ["pdfinfo", "pdftotext"]) {
    const command = path.join(bin, name);
    await writeFile(command, fakePopplerSource(log, behavior), "utf8");
    await chmod(command, 0o700);
  }
  return Object.freeze({
    log,
    pdfinfoCommand: path.join(bin, "pdfinfo"),
    pdftotextCommand: path.join(bin, "pdftotext"),
  });
}

test("Chromium PDF wall-clock metadata normalizes to the release date", () => {
  const original = fixture("D:20260828111111+00'00'");
  const originalHash = sha256(original);
  const first = normalizeChromiumPdfMetadata(
    original,
    "2026-08-28",
  );
  const second = normalizeChromiumPdfMetadata(
    fixture("D:20260828222222+00'00'", "node00000376", "node00000384"),
    "2026-08-28",
  );

  assert.deepEqual(first, second);
  assert.deepEqual(normalizeChromiumPdfMetadata(first, "2026-08-28"), first);
  assert.equal(sha256(original), originalHash);
  assert.match(first.toString("latin1"), /CreationDate \(D:20260828000000\+00'00'\)/u);
  assert.match(first.toString("latin1"), /ModDate \(D:20260828000000\+00'00'\)/u);
  assert.match(first.toString("latin1"), /\/ID \(node00000000\)/u);
  assert.match(first.toString("latin1"), /\/Headers \[\(node00000001\) \(node00000000\)\]/u);
  assert.notEqual(first.indexOf(Buffer.from([0x00, 0x7f, 0x80, 0xff])), -1);
  assert.equal([...first.toString("latin1").matchAll(/\/RoleMap\b/gu)].length, 1);
  assert.match(first.toString("latin1"), /\/RoleMap <<\/Strong \/Span \/Em \/Span>>/u);
  const startXref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/u.exec(first.toString("latin1"))[1]);
  assert.equal(first.subarray(startXref, startXref + 4).toString("ascii"), "xref");
  assert.equal([...first.toString("latin1").matchAll(/%%EOF/gu)].length, 2);
});

test("PDF metadata normalization fails closed on invalid dates or renderer drift", () => {
  assert.throws(
    () => normalizeChromiumPdfMetadata(fixture("D:20260828111111+00'00'"), "2026-02-30"),
    /real calendar date/u,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(Buffer.from("%PDF-1.4\n"), "2026-08-28"),
    /exactly one CreationDate and one ModDate/u,
  );
});

test("PDF structure finalization rejects unsafe renderer shapes", () => {
  const timestamp = "D:20260828111111+00'00'";
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      fixture(timestamp, undefined, undefined, { firstStructureType: "Aside" }),
      "2026-08-28",
    ),
    /unsupported Aside/u,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      fixture(timestamp, undefined, undefined, {
        roleMap: "/RoleMap <</Strong /P /Em /Span>> ",
      }),
      "2026-08-28",
    ),
    /competing or non-canonical RoleMap/u,
  );
  for (const trailerEntry of ["/Encrypt 7 0 R ", "/XRefStm 99 "]) {
    assert.throws(
      () => normalizeChromiumPdfMetadata(
        fixture(timestamp, undefined, undefined, { trailerEntry }),
        "2026-08-28",
      ),
      /not supported/u,
    );
  }
  for (const trailerEntry of ["/Encr#7 7 0 R ", "/Encr#zzpt 7 0 R "]) {
    assert.throws(
      () => normalizeChromiumPdfMetadata(
        fixture(timestamp, undefined, undefined, { trailerEntry }),
        "2026-08-28",
      ),
      /malformed name escape/u,
    );
  }

  const tagged = fixture(timestamp);
  const source = tagged.toString("latin1");
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      withStartXref(tagged, source.indexOf("2 0 obj")),
      "2026-08-28",
    ),
    /classic xref tables only/u,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      Buffer.from(source.replace("3 0 obj\n", "3 1 obj\n"), "latin1"),
      "2026-08-28",
    ),
    /does not address its declared object/u,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      Buffer.from(source.replace("xref\n0 8\n", "xref\n0 100001\n"), "latin1"),
      "2026-08-28",
    ),
    /entry bound was exceeded/u,
  );
});

test("PDF structure finalization enforces its canonical revision and byte bounds", () => {
  const timestamp = "D:20260828111111+00'00'";
  const tagged = fixture(timestamp);
  const finalized = normalizeChromiumPdfMetadata(tagged, "2026-08-28");
  assert.deepEqual(
    normalizeChromiumPdfMetadata(tagged, "2026-08-28", {
      maximumBytes: finalized.length,
    }),
    finalized,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(tagged, "2026-08-28", {
      maximumBytes: finalized.length - 1,
    }),
    /Finalized PDF byte length exceeds/u,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      Buffer.from(finalized.toString("latin1").replace("/RoleMap", "/RolxMap"), "latin1"),
      "2026-08-28",
    ),
    /pre-existing incremental PDF/u,
  );

  assert.throws(
    () => normalizeChromiumPdfMetadata(
      fixture(timestamp, undefined, undefined, {
        roleMap: "/RoleMap <</Strong /Span /Em /Span>> ",
      }),
      "2026-08-28",
    ),
    /exactly one finaliser-owned incremental revision/u,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      withUnrecognizedIncrementalRevision(finalized),
      "2026-08-28",
    ),
    /exactly one finaliser-owned incremental revision/u,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      withUnindexedObjectBeforeFinalXref(finalized),
      "2026-08-28",
    ),
    /exact finaliser-owned serialization/u,
  );
});

test("PDF structure finalization is limited to the pinned PDF 1.4 shape", () => {
  const timestamp = "D:20260828111111+00'00'";
  const tagged = fixture(timestamp);
  const source = tagged.toString("latin1");
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      fixture(timestamp, undefined, undefined, { catalogEntry: "/Version /2.0 " }),
      "2026-08-28",
    ),
    /catalog Version overrides/u,
  );
  assert.throws(
    () => normalizeChromiumPdfMetadata(
      Buffer.from(source.replace("xref\n0 8\n", "xref\n0\xa08\n"), "latin1"),
      "2026-08-28",
    ),
    /xref subsection header is malformed/u,
  );
  for (const version of ["1.3", "1.7", "1.9", "2.0"]) {
    assert.throws(
      () => normalizeChromiumPdfMetadata(
        Buffer.from(source.replace("%PDF-1.4", `%PDF-${version}`), "latin1"),
        "2026-08-28",
      ),
      /limited to the pinned PDF 1\.4 artifact/u,
    );
  }
});

test("consumed PDF dictionary keys reject escaped aliases and duplicates", () => {
  const timestamp = "D:20260828111111+00'00'";
  const escapedOnly = [
    { sizeKey: "Si#7Ae" },
    { trailerRootKey: "Ro#6Ft" },
    { trailerEntry: "/Pr#65v 1 " },
    { structureRootKey: "StructTree#52oot" },
    { catalogTypeKey: "Ty#70e" },
    { rootTypeKey: "Ty#70e" },
    { elementTypeKey: "Ty#70e" },
    { firstStructureType: "As#69de", structureKey: "#53" },
    { roleMap: "/Role#4Dap <</Strong /Span /Em /Span>> " },
    { trailerEntry: "/Encr#79pt 7 0 R " },
    { trailerEntry: "/XRef#53tm 99 " },
  ];
  for (const options of escapedOnly) {
    assert.throws(
      () => normalizeChromiumPdfMetadata(
        fixture(timestamp, undefined, undefined, options),
        "2026-08-28",
      ),
      /canonical unescaped names/u,
    );
  }

  const rawAndEscapedDuplicates = [
    { trailerEntry: "/Si#7Ae 8 " },
    { trailerEntry: "/Ro#6Ft 2 0 R " },
    { trailerEntry: "/Prev 1 /Pr#65v 1 " },
    { catalogEntry: "/StructTree#52oot 3 0 R " },
    { catalogEntry: "/Ty#70e /Catalog " },
    { rootEntry: "/Ty#70e /StructTreeRoot " },
    { elementEntry: "/Ty#70e /StructElem " },
    {
      roleMap: "/RoleMap <</Strong /Span /Em /Span>> ",
      rootEntry: "/Role#4Dap <</Strong /Span /Em /Span>> ",
    },
  ];
  for (const options of rawAndEscapedDuplicates) {
    assert.throws(
      () => normalizeChromiumPdfMetadata(
        fixture(timestamp, undefined, undefined, options),
        "2026-08-28",
      ),
      /canonical unescaped names/u,
    );
  }

  for (const trailerEntry of ["/Size 8 ", "/Root 2 0 R ", "/Prev 1 /Prev 1 "]) {
    assert.throws(
      () => normalizeChromiumPdfMetadata(
        fixture(timestamp, undefined, undefined, { trailerEntry }),
        "2026-08-28",
      ),
      /entry must be unique/u,
    );
  }
});

test("the tracked semantic baseline is closed and records failing debt", async () => {
  const baseline = parseBookPdfSemanticBaseline(await readFile(
    new URL("../book-pdf-semantic-baseline.json", import.meta.url),
  ));
  assert.equal(baseline.expected_outcome, "known-debt");
  assert.equal(baseline.sentinels.length, 6);
  assert.equal(baseline.sentinels.filter(({ state }) => state === "known-debt").length, 4);
  const readinessSentinel = baseline.sentinels.find(
    ({ id }) => id === "readiness-dashboard-late-values",
  );
  assert.equal(readinessSentinel?.state, "clean", "the readiness paint order remains a positive sentinel");
  assert.equal(readinessSentinel.recorded_page, 4);
  assert.deepEqual(readinessSentinel.raw_fragments, [
    "Experimentimplementationlane",
    "49",
    "COMPLETE WRITTEN",
    "11",
    "VALIDATED SMOKE HARNESS",
    "0",
    "WORKSTATION-READY",
    "Evidencestatusbyhighesttesttier",
    "project's experiment.",
  ]);
  const headingSentinel = baseline.sentinels.find(
    ({ id }) => id === "field-coverage-heading-merged",
  );
  assert.equal(headingSentinel?.state, "clean", "the repaired heading remains a positive sentinel");
  assert.equal(headingSentinel.recorded_page, 388);
  assert.deepEqual(headingSentinel.raw_fragments, [
    "APPENDIX A1",
    "Global field coverage",
    "Census date: 2026-08-27",
    "FIGURE 80",
  ]);
  assert.equal(headingSentinel.struct_text_fragments[0], "Global field coverage");
  const addedSentinel = baseline.sentinels.find(
    ({ id }) => id === "admissible-action-equation-late",
  );
  assert.deepEqual(
    addedSentinel && {
      id: addedSentinel.id,
      class: addedSentinel.class,
      recorded_page: addedSentinel.recorded_page,
      state: addedSentinel.state,
    },
    {
      id: "admissible-action-equation-late",
      class: "table-displayed-equation",
      recorded_page: 130,
      state: "known-debt",
    },
  );
  assert.equal(
    baseline.sentinels.some(({ id }) => id === "biomimetic-figure-caption-late"),
    false,
  );
  assert.deepEqual(baseline.diagnostics.structure, []);
  assert.deepEqual(baseline.diagnostics.structure_text, []);
  const [pdfBytes, manifestBytes, source] = await Promise.all([
    readStableOpenedFile(path.join(repositoryRoot, baseline.artifact.pdf), {
      containedBy: repositoryRoot,
      maximumBytes: 256 * 1024 * 1024,
    }),
    readStableOpenedFile(path.join(repositoryRoot, baseline.artifact.manifest), {
      containedBy: repositoryRoot,
      maximumBytes: 1024 * 1024,
    }),
    bookSourceDigest(repositoryRoot),
  ]);
  assert.doesNotThrow(() => assertBookPdfSemanticArtifactIdentity({
    baseline,
    manifestBytes,
    pdfBytes,
  }));
  assert.equal(source.digest, baseline.artifact.source_digest);
});

test("recognized diagnostics with exit zero remain known debt, never a pass", () => {
  const fixture = semanticFixture();
  const report = auditBookPdfSemanticCaptures(fixture);
  assert.equal(report.expected_outcome, "known-debt");
  assert.equal(report.passed, false);
  assert.equal(report.claim_boundary, BOOK_PDF_SEMANTIC_CLAIM_BOUNDARY);
  assert.equal(report.sentinels.every(({ state }) => state === "known-debt"), true);
  assert.deepEqual(report.commands.structure.slice(0, 2), ["pdfinfo", "-struct"]);
  assert.deepEqual(report.commands.metadata, ["pdfinfo", "public/downloads/test.pdf"]);
  assert.deepEqual(report.artifact.page_size_points, { width: 594.96, height: 841.92 });
  assert.equal(report.artifact.tagged, true);
  assert.equal(report.diagnostics.structure[0].count, 1);
  assert.equal(
    bookPdfSemanticDebtMessage(report),
    "recognized semantic debt remains: 3 of 3 nonlinear sentinels; "
      + "2 structure diagnostic occurrences across pdfinfo -struct and -struct-text",
  );
});

test("semantic failure wording counts debt separately from the retained sentinel inventory", () => {
  const fixture = semanticFixture("clean");
  fixture.baseline.expected_outcome = "known-debt";
  const debt = semanticSentinels("known-debt");
  fixture.baseline.sentinels = [
    ...debt,
    ...debt.map((sentinel) => ({ ...sentinel, id: `${sentinel.id}-second` })),
  ];
  fixture.baseline.sentinels[5].state = "clean";
  fixture.baseline.sentinels[5].defect = "The retained figure sentinel is clean.";
  const report = auditBookPdfSemanticCaptures(fixture);
  assert.equal(report.passed, false);
  assert.equal(report.sentinels.length, 6);
  assert.equal(
    bookPdfSemanticDebtMessage(report),
    "recognized semantic debt remains: 5 of 6 nonlinear sentinels; "
      + "0 structure diagnostic occurrences across pdfinfo -struct and -struct-text",
  );
});

test("semantic diagnostic wording never calls clean sentinels a clean audit", () => {
  const fixture = semanticFixture();
  fixture.baseline.sentinels = semanticSentinels("clean");
  fixture.baseline.diagnostics.structure = [{ message: knownDiagnostic, count: 2 }];
  fixture.captures.structure.stderr = Buffer.from(`${knownDiagnostic}\n`.repeat(2));
  fixture.baseline.outputs.structure = summarizeBookPdfSemanticCapture(fixture.captures.structure);
  const report = auditBookPdfSemanticCaptures(fixture);
  assert.equal(report.passed, false);
  assert.equal(report.sentinels.every(({ state }) => state === "clean"), true);
  assert.equal(
    bookPdfSemanticDebtMessage(report),
    "recognized semantic debt remains: 0 of 3 nonlinear sentinels; "
      + "3 structure diagnostic occurrences across pdfinfo -struct and -struct-text",
  );
});

test("unknown, added, or silently removed structure diagnostics fail closed", () => {
  const added = semanticFixture();
  added.captures.structure.stderr = Buffer.from(
    `${knownDiagnostic}\nSyntax Error: a new semantic failure\n`,
  );
  assert.throws(
    () => auditBookPdfSemanticCaptures(added),
    /emitted unknown diagnostic/u,
  );

  const removed = semanticFixture();
  removed.captures.structure.stderr = Buffer.alloc(0);
  assert.throws(
    () => auditBookPdfSemanticCaptures(removed),
    /lost known diagnostic/u,
  );
});

test("content anchors must be unique and nonlinear fragment order is exact", () => {
  const duplicate = semanticFixture();
  duplicate.captures.default_text.stdout = Buffer.from(
    "Dashboard anchor Dashboard anchor default tail\nEquation anchor default tail\nFigure anchor default tail\f",
  );
  assert.throws(
    () => auditBookPdfSemanticCaptures(duplicate),
    /anchor must locate exactly one page/u,
  );

  const reordered = semanticFixture();
  reordered.captures.raw_text.stdout = Buffer.from(
    "Dashboard debt raw\nEquation raw debt\nFigure raw debt\f",
  );
  assert.throws(
    () => auditBookPdfSemanticCaptures(reordered),
    /lost or reordered fragment/u,
  );
});

test("sentinel classes and recorded pages remain exact", () => {
  const missingClass = semanticFixture();
  missingClass.baseline.sentinels[2].class = "dashboard-status";
  assert.throws(
    () => validateBookPdfSemanticBaseline(missingClass.baseline),
    /missing sentinel classes: diagram-figure/u,
  );

  const moved = semanticFixture();
  moved.baseline.artifact.pages = 2;
  moved.baseline.sentinels[0].recorded_page = 2;
  moved.captures.metadata.stdout = Buffer.from(
    moved.captures.metadata.stdout.toString("utf8").replace("Pages:           1", "Pages:           2"),
  );
  moved.baseline.outputs.metadata = summarizeBookPdfSemanticCapture(moved.captures.metadata);
  for (const name of ["default_text", "raw_text"]) {
    moved.captures[name].stdout = Buffer.concat([
      moved.captures[name].stdout,
      Buffer.from("\f"),
    ]);
    moved.baseline.outputs[name] = summarizeBookPdfSemanticCapture(moved.captures[name]);
  }
  assert.throws(
    () => auditBookPdfSemanticCaptures(moved),
    /moved from recorded page 2 to 1/u,
  );
});

test("exact output drift fails after semantic predicates remain satisfied", () => {
  const fixture = semanticFixture();
  fixture.captures.structure.stdout = Buffer.from("Document changed\n");
  assert.throws(
    () => auditBookPdfSemanticCaptures(fixture),
    /structure stdout identity changed/u,
  );
});

test("a future clean baseline can pass without making a conformance claim", () => {
  const fixture = semanticFixture("clean");
  const report = auditBookPdfSemanticCaptures(fixture);
  assert.equal(report.passed, true);
  assert.match(report.claim_boundary, /does not establish PDF\/UA or WCAG conformance/u);

  const openSchema = structuredClone(fixture.baseline);
  openSchema.pdf_ua = true;
  assert.throws(
    () => validateBookPdfSemanticBaseline(openSchema),
    /fields are not closed/u,
  );

  const nonzero = structuredClone(fixture.baseline);
  nonzero.outputs.structure.exit_status = 1;
  assert.throws(
    () => validateBookPdfSemanticBaseline(nonzero),
    /exit_status must be zero/u,
  );
});

test("semantic artifact paths cannot escape the repository root", () => {
  const fixture = semanticFixture();
  fixture.baseline.artifact.pdf = "../outside.pdf";
  assert.throws(
    () => validateBookPdfSemanticBaseline(fixture.baseline),
    /canonical repository-relative path/u,
  );

  fixture.baseline.artifact.pdf = "public/downloads/test.pdf";
  fixture.baseline.artifact.manifest = "public/../outside.json";
  assert.throws(
    () => validateBookPdfSemanticBaseline(fixture.baseline),
    /canonical repository-relative path/u,
  );
});

test("Poppler receives one private exact-byte snapshot by stable basename", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-semantic-capture-test-"));
  const temporaryRoot = path.join(root, "snapshots");
  await mkdir(temporaryRoot);
  try {
    const tools = await fakePopplerTools(root);
    const pdfBytes = Buffer.from("%PDF-1.4\nprivate snapshot\n");
    const observed = captureBookPdfSemanticOutputs({
      expectedToolVersions: { pdfinfo: "26.08.0", pdftotext: "26.08.0" },
      pdfBytes,
      pdfinfoCommand: tools.pdfinfoCommand,
      pdftotextCommand: tools.pdftotextCommand,
      temporaryRoot,
    });
    assert.equal(observed.captures.metadata.status, 0);
    const invocations = (await readFile(tools.log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(invocations.length, 5);
    for (const invocation of invocations) {
      assert.equal(invocation.args.includes("book.pdf"), true);
      assert.equal(invocation.args.some((argument) => argument.includes("/")), false);
      assert.equal(invocation.directory_mode, "700");
      assert.equal(invocation.file_mode, "600");
      assert.equal(invocation.sha256, sha256(pdfBytes));
    }
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("semantic command failures stay bounded and always remove the PDF snapshot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-semantic-bounds-test-"));
  const pdfBytes = Buffer.from("%PDF-1.4\nbounded snapshot\n");
  try {
    for (const [behavior, expectation] of [
      ["wrong-version", /version changed/u],
      ["timeout", /failed before exit/u],
      ["oversize", /failed before exit/u],
    ]) {
      const temporaryRoot = path.join(root, `snapshots-${behavior}`);
      await mkdir(temporaryRoot);
      const tools = await fakePopplerTools(root, behavior);
      assert.throws(
        () => captureBookPdfSemanticOutputs({
          captureLimits: { maximum_bytes: 512, timeout_ms: 500 },
          expectedToolVersions: { pdfinfo: "26.08.0", pdftotext: "26.08.0" },
          pdfBytes,
          pdfinfoCommand: tools.pdfinfoCommand,
          pdftotextCommand: tools.pdftotextCommand,
          temporaryRoot,
        }),
        expectation,
      );
      assert.deepEqual(await readdir(temporaryRoot), []);
    }

    const temporaryRoot = path.join(root, "snapshots-nonzero");
    await mkdir(temporaryRoot);
    const tools = await fakePopplerTools(root, "nonzero");
    const observed = captureBookPdfSemanticOutputs({
      captureLimits: { maximum_bytes: 512, timeout_ms: 500 },
      expectedToolVersions: { pdfinfo: "26.08.0", pdftotext: "26.08.0" },
      pdfBytes,
      pdfinfoCommand: tools.pdfinfoCommand,
      pdftotextCommand: tools.pdftotextCommand,
      temporaryRoot,
    });
    assert.equal(observed.captures.structure.status, 7);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("semantic evidence keeps every command stream separate", async () => {
  const fixture = semanticFixture();
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-pdf-semantic-evidence-"));
  const directory = path.join(root, "audit");
  try {
    const report = auditBookPdfSemanticCaptures(fixture);
    await writeBookPdfSemanticEvidence({
      captures: fixture.captures,
      directory,
      evidenceRoot: root,
      report,
    });
    assert.equal(
      await readFile(path.join(directory, "pdfinfo.stdout.txt"), "utf8"),
      fixture.captures.metadata.stdout.toString("utf8"),
    );
    assert.equal(
      await readFile(path.join(directory, "pdfinfo-struct.stderr.txt"), "utf8"),
      `${knownDiagnostic}\n`,
    );
    assert.equal(
      await readFile(path.join(directory, "pdfinfo-struct-text.stdout.txt"), "utf8"),
      fixture.captures.structure_text.stdout.toString("utf8"),
    );
    assert.equal(
      await readFile(path.join(directory, "pdftotext-default.stderr.txt"), "utf8"),
      "",
    );
    assert.equal(
      JSON.parse(await readFile(path.join(directory, "semantic-audit-report.json"), "utf8")).passed,
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("semantic evidence publishes failure envelopes atomically and cleans partial staging", async () => {
  const fixture = semanticFixture();
  fixture.captures.structure.stderr = Buffer.from(
    `${knownDiagnostic}\nSyntax Error: a new semantic failure\n`,
  );
  let auditError;
  try {
    auditBookPdfSemanticCaptures(fixture);
  } catch (error) {
    auditError = error;
  }
  assert.match(auditError?.message ?? "", /emitted unknown diagnostic/u);
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-pdf-semantic-atomic-"));
  try {
    const failureDirectory = path.join(root, "failure");
    await writeBookPdfSemanticEvidence({
      captures: fixture.captures,
      directory: failureDirectory,
      evidenceRoot: root,
      failure: { passed: false, status: "invalid", error: { message: auditError.message } },
    });
    assert.equal(
      JSON.parse(await readFile(path.join(failureDirectory, "semantic-audit-error.json"), "utf8")).status,
      "invalid",
    );
    assert.match(
      JSON.parse(
        await readFile(path.join(failureDirectory, "semantic-audit-error.json"), "utf8"),
      ).error.message,
      /emitted unknown diagnostic/u,
    );

    const circular = {};
    circular.self = circular;
    const partialDirectory = path.join(root, "partial");
    await assert.rejects(
      writeBookPdfSemanticEvidence({
        captures: fixture.captures,
        directory: partialDirectory,
        evidenceRoot: root,
        report: circular,
      }),
      /circular/u,
    );
    assert.equal((await readdir(root)).some((name) => name.startsWith(".semantic-stage-")), false);
    await assert.rejects(readFile(partialDirectory), /ENOENT/u);
    await assert.rejects(
      writeBookPdfSemanticEvidence({
        captures: fixture.captures,
        directory: path.join(root, "nested", "escape"),
        evidenceRoot: root,
        report: { passed: false },
      }),
      /direct child/u,
    );

    const outside = await mkdtemp(path.join(os.tmpdir(), "20w-pdf-semantic-outside-"));
    const linkedRoot = path.join(root, "linked-root");
    try {
      await symlink(outside, linkedRoot, "dir");
      await assert.rejects(
        writeBookPdfSemanticEvidence({
          captures: fixture.captures,
          directory: path.join(linkedRoot, "escaped"),
          evidenceRoot: linkedRoot,
          report: { passed: false },
        }),
        /linked or non-canonical ancestor/u,
      );
      assert.deepEqual(await readdir(outside), []);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
