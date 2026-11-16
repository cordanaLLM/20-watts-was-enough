import { calibrationCell, calibrationRegimeParams } from "./t02-generator.mjs";
import { evaluateArmAT02 } from "./t02-evaluator.mjs";
import { analyticAlphaStar, analyticPowerStar } from "./t02-objective.mjs";

export function developmentCalibration() {
  const tree = calibrationCell();
  const regimeParams = calibrationRegimeParams();
  const world = { tree, regime: "classic", regime_params: regimeParams,
    manifest: { uniform_upper_round: 0, terminal_failure: null },
    maximum_loss_j: 3600e9 };
  const evaluation = evaluateArmAT02(world);
  if (evaluation.failure_reason !== null) {
    return { status: "failed", reason: evaluation.failure_reason,
      alpha_relative_error: null, power_relative_error: null,
      murray_relative_error: null, b_agreement: "not-built" };
  }
  const alphaStar = analyticAlphaStar(tree.mu0, tree.lambda_V);
  const powerStar = analyticPowerStar(tree, alphaStar);
  const alphaError = Math.abs(evaluation.alpha / alphaStar - 1);
  const powerError = Math.abs(evaluation.objective_w / powerStar - 1);
  const radii = evaluation.radii;
  const r0 = radii[0];
  const r1 = radii[1];
  const r2 = radii[2];
  const murrayRatio = r0 ** 3 / (r1 ** 3 + r2 ** 3);
  const murrayError = Math.abs(murrayRatio - 1);
  const passed = alphaError <= 1e-6 && powerError <= 1e-6 && murrayError <= 1e-12;
  return { status: passed ? "passed" : "failed",
    alpha_relative_error: alphaError, power_relative_error: powerError,
    murray_relative_error: murrayError, b_agreement: "not-built" };
}
