import { exactKeys } from "../lib/exact-keys.mjs";
import { T02_L_MAX, T02_R_MAX, T02_R_MIN } from "./t02-contract.mjs";
import { evaluateArmAT02 } from "./t02-evaluator.mjs";
import { calibrationCell, calibrationRegimeParams } from "./t02-generator.mjs";
import { analyticAlphaStar, analyticPowerStar } from "./t02-objective.mjs";

const GOLDEN_RATIO = (Math.sqrt(5) - 1) / 2;
export const MAX_GOLDEN_ITERATIONS = 200;
export const T02_CANDIDATE_ORDER = Object.freeze(["lower", "midpoint", "upper", "golden-a", "golden-b"]);

const REGIME_COEFFICIENT_KEYS = Object.freeze({
  classic: Object.freeze(["regime"]),
  rheology: Object.freeze(["regime", "a", "r_c"]),
  pulsatile: Object.freeze(["regime", "lambda_I", "f", "rho"]),
  "wall-floor": Object.freeze(["regime", "lambda_A"]),
});

export class T02PolicyError extends Error {
  constructor(message, { goldenIterations = 0, solverLog = [] } = {}) {
    super(message);
    this.goldenIterations = goldenIterations;
    this.solverLog = solverLog;
  }
}

function isPositiveArray(values, length) {
  return Array.isArray(values) && values.length === length
    && values.every((v) => Number.isFinite(v) && v > 0);
}

function assertGeometryView(geometry) {
  const baseKeys = ["depth", "node_count", "edge_count", "terminal_count", "first_terminal", "edge_lengths"];
  const keys = Object.hasOwn(geometry ?? {}, "parents") ? [...baseKeys, "parents"] : baseKeys;
  const validCount = Number.isSafeInteger(geometry?.edge_count) && geometry.edge_count >= 1;
  if (!exactKeys(geometry, keys) || !validCount || !isPositiveArray(geometry.edge_lengths, geometry.edge_count)) {
    throw new T02PolicyError("oracle-key-leak");
  }
}

function assertRegimeCoefficients(coefficients) {
  const coeffKeys = REGIME_COEFFICIENT_KEYS[coefficients?.regime];
  if (!coeffKeys || !exactKeys(coefficients, coeffKeys)
    || coeffKeys.some((k) => k !== "regime" && !Number.isFinite(coefficients[k]))) {
    throw new T02PolicyError("oracle-key-leak");
  }
}

function validBoundsAndPressures(limits, pressures) {
  if (!exactKeys(limits, ["r_min", "r_max"])) return false;
  if (!Number.isFinite(limits.r_min) || !Number.isFinite(limits.r_max)) return false;
  if (!(limits.r_min > 0 && limits.r_min <= limits.r_max)) return false;
  return exactKeys(pressures, ["P_root", "required_terminal_pressure"])
    && Object.values(pressures).every(Number.isFinite);
}

export function assertT02ArmInput(input) {
  const keys = ["schema", "geometry", "edge_flows", "mu0", "lambda_V",
    "regime_coefficients", "radius_limits", "pressure_constraints"];
  if (!exactKeys(input, keys) || input.schema !== 1) throw new T02PolicyError("oracle-key-leak");
  assertGeometryView(input.geometry);
  assertRegimeCoefficients(input.regime_coefficients);
  const validScalars = Number.isFinite(input.mu0) && Number.isFinite(input.lambda_V);
  if (!isPositiveArray(input.edge_flows, input.geometry.edge_count) || !validScalars
    || !validBoundsAndPressures(input.radius_limits, input.pressure_constraints)) {
    throw new T02PolicyError("oracle-key-leak");
  }
  return input;
}

