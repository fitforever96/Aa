"use client";

/**
 * Original intro sound for Proposal Studio, synthesized with the Web Audio API
 * (no audio file): a low swell, a rising D-major arpeggio and a bright bell chord
 * with a soft reverb tail. About 3 seconds.
 *
 * It is rendered once offline to a WAV and played through an <audio> element: on iPhone,
 * live Web Audio is muted by the silent switch and can stall on resume, while media
 * playback is not.
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

type Ctx = BaseAudioContext;

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

const SR = 44100;
const LENGTH_S = 3.4;

function compose(ctx: Ctx) {
  const t = 0.05;
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
}

/** 16-bit PCM WAV. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, x: string) => [...x].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  data.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVEfmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Blob([data.buffer], { type: "audio/wav" });
}

let audio: HTMLAudioElement | null = null;
let preparing: Promise<HTMLAudioElement | null> | null = null;

/** Renders the chime once (a few milliseconds) so a later tap can play it instantly. */
export function prepareChime(): Promise<HTMLAudioElement | null> {
  if (audio) return Promise.resolve(audio);
  if (preparing) return preparing;
  const OAC = typeof window !== "undefined" ? window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext : undefined;
  if (!OAC) return Promise.resolve(null);
  preparing = (async () => {
    try {
      const off = new OAC(2, Math.ceil(SR * LENGTH_S), SR);
      compose(off);
      const rendered = await off.startRendering();
      const el = new Audio(URL.createObjectURL(encodeWav(rendered)));
      el.preload = "auto";
      el.setAttribute("playsinline", "");
      audio = el;
      return el;
    } catch {
      preparing = null;
      return null;
    }
  })();
  return preparing;
}

/**
 * Plays the intro sound. Call it directly inside a tap handler (no await before it) so iPhone
 * treats it as user-initiated. Resolves false if the sound isn't ready yet or the browser
 * blocked it (iOS blocks sound on launch until the first tap).
 */
export function playChime(): Promise<boolean> {
  try {
    // Ask Safari to treat this as media playback, which isn't muted by the silent switch.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
  } catch {}
  if (!audio) {
    void prepareChime();
    return Promise.resolve(false);
  }
  audio.currentTime = 0;
  return audio.play().then(
    () => true,
    () => false,
  );
}
