// Iterative canonical JSON: sorted object keys, no whitespace. One walker
// replaces the per-module recursive copies; output bytes match them exactly.

export const MAXIMUM_CANONICAL_DEPTH = 4096;
export const MAXIMUM_CANONICAL_STEPS = 2 ** 26;

function strictLeaf(value, label) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} canonicalization rejects non-finite numbers.`);
    return JSON.stringify(value);
  }
  throw new TypeError(`${label} canonicalization rejects ${typeof value}.`);
}

function pushContainer(stack, value, depth, label) {
  if (depth >= MAXIMUM_CANONICAL_DEPTH) {
    throw new RangeError(`${label} canonicalization exceeds nesting depth ${MAXIMUM_CANONICAL_DEPTH}.`);
  }
  if (Array.isArray(value)) {
    stack.push("]");
    for (let index = value.length - 1; index >= 0; index -= 1) {
      stack.push({ value: value[index], depth: depth + 1, inArray: true });
      if (index > 0) stack.push(",");
    }
    stack.push("[");
    return;
  }
  const keys = Object.keys(value).sort();
  stack.push("}");
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    stack.push({ value: value[keys[index]], depth: depth + 1, key: keys[index] });
    stack.push(`${JSON.stringify(keys[index])}:`);
    if (index > 0) stack.push(",");
  }
  stack.push("{");
}

/**
 * Canonical JSON text of `root`.
 *
 * strict: true rejects non-finite numbers, undefined fields and non-JSON types
 * with `${label} canonicalization rejects ...` errors. strict: false keeps the
 * JSON.stringify fallback of the loose copies, including their text for
 * undefined leaves ("" in arrays, "undefined" in objects).
 */
export function canonicalJson(root, { strict = true, label = "JSON" } = {}) {
  const chunks = [];
  const stack = [{ value: root, depth: 0 }];
  for (let steps = 0; stack.length > 0; steps += 1) {
    if (steps >= MAXIMUM_CANONICAL_STEPS) {
      throw new RangeError(`${label} canonicalization exceeds ${MAXIMUM_CANONICAL_STEPS} steps.`);
    }
    const item = stack.pop();
    if (typeof item === "string") {
      chunks.push(item);
      continue;
    }
    const { value, depth, key, inArray } = item;
    if (strict && key !== undefined && value === undefined) {
      throw new TypeError(`${label} canonicalization rejects undefined at ${key}.`);
    }
    if (value && typeof value === "object") {
      pushContainer(stack, value, depth, label);
    } else if (strict) {
      chunks.push(strictLeaf(value, label));
    } else {
      const text = JSON.stringify(value);
      chunks.push(text === undefined && inArray ? "" : String(text));
    }
  }
  return chunks.join("");
}
