import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateExecutionManifest } from "./lib/workstation-manifests.mjs";
import { parseClaimLedger } from "./lib/research-ledger.mjs";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");

const facetRules = [
  {
    id: "question",
    label: "question or hypothesis",
    pattern: /question|hypothes(is|es)|why|candidate (statement|boundary)|applicability gate|biological observation|scope and scientific boundary/i,
  },
  {
    id: "system",
    label: "system, scenario, or task family",
    pattern: /tasks?|scenarios?|controlled system|experiments?|tracks?|benchmark|stage-1 system model/i,
  },
  {
    id: "comparators",
    label: "arms, baselines, or strongest nulls",
    pattern: /baselines?|nulls?|arms|compared systems|strongest null(s| stack)?|required null stack/i,
  },
  {
    id: "budget",
    label: "matched budget and cost boundary",
    pattern: /equal[- ]budgets?|matched[- ]budgets?|equal information|equalization/i,
  },
  {
    id: "measurements",
    label: "measurements and units",
    pattern: /measurements?|metrics?|outcomes?|comparison vector/i,
  },
  {
    id: "ablations",
    label: "ablations",
    pattern: /ablations?|interventions?/i,
  },
  {
    id: "analysis",
    label: "analysis or statistical plan",
    pattern: /analysis|statistical plan/i,
  },
  {
    id: "failure",
    label: "rejection, kill, or retirement rule",
    pattern: /promotion|rejection|retirement|kill|pass condition/i,
  },
];

function headingsFrom(body) {
  return [...body.matchAll(/^(#{2,3})\s+(.+)$/gm)].map((match) => ({
    depth: match[1].length,
    title: match[2].trim(),
  }));
}

function missingProtocolFacets(body) {
  const headings = headingsFrom(body);
  return facetRules
    .filter((rule) => {
      if (rule.id === "analysis") {
        return !headings.some(
          (heading) =>
            (heading.depth === 2 && rule.pattern.test(heading.title)) ||
            (heading.depth === 3 && /statistical comparison/i.test(heading.title)),
        );
      }
      return !headings.some((heading) => rule.pattern.test(heading.title));
    })
    .map(({ id }) => id);
}

function toPosix(value) {
  return value.replaceAll("\\", "/");
}

async function markdownFiles(directory) {
  const entries = await readdir(directory);
  return entries
    .filter((entry) => entry.endsWith(".md") && entry !== "README.md")
    .map((entry) => path.join(directory, entry))
    .sort();
}

function artifactId(relativePath) {
  const name = path.basename(relativePath, ".md");
  const number = name.match(/^(\d{3})-/)?.[1] ?? "unknown";
  return relativePath.startsWith("experiments/candidates/")
    ? `candidate-${number}`
    : `fixture-${number}`;
}

async function isExecutionReady(id) {
  const manifestPath = path.join(root, "experiments", "workstation", "manifests", `${id}.json`);
  try {
    const validation = await validateExecutionManifest(root, manifestPath, id);
    return {
      ready: validation.ready,
      readiness: validation.readiness,
      manifest: validation.readiness === "absent"
        ? null
        : toPosix(path.relative(root, manifestPath)),
      missing: validation.errors.length
        ? validation.errors
        : validation.ready
          ? []
          : [`readiness=${validation.readiness}`],
      promotionChecks: validation.promotionChecks ?? [],
      executionClaims: validation.executionClaims ?? [],
    };
  } catch {
    return {
      ready: false,
      readiness: "absent",
      manifest: null,
      missing: ["manifest"],
      promotionChecks: [],
      executionClaims: [],
    };
  }
}

const artifactPaths = [
  ...(await markdownFiles(path.join(root, "experiments", "candidates"))),
  ...(await markdownFiles(path.join(root, "experiments", "fixtures"))),
];

const artifacts = [];
for (const absolutePath of artifactPaths) {
  const relativePath = toPosix(path.relative(root, absolutePath));
  const body = await readFile(absolutePath, "utf8");
  const missingFacets = missingProtocolFacets(body);
  const execution = await isExecutionReady(artifactId(relativePath));
  artifacts.push({
    id: artifactId(relativePath),
    path: relativePath,
    title: body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.basename(relativePath),
    protocolComplete: missingFacets.length === 0,
    missingFacets,
    executionReady: execution.ready,
    executionReadiness: execution.readiness,
    executionManifest: execution.manifest,
    executionMissing: execution.missing,
    executionPromotionChecks: execution.promotionChecks,
    executionClaims: execution.executionClaims,
    claimSideClaims: new Set(),
    documentSideClaims: new Set(),
  });
}

const artifactByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));

function normalizeClaim(number) {
  return `C-${String(Number(number)).padStart(3, "0")}`;
}

const exactClaimLink = /\[C-(\d{1,4})\]\(\.\.\/\.\.\/research\/claims\.md#c-(\d{1,4})\)/g;
const exactClaimRange = /\[C-(\d{1,4})\]\(\.\.\/\.\.\/research\/claims\.md#c-(\d{1,4})\)\s*[–-]\s*\[C-(\d{1,4})\]\(\.\.\/\.\.\/research\/claims\.md#c-(\d{1,4})\)/g;

for (const artifact of artifacts) {
  const body = await readFile(path.join(root, artifact.path), "utf8");
  for (const match of body.matchAll(exactClaimLink)) {
    if (Number(match[1]) === Number(match[2])) {
      artifact.documentSideClaims.add(normalizeClaim(match[1]));
    }
  }
  for (const match of body.matchAll(exactClaimRange)) {
    const start = Number(match[1]);
    const startAnchor = Number(match[2]);
    const end = Number(match[3]);
    const endAnchor = Number(match[4]);
    if (start !== startAnchor || end !== endAnchor || end < start) continue;
    for (let number = start; number <= end; number += 1) {
      artifact.documentSideClaims.add(normalizeClaim(number));
    }
  }
}

const claimsBody = await readFile(path.join(root, "research", "claims.md"), "utf8");
const claimRecords = parseClaimLedger(claimsBody).map((match) => {
  const { id, status, body } = match;
  const links = [...body.matchAll(/\.\.\/(experiments\/(?:candidates|fixtures)\/[^)\s]+\.md)/g)]
    .map((link) => link[1])
    .filter((link, index, all) => all.indexOf(link) === index);
  const claimSideArtifacts = links.map((link) => artifactByPath.get(link)).filter(Boolean);
  for (const artifact of claimSideArtifacts) artifact.claimSideClaims.add(id);
  return { id, status, claimSideArtifacts };
});

const claims = claimRecords.map(({ id, status, claimSideArtifacts }) => {
  const linkedArtifacts = artifacts.filter(
    (artifact) =>
      artifact.documentSideClaims.has(id) || claimSideArtifacts.includes(artifact),
  );
  const executionReady = linkedArtifacts.some(
    (artifact) => artifact.executionReady && artifact.executionClaims.includes(id),
  );
  const protocolCovered = linkedArtifacts.some((artifact) => artifact.protocolComplete);
  const tier = executionReady
    ? "workstation-executable"
    : protocolCovered
      ? "protocol-complete"
      : linkedArtifacts.length
        ? "linked-description"
        : "ledger-only";
  return {
    id,
    status,
    tier,
    testRouted: linkedArtifacts.length > 0,
    protocolCovered,
    executionReady,
    artifacts: linkedArtifacts.map((artifact) => artifact.id),
  };
});

const knownClaimIds = new Set(claims.map((claim) => claim.id));
const executionScopeErrors = [];
for (const artifact of artifacts) {
  const linkedClaims = new Set([
    ...artifact.claimSideClaims,
    ...artifact.documentSideClaims,
  ]);
  for (const claimId of artifact.executionClaims) {
    if (!knownClaimIds.has(claimId)) {
      executionScopeErrors.push(`${artifact.id} execution scope names unknown claim ${claimId}`);
    } else if (!linkedClaims.has(claimId)) {
      executionScopeErrors.push(`${artifact.id} execution scope names unlinked claim ${claimId}`);
    }
  }
}
if (executionScopeErrors.length) {
  throw new Error(`Execution-claim scope validation failed:\n- ${executionScopeErrors.join("\n- ")}`);
}

const dispositionMeanings = {
  "evidence-input": "scientific or engineering evidence that constrains a translation but is not itself a standalone AI-system hypothesis",
  "source-reproduction": "a source-domain result whose direct test would reproduce the cited study rather than evaluate this project's AI system",
  "existing-artifact-gap": "an engineering consequence belongs in an existing artifact, but its exact traceability or track is still missing",
  "new-artifact-needed": "a project engineering hypothesis needs a new experiment contract",
};
const dispositionDirectory = path.join(root, "experiments", "claim-dispositions");
const dispositionFiles = (await readdir(dispositionDirectory))
  .filter((entry) => entry.endsWith(".json"))
  .sort();
const dispositionByClaim = new Map();
const dispositionErrors = [];

for (const file of dispositionFiles) {
  const fragmentPath = path.join(dispositionDirectory, file);
  let fragment;
  try {
    fragment = JSON.parse(await readFile(fragmentPath, "utf8"));
  } catch (error) {
    dispositionErrors.push(`${file}: invalid JSON (${error.message})`);
    continue;
  }

  if (fragment.schema !== 1) dispositionErrors.push(`${file}: schema must equal 1`);
  if (!fragment.range?.start || !fragment.range?.end) {
    dispositionErrors.push(`${file}: range.start and range.end are required`);
  }
  if (!Array.isArray(fragment.claims)) {
    dispositionErrors.push(`${file}: claims must be an array`);
    continue;
  }

  const rangeStart = Number(String(fragment.range?.start ?? "").replace("C-", ""));
  const rangeEnd = Number(String(fragment.range?.end ?? "").replace("C-", ""));
  for (const record of fragment.claims) {
    const id = record?.id;
    const number = Number(String(id ?? "").replace("C-", ""));
    if (!/^C-\d{3,4}$/.test(id ?? "")) {
      dispositionErrors.push(`${file}: invalid claim ID ${JSON.stringify(id)}`);
      continue;
    }
    if (number < rangeStart || number > rangeEnd) {
      dispositionErrors.push(`${file}: ${id} lies outside the declared range`);
    }
    if (!(record.disposition in dispositionMeanings)) {
      dispositionErrors.push(`${file}: ${id} has invalid disposition ${JSON.stringify(record.disposition)}`);
    }
    if (typeof record.rationale !== "string" || record.rationale.trim().length < 20) {
      dispositionErrors.push(`${file}: ${id} needs a concise claim-specific rationale`);
    }
    if (!Array.isArray(record.targets) || record.targets.some((target) => typeof target !== "string")) {
      dispositionErrors.push(`${file}: ${id} targets must be a string array`);
    }
    if (dispositionByClaim.has(id)) {
      dispositionErrors.push(`${file}: duplicate disposition for ${id}`);
      continue;
    }
    dispositionByClaim.set(id, { ...record, source: `experiments/claim-dispositions/${file}` });
  }
}

const claimById = new Map(claims.map((claim) => [claim.id, claim]));
for (const [id, disposition] of dispositionByClaim) {
  const claim = claimById.get(id);
  if (!claim) {
    dispositionErrors.push(`${disposition.source}: unknown claim ${id}`);
    continue;
  }
  if (claim.tier !== "ledger-only") {
    dispositionErrors.push(`${disposition.source}: ${id} is now ${claim.tier}; remove its stale ledger-only disposition`);
  }

  const targets = disposition.targets ?? [];
  if (["evidence-input", "source-reproduction"].includes(disposition.disposition) && targets.length) {
    dispositionErrors.push(`${disposition.source}: ${id} must not name experiment targets`);
  }
  if (disposition.disposition === "existing-artifact-gap") {
    if (!targets.length) dispositionErrors.push(`${disposition.source}: ${id} needs an existing artifact target`);
    for (const target of targets) {
      if (!artifactById.has(target)) dispositionErrors.push(`${disposition.source}: ${id} names unknown artifact ${target}`);
    }
  }
  if (disposition.disposition === "new-artifact-needed") {
    if (!targets.length || targets.some((target) => !/^proposed:[a-z0-9-]+$/.test(target))) {
      dispositionErrors.push(`${disposition.source}: ${id} needs at least one stable proposed: target`);
    }
  }
}

for (const claim of claims.filter((claim) => claim.tier === "ledger-only")) {
  if (!dispositionByClaim.has(claim.id)) dispositionErrors.push(`Missing ledger-only disposition for ${claim.id}`);
}

const proposedBacklogPath = path.join(root, "experiments", "proposed", "README.md");
let proposedBacklogBody = "";
try {
  proposedBacklogBody = await readFile(proposedBacklogPath, "utf8");
} catch (error) {
  dispositionErrors.push(`experiments/proposed/README.md: cannot read proposed-artifact backlog (${error.message})`);
}
const proposedBacklogTargets = [
  ...proposedBacklogBody.matchAll(/^#{2,3}\s+`(proposed:[a-z0-9-]+)`\s*$/gm),
].map((match) => match[1]);
const proposedBacklogTargetSet = new Set(proposedBacklogTargets);
for (const target of proposedBacklogTargets) {
  if (proposedBacklogTargets.indexOf(target) !== proposedBacklogTargets.lastIndexOf(target)) {
    dispositionErrors.push(`experiments/proposed/README.md: duplicate backlog heading ${target}`);
  }
}
for (const [id, disposition] of dispositionByClaim) {
  if (disposition.disposition !== "new-artifact-needed") continue;
  for (const target of disposition.targets ?? []) {
    if (!proposedBacklogTargetSet.has(target)) {
      dispositionErrors.push(`${disposition.source}: ${id} names undocumented backlog target ${target}`);
    }
  }
}

if (dispositionErrors.length) {
  throw new Error(`Claim-disposition validation failed:\n- ${dispositionErrors.join("\n- ")}`);
}

for (const claim of claims) {
  claim.disposition = dispositionByClaim.get(claim.id) ?? null;
}

const dispositionCounts = Object.fromEntries(
  Object.keys(dispositionMeanings).map((disposition) => [
    disposition,
    claims.filter((claim) => claim.disposition?.disposition === disposition).length,
  ]),
);
const proposedArtifactFamilies = [...new Set(
  claims.flatMap((claim) =>
    claim.disposition?.disposition === "new-artifact-needed"
      ? claim.disposition.targets
      : [],
  ),
)].sort();

const tierCounts = Object.fromEntries(
  ["ledger-only", "linked-description", "protocol-complete", "workstation-executable"].map(
    (tier) => [tier, claims.filter((claim) => claim.tier === tier).length],
  ),
);
const evidenceStatuses = ["established", "plausible", "speculative", "disputed", "unknown"];
const tierStatusCounts = Object.fromEntries(
  ["ledger-only", "linked-description", "protocol-complete", "workstation-executable"].map(
    (tier) => [
      tier,
      Object.fromEntries(
        evidenceStatuses.map((status) => [
          status,
          claims.filter((claim) => claim.tier === tier && claim.status === status).length,
        ]),
      ),
    ],
  ),
);
const claimSideLinked = claims.filter((claim) =>
  artifacts.some((artifact) => artifact.claimSideClaims.has(claim.id)),
).length;
const documentSideLinked = claims.filter((claim) =>
  artifacts.some((artifact) => artifact.documentSideClaims.has(claim.id)),
).length;
const reciprocalClaims = claims.filter((claim) =>
  artifacts.some(
    (artifact) => artifact.claimSideClaims.has(claim.id) && artifact.documentSideClaims.has(claim.id),
  ),
).length;

const counts = {
  claims: claims.length,
  testRouted: claims.filter((claim) => claim.testRouted).length,
  protocolCovered: claims.filter((claim) => claim.protocolCovered).length,
  executionReady: claims.filter((claim) => claim.executionReady).length,
  tierCounts,
  tierStatusCounts,
  dispositionCounts,
  proposedArtifactFamilies: proposedArtifactFamilies.length,
  artifacts: artifacts.length,
  protocolCompleteArtifacts: artifacts.filter((artifact) => artifact.protocolComplete).length,
  executionReadyArtifacts: artifacts.filter((artifact) => artifact.executionReady).length,
  smokeReadyArtifacts: artifacts.filter((artifact) => artifact.executionReadiness === "smoke-ready").length,
  claimSideLinked,
  documentSideLinked,
  reciprocalClaims,
};

const unrouted = claims.filter((claim) => !claim.testRouted);
const jsonReport = {
  schema: 2,
  criteria: {
    protocolComplete: facetRules.map(({ id, label }) => ({ id, label })),
    executionReady: [
      "validated manifest schema",
      "workstation-ready declaration",
      "prepare/smoke/run/analyze commands",
      "existing lockfiles, seed packs, generator, output schema, entrypoint, and tests",
      "explicit per-manifest execution claim scope",
    ],
    ledgerOnlyDispositions: dispositionMeanings,
  },
  counts,
  artifacts: artifacts.map((artifact) => ({
    id: artifact.id,
    path: artifact.path,
    title: artifact.title,
    protocolComplete: artifact.protocolComplete,
    missingFacets: artifact.missingFacets,
    executionReady: artifact.executionReady,
    executionReadiness: artifact.executionReadiness,
    executionManifest: artifact.executionManifest,
    executionMissing: artifact.executionMissing,
    executionPromotionChecks: artifact.executionPromotionChecks,
    executionClaims: artifact.executionClaims,
    claimSideClaims: [...artifact.claimSideClaims].sort(),
    documentSideClaims: [...artifact.documentSideClaims].sort(),
    linkedClaims: [...new Set([...artifact.claimSideClaims, ...artifact.documentSideClaims])].sort(),
  })),
  claims,
};

const readinessSummary = {
  schema: 1,
  generatedFrom: "experiments/test-coverage.json",
  claims: {
    total: counts.claims,
    testRouted: counts.testRouted,
    protocolCovered: counts.protocolCovered,
    executionReady: counts.executionReady,
    tierCounts,
    tierStatusCounts,
  },
  ledgerOnly: {
    total: tierCounts["ledger-only"],
    dispositionCounts,
    proposedArtifactFamilies: proposedArtifactFamilies.length,
  },
  artifacts: {
    total: counts.artifacts,
    protocolComplete: counts.protocolCompleteArtifacts,
    smokeReady: counts.smokeReadyArtifacts,
    workstationReady: counts.executionReadyArtifacts,
    items: artifacts.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      title: artifact.title,
      linkedClaims: new Set([
        ...artifact.claimSideClaims,
        ...artifact.documentSideClaims,
      ]).size,
      protocolComplete: artifact.protocolComplete,
      missingFacets: artifact.missingFacets,
      executionReadiness: artifact.executionReadiness,
      executionReady: artifact.executionReady,
      executionManifest: artifact.executionManifest,
      executionClaims: artifact.executionClaims,
      promotionChecks: artifact.executionPromotionChecks,
    })),
  },
};

