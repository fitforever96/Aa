"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Toggle } from "@/components/ui";
import { introSoundEnabled, playChime, playUi, prepareChime, prepareUiSounds, setIntroSound, setUiSounds, uiSoundsEnabled } from "@/lib/chime";

/** Per-device sound preferences: launch/build sounds and interface clicks. */
export function IntroSoundToggle() {
  const [intro, setIntro] = useState(true);
  const [ui, setUi] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setIntro(introSoundEnabled());
    setUi(uiSoundsEnabled());
    void prepareChime();
    void prepareUiSounds();
  }, []);
  return (
    <div className="space-y-2">
      <Toggle
        checked={intro}
        onChange={(v) => {
          setIntro(v);
          setIntroSound(v);
        }}
        label="Launch and build sounds"
        description="Original sci-fi power-up sounds for the opening animation and proposal builds. iPhone holds sound until you touch the screen, so tap during the intro to hear it."
      />
      <Toggle
        checked={ui}
        onChange={(v) => {
          setUi(v);
          setUiSounds(v);
        }}
        label="Interface sounds"
        description="Short high-tech clicks when you tap buttons, tabs and cards. Follows your iPhone's silent switch."
      />
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost btn-sm"
          data-silent
          onClick={() => {
            setMsg(null);
            // playChime runs synchronously inside the tap so iPhone allows the sound.
            void playChime().then((ok) => !ok && setMsg("Couldn’t play the sound on this device. Check that the volume is up."));
          }}
        >
          <Play size={14} /> Hear the intro
        </button>
        <button className="btn-ghost btn-sm" data-silent onClick={() => (playUi("tick"), setTimeout(() => playUi("confirm"), 260), setTimeout(() => playUi("nav"), 650))}>
          <Play size={14} /> Hear the clicks
        </button>
      </div>
      {msg && <p className="text-[12px] text-warn">{msg}</p>}
    </div>
  );
}
