import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";

/**
 * Claude request engine shared by the server routes and on-device mode.
 * Arithmetic is never delegated to the model; all outputs are schema-validated.
 */
export interface AICtx {
  client: Anthropic;
  model: string;
  /** Governing proposal standard (master memory or generic). */
  memory: string;
}

export class AIHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Content = Anthropic.Beta.Messages.BetaContentBlockParam[];

/** Structured JSON call. Arithmetic is never delegated to the model. */
export async function callJSON<T>(ctx: AICtx, opts: { system: string; content: string | Content; schema: z.ZodType<T>; maxTokens?: number; effort?: "low" | "medium" | "high" }): Promise<T> {
  const raw = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete raw.$schema;
  // The SDK transformer moves unsupported constraints (lengths, ranges…) into descriptions; zod still validates them on return.
  const jsonSchema = transformJSONSchema(raw);
  const stream = ctx.client.beta.messages.stream({
    model: ctx.model,
    max_tokens: opts.maxTokens ?? 16000,
    // Long, stable system prompt (master memory) is cached across requests.
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.content }],
    output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: jsonSchema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new AIHttpError(422, "The AI declined this request.");
  if (msg.stop_reason === "max_tokens") throw new AIHttpError(502, "The AI response was cut off. Try a smaller request.");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AIHttpError(502, "The AI returned malformed JSON.");
  }
  const parsed = opts.schema.safeParse(data);
  if (!parsed.success) throw new AIHttpError(502, "The AI response did not match the expected structure.");
  return parsed.data;
}

export const RESEARCH_DOMAINS = [
  "orkin.com",
  "epa.gov",
  "cdc.gov",
  "usda.gov",
  "osha.gov",
  "fda.gov",
  "npic.orst.edu",
  "ipm.ucanr.edu",
  "extension.psu.edu",
  "edis.ifas.ufl.edu",
  "extension.umn.edu",
  "entomology.ca.uky.edu",
  "extension.purdue.edu",
  "extension.illinois.edu",
  "uaex.uada.edu",
  "extension.okstate.edu",
  "citybugs.tamu.edu",
  "entomology.unl.edu",
  "content.ces.ncsu.edu",
];

export interface ResearchOut {
  text: string;
  sources: { title: string; url: string }[];
  searches: number;
}

/** Live research using Anthropic's server-side web search, restricted to authoritative domains. */
export async function research(ctx: AICtx, system: string, prompt: string, extraDomains: string[] = []): Promise<ResearchOut> {
  const domains = [...new Set([...RESEARCH_DOMAINS, ...extraDomains])].slice(0, 60);
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const sources = new Map<string, string>();
  let searches = 0;
  let finalText = "";
  for (let turn = 0; turn < 4; turn++) {
    const stream = ctx.client.beta.messages.stream({
      model: ctx.model,
      max_tokens: 16000,
      system,
      messages,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, allowed_domains: domains }],
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const msg = await stream.finalMessage();
    for (const b of msg.content) {
      if (b.type === "server_tool_use") searches++;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") sources.set(r.url, r.title);
      if (b.type === "text") {
        finalText += b.text;
        for (const c of b.citations ?? []) if (c.type === "web_search_result_location") sources.set(c.url, c.title ?? c.url);
      }
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content as unknown as Content });
      finalText = "";
      continue;
    }
    if (msg.stop_reason === "refusal") throw new AIHttpError(422, "The AI declined this request.");
    break;
  }
  return { text: finalText, sources: [...sources.entries()].map(([url, title]) => ({ url, title })), searches };
}

/** Pull the first JSON object/array out of model text (used where structured output can't be combined with tools). */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.search(/[\[{]/);
  if (start < 0) return null;
  for (let end = body.length; end > start; end--) {
    const ch = body[end - 1];
    if (ch !== "}" && ch !== "]") continue;
    try {
      return JSON.parse(body.slice(start, end));
    } catch {
      /* keep shrinking */
    }
  }
  return null;
}
