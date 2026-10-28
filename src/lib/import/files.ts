"use client";

import { loadPdfjs } from "../pdf/client";

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const IMPORT_ACCEPT = ".pdf,.docx,.txt,.md,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/json";

export type ReadResult = { kind: "pdf" | "docx" | "text" | "json"; text: string; pages?: number; bytes: Uint8Array };

export async function readImportFile(file: File): Promise<ReadResult> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("File is larger than 25 MB.");
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    if (head !== "%PDF-") throw new Error("This file is not a valid PDF.");
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      let lastY: number | null = null;
      for (const it of tc.items as { str: string; transform: number[] }[]) {
        if (lastY !== null && Math.abs(it.transform[5] - lastY) > 4) text += "\n";
        text += it.str + " ";
        lastY = it.transform[5];
      }
      text += "\n\n";
    }
    return { kind: "pdf", text, pages: doc.numPages, bytes };
  }
  if (name.endsWith(".docx")) {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("This file is not a valid .docx document.");
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
    return { kind: "docx", text: r.value, bytes };
  }
  if (name.endsWith(".json")) return { kind: "json", text: new TextDecoder().decode(bytes), bytes };
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) return { kind: "text", text: new TextDecoder().decode(bytes), bytes };
  throw new Error("Unsupported file type. Use PDF, DOCX, TXT or a Proposal Studio JSON export. (Older .doc files: save as .docx first.)");
}

/** Render PDF pages to PNG (base64, no prefix) for AI OCR of scanned documents. */
export async function pdfPagesToPng(bytes: Uint8Array, maxPages = 6): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1.6 });
    const c = document.createElement("canvas");
    c.width = vp.width;
    c.height = vp.height;
    await page.render({ canvas: c, viewport: vp }).promise;
    out.push(c.toDataURL("image/png").split(",")[1]);
  }
  return out;
}
