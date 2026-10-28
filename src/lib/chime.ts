"use client";

/**
 * Proposal Studio sound design: original, synthesized "high-tech interface" sounds
 * (sub-bass power-ups, FM sweeps, data chirps, metallic servo locks, bright FM chords).
 * Nothing is sampled; every sound is generated here with the Web Audio API.
 *
 * Long cues (launch, build) are rendered once to WAV and played through <audio>
 * elements, which iPhone doesn't mute with the silent switch. Short interface clicks
 * use Web Audio buffers for low latency (they follow the silent switch, like iOS's own clicks).
 */

const INTRO_KEY = "ops-intro-sound";
const UI_KEY = "ops-ui-sound";

const flag = (key: string) => {
  try {
    return localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
};
const setFlag = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {}
};
export const introSoundEnabled = () => flag(INTRO_KEY);
export const setIntroSound = (on: boolean) => setFlag(INTRO_KEY, on);
export const uiSoundsEnabled = () => flag(UI_KEY);
export const setUiSounds = (on: boolean) => setFlag(UI_KEY, on);

type Ctx = BaseAudioContext;
const SR = 44100;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// ───────────────────────── Building blocks ─────────────────────────

function reverb(ctx: Ctx, seconds = 2.4, decay = 2.6): ConvolverNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  const c = ctx.createConvolver();
  c.buffer = buf;
  return c;
}

/** Master chain: compressor, a stereo-ish reverb send. Returns the dry bus to connect voices to. */
function chain(ctx: Ctx, gain: number, wetAmount = 0.3, verbSeconds = 2.4) {
  const master = ctx.createGain();
  master.gain.value = gain;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  const verb = reverb(ctx, verbSeconds);
  const wet = ctx.createGain();
  wet.gain.value = wetAmount;
  verb.connect(wet).connect(master);
  const bus = ctx.createGain();
  bus.connect(master);
  bus.connect(verb);
  return bus;
}

function env(ctx: Ctx, at: number, attack: number, peak: number, decayTo: number, dur: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, decayTo), at + dur);
  return g;
}

/** FM voice: metallic, glassy tones typical of sci-fi interfaces. */
function fm(ctx: Ctx, out: AudioNode, freq: number, at: number, dur: number, opts: { ratio?: number; index?: number; gain?: number; attack?: number; type?: OscillatorType; pan?: number } = {}) {
  const { ratio = 2.0, index = 2.5, gain = 0.1, attack = 0.006, type = "sine", pan = 0 } = opts;
  const car = ctx.createOscillator();
  car.type = type;
  car.frequency.value = freq;
  const mod = ctx.createOscillator();
  mod.frequency.value = freq * ratio;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * index, at);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, freq * index * 0.05), at + dur);
  mod.connect(modGain).connect(car.frequency);
  const g = env(ctx, at, attack, gain, 0.0001, dur);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) {
    p.pan.value = pan;
    car.connect(g).connect(p).connect(out);
  } else car.connect(g).connect(out);
  car.start(at);
  mod.start(at);
  car.stop(at + dur + 0.05);
  mod.stop(at + dur + 0.05);
}

/** Short sine blip with a pitch flick (data chirp / UI tick). */
function blip(ctx: Ctx, out: AudioNode, freq: number, at: number, dur: number, gain: number, bend = 0.75, pan = 0) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(freq * bend, at + dur);
  const g = env(ctx, at, 0.002, gain, 0.0001, dur);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) {
    p.pan.value = pan;
    o.connect(g).connect(p).connect(out);
  } else o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noiseBuffer(ctx: Ctx, seconds: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Filtered noise moving between two frequencies (whoosh / servo). */
function sweepNoise(ctx: Ctx, out: AudioNode, at: number, dur: number, f0: number, f1: number, gain: number, q = 3) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, at);
  bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  n.connect(bp).connect(g).connect(out);
  n.start(at);
  n.stop(at + dur + 0.05);
}

/** Metallic servo "lock": resonant noise transient plus a low thump. */
function lock(ctx: Ctx, out: AudioNode, at: number, gain = 0.25, pitch = 2200) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.08);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = pitch;
  bp.Q.value = 14;
  const g = env(ctx, at, 0.001, gain, 0.0001, 0.09);
  n.connect(bp).connect(g).connect(out);
  n.start(at);
  const th = ctx.createOscillator();
  th.type = "sine";
  th.frequency.setValueAtTime(140, at);
  th.frequency.exponentialRampToValueAtTime(48, at + 0.22);
  const tg = env(ctx, at, 0.003, gain * 0.9, 0.0001, 0.3);
  th.connect(tg).connect(out);
  th.start(at);
  th.stop(at + 0.35);
  // Metallic ring.
  fm(ctx, out, pitch * 0.5, at + 0.004, 0.35, { ratio: 3.17, index: 1.4, gain: gain * 0.18 });
}

