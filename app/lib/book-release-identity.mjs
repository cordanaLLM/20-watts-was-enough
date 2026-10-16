import { continuousSiteEdition, publication } from "./publication.mjs";
import { normalizePublicationSourceRevision } from "./publication-revision.mjs";

const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const sourceRefPattern = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.(0|[1-9][0-9]*))?$/u;
const pdfRendererHostnames = new Set(["127.0.0.1", "[::1]", "localhost"]);

/** @typedef {"github-pages" | "public-pdf"} BookSurface */

/**
 * @param {string} sourceRef
 */
export function assertBookSourceRef(sourceRef) {
  if (typeof sourceRef !== "string" || sourceRef.length > 32 || (sourceRef !== "main" && sourceRefPattern.exec(sourceRef)?.[0] !== sourceRef)) {
    throw new Error(`Book source ref must be main or vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-rc.N: ${JSON.stringify(sourceRef)}`);
  }
  return sourceRef;
}

/**
 * @param {string} sourceRef
 * @param {string} editionVersion
 */
export function assertBookSourceRefForVersion(sourceRef, editionVersion) {
  if (typeof editionVersion !== "string" || editionVersion.length > 31 || !semanticVersionPattern.test(editionVersion)) {
    throw new Error(`Book edition version must be SemVer: ${JSON.stringify(editionVersion)}`);
  }
  const validRef = assertBookSourceRef(sourceRef);
  if (validRef !== "main" && validRef.split("-", 1)[0] !== `v${editionVersion}`) {
    throw new Error(`Book source ref ${JSON.stringify(validRef)} does not match edition version ${JSON.stringify(editionVersion)}.`);
  }
  return validRef;
}

/**
 * @param {BookSurface} surface
 * @param {string} sourceRef
 * @param {string} editionVersion
 */
export function repositoryRefForSurface(surface, sourceRef, editionVersion) {
  const validRef = assertBookSourceRefForVersion(sourceRef, editionVersion);
  if (surface !== "github-pages" && surface !== "public-pdf") {
    throw new Error(`Book surface is not supported: ${JSON.stringify(surface)}`);
  }
  return surface === "public-pdf" ? validRef : "main";
}

/**
 * The query-selected PDF surface is a local renderer input, not a public mode.
 * @param {{ hostname: string, search: string }} location
 * @returns {BookSurface}
 */
export function bookSurfaceFromLocation(location) {
  const parameters = new URLSearchParams(location.search);
  return parameters.get("pdf") === "1" && pdfRendererHostnames.has(location.hostname)
    ? "public-pdf"
    : "github-pages";
}

/**
 * @param {{
 *   surface: BookSurface,
 *   sourceRef: string,
 *   editionVersion: string,
 *   sourceRevision?: string | null,
 * }} input
 */
export function bookEditionIdentity(input) {
  const repositoryRef = repositoryRefForSurface(
    input.surface,
    input.sourceRef,
    input.editionVersion,
  );
  const sourceRevision = normalizePublicationSourceRevision(input.sourceRevision);
  const isReleaseSnapshot = input.surface === "public-pdf" && repositoryRef !== "main";
  if (isReleaseSnapshot && !sourceRevision) {
    throw new Error("A release book requires the exact source commit as well as its immutable tag.");
  }
  let edition = `PDF v${input.editionVersion} · main snapshot`;
  if (input.surface === "github-pages") {
    edition = continuousSiteEdition(input.editionVersion);
  } else if (isReleaseSnapshot) {
    edition = `Release ${repositoryRef} · immutable snapshot`;
  }
  return Object.freeze({
    repositoryRef,
    repositoryLinkRef: sourceRevision ?? repositoryRef,
    sourceRevision,
    edition,
    sourceLabel: isReleaseSnapshot ? `Immutable release tag ${repositoryRef}` : "Git main snapshot",
    isReleaseSnapshot,
  });
}

/** @param {string} ref */
export function repositoryTreeHref(ref) {
  return `${publication.repository}/tree/${encodeURIComponent(ref)}`;
}

/**
 * @param {string} ref
 * @param {string} path
 * @param {string} [hash]
 */
export function repositoryDocumentHref(ref, path, hash = "") {
  const encodedPath = path
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `${publication.repository}/blob/${encodeURIComponent(ref)}/${encodedPath}${hash ? `#${encodeURIComponent(hash)}` : ""}`;
}

/** @param {string} ref */
export const repositoryDocumentHrefFor = (ref) => (path, hash = "") =>
  repositoryDocumentHref(ref, path, hash);
