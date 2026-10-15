export const FIXTURE_025_AUDIT_SHA256 = "30A513FCC222F8A9EBAF0F39C24B8787FF8AA2CBA93C2D2DE2E46FD00A11D6CB";
export const FIXTURE_025_TRACK_IDS = Object.freeze([
  "ECM-T01", "ECM-T02", "ECM-T03", "ECM-T04", "ECM-T05",
  "ECM-T06", "ECM-T07", "ECM-T08", "ECM-T09", "ECM-T10",
]);
export const FIXTURE_025_TRACK_CLAIMS = Object.freeze(Object.fromEntries(
  FIXTURE_025_TRACK_IDS.map((track, index) => [track, `C-${1530 + index}`]),
));
export const FIXTURE_025_IMPLEMENTED_TRACKS = Object.freeze(["ECM-T03"]);

export function extractFixture025Registry(markdown) {
  if (typeof markdown !== "string") throw new TypeError("Fixture 025 Markdown must be text.");
  const heading = markdown.indexOf("## Frozen machine-readable DGP registry");
  if (heading < 0) throw new Error("Fixture 025 registry heading is missing.");
  const remainder = markdown.slice(heading);
  const match = remainder.match(/~~~json\r?\n([\s\S]*?)\r?\n~~~/u);
  if (!match) throw new Error("Fixture 025 normative registry JSON fence is missing.");
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Fixture 025 normative registry is invalid JSON: ${error.message}`, { cause: error });
  }
}

function candidateTuples(axes, prefix = {}, index = 0) {
  if (index === axes.length) return [Object.freeze({ ...prefix })];
  const axis = axes[index];
  if (
    !axis
    || typeof axis.name !== "string"
    || axis.name.length === 0
    || !Array.isArray(axis.values)
    || axis.values.length === 0
  ) throw new Error("Fixture 025 candidate axis is malformed.");
  return axis.values.flatMap((value) => candidateTuples(axes, { ...prefix, [axis.name]: value }, index + 1));
}

export function enumerateFixture025Candidates(registry, trackId, arm) {
  if (!FIXTURE_025_TRACK_IDS.includes(trackId)) throw new Error(`Unknown Fixture 025 track ${trackId}.`);
  if (!new Set(["A", "B", "C"]).has(arm)) throw new Error(`Unknown Fixture 025 arm ${arm}.`);
  const specification = registry?.tracks?.[trackId]?.tuning?.[arm];
  if (!specification || !Array.isArray(specification.axes)) {
    throw new Error(`Fixture 025 ${trackId}/${arm} tuning grid is missing.`);
  }
  return Object.freeze(candidateTuples(specification.axes));
}

export function assertFixture025Registry(registry) {
  if (registry?.schema !== "urn:20watts:f025:dgp:v1" || registry.fixture !== "F-025") {
    throw new Error("Fixture 025 registry identity is invalid.");
  }
  if (registry.numeric?.float !== "IEEE-754-binary64" || registry.numeric?.rng !== "PCG64-DXSM") {
    throw new Error("Fixture 025 registry numerical contract is invalid.");
  }
  const trackIds = Object.keys(registry.tracks ?? {});
  if (JSON.stringify(trackIds) !== JSON.stringify(FIXTURE_025_TRACK_IDS)) {
    throw new Error("Fixture 025 registry track order is invalid.");
  }
  for (const trackId of FIXTURE_025_TRACK_IDS) {
    const track = registry.tracks[trackId];
    if (!Number.isSafeInteger(track.worldsPerSeed) || track.worldsPerSeed < 1) {
      throw new Error(`Fixture 025 ${trackId} world count is invalid.`);
    }
    if (!track.rawMetrics || Object.keys(track.rawMetrics).length < 1) {
      throw new Error(`Fixture 025 ${trackId} raw metrics are missing.`);
    }
    if (!Array.isArray(track.ablationTransforms) || track.ablationTransforms.length < 1) {
      throw new Error(`Fixture 025 ${trackId} ablations are missing.`);
    }
    for (const [arm, expected] of [["A", 16], ["B", 64], ["C", 64]]) {
      const tuples = enumerateFixture025Candidates(registry, trackId, arm);
      const declared = track.tuning[arm].count;
      const unique = new Set(tuples.map((tuple) => JSON.stringify(tuple)));
      if (declared !== expected || tuples.length !== expected || unique.size !== expected) {
        throw new Error(`Fixture 025 ${trackId}/${arm} candidate grid is not exactly ${expected}.`);
      }
    }
  }
  return registry;
}
