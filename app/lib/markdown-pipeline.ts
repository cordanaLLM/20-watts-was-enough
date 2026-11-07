import type { Element, Root, RootContent } from "hast";

export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function resolveInternalLink(href: string, currentPath: string) {
  if (/^(https?:|mailto:)/i.test(href)) return null;
  if (href.startsWith("#")) {
    return { path: currentPath, hash: href.slice(1) };
  }

  const [relativePath, hash = ""] = href.split("#", 2);
  const base = currentPath.includes("/")
    ? currentPath.slice(0, currentPath.lastIndexOf("/") + 1)
    : "";
  return { path: normalizePath(`${base}${relativePath}`), hash };
}

export function joinAssetBase(assetBasePath: string, src: string): string {
  const base = assetBasePath.endsWith("/") ? assetBasePath : `${assetBasePath}/`;
  return `${base}${src.replace(/^\/+/, "")}`;
}

export function resolveImageSource(
  src: string,
  currentPath: string,
  assetBasePath: string,
): string {
  if (/^(https?:|data:)/i.test(src)) return src;
  if (src.startsWith("/")) return joinAssetBase(assetBasePath, src);
  const base = currentPath.includes("/")
    ? currentPath.slice(0, currentPath.lastIndexOf("/") + 1)
    : "";
  const resolved = normalizePath(`${base}${src}`);
  return resolved.startsWith("public/")
    ? joinAssetBase(assetBasePath, resolved.slice("public/".length))
    : src;
}

export function isExternalImageSource(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

export function cleanMarkdownHeading(value: string): string | undefined {
  const heading = value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return heading || undefined;
}

export function headingBeforeLine(body: string, line?: number): string | undefined {
  if (!line || line < 1) return undefined;
  const lines = body.split(/\r?\n/);
  for (let index = Math.min(line - 2, lines.length - 1); index >= 0; index -= 1) {
    const match = lines[index].match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match) return cleanMarkdownHeading(match[1]);
  }
  return undefined;
}

export function markdownDocumentLabel(body: string, currentPath: string): string {
  const heading = body.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1];
  const label = heading ? cleanMarkdownHeading(heading) : undefined;
  if (!label) return currentPath;
  return label.length <= 64 ? label : `${label.slice(0, 61).trimEnd()}...`;
}

export function hastClassNames(element: Element): string[] {
  const value: unknown = element.properties.className;
  if (typeof value === "string") return value.split(/\s+/);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function hastOverflowLabel(element?: Element): string | undefined {
  const value = element?.properties.dataOverflowLabel;
  return typeof value === "string" ? value : undefined;
}

export function codeLanguage(element: Element): string | undefined {
  const value = hastClassNames(element)
    .find((className) => className.startsWith("language-"))
    ?.slice("language-".length);
  if (!value || value === "text") return undefined;
  return value === "json" ? "JSON" : value;
}

type OverflowLabelState = {
  codeIndex: number;
  diagramIndex: number;
  equationIndex: number;
  tableIndex: number;
  documentLabel: string;
};

function labelSpan(node: Element, state: OverflowLabelState) {
  if (node.tagName === "span" && hastClassNames(node).includes("katex-display")) {
    state.equationIndex += 1;
    node.properties.dataOverflowLabel =
      `Scrollable equation ${state.equationIndex} in ${state.documentLabel}`;
  }
}

function labelPre(node: Element, state: OverflowLabelState) {
  if (node.tagName !== "pre") return;
  const code = node.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  );
  if (!code) return;
  if (hastClassNames(code).includes("language-mermaid")) {
    state.diagramIndex += 1;
    code.properties.dataOverflowLabel =
      `Scrollable diagram ${state.diagramIndex} in ${state.documentLabel}`;
    return;
  }
  state.codeIndex += 1;
  const language = codeLanguage(code);
  node.properties.dataOverflowLabel =
    `Scrollable ${language ? `${language} ` : ""}code ${state.codeIndex} in ${state.documentLabel}`;
}

function labelTable(node: Element, state: OverflowLabelState) {
  if (node.tagName === "table") {
    state.tableIndex += 1;
    const tableIndex = state.tableIndex;
    const documentLabel = state.documentLabel;
    node.properties.dataOverflowLabel =
      `Scrollable table ${tableIndex} in ${documentLabel}`;
  }
}

export function rehypeOverflowLabels({ documentLabel }: { documentLabel: string }) {
  return (tree: Root) => {
    const state: OverflowLabelState = {
      codeIndex: 0,
      diagramIndex: 0,
      equationIndex: 0,
      tableIndex: 0,
      documentLabel,
    };
    const pending: Array<Root | RootContent> = [tree];
    while (pending.length > 0) {
      const node = pending.pop();
      if (!node) continue;
      if (node.type === "element") {
        labelSpan(node, state);
        labelPre(node, state);
        labelTable(node, state);
      }
      if ("children" in node) {
        for (let index = node.children.length - 1; index >= 0; index -= 1) {
          pending.push(node.children[index]);
        }
      }
    }
  };
}
