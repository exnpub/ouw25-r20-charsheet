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

// Workers expose state through attributes; bit selectors avoid one rule per balance tier.
const bits = Array.from(Math.floor(Number.MAX_SAFE_INTEGER / 10000).toString(2), (_, bit) => bit);
const balanceStepStyles = ["debt", "pension"].flatMap((balance) => {
  const card = `.charsheet .sheet-${balance}-card`;
  const property = `--sheet-${balance}`;
  const sum = bits.map((bit) => `var(${property}-bit-${bit}, 0)`).join(" + ");
  return [
    `${card} { ${property}-steps: calc(${sum}); }`,
    ...bits.map((bit) =>
      `${card}:has(> input[name="attr_${balance}_step_bits"][value~="bit${bit}"]) { ${property}-bit-${bit}: ${2 ** bit}; }`
    ),
  ];
}).join("\n");
const builtCss = css.replace("/* BALANCE_STEP_STYLES */", balanceStepStyles);

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, "ouw25.html"), html),
  writeFile(path.join(outputDir, "ouw25.css"), builtCss),
]);

console.log("Built dist/ouw25.html and dist/ouw25.css");
