"use client";

import { Fragment, useEffect, useRef } from "react";
import { bookDocuments as documents } from "../book-content";
import type { ResearchDocument } from "../research-document";
import {
  bookEditionIdentity,
  repositoryDocumentHrefFor,
  repositoryTreeHref,
} from "../lib/book-release-identity.mjs";
import {
  bookDocumentHeadingId,
  bookDocumentId,
} from "../lib/book-document-id.mjs";
import {
  isPublicRepositoryArtifact,
  isRepositoryArtifact,
  repositoryArtifactHref,
} from "../lib/repository-artifacts";
import {
  issueFormLocator,
  publication,
  repositoryIssueUrl,
} from "../lib/publication.mjs";
import { MarkdownDocument } from "./markdown-document";
import { LanguageAccess } from "./language-access";
import { ReadinessOverview } from "./readiness-overview";

const appendixPaths = ["research/field-coverage.md"];
const canonicalPublicSite = publication.canonicalSite;
const canonicalBookRoute = new URL(
  publication.bookPath,
  publication.canonicalSite,
).toString();

type BookEditionProps = {
  surface?: "github-pages" | "public-pdf";
  assetBasePath?: string;
  editionVersion: string;
  sourceRef: string;
  sourceRevision?: string | null;
};

function joinBasePath(basePath: string, path: string) {
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${base}${path.replace(/^\/+/, "")}`;
}

function useBookFragmentRestoration() {
  useEffect(() => {
    let frame = 0;
    const restoreFragment = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const target = window.location.hash.slice(1);
        if (target) window.document.getElementById(target)?.scrollIntoView();
      });
    };

    restoreFragment();
    window.addEventListener("hashchange", restoreFragment);
    return () => {
      window.removeEventListener("hashchange", restoreFragment);
      window.cancelAnimationFrame(frame);
    };
  }, []);
}

function navigateFromBook(
  path: string,
  hash: string,
  bookDocumentPaths: Set<string>,
  externalHref: (path: string, hash?: string) => string,
) {
  if (bookDocumentPaths.has(path)) {
    window.location.assign(
      hash ? `#${bookDocumentHeadingId(path, hash)}` : `#${bookDocumentId(path)}`,
    );
    return;
  }
  window.location.assign(externalHref(path, hash));
}

function BookDocumentArticle({
  document: researchDocument,
  navigate,
  internalHref,
  imageLoading,
  renderExternalImages,
  assetBasePath,
}: {
  document: ResearchDocument;
  navigate: (path: string, hash?: string) => void;
  internalHref: (path: string, hash: string) => string;
  imageLoading: "eager" | "lazy";
  renderExternalImages: boolean;
  assetBasePath: string;
}) {
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    for (const heading of article.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")) {
      const legacyId = heading.dataset.bookLegacyHeadingId ?? heading.id;
      heading.dataset.bookLegacyHeadingId = legacyId;
      heading.id = bookDocumentHeadingId(researchDocument.path, legacyId);
    }
  }, [researchDocument.body, researchDocument.path]);

  return (
    <article className="prose book-prose" ref={articleRef}>
      <MarkdownDocument
        body={researchDocument.body}
        currentPath={researchDocument.path}
        onNavigate={navigate}
        internalHref={internalHref}
        imageLoading={imageLoading}
        renderExternalImages={renderExternalImages}
        assetBasePath={assetBasePath}
        headingOffset={1}
      />
    </article>
  );
}

function documentNumber(
  path: string,
  conceptDocuments: ResearchDocument[],
  mathDocuments: ResearchDocument[],
  appendixDocuments: ResearchDocument[],
) {
  const appendixIndex = appendixDocuments.findIndex((document) => document.path === path);
  if (appendixIndex >= 0) return `A${appendixIndex + 1}`;
  const mathIndex = mathDocuments.findIndex((document) => document.path === path);
  if (mathIndex >= 0) return `M${String(mathIndex + 1).padStart(2, "0")}`;
  const conceptIndex = conceptDocuments.findIndex((document) => document.path === path);
  return String(conceptIndex + 1).padStart(2, "0");
}

function documentLabel(path: string) {
  if (appendixPaths.includes(path)) return "Appendix";
  if (path.startsWith("math/")) return "Mathematical note";
  return "Chapter";
}

