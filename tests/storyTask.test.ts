import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { run, StoryOut } from "@/lib/ai/tasks/story";

function sse(text: string) {
  const ev = [
    ["message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { index: 0 }],
    ["message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", {}],
  ] as const;
  return new Response(ev.map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

describe("story task request", () => {
  it("sends a schema-constrained request with the master memory and parses a valid story", async () => {
    const story = { hero: { eyebrow: "E", title: "T", subtitle: "S", tagline: "a | b", stats: [] }, blocks: [{ kind: "note", priority: 2, text: "Hello." }] };
    let body: Record<string, unknown> = {};
    const fetch = async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return sse(JSON.stringify(story));
    };
    const client = new Anthropic({ apiKey: "sk-ant-test", dangerouslyAllowBrowser: true, fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
    const out = await run({ client, model: "claude-opus-5-5", memory: "MEMORY" }, { facts: { a: 1 }, priceKeys: [{ key: "p0_recurring", label: "Weekly" }], length: "two_page" });
    expect(StoryOut.parse(out).blocks[0].kind).toBe("note");
    const schema = JSON.stringify((body.output_config as { format: { schema: unknown } }).format.schema);
    expect(schema).toContain("anyOf");
    expect(JSON.stringify(body.system)).toContain("MEMORY");
    expect(JSON.stringify(body.messages)).toContain("p0_recurring");
  });
});
