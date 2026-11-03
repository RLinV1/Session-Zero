import type { AnimationDef, AnimationShape } from "@vtt/shared";
import { SHAPE_DEFAULTS, withDefaults } from "./effectPresets";
import type { RunningFx } from "./fx";
import { DICE_BODY, DICE_CLACKS, DICE_CLATTER, DICE_CONTACT, DICE_HAND_RATTLES, DICE_RATTLE, DICE_ROLL, DICE_SLIDE, DICE_TAP, DICE_TAPS, DICE_TICK, REDUCED_SOUNDS, SFX_CLIPS, SHAPE_SOUNDS, sfxClipUrl, type FilterSpec, type NoiseColor, type SfxClip, type SoundLayer } from "./fxSoundRecipes";
import { getClientSettings, subscribeClientSettings } from "../ui/clientSettings";
import { THROW_CONTACTS, THROW_MS, THROW_SLIDE_FROM } from "../ui/diceGeometry";

/**
 * Sound for the attack and nuke animations, played with the Web Audio API. Each shape has a themed
 * recipe (`fxSoundRecipes.ts`, planned in docs/SOUND-PLAN.md): recorded CC0 clips from `public/sfx`
 * over synthesized tone and noise, timed by fractions of the animation's duration so an impact stays
 * on the frame it lands on whatever duration the animation is given. A clip that has not loaded
 * yet is left out of that play; the synth layers still sound. Sound is a per-viewer
 * client effect: nothing here is sent, stored or seen by anyone else. The library thumbnails never
 * call it, so they stay silent.
 */

/** Sounds playing at once; a further one is skipped rather than stacked louder. */
export const MAX_SOUNDS = 6;
/** The same shape starting again this soon (one attack at several targets) is heard once. */
export const SAME_SHAPE_GAP_S = 0.06;
/** Most times one layer repeats, whatever the animation's count. */
export const MAX_REPEATS = 24;
/** Seconds before the first layer starts: the picture's first frame is up to a frame late, and sound may lead it but not trail it. */
const LOOKAHEAD_S = 0.02;
/** The master limiter looks ahead this far, so everything leaves it this much later than scheduled. */
const LIMITER_DELAY_S = 0.006;
/** Seconds a sound cut short takes to fade, so it never clicks. */
const CUT_FADE_S = 0.08;
/** How long before its beat a riser is at its loudest and starts dropping out. */
const RISE_BREATH_S = 0.03;
/** Shortest attack: anything sharper clicks. */
const MIN_ATTACK_S = 0.0015;
const SILENT = 0.0001;

/** One layer instance placed in time, before any Web Audio node exists. Times are in seconds from the start. */
export interface ScheduledVoice {
  layer: SoundLayer;
  start: number;
  dur: number;
  attack: number;
  gain: number;
  /** Multiplies every frequency of the layer: its oscillator sweep, its filter, a clip's playback rate. */
  pitch: number;
  /** When the hit lands: `start` itself, except for a clip, which starts its own hit time earlier. */
  beat: number;
  /** Seconds into a clip to start from, when its hit is too close to the animation's start. */
  offset: number;
  /** Stereo position, -1..1. */
  pan: number;
  /** A tone layer's `glide`, in seconds at this play's speed. */
  glide?: number;
}