/** Sub-bass swell. */
function sub(ctx: Ctx, out: AudioNode, at: number, dur: number, f0: number, f1: number, gain: number) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Rising FM riser (the "charging" sweep). */
function riser(ctx: Ctx, out: AudioNode, at: number, dur: number, f0: number, f1: number, gain: number) {
  const car = ctx.createOscillator();
  car.type = "sawtooth";
  car.frequency.setValueAtTime(f0, at);
  car.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 6;
  lp.frequency.setValueAtTime(300, at);
  lp.frequency.exponentialRampToValueAtTime(6000, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.08);
  car.connect(lp).connect(g).connect(out);
  car.start(at);
  car.stop(at + dur + 0.1);
}

/** Bursts of tiny random-pitch chirps, accelerating: "data streaming". */
function dataBurst(ctx: Ctx, out: AudioNode, at: number, dur: number, count: number, gain: number, lo = 1500, hi = 4200) {
  let t = at;
  for (let i = 0; i < count; i++) {
    const k = i / count;
    const step = (dur / count) * (1.6 - k * 1.1);
    const f = lo + Math.random() * (hi - lo);
    blip(ctx, out, Math.round(f / 120) * 120, t, 0.018 + Math.random() * 0.02, gain * (0.5 + Math.random() * 0.5), 0.9, Math.random() * 1.6 - 0.8);
    t += step;
  }
}

