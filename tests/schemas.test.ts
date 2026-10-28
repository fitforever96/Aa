import { describe, it, expect } from "vitest";
import { z } from "zod";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import * as command from "@/lib/ai/tasks/command";
import * as compose from "@/lib/ai/tasks/compose";
import * as draft from "@/lib/ai/tasks/draft";
import * as extract from "@/lib/ai/tasks/extract";
import * as recommend from "@/lib/ai/tasks/recommend";
import * as story from "@/lib/ai/tasks/story";
import * as write from "@/lib/ai/tasks/write";
import { conform, sanitize } from "@/lib/ai/engine";

/** The API's published limits for structured outputs: 16 union-typed and 24 optional fields per request. */
export function schemaLoad(schema: unknown) {
  let unions = 0;
  let optional = 0;
  const walk = (s: Record<string, unknown> | undefined, isField: boolean) => {
    if (!s || typeof s !== "object") return;
    if (isField && (s.anyOf || Array.isArray(s.type))) unions++;
    if (s.properties) {
      const req = new Set((s.required as string[]) ?? []);
      for (const [k, v] of Object.entries(s.properties as Record<string, Record<string, unknown>>)) {
        if (!req.has(k)) optional++;
        walk(v, true);
      }
    }
    if (s.items) walk(s.items as Record<string, unknown>, true);
    for (const v of (s.anyOf as Record<string, unknown>[]) ?? []) walk(v, false);
    for (const v of Object.values((s.$defs ?? s.definitions ?? {}) as Record<string, Record<string, unknown>>)) walk(v, false);
  };
  walk(schema as Record<string, unknown>, false);
  return { unions, optional };
}

function sent(s: z.ZodType) {
  const raw = z.toJSONSchema(s, { target: "draft-7" }) as Record<string, unknown>;
  delete raw.$schema;
  return transformJSONSchema(raw);
}

const OUTPUTS: Record<string, z.ZodType> = { command: command.Out, compose: compose.ComposeWire, draft: draft.DraftOut, extract: extract.Out, recommend: recommend.Out, story: story.StoryOut, write: write.Out };

describe("AI response formats fit the API's limits", () => {
  for (const [name, schema] of Object.entries(OUTPUTS)) {
    it(`${name}: at most 16 union-typed and 24 optional fields`, () => {
      const load = schemaLoad(sent(schema));
      expect(load.unions).toBeLessThanOrEqual(16);
      expect(load.optional).toBeLessThanOrEqual(24);
    });
  }
  it("the proposal engine leaves plenty of headroom", () => {
    expect(schemaLoad(sent(compose.ComposeWire)).unions).toBeLessThanOrEqual(4);
  });
});

describe("answers that overrun size hints are trimmed, not rejected", () => {
  const raw = z.toJSONSchema(story.StoryOut, { target: "draft-7" }) as Record<string, unknown>;
  const card = (i: number) => ({ eyebrow: "E", title: `Card ${i}`, priceKey: "p0_recurring", priceSuffix: "", bullets: ["a", "b", "c", "d", "e", "f", "g"] });
  const answer = {
    hero: { eyebrow: "E", title: "T", subtitle: "S", tagline: "x", stats: Array.from({ length: 6 }, (_, i) => ({ value: String(i), label: "L" })) },
    blocks: [
      { kind: "scope", priority: 1, cards: Array.from({ length: 9 }, (_, i) => card(i + 1)) },
      { kind: "darkColumns", priority: 5, title: "Only one column", columns: [{ title: "a", body: "b" }] },
      { kind: "paragraph", priority: 7, text: "Kept." },
    ],
  };
  it("trims lists, clamps values and drops only the malformed block", () => {
    const out = conform(story.StoryOut, sanitize(answer, raw, raw));
    expect(out.hero.stats).toHaveLength(4);
    expect(out.blocks.map((b) => b.kind)).toEqual(["scope", "paragraph"]);
    const scope = out.blocks[0] as Extract<(typeof out.blocks)[number], { kind: "scope" }>;
    expect(scope.cards).toHaveLength(8);
    expect(scope.cards[0].bullets).toHaveLength(6);
    expect(out.blocks[1].priority).toBe(3);
  });
  it("names the field when an answer can't be repaired", () => {
    expect(() => conform(story.StoryOut, { hero: answer.hero })).toThrow(/blocks/);
  });
});