function BookSkipLink({ path }: { path: string }) {
  return (
    <a className="portal-skip-link" href={`#${bookDocumentId(path)}`}>
      Skip to first chapter
    </a>
  );
}

function currentBookIdentity(
  surface: NonNullable<BookEditionProps["surface"]>,
  sourceRef: string,
  editionVersion: string,
  sourceRevision: string | null,
) {
  return bookEditionIdentity({ surface, sourceRef, editionVersion, sourceRevision });
}

function editionSupport(
  identity: ReturnType<typeof bookEditionIdentity>,
  isPublicPdf: boolean,
  assetBasePath: string,
) {
  const supportBasePath = isPublicPdf ? canonicalPublicSite : assetBasePath;
  const locator = issueFormLocator([
    `Public route: ${canonicalBookRoute}`,
    `Edition: ${identity.edition}`,
    ...(identity.sourceRevision ? [`Source revision: ${identity.sourceRevision}`] : []),
  ]);
  return {
    helpHref: joinBasePath(supportBasePath, "help/"),
    issueHref: repositoryIssueUrl(
      "site-documentation-problem.yml",
      `[Site/Docs] book/ @ ${identity.sourceRevision?.slice(0, 12) ?? identity.repositoryRef}`,
      { location: locator },
    ),
  };
}

