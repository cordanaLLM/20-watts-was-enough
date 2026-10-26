import type { Element, Root, RootContent } from "hast";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import {
  hastClassNames,
  isExternalImageSource,
  joinAssetBase,
  markdownDocumentLabel,
  rehypeOverflowLabels,
  resolveImageSource,
  resolveInternalLink,
} from "../../../app/lib/markdown-pipeline";
import {
  isPublicRepositoryArtifact,
  isRepositoryArtifact,
  repositoryArtifactHref,
} from "../../../app/lib/repository-artifacts";

export type RenderMarkdownOptions = {
  currentPath: string;
  internalHref?: (path: string, hash: string) => string;
  isNavigablePath?: (path: string) => boolean;
  nonNavigableHref?: (path: string, hash: string) => string;
  imageLoading?: "eager" | "lazy";
  renderExternalImages?: boolean;
  assetBasePath?: string;
  headingOffset?: number;
};

const tableElements = new Set(["table", "thead", "tbody", "tfoot", "tr"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#x27;");
}

function cleanNode(node: Element): void {
  delete node.properties.dataOverflowLabel;
  delete node.properties["data-overflow-label"];
  if (typeof node.properties.style === "string") {
    node.properties.style = node.properties.style.replace(/;\s*$/, "");
  }
}

function cleanTableCells(node: Element): void {
  if ((node.tagName === "th" || node.tagName === "td") && node.properties.align) {
    const align = node.properties.align;
    delete node.properties.align;
    const existingStyle = node.properties.style ? `${node.properties.style};` : "";
    node.properties.style = `${existingStyle}text-align:${align}`;
  }
}

function cleanTableTree(tableNode: Element): void {
  const stack = [tableNode];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || !node.children) continue;
    if (tableElements.has(node.tagName)) {
      node.children = node.children.filter((child) => child.type !== "text" || child.value.trim().length > 0);
    }
    for (const child of node.children) {
      if (child.type === "element") {
        cleanTableCells(child);
        stack.push(child);
      }
    }
  }
}

function findSingleImageChild(children: RootContent[]): Element | null {
  const visible = children.filter(
    (child) => child.type !== "text" || child.value.trim().length > 0,
  );
  if (visible.length === 1 && visible[0].type === "element" && visible[0].tagName === "img") {
    return visible[0];
  }
  return null;
}

function transformHeading(node: Element, headingOffset: number): void {
  if (headingOffset === 0) return;
  const match = /^h([1-6])$/.exec(node.tagName);
  if (!match) return;
  const level = parseInt(match[1], 10);
  const shiftedLevel = Math.min(6, Math.max(1, level + headingOffset));
  node.tagName = `h${shiftedLevel}` as Element["tagName"];
}

function transformLink(node: Element, options: RenderMarkdownOptions): void {
  const { currentPath, internalHref, isNavigablePath, nonNavigableHref, assetBasePath = "/" } = options;
  const href = typeof node.properties.href === "string" ? node.properties.href : "";
  const internal = resolveInternalLink(href, currentPath);

  const restProps = { ...node.properties };
  delete restProps.href;
  delete restProps.target;
  delete restProps.rel;
  delete restProps["data-repository-artifact"];
  delete restProps.node;

  if (!internal) {
    node.properties = {
      href,
      target: "_blank",
      rel: ["noreferrer"],
      ...restProps,
      };
    return;
  }

  const isNavigable = isNavigablePath?.(internal.path) ?? true;
  if (!isNavigable && isRepositoryArtifact(internal.path) && isPublicRepositoryArtifact(internal.path)) {
    node.properties = {
      href: joinAssetBase(assetBasePath, repositoryArtifactHref(internal.path)),
      target: "_blank",
      rel: ["noreferrer"],
      "data-repository-artifact": internal.path,
      ...restProps,
      };
    return;
  }

  if (!isNavigable && nonNavigableHref) {
    node.properties = {
      href: nonNavigableHref(internal.path, internal.hash),
      target: "_blank",
      rel: ["noreferrer"],
      ...restProps,
      };
    return;
  }

  const resolvedHref = internalHref && isNavigable
    ? internalHref(internal.path, internal.hash)
    : `?doc=${encodeURIComponent(internal.path)}`;

  node.properties = {
    href: resolvedHref,
    ...restProps,
  };
}

