"use client";

/**
 * Original intro sound for Proposal Studio, synthesized with the Web Audio API
 * (no audio file): a low swell, a rising D-major arpeggio and a bright bell chord
 * with a soft reverb tail. About 3 seconds.
 */

const SOUND_KEY = "ops-intro-sound";

export function introSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setIntroSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
}

type Ctx = AudioContext;

function reverb(ctx: Ctx, seconds = 2.4): ConvolverNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const c = ctx.createConvolver();
  c.buffer = buf;
  return c;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Bell-like tone: sine fundamental plus a quiet inharmonic partial, fast attack, long decay. */
function bell(ctx: Ctx, out: AudioNode, midi: number, at: number, gain: number, decay: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  g.connect(out);
  for (const [ratio, level, type] of [
    [1, 1, "sine"],
    [2.01, 0.18, "sine"],
    [3, 0.08, "triangle"],
  ] as const) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = hz(midi) * ratio;
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(at);
    o.stop(at + decay + 0.05);
  }
}

/** Warm pad: detuned saws through a slowly opening low-pass filter. */
function pad(ctx: Ctx, out: AudioNode, midis: number[], at: number, dur: number, gain: number) {
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(220, at);
  f.frequency.exponentialRampToValueAtTime(2400, at + dur * 0.55);
  f.frequency.exponentialRampToValueAtTime(600, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  f.connect(g).connect(out);
  for (const m of midis)
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(m);
      o.detune.value = detune;
      o.connect(f);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
}

let shared: AudioContext | null = null;

function context(): AudioContext | null {
  if (shared) return shared;
  const AC = typeof window !== "undefined" ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
  if (!AC) return null;
  shared = new AC();
  return shared;
}

/**
 * Plays the intro sound. Returns false when the browser blocks audio until the user
 * taps (iOS does this on launch); call again from a tap handler to play it then.
 */
export async function playChime(): Promise<boolean> {
  const ctx = context();
  if (!ctx) return false;
  if (ctx.state !== "running") {
    await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 120))]);
    if ((ctx.state as string) !== "running") return false;
  }
  const t = ctx.currentTime + 0.05;
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  const verb = reverb(ctx);
  verb.connect(wet).connect(master);
  const dry = ctx.createGain();
  dry.connect(master);
  dry.connect(verb);

  // Low swell (D2 + A2) under everything.
  pad(ctx, dry, [38, 45, 50], t, 2.6, 0.06);
  // Rising arpeggio D4 F#4 A4 D5, timed with the logo letters.
  [62, 66, 69, 74].forEach((m, i) => bell(ctx, dry, m, t + 0.12 + i * 0.11, 0.16, 1.1));
  // Arrival chord with the red bar: D5 F#5 A5 + D6 sparkle.
  for (const m of [74, 78, 81]) bell(ctx, dry, m, t + 0.62, 0.13, 2.4);
  bell(ctx, dry, 86, t + 0.66, 0.07, 1.8);
  bell(ctx, dry, 93, t + 1.05, 0.035, 1.2);
  return true;
}