export function t02ArmInput(world, radiusLimits = { r_min: T02_R_MIN, r_max: T02_R_MAX }) {
  const { tree, regime, regime_params: rp } = world;
  const geometry = {
    depth: tree.depth, node_count: tree.node_count, edge_count: tree.edge_count,
    terminal_count: tree.terminal_count, first_terminal: tree.first_terminal,
    edge_lengths: [...tree.edge_lengths],
    ...(tree.parents ? { parents: [...tree.parents] } : {}),
  };
  const coefficients = { regime };
  for (const key of ["a", "r_c", "lambda_I", "f", "rho", "lambda_A"]) {
    if (rp?.[key] !== undefined) coefficients[key] = rp[key];
  }
  return assertT02ArmInput({
    schema: 1, geometry, edge_flows: [...tree.edge_flows], mu0: tree.mu0, lambda_V: tree.lambda_V,
    regime_coefficients: coefficients,
    radius_limits: { r_min: radiusLimits.r_min, r_max: radiusLimits.r_max },
    pressure_constraints: { P_root: tree.P_root,
      required_terminal_pressure: rp?.required_terminal_pressure ?? 0 },
  });
}

export function clampCubicRadii(alpha, flowScales, rMin = T02_R_MIN, rMax = T02_R_MAX) {
  const clamped = new Array(flowScales.length);
  for (let e = 0; e < flowScales.length; e += 1) {
    const raw = alpha * flowScales[e];
    const bounded = Math.max(rMin, Math.min(rMax, raw));
    if (!Number.isFinite(raw) || raw <= 0 || Math.abs(bounded - raw) > 1e-12 * Math.abs(raw)) {
      throw new T02PolicyError("ICP-T02 radius clamp exceeded 1e-12 relative tolerance.");
    }
    clamped[e] = bounded;
  }
  return clamped;
}

export function selectBestCandidate(evaluated) {
  let best = null;
  for (let index = 0; index < evaluated.length; index += 1) {
    const candidate = evaluated[index];
    if (!candidate.feasible) continue;
    if (best === null) {
      best = candidate;
      continue;
    }
    const x = candidate.objective_w;
    const y = best.objective_w;
    const tie = Math.abs(x - y) <= 1e-12 * Math.max(1, Math.abs(x), Math.abs(y));
    if (!tie && x < y) best = candidate;
  }
  return best;
}

function advanceGoldenBracket(bracket, evalX) {
  if (bracket.fA.power <= bracket.fB.power) {
    bracket.b = bracket.xB;
    bracket.xB = bracket.xA;
    bracket.fB = bracket.fA;
    bracket.xA = bracket.a + (1 - GOLDEN_RATIO) * (bracket.b - bracket.a);
    bracket.fA = evalX(bracket.xA);
    return bracket.fA.aborted;
  }
  bracket.a = bracket.xA;
  bracket.xA = bracket.xB;
  bracket.fA = bracket.fB;
  bracket.xB = bracket.a + GOLDEN_RATIO * (bracket.b - bracket.a);
  bracket.fB = evalX(bracket.xB);
  return bracket.fB.aborted;
}

function runGoldenSection({ flowScales, rMin, rMax, xLo, xHi, evaluateDesign,
  goldenRelativeWidth, maxGoldenIterations }) {
  const xA0 = xLo + (1 - GOLDEN_RATIO) * (xHi - xLo);
  const xB0 = xLo + GOLDEN_RATIO * (xHi - xLo);
  const solverLog = [];
  if (!(Math.expm1(xHi - xLo) > goldenRelativeWidth)) {
    return { aborted: false, xA: xA0, xB: xB0, goldenIterations: 0, solverLog };
  }
  const evalX = (x) => evaluateDesign(clampCubicRadii(Math.exp(x), flowScales, rMin, rMax));
  const fA0 = evalX(xA0);
  if (fA0.aborted) return { aborted: true, goldenIterations: 0, solverLog };
  const fB0 = evalX(xB0);
  if (fB0.aborted) return { aborted: true, goldenIterations: 0, solverLog };
  const bracket = { a: xLo, b: xHi, xA: xA0, xB: xB0, fA: fA0, fB: fB0 };
  for (let iter = 1; iter <= maxGoldenIterations && Math.expm1(bracket.b - bracket.a) > goldenRelativeWidth; iter += 1) {
    if (advanceGoldenBracket(bracket, evalX)) {
      return { aborted: true, goldenIterations: solverLog.length, solverLog };
    }
    solverLog.push({ iteration: iter, lo: bracket.a, hi: bracket.b,
      x_a: bracket.xA, x_b: bracket.xB, f_a: bracket.fA.power, f_b: bracket.fB.power });
  }
  if (Math.expm1(bracket.b - bracket.a) > goldenRelativeWidth) {
    throw new T02PolicyError("ICP-T02 golden-section iteration cap exceeded.",
      { goldenIterations: solverLog.length, solverLog });
  }
  return { aborted: false, xA: bracket.xA, xB: bracket.xB, goldenIterations: solverLog.length, solverLog };
}