export interface ScheduleOptions {
  /** Reduced animations: the shape's one soft cue, at once. */
  reduced: boolean;
  /** 0..1, for the per-play variation; `Math.random` in the app, fixed in tests. */
  rng: () => number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Louder for an animation drawn bigger than its shape's default, quieter for a smaller one. */
export function playGain(def: AnimationDef): number {
  return clamp(1 + 0.25 * (def.size - SHAPE_DEFAULTS[def.shape].size), 0.7, 1.25);
}

/** The low end follows the map shake: more shake than the default, more weight. */
function bassGain(def: AnimationDef): number {
  const base = SHAPE_DEFAULTS[def.shape].shake;
  return base > 0 ? clamp(Math.sqrt(def.shake / base), 0.6, 1.3) : 1;
}

/** Sub, thump and rumble layers: what the map shake should be felt in. */
const isLowEnd = (layer: SoundLayer) => (layer.kind === "tone" ? layer.freq[0] < 250 : layer.kind === "noise" && layer.color === "brown");

/**
 * Places every layer of `def`'s recipe in time. Pure: the Web Audio side only turns this list into
 * nodes, and the tests check it here.
 */
export function scheduleSound(def: AnimationDef, { reduced, rng }: ScheduleOptions): ScheduledVoice[] {
  const d = withDefaults(def);
  const base = SHAPE_DEFAULTS[def.shape];
  // The still marker of reduced animations has no timeline to follow.
  const scale = reduced ? 1 : def.duration / base.duration;
  // A bigger effect sounds a little lower; each play is a few percent off the last.
  const basePitch = (def.size / base.size) ** -0.15 * (0.96 + rng() * 0.08);
  const gain = playGain(def);
  const bass = bassGain(def);
  const voices: ScheduledVoice[] = [];
  for (const layer of reduced ? REDUCED_SOUNDS[def.shape] : SHAPE_SOUNDS[def.shape]) {
    const at = typeof layer.at === "function" ? layer.at(d) : layer.at;
    const { repeat } = layer;
    const wanted = !repeat ? 1 : repeat.count === "count" ? d.count : typeof repeat.count === "function" ? repeat.count(d) : repeat.count;
    const count = clamp(Math.round(wanted), 1, MAX_REPEATS);
    const every = !repeat ? 0 : typeof repeat.every === "function" ? repeat.every(d) : repeat.every * scale;
    // Risers and held beds span beats, so they follow the duration exactly; a synth hit only stretches
    // a little, and a recorded one keeps its own length.
    const hitStretch = layer.kind === "sample" ? 1 : clamp(scale, 0.6, 1.6);
    const dur = layer.dur * (layer.env === "hit" ? hitStretch : scale);
    const layerGain = layer.gain * gain * (isLowEnd(layer) ? bass : 1);
    for (let i = 0; i < count; i++) {
      // Repeats after the first wander a little in time, level and pitch, like separate hits.
      const jitter = i === 0 ? 0 : (rng() - 0.5) * 0.012;
      const pitch = basePitch * (i === 0 ? 1 : 0.98 + rng() * 0.04);
      const beat = Math.max(0, at * def.duration + i * every + jitter);
      // A recorded hit starts early by its own lead-in, so the hit itself lands on the beat.
      const lead = layer.kind === "sample" && layer.env === "hit" ? SFX_CLIPS[layer.clip].hit / (layer.rate * pitch) : 0;
      const start = beat - lead;
      const speed = layer.kind === "sample" ? layer.rate * pitch : 1;
      voices.push({
        layer,
        start: Math.max(0, start),
        dur: dur - Math.max(0, -start),
        attack: clamp(layer.attack, MIN_ATTACK_S, dur / 2),
        gain: layerGain * (repeat?.decay ?? 1) ** i * (i === 0 ? 1 : 0.9 + rng() * 0.1),
        pitch,
        beat,
        offset: Math.max(0, -start) * speed,
        pan: layer.pan ?? (layer.spread ? (rng() * 2 - 1) * layer.spread : 0),
        ...(layer.kind === "tone" && layer.glide ? { glide: layer.glide * (layer.env === "hit" ? hitStretch : scale) } : {}),
      });
    }
  }
  return voices;
}

/** Seconds until the last voice has faded. */
export function soundLength(voices: readonly ScheduledVoice[]): number {
  return voices.reduce((end, v) => Math.max(end, v.start + v.dur), 0);
}

/** A playing sound; `stop` fades it out quickly. Safe to call twice. */
export interface SoundHandle {
  stop(): void;
}

// ---------- Web Audio ----------

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  reverb: AudioNode;
  /** A long, dark hall for thunder, bells and the nuke. */
  hall: AudioNode;
  noise: Record<NoiseColor, AudioBuffer>;
  /** Decoded clips; one still loading or that failed is missing. */
  clips: Map<SfxClip, AudioBuffer>;
}