const readinessTierTotal = Object.values(readinessSummary.claims.tierCounts)
  .reduce((sum, value) => sum + value, 0);
if (readinessTierTotal !== readinessSummary.claims.total) {
  throw new Error(`Readiness summary tier total ${readinessTierTotal} does not match ${readinessSummary.claims.total}`);
}
for (const [tier, statuses] of Object.entries(readinessSummary.claims.tierStatusCounts)) {
  const statusTotal = Object.values(statuses).reduce((sum, value) => sum + value, 0);
  if (statusTotal !== readinessSummary.claims.tierCounts[tier]) {
    throw new Error(`Readiness summary evidence total for ${tier} does not match its tier count`);
  }
}

function percent(value, total) {
  return `${((value / total) * 100).toFixed(1)}%`;
}

function artifactLink(artifact) {
  return `[${artifact.id}](${artifact.path.replace(/^experiments\//, "")})`;
}

const artifactRows = artifacts
  .map((artifact) => {
    const status = artifact.protocolComplete
      ? "complete description"
      : `incomplete: ${artifact.missingFacets.join(", ")}`;
    const linkedClaims = new Set([
      ...artifact.claimSideClaims,
      ...artifact.documentSideClaims,
    ]).size;
    const executionStatus = artifact.executionReady
      ? "workstation-ready"
      : artifact.executionReadiness === "smoke-ready"
        ? "smoke-ready; not executable"
        : "not executable";
    return `| ${artifactLink(artifact)} | ${linkedClaims} | ${status} | ${executionStatus} |`;
  })
  .join("\n");

