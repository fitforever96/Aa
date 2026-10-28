import { z } from "zod";
import { callJSON, research, extractJson, type AICtx } from "../engine";
import { writingStandard, planningStandard } from "../prompts";
import type Anthropic from "@anthropic-ai/sdk";


export const Body = z.object({
  fileName: z.string().max(200),
  text: z.string().max(300_000).optional(),
  images: z.array(z.string().regex(/^[A-Za-z0-9+/=]+$/).max(3_000_000)).max(8).optional(),
});

const Field = <T extends z.ZodTypeAny>(t: T) => z.object({ value: t.nullable(), confidence: z.enum(["high", "medium", "low"]), evidence: z.string() });

const Out = z.object({
  customer: Field(z.string()),
  propertyName: Field(z.string()),
  address: Field(z.string()),
  contact: Field(z.string()),
  serviceScope: z.array(z.string()),
  frequencies: z.array(z.object({ program: z.string(), frequency: z.string(), evidence: z.string() })),
  equipment: z.array(z.object({ name: z.string(), quantity: z.number().nullable(), unitPrice: z.string().nullable(), evidence: z.string(), confidence: z.enum(["high", "medium", "low"]) })),
  charges: z.array(z.object({ label: z.string(), kind: z.enum(["initial", "recurring", "equipment", "specialty", "other"]), amount: z.string(), basis: z.string(), evidence: z.string(), confidence: z.enum(["high", "medium", "low"]) })),
  contractDuration: Field(z.string()),
  exclusions: z.array(z.string()),
  guarantees: z.array(z.string()),
  customerResponsibilities: z.array(z.string()),
  notes: z.array(z.string()),
});

const SYSTEM = `Extract structured facts from a previously completed Orkin commercial pest-management proposal for Anthony Acosta's review.
- Copy amounts exactly as written (e.g. "$150.00 per visit"); never compute or infer prices.
- Every value needs short verbatim evidence. If a value is absent, use null with confidence "low".
- Mark OCR-derived or ambiguous values as medium/low confidence.
- Do not merge conflicting prices; list each occurrence.`;

export async function run(ctx: AICtx, body: z.infer<typeof Body>) {

    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
    for (const img of body.images ?? []) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: img } });
    content.push({ type: "text", text: `File: ${body.fileName}\n\n${body.text ? `Extracted text:\n${body.text}` : "The document pages are provided as images (scanned). Perform OCR carefully."}` });
    const out = await callJSON(ctx, { system: SYSTEM, content, schema: Out, effort: "medium" });
    return ({ extraction: out, method: body.images?.length ? "ai_ocr" : "ai_text" });
}
