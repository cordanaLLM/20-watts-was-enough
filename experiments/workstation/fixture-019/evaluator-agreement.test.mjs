import assert from "node:assert/strict";
import test from "node:test";

import { runFixture019Python } from "./test-helpers.mjs";

const mutantMatrixSource = String.raw`
import json
import numpy as np
import worker

seed = "6050310934014137086"
original = worker.evaluate_truth

def request(cell="base"):
    return {
        "action": "simulate",
        "seed": seed,
        "split": "development",
        "cell": cell,
        "replicate": 0,
    }

def execute_with(mutation):
    def mutant(*args, **kwargs):
        result = original(*args, **kwargs)
        mutation(result)
        return result
    worker.evaluate_truth = mutant
    try:
        result = worker.simulate(request())
        return {
            "agreement": result["checks"]["independent_evaluator_agreement"],
            "terminal_status": result["terminal_status"],
        }
    finally:
        worker.evaluate_truth = original

def add(field, amount):
    return lambda value: value.__setitem__(field, value[field] + amount)

def toggle(field):
    return lambda value: value.__setitem__(field, not value[field])

def change_vector(field, amount):
    def mutate(value):
        changed = list(value[field])
        changed[0] += amount
        value[field] = changed
    return mutate

def change_holdings(amount):
    def mutate(value):
        holdings = np.frombuffer(
            bytes.fromhex(value["terminal_holdings_sha256_input"]),
            dtype="<f8",
        ).copy()
        holdings[0] += amount
        value["terminal_holdings_sha256_input"] = holdings.astype("<f8").tobytes(order="C").hex()
    return mutate

mutations = {
    "terminal_status": lambda value: value.__setitem__("terminal_status", "hard_gate_failed"),
    "delta_equity": add("delta_equity", 1e-4),
    "terminal_equity": add("terminal_equity", 1e-4),
    "defaults": add("defaults", 1),
    "creditor_shortfall": add("creditor_shortfall", 1e-4),
    "price_drawdown_percentage_points": add("price_drawdown_percentage_points", 1e-4),
    "sale_quantity_asset_units": add("sale_quantity_asset_units", 1e-4),
    "rounds": add("rounds", 1),
    "converged": toggle("converged"),
    "funding_triggered": toggle("funding_triggered"),
    "funding_call_executed": toggle("funding_call_executed"),
    "funding_call_count": add("funding_call_count", 1),
    "price_floor_hit": toggle("price_floor_hit"),
    "max_price_change": add("max_price_change", 1e-4),
    "max_required_sale_fraction": add("max_required_sale_fraction", 1e-4),
    "max_sale_identity_residual_currency": add("max_sale_identity_residual_currency", 1e-4),
    "max_balance_identity_residual_currency": add("max_balance_identity_residual_currency", 1e-4),
    "terminal_prices": change_vector("terminal_prices", 1e-4),
    "terminal_liabilities": change_vector("terminal_liabilities", 1e-4),
    "terminal_holdings_sha256": change_holdings(1e-4),
}

clean = {}
for cell in ("base", "eta-zero", "overlap-high", "funding-on"):
    result = worker.simulate(request(cell))
    clean[cell] = result["checks"]["independent_evaluator_agreement"]

mutants = {name: execute_with(mutation) for name, mutation in mutations.items()}
within_tolerance = execute_with(change_holdings(5e-11))
print(json.dumps({
    "clean": clean,
    "mutants": mutants,
    "within_tolerance": within_tolerance,
}, sort_keys=True))
`;

function runMutantMatrix() {
  return JSON.parse(runFixture019Python(["-B", "-c", mutantMatrixSource]));
}

test("independent evaluator agreement covers every terminal endpoint and fails closed on mutants", () => {
  const result = runMutantMatrix();
  assert.deepEqual(result.clean, {
    base: true,
    "eta-zero": true,
    "funding-on": true,
    "overlap-high": true,
  });
  for (const [endpoint, outcome] of Object.entries(result.mutants)) {
    assert.equal(outcome.agreement, false, `${endpoint} mutant escaped evaluator agreement`);
    assert.equal(outcome.terminal_status, "hard_gate_failed", `${endpoint} mutant did not close the gate`);
  }
  assert.deepEqual(result.within_tolerance, {
    agreement: true,
    terminal_status: "ok",
  });
});
