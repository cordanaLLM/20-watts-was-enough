export const REQUIRED_NODE_VERSION = "26.12.0";

export const NODE_NUMERIC_SENTINEL = Object.freeze({
  id: "fixture-026.rsd-t02-ramp-exp-up-4.sample-98.v1",
  expected_json: "2.607762530383872",
});

export function observeNodeRuntime() {
  const phase = 0.3828125;
  const fold = Math.exp(
    Math.log(1) + phase * (Math.log(2) - Math.log(1)),
  );
  return Object.freeze({
    node_version: process.versions.node,
    numeric_sentinel_id: NODE_NUMERIC_SENTINEL.id,
    numeric_sentinel_json: JSON.stringify(2 * fold),
  });
}

export function validateNodeRuntimePolicy(observation = observeNodeRuntime()) {
  const findings = [];
  if (observation?.node_version !== REQUIRED_NODE_VERSION) {
    findings.push(
      `Node.js ${REQUIRED_NODE_VERSION} is required; observed ${observation?.node_version ?? "unknown"}`,
    );
  }
  if (observation?.numeric_sentinel_id !== NODE_NUMERIC_SENTINEL.id) {
    findings.push("the Node numeric sentinel identity is missing or unknown");
  }
  if (observation?.numeric_sentinel_json !== NODE_NUMERIC_SENTINEL.expected_json) {
    findings.push(
      `the Node numeric sentinel serialized as ${observation?.numeric_sentinel_json ?? "unknown"}; expected ${NODE_NUMERIC_SENTINEL.expected_json}`,
    );
  }
  return findings;
}

export function assertNodeRuntimePolicy(observation = observeNodeRuntime()) {
  const findings = validateNodeRuntimePolicy(observation);
  if (findings.length > 0) {
    throw new Error(
      `Unsupported Node runtime: ${findings.join("; ")}. Use the official Node.js 26.12.0 binary or the pinned experiment container.`,
    );
  }
  return observation;
}
