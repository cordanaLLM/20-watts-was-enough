"use client";

import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  hastOverflowLabel,
  headingBeforeLine,
  isExternalImageSource,
  joinAssetBase,
  markdownDocumentLabel,
  rehypeOverflowLabels,
  resolveImageSource,
  resolveInternalLink,
} from "../lib/markdown-pipeline";
import {
  isPublicRepositoryArtifact,
  isRepositoryArtifact,
  repositoryArtifactHref,
} from "../lib/repository-artifacts";
import { MermaidDiagram } from "./mermaid-diagram";
import {
  OverflowRegionCue,
  useHorizontalOverflowRegion,
} from "./overflow-region";

type MarkdownDocumentProps = {
  body: string;
  currentPath: string;
  onNavigate: (path: string, hash?: string) => void;
  internalHref?: (path: string, hash: string) => string;
  isNavigablePath?: (path: string) => boolean;
  nonNavigableHref?: (path: string, hash: string) => string;
  imageLoading?: "eager" | "lazy";
  renderExternalImages?: boolean;
  assetBasePath?: string;
  headingOffset?: number;
};

type MarkdownHeadingProps = ComponentPropsWithoutRef<"h1"> & {
  node?: unknown;
};

function shiftedHeading(level: number, offset: number) {
  const shiftedLevel = Math.min(6, Math.max(1, level + offset));
  const tag = `h${shiftedLevel}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return function ShiftedMarkdownHeading({ node, ...props }: MarkdownHeadingProps) {
    void node;
    return createElement(tag, props);
  };
}

function navigateInternalLink(
  event: MouseEvent<HTMLAnchorElement>,
  internal: { path: string; hash: string },
  onNavigate: (path: string, hash?: string) => void,
) {
  if (
    event.button !== 0
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
  ) return;
  event.preventDefault();
  onNavigate(internal.path, internal.hash);
}

type MarkdownImageOptions = {
  assetBasePath: string;
  currentPath: string;
  imageLoading: "eager" | "lazy";
  renderExternalImages: boolean;
};

function markdownImageComponents({
  assetBasePath,
  currentPath,
  imageLoading,
  renderExternalImages,
}: MarkdownImageOptions) {
  const ImageComponent = ({
    src = "",
    alt = "",
    ...props
  }: ComponentPropsWithoutRef<"img">) => {
    const source = typeof src === "string" ? src : "";
    if (!renderExternalImages && isExternalImageSource(source)) {
      return (
        <span className="external-image-reference">
          {alt.trim() || "External image omitted from the offline edition"}
        </span>
      );
    }
    return (
      // Plot SVGs are deterministic assets and retain their intrinsic viewBox.
      <img
        src={resolveImageSource(source, currentPath, assetBasePath)}
        alt={alt}
        loading={imageLoading}
        {...props}
      />
    );
  };

  const ParagraphComponent = ({ children }: ComponentPropsWithoutRef<"p">) => {
    const visibleChildren = Children.toArray(children).filter(
      (child) => typeof child !== "string" || child.trim().length > 0,
    );
    const onlyChild = visibleChildren.length === 1 ? visibleChildren[0] : null;
    if (
      isValidElement<ComponentPropsWithoutRef<"img">>(onlyChild) &&
      onlyChild.type === ImageComponent
    ) {
      const source = typeof onlyChild.props.src === "string" ? onlyChild.props.src : "";
      if (!renderExternalImages && isExternalImageSource(source)) {
        return <p className="external-image-paragraph">{onlyChild}</p>;
      }
      const caption = onlyChild.props.alt?.trim() ||
        "Generated figure from the canonical editable source.";
      return (
        <figure className="semantic-figure plot-figure">
          {cloneElement(onlyChild, { alt: "", "aria-hidden": true })}
          <figcaption>{caption}</figcaption>
        </figure>
      );
    }
    return <p>{children}</p>;
  };

  return { ImageComponent, ParagraphComponent };
}



type OverflowLabelProps = {
  "data-overflow-label"?: string;
  node?: unknown;
};

function ResponsiveCodeBlock({
  children,
  label,
  ...props
}: ComponentPropsWithoutRef<"pre"> & { label: string }) {
  const { overflows, regionProps, regionRef } =
    useHorizontalOverflowRegion<HTMLPreElement>(label);
  return (
    <div className="overflow-region-frame code-overflow-frame">
      {overflows ? <OverflowRegionCue subject="code" /> : null}
      <pre {...props} {...regionProps} data-overflow-kind="code" ref={regionRef}>
        {children}
      </pre>
    </div>
  );
}

function DiagramAwarePre({
  children,
  node,
  "data-overflow-label": overflowLabel,
  ...props
}: ComponentPropsWithoutRef<"pre"> & OverflowLabelProps) {
  void node;
  const onlyChild = Children.count(children) === 1 ? Children.only(children) : null;
  if (
    isValidElement<{ className?: string }>(onlyChild) &&
    (onlyChild.type === MermaidDiagram ||
      onlyChild.props.className?.split(/\s+/).includes("language-mermaid"))
  ) {
    return onlyChild;
  }
  return (
    <ResponsiveCodeBlock label={overflowLabel ?? "Scrollable code"} {...props}>
      {children}
    </ResponsiveCodeBlock>
  );
}

// Only an actual overflow region receives keyboard focus so arrow-key users can scroll it.
// Overflow labels are populated by rehypeOverflowLabels: `Scrollable table ${tableIndex} in ${documentLabel}`
function ResponsiveTable({
  node,
  "data-overflow-label": overflowLabel,
  ...props
}: ComponentPropsWithoutRef<"table"> & OverflowLabelProps) {
  void node;
  const { overflows, regionProps, regionRef } =
    useHorizontalOverflowRegion<HTMLDivElement>(
      overflowLabel ?? "Scrollable table",
      { role: "region" },
    );

  return (
    <div className="table-frame">
      {overflows ? <OverflowRegionCue subject="table" /> : null}
      <div
        className="table-region"
        {...regionProps}
        data-overflow-kind="table"
        ref={regionRef}
      >
        <table {...props} />
      </div>
    </div>
  );
}

function ResponsiveMathDisplay({
  children,
  label,
  ...props
}: ComponentPropsWithoutRef<"span"> & { label: string }) {
  const { overflows, regionProps, regionRef } =
    useHorizontalOverflowRegion<HTMLSpanElement>(label);
  return (
    <span className="overflow-region-frame equation-overflow-frame">
      {overflows ? <OverflowRegionCue subject="equation" /> : null}
      <span {...props} {...regionProps} data-overflow-kind="equation" ref={regionRef}>
        {children}
      </span>
    </span>
  );
}

function MarkdownSpan({
  children,
  className,
  node,
  "data-overflow-label": overflowLabel,
  ...props
}: ComponentPropsWithoutRef<"span"> & OverflowLabelProps) {
  void node;
  if (className?.split(/\s+/).includes("katex-display")) {
    return (
      <ResponsiveMathDisplay
        className={className}
        label={overflowLabel ?? "Scrollable equation"}
        {...props}
      >
        {children}
      </ResponsiveMathDisplay>
    );
  }
  return <span className={className} {...props}>{children}</span>;
}

type MarkdownLinkOptions = Pick<
  MarkdownDocumentProps,
  "currentPath" | "onNavigate" | "internalHref" | "isNavigablePath" | "nonNavigableHref"
> & { assetBasePath: string };

function shiftedHeadingComponents(headingOffset: number): Components {
  if (headingOffset === 0) {
    return {};
  }
  return {
    h1: shiftedHeading(1, headingOffset),
    h2: shiftedHeading(2, headingOffset),
    h3: shiftedHeading(3, headingOffset),
    h4: shiftedHeading(4, headingOffset),
    h5: shiftedHeading(5, headingOffset),
    h6: shiftedHeading(6, headingOffset),
  };
}

function markdownLinkComponent({
  currentPath,
  onNavigate,
  internalHref,
  isNavigablePath,
  nonNavigableHref,
  assetBasePath,
}: MarkdownLinkOptions): Components["a"] {
  return function MarkdownLink({
    href = "",
    children,
    ...props
  }: ComponentPropsWithoutRef<"a"> & ExtraProps) {
    const internal = resolveInternalLink(href, currentPath);
    if (!internal) {
      return (
        <a href={href} target="_blank" rel="noreferrer" {...props}>
          {children}
        </a>
      );
    }

    const isNavigable = isNavigablePath?.(internal.path) ?? true;
    if (!isNavigable
        && isRepositoryArtifact(internal.path)
        && isPublicRepositoryArtifact(internal.path)) {
      return (
        <a
          href={joinAssetBase(assetBasePath, repositoryArtifactHref(internal.path))}
          target="_blank"
          rel="noreferrer"
          data-repository-artifact={internal.path}
          {...props}
        >
          {children}
        </a>
      );
    }

    if (!isNavigable && nonNavigableHref) {
      return (
        <a
          href={nonNavigableHref(internal.path, internal.hash)}
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
        </a>
      );
    }

    const resolvedHref = internalHref && isNavigable
      ? internalHref(internal.path, internal.hash)
      : `?doc=${encodeURIComponent(internal.path)}`;

    return (
      <a
        href={resolvedHref}
        onClick={(event) => navigateInternalLink(event, internal, onNavigate)}
        {...props}
      >
        {children}
      </a>
    );
  };
}

function markdownCodeComponent(body: string): Components["code"] {
  return function MarkdownCode({
    className,
    children,
    node,
    ...props
  }: ComponentPropsWithoutRef<"code"> & ExtraProps) {
    const language = className?.replace("language-", "");
    if (language === "mermaid") {
      return (
        <MermaidDiagram
          chart={String(children)}
          contextHeading={headingBeforeLine(body, node?.position?.start.line)}
          overflowLabel={hastOverflowLabel(node)}
        />
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  };
}

export function MarkdownDocument({
  body,
  currentPath,
  onNavigate,
  internalHref,
  isNavigablePath,
  nonNavigableHref,
  imageLoading = "lazy",
  renderExternalImages = true,
  assetBasePath = "/",
  headingOffset = 0,
}: MarkdownDocumentProps) {
  const { ImageComponent, ParagraphComponent } = markdownImageComponents({
    assetBasePath,
    currentPath,
    imageLoading,
    renderExternalImages,
  });

  const components: Components = {
    ...shiftedHeadingComponents(headingOffset),
    a: markdownLinkComponent({
      currentPath,
      onNavigate,
      internalHref,
      isNavigablePath,
      nonNavigableHref,
      assetBasePath,
    }),
    p: ParagraphComponent,
    img: ImageComponent,
    code: markdownCodeComponent(body),
    pre: DiagramAwarePre,
    span: MarkdownSpan,
    table: ResponsiveTable,
  };

  const documentLabel = markdownDocumentLabel(body, currentPath);

  return (
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeSlug,
        rehypeKatex,
        [rehypeOverflowLabels, { documentLabel }],
      ]}
      components={components}
    >
      {body}
    </ReactMarkdown>
  );
}
