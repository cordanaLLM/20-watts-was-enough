import postcss from "postcss";

const maximumStylesheetBytes = 1_500_000;
const publicationSelectorPattern = /(?:\.portal-|#portal-|#research-system\b|#library\b|\.help-)/u;
const sharedPortalSelectors = new Set([
  ".portal-skip-link",
  ".portal-skip-link:focus",
]);
const ownerMarker = "Public research publication: one selector and breakpoint authority.";
const obsoleteMarkers = [
  "Public research portal foundations",
  "Portal screen foundations",
  "Research-publication pass",
  "Screen reading pass",
];
const expectedScreenScopes = [
  "screen",
  "(max-width: 1180px)",
  "(max-width: 1080px)",
  "(max-width: 880px)",
  "(max-width: 760px)",
  "(max-width: 700px)",
  "(max-width: 620px)",
  "(max-width: 460px)",
];
const stylesheetEntryContracts = [
  {
    globalPattern: /^\s*import\s+(["'])\.\.\/app\/globals\.css\1;?\s*$/gmu,
    name: "github-pages/main.tsx",
    portalPattern: /^\s*import\s+(["'])\.\.\/app\/portal\.css\1;?\s*$/gmu,
    sourceKey: "pagesEntry",
  },
  {
    globalImport: "../app/globals.css",
    name: "github-pages/help.css",
    portalImport: "../app/portal.css",
    sourceKey: "helpEntry",
  },
];

function normalizedWhitespace(value) {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizedMediaScope(parameters) {
  const normalized = normalizedWhitespace(parameters).toLowerCase();
  return normalized.replace(/^(?:only )?screen and /u, "");
}

function ruleScope(rule) {
  const scopes = [];
  for (let parent = rule.parent; parent && parent.type !== "root"; parent = parent.parent) {
    if (parent.type === "atrule") {
      const parameters = parent.name === "media"
        ? normalizedMediaScope(parent.params)
        : normalizedWhitespace(parent.params);
      scopes.unshift(`@${parent.name} ${parameters}`.trim());
    }
  }
  return scopes.join(" > ") || "root";
}

function parseStylesheet(source, from) {
  if (Buffer.byteLength(source, "utf8") > maximumStylesheetBytes) {
    throw new Error(`${from} exceeds the ${maximumStylesheetBytes}-byte CSS audit bound.`);
  }
  return postcss.parse(source, { from });
}

// Stylesheet entries are parsed, so comments and nested at-rules, which a
// browser never loads as imports, do not count; script entries stay regex-matched.
function stylesheetImportMatches(source, contract, path) {
  const root = parseStylesheet(source, contract.name);
  return root.nodes.flatMap((node, index) => {
    if (node.type !== "atrule" || node.name !== "import") {
      return [];
    }
    const quoted = /^(["'])(.*)\1$/u.exec(node.params.trim());
    return quoted?.[2] === path ? [{ index }] : [];
  });
}

function entryImportMatches(source, contract) {
  if (contract.globalPattern) {
    return [
      [...source.matchAll(contract.globalPattern)],
      [...source.matchAll(contract.portalPattern)],
    ];
  }
  return [
    stylesheetImportMatches(source, contract, contract.globalImport),
    stylesheetImportMatches(source, contract, contract.portalImport),
  ];
}

function entryImportErrors(source, contract) {
  const [globalMatches, portalMatches] = entryImportMatches(source, contract);
  const errors = [];

  if (globalMatches.length !== 1) {
    errors.push(
      `${contract.name} must load app/globals.css exactly once; found ${globalMatches.length}.`,
    );
  }
  if (portalMatches.length !== 1) {
    errors.push(
      `${contract.name} must load app/portal.css exactly once; found ${portalMatches.length}.`,
    );
  }
  if (
    globalMatches.length === 1
    && portalMatches.length === 1
    && globalMatches[0].index > portalMatches[0].index
  ) {
    errors.push(`${contract.name} must load app/globals.css before app/portal.css.`);
  }
  return errors;
}

export function validateCssEntryImports(entries) {
  return stylesheetEntryContracts.flatMap((contract) => (
    entryImportErrors(entries[contract.sourceKey], contract)
  ));
}

export function inventoryStylesheet(source, from = "<stylesheet>") {
  const root = parseStylesheet(source, from);
  const occurrences = new Map();
  const mediaScopes = new Map();
  const mediaOrder = [];
  let ruleCount = 0;
  let selectorCount = 0;

  root.walkAtRules("media", (atRule) => {
    const scope = normalizedMediaScope(atRule.params);
    mediaOrder.push(scope);
    mediaScopes.set(scope, (mediaScopes.get(scope) ?? 0) + 1);
  });
  root.walkRules((rule) => {
    ruleCount += 1;
    for (const selector of rule.selectors) {
      selectorCount += 1;
      const normalizedSelector = normalizedWhitespace(selector);
      const scope = ruleScope(rule);
      const key = `${scope}\u0000${normalizedSelector}`;
      const locations = occurrences.get(key) ?? [];
      locations.push({
        column: rule.source?.start?.column ?? 0,
        line: rule.source?.start?.line ?? 0,
        scope,
        selector: normalizedSelector,
      });
      occurrences.set(key, locations);
    }
  });

  const duplicates = [...occurrences.values()]
    .filter((locations) => locations.length > 1)
    .map((locations) => ({
      locations: locations.map(({ column, line }) => ({ column, line })),
      scope: locations[0].scope,
      selector: locations[0].selector,
    }))
    .sort((left, right) => (
      left.scope.localeCompare(right.scope) || left.selector.localeCompare(right.selector)
    ));

  const lineCount = source.length === 0
    ? 0
    : source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
  return {
    duplicates,
    lineCount,
    mediaOrder,
    mediaScopes: Object.fromEntries([...mediaScopes].sort(([left], [right]) => (
      left.localeCompare(right, undefined, { numeric: true })
    ))),
    root,
    ruleCount,
    selectorCount,
    uniqueScopedSelectorCount: occurrences.size,
  };
}

function declarationsForSelector(root, selector, property) {
  const matches = [];
  root.walkRules((rule) => {
    if (!rule.selectors.map(normalizedWhitespace).includes(selector)) return;
    rule.walkDecls(property, (declaration) => matches.push(declaration));
  });
  return matches;
}

function declarationsForSelectorAtScope(root, selector, property, scope) {
  const matches = [];
  root.walkRules((rule) => {
    if (ruleScope(rule) !== scope) return;
    if (!rule.selectors.map(normalizedWhitespace).includes(selector)) return;
    rule.walkDecls(property, (declaration) => matches.push(declaration));
  });
  return matches;
}

function requireExpandingDocumentCanvas(errors, root) {
  for (const selector of ["html", "body"]) {
    const fixedHeights = declarationsForSelectorAtScope(root, selector, "height", "root");
    const minimumHeights = declarationsForSelectorAtScope(root, selector, "min-height", "root");
    const printMinimumHeights = declarationsForSelectorAtScope(
      root,
      selector,
      "min-height",
      "@media print",
    );
    if (fixedHeights.length > 0) {
      errors.push(`${selector} must not fix the screen document canvas height.`);
    }
    if (
      minimumHeights.length !== 1
      || normalizedWhitespace(minimumHeights[0].value) !== "100%"
    ) {
      errors.push(`${selector} must keep one root min-height: 100% declaration.`);
    }
    if (
      printMinimumHeights.length !== 1
      || normalizedWhitespace(printMinimumHeights[0].value) !== "auto"
    ) {
      errors.push(`${selector} must reset min-height to auto for print.`);
    }
  }
}

function requireBoundedCh(errors, root, selector, property, maximum) {
  const declarations = declarationsForSelector(root, selector, property);
  const values = declarations.map(({ value }) => value.match(/^([0-9]+(?:\.[0-9]+)?)ch$/u));
  if (values.length === 0 || values.some((match) => !match || Number(match[1]) > maximum)) {
    errors.push(`${selector} must keep ${property} at or below ${maximum}ch.`);
  }
}

function requireMinimumLeading(errors, root, selector, minimum) {
  const declarations = declarationsForSelector(root, selector, "line-height");
  const values = declarations.map(({ value }) => value.match(/^([0-9]+(?:\.[0-9]+)?)$/u));
  if (values.length === 0 || values.some((match) => !match || Number(match[1]) < minimum)) {
    errors.push(`${selector} must keep unitless line-height at or above ${minimum}.`);
  }
}

function requireOwnerMarkers(errors, globalSource, portalSource) {
  const markerCount = portalSource.split(ownerMarker).length - 1;
  if (markerCount !== 1) {
    errors.push(`app/portal.css must contain exactly one publication owner marker; found ${markerCount}.`);
  }
  for (const marker of obsoleteMarkers) {
    if (globalSource.includes(marker) || portalSource.includes(marker)) {
      errors.push(`Obsolete CSS layer marker remains: ${marker}.`);
    }
  }
}

function requireSelectorOwnership(errors, globalInventory, portalInventory) {
  if (portalInventory.duplicates.length > 0) {
    for (const duplicate of portalInventory.duplicates.slice(0, 12)) {
      const lines = duplicate.locations.map(({ line }) => line).join(", ");
      errors.push(
        `Duplicate publication selector ${duplicate.selector} in ${duplicate.scope} at app/portal.css:${lines}.`,
      );
    }
  }

  globalInventory.root.walkRules((rule) => {
    for (const selector of rule.selectors.map(normalizedWhitespace)) {
      if (publicationSelectorPattern.test(selector) && !sharedPortalSelectors.has(selector)) {
        errors.push(
          `Publication selector ${selector} remains outside app/portal.css at app/globals.css:${rule.source?.start?.line ?? 0}.`,
        );
      }
    }
  });
}

function requireMediaOwnership(errors, globalInventory, portalInventory) {
  for (const scope of expectedScreenScopes) {
    const count = portalInventory.mediaScopes[scope] ?? 0;
    if (count !== 1) {
      errors.push(`app/portal.css must contain one ${scope} media block; found ${count}.`);
    }
  }
  const unexpectedScopes = Object.keys(portalInventory.mediaScopes)
    .filter((scope) => !expectedScreenScopes.includes(scope));
  if (unexpectedScopes.length > 0) {
    errors.push(`app/portal.css has unowned media scopes: ${unexpectedScopes.join(", ")}.`);
  }
  if (
    portalInventory.mediaOrder.length !== expectedScreenScopes.length
    || portalInventory.mediaOrder.some((scope, index) => scope !== expectedScreenScopes[index])
  ) {
    errors.push(
      "app/portal.css media blocks must follow the owned order: "
        + `${expectedScreenScopes.join(", ")}.`,
    );
  }
  if ((globalInventory.mediaScopes.print ?? 0) !== 1) {
    errors.push("app/globals.css must retain exactly one print media block.");
  }
  if (globalInventory.lineCount > 2_500) {
    errors.push(
      `app/globals.css exceeds its 2,500-line ownership ceiling (${globalInventory.lineCount}).`,
    );
  }
}

export function validateCssAuthority({ globalSource, portalSource }) {
  const globalInventory = inventoryStylesheet(globalSource, "app/globals.css");
  const portalInventory = inventoryStylesheet(portalSource, "app/portal.css");
  const errors = [];

  requireOwnerMarkers(errors, globalSource, portalSource);
  requireSelectorOwnership(errors, globalInventory, portalInventory);
  requireMediaOwnership(errors, globalInventory, portalInventory);
  requireBoundedCh(errors, portalInventory.root, ".portal-reader", "--reading-measure", 80);
  requireBoundedCh(errors, portalInventory.root, ".help-intro > p:not(.portal-eyebrow)", "max-width", 80);
  requireBoundedCh(errors, portalInventory.root, ".help-page .help-prose > p", "max-width", 80);
  requireBoundedCh(errors, globalInventory.root, ".prose > p", "max-width", 80);
  requireMinimumLeading(errors, portalInventory.root, ".portal-prose", 1.5);
  requireMinimumLeading(errors, portalInventory.root, ".help-intro > p:not(.portal-eyebrow)", 1.5);
  requireMinimumLeading(errors, globalInventory.root, ".prose", 1.5);
  requireExpandingDocumentCanvas(errors, globalInventory.root);

  return {
    errors,
    global: globalInventory,
    portal: portalInventory,
  };
}

export { normalizedMediaScope, ownerMarker };