let engine: Engine | null | undefined;
/** `startedAt` is page time (ms), so a just-created context whose clock has not started yet cannot merge two plays; `endsAt` is audio time. */
const playing: Array<{ shape: AnimationShape; startedAt: number; endsAt: number }> = [];

function audioContextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** The slider runs 0-100; loudness follows its square, which feels even across the range. */
function masterLevel(): number {
  const v = getClientSettings().soundVolume / 100;
  return v * v;
}

function noiseBuffer(ctx: AudioContext, color: NoiseColor): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === "white") data[i] = white * 0.5;
    else if (color === "pink") {
      // Paul Kellet's economy filter: close enough to -3 dB/octave for effects.
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.15;
    } else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

/** A stereo space after a short pre-delay: decaying noise, darker as it fades (1.8 s room, 3.5 s hall). */
function reverbImpulse(ctx: AudioContext, seconds = 1.8, preDelay = 0.015): AudioBuffer {
  const delay = Math.floor(ctx.sampleRate * preDelay);
  const length = delay + Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let smooth = 0;
    for (let i = delay; i < length; i++) {
      const t = (i - delay) / (length - delay);
      smooth += (Math.random() * 2 - 1 - smooth) * (0.6 - t * 0.45);
      data[i] = smooth * (1 - t) ** 2.4;
    }
  }
  return buffer;
}

/** Fetches and decodes every clip in the background (about 1 MB in all); a failure only loses that clip. */
function loadClips(e: Engine) {
  for (const name of Object.keys(SFX_CLIPS) as SfxClip[]) {
    void (async () => {
      try {
        const response = await fetch(sfxClipUrl(name));
        if (!response.ok) return;
        e.clips.set(name, await e.ctx.decodeAudioData(await response.arrayBuffer()));
      } catch {
        // Offline, blocked or undecodable: that clip stays out and the synth layers carry the sound.
      }
    })();
  }
}

function getEngine(): Engine | null {
  if (engine !== undefined) return engine;
  const Ctx = audioContextClass();
  if (!Ctx) return (engine = null);
  try {
    const ctx = new Ctx();
    // Many layers land together on an impact; the limiter keeps the sum from clipping.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    const master = ctx.createGain();
    master.gain.value = masterLevel();
    master.connect(compressor).connect(ctx.destination);
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbImpulse(ctx);
    const darken = ctx.createBiquadFilter();
    darken.type = "lowpass";
    darken.frequency.value = 6000;
    darken.connect(convolver).connect(master);
    const hallConvolver = ctx.createConvolver();
    hallConvolver.buffer = reverbImpulse(ctx, 3.5, 0.03);
    const hallDarken = ctx.createBiquadFilter();
    hallDarken.type = "lowpass";
    hallDarken.frequency.value = 3500;
    hallDarken.connect(hallConvolver).connect(master);
    engine = {
      ctx, master, reverb: darken, hall: hallDarken,
      noise: { white: noiseBuffer(ctx, "white"), pink: noiseBuffer(ctx, "pink"), brown: noiseBuffer(ctx, "brown") },
      clips: new Map(),
    };
    loadClips(engine);
    subscribeClientSettings(() => {
      if (engine) engine.master.gain.setTargetAtTime(masterLevel(), engine.ctx.currentTime, 0.03);
    });
    return engine;
  } catch {
    return (engine = null);
  }
}

let armed = false;
/**
 * Browsers keep audio suspended until the page is clicked or typed into. The first such gesture
 * starts the audio, so the first attack after it is heard on time.
 */
