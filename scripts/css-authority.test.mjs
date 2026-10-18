import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inventoryStylesheet,
  normalizedMediaScope,
  validateCssAuthority,
  validateCssEntryImports,
} from "./lib/css-authority.mjs";

const [globalSource, portalSource] = await Promise.all([
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/portal.css", import.meta.url), "utf8"),
]);

test("the checked-in publication CSS has one bounded authority", () => {
  const result = validateCssAuthority({ globalSource, portalSource });

  assert.deepEqual(result.errors, []);
  assert.equal(result.portal.duplicates.length, 0);
  assert.ok(result.global.lineCount <= 2_500);
  assert.equal(result.portal.mediaScopes["(max-width: 700px)"], 1);
  assert.deepEqual(result.portal.mediaOrder, [
    "screen",
    "(max-width: 1180px)",
    "(max-width: 1080px)",
    "(max-width: 880px)",
    "(max-width: 760px)",
    "(max-width: 700px)",
    "(max-width: 620px)",
    "(max-width: 460px)",
  ]);
});

test("same-scope grouped and individual selectors are deterministic duplicates", () => {
  const inventory = inventoryStylesheet(`
@media screen and (max-width: 700px) {
  .reader, .toolbar { color: black; }
}
@media (max-width: 700px) {
  .reader { color: white; }
}
`, "fixture.css");

  assert.equal(inventory.duplicates.length, 1);
  assert.equal(inventory.duplicates[0].selector, ".reader");
  assert.equal(inventory.duplicates[0].scope, "@media (max-width: 700px)");
  assert.deepEqual(inventory.duplicates[0].locations.map(({ line }) => line), [3, 6]);
});

test("different breakpoints and state selectors remain separate", () => {
  const inventory = inventoryStylesheet(`
@media screen { .reader { color: black; } }
@media screen and (max-width: 700px) { .reader { color: white; } }
@media screen { .reader:hover { color: green; } }
`, "fixture.css");

  assert.equal(inventory.duplicates.length, 0);
  assert.equal(inventory.selectorCount, 3);
  assert.equal(inventory.uniqueScopedSelectorCount, 3);
  assert.equal(normalizedMediaScope("only screen and   (max-width: 700px)"), "(max-width: 700px)");
});

test("publication entries require each stylesheet once and in authority order", () => {
  const contracts = [
    {
      entry: "pagesEntry",
      globalImport: 'import "../app/globals.css";',
      name: "github-pages/main.tsx",
      portalImport: 'import "../app/portal.css";',
    },
    {
      entry: "helpEntry",
      globalImport: '@import "../app/globals.css";',
      name: "github-pages/help.css",
      portalImport: '@import "../app/portal.css";',
    },
  ];
  const validEntries = Object.fromEntries(contracts.map(({ entry, globalImport, portalImport }) => (
    [entry, `${globalImport}\n${portalImport}\n`]
  )));

  assert.deepEqual(validateCssEntryImports(validEntries), []);
  for (const { entry, globalImport, name, portalImport } of contracts) {
    const otherEntry = entry === "pagesEntry" ? "helpEntry" : "pagesEntry";
    const cases = [
      {
        expected: `${name} must load app/globals.css exactly once; found 0.`,
        source: `${portalImport}\n`,
      },
      {
        expected: `${name} must load app/portal.css exactly once; found 0.`,
        source: `${globalImport}\n`,
      },
      {
        expected: `${name} must load app/globals.css exactly once; found 2.`,
        source: `${globalImport}\n${globalImport}\n${portalImport}\n`,
      },
      {
        expected: `${name} must load app/portal.css exactly once; found 2.`,
        source: `${globalImport}\n${portalImport}\n${portalImport}\n`,
      },
      {
        expected: `${name} must load app/globals.css before app/portal.css.`,
        source: `${portalImport}\n${globalImport}\n`,
      },
    ];
    for (const fixture of cases) {
      const errors = validateCssEntryImports({
        [entry]: fixture.source,
        [otherEntry]: validEntries[otherEntry],
      });
      assert.ok(errors.includes(fixture.expected), fixture.expected);
    }
  }
});

test("help stylesheet imports count only real top-level CSS at-rules", () => {
  const portalImport = '@import "../app/portal.css";';
  const pagesEntry = 'import "../app/globals.css";\nimport "../app/portal.css";\n';
  const cases = [
    {
      expected: "github-pages/help.css must load app/globals.css exactly once; found 0.",
      source: `/*\n@import "../app/globals.css";\n*/\n${portalImport}\n`,
    },
    {
      expected: "github-pages/help.css must load app/globals.css exactly once; found 0.",
      source: `@media print {\n@import "../app/globals.css";\n}\n${portalImport}\n`,
    },
    {
      expected: "github-pages/help.css must load app/globals.css before app/portal.css.",
      source: `${portalImport} @import '../app/globals.css';\n`,
    },
  ];

  assert.deepEqual(validateCssEntryImports({
    helpEntry: `@import '../app/globals.css'; ${portalImport}\n`,
    pagesEntry,
  }), []);
  for (const fixture of cases) {
    const errors = validateCssEntryImports({ helpEntry: fixture.source, pagesEntry });
    assert.ok(errors.includes(fixture.expected), fixture.expected);
  }
});

