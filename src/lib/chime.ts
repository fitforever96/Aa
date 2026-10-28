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
/**
 * Cinematic master chain: a warm low-pass takes the edge off the top end, gentle compression
 * glues it, and a pre-delayed long reverb puts the sound in a large space.
 */
function chain(ctx: Ctx, gain: number, wetAmount = 0.42, verbSeconds = 3.2, warmth = 6200) {
  const master = ctx.createGain();
  master.gain.value = gain;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = warmth;
  lp.Q.value = 0.5;
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 3500;
  shelf.gain.value = -4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 2.2;
  comp.attack.value = 0.02;
  comp.release.value = 0.4;
  master.connect(lp).connect(shelf).connect(comp).connect(ctx.destination);
  const pre = ctx.createDelay(0.2);
  pre.delayTime.value = 0.04;
  const verb = reverb(ctx, verbSeconds, 3.4);
  const wet = ctx.createGain();
  wet.gain.value = wetAmount;
  pre.connect(verb).connect(wet).connect(master);
  const bus = ctx.createGain();
  bus.connect(master);
  bus.connect(pre);
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
  const g = env(ctx, at, Math.min(0.008, dur * 0.25), gain, 0.0001, dur);
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
  bp.Q.value = 5;
  const g = env(ctx, at, 0.004, gain * 0.45, 0.0001, 0.12);
  n.connect(bp).connect(g).connect(out);
  n.start(at);
  const th = ctx.createOscillator();
  th.type = "sine";
  th.frequency.setValueAtTime(110, at);
  th.frequency.exponentialRampToValueAtTime(42, at + 0.3);
  const tg = env(ctx, at, 0.008, gain, 0.0001, 0.45);
  th.connect(tg).connect(out);
  th.start(at);
  th.stop(at + 0.35);
  // Metallic ring.
  fm(ctx, out, pitch * 0.5, at + 0.006, 0.5, { ratio: 3.17, index: 0.9, gain: gain * 0.08, attack: 0.01 });
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
  car.type = "triangle";
  car.frequency.setValueAtTime(f0, at);
  car.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(250, at);
  lp.frequency.exponentialRampToValueAtTime(3200, at + dur);
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
  notes.forEach((m, i) => fm(ctx, out, hz(m), at + i * 0.03, dur, { ratio: 2.0, index: 0.9, gain, attack: 0.09, pan: (i / Math.max(1, notes.length - 1)) * 1.2 - 0.6 }));
  notes.slice(-2).forEach((m) => fm(ctx, out, hz(m + 12), at + 0.15, dur * 0.8, { ratio: 3.0, index: 0.4, gain: gain * 0.22, attack: 0.25 }));
}

// ───────────────────────── Cues ─────────────────────────

/** Launch: ~5.4 s. Low swell and soft data chirps → rising charge → deep lock → warm "online" chord. */
function composeIntro(ctx: Ctx) {
  const bus = chain(ctx, 0.55, 0.45, 3.6, 5600);
  sub(ctx, bus, 0.0, 2.6, 34, 55, 0.3);
  dataBurst(ctx, bus, 0.1, 1.3, 14, 0.022, 1200, 3000);
  sweepNoise(ctx, bus, 0.2, 1.4, 220, 3600, 0.035, 1.4);
  riser(ctx, bus, 0.3, 1.3, 90, 700, 0.03);
  lock(ctx, bus, 1.6, 0.24, 1600);
  hum(ctx, bus, [38, 45, 50], 1.6, 3.8, 0.035);
  chord(ctx, bus, [62, 66, 69, 73, 78], 1.66, 3.4, 0.05);
  blip(ctx, bus, 1318, 2.6, 0.07, 0.028, 1, -0.4);
  blip(ctx, bus, 1760, 2.7, 0.08, 0.026, 1, -0.4);
  blip(ctx, bus, 1318, 3.35, 0.07, 0.022, 1, 0.4);
  blip(ctx, bus, 1760, 3.45, 0.08, 0.02, 1, 0.4);
  fm(ctx, bus, hz(86), 4.0, 1.3, { ratio: 2.0, index: 0.4, gain: 0.02, attack: 0.3 });
}

/**
 * Mechanical "plate lock": a short resonant noise tick with a little low body. Fixed pitch,
 * no glide. Strings of these read as armor plates and servos seating into place.
 */
function plate(ctx: Ctx, out: AudioNode, at: number, gain: number, pitch: number, pan = 0) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = pitch;
  bp.Q.value = 7;
  const g = env(ctx, at, 0.002, gain, 0.0001, 0.045);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) {
    p.pan.value = pan;
    n.connect(bp).connect(g).connect(p).connect(out);
  } else n.connect(bp).connect(g).connect(out);
  n.start(at);
  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.value = 150;
  const bg = env(ctx, at, 0.003, gain * 0.6, 0.0001, 0.06);
  body.connect(bg).connect(out);
  body.start(at);
  body.stop(at + 0.08);
}

/** Pneumatic release: a short band of air, fixed band (no sweep). */
function hiss(ctx: Ctx, out: AudioNode, at: number, dur: number, gain: number, band = 2200) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = band;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  n.connect(bp).connect(g).connect(out);
  n.start(at);
  n.stop(at + dur + 0.05);
}

