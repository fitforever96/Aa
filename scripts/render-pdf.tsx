// Renders sample proposals to PDF for visual QA: npx tsx scripts/render-pdf.tsx out/
import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { ProposalDocument, registerPdfFonts } from "../src/lib/pdf/ProposalDocument";
import { InternalEstimateDocument } from "../src/lib/pdf/InternalDocument";
import { buildPdfModel } from "../src/lib/pdf/model";
import { buildInternalModel } from "../src/lib/pdf/internalModel";
import { warehouse, portfolio, restaurant } from "./samples";

const out = process.argv[2] || "tmp-qa";
mkdirSync(out, { recursive: true });
registerPdfFonts(path.resolve("public"));
(async () => {
  for (const [name, p] of [["warehouse", warehouse()], ["portfolio", portfolio()], ["restaurant", restaurant()]] as const) {
    await renderToFile(<ProposalDocument m={buildPdfModel(p, [])} />, path.join(out, `${name}.pdf`));
    console.log("wrote", name);
  }
  await renderToFile(<InternalEstimateDocument m={buildInternalModel(warehouse(), [])} />, path.join(out, `warehouse-internal.pdf`));
  console.log("wrote internal");
})();
