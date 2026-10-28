import React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { ProposalDocument, registerPdfFonts } from "../src/lib/pdf/ProposalDocument";
import { buildPdfModel } from "../src/lib/pdf/model";
import { renderToFit } from "../src/lib/pdf/fit";
import { fitStory } from "../src/lib/story/fit";
import { StoryDocument } from "../src/lib/pdf/StoryDocument";
import { buildStoryModel } from "../src/lib/story/resolve";
import type { DocLength } from "../src/lib/types";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { analyzePdf, type PdfjsLike } from "../src/lib/pdf/qa";
import { warehouse, portfolio, restaurant } from "./samples";

/** Renders each sample proposal at every length: npx tsx scripts/render-lengths.tsx <outdir> */
const out = process.argv[2] ?? "tmp-lengths";
fs.mkdirSync(out, { recursive: true });
registerPdfFonts(path.resolve("public"));
(async () => {
  for (const [name, make] of [["warehouse", warehouse], ["portfolio", portfolio], ["restaurant", restaurant]] as const) {
    for (const length of ["one_page", "two_page", "short", "full"] as DocLength[]) {
      const p = make();
      p.document.options.length = length;
      const classic = process.env.LAYOUT === "classic";
      const m = buildPdfModel(p, []);
      const sm = buildStoryModel(p);
      const fit = classic
        ? await renderToFit(length, async (level, variant) => new Uint8Array(await renderToBuffer(<ProposalDocument m={m} level={level} variant={variant} />)))
        : await fitStory(sm, async (plan, squeeze) => new Uint8Array(await renderToBuffer(<StoryDocument m={sm} plan={plan} squeeze={squeeze} />)));
      fs.writeFileSync(path.join(out, `${name}-${length}.pdf`), fit.bytes);
      const qa = await analyzePdf(fit.bytes, pdfjs as unknown as PdfjsLike);
      const issues = qa.checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => `${c.id}: ${c.detail}`);
      console.log(`${name.padEnd(10)} ${length.padEnd(9)} pages=${fit.pages} target=${fit.target ?? "-"} level=${fit.level} ${fit.fits ? "fits" : "OVER"}  ${issues.join(" | ") || "layout QA pass"}  (${qa.checks.find((c) => c.id === "vis_font")?.detail})`);
    }
  }
})();