function transformParagraph(node: Element, options: RenderMarkdownOptions): boolean {
  const imgNode = findSingleImageChild(node.children);
  if (!imgNode) return false;

  const { currentPath, assetBasePath = "/", imageLoading = "lazy", renderExternalImages = true } = options;
  const rawSrc = typeof imgNode.properties.src === "string" ? imgNode.properties.src : "";
  const rawAlt = typeof imgNode.properties.alt === "string" ? imgNode.properties.alt : "";

  if (!renderExternalImages && isExternalImageSource(rawSrc)) {
    node.tagName = "p";
    node.properties = { className: ["external-image-paragraph"] };
    node.children = [
      {
        type: "element",
        tagName: "span",
        properties: { className: ["external-image-reference"] },
        children: [{ type: "raw", value: escapeHtml(rawAlt.trim() || "External image omitted from the offline edition") }],
      },
    ];
    return true;
  }

  const caption = rawAlt.trim() || "Generated figure from the canonical editable source.";
  const resolvedSrc = resolveImageSource(rawSrc, currentPath, assetBasePath);

  const restProps = { ...imgNode.properties };
  delete restProps.src;
  delete restProps.alt;
  delete restProps.loading;
  delete restProps["aria-hidden"];
  delete restProps.node;

  imgNode.properties = {
    src: resolvedSrc,
    alt: "",
    loading: imageLoading,
    ...restProps,
    "aria-hidden": "true",
  };

  node.tagName = "figure";
  node.properties = { className: ["semantic-figure", "plot-figure"] };
  node.children = [
    imgNode,
    {
      type: "element",
      tagName: "figcaption",
      properties: {},
      children: [{ type: "raw", value: escapeHtml(caption) }],
    },
  ];
  return true;
}

function transformStandaloneImage(imgNode: Element, options: RenderMarkdownOptions): void {
  const { currentPath, assetBasePath = "/", imageLoading = "lazy", renderExternalImages = true } = options;
  const rawSrc = typeof imgNode.properties.src === "string" ? imgNode.properties.src : "";
  const rawAlt = typeof imgNode.properties.alt === "string" ? imgNode.properties.alt : "";

  if (!renderExternalImages && isExternalImageSource(rawSrc)) {
    imgNode.tagName = "span";
    imgNode.properties = { className: ["external-image-reference"] };
    imgNode.children = [{ type: "raw", value: escapeHtml(rawAlt.trim() || "External image omitted from the offline edition") }];
    return;
  }

  const restProps = { ...imgNode.properties };
  delete restProps.src;
  delete restProps.alt;
  delete restProps.loading;
  delete restProps.node;

  imgNode.properties = {
    src: resolveImageSource(rawSrc, currentPath, assetBasePath),
    alt: rawAlt,
    loading: imageLoading,
    ...restProps,
  };
}

function transformPre(preNode: Element): Element {
  delete preNode.properties.dataOverflowLabel;
  delete preNode.properties["data-overflow-label"];

  const codeChild = preNode.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  );
  if (codeChild && hastClassNames(codeChild).includes("language-mermaid")) {
    return {
      type: "element",
      tagName: "div",
      properties: { className: ["diagram", "diagram-loading"] },
      children: [{ type: "raw", value: "Rendering diagram…" }],
    };
  }

  preNode.properties["data-overflow-kind"] = "code";
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["overflow-region-frame", "code-overflow-frame"] },
    children: [preNode],
  };
}

