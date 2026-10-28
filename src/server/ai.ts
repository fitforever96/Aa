import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";

/**
 * Server-side AI gateway. The API key lives only in server environment variables
 * and is never sent to the browser. Proposal content is not logged.
 */

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 300_000 });
  return _client;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const buckets = new Map<string, { count: number; reset: number }>();
function rateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) throw new HttpError(429, "Too many AI requests. Wait a minute and try again.");
}

/** Validates the optional access passcode, rate limits, and checks configuration. */
export function guard(req: Request) {
  if (!aiConfigured()) throw new HttpError(503, "AI is not configured on this deployment. Set ANTHROPIC_API_KEY on the server.");
  const expected = process.env.APP_ACCESS_TOKEN;
  if (expected) {
    const got = req.headers.get("x-studio-token") ?? "";
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Access passcode missing or incorrect. Enter it in Settings › AI & Research.");
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  rateLimit(ip);
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>, maxBytes = 400_000): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError(413, "Request too large.");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new HttpError(400, "Invalid request: " + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
  return parsed.data;
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "The AI provider is rate limiting requests. Try again shortly." }, { status: 429 });
  if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "The server's AI credentials were rejected." }, { status: 502 });
  if (e instanceof Anthropic.APIConnectionError) return Response.json({ error: "Could not reach the AI provider." }, { status: 502 });
  if (e instanceof Anthropic.APIError) return Response.json({ error: `AI provider error (${e.status ?? "unknown"}).` }, { status: 502 });
  // Never echo proposal content in logs.
  console.error("AI route error:", e instanceof Error ? e.name + ": " + e.message.slice(0, 200) : "unknown");
  return Response.json({ error: e instanceof Error ? e.message.slice(0, 300) : "Unexpected error." }, { status: 500 });
}

type Content = Anthropic.Beta.Messages.BetaContentBlockParam[];

/** Structured JSON call. Arithmetic is never delegated to the model. */
export async function callJSON<T>(opts: { system: string; content: string | Content; schema: z.ZodType<T>; maxTokens?: number; effort?: "low" | "medium" | "high" }): Promise<T> {
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: jsonSchema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new HttpError(422, "The AI declined this request.");
  if (msg.stop_reason === "max_tokens") throw new HttpError(502, "The AI response was cut off. Try a smaller request.");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(502, "The AI returned malformed JSON.");
  }
  const parsed = opts.schema.safeParse(data);
  if (!parsed.success) throw new HttpError(502, "The AI response did not match the expected structure.");
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
export async function research(system: string, prompt: string, extraDomains: string[] = []): Promise<ResearchOut> {
  const domains = [...new Set([...RESEARCH_DOMAINS, ...extraDomains])].slice(0, 60);
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const sources = new Map<string, string>();
  let searches = 0;
  let finalText = "";
  for (let turn = 0; turn < 4; turn++) {
    const stream = client().beta.messages.stream({
      model: MODEL,
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
    if (msg.stop_reason === "refusal") throw new HttpError(422, "The AI declined this request.");
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