export function armSound() {
  if (armed || !audioContextClass()) return;
  armed = true;
  const unlock = () => {
    const e = getEngine();
    if (!e) return;
    if (e.ctx.state === "running") {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    } else void e.ctx.resume().catch(() => undefined);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function sweep(param: AudioParam, from: number, to: number, start: number, end: number) {
  param.setValueAtTime(from, start);
  if (to !== from) param.exponentialRampToValueAtTime(Math.max(1, to), end);
}

function addFilter(ctx: AudioContext, spec: FilterSpec, pitch: number, start: number, end: number): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = spec.type;
  filter.Q.value = spec.q ?? 0.8;
  const nyquist = ctx.sampleRate / 2 - 100;
  sweep(filter.frequency, Math.min(nyquist, spec.freq[0] * pitch), Math.min(nyquist, spec.freq[1] * pitch), start, end);
  return filter;
}

/** Builds one voice's nodes, all of which stop and disconnect themselves when it ends. A clip not loaded yet is skipped. */
function renderVoice(e: Engine, voice: ScheduledVoice, t0: number, out: GainNode) {
  const { ctx } = e;
  const { layer, pitch } = voice;
  // The recording it stands in for is here, so the stand-in is not needed.
  if (layer.unlessLoaded && e.clips.has(layer.unlessLoaded)) return;
  const start = t0 + voice.start;
  const end = start + voice.dur;
  let source: AudioScheduledSourceNode;
  let head: AudioNode;
  let offset: number | undefined;
  const lfos: AudioScheduledSourceNode[] = [];
  if (layer.kind === "tone") {
    const osc = ctx.createOscillator();
    osc.type = layer.wave;
    if (voice.glide) {
      osc.frequency.setValueAtTime(layer.freq[0] * pitch, start);
      osc.frequency.setTargetAtTime(layer.freq[1] * pitch, start, voice.glide);
    } else sweep(osc.frequency, layer.freq[0] * pitch, layer.freq[1] * pitch, start, end);
    if (layer.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = layer.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.value = layer.vibrato.depth * pitch;
      lfo.connect(depth).connect(osc.frequency);
      lfos.push(lfo);
    }
    source = osc;
    head = layer.filter ? osc.connect(addFilter(ctx, layer.filter, pitch, start, end)) : osc;
  } else if (layer.kind === "noise") {
    const noise = ctx.createBufferSource();
    noise.buffer = e.noise[layer.color];
    noise.loop = true;
    source = noise;
    head = noise.connect(addFilter(ctx, layer.filter, pitch, start, end));
    // Each noise layer reads the shared loop from its own place, so stacked layers never sound alike.
    offset = Math.random() * 1.5;
  } else {
    const buffer = e.clips.get(layer.clip);
    if (!buffer) return;
    const player = ctx.createBufferSource();
    player.buffer = buffer;
    player.playbackRate.value = layer.rate * pitch;
    // A bed held or risen longer than its clip loops its steady middle, clear of the faded ends.
    if (layer.env !== "hit" && voice.offset + voice.dur * layer.rate * pitch > buffer.duration) {
      player.loop = true;
      player.loopStart = buffer.duration * 0.1;
      player.loopEnd = buffer.duration * 0.65;
    }
    source = player;
    head = layer.filter ? player.connect(addFilter(ctx, layer.filter, 1, start, end)) : player;
    offset = Math.min(voice.offset, buffer.duration - 0.01);
  }
  const env = ctx.createGain();
  const peak = Math.max(SILENT, voice.gain);
  env.gain.setValueAtTime(SILENT, start);
  let stopAt = end + 0.02;
  if (layer.env === "rise") {
    // Grows to the beat, then drops out just before it: a breath of silence makes the hit land harder.
    const top = Math.max(start + voice.dur * 0.5, end - RISE_BREATH_S);
    env.gain.linearRampToValueAtTime(peak, top);
    env.gain.linearRampToValueAtTime(SILENT, top + RISE_BREATH_S * 0.6);
    stopAt = end + 0.02;
  } else {
    env.gain.linearRampToValueAtTime(peak, start + voice.attack);
    // A recorded hit keeps its own decay and only fades over the last fifth of what is played.
    const holdUntil = layer.env === "hold" || layer.kind === "sample" ? voice.dur * 0.8 : 0;
    if (holdUntil) env.gain.setValueAtTime(peak, start + Math.max(voice.attack, holdUntil));
    env.gain.exponentialRampToValueAtTime(SILENT, end);
  }
  head.connect(env);
  let tail: AudioNode = env;
  if (voice.pan) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = voice.pan;
    tail = env.connect(panner);
  }
  tail.connect(out);
  for (const [share, bus] of [[layer.wet, e.reverb], [layer.hall ?? 0, e.hall]] as const) {
    if (!share) continue;
    const send = ctx.createGain();
    send.gain.value = share;
    tail.connect(send).connect(bus);
  }
  if (offset === undefined) source.start(start);
  else (source as AudioBufferSourceNode).start(start, offset);
  source.stop(stopAt);
  for (const lfo of lfos) { lfo.start(start); lfo.stop(stopAt); }
  source.onended = () => tail.disconnect();
}

