"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Sparkles, Wand2 } from "lucide-react";
import { Callout, Card, Page, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { IntakePreview } from "@/components/IntakePreview";
import { parseIntake, type IntakeExtraction } from "@/lib/commands/parse";
import { createProposal } from "@/lib/actions";
import { STARTER_TEMPLATES } from "@/lib/templates";
import { aiFetch, useAIStatus, useSettings } from "@/lib/client";
import { useToast } from "@/components/shell/Toast";
import type { ServiceCategory } from "@/lib/types";

function NewProposalInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const settings = useSettings();
  const ai = useAIStatus();
  const [text, setText] = useState("");
  const [intake, setIntake] = useState<IntakeExtraction | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const voiceFirst = params.get("mode") === "voice";

  const go = async (template?: string, x?: IntakeExtraction) => {
    setBusy(template ?? "intake");
    try {
      const p = await createProposal({ template, intake: x });
      router.push(`/proposal?id=${p.id}${x ? "&step=4" : ""}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create proposal", "error");
      setBusy(null);
    }
  };

  const interpretWithAI = async () => {
    setBusy("ai");
    try {
      const r = await aiFetch<{ intake: (Omit<IntakeExtraction, "frequency" | "raw" | "wantsEstimate" | "wantsPricing" | "services"> & { services: string[] }) | null }>("/api/ai/command", { command: text, summary: {} }, settings);
      const local = parseIntake(text);
      if (r.intake) setIntake({ ...local, ...Object.fromEntries(Object.entries(r.intake).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))), services: (r.intake.services.length ? r.intake.services : local.services) as ServiceCategory[], frequency: local.frequency, raw: text });
      else setIntake(local);
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI interpretation failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="New Proposal" eyebrow="Start" back="/" />
      <Page>
        <SectionTitle>Describe the job</SectionTitle>
        <Card hud>
          <VoiceInput
            value={text}
            onChange={(v) => {
              setText(v);
              setIntake(null);
            }}
            placeholder={voiceFirst ? "e.g. New proposal for a 250,000-square-foot distribution warehouse. Mice around the loading docks and office entrances. 35 exterior bait stations, 50 Tin Cats, weekly service." : "Dictate or type: property, size, pests, equipment counts and frequency…"}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={!text.trim()} onClick={() => setIntake(parseIntake(text))}>
              <Wand2 size={16} /> Extract details
            </button>
            {ai?.configured && (
              <button className="btn-ghost" disabled={!text.trim() || !!busy} onClick={interpretWithAI}>
                {busy === "ai" ? <Spinner /> : <Sparkles size={16} />} Interpret with AI
              </button>
            )}
          </div>
          {intake && (
            <div className="mt-4 animate-rise">
              <IntakePreview x={intake} />
              <button className="btn-primary mt-3 w-full" disabled={!!busy} onClick={() => go(undefined, intake)}>
                {busy === "intake" ? <Spinner /> : null} Create proposal & show estimate <ArrowRight size={18} />
              </button>
              <p className="mt-2 text-[12px] text-ink3">Only details you stated are applied. Nothing is invented; review every input on the next screens.</p>
            </div>
          )}
        </Card>

        <SectionTitle>Or start from a template</SectionTitle>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {STARTER_TEMPLATES.map((t) => (
            <button key={t.key} disabled={!!busy} onClick={() => go(t.key)} className="card flex items-center gap-3 p-4 text-left transition hover:bg-surface2/60 active:scale-[0.99]">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{t.name}</div>
                <div className="mt-0.5 text-[12.5px] text-ink3">{t.description}</div>
              </div>
              {busy === t.key ? <Spinner /> : <ArrowRight size={17} className="shrink-0 text-ink3" />}
            </button>
          ))}
        </div>
        <Callout className="mt-5">Templates set structure only — property model, services and frequency. They never apply historical customer prices; equipment prices must be set or approved by you.</Callout>
      </Page>
    </>
  );
}

export default function NewProposal() {
  return (
    <Suspense>
      <NewProposalInner />
    </Suspense>
  );
}
