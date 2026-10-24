export const STANDARD_STREAM_PHASES = Object.freeze(new Set([
  "development",
  "confirmation",
  "transfer",
  "ablation",
]));

/**
 * Validates that `seed` is a safe unsigned 32-bit integer and encodes it as
 * an 8-byte little-endian Buffer (uint64_le).
 */
export function uint32SeedBytes(seed, label = "Fixture public") {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error(`${label} seed must be an unsigned integer.`);
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(seed));
  return bytes;
}

/**
 * Encodes 8 seed bytes as an uppercase 16-character hex string.
 */
export function formatSeedHex(bytes) {
  return bytes.toString("hex").toUpperCase();
}

/**
 * Formats a canonical fixture stream preimage string after validating phase,
 * protocol, scope, and canonicalId.
 */
export function formatStreamPreimage({
  version,
  phase,
  protocol,
  seedHex,
  scope,
  canonicalId,
  label = "Fixture",
  isValidProtocol,
  validScopes,
}) {
  if (!STANDARD_STREAM_PHASES.has(phase)) {
    throw new Error(`${label} stream phase is invalid.`);
  }
  if (!isValidProtocol(protocol)) {
    throw new Error(`${label} stream protocol is invalid.`);
  }
  if (!validScopes.has(scope)) {
    throw new Error(`${label} stream scope is invalid.`);
  }
  if (!/^(0|[1-9][0-9]*)$/.test(String(canonicalId))) {
    throw new Error(`${label} stream canonical ID must be unpadded ASCII decimal.`);
  }
  return `${version}|${phase}|${protocol}|${seedHex}|${scope}|${canonicalId}`;
}