const tierStatusRows = Object.entries(tierStatusCounts)
  .map(([tier, statuses]) =>
    `| ${tier} | ${statuses.established} | ${statuses.plausible} | ${statuses.speculative} | ${statuses.disputed} | ${statuses.unknown} |`,
  )
  .join("\n");

const dispositionRows = Object.entries(dispositionMeanings)
  .map(([disposition, meaning]) => `| ${disposition} | ${dispositionCounts[disposition]} | ${meaning} |`)
  .join("\n");

const markdownReport = `# Test coverage\n\nThis report is generated from the central claim ledger, experiment documents,\nand reviewed ledger-only dispositions. It distinguishes a written protocol from\nrunnable software. Re-run \`npm run audit:tests\` after changing claim links,\nexperiment contracts, or disposition fragments.\n\n## Current answer\n\nThe four rows below are mutually exclusive highest-reached tiers.\n\n| Highest coverage tier | Claims | Share of ${counts.claims} | Meaning |\n| --- | ---: | ---: | --- |\n| ledger-only | ${tierCounts["ledger-only"]} | ${percent(tierCounts["ledger-only"], counts.claims)} | no exact direct relation to a numbered experiment artifact |\n| linked test description | ${tierCounts["linked-description"]} | ${percent(tierCounts["linked-description"], counts.claims)} | related experiment prose exists, but at least one required protocol facet is absent |\n| protocol-complete test contract | ${tierCounts["protocol-complete"]} | ${percent(tierCounts["protocol-complete"], counts.claims)} | at least one linked artifact contains all eight required facets |\n| workstation-executable | ${tierCounts["workstation-executable"]} | ${percent(tierCounts["workstation-executable"], counts.claims)} | checked execution manifest and runnable scientific harness exist |\n\nThe short answer is therefore **${counts.protocolCovered} claims have a complete\ntest description, but ${counts.executionReady} are executable on the workstation**.\nAcross both description tiers, ${counts.testRouted} claims have an exact direct\nrelation to at least one experiment artifact. These are aggregate candidate\ntests: they evaluate engineering translations supported by several claims; they\ndo not independently reproduce every source paper.\n\n## Coverage by evidence status\n\n| Highest tier | Established | Plausible | Speculative | Disputed | Unknown |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${tierStatusRows}\n\n## Why ledger-only claims remain unlinked\n\nA reviewed disposition explains every ledger-only claim without counting the\nclassification itself as a test.\n\n| Disposition | Claims | Meaning |\n| --- | ---: | --- |\n${dispositionRows}\n\nThe ${dispositionCounts["new-artifact-needed"]} unresolved engineering claims\ncollapse into ${proposedArtifactFamilies.length} proposed experiment families.\nTheir minimum promotion contracts are kept in the\n[proposed-artifact backlog](proposed/README.md). The source fragments and schema\nare in [claim dispositions](claim-dispositions/README.md).\n\n## What “complete test description” means\n\nA protocol passes only when the document contains all of the following:\n\n${facetRules.map(({ label }) => `- ${label};`).join("\n")}\n\nThe gate scans explicit H2/H3 sections. Cost reporting alone does not satisfy\nresource parity, and a statistical null is not a confirmatory analysis plan.\nThis is a structural completeness gate, not proof that the design is correct.\nA workstation-ready test additionally needs a machine-readable manifest naming\nthe command, environment, hardware assumptions, seeds, data, and outputs.\n\n## Traceability method\n\nA relation exists when either side states it exactly:\n\n1. a claim block links a numbered candidate or fixture; or\n2. an artifact links an exact claim label to the matching claim anchor.\n\nInclusive ranges are expanded only when both endpoints have exact matching\nlinks. Prose numbers and indirect adoption-matrix associations do not count.\nThe union yields ${counts.testRouted} linked claims: ${counts.claimSideLinked}\nappear on the claim side, ${counts.documentSideLinked} on the document side, and\n${counts.reciprocalClaims} have at least one reciprocal same-artifact relation.\n\n## Artifact coverage\n\nThere are ${counts.artifacts} experiment artifacts: ${counts.protocolCompleteArtifacts}\npass the written-protocol gate, and ${counts.executionReadyArtifacts} pass the\nexecution gate.\n\n| Artifact | Directly related claims | Protocol status | Execution status |\n| --- | ---: | --- | --- |\n${artifactRows}\n\n## Immediate gaps\n\n- ${unrouted.length} claims remain ledger-only: ${dispositionCounts["evidence-input"]}\n  evidence inputs, ${dispositionCounts["source-reproduction"]} source-domain\n  reproductions, and ${dispositionCounts["new-artifact-needed"]} claims needing\n  a new project experiment artifact.\n- ${dispositionCounts["existing-artifact-gap"]} ledger-only claims still belong\n  in an existing artifact but lack an exact traceability or test track.\n- ${tierCounts["linked-description"]} claims reach only a partial description.\n  The missing facets are concentrated in ${artifacts.filter((artifact) => !artifact.protocolComplete).map((artifact) => `\`${artifact.id}\` (${artifact.missingFacets.join(", ")})`).join(", ") || "no artifact"}.\n- No execution manifests, runners, frozen environments, seed packs, or raw-output\n  schemas exist yet. The [workstation contract](workstation/README.md) defines\n  the next layer without pretending that prose is runnable.\n\n## Machine-readable report\n\n[\`test-coverage.json\`](test-coverage.json) contains every claim-to-artifact\nmapping, reviewed ledger-only disposition, per-artifact facet result, and\nexecution readiness.\n`;

