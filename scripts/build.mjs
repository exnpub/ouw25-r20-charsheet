import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectRoot, "src");
const outputDir = path.join(projectRoot, "dist");
const marker = "<!-- SHEET_WORKER -->";

const [htmlTemplate, css, rules, worker] = await Promise.all([
  readFile(path.join(sourceDir, "ouw25.html"), "utf8"),
  readFile(path.join(sourceDir, "ouw25.css"), "utf8"),
  readFile(path.join(sourceDir, "rules.js"), "utf8"),
  readFile(path.join(sourceDir, "worker.js"), "utf8"),
]);

if (htmlTemplate.split(marker).length !== 2) {
  throw new Error(`Expected exactly one ${marker} marker in src/ouw25.html`);
}

const bundledWorker = `<script type="text/worker">\n${rules.trim()}\n\n${worker.trim()}\n</script>`;
const html = htmlTemplate.replace(marker, bundledWorker);
if (html.includes(marker)) {
  throw new Error("Unresolved worker marker in generated HTML");
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, "ouw25.html"), html),
  writeFile(path.join(outputDir, "ouw25.css"), css),
]);

console.log("Built dist/ouw25.html and dist/ouw25.css");
