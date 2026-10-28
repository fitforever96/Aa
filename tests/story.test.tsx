import { describe, it, expect, beforeAll } from "vitest";
import React from "react";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { registerPdfFonts } from "@/lib/pdf/ProposalDocument";
import { StoryDocument } from "@/lib/pdf/StoryDocument";
import { buildStoryModel } from "@/lib/story/resolve";
import { composeStory } from "@/lib/story/compose";
import { finalizeAIStory, priceKeys, storyFacts } from "@/lib/story/ai";
import { fitStory } from "@/lib/story/fit";
import { analyzePdf, type PdfjsLike } from "@/lib/pdf/qa";
import { runQC } from "@/lib/qc";
import type { StoryOutput } from "@/lib/ai/tasks/story";
import type { DocLength, Proposal } from "@/lib/types";
import { warehouse, restaurant } from "../scripts/samples";

beforeAll(() => registerPdfFonts(path.resolve("public")));

async function textOf(buf: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: buf.slice() }).promise;
  let s = "";
  for (let i = 1; i <= doc.numPages; i++) s += (await (await doc.getPage(i)).getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  return s.replace(/\s+/g, " ");
}

async function renderStory(p: Proposal, length: DocLength) {
  p.document.options.length = length;
  const m = buildStoryModel(p);
  return fitStory(m, async (plan, squeeze) => new Uint8Array(await renderToBuffer(<StoryDocument m={m} plan={plan} squeeze={squeeze} />)));
}

describe("Portrait story proposal", () => {
  for (const [length, max] of [["one_page", 1], ["two_page", 2], ["full", 3]] as const) {
    it(`${length}: at most ${max} page(s), every price exact, terms complete, clean layout`, async () => {
      const p = warehouse();
      const fit = await renderStory(p, length);
      expect(fit.pages).toBeLessThanOrEqual(max);
      const text = await textOf(fit.bytes);
      // Whole-dollar prices drop the cents, exactly as the engine computed them.
      for (const price of ["$950", "$325", "$2,092", "$375"]) expect(text).toContain(price);
      for (const e of p.document.sections.find((s) => s.type === "exclusions")!.body.split("\n")) expect(text).toContain(e.replace(/^- /, "").slice(0, 50));
      expect(text).toMatch(/governed by the executed Orkin service agreement/);
      expect(text).not.toMatch(/\$210|technician-min|yield/i);
      const qa = await analyzePdf(fit.bytes, pdfjs as unknown as PdfjsLike);
      for (const id of ["vis_clip", "vis_overlap", "vis_font", "vis_blank"]) {
        const c = qa.checks.find((x) => x.id === id)!;
        expect(c.status, `${id}: ${c.detail}`).toBe("pass");
      }
    }, 120000);
  }

  it("is portrait letter and opens with the site name and stat bar", async () => {
    const fit = await renderStory(restaurant(), "two_page");
    const doc = await pdfjs.getDocument({ data: fit.bytes.slice() }).promise;
    const page = await doc.getPage(1);
    expect(page.view.slice(2)).toEqual([612, 792]);
    const text = await textOf(fit.bytes);
    expect(text).toMatch(/SERVICE FREQUENCY/);
    expect(text).toMatch(/SCOPE OF SERVICE/i);
  }, 60000);

  it("rules story never writes amounts in prose", () => {
    const story = composeStory(warehouse(), warehouse().document.sections);
    const prose = JSON.stringify(story.blocks.map((b) => ({ ...b, price: undefined })));
    expect(prose).not.toMatch(/\$\s?\d/);
  });
});

describe("Claude-written story safety", () => {
  const draft = (p: Proposal): StoryOutput => ({
    hero: { eyebrow: "COMMERCIAL RODENT CONTROL", title: "Test Site", subtitle: "Rodent Program", tagline: "Trapping  |  Exclusion", stats: [{ value: "50", label: "Interior devices" }] },
    blocks: [
      { kind: "paragraph", priority: 1, text: "Activity was reported at the docks. Service costs only $99 per visit. Devices sit on wall lines." },
      { kind: "heading", priority: 1, title: "Scope of service", accent: "", lead: "" },
      { kind: "scope", priority: 1, cards: [{ eyebrow: "Thereafter", title: "Weekly service", priceKey: "p0_recurring", priceSuffix: " / VISIT", bullets: ["Service 50 Tin Cats."] }] },
      { kind: "charge", priority: 1, title: "Made-up item", priceKey: "not_a_key", priceLabel: "", text: "x" },
    ],
  });

  it("removes any amount Claude writes, drops unknown price keys, and restores the full approved scope", () => {
    const p = warehouse();
    const story = finalizeAIStory(draft(p), p, p.document.sections);
    const json = JSON.stringify(story);
    expect(json).not.toMatch(/\$99/);
    expect(json).toContain("Activity was reported at the docks.");
    expect(json).not.toContain("Made-up item");
    // The draft missed the initial, equipment and second-program prices, so the approved scope replaces it.
    const refs = story.blocks.flatMap((b) => (b.kind === "scope" ? b.cards.map((c) => JSON.stringify(c.price)) : b.kind === "charge" ? [JSON.stringify(b.price)] : []));
    for (const k of priceKeys(p)) expect(refs).toContain(JSON.stringify(k.ref));
    // Approved terms and price summary are always appended from the rules story.
    expect(story.blocks.some((b) => b.kind === "twoLists")).toBe(true);
    expect(story.blocks.some((b) => b.kind === "priceStrip")).toBe(true);
    expect(story.source).toBe("ai");
  });

  it("facts sent to Claude carry no prices or internal rates", () => {
    const p = warehouse();
    const facts = JSON.stringify({ facts: storyFacts(p, p.document.sections), keys: priceKeys(p).map(({ key, label }) => ({ key, label })) });
    expect(facts).not.toMatch(/\$\s?\d|21000|laborRate|technicianMinutes|Cents/);
  });

  it("Claude's story text goes through the legal checks", () => {
    const p = warehouse();
    p.story = finalizeAIStory({ ...draft(p), blocks: [...draft(p).blocks, { kind: "callout", priority: 2, title: "Fast", text: "Orkin will be on-site within 24 hours and will eliminate all rodents.", emphasis: "" }] }, p, p.document.sections);
    const bad = runQC(p).filter((c) => c.status === "fail" && c.group === "legal");
    expect(bad.length).toBeGreaterThan(0);
  });
});