export function BookEdition({
  surface = "github-pages",
  assetBasePath = "/",
  editionVersion, sourceRef, sourceRevision = null,
}: BookEditionProps) {
  const isGitHubPages = surface === "github-pages";
  const isPublicPdf = surface === "public-pdf";
  const identity = currentBookIdentity(surface, sourceRef, editionVersion, sourceRevision);
  const surfaceDocumentHref = repositoryDocumentHrefFor(identity.repositoryLinkRef);
  const support = editionSupport(identity, isPublicPdf, assetBasePath);
  const conceptDocuments = documents.filter(
    (document) =>
      document.kind === "markdown" &&
      (document.path === "README.md" ||
        (document.path.startsWith("concept/") &&
          document.path !== "concept/README.md")),
  );
  const appendixDocuments = appendixPaths
    .map((path) => documents.find((document) => document.path === path))
    .filter((document): document is ResearchDocument => document !== undefined);
  const mathDocuments = documents.filter(
    (document) =>
      document.kind === "markdown" &&
      document.path.startsWith("math/") &&
      document.path !== "math/README.md",
  );
  const bookDocuments = [...conceptDocuments, ...mathDocuments, ...appendixDocuments];
  const bookDocumentPaths = new Set(
    bookDocuments.map((document) => document.path),
  );
  const totalWords = bookDocuments.reduce(
    (sum, document) => sum + document.words,
    0,
  );
  useBookFragmentRestoration();
  const navigate = (path: string, hash = "") =>
    navigateFromBook(path, hash, bookDocumentPaths, surfaceDocumentHref);
  const bookHref = (path: string, hash: string) => {
    if (bookDocumentPaths.has(path)) {
      return hash ? `#${bookDocumentHeadingId(path, hash)}` : `#${bookDocumentId(path)}`;
    }
    if (isRepositoryArtifact(path)) {
      if (isPublicPdf || !isPublicRepositoryArtifact(path)) {
        return surfaceDocumentHref(path, hash);
      }
      return joinBasePath(assetBasePath, repositoryArtifactHref(path));
    }
    return surfaceDocumentHref(path, hash);
  };

  return (
    <main className={`book-shell ${isGitHubPages ? "book-shell-web" : "book-shell-print"}`}>
      {isGitHubPages && bookDocuments[0] ? <BookSkipLink path={bookDocuments[0].path} /> : null}
      <nav className="book-actions" aria-label="Book actions">
        <a href={repositoryTreeHref(identity.repositoryLinkRef)}>View source on GitHub</a>
        <a
          className="book-download-primary"
          href={joinBasePath(
            isPublicPdf ? canonicalPublicSite : assetBasePath,
            publication.bookPdfPath,
          )}
          download
        >
          Download PDF
        </a>
        <button type="button" onClick={() => window.print()}>
          Print this edition
        </button>{!isPublicPdf && <LanguageAccess basePath={assetBasePath} />}
      </nav>

      <header className="book-cover">
        <span className="book-kicker">Durable research concept</span>
        <h1>20 Watts Was Enough</h1>
        <p className="book-subtitle">
          A biologically inspired R&amp;D blueprint for sparse, grounded,
          continual, energy-efficient AI.
        </p>
        <div className="book-cover-rule" />
        <dl>
          <div>
            <dt>Edition</dt>
            <dd>{identity.edition}</dd>
          </div>
          <div>
            <dt>Contents</dt>
            <dd>
              {conceptDocuments.length} concept documents + {mathDocuments.length} mathematical notes + {appendixDocuments.length} generated appendix
            </dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>{totalWords.toLocaleString("en-US")} words</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {identity.sourceLabel}
              {identity.sourceRevision ? <> · commit <code>{identity.sourceRevision}</code></> : null}
            </dd>
          </div>
        </dl>
        <nav className="book-cover-support" aria-label="Edition support">
          <span>Support for {identity.repositoryRef}</span>
          <a href={support.helpHref}>How to help</a>
          <a href={support.issueHref}>Report this edition</a>
        </nav>
      </header>

      <section className="book-toc" aria-labelledby="book-toc-heading">
        <span className="book-kicker">Navigation</span>
        <h2 id="book-toc-heading">Contents</h2>
        <ol>
          <li>
            <a href="#book-research-readiness">
              <span>00</span>
              <strong>Research readiness</strong>
              <code>generated front matter</code>
            </a>
          </li>
          {[
            ["Concept", conceptDocuments],
            ["Mathematical notes", mathDocuments],
            ["Appendix", appendixDocuments],
          ].map(([label, sectionDocuments]) => (
            <Fragment key={label as string}>
              <li className="book-toc-section">{label as string}</li>
              {(sectionDocuments as ResearchDocument[]).map((document) => (
                <li key={document.path}>
                  <a href={`#${bookDocumentId(document.path)}`}>
                    <span>
                      {documentNumber(
                        document.path,
                        conceptDocuments,
                        mathDocuments,
                        appendixDocuments,
                      )}
                    </span>
                    <strong>{document.title}</strong>
                    <code>{document.path}</code>
                  </a>
                </li>
              ))}
            </Fragment>
          ))}
        </ol>
      </section>

      <section
        className="book-document book-readiness-frontmatter"
        id="book-research-readiness"
      >
        <div className="book-document-meta">
          <span>Generated front matter</span>
          <code>experiments/test-readiness-summary.json</code>
          <span>{identity.isReleaseSnapshot ? `Release ${identity.repositoryRef}` : "main snapshot"}</span>
        </div>
        <ReadinessOverview
          mode="book"
          documentHref={surfaceDocumentHref}
        />
      </section>

      {bookDocuments.map((document) => (
        <section
          className="book-document"
          id={bookDocumentId(document.path)}
          key={document.path}
        >
          <div className="book-document-meta">
            <span>
              {documentLabel(document.path)}{" "}
              {documentNumber(
                document.path,
                conceptDocuments,
                mathDocuments,
                appendixDocuments,
              )}
            </span>
            <code>{document.path}</code>
            <span>{document.words.toLocaleString("en-US")} words</span>
          </div>
          <BookDocumentArticle
            document={document}
            navigate={navigate}
            internalHref={bookHref}
            imageLoading={isPublicPdf ? "eager" : "lazy"}
            renderExternalImages={!isPublicPdf}
            assetBasePath={assetBasePath}
          />
        </section>
      ))}
      <footer className="book-legal" aria-label="Legal information">
        <strong>Licences and notices</strong>
        <span>
          Source: github.com/cordanaLLM/20-watts-was-enough @ {identity.repositoryRef}
          {identity.sourceRevision ? ` · commit ${identity.sourceRevision}` : ""}
        </span>
        {[
          ["EUPL 1.2", "LICENSE"],
          ["CC BY-SA 4.0", "LICENSES/CC-BY-SA-4.0.txt"],
          ["Licensing scope", "LICENSING.md"],
          ["Third-party notices", "THIRD_PARTY_NOTICES.txt"],
        ].map(([label, legalPath]) => (
          <a
            href={
              isGitHubPages
                ? joinBasePath(assetBasePath, legalPath)
                : surfaceDocumentHref(legalPath)
            }
            key={legalPath}
          >
            {label}
          </a>
        ))}
      </footer>
    </main>
  );
}