/** Warm reactor hum: detuned saws through a slowly opening filter with a slight pulse. */
function hum(ctx: Ctx, out: AudioNode, notes: number[], at: number, dur: number, gain: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(180, at);
  lp.frequency.exponentialRampToValueAtTime(1600, at + dur * 0.5);
  lp.frequency.exponentialRampToValueAtTime(400, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoG = ctx.createGain();
  lfoG.gain.value = gain * 0.25;
  lfo.connect(lfoG).connect(g.gain);
  lfo.start(at);
  lfo.stop(at + dur + 0.05);
  lp.connect(g).connect(out);
  for (const m of notes)
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(m);
      o.detune.value = det;
      o.connect(lp);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
}

/** Big glassy FM chord with a shimmer octave. */
function chord(ctx: Ctx, out: AudioNode, notes: number[], at: number, dur: number, gain: number) {
  notes.forEach((m, i) => fm(ctx, out, hz(m), at + i * 0.018, dur, { ratio: 2.0, index: 1.6, gain, attack: 0.01, pan: (i / Math.max(1, notes.length - 1)) * 1.2 - 0.6 }));
  notes.slice(-2).forEach((m) => fm(ctx, out, hz(m + 12), at + 0.06, dur * 0.8, { ratio: 3.5, index: 0.8, gain: gain * 0.35, attack: 0.02 }));
}

// ───────────────────────── Cues ─────────────────────────

/** Launch: ~5.4 s. Boot chirps → charging riser → servo lock → reactor online chord → confirmations. */
function composeIntro(ctx: Ctx) {
  const bus = chain(ctx, 0.6, 0.32, 3.2);
  sub(ctx, bus, 0.0, 2.4, 32, 55, 0.35);
  dataBurst(ctx, bus, 0.05, 1.3, 26, 0.05);
  sweepNoise(ctx, bus, 0.15, 1.35, 250, 7000, 0.07, 2.2);
  riser(ctx, bus, 0.25, 1.3, 90, 1100, 0.05);
  lock(ctx, bus, 1.6, 0.32, 2300);
  hum(ctx, bus, [38, 45, 50], 1.6, 3.6, 0.045);
  chord(ctx, bus, [62, 66, 69, 73, 78], 1.66, 3.2, 0.055);
  blip(ctx, bus, 1760, 2.55, 0.05, 0.06, 1, -0.4);
  blip(ctx, bus, 2640, 2.63, 0.06, 0.06, 1, -0.4);
  blip(ctx, bus, 1760, 3.3, 0.05, 0.05, 1, 0.4);
  blip(ctx, bus, 2640, 3.38, 0.06, 0.05, 1, 0.4);
  dataBurst(ctx, bus, 3.9, 0.5, 9, 0.035, 2600, 5200);
  fm(ctx, bus, hz(90), 4.2, 1.0, { ratio: 2.0, index: 0.6, gain: 0.03 });
}

/** Build start: ~3.4 s. Heavier power-up with accelerating charge pulses ending in a lock. */
function composeBuildStart(ctx: Ctx) {
  const bus = chain(ctx, 0.62, 0.28, 2.4);
  sub(ctx, bus, 0.0, 3.0, 30, 62, 0.38);
  sweepNoise(ctx, bus, 0.0, 0.45, 6000, 400, 0.05, 1.5);
  riser(ctx, bus, 0.2, 2.2, 70, 1400, 0.055);
  // Charge pulses accelerating from 6 to 26 per second.
  let t = 0.3;
  for (let i = 0; i < 30 && t < 2.45; i++) {
    blip(ctx, bus, 900 + i * 45, t, 0.03, 0.045, 0.85, i % 2 ? 0.3 : -0.3);
    t += 0.17 - i * 0.0048;
  }
  lock(ctx, bus, 2.5, 0.3, 2000);
  chord(ctx, bus, [62, 69, 74], 2.52, 0.9, 0.04);
}

/** Step locked: ~0.6 s. Three ascending data blips + a small lock. */
function composeBuildStep(ctx: Ctx) {
  const bus = chain(ctx, 0.55, 0.22, 1.2);
  [1320, 1760, 2640].forEach((f, i) => blip(ctx, bus, f, i * 0.05, 0.045, 0.07, 1, -0.3 + i * 0.3));
  lock(ctx, bus, 0.17, 0.14, 2600);
}

/** Build complete: ~3.4 s. Lock, sub thump, big reactor chord, sparkle, final confirm. */
function composeBuildDone(ctx: Ctx) {
  const bus = chain(ctx, 0.62, 0.34, 3.2);
  lock(ctx, bus, 0.0, 0.34, 1800);
  sub(ctx, bus, 0.0, 1.4, 70, 40, 0.3);
  chord(ctx, bus, [62, 66, 69, 73, 78, 81], 0.06, 3.0, 0.055);
  dataBurst(ctx, bus, 0.25, 0.7, 14, 0.035, 2400, 5600);
  blip(ctx, bus, 1760, 1.15, 0.06, 0.06, 1);
  blip(ctx, bus, 3520, 1.24, 0.09, 0.05, 1);
}

/** Interface sounds (short; Web Audio for low latency). */
const UI_SOUNDS = {
  tick: { seconds: 0.09, gain: 1, fn: (ctx: Ctx, out: AudioNode) => (blip(ctx, out, 2880, 0, 0.035, 0.07, 0.62), blip(ctx, out, 5760, 0.002, 0.012, 0.018, 0.8)) },
  confirm: {
    seconds: 0.3,
    gain: 1,
    fn: (ctx: Ctx, out: AudioNode) => {
      blip(ctx, out, 1568, 0, 0.05, 0.08, 1);
      blip(ctx, out, 2349, 0.06, 0.08, 0.08, 1);
      fm(ctx, out, 2349, 0.06, 0.22, { ratio: 3.01, index: 0.9, gain: 0.025 });
    },
  },
  nav: { seconds: 0.25, gain: 1, fn: (ctx: Ctx, out: AudioNode) => (sweepNoise(ctx, out, 0, 0.16, 900, 5200, 0.05, 2), blip(ctx, out, 1320, 0.05, 0.05, 0.05, 1.3)) },
  toggle: { seconds: 0.14, gain: 1, fn: (ctx: Ctx, out: AudioNode) => (blip(ctx, out, 1760, 0, 0.03, 0.06, 1), blip(ctx, out, 2640, 0.045, 0.04, 0.06, 1)) },
} as const;
export type UiSound = keyof typeof UI_SOUNDS;

// ───────────────────────── Rendering + playback ─────────────────────────

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

const OAC = () => (typeof window !== "undefined" ? window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext : undefined);

/** Render offline and normalize to a consistent peak so every sound lands at the same loudness. */
async function render(composeFn: (ctx: Ctx) => void, seconds: number, peakTarget = 0.85): Promise<AudioBuffer | null> {
  const C = OAC();
  if (!C) return null;
  try {
    const off = new C(2, Math.ceil(SR * seconds), SR);
    composeFn(off);
    const buf = await off.startRendering();
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    if (peak > 0) {
      const k = peakTarget / peak;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= k;
      }
    }
    return buf;
  } catch {
    return null;
  }
}

