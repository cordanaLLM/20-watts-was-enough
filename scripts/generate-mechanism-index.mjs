import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseClaimLedger, parsePrincipleRegistry, parseCandidateIndex, parseFixtureIndex } from "./lib/research-ledger.mjs";

const args = process.argv.slice(2);
let check = false;
let rootDir = process.cwd();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check') check = true;
  else if (args[i] === '--root') { rootDir = args[i + 1]; i++; }
}

const sources = [
  "research/claims.md",
  "research/principle-registry.md",
  "experiments/candidates/README.md",
  "experiments/fixtures/README.md"
];

async function readInputs() {
  const maxBytes = 8 * 1024 * 1024;
  const texts = [];
  for (const src of sources) {
    const p = path.join(rootDir, src);
    const s = await stat(p);
    if (s.size > maxBytes) { console.error(`File ${src} exceeds 8 MiB`); process.exit(1); }
    texts.push(await readFile(p, 'utf8'));
  }
  return texts;
}

const seenIds = new Set();
function ensureUnique(id) {
  if (seenIds.has(id)) { console.error(`Duplicate ID: ${id}`); process.exit(1); }
  seenIds.add(id);
}

function normalizeClaims(rawClaims) {
  const validStatuses = new Set(['established', 'plausible', 'speculative', 'disputed', 'unknown']);
  return rawClaims.map(c => {
    ensureUnique(c.id);
    if (!validStatuses.has(c.status)) { console.error(`Invalid claim status: ${c.status} for ${c.id}`); process.exit(1); }
    return { id: c.id, status: c.status, statement: c.statement, path: "research/claims.md", anchor: c.id.toLowerCase() };
  });
}

function normalizePrinciples(rawPrinciples) {
  return rawPrinciples.map(p => {
    ensureUnique(p.id);
    return { id: p.id, title: p.title, path: "research/principle-registry.md", anchor: p.anchor, claims: p.claims };
  });
}

function normalizeIndex(rawIndex) {
  return rawIndex.map(x => {
    ensureUnique(x.id);
    const res = { id: x.id, title: x.title };
    if (x.question) res.question = x.question;
    res.path = x.path;
    return res;
  });
}

function numericSort(a, b) {
  const numA = parseInt(a.id.replace(/\D/g, ''), 10);
  const numB = parseInt(b.id.replace(/\D/g, ''), 10);
  return numA - numB;
}

async function writeOrCheckOutput(doc, countMsg) {
  const outputStr = JSON.stringify(doc, null, 2) + '\n';
  const outputPath = path.join(rootDir, "research/mechanism-index.json");
  if (check) {
    try {
      const current = await readFile(outputPath, 'utf8');
      if (current !== outputStr) { console.error("generated file is stale: research/mechanism-index.json"); process.exit(1); }
      console.log(countMsg);
    } catch (e) {
      if (e.code === 'ENOENT') { console.error("missing generated file research/mechanism-index.json"); process.exit(1); }
      throw e;
    }
  } else {
    await writeFile(outputPath, outputStr, 'utf8');
  }
}

async function run() {
  const texts = await readInputs();
  const claims = normalizeClaims(parseClaimLedger(texts[0]));
  const principles = normalizePrinciples(parsePrincipleRegistry(texts[1]));
  const candidates = normalizeIndex(parseCandidateIndex(texts[2]));
  const fixtures = normalizeIndex(parseFixtureIndex(texts[3]));

  if (claims.length === 0 || principles.length === 0) { console.error(`Zero claims or zero principles`); process.exit(1); }
  if (claims.length > 10000 || principles.length > 10000 || candidates.length > 10000 || fixtures.length > 10000) {
    console.error(`More than 10000 entries of any kind`); process.exit(1);
  }

  claims.sort(numericSort);
  principles.sort(numericSort);
  candidates.sort(numericSort);
  fixtures.sort(numericSort);

  const doc = {
    schema: 1,
    repository: "https://github.com/cordanaLLM/20-watts-was-enough",
    authority: "Derived navigation index. NO_RESULT: it carries no claim, status or result of its own; each entry's source file is authoritative.",
    decision: "decisions/0089-publish-a-derived-mechanism-index.md",
    sources,
    counts: { claims: claims.length, principles: principles.length, candidates: candidates.length, fixtures: fixtures.length },
    claims, principles, candidates, fixtures
  };

  await writeOrCheckOutput(doc, `Verified ${claims.length} claims, ${principles.length} principles, ${candidates.length} candidates, ${fixtures.length} fixtures.`);
}

run().catch(e => { console.error(e); process.exit(1); });
