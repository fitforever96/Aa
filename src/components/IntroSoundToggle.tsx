"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Toggle } from "@/components/ui";
import { introSoundEnabled, playChime, setIntroSound } from "@/lib/chime";

/** Per-device preference for the launch sound, plus a way to hear it. */
export function IntroSoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(introSoundEnabled()), []);
  return (
    <div className="mt-3 space-y-2">
      <Toggle
        checked={on}
        onChange={(v) => {
          setOn(v);
          setIntroSound(v);
        }}
        label="Intro sound"
        description="Plays an original chime with the opening animation. iPhone may hold the sound until you tap the screen."
      />
      <button className="btn-ghost btn-sm" onClick={() => void playChime()}>
        <Play size={14} /> Hear it
      </button>
    </div>
  );
}