test("authority validation rejects selector leaks, duplication, and missing measures", () => {
  const duplicatePortal = `${portalSource}\n@media screen { .portal-shell { color: red; } }\n`;
  const duplicate = validateCssAuthority({ globalSource, portalSource: duplicatePortal });
  const leaked = validateCssAuthority({
    globalSource: `${globalSource}\n.portal-leak { color: red; }\n`,
    portalSource,
  });
  const missingMeasure = validateCssAuthority({
    globalSource,
    portalSource: portalSource.replace("--reading-measure: 68ch;", "--measure-removed: 68ch;"),
  });

  assert.match(duplicate.errors.join("\n"), /Duplicate publication selector \.portal-shell/u);
  assert.match(leaked.errors.join("\n"), /Publication selector \.portal-leak remains outside/u);
  assert.match(missingMeasure.errors.join("\n"), /\.portal-reader must keep --reading-measure/u);
});

test("authority validation rejects a fixed-height document canvas", () => {
  const fixedCanvas = validateCssAuthority({
    globalSource: globalSource.replace(
      "html,\nbody {\n  min-height: 100%;",
      "html,\nbody {\n  height: 100%;",
    ),
    portalSource,
  });

  assert.match(fixedCanvas.errors.join("\n"), /html must not fix the screen document canvas height/u);
  assert.match(fixedCanvas.errors.join("\n"), /body must keep one root min-height: 100%/u);

  const printCanvas = inventoryStylesheet(globalSource, "app/globals.css").root;
  const printMinimumHeights = [];
  printCanvas.walkRules((rule) => {
    if (rule.parent.type !== "atrule" || rule.parent.name !== "media"
        || normalizedMediaScope(rule.parent.params) !== "print") return;
    if (!["html", "body"].every((selector) => rule.selectors.includes(selector))) return;
    rule.walkDecls("min-height", (declaration) => printMinimumHeights.push(declaration));
  });
  assert.equal(printMinimumHeights.length, 1, "the tamper removes the shared print canvas minimum height");
  printMinimumHeights[0].remove();
  const fixedPrintCanvas = validateCssAuthority({
    globalSource: printCanvas.toString(),
    portalSource,
  });
  assert.match(fixedPrintCanvas.errors.join("\n"), /html must reset min-height to auto for print/u);
  assert.match(fixedPrintCanvas.errors.join("\n"), /body must reset min-height to auto for print/u);
});

test("authority validation admits only the exact shared skip-link selectors", () => {
  const exactSharedSelectors = `
html, body { min-height: 100%; }
.portal-skip-link { inset: 0; }
.portal-skip-link:focus { inset: auto; }
.prose { line-height: 1.5; }
.prose > p { max-width: 80ch; }
@media print { html, body { min-height: auto; } }
`;
  const exact = validateCssAuthority({
    globalSource: exactSharedSelectors,
    portalSource,
  });
  const hostile = validateCssAuthority({
    globalSource: `${exactSharedSelectors}\n.portal-skip-link + .portal-reader { color: red; }\n`,
    portalSource,
  });

  assert.deepEqual(exact.errors, []);
  assert.match(
    hostile.errors.join("\n"),
    /Publication selector \.portal-skip-link \+ \.portal-reader remains outside/u,
  );
});

test("authority validation rejects a reordered responsive family", () => {
  const reorderedPortal = portalSource.replace(
    /(@media screen and \(max-width: 1180px\)[\s\S]*?)(@media screen and \(max-width: 1080px\)[\s\S]*?)(?=@media screen and \(max-width: 880px\))/u,
    "$2$1",
  );
  const reordered = validateCssAuthority({ globalSource, portalSource: reorderedPortal });

  assert.match(reordered.errors.join("\n"), /media blocks must follow the owned order/u);
});

test("malformed and unbounded CSS fails closed", () => {
  assert.throws(() => inventoryStylesheet(".reader {", "broken.css"), /Unclosed block/u);
  assert.throws(
    () => inventoryStylesheet(`/*${"x".repeat(1_500_001)}*/`, "huge.css"),
    /exceeds the 1500000-byte CSS audit bound/u,
  );
});
