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
  // The SDK transformer moves unsupported constraints (lengths, ranges…) into descriptions; the reply is trimmed to them on return.
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
  return conform(opts.schema, sanitize(data, raw, raw));
}

type JSONSchema = { [k: string]: unknown };

/**
 * Size and range limits (max items, min/max values) are only hints to the model, so a long
 * answer can exceed them. Trim and clamp to the schema instead of rejecting the whole answer.
 */
export function sanitize(value: unknown, schema: JSONSchema, root: JSONSchema): unknown {
  const ref = schema.$ref as string | undefined;
  if (ref) {
    const target = ref.replace(/^#\//, "").split("/").reduce<unknown>((o, k) => (o as JSONSchema | undefined)?.[k], root) as JSONSchema | undefined;
    return target ? sanitize(value, target, root) : value;
  }
  const anyOf = schema.anyOf as JSONSchema[] | undefined;
  if (anyOf) {
    if (value === null) return value;
    // Pick the variant whose constant fields (e.g. kind) match.
    const v = value as JSONSchema;
    const match = anyOf.find((alt) => {
      const a = resolve(alt, root);
      const props = (a.properties ?? {}) as Record<string, JSONSchema>;
      const consts = Object.entries(props).filter(([, p]) => "const" in p);
      if (a.type === "null") return false;
      if (consts.length) return typeof v === "object" && v !== null && consts.every(([k, p]) => v[k] === p.const);
      return (a.type === "object") === (typeof v === "object" && !Array.isArray(v));
    });
    return match ? sanitize(value, match, root) : value;
  }
  if ((schema.type === "number" || schema.type === "integer") && typeof value === "number") {
    let n = value;
    if (typeof schema.minimum === "number") n = Math.max(schema.minimum, n);
    if (typeof schema.maximum === "number") n = Math.min(schema.maximum, n);
    if (schema.type === "integer") n = Math.round(n);
    const allowed = schema.enum as number[] | undefined;
    if (allowed?.length && !allowed.includes(n)) n = allowed.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best));
    return n;
  }
  if (schema.type === "array" && Array.isArray(value)) {
    const items = schema.items as JSONSchema | undefined;
    const out = items ? value.map((x) => sanitize(x, items, root)) : value;
    return typeof schema.maxItems === "number" ? out.slice(0, schema.maxItems) : out;
  }
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const props = (schema.properties ?? {}) as Record<string, JSONSchema>;
    const out: JSONSchema = { ...(value as JSONSchema) };
    for (const [k, p] of Object.entries(props)) if (k in out) out[k] = sanitize(out[k], p, root);
    return out;
  }
  return value;
}

function resolve(s: JSONSchema, root: JSONSchema): JSONSchema {
  const ref = s.$ref as string | undefined;
  if (!ref) return s;
  return (ref.replace(/^#\//, "").split("/").reduce<unknown>((o, k) => (o as JSONSchema | undefined)?.[k], root) as JSONSchema) ?? s;
}

/**
 * Validate; if one list item is malformed (e.g. a layout block missing a field), drop that item
 * and keep the rest rather than failing the whole proposal. Anything else is reported precisely.
 */
export function conform<T>(schema: z.ZodType<T>, input: unknown): T {
  let data = input;
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = schema.safeParse(data);
    if (r.success) return r.data;
    const issue = r.error.issues[0];
    const path = issue.path as (string | number)[];
    // Too long or out of range: trim or clamp in place.
    const here = path.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)?.[k], data);
    const limit = (issue as { maximum?: unknown; minimum?: unknown }).maximum ?? (issue as { minimum?: unknown }).minimum;
    if (path.length && typeof limit === "number" && ((issue.code === "too_big" && Array.isArray(here)) || ((issue.code === "too_big" || issue.code === "too_small") && typeof here === "number"))) {
      data = structuredClone(data);
      const holder = path.slice(0, -1).reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], data) as Record<string | number, unknown>;
      holder[path[path.length - 1]] = Array.isArray(here) ? here.slice(0, limit) : limit;
      continue;
    }
    // Deepest list element on the path that can be removed.
    let cut = -1;
    for (let i = path.length - 1; i >= 0; i--) {
      if (typeof path[i] !== "number") continue;
      const parent = path.slice(0, i).reduce<unknown>((o, k) => (o as Record<string | number, unknown>)?.[k], data);
      if (Array.isArray(parent)) {
        cut = i;
        break;
      }
    }
    if (cut < 0) throw new AIHttpError(502, `The AI response did not match the expected structure (${path.join(".") || "root"}: ${issue.message}).`);
    data = structuredClone(data);
    const parent = path.slice(0, cut).reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], data) as unknown[];
    parent.splice(path[cut] as number, 1);
  }
  throw new AIHttpError(502, "The AI response did not match the expected structure.");
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
export async function research(ctx: AICtx, system: string, prompt: string, extraDomains: string[] = [], opts: { open?: boolean } = {}): Promise<ResearchOut> {
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
      // Open search is used only to identify a property from its address; topic research stays on authoritative domains.
      tools: [opts.open ? { type: "web_search_20260209", name: "web_search", max_uses: 8 } : { type: "web_search_20260209", name: "web_search", max_uses: 6, allowed_domains: domains }],
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
