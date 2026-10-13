import path from "node:path";
import { fileURLToPath } from "node:url";

import { bookSourceDigest } from "./book-source.mjs";
import {
  auditBookPdfSemanticCaptures,
  assertBookPdfSemanticArtifactIdentity,
  BOOK_PDF_SEMANTIC_CLAIM_BOUNDARY,
  captureBookPdfSemanticOutputs,
  parseBookPdfSemanticBaseline,
  summarizeBookPdfSemanticCapture,
  writeBookPdfSemanticEvidence,
} from "./lib/book-pdf-semantic-audit.mjs";
import { readStableOpenedFile } from "./lib/opened-file.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const baselinePath = path.join(repositoryRoot, "scripts", "book-pdf-semantic-baseline.json");
const evidenceRoot = path.join(repositoryRoot, ".workingdir", "evidence", "design");
const maximumBaselineBytes = 1024 * 1024;
const maximumManifestBytes = 1024 * 1024;
const maximumPdfBytes = 256 * 1024 * 1024;

function readRepositoryFile(file, label, maximumBytes) {
  return readStableOpenedFile(file, {
    containedBy: repositoryRoot,
    label,
    maximumBytes,
  });
}

function semanticFailureEnvelope(error, observed) {
  return Object.freeze({
    claim_boundary: BOOK_PDF_SEMANTIC_CLAIM_BOUNDARY,
    error: Object.freeze({ message: error.message }),
    outputs: Object.freeze(Object.fromEntries(
      Object.entries(observed.captures).map(([name, capture]) => [
        name,
        summarizeBookPdfSemanticCapture(capture),
      ]),
    )),
    passed: false,
    schema_version: 1,
    status: "invalid",
    tools: observed.toolIdentities,
  });
}

export function bookPdfSemanticDebtMessage(report) {
  const knownDebt = report.sentinels.filter(({ state }) => state === "known-debt").length;
  const diagnosticOccurrences = [
    ...report.diagnostics.structure,
    ...report.diagnostics.structure_text,
  ].reduce((total, entry) => total + entry.count, 0);
  return `recognized semantic debt remains: ${knownDebt} of ${report.sentinels.length} nonlinear sentinels; `
    + `${diagnosticOccurrences} structure diagnostic occurrences across pdfinfo -struct and -struct-text`;
}

function parseArguments(arguments_) {
  let evidenceDirectory;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument !== "--evidence-dir") throw new Error(`Unknown argument: ${argument}`);
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) throw new Error("--evidence-dir requires a path");
    if (evidenceDirectory) throw new Error("--evidence-dir may be provided only once");
    evidenceDirectory = path.resolve(value);
    if (path.dirname(evidenceDirectory) !== evidenceRoot) {
      throw new Error(
        `--evidence-dir must name a new direct child of ${path.relative(repositoryRoot, evidenceRoot)}`,
      );
    }
    index += 1;
  }
  return Object.freeze({ evidenceDirectory });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const baselineBytes = await readRepositoryFile(
    baselinePath,
    "book PDF semantic baseline",
    maximumBaselineBytes,
  );
  const baseline = parseBookPdfSemanticBaseline(baselineBytes);
  const pdfPath = path.join(repositoryRoot, baseline.artifact.pdf);
  const manifestPath = path.join(repositoryRoot, baseline.artifact.manifest);
  const [pdfBytes, manifestBytes] = await Promise.all([
    readRepositoryFile(pdfPath, "book PDF semantic artifact", maximumPdfBytes),
    readRepositoryFile(manifestPath, "book PDF semantic manifest", maximumManifestBytes),
  ]);
  assertBookPdfSemanticArtifactIdentity({ baseline, manifestBytes, pdfBytes });
  const source = await bookSourceDigest(repositoryRoot);
  if (source.digest !== baseline.artifact.source_digest) {
    throw new Error(
      `book source digest changed: expected ${baseline.artifact.source_digest}, received ${source.digest}`,
    );
  }
  const observed = captureBookPdfSemanticOutputs({
    expectedToolVersions: {
      pdfinfo: baseline.tools.pdfinfo.version,
      pdftotext: baseline.tools.pdftotext.version,
    },
    pdfBytes,
  });
  let auditError;
  let report;
  try {
    const [finalBaselineBytes, finalPdfBytes, finalManifestBytes] = await Promise.all([
      readRepositoryFile(baselinePath, "book PDF semantic baseline", maximumBaselineBytes),
      readRepositoryFile(pdfPath, "book PDF semantic artifact", maximumPdfBytes),
      readRepositoryFile(manifestPath, "book PDF semantic manifest", maximumManifestBytes),
    ]);
    const finalSource = await bookSourceDigest(repositoryRoot);
    if (
      !finalBaselineBytes.equals(baselineBytes)
      || !finalPdfBytes.equals(pdfBytes)
      || !finalManifestBytes.equals(manifestBytes)
      || finalSource.digest !== source.digest
    ) {
      throw new Error("semantic baseline, PDF, manifest, or book source changed during capture");
    }
    report = auditBookPdfSemanticCaptures({
      baseline,
      captures: observed.captures,
      manifestBytes,
      pdfBytes,
      toolIdentities: observed.toolIdentities,
    });
  } catch (error) {
    auditError = error;
  }
  if (options.evidenceDirectory) {
    await writeBookPdfSemanticEvidence({
      captures: observed.captures,
      directory: options.evidenceDirectory,
      evidenceRoot,
      failure: auditError ? semanticFailureEnvelope(auditError, observed) : undefined,
      report,
    });
  }
  if (auditError) throw auditError;
  console.log(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) {
    throw new Error(bookPdfSemanticDebtMessage(report));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`Book PDF semantic audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
