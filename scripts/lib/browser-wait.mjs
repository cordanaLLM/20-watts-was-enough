// Poll budgets count at most one interval per observation; scheduler delays
// remain visible in diagnostics and cannot extend the hard wall cap.
export const STALL_FACTOR = 1;
export const WALL_CAP_FACTOR = 10;
export const systemClock = Object.freeze({
  now: () => performance.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

function waitFailure(label, chargedMs, wallMs, snapshot, cause) {
  const stalledMs = Math.max(0, wallMs - chargedMs);
  const prefix = stalledMs > wallMs * 0.5 ? "UNDECIDED: host starved; " : "";
  const error = new Error(
    `${prefix}${label}; charged ${chargedMs} ms, wall ${wallMs} ms, stalled ${stalledMs} ms; `
      + `last observation: ${JSON.stringify(snapshot)}`,
    { cause },
  );
  Object.assign(error, { chargedMs, wallMs, stalledMs, snapshot });
  return error;
}

// The real-clock watchdog also bounds a probe that never returns. Injected
// clocks advance in probe/sleep, allowing deterministic deadline tests.
async function boundedProbe(probe, remainingMs, clock, expired) {
  if (clock !== systemClock) return probe();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(probe),
      new Promise((_, reject) => { timer = setTimeout(() => reject(expired()), remainingMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForCondition({
  probe, accepts = Boolean, budgetMs, intervalMs = 100, clock = systemClock, label = "Condition not accepted",
}) {
  if (![budgetMs, intervalMs].every((value) => Number.isSafeInteger(value) && value > 0)
    || budgetMs * WALL_CAP_FACTOR > 2_147_483_647) {
    throw new TypeError("Wait budget and interval must be positive safe integer milliseconds within the timer bound");
  }
  const started = clock.now();
  const wallCapMs = budgetMs * WALL_CAP_FACTOR;
  // Millisecond scalar bound also tolerates a sleep waking slightly early.
  const pollLimit = budgetMs + 1;
  let previous = started;
  let chargedMs = 0;
  let snapshot;
  const expired = (cause) => {
    const wallMs = Math.max(0, clock.now() - started);
    const pendingCharge = Math.min(Math.max(0, clock.now() - previous), intervalMs * STALL_FACTOR);
    return waitFailure(label, chargedMs + pendingCharge, wallMs, snapshot, cause);
  };
  for (let poll = 0; poll < pollLimit; poll += 1) {
    const remainingMs = wallCapMs - (clock.now() - started);
    if (remainingMs < 0) throw expired();
    try {
      snapshot = await boundedProbe(probe, Math.max(1, remainingMs), clock, expired);
    } catch (cause) {
      // A page/transport error is still a failure; starvation is never a pass.
      throw expired(cause);
    }
    const now = clock.now();
    chargedMs += Math.min(Math.max(0, now - previous), intervalMs * STALL_FACTOR);
    previous = now;
    const wallMs = Math.max(0, now - started);
    if (wallMs <= wallCapMs && accepts(snapshot)) return snapshot;
    if (chargedMs >= budgetMs || wallMs >= wallCapMs || poll + 1 === pollLimit) {
      throw waitFailure(label, chargedMs, wallMs, snapshot);
    }
    await clock.sleep(Math.min(intervalMs, budgetMs - chargedMs, wallCapMs - wallMs));
  }
}
