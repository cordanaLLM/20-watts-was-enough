// Deterministic quantile/percentile calculation shared across workstation fixtures.

export function percentile(values, fraction) {
  if (!values || values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(fraction * ordered.length) - 1];
}
