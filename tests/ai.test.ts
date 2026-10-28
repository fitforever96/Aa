import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { run as runWrite, Body as WriteBody } from "@/lib/ai/tasks/write";
import { run as runResearch } from "@/lib/ai/tasks/research";
import { applyWritingRevisions } from "@/lib/commands/ops";
import { customerPriceMap } from "@/lib/engine/pricing";
import { generateDocument } from "@/lib/writer/generate";
import { writerContext } from "@/lib/writer/aiPayload";
import { SEED_CAPABILITIES } from "@/lib/seed";
import { deviceProgram, proposalWith, settings } from "./helpers";

/** Builds an SSE stream like the Messages API returns for streaming requests. */
function sse(content: unknown[], stop = "end_turn") {
  const ev: string[] = [];
  const push = (type: string, data: object) => ev.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  push("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  content.forEach((block, index) => {
    const b = block as { type: string; text?: string };
    if (b.type === "text") {
      push("content_block_start", { index, content_block: { type: "text", text: "" } });
      push("content_block_delta", { index, delta: { type: "text_delta", text: b.text } });
    } else push("content_block_start", { index, content_block: block });
    push("content_block_stop", { index });
  });
  push("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } });
  push("message_stop", {});
  return new Response(ev.join(""), { headers: { "content-type": "text/event-stream" } });
}

function fakeClient(responses: (() => Response)[]) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const h: Record<string, string> = {};
    new Headers(url instanceof Request ? url.headers : undefined).forEach((v, k) => (h[k] = v));
    new Headers(init?.headers).forEach((v, k) => (h[k] = v));
    calls.push({ url: String(url), headers: h, body: JSON.parse(String(init?.body)) });
    return responses[calls.length - 1]();
  };
  const client = new Anthropic({ apiKey: "sk-ant-test", dangerouslyAllowBrowser: true, fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
  return { client, calls };
}

describe("Claude on-device request", () => {
  it("sends a browser-safe, prompt-cached, schema-constrained request with the master memory", async () => {
    const p = proposalWith(deviceProgram(40, 30));
    p.programs[0].pricing.recurringOverride = { cents: 15000, locked: true, lockedAt: "x", note: "" };
    p.document.sections = generateDocument(p, { settings, capabilities: SEED_CAPABILITIES, includeGuarantee: false, includeReporting: false });
    const exec = p.document.sections.find((s) => s.type === "executive_overview")!;
    const reply = { revisions: [{ sectionId: exec.id, eyebrow: "Executive Overview", headline: "A program built for", headlineAccent: "the site.", body: "Sharper overview. Now only $1 per visit.", items: [], callout: "" }], notes: [] };
    const { client, calls } = fakeClient([() => sse([{ type: "text", text: JSON.stringify(reply) }])]);
    const body = WriteBody.parse({ instruction: "Stronger overview", context: writerContext(p), sections: p.document.sections.map((s) => ({ id: s.id, type: s.type, eyebrow: s.eyebrow, headline: s.headline, headlineAccent: s.headlineAccent, body: s.body, items: s.items, callout: s.callout, contractual: s.contractual })), targetSectionIds: [exec.id], research: [], knowledge: [] });
    const out = await runWrite({ client, model: "claude-opus-5-5", memory: "MASTER MEMORY TEST TEXT" }, body);
    const req = calls[0];
    expect(req.url).toContain("/v1/messages");
    expect(req.headers["x-api-key"] ?? req.headers["authorization"]).toMatch(/sk-ant-test/);
    expect(req.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(req.body.model).toBe("claude-opus-5-5");
    const sys = req.body.system as { text: string; cache_control: object }[];
    expect(sys[0].text).toContain("MASTER MEMORY TEST TEXT");
    expect(sys[0].cache_control).toEqual({ type: "ephemeral" });
    expect((req.body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(JSON.stringify(req.body.messages)).not.toMatch(/\$210|technicianMinutes|laborRate/);
    // The response goes through the revision guard: wording changes, prices never do.
    const merged = applyWritingRevisions(p, out.revisions);
    expect(customerPriceMap(merged.proposal)).toEqual(customerPriceMap(p));
    expect(merged.changed).toEqual([exec.id]);
  });

  it("research keeps only URLs the web-search tool actually returned", async () => {
    const findings = { findings: [{ topic: "Mice", summary: "Seal entry points.", relevance: "Supports exclusion recommendations.", sourceUrls: ["https://www.epa.gov/rodents", "https://made-up.example/fake"] }] };
    const { client, calls } = fakeClient([
      () =>
        sse([
          { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "house mouse IPM" } },
          { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", url: "https://www.epa.gov/rodents", title: "EPA — Rodents", encrypted_content: "x", page_age: null }] },
          { type: "text", text: "```json\n" + JSON.stringify(findings) + "\n```" },
        ]),
    ]);
    const out = await runResearch({ client, model: "claude-opus-5-5", memory: "" }, { topics: ["House mice"], context: "warehouse" });
    expect((calls[0].body.tools as { type: string; allowed_domains: string[] }[])[0].allowed_domains).toContain("orkin.com");
    expect(out.findings[0].sources.map((s) => s.url)).toEqual(["https://www.epa.gov/rodents"]);
    expect(out.findings[0].unverifiedUrls).toEqual(["https://made-up.example/fake"]);
    expect(out.searches).toBe(1);
  });
});
