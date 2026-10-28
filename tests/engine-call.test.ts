import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { callJSON } from "@/lib/ai/engine";

function sse(text: string, stop = "end_turn", extra: Record<string, unknown> = {}) {
  const ev = [
    ["message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { index: 0 }],
    ["message_delta", { delta: { stop_reason: stop, stop_sequence: null, ...extra }, usage: { output_tokens: 1 } }],
    ["message_stop", {}],
  ] as const;
  return new Response(ev.map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}
const reject = (status: number, message: string, id: string) =>
  new Response(JSON.stringify({ type: "error", error: { type: status === 400 ? "invalid_request_error" : "authentication_error", message }, request_id: id }), { status, headers: { "content-type": "application/json", "request-id": id } });

function client(responses: (() => Response)[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = async (_u: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return responses[bodies.length - 1]();
  };
  return { ctx: { client: new Anthropic({ apiKey: "sk-ant-test", dangerouslyAllowBrowser: true, fetch: fetch as typeof globalThis.fetch, maxRetries: 0 }), model: "claude-opus-5-5", memory: "" }, bodies };
}
const Schema = z.object({ title: z.string(), items: z.array(z.string()).max(2) });
const opts = { system: "S", content: "C", schema: Schema };

describe("Claude call recovers from rejected request shapes", () => {
  it("drops the refusal-fallback option when the API rejects it", async () => {
    const { ctx, bodies } = client([() => reject(400, "fallbacks: not supported here", "req_1"), () => sse(JSON.stringify({ title: "T", items: ["a", "b", "c"] }))]);
    expect(await callJSON(ctx, opts)).toEqual({ title: "T", items: ["a", "b"] });
    expect(bodies[0].fallbacks).toBe("default");
    expect(bodies[1].fallbacks).toBeUndefined();
    expect(JSON.stringify(bodies[1].output_config)).toContain("json_schema");
  });

  it("falls back to plain JSON when structured output is rejected", async () => {
    const { ctx, bodies } = client([() => reject(400, "Schema is too complex for compilation.", "req_1"), () => reject(400, "Schema is too complex for compilation.", "req_2"), () => sse('Here it is:\n```json\n{"title":"T","items":["a"]}\n```')]);
    expect(await callJSON(ctx, opts)).toEqual({ title: "T", items: ["a"] });
    expect(JSON.stringify(bodies[2].output_config)).not.toContain("json_schema");
    expect(JSON.stringify(bodies[2].system)).toContain("OUTPUT: reply with only one JSON object");
  });

  it("reports every attempt's reason and request id when all fail", async () => {
    const { ctx } = client([() => reject(400, "first problem", "req_a"), () => reject(400, "second problem", "req_b"), () => reject(400, "third problem", "req_c")]);
    const err = await callJSON(ctx, opts).catch((e: Error) => e.message);
    expect(err).toMatch(/first problem.*req_a.*second problem.*req_b.*third problem.*req_c/s);
  });

  it("does not retry a bad key", async () => {
    const { ctx, bodies } = client([() => reject(401, "invalid x-api-key", "req_k")]);
    await expect(callJSON(ctx, opts)).rejects.toThrow();
    expect(bodies).toHaveLength(1);
  });

  it("names the category when the safety filter declines", async () => {
    const { ctx } = client([() => sse("", "refusal")]);
    await expect(callJSON(ctx, opts)).rejects.toThrow(/safety filter declined/);
  });
});