/** Steady reactor tone at a fixed pitch (no glide), fading in and holding. */
function reactor(ctx: Ctx, out: AudioNode, at: number, dur: number, gain: number) {
  hum(ctx, out, [38, 45], at, dur, gain);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = hz(38);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain * 2.4, at + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Holographic interface chatter: quiet glassy FM taps on fixed pentatonic pitches. */
function holo(ctx: Ctx, out: AudioNode, at: number, dur: number, count: number, gain: number) {
  const scale = [74, 76, 79, 81, 83, 86];
  for (let i = 0; i < count; i++) {
    const t = at + (i / count) * dur + Math.random() * 0.04;
    fm(ctx, out, hz(scale[Math.floor(Math.random() * scale.length)]), t, 0.12, { ratio: 2.0, index: 0.6, gain: gain * (0.6 + Math.random() * 0.4), attack: 0.006, pan: Math.random() * 1.4 - 0.7 });
  }
}

/**
 * Build start: ~3.4 s, "suit-up". Armor plates seat in an accelerating pattern over a steady
 * reactor tone, with pneumatic releases and holographic interface chatter, ending in a soft lock
 * and a warm chord. No pitch sweeps.
 */
function composeBuildStart(ctx: Ctx) {
  const bus = chain(ctx, 0.55, 0.36, 2.6, 5200);
  reactor(ctx, bus, 0.0, 3.4, 0.03);
  let t = 0.08;
  for (let i = 0; i < 22 && t < 2.2; i++) {
    plate(ctx, bus, t, 0.09 + (i % 3 === 0 ? 0.05 : 0), [1700, 2300, 1900, 2700][i % 4], i % 2 ? 0.45 : -0.45);
    t += Math.max(0.045, 0.16 - i * 0.007);
  }
  hiss(ctx, bus, 0.55, 0.35, 0.03, 2600);
  hiss(ctx, bus, 1.35, 0.4, 0.028, 1800);
  holo(ctx, bus, 0.9, 1.4, 10, 0.02);
  lock(ctx, bus, 2.35, 0.2, 1500);
  chord(ctx, bus, [62, 69, 74], 2.4, 1.1, 0.032);
}

/** Step locked: ~0.7 s. A pair of plates seating and a soft glassy confirm. */
function composeBuildStep(ctx: Ctx) {
  const bus = chain(ctx, 0.5, 0.36, 1.6, 5000);
  plate(ctx, bus, 0.0, 0.12, 2100, -0.3);
  plate(ctx, bus, 0.07, 0.12, 2700, 0.3);
  fm(ctx, bus, hz(81), 0.12, 0.35, { ratio: 2.0, index: 0.5, gain: 0.03, attack: 0.01 });
  fm(ctx, bus, hz(86), 0.2, 0.4, { ratio: 2.0, index: 0.4, gain: 0.025, attack: 0.01 });
}

/** Build complete: ~3.6 s. Final plates lock, a low thump (fixed pitch), a wide warm chord, quiet holo chatter. */
function composeBuildDone(ctx: Ctx) {
  const bus = chain(ctx, 0.55, 0.46, 3.8, 5600);
  [0, 0.06, 0.12].forEach((d, i) => plate(ctx, bus, d, 0.12, [1900, 2400, 3000][i], i - 1));
  lock(ctx, bus, 0.2, 0.22, 1400);
  const th = ctx.createOscillator();
  th.type = "sine";
  th.frequency.value = 55;
  const tg = env(ctx, 0.2, 0.01, 0.22, 0.0001, 1.0);
  th.connect(tg).connect(bus);
  th.start(0.2);
  th.stop(1.3);
  chord(ctx, bus, [62, 66, 69, 73, 78, 81], 0.26, 3.2, 0.05);
  holo(ctx, bus, 0.6, 1.0, 7, 0.016);
}

/** A very soft, low "thock": a rounded low tone with a slow-ish attack and a fast fade. */
function thock(ctx: Ctx, out: AudioNode, freq: number, at: number, dur: number, gain: number) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq * 1.15, at);
  o.frequency.exponentialRampToValueAtTime(freq, at + dur * 0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(lp).connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/**
 * Interface sounds: deliberately barely there. Low, rounded and very quiet so tapping
 * small controls feels tactile without drawing attention. Peaks are set per sound.
 */
const UI_SOUNDS = {
  tick: { seconds: 0.1, peak: 0.06, fn: (ctx: Ctx, out: AudioNode) => thock(ctx, out, 260, 0, 0.07, 0.5) },
  toggle: { seconds: 0.16, peak: 0.07, fn: (ctx: Ctx, out: AudioNode) => (thock(ctx, out, 262, 0, 0.07, 0.5), thock(ctx, out, 330, 0.055, 0.08, 0.45)) },
  confirm: { seconds: 0.22, peak: 0.09, fn: (ctx: Ctx, out: AudioNode) => (thock(ctx, out, 220, 0, 0.09, 0.5), thock(ctx, out, 330, 0.07, 0.12, 0.45)) },
  nav: { seconds: 0.16, peak: 0.07, fn: (ctx: Ctx, out: AudioNode) => (thock(ctx, out, 220, 0, 0.06, 0.45), thock(ctx, out, 294, 0.045, 0.08, 0.4)) },
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
  intro: { fn: composeIntro, seconds: 6.0, peak: 0.6 },
  buildStart: { fn: composeBuildStart, seconds: 3.8, peak: 0.52 },
  buildStep: { fn: composeBuildStep, seconds: 1.2, peak: 0.32 },
  buildDone: { fn: composeBuildDone, seconds: 4.0, peak: 0.6 },
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
          out.connect(ctx.destination);
          s.fn(ctx, out);
        },
        s.seconds,
        s.peak,
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
