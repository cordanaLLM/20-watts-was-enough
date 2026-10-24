import {
  FIXTURE_022_CORRUPTION_FAMILIES,
  canonical,
  sha256,
} from "./contract.mjs";
import { exactKeys } from "../lib/exact-keys.mjs";
import { Pcg64Dxsm } from "../lib/pcg64-dxsm.mjs";

export { Pcg64Dxsm };

export const FIXTURE_022_GENERATOR_VERSION = "fixture-022.dev-t01-grid-generator.v1";

export function validateFixture022Config(config) {
  const keys = [
    "schema",
    "artifact",
    "profile",
    "grid_width_nodes",
    "grid_height_nodes",
    "worlds_per_corruption_family",
    "wound_radius_min_nodes",
    "wound_radius_max_nodes",
    "max_solver_rounds",
    "bytes_per_message",
    "message_budget_per_arm_bytes",
    "memory_write_budget_per_arm",
    "common_mode_mismatch_threshold",
    "max_loss",
  ];
  const integers = [
    config?.grid_width_nodes,
    config?.grid_height_nodes,
    config?.worlds_per_corruption_family,
    config?.wound_radius_min_nodes,
    config?.wound_radius_max_nodes,
    config?.max_solver_rounds,
    config?.bytes_per_message,
    config?.message_budget_per_arm_bytes,
    config?.memory_write_budget_per_arm,
  ];
  if (
    !exactKeys(config, keys)
    || config.schema !== 1
    || config.artifact !== "fixture-022"
    || !new Set(["smoke", "development"]).has(config.profile)
    || integers.some((value) => !Number.isSafeInteger(value) || value < 1)
    || config.grid_width_nodes < 8
    || config.grid_height_nodes < 8
    || config.worlds_per_corruption_family > 8
    || config.wound_radius_max_nodes < config.wound_radius_min_nodes
    || config.wound_radius_max_nodes * 2 >= Math.min(config.grid_width_nodes, config.grid_height_nodes)
    || config.memory_write_budget_per_arm < config.grid_width_nodes * config.grid_height_nodes
    || !Number.isFinite(config.common_mode_mismatch_threshold)
    || config.common_mode_mismatch_threshold <= 0
    || config.common_mode_mismatch_threshold >= 1
    || config.max_loss !== 100
  ) throw new Error("Fixture 022 configuration is invalid.");
  return config;
}

function neighbors(id, width, height) {
  const x = id % width;
  const y = Math.floor(id / width);
  const values = [];
  if (y > 0) values.push(id - width);
  if (x > 0) values.push(id - 1);
  if (x + 1 < width) values.push(id + 1);
  if (y + 1 < height) values.push(id + width);
  return values;
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = random.integer(0, index);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function connectedPatch(survivorIds, targetSize, width, height, random) {
  const survivors = new Set(survivorIds);
  const start = survivorIds[random.integer(0, survivorIds.length - 1)];
  const queue = [start];
  const queued = new Set(queue);
  const result = [];
  while (queue.length > 0 && result.length < targetSize) {
    const current = queue.shift();
    result.push(current);
    const candidates = neighbors(current, width, height)
      .filter((id) => survivors.has(id) && !queued.has(id));
    for (const id of shuffled(candidates, random)) {
      queued.add(id);
      queue.push(id);
    }
  }
  if (result.length !== targetSize) throw new Error("Fixture 022 could not construct its connected corruption patch.");
  return new Set(result);
}

function targetRole(x, y, boundaryX, boundaryY) {
  return (x >= boundaryX ? 1 : 0) + (y >= boundaryY ? 2 : 0);
}

function generateWorld({ seed, worldIndex, corruptionFamily, config, random }) {
  const width = config.grid_width_nodes;
  const height = config.grid_height_nodes;
  const boundaryX = Math.max(1, Math.min(width - 1, Math.floor(random.range(0.35, 0.65) * width)));
  const boundaryY = Math.max(1, Math.min(height - 1, Math.floor(random.range(0.35, 0.65) * height)));
  const radius = random.integer(config.wound_radius_min_nodes, config.wound_radius_max_nodes);
  const woundX = random.integer(radius, width - radius - 1);
  const woundY = random.integer(radius, height - radius - 1);
  const count = width * height;
  const targetRoles = new Array(count);
  const wounded = new Set();
  for (let id = 0; id < count; id += 1) {
    const x = id % width;
    const y = Math.floor(id / width);
    targetRoles[id] = targetRole(x, y, boundaryX, boundaryY);
    if ((x - woundX) ** 2 + (y - woundY) ** 2 <= radius ** 2) wounded.add(id);
  }
  if (wounded.size < 1 || wounded.size >= count) throw new Error("Fixture 022 generated an invalid wound.");
  const survivorIds = [];
  for (let id = 0; id < count; id += 1) if (!wounded.has(id)) survivorIds.push(id);
  const memoryRoles = [...targetRoles];
  if (corruptionFamily === "independent-permutation") {
    const selected = shuffled(survivorIds, random).slice(0, Math.ceil(0.1 * survivorIds.length));
    for (const id of selected) memoryRoles[id] = (targetRoles[id] + random.integer(1, 3)) % 4;
  } else if (corruptionFamily === "local-patch-shift") {
    const patch = connectedPatch(
      survivorIds,
      Math.ceil(0.2 * survivorIds.length),
      width,
      height,
      random,
    );
    for (const id of patch) memoryRoles[id] = (targetRoles[id] + 1) % 4;
  } else if (corruptionFamily === "common-mode-shift") {
    for (const id of survivorIds) memoryRoles[id] = (targetRoles[id] + 1) % 4;
  }
  const nodes = [];
  for (let id = 0; id < count; id += 1) {
    const isWounded = wounded.has(id);
    nodes.push(Object.freeze({
      id,
      neighbors: Object.freeze(neighbors(id, width, height)),
      wounded: isWounded,
      observed_role: isWounded ? null : targetRoles[id],
      memory_role: isWounded ? null : memoryRoles[id],
    }));
  }
  const world = {
    seed,
    world_index: worldIndex,
    world_id: `${seed}:${worldIndex}`,
    corruption_family: corruptionFamily,
    width_nodes: width,
    height_nodes: height,
    nodes: Object.freeze(nodes),
    target_roles: Object.freeze(targetRoles),
  };
  return Object.freeze({
    ...world,
    observation_sha256: sha256(canonical(visibleFixture022Observation(world))),
  });
}

export function visibleFixture022Observation(world) {
  return {
    schema: 1,
    artifact: "fixture-022",
    track: "DEV-T01",
    world_id: world.world_id,
    width_nodes: world.width_nodes,
    height_nodes: world.height_nodes,
    nodes: world.nodes.map((node) => ({
      id: node.id,
      neighbors: node.neighbors,
      wounded: node.wounded,
      observed_role: node.observed_role,
      memory_role: node.memory_role,
    })),
  };
}

export function generateFixture022Worlds({ seed, config }) {
  validateFixture022Config(config);
  if (!Number.isSafeInteger(seed) || seed < 1516001 || seed > 1516064) {
    throw new Error("Fixture 022 seed must be one of the registered public DEV-T01 seeds.");
  }
  const random = new Pcg64Dxsm(seed);
  const worlds = [];
  let worldIndex = 0;
  for (const family of FIXTURE_022_CORRUPTION_FAMILIES) {
    for (let replicate = 0; replicate < config.worlds_per_corruption_family; replicate += 1) {
      worlds.push(generateWorld({
        seed,
        worldIndex,
        corruptionFamily: family,
        config,
        random,
      }));
      worldIndex += 1;
    }
  }
  return Object.freeze(worlds);
}
