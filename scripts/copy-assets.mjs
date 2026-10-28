// Copies version-matched runtime assets (PDF.js worker, PDF fonts) into /public.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
const copies = [["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs"]];
for (const w of [400, 500, 700, 800]) copies.push([`node_modules/@fontsource/roboto-condensed/files/roboto-condensed-latin-${w}-normal.woff`, `public/fonts/roboto-condensed-latin-${w}-normal.woff`]);
for (const w of [400, 700, 900]) copies.push([`node_modules/@fontsource/lato/files/lato-latin-${w}-normal.woff`, `public/fonts/lato-latin-${w}-normal.woff`]);
copies.push(["node_modules/@fontsource/lato/files/lato-latin-400-italic.woff", "public/fonts/lato-latin-400-italic.woff"]);
mkdirSync("public/fonts", { recursive: true });
for (const [from, to] of copies) if (existsSync(from)) copyFileSync(from, to);