export function cubicArmAPolicy(input, evaluateDesign, {
  goldenRelativeWidth = 1e-10,
  maxGoldenIterations = MAX_GOLDEN_ITERATIONS,
  exponent = 1 / 3,
} = {}) {
  assertT02ArmInput(input);
  const { r_min: rMin, r_max: rMax } = input.radius_limits;
  const flowScales = input.edge_flows.map((q) => (exponent === 1 / 3 ? Math.cbrt(q) : q ** exponent));
  const alphaLo = flowScales.reduce((mx, c) => Math.max(mx, rMin / c), -Infinity);
  const alphaHi = flowScales.reduce((mn, c) => Math.min(mn, rMax / c), Infinity);
  if (!(alphaLo <= alphaHi)) {
    return { chosen: null, candidates: [], solverLog: [], goldenIterations: 0 };
  }
  const xLo = Math.log(alphaLo), xHi = Math.log(alphaHi);
  const gss = runGoldenSection({ flowScales, rMin, rMax, xLo, xHi, evaluateDesign,
    goldenRelativeWidth, maxGoldenIterations });
  if (gss.aborted) return { chosen: null, candidates: [], solverLog: gss.solverLog, goldenIterations: gss.goldenIterations };
  const points = [xLo, (xLo + xHi) / 2, xHi, gss.xA, gss.xB];
  const evaluated = [];
  for (let index = 0; index < T02_CANDIDATE_ORDER.length; index += 1) {
    const alpha = Math.exp(points[index]);
    let radii;
    try { radii = clampCubicRadii(alpha, flowScales, rMin, rMax); } catch (error) {
      throw new T02PolicyError(error.message, { goldenIterations: gss.goldenIterations, solverLog: gss.solverLog });
    }
    const result = evaluateDesign(radii);
    if (result.aborted) {
      return { chosen: null, candidates: [], solverLog: gss.solverLog, goldenIterations: gss.goldenIterations };
    }
    evaluated.push({ candidate: T02_CANDIDATE_ORDER[index], alpha, radii,
      objective_w: result.power, feasible: result.feasible, result });
  }
  const best = selectBestCandidate(evaluated);
  const candidates = evaluated.map((c) => ({
    candidate: c.candidate, alpha: c.alpha, objective_w: c.objective_w,
    feasible: c.feasible, chosen: c === best,
  }));
  return { chosen: best, candidates, solverLog: gss.solverLog, goldenIterations: gss.goldenIterations };
}

export function developmentCalibration({ exponent = 1 / 3 } = {}) {
  const tree = calibrationCell();
  const regimeParams = calibrationRegimeParams();
  const world = { tree, regime: "classic", regime_params: regimeParams,
    manifest: { uniform_upper_round: 0, terminal_failure: null },
    maximum_loss_j: T02_L_MAX };
  const evaluation = evaluateArmAT02(world, { exponent });
  if (evaluation.failure_reason !== null) {
    return { status: "failed", alpha_relative_error: null, power_relative_error: null,
      murray_relative_error: null, b_agreement: "not-built" };
  }
  const alphaStar = analyticAlphaStar(tree.mu0, tree.lambda_V);
  const powerStar = analyticPowerStar(tree, alphaStar);
  const alphaError = Math.abs(evaluation.alpha / alphaStar - 1);
  const powerError = Math.abs(evaluation.objective_w / powerStar - 1);
  const [r0, r1, r2] = evaluation.radii;
  const murrayError = Math.abs(r0 ** 3 / (r1 ** 3 + r2 ** 3) - 1);
  const passed = alphaError <= 1e-6 && powerError <= 1e-6 && murrayError <= 1e-12;
  return { status: passed ? "passed" : "failed", alpha_relative_error: alphaError,
    power_relative_error: powerError, murray_relative_error: murrayError, b_agreement: "not-built" };
}
