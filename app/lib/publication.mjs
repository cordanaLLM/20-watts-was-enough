export const publication = Object.freeze({
  canonicalSite: "https://www.cordana.dev/",
  repository: "https://github.com/cordanaLLM/20-watts-was-enough",
  siteName: "20 Watts Was Enough",
  locale: "en-GB",
  htmlLanguage: "en",
  proseLicense: "https://creativecommons.org/licenses/by-sa/4.0/",
  citationPath: "CITATION.cff",
  licensingPath: "LICENSING.md",
  bookPath: "book/",
  bookPdfPath: "downloads/20-watts-was-enough-full-concept-book.pdf",
  imagePath: "og-v2.jpg",
  imageAlt: "Biological branching, neural connectivity and computational structures joined in one system diagram.",
  portalDescription: "Explore the living concept, evidence, experiments and mathematics behind 20 Watts Was Enough: a biologically inspired R&D blueprint for sparse, grounded, continual, energy-efficient AI.",
});

export const maximumIssueFormLocatorLength = 1024;

function hasWellFormedUriText(value) {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build one bounded issue-form input value without normalising or truncating
 * any part of the research-object identity.
 *
 * @param {string[]} fields
 */
export function issueFormLocator(fields) {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 8) {
    throw new Error("Issue-form locator must contain between one and eight fields.");
  }
  if (fields.some((field) => (
    typeof field !== "string"
    || field.length === 0
    || field.trim() !== field
    || !hasWellFormedUriText(field)
    || [...field].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32
        || (codePoint >= 127 && codePoint <= 159)
        || codePoint === 0x2028
        || codePoint === 0x2029;
    })
  ))) {
    throw new Error("Issue-form locator fields must be non-empty, URI-safe single-line text without control characters.");
  }
  const locator = fields.join("; ");
  if (locator.length > maximumIssueFormLocatorLength) {
    throw new Error(
      `Issue-form locator exceeds the ${maximumIssueFormLocatorLength}-character field bound.`,
    );
  }
  return locator;
}

export function continuousSiteEdition(editionVersion) {
  return `Site v${editionVersion} · continuous main snapshot`;
}

export function repositoryIssueUrl(template, title, fields = {}) {
  const issue = new URL(`${publication.repository}/issues/new`);
  issue.searchParams.set("template", template);
  issue.searchParams.set("title", title);
  for (const [field, value] of Object.entries(fields)) {
    issue.searchParams.set(field, value);
  }
  return issue.toString();
}
