import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDisplayEquationTags,
  tagDisplayEquationsForPrint,
} from "./book-print-equation-tags.mjs";

function display(tex) {
  const attributes = new Map([["tabindex", "0"]]);
  return {
    attributes,
    querySelector: (selector) => {
      assert.equal(selector, 'annotation[encoding="application/x-tex"]');
      return tex === undefined ? null : { textContent: tex };
    },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
}

function page(displays) {
  return {
    querySelectorAll: (selector) => {
      assert.equal(selector, ".katex-display");
      return displays;
    },
  };
}

test("every display equation becomes an image labelled with its TeX source", () => {
  const displays = [display(" E = mc^2 "), display("\\mathcal U_i(t)")];
  const result = tagDisplayEquationsForPrint(page(displays));
  assert.deepEqual(result, { displays: 2, labelled: 2, missing: [] });
  assert.equal(displays[0].attributes.get("role"), "img");
  assert.equal(displays[0].attributes.get("aria-label"), "E = mc^2");
  assert.equal(displays[1].attributes.get("aria-label"), "\\mathcal U_i(t)");
  assert.equal(assertDisplayEquationTags(result), result);
});

test("the print handler cannot remove the label but still removes other attributes", () => {
  const equation = display("a+b");
  tagDisplayEquationsForPrint(page([equation]));
  for (const name of ["role", "aria-label", "ARIA-LABEL", "tabindex"]) equation.removeAttribute(name);
  assert.deepEqual([...equation.attributes].sort(), [["aria-label", "a+b"], ["role", "img"]]);
});

test("a display without TeX source refuses and leaves every display untouched", () => {
  const displays = [display("x"), display(undefined), display("   ")];
  const removers = displays.map((node) => node.removeAttribute);
  const result = tagDisplayEquationsForPrint(page(displays));
  assert.deepEqual(result, { displays: 3, labelled: 0, missing: [1, 2] });
  assert.ok(displays.every(({ attributes }) => attributes.size === 1));
  assert.ok(displays.every((node, index) => node.removeAttribute === removers[index]));
  assert.throws(() => assertDisplayEquationTags(result), /could not be tagged/u);
});

test("a page without display equations refuses", () => {
  const result = tagDisplayEquationsForPrint(page([]));
  assert.deepEqual(result, { displays: 0, labelled: 0, missing: [] });
  assert.throws(() => assertDisplayEquationTags(result), /could not be tagged/u);
  assert.throws(() => assertDisplayEquationTags(undefined), /could not be tagged/u);
});