/**
 * The engine, when something can be heard now: Web Audio exists, the volume is above zero, the page
 * is visible and a click has let the audio start.
 */
function readyEngine(): Engine | null {
  if (getClientSettings().soundVolume <= 0) return null;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return null;
  const e = getEngine();
  if (!e) return null;
  if (e.ctx.state !== "running") {
    // Sounds scheduled on a suspended clock would all play late at once when it resumes.
    void e.ctx.resume().catch(() => undefined);
    return null;
  }
  return e;
}

/** Drops the sounds in `list` that have rung out by `now` (audio time). */
function prune(list: Array<{ endsAt: number }>, now: number) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.endsAt <= now) list.splice(i, 1);
}

/** Plays `voices` now on an output of their own, kept in `list` until they and the reverb have rung out. */
function startVoices<T extends { startedAt: number; endsAt: number }>(e: Engine, voices: readonly ScheduledVoice[], entry: Omit<T, "endsAt">, list: T[]): SoundHandle {
  // Scheduled early by the limiter's lookahead, so each hit comes out on its beat.
  const t0 = e.ctx.currentTime + LOOKAHEAD_S - LIMITER_DELAY_S;
  const out = e.ctx.createGain();
  out.connect(e.master);
  for (const voice of voices) renderVoice(e, voice, t0, out);
  // The reverb rings on for its own length after the last voice.
  const tracked = { ...entry, endsAt: t0 + soundLength(voices) + 1.8 } as T;
  list.push(tracked);
  let cut = false;
  return {
    stop() {
      if (cut) return;
      cut = true;
      const at = e.ctx.currentTime;
      out.gain.setValueAtTime(out.gain.value, at);
      out.gain.linearRampToValueAtTime(0, at + CUT_FADE_S);
      window.setTimeout(() => out.disconnect(), (CUT_FADE_S + 0.05) * 1000);
      tracked.endsAt = at;
    },
  };
}

/**
 * Plays `def`'s sound now. Returns null when it is not heard: nothing can be heard (`readyEngine`),
 * too many sounds are playing, or the same shape just started (one attack at several targets).
 */
export function playFxSound(def: AnimationDef, reduced = false): SoundHandle | null {
  const e = readyEngine();
  if (!e) return null;
  prune(playing, e.ctx.currentTime);
  if (playing.length >= MAX_SOUNDS) return null;
  const wall = performance.now();
  if (playing.some((p) => p.shape === def.shape && wall - p.startedAt < SAME_SHAPE_GAP_S * 1000)) return null;
  const voices = scheduleSound(def, { reduced, rng: Math.random });
  if (!voices.length) return null;
  return startVoices(e, voices, { shape: def.shape, startedAt: wall }, playing);
}

// ---------- dice ----------

/** Dice of one throw that each get their own clacks; more only fill out the ones already heard. */
export const MAX_VOICED_DICE = 10;
/** Dice throws heard at once. They have their own allowance, so a roll never silences its attack. */
export const MAX_DICE_SOUNDS = 4;
/** Dice sit under the attacks in the mix. */
const DICE_GAIN = 0.75;
/**
 * Playback speed of the dice recordings, each die somewhere between: three to five semitones down,
 * so they sound like heavy dice on a solid table rather than small ones on a thin one.
 */
