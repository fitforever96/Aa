"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Toggle } from "@/components/ui";
import { introSoundEnabled, playChime, prepareChime, setIntroSound } from "@/lib/chime";

/** Per-device preference for the launch sound, plus a way to hear it. */
export function IntroSoundToggle() {
  const [on, setOn] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setOn(introSoundEnabled());
    void prepareChime();
  }, []);
  return (
    <div className="mt-3 space-y-2">
      <Toggle
        checked={on}
        onChange={(v) => {
          setOn(v);
          setIntroSound(v);
        }}
        label="Intro sound"
        description="Plays an original chime with the opening animation. iPhone usually holds sound until you touch the screen, so tap during the intro to hear it."
      />
      <button
        className="btn-ghost btn-sm"
        onClick={() => {
          setMsg(null);
          // playChime runs synchronously inside the tap so iPhone allows the sound.
          void playChime().then((ok) => !ok && setMsg("Couldn’t play the sound on this device. Check that the volume is up."));
        }}
      >
        <Play size={14} /> Hear it
      </button>
      {msg && <p className="text-[12px] text-warn">{msg}</p>}
    </div>
  );
}
