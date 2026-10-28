"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Mic, Square } from "lucide-react";

export type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function getRecognition(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dictation input. Uses the browser Speech Recognition API when the device exposes it.
 * When it does not (common in iOS Home Screen mode), the mic button is not shown as
 * functional — instead the user is directed to the iOS keyboard dictation key, which
 * always works in the text box.
 */
export function VoiceInput({ value, onChange, placeholder, rows = 5 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const base = useRef("");

  useEffect(() => setSupported(!!getRecognition()), []);

  const start = () => {
    const R = getRecognition();
    if (!R) return;
    setError(null);
    const r = new R();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    base.current = value ? value.trimEnd() + " " : "";
    r.onresult = (e) => {
      let fin = "";
      let tmp = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript;
        else tmp += res[0].transcript;
      }
      onChange((base.current + fin).replace(/\s+/g, " "));
      setInterim(tmp);
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone permission was denied. Allow it in iOS Settings › Safari › Microphone, or use the keyboard dictation key." : e.error === "network" ? "Speech recognition needs a connection on this device. Use keyboard dictation offline." : `Speech recognition stopped (${e.error}).`);
      setListening(false);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Could not start speech recognition.");
    }
  };
  const stop = () => rec.current?.stop();

  return (
    <div>
      <div className="relative">
        <textarea className="input min-h-[132px] resize-y pr-16 leading-relaxed" rows={rows} value={value + (interim ? (value ? " " : "") + interim : "")} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        {supported && (
          <button type="button" onClick={listening ? stop : start} className={clsx("absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full transition", listening ? "animate-pulse bg-red text-white" : "bg-surface3 text-ink hover:bg-red hover:text-white")} aria-label={listening ? "Stop dictation" : "Start dictation"}>
            {listening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
          </button>
        )}
      </div>
      <div className="mt-1.5 text-[12px] text-ink3">
        {supported === false && "Live speech recognition isn’t available in this browser mode. Tap the text box and use the 🎤 key on the iPhone keyboard to dictate."}
        {supported && !listening && !error && "Tap the microphone and describe the job. You can also use keyboard dictation."}
        {listening && <span className="text-red">Listening… tap stop when finished.</span>}
        {error && <span className="text-warn">{error}</span>}
      </div>
    </div>
  );
}