const DICE_PITCH: readonly [number, number] = [0.74, 0.88];
/** The rattle, the clatter and the roll, played down to match. */
const DICE_HANDFUL_PITCH = 0.85;
const dicePlaying: Array<{ startedAt: number; endsAt: number }> = [];

export interface DiceThrowSound {
  /** Dice in the throw. */
  count: number;
  /** Milliseconds between dice leaving the hand (`throwStagger`). */
  staggerMs: number;
  /** Reduced animations: the dice are drawn at rest, so a single soft clack plays. */
  reduced?: boolean;
}

/**
 * Places the clacks of a dice throw in time: each die strikes the table on its `THROW_CONTACTS`
 * (the same fractions of `THROW_MS` its keyframes bounce on), harder the further it fell, then
 * rolls to rest. Every strike is a recorded clack or tap picked at random, with the synthesized
 * stand-in under it for while the recordings load. Pure, like `scheduleSound`.
 */
export function scheduleDice({ count, staggerMs, reduced = false }: DiceThrowSound, rng: () => number): ScheduledVoice[] {
  const voiced = clamp(Math.round(count), 0, MAX_VOICED_DICE);
  // A handful is louder than one die, not ten times as loud.
  const level = voiced ? DICE_GAIN * voiced ** -0.25 : 0;
  const voices: ScheduledVoice[] = [];
  /** Puts `layers` with their hits at `at`: a clip starts early by its own lead-in. */
  const add = (layers: readonly SoundLayer[], at: number, gain: number, pitch: number, pan: number, dur?: number) => {
    for (const layer of layers) {
      const length = dur ?? layer.dur;
      const speed = layer.kind === "sample" ? layer.rate * pitch : 1;
      const lead = layer.kind === "sample" && layer.env === "hit" ? SFX_CLIPS[layer.clip].hit / speed : 0;
      const start = at - lead;
      voices.push({
        layer, start: Math.max(0, start), dur: length - Math.max(0, -start), attack: clamp(layer.attack, MIN_ATTACK_S, length / 2),
        gain: layer.gain * gain, pitch, beat: at, offset: Math.max(0, -start) * speed, pan,
      });
    }
  };
  const pick = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;
  const clack = (at: number, gain: number, pitch: number, pan: number) => add([pick(DICE_CLACKS), ...DICE_BODY, ...DICE_CONTACT], at, gain, pitch, pan);
  const tap = (at: number, gain: number, pitch: number, pan: number, standIn: readonly SoundLayer[]) => add([pick(DICE_TAPS), ...standIn], at, gain, pitch, pan);
  // Each die rings a little differently and lands a little left or right of the others.
  const dice = Array.from({ length: voiced }, () => ({ pitch: DICE_PITCH[0] + rng() * (DICE_PITCH[1] - DICE_PITCH[0]), pan: (rng() * 2 - 1) * 0.4 }));
  if (reduced) {
    dice.slice(0, 3).forEach((die, i) => clack(i * 0.04, level * 0.6, die.pitch, die.pan));
    return voices;
  }
  const throwS = THROW_MS / 1000;
  const firstContact = THROW_CONTACTS[0]!.at * throwS;
  if (voiced) add([DICE_RATTLE], 0, level, DICE_HANDFUL_PITCH, 0);
  // A handful lands as a clatter, under each die's own clacks.
  if (voiced >= 3) add([DICE_CLATTER], firstContact, level, DICE_HANDFUL_PITCH, 0);
  dice.forEach((die, i) => {
    const t0 = (i * staggerMs) / 1000;
    THROW_CONTACTS.forEach(({ at, fall }, k) => {
      const when = t0 + at * throwS;
      const strike = level * Math.sqrt(fall);
      const pitch = die.pitch * (0.97 + rng() * 0.06);
      if (k < 2) clack(when, strike, pitch, die.pan);
      else tap(when, strike, pitch, die.pan, DICE_TAP);
      // It lands on an edge a moment before its face.
      if (k === 0) tap(when + 0.006 + rng() * 0.008, strike * 0.4, die.pitch, die.pan, DICE_TICK);
    });
    // Dice that land together knock into each other.
    if (voiced > 1) tap(t0 + firstContact + 0.02 + rng() * 0.04, level * 0.4, die.pitch * 1.1, die.pan, DICE_TICK);
    const slide = (1 - THROW_SLIDE_FROM) * throwS;
    add([DICE_ROLL], t0 + THROW_SLIDE_FROM * throwS, level, DICE_HANDFUL_PITCH, die.pan, slide + 0.05);
    add(DICE_SLIDE, t0 + THROW_SLIDE_FROM * throwS, level, die.pitch, die.pan, slide);
  });
  return voices;
}

