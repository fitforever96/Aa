"use client";

import { useState } from "react";
import { KeyRound, Lock } from "lucide-react";
import { Spinner } from "@/components/ui";
import { useToast } from "@/components/shell/Toast";
import { decryptPack, WrongPasscodeError, type EncryptedPack } from "@/lib/privatePack";
import { importBackup } from "@/lib/db";
import { withBase } from "@/lib/base";

/** One-step loader for the encrypted private data pack (historical pricing, precedents, master memory). */
export function UnlockPrivateData({ compact }: { compact?: boolean }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBase("/private-pack.enc.json"), { cache: "no-store" });
      if (!res.ok) throw new Error("Couldn’t download your encrypted data. Check your connection and try again.");
      const pack = (await res.json()) as EncryptedPack;
      const data = await decryptPack(pack, code);
      const r = await importBackup(data, "merge");
      toast(`Private data loaded: ${r.counts.historical ?? 0} pricing records and your master memory`);
      setCode("");
    } catch (e) {
      setError(e instanceof WrongPasscodeError ? e.message : e instanceof Error ? e.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "" : "card border-warn/30 p-4"}>
      {!compact && (
        <div className="mb-3 flex items-start gap-3">
          <Lock size={20} className="mt-0.5 shrink-0 text-warn" />
          <div>
            <div className="text-[15px] font-semibold">Load your private data</div>
            <div className="text-[12.5px] leading-snug text-ink3">Your historical pricing, precedents and master memory are encrypted. Paste your passcode once on this device to load them.</div>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input font-mono uppercase tracking-wider"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Private data passcode"
          onKeyDown={(e) => e.key === "Enter" && code.trim() && unlock()}
        />
        <button className="btn-primary shrink-0" disabled={busy || code.replace(/[^a-z0-9]/gi, "").length < 8} onClick={unlock}>
          {busy ? <Spinner /> : <KeyRound size={16} />} Unlock
        </button>
      </div>
      {error && <div className="mt-2 text-[12.5px] text-red">{error}</div>}
    </div>
  );
}