function transformTable(tableNode: Element): Element {
  delete tableNode.properties.dataOverflowLabel;
  delete tableNode.properties["data-overflow-label"];
  cleanTableTree(tableNode);

  return {
    type: "element",
    tagName: "div",
    properties: { className: ["table-frame"] },
    children: [
      {
        type: "element",
        tagName: "div",
        properties: {
          className: ["table-region"],
          "data-overflow-kind": "table",
        },
        children: [tableNode],
      },
    ],
  };
}

function transformSpan(spanNode: Element): Element | null {
  if (!hastClassNames(spanNode).includes("katex-display")) return null;

  delete spanNode.properties.dataOverflowLabel;
  delete spanNode.properties["data-overflow-label"];
  spanNode.properties["data-overflow-kind"] = "equation";

  return {
    type: "element",
    tagName: "span",
    properties: { className: ["overflow-region-frame", "equation-overflow-frame"] },
    children: [spanNode],
  };
}

function transformChild(
  child: RootContent,
  parent: Element | Root,
  index: number,
  options: RenderMarkdownOptions,
  pending: Array<Root | RootContent>,
): boolean {
  if (child.type === "text") {
    parent.children[index] = { type: "raw", value: escapeHtml(child.value) };
    return false;
  }

  if (child.type !== "element") return false;

  cleanNode(child);

  if (child.tagName === "pre") {
    const replacement = transformPre(child);
    parent.children[index] = replacement;
    if (replacement.tagName === "div" && replacement.children[0]?.type === "element"
        && replacement.children[0].tagName === "pre") {
      pending.push(replacement.children[0]);
    }
    return false;
  }

  if (child.tagName === "table") {
    parent.children[index] = transformTable(child);
    pending.push(child);
    return false;
  }

  if (child.tagName === "span") {
    const replacement = transformSpan(child);
    if (replacement) {
      parent.children[index] = replacement;
      pending.push(child);
      return false;
    }
  }

  if (child.tagName === "p") {
    if (!transformParagraph(child, options)) {
      pending.push(child);
    }
    return false;
  }

  if (child.tagName === "img") {
    transformStandaloneImage(child, options);
    return false;
  }

  if (child.tagName === "a") {
    transformLink(child, options);
    pending.push(child);
    return false;
  }

  transformHeading(child, options.headingOffset ?? 0);
  pending.push(child);
  return false;
}

// Drops every raw HTML node from Markdown after the rehype plugins, as react-markdown's
// `skipHtml` does, so the surrounding whitespace text nodes stay where the reader had them.
// Runs before the project transforms, whose own escaped text is the only raw output.
function rehypeSkipHtml() {
  return (tree: Root) => {
    const pending: Array<Root | Element> = [tree];
    while (pending.length > 0) {
      const parent = pending.pop();
      if (!parent) continue;
      parent.children = parent.children.filter((child) => child.type !== "raw") as typeof parent.children;
      for (const child of parent.children) {
        if (child.type === "element") pending.push(child);
      }
    }
  };
}

function rehypeProjectTransforms(options: RenderMarkdownOptions) {
  return (tree: Root) => {
    const pending: Array<Root | RootContent> = [tree];
    while (pending.length > 0) {
      const parent = pending.pop();
      if (!parent || !("children" in parent)) continue;

      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child && transformChild(child, parent, i, options, pending)) {
          i -= 1;
        }
      }
    }
  };
}

export function renderMarkdownDocument(body: string, options: RenderMarkdownOptions): string {
  if (!body) return "";
  const documentLabel = markdownDocumentLabel(body, options.currentPath);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeKatex)
    .use(rehypeOverflowLabels, { documentLabel })
    .use(rehypeSkipHtml)
    .use(rehypeProjectTransforms, options)
    .use(rehypeStringify, {
      allowDangerousHtml: true,
      closeSelfClosing: true,
      tightSelfClosing: true,
    });

  const file = processor.processSync(body);
  return String(file);
}
