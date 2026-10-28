"use client";

import type { Settings } from "../types";
import { db } from "../db";
import { GENERIC_STANDARD } from "./standard";
import { AIHttpError, type AICtx } from "./engine";

/**
 * On-device ("direct") mode: the app calls Claude from this phone with Anthony's own
 * API key, stored only in this device's local database (never in the app's code,
 * never in backups). Used when there is no server deployment.
 */
export const DIRECT_MODEL = "claude-opus-5-5";

const TASKS = {
  "/api/ai/write": () => import("./tasks/write"),
  "/api/ai/research": () => import("./tasks/research"),
  "/api/ai/command": () => import("./tasks/command"),
  "/api/ai/extract": () => import("./tasks/extract"),
  "/api/ai/recommend": () => import("./tasks/recommend"),
  "/api/ai/draft": () => import("./tasks/draft"),
  "/api/ai/story": () => import("./tasks/story"),
  "/api/ai/compose": () => import("./tasks/compose"),
  "/api/ai/lookup": () => import("./tasks/lookup"),
} as const;

export const MASTER_MEMORY_DOC_ID = "doc_master_memory";

async function memory(): Promise<string> {
  const doc = await db().knowledge.get(MASTER_MEMORY_DOC_ID);
  return doc?.text?.trim() || GENERIC_STANDARD;
}

async function ctx(apiKey: string): Promise<AICtx> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 300_000 });
  return { client, model: DIRECT_MODEL, memory: await memory() };
}

export async function friendlyError(e: unknown): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  if (e instanceof AIHttpError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "Claude rejected your API key. Check it in Settings › AI & Research.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Your Claude API key doesn't have access to this model.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy or your account hit its rate limit. Wait a minute and try again.";
  if (e instanceof Anthropic.APIConnectionError || isNetworkFailure(e)) return CONNECTION_LOST;
  if (e instanceof Anthropic.APIError) {
    if (/credit balance|billing/i.test(e.message)) return "Your Anthropic account needs credits. Add billing at console.anthropic.com › Billing.";
    if (e.status === 529 || /overloaded/i.test(e.message)) return "Claude is overloaded right now. Try again in a minute.";
    // The API's own explanation (never contains proposal content) makes faults diagnosable.
    const detail = ((e.error as { error?: { message?: string } } | undefined)?.error?.message ?? "").slice(0, 300);
    return `Claude returned an error (${e.status ?? "unknown"})${detail ? `: ${detail}` : "."}`;
  }
  return e instanceof Error ? e.message : "AI request failed.";
}

const CONNECTION_LOST = "The connection to Claude dropped. Keep the app open and the screen on while it writes (iPhone pauses the connection in the background), then try again.";

/** Safari reports a dropped fetch as "Load failed"; other browsers as "Failed to fetch" / network errors. */
function isNetworkFailure(e: unknown) {
  return e instanceof TypeError && /load failed|failed to fetch|network/i.test(e.message);
}

/** Worth one automatic retry: dropped connections and temporary server trouble. */
async function retryable(e: unknown): Promise<boolean> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  if (e instanceof Anthropic.APIConnectionError || isNetworkFailure(e)) return true;
  return e instanceof Anthropic.APIError && (e.status === undefined || e.status >= 500);
}

export async function runDirect<T>(path: string, body: unknown, settings: Settings): Promise<T> {
  const loader = TASKS[path as keyof typeof TASKS];
  if (!loader) throw new Error(`Unknown AI task ${path}`);
  const task = await loader();
  const parsed = task.Body.safeParse(body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new Error(`This request couldn't be prepared for Claude (${i.path.join(".") || "request"}: ${i.message}).`);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await task.run(await ctx(settings.ai.apiKey!), parsed.data as any)) as T;
  } catch (e) {
    throw Object.assign(new Error(await friendlyError(e)), { retryable: await retryable(e) });
  }
}

/** Minimal request to confirm the key works and the account has credit. */
export async function testKey(apiKey: string): Promise<string> {
  try {
    const c = await ctx(apiKey);
    const m = await c.client.messages.create({ model: DIRECT_MODEL, max_tokens: 64, output_config: { effort: "low" }, messages: [{ role: "user", content: "Reply with the single word: ready" }] });
    return m.content.some((b) => b.type === "text") ? "Connected to Claude. AI features are ready." : "Connected to Claude.";
  } catch (e) {
    throw new Error(await friendlyError(e));
  }
}
