import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPublishedBookRender } from "./lib/published-book-render.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectRoot, "public", "downloads", "book-manifest.json");
const usage = "Usage: node scripts/validate-published-book-render.mjs --receipt <file>";

const [flag, receiptArgument, ...rest] = process.argv.slice(2);
if (flag !== "--receipt" || !receiptArgument || rest.length > 0) {
  throw new Error(usage);
}

const result = assertPublishedBookRender({
  manifestText: await readFile(manifestPath, "utf8"),
  receiptText: await readFile(path.resolve(projectRoot, receiptArgument), "utf8"),
});

console.log(
  `Published book PDF equals ${result.renders} fresh renders of this tree (sha256:${result.pdf_sha256}).`,
);
