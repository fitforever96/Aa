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

export { AIHttpError as HttpError } from "@/lib/ai/engine";
import { AIHttpError as HttpError, type AICtx } from "@/lib/ai/engine";
import { MASTER_MEMORY } from "./masterMemory";

export function serverCtx(): AICtx {
  return { client: client(), model: MODEL, memory: MASTER_MEMORY };
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