function mediaSession() {
  try {
    // Treat sounds as media playback so iPhone's silent switch doesn't mute the long cues.
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (s && s.type !== "playback") s.type = "playback";
  } catch {}
}

const CUES = {
  intro: { fn: composeIntro, seconds: 5.6, peak: 0.9 },
  buildStart: { fn: composeBuildStart, seconds: 3.6, peak: 0.85 },
  buildStep: { fn: composeBuildStep, seconds: 0.9, peak: 0.6 },
  buildDone: { fn: composeBuildDone, seconds: 3.6, peak: 0.9 },
} as const;
type Cue = keyof typeof CUES;
const cueEls: Partial<Record<Cue, HTMLAudioElement>> = {};
const cuePending: Partial<Record<Cue, Promise<HTMLAudioElement | null>>> = {};

function prepareCue(name: Cue): Promise<HTMLAudioElement | null> {
  if (cueEls[name]) return Promise.resolve(cueEls[name]!);
  if (cuePending[name]) return cuePending[name]!;
  const p = (async () => {
    const buf = await render(CUES[name].fn, CUES[name].seconds, CUES[name].peak);
    if (!buf) return null;
    const el = new Audio(URL.createObjectURL(encodeWav(buf)));
    el.preload = "auto";
    el.setAttribute("playsinline", "");
    cueEls[name] = el;
    return el;
  })();
  cuePending[name] = p;
  return p;
}

function playCue(name: Cue): Promise<boolean> {
  mediaSession();
  const el = cueEls[name];
  if (!el) {
    void prepareCue(name);
    return Promise.resolve(false);
  }
  el.currentTime = 0;
  return el.play().then(
    () => true,
    () => false,
  );
}

/** Silently play/pause inside a tap so iPhone lets the element play later on its own. */
function unlockCue(name: Cue) {
  const el = cueEls[name];
  if (!el) return;
  el.muted = true;
  void el
    .play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
      el.muted = false;
    })
    .catch(() => (el.muted = false));
}

// Launch sound (kept API).
export const prepareChime = () => prepareCue("intro");
export const playChime = () => playCue("intro");

// Build sounds.
export function prepareBuildSounds() {
  void prepareCue("buildStart");
  void prepareCue("buildStep");
  void prepareCue("buildDone");
}
/** Call inside the Build tap: plays the power-up and unlocks the step and completion sounds for later. */
export function playBuildStart() {
  if (!introSoundEnabled()) return;
  void playCue("buildStart");
  unlockCue("buildStep");
  unlockCue("buildDone");
}
export function playBuildStep() {
  if (introSoundEnabled()) void playCue("buildStep");
}
export function playBuildDone() {
  if (introSoundEnabled()) void playCue("buildDone");
}

// Interface clicks.
let uiCtx: AudioContext | null = null;
const uiBuffers: Partial<Record<UiSound, AudioBuffer>> = {};
let uiPreparing: Promise<void> | null = null;

export function prepareUiSounds(): Promise<void> {
  if (uiPreparing) return uiPreparing;
  uiPreparing = (async () => {
    for (const k of Object.keys(UI_SOUNDS) as UiSound[]) {
      const s = UI_SOUNDS[k];
      const buf = await render(
        (ctx) => {
          const out = ctx.createGain();
          out.gain.value = s.gain;
          out.connect(ctx.destination);
          s.fn(ctx, out);
        },
        s.seconds,
        0.42,
      );
      if (buf) uiBuffers[k] = buf;
    }
  })();
  return uiPreparing;
}

/** Play an interface click. Call from the tap itself. */
export function playUi(kind: UiSound) {
  if (!uiSoundsEnabled()) return;
  const buf = uiBuffers[kind];
  if (!buf) {
    void prepareUiSounds();
    return;
  }
  try {
    if (!uiCtx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      uiCtx = new AC({ latencyHint: "interactive" });
    }
    if (uiCtx.state !== "running") void uiCtx.resume();
    const src = uiCtx.createBufferSource();
    src.buffer = buf;
    src.connect(uiCtx.destination);
    src.start();
  } catch {}
}