/** Plays a dice throw's clacks now, in step with dice thrown now. Null when it is not heard (see `playFxSound`). */
export function playDiceSound(t: DiceThrowSound): SoundHandle | null {
  const e = readyEngine();
  if (!e) return null;
  prune(dicePlaying, e.ctx.currentTime);
  if (dicePlaying.length >= MAX_DICE_SOUNDS) return null;
  const voices = scheduleDice(t, Math.random);
  if (!voices.length) return null;
  return startVoices(e, voices, { startedAt: performance.now() }, dicePlaying);
}

/**
 * `run` with its sound: the sound starts now, and an effect destroyed before its animation is over
 * (replaced, evicted, the page hidden, the editor stopped) cuts it short. One that ends on its own
 * keeps its tail.
 */
export function withSound(run: RunningFx, def: AnimationDef, reduced: boolean): RunningFx {
  const sound = playFxSound(def, reduced);
  if (!sound) return run;
  const length = reduced ? (run.duration ?? def.duration) : def.duration;
  const startedAt = performance.now();
  return {
    animated: run.animated,
    duration: run.duration,
    update: (elapsed) => run.update(elapsed),
    destroy() {
      if (performance.now() - startedAt < length * 1000 - 50) sound.stop();
      run.destroy();
    },
  };
}

// ---------- the held die ----------

/** A pointer sample while a die is held: page position and event time, in milliseconds. */
export interface ShakeSample {
  x: number;
  y: number;
  t: number;
}

/** Page px per ms. A turn this fast throws the dice against the hand. */
export const SHAKE_TURN_SPEED = 0.5;
/** Page px per ms. Dragged at least this fast, the dice roll in the hand as it travels. */
export const SHAKE_ROLL_SPEED = 0.25;
/** Page px of travel between rattles while dragging. */
export const SHAKE_TRAVEL_PX = 90;
/** Rattles never come closer than this, however hard the shake. */
export const SHAKE_MIN_GAP_MS = 45;

/**
 * Turns the motion of a held die into rattles. Each sample returns how hard the dice in the hand
 * rattle (0..1), or null for none: hard when the die changes direction fast (the dice hit the
 * hand), softer every bit of fast enough travel, nothing while it is still. Pure: no audio.
 */
export function createShakeTracker(): (s: ShakeSample) => number | null {
  let last: ShakeSample | null = null;
  // The last direction it was really moving in: a pause between two strokes still counts as a turn.
  let heading: { x: number; y: number; speed: number } | null = null;
  let travel = 0;
  let lastHit = -Infinity;
  return (s) => {
    if (!last) {
      last = s;
      return null;
    }
    const dt = Math.max(1, s.t - last.t);
    const dx = s.x - last.x;
    const dy = s.y - last.y;
    last = s;
    const speed = Math.hypot(dx, dy) / dt;
    travel += Math.hypot(dx, dy);
    let hit: number | null = null;
    if (heading && dx * heading.x + dy * heading.y < 0 && Math.max(speed, heading.speed) > SHAKE_TURN_SPEED) {
      hit = clamp(0.35 + 0.3 * (speed + heading.speed), 0.35, 1);
    } else if (travel > SHAKE_TRAVEL_PX && speed > SHAKE_ROLL_SPEED) {
      hit = clamp(speed * 0.35, 0.12, 0.5);
    }
    if (speed > 0.05) heading = { x: dx, y: dy, speed };
    if (hit === null || s.t - lastHit < SHAKE_MIN_GAP_MS) return null;
    lastHit = s.t;
    travel = 0;
    return hit;
  };
}