const renderedMarkdownReport = markdownReport
  .replace(
    `The ${dispositionCounts["new-artifact-needed"]} unresolved engineering claims\ncollapse into ${proposedArtifactFamilies.length} proposed experiment families.\nTheir minimum promotion contracts are kept in the\n[proposed-artifact backlog](proposed/README.md). The source fragments and schema\nare in [claim dispositions](claim-dispositions/README.md).`,
    dispositionCounts["new-artifact-needed"] === 0
      ? "No unresolved `new-artifact-needed` disposition remains. Promoted family\nrecords are retained as design provenance in the\n[experiment-family provenance](proposed/README.md). The source fragments and\nschema are in [claim dispositions](claim-dispositions/README.md)."
      : `The ${dispositionCounts["new-artifact-needed"]} unresolved engineering claims\ncollapse into ${proposedArtifactFamilies.length} proposed experiment families.\nTheir minimum promotion contracts are kept in the\n[proposed-artifact backlog](proposed/README.md). The source fragments and schema\nare in [claim dispositions](claim-dispositions/README.md).`,
  )
  .replace(
    `There are ${counts.artifacts} experiment artifacts: ${counts.protocolCompleteArtifacts}\npass the written-protocol gate, and ${counts.executionReadyArtifacts} pass the\nexecution gate.`,
    `There are ${counts.artifacts} experiment artifacts: ${counts.protocolCompleteArtifacts}\npass the written-protocol gate, a validated smoke harness exists for\n${counts.smokeReadyArtifacts}, and ${counts.executionReadyArtifacts} pass the full execution gate.\nSmoke readiness verifies deterministic plumbing but cannot promote a claim.`,
  )
  .replace(
    "- No execution manifests, runners, frozen environments, seed packs, or raw-output\n  schemas exist yet. The [workstation contract](workstation/README.md) defines\n  the next layer without pretending that prose is runnable.",
    `- ${counts.smokeReadyArtifacts} artifact(s) have a validated smoke manifest and\n  deterministic harness. They remain non-executable for claim coverage until\n  confirmation seeds, held-out generators, complete analysis, resume and\n  corruption checks, and measured-energy instrumentation satisfy the\n  [workstation contract](workstation/README.md).`,
  );

const outputs = [
  [path.join(root, "experiments", "test-coverage.json"), `${JSON.stringify(jsonReport, null, 2)}\n`],
  [path.join(root, "experiments", "test-readiness-summary.json"), `${JSON.stringify(readinessSummary, null, 2)}\n`],
  [path.join(root, "experiments", "test-coverage.md"), renderedMarkdownReport],
];

let stale = false;
for (const [outputPath, expected] of outputs) {
  if (checkOnly) {
    let current = "";
    try {
      current = await readFile(outputPath, "utf8");
    } catch {
      stale = true;
      console.error(`Missing generated report: ${toPosix(path.relative(root, outputPath))}`);
      continue;
    }
    if (current !== expected) {
      stale = true;
      console.error(`Stale generated report: ${toPosix(path.relative(root, outputPath))}`);
    }
  } else {
    await writeFile(outputPath, expected, "utf8");
  }
}

if (stale) process.exitCode = 1;
else console.log(`${counts.protocolCovered}/${counts.claims} claims are protocol-covered; ${counts.executionReady} are workstation-executable.`);