/** The held die sits under the throws in the mix. */
const SHAKE_GAIN = 0.5;
/** Held still, the die still jiggles in the hand now and then, this softly. */
const IDLE_RATTLE = 0.12;
const IDLE_GAP_MS: readonly [number, number] = [700, 1300];

/** The rattle of a die held under the pointer, fed its pointer samples. `stop` is safe to call twice. */
export interface DiceShake {
  move(sample: ShakeSample): void;
  stop(): void;
}

/**
 * Starts the rattle of a die held under the pointer, until `stop`: each `move` may rattle (see
 * `createShakeTracker`), and a die held still jiggles faintly now and then. Each rattle is a short
 * slice, at a random place, of real dice shaken in a hand, longer for a harder shake and placed
 * left or right with the die on the page. Null when nothing can be heard.
 */
export function startDiceShake(): DiceShake | null {
  if (getClientSettings().soundVolume <= 0) return null;
  const e = getEngine();
  if (!e) return null;
  const out = e.ctx.createGain();
  out.gain.value = SHAKE_GAIN;
  out.connect(e.master);
  const track = createShakeTracker();
  let pan = 0;
  let stopped = false;
  const idleGap = () => IDLE_GAP_MS[0] + Math.random() * (IDLE_GAP_MS[1] - IDLE_GAP_MS[0]);
  let lastRattle = performance.now();
  let nextIdle = idleGap();

  const rattle = (strength: number) => {
    lastRattle = performance.now();
    nextIdle = idleGap();
    if (stopped || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    if (e.ctx.state !== "running") {
      void e.ctx.resume().catch(() => undefined);
      return;
    }
    const t0 = e.ctx.currentTime + 0.005;
    const layer = DICE_HAND_RATTLES[Math.floor(Math.random() * DICE_HAND_RATTLES.length)]!;
    const buffer = e.clips.get(layer.clip);
    const pitch = DICE_HANDFUL_PITCH * (0.95 + Math.random() * 0.1);
    if (buffer) {
      // A harder shake rattles longer.
      const dur = 0.08 + 0.07 * strength;
      const room = Math.max(0, buffer.duration - dur * layer.rate * pitch - 0.01);
      renderVoice(e, { layer, start: 0, dur, attack: 0.003, gain: layer.gain * strength, pitch, beat: 0, offset: Math.random() * room, pan }, t0, out);
    } else {
      // Not loaded yet: two or three synthesized clicks instead.
      const clicks = 2 + Math.round(strength);
      for (let i = 0; i < clicks; i++) {
        const at = i * (0.012 + Math.random() * 0.012);
        for (const tick of DICE_TICK) {
          renderVoice(e, { layer: tick, start: at, dur: tick.dur, attack: MIN_ATTACK_S, gain: tick.gain * strength * 0.7, pitch, beat: at, offset: 0, pan }, t0, out);
        }
      }
    }
  };

  const idle = window.setInterval(() => {
    if (performance.now() - lastRattle > nextIdle) rattle(IDLE_RATTLE);
  }, 100);

  return {
    move(sample) {
      if (stopped) return;
      const width = typeof window === "undefined" ? 1 : Math.max(1, window.innerWidth);
      pan = clamp((sample.x / width) * 2 - 1, -1, 1) * 0.5;
      const strength = track(sample);
      if (strength !== null) rattle(strength);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(idle);
      const at = e.ctx.currentTime;
      out.gain.setValueAtTime(out.gain.value, at);
      out.gain.linearRampToValueAtTime(0, at + 0.05);
      window.setTimeout(() => out.disconnect(), 120);
    },
  };
}
