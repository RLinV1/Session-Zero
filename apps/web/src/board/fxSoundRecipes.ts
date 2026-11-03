import type { AnimationShape } from "@vtt/shared";
import { SHAPE_DEFAULTS, type ResolvedAnimation } from "./effectPresets";
import { NUKE_DROP_SHARE } from "./fxBudget";

/**
 * What each animation shape sounds like (`fxSound.ts` plays it). Each shape has a theme, a real
 * thing it should sound like, and its layers are recorded clips of that thing (`public/sfx`, every
 * one CC0, sources in `public/sfx/CREDITS.md`) over synthesized tone and noise that add the sub-bass
 * and lock risers and hums to the picture. The beats come from the cue sheet in docs/SOUND-PLAN.md,
 * which reads them off the drawing code in `fxStrikes.ts` and `nukeFx.ts`; keep the two in step.
 *
 * `at` is a fraction of the animation's duration, so a layer stays on its beat at any duration; a
 * clip that hits (`env` "hit") has its `SFX_CLIPS` hit time land on `at`, while a rising or held clip
 * starts there, as a synth layer does. `dur`, `attack`
 * and a numeric `repeat.every` are seconds at the shape's default duration. Where the drawing spaces
 * its hits by the animation's own count, spin or trail, `at`, `repeat.count` and `repeat.every` are
 * functions of the animation instead (`every` then in seconds at its actual duration). Frequencies
 * are Hz, gains 0..1 before the volume setting; every clip is normalized to a -1 dBFS peak.
 */

/** The real-world sound each animation is built from. */
export const SOUND_THEMES: Record<AnimationShape, string> = {
  slash: "a steel longsword cutting through the air and biting into armour",
  claw: "a snarling beast raking its claws through hide",
  whirlwind: "a ring of spinning blades in a rush of wind",
  slam: "a warhammer leaping down onto flagstones",
  shadow: "a wraith of living shadow: moaning, whispering voices, an inhale, a shriek, a double slice",
  projectile: "a crossbow bolt thudding into its target",
  volley: "a line of longbows loosing at once and arrows raining down",
  dagger: "throwing knives spinning into wood",
  fireball: "a gout of fire hurled, then a fiery blast",
  meteor: "a burning rock screaming down out of the sky",
  explosion: "a fizzing stick of dynamite, then a blast",
  bolt: "an arcing bolt of lightning snapping onto its target",
  chain: "a lightning strike that cracks and jumps from foe to foe, with thunder",
  beam: "a humming energy beam",
  frost: "ice cracking and spikes shattering like glass",
  poison: "a glass vial smashing, then bubbling venom",
  smite: "a choir singing as the spell is cast, then a pillar of light breaking the ground with a deep boom, rolling thunder and falling rock",
  sonic: "war drums booming in a shockwave",
  tornado: "a howling twister full of stones",
  nuke: "an air-raid siren winding up, a thunderous blast and a long rolling aftermath",
};

/** Each clip in `public/sfx` and the moment (seconds) of its hit, measured from the file; `length` in seconds. */
export const SFX_CLIPS = {
  "arc-crackle": { hit: 0.04, length: 1 },
  "arrow-thunk": { hit: 0.06, length: 0.45 },
  "arrow-thunk-2": { hit: 0.04, length: 0.45 },
  "arrow-whoosh": { hit: 0.09, length: 0.5 },
  "bass-tom": { hit: 0.04, length: 1.2 },
  "beast-growl": { hit: 0.06, length: 1.3 },
  "blade-swing": { hit: 0.2, length: 0.58 },
  blast: { hit: 0, length: 0.33 },
  blaster: { hit: 0.03, length: 0.57 },
  boiling: { hit: 0, length: 3 },
  "bowl-reversed": { hit: 1.1, length: 1.17 },
  "bow-release": { hit: 0.07, length: 0.45 },
  "church-bell": { hit: 0.04, length: 4.5 },
  "dice-clack-1": { hit: 0.0055, length: 0.05 },
  "dice-clack-2": { hit: 0.0056, length: 0.08 },
  "dice-clack-3": { hit: 0.0054, length: 0.055 },
  "dice-clack-4": { hit: 0.0053, length: 0.045 },
  "dice-clatter": { hit: 0.012, length: 0.4 },
  "dice-rattle": { hit: 0, length: 0.54 },
  "dice-rattle-2": { hit: 0, length: 0.64 },
  "dice-roll": { hit: 0, length: 0.58 },
  "dice-shake": { hit: 0, length: 0.3 },
  "dice-tap-1": { hit: 0.0054, length: 0.15 },
  "dice-tap-2": { hit: 0.0021, length: 0.15 },
  "dice-tap-3": { hit: 0.0014, length: 0.15 },
  "cloth-tear": { hit: 0.04, length: 0.3 },
  "electric-shock": { hit: 0.07, length: 0.4 },
  "fire-crackle": { hit: 0, length: 3 },
  "fire-ignite": { hit: 0.2, length: 2.2 },
  "fire-roar": { hit: 0.3, length: 2.4 },
  "fuse-sizzle": { hit: 0, length: 3 },
  "glass-break": { hit: 0.04, length: 1 },
  "glass-burst": { hit: 0.05, length: 1.88 },
  gong: { hit: 0.05, length: 5 },
  "hammer-concrete": { hit: 0.05, length: 1.1 },
  "ice-crack": { hit: 0.03, length: 1.6 },
  "ice-crack-2": { hit: 0.24, length: 1.1 },
  "knife-twang": { hit: 0.03, length: 1.2 },
  punch: { hit: 0.04, length: 0.7 },
  "singing-bowl": { hit: 0.04, length: 6 },
  splash: { hit: 0.05, length: 1 },
  "stones-fall": { hit: 0.09, length: 0.95 },
  "stones-fall-2": { hit: 0.06, length: 0.6 },
  "sword-clash": { hit: 0.04, length: 0.9 },
  "sword-clash-2": { hit: 0.04, length: 0.9 },
  "sword-cut": { hit: 0.05, length: 0.79 },
  "sword-swish": { hit: 0.17, length: 0.52 },
  "thunder-crack": { hit: 0.105, length: 1.1 },
  "thunder-roll": { hit: 0.4, length: 6.5 },
  tinnitus: { hit: 0, length: 3 },
  "transformer-hum": { hit: 0, length: 3 },
  "whip-crack": { hit: 0.06, length: 0.6 },
  whisper: { hit: 0.06, length: 0.9 },
  "whisper-murmur": { hit: 0, length: 2 },
  "whisper-murmur-2": { hit: 0, length: 2 },
  "whisper-reversed": { hit: 0.82, length: 0.9 },
  "whoosh-heavy": { hit: 0.18, length: 0.85 },
  "whoosh-light": { hit: 0.09, length: 0.39 },
  "wind-howl": { hit: 0, length: 3 },
  "wind-strong": { hit: 0, length: 3 },
} as const satisfies Record<string, { hit: number; length: number }>;
export type SfxClip = keyof typeof SFX_CLIPS;
export const sfxClipUrl = (clip: SfxClip) => `/sfx/${clip}.mp3`;

export type NoiseColor = "white" | "pink" | "brown";

export interface FilterSpec {
  type: "lowpass" | "highpass" | "bandpass";
  /** Cutoff at the start and at the end of the layer, swept exponentially. */
  freq: [number, number];
  q?: number;
}

/**
 * `hit`: attack, then an exponential decay to silence at `dur` (hits, swishes, booms; a clip plays
 * as recorded and fades over its last fifth).
 * `hold`: attack, hold, then fade over the last fifth (hums, beds, pads).
 * `rise`: grows for the whole `dur` and cuts out just before the beat, leaving a breath of silence
 * for the hit on it (risers, anything approaching).
 */
export type Envelope = "hit" | "hold" | "rise";

interface LayerBase {
  /** Which part of the animation it belongs to: the first `impact` lands on the animation's impact. */
  cue: "launch" | "travel" | "impact" | "tail";
  at: number | ((d: ResolvedAnimation) => number);
  dur: number;
  env: Envelope;
  attack: number;
  gain: number;
  /** Share sent to the room reverb, 0..1. */
  wet: number;
  /** Share sent to the long hall reverb, for the biggest sounds. */
  hall?: number;
  /** Stereo position, -1 left to 1 right. */
  pan?: number;
  /** Each voice is placed at random up to this far left or right, -1..1 (crowds of arrows, rubble). */
  spread?: number;
  /** A synth stand-in for a recording: skipped once that clip has loaded. */
  unlessLoaded?: SfxClip;
  /** Plays `count` times, `every` apart, each repeat `decay` times as loud as the one before. */
  repeat?: {
    count: number | "count" | ((d: ResolvedAnimation) => number);
    every: number | ((d: ResolvedAnimation) => number);
    decay?: number;
  };
}

export interface ToneLayer extends LayerBase {
  kind: "tone";
  wave: "sine" | "triangle" | "sawtooth" | "square";
  freq: [number, number];
  vibrato?: { rate: number; depth: number };
  filter?: FilterSpec;
  /**
   * Seconds (a time constant) for the pitch to get most of the way from `freq[0]` to `freq[1]`:
   * it then settles on `freq[1]` the way a motor spins up, fast and then slower, instead of
   * sweeping evenly to it over the whole layer.
   */
  glide?: number;
}

export interface NoiseLayer extends LayerBase {
  kind: "noise";
  color: NoiseColor;
  filter: FilterSpec;
}

/** A recorded clip; `rate` below 1 plays it slower and deeper. */
export interface SampleLayer extends LayerBase {
  kind: "sample";
  clip: SfxClip;
  rate: number;
  filter?: FilterSpec;
}

export type SoundLayer = ToneLayer | NoiseLayer | SampleLayer;

// ---------- the plan's table columns, as helpers ----------

type Cue = LayerBase["cue"];
type At = LayerBase["at"];
/** A number is a `hit` attack; `H(a)` holds; `R` rises to the beat. */
type Att = number | { env: "hold"; attack: number } | { env: "rise" };
const H = (attack: number) => ({ env: "hold" as const, attack });
const R = { env: "rise" as const };
type Hz = number | [number, number];
interface Extra {
  repeat?: LayerBase["repeat"];
  vibrato?: ToneLayer["vibrato"];
  glide?: ToneLayer["glide"];
  /** A fixed lowpass on a tone or clip. */
  lp?: number;
  /** A bandpass on a tone, swept from the first cutoff to the second: a formant, so it sounds like a voice. */
  bp?: Hz;
  q?: number;
  hall?: number;
  pan?: number;
  spread?: number;
  unlessLoaded?: SfxClip;
}

const hz = (f: Hz): [number, number] => (typeof f === "number" ? [f, f] : f);
function envelope(att: Att): Pick<LayerBase, "env" | "attack"> {
  if (typeof att === "number") return { env: "hit", attack: att };
  return att.env === "hold" ? att : { env: "rise", attack: 0 };
}
const lowpass = (lp?: number) => (lp ? { filter: { type: "lowpass" as const, freq: [lp, lp] as [number, number] } } : {});

function tone(cue: Cue, wave: ToneLayer["wave"], at: At, dur: number, att: Att, freq: Hz, gain: number, wet: number, extra: Extra = {}): ToneLayer {
  const { lp, bp, q, ...rest } = extra;
  const formant = bp ? { filter: { type: "bandpass" as const, freq: hz(bp), q: q ?? 5 } } : {};
  return { kind: "tone", cue, wave, at, dur, ...envelope(att), freq: hz(freq), gain, wet, ...rest, ...lowpass(lp), ...formant };
}

const FILTERS = { bp: "bandpass", lp: "lowpass", hp: "highpass" } as const;
function noise(cue: Cue, color: NoiseColor, at: At, dur: number, att: Att, cutoff: Hz, filter: keyof typeof FILTERS, q: number, gain: number, wet: number, extra: Omit<Extra, "vibrato" | "glide" | "lp" | "bp" | "q"> = {}): NoiseLayer {
  return { kind: "noise", cue, color, at, dur, ...envelope(att), filter: { type: FILTERS[filter], freq: hz(cutoff), q }, gain, wet, ...extra };
}

interface ClipExtra extends Omit<Extra, "vibrato" | "glide" | "bp" | "q"> {
  rate?: number;
  /** Seconds to play; the whole clip (at its rate) when left out. */
  dur?: number;
  att?: Att;
  wet?: number;
}
/** A recorded clip whose hit lands on `at`. */
function clip(cue: Cue, name: SfxClip, at: At, gain: number, extra: ClipExtra = {}): SampleLayer {
  const { rate = 1, dur, att = 0.002, lp, wet = 0.1, ...rest } = extra;
  return {
    kind: "sample", cue, clip: name, at, rate, dur: dur ?? SFX_CLIPS[name].length / rate, ...envelope(att), gain, wet, ...rest, ...lowpass(lp),
  };
}

const x = (count: NonNullable<LayerBase["repeat"]>["count"], every: NonNullable<LayerBase["repeat"]>["every"], decay?: number) => ({ repeat: { count, every, ...(decay ? { decay } : {}) } });
const vib = (rate: number, depth: number) => ({ vibrato: { rate, depth } });

/** A sung vowel's first two formants, in Hz; each may move, so a vowel can open as it is sung. */
type Vowel = [Hz, Hz];
const OH_TO_AH: Vowel = [[560, 740], [950, 1150]];

/**
 * A choir section singing `notes` on `vowel`. Each note is two sawtooth singers a few cents apart,
 * one through the vowel's first formant and one, quieter, through its second, each with a vibrato
 * of its own, so a chord sounds like a crowd of voices rather than an organ.
 */
function choir(cue: Cue, at: At, dur: number, att: Att, notes: Hz[], vowel: Vowel, gain: number, wet: number, hall: number): ToneLayer[] {
  return notes.flatMap((note, i) => {
    const [from, to] = hz(note);
    return [
      tone(cue, "sawtooth", at, dur, att, [from, to], gain, wet, { ...vib(5.1 + 0.37 * i, from * 0.006), bp: vowel[0], q: 4, hall }),
      tone(cue, "sawtooth", at, dur, att, [from * 1.004, to * 1.004], gain * 0.55, wet, { ...vib(5.8 + 0.29 * i, from * 0.007), bp: vowel[1], q: 6, hall }),
    ];
  });
}

// ---------- hit spacings the drawing derives from the animation (SOUND-PLAN.md, general rule 2) ----------

/** Slash and claw: cut i starts `i * min(0.06, 0.35 / n) * D`. */
const cutStep = (d: ResolvedAnimation) => Math.min(0.06, 0.35 / d.count) * d.duration;
/** Shots that all land together leave `i * min(share * D, spread * D / (n - 1))` apart. */
const stagger = (share: number, spread: number) => (d: ResolvedAnimation) => Math.min(share, spread / Math.max(1, d.count - 1)) * d.duration;
/** Chain lightning: jump i leaves `L + (i - 1) * step` and arrives 0.6 step later (L = 0.3 D). */
const chainStep = (d: ResolvedAnimation) => Math.max(0.05, (0.85 - 0.3) * d.duration / d.count);
const chainArrival = (d: ResolvedAnimation) => 0.3 + (0.6 * chainStep(d)) / d.duration;
/** Sonic: arc i leaves `(0.04 + trail * 0.07) * D` after the one before. */
const sonicGap = (d: ResolvedAnimation) => (0.04 + d.trail * 0.07) * d.duration;
/** Whirlwind: one blade passes every `2 pi / (n * (3 + 25 spin))` s; the chops cover 0.93 D. */
const chopEvery = (d: ResolvedAnimation) => Math.max((2 * Math.PI) / (d.count * (3 + 25 * d.spin)), (0.93 * d.duration) / 24);
const chopCount = (d: ResolvedAnimation) => Math.floor((0.93 * d.duration) / chopEvery(d)) + 1;
/** Tornado: `6 + 3n` chunks of rubble. */
const rubble = (d: ResolvedAnimation) => 6 + 3 * d.count;
/** The nuke's blast, after the bomb's fall under the siren. */
const BLAST = NUKE_DROP_SHARE;
/** `s` seconds after the nuke's blast, at its default duration. */
const afterBlast = (s: number) => BLAST + s / SHAPE_DEFAULTS.nuke.duration;

/**
 * A dual-tone air-raid siren winding up, modelled on a recording of one: two tones a minor third
 * apart (6:5) at nearly even strength, mellow (a sawtooth through a dark horn, its second harmonic
 * about 12 dB down), with a faint 10 Hz flutter, gliding up as its rotor spins up and settling on
 * the top pair.
 */
function siren(cue: Cue, at: At, dur: number, att: Att, freq: [number, number], glide: number, gain: number, wet: number, hall: number): ToneLayer[] {
  return [1, 1.2].map((ratio, i) =>
    tone(cue, "sawtooth", at, dur, att, [freq[0] * ratio, freq[1] * ratio], gain * (i ? 0.9 : 1), wet, { ...vib(10, 1.2), lp: 900, glide, hall }));
}

export const SHAPE_SOUNDS: Record<AnimationShape, SoundLayer[]> = {
  slash: [
    // The blade's swish peaks as its head crosses the target, a beat before the flash.
    clip("launch", "sword-swish", 0.2, 0.75, x("count", cutStep)),
    clip("impact", "sword-cut", 0.3, 0.85, { wet: 0.15 }),
    clip("impact", "sword-clash", 0.3, 0.5, { wet: 0.3 }),
    tone("impact", "sine", 0.3, 0.12, 0.003, [190, 90], 0.45, 0),
    tone("impact", "sine", 0.3, 0.25, 0.004, [85, 42], 0.35, 0),
  ],
  claw: [
    clip("launch", "beast-growl", 0, 0.55, { dur: 0.25, wet: 0.2 }),
    clip("travel", "whoosh-light", 0.2, 0.4, x("count", cutStep)),
    clip("travel", "cloth-tear", 0.2, 0.45, x("count", cutStep)),
    clip("impact", "punch", 0.3, 1),
    tone("impact", "sine", 0.3, 0.14, 0.003, [150, 70], 0.5, 0),
  ],
  whirlwind: [
    clip("travel", "blade-swing", 0, 0.3, { dur: 0.25, spread: 0.6, ...x(chopCount, chopEvery) }),
    clip("travel", "wind-strong", 0, 0.45, { att: R, dur: 0.7, wet: 0.15 }),
    clip("tail", "wind-strong", 0.5, 0.4, { rate: 0.8, dur: 0.7, att: 0.02, wet: 0.25 }),
    clip("impact", "sword-clash", 0.5, 0.8, { wet: 0.2 }),
    clip("impact", "sword-clash-2", 0.53, 0.55, { wet: 0.25 }),
    tone("impact", "sine", 0.5, 0.2, 0.003, [170, 60], 0.5, 0),
  ],
  slam: [
    clip("launch", "whoosh-heavy", 0.15, 0.45),
    clip("travel", "whoosh-heavy", 0.4, 0.5, { rate: 0.7 }),
    clip("impact", "hammer-concrete", 0.45, 0.9, { wet: 0.2 }),
    // A thunderclap two octaves down: the ground itself booming.
    clip("impact", "thunder-crack", 0.45, 0.6, { rate: 0.5, lp: 1500, wet: 0.3 }),
    tone("impact", "sine", 0.45, 0.55, 0.004, [95, 32], 0.9, 0.2),
    clip("tail", "stones-fall", 0.47, 0.7, { spread: 0.3 }),
    clip("tail", "stones-fall-2", 0.6, 0.45, { spread: 0.6, ...x(3, 0.12) }),
  ],
  shadow: [
    // It drifts in: a moan of slowed wind under a crowd of whispers, one voice each side.
    clip("launch", "wind-howl", 0, 0.35, { rate: 0.5, att: H(0.25), dur: 0.85, wet: 0.2, hall: 0.5 }),
    clip("launch", "whisper-murmur", 0.02, 0.4, { rate: 0.85, att: H(0.15), dur: 0.75, pan: -0.55, wet: 0.2, hall: 0.5 }),
    clip("launch", "whisper-murmur-2", 0.04, 0.35, { rate: 0.7, att: H(0.15), dur: 0.7, pan: 0.55, wet: 0.2, hall: 0.5 }),
    // Its voice: two moans a semitone apart, gliding down through vowel-like formants.
    tone("launch", "sawtooth", 0.03, 0.75, H(0.2), [196, 165], 0.1, 0.4, { ...vib(4.5, 4), bp: [500, 420], q: 6, hall: 0.6 }),
    tone("launch", "sawtooth", 0.03, 0.75, H(0.2), [208, 174], 0.07, 0.4, { ...vib(5.2, 4), bp: 950, q: 8, hall: 0.6 }),
    // Rearing back, eyes flaring (0.39 to 0.546): an inhale of a reversed bowl and a sucked-in
    // whisper that cut off as it lunges, and a demonic snarl two octaves down.
    clip("travel", "bowl-reversed", 0.546, 0.45, { att: 0.3, hall: 0.3 }),
    clip("travel", "whisper-reversed", 0.546, 0.5, { rate: 0.75, att: 0.2, hall: 0.4 }),
    clip("travel", "beast-growl", 0.42, 0.45, { rate: 0.5, dur: 0.38, lp: 1800, hall: 0.4 }),
    // The lunge: a banshee shriek rising into the strike, and a dark rush of air.
    tone("travel", "sawtooth", 0.546, 0.14, R, [320, 1150], 0.1, 0.3, { bp: [900, 2200], q: 3 }),
    clip("travel", "whoosh-heavy", 0.58, 0.4, { rate: 0.65 }),
    // The double slice, with a dark boom under it.
    clip("impact", "sword-cut", 0.65, 0.85, { rate: 0.85, wet: 0.2, ...x(2, 0.03) }),
    tone("impact", "sine", 0.65, 0.35, 0.004, [90, 38], 0.6, 0.1),
    clip("impact", "thunder-crack", 0.65, 0.3, { rate: 0.4, lp: 900, hall: 0.4 }),
    // It bursts into smoke with a dying wail, its last whisper lost in the hall.
    tone("tail", "sawtooth", 0.66, 0.6, 0.01, [520, 180], 0.08, 0.5, { ...vib(6, 10), bp: 800, q: 5, hall: 0.7 }),
    noise("tail", "pink", 0.65, 0.5, 0.02, [2200, 200], "lp", 0.8, 0.3, 0.4),
    clip("tail", "whisper", 0.7, 0.3, { rate: 0.6, wet: 0.2, hall: 0.7 }),
  ],
  projectile: [
    clip("launch", "bow-release", 0, 0.8, x("count", stagger(0.04, 0.33))),
    clip("travel", "arrow-whoosh", 0.45, 0.5),
    clip("impact", "arrow-thunk", 0.55, 0.9, { wet: 0.15 }),
    tone("impact", "sine", 0.55, 0.14, 0.003, [220, 90], 0.4, 0),
  ],
  volley: [
    clip("launch", "bow-release", 0, 0.7, { spread: 0.5, ...x("count", stagger(0.035, 0.3)) }),
    clip("travel", "arrow-whoosh", 0.5, 0.4, { spread: 0.6, ...x("count", stagger(0.035, 0.3)) }),
    noise("travel", "white", 0.08, 0.67, R, [2000, 3600], "bp", 3, 0.1, 0.15),
    clip("impact", "arrow-thunk", 0.6, 0.6, { spread: 0.7, ...x("count", 0.012) }),
    clip("impact", "arrow-thunk-2", 0.6, 0.45, { spread: 0.7, ...x("count", 0.016) }),
    tone("impact", "sine", 0.6, 0.14, 0.003, [180, 80], 0.4, 0),
  ],
  dagger: [
    clip("launch", "blade-swing", 0, 0.6, x("count", stagger(0.03, 0.2))),
    clip("travel", "whoosh-light", 0.42, 0.25, { spread: 0.4, ...x("count", stagger(0.03, 0.2)) }),
    clip("impact", "arrow-thunk-2", 0.5, 1, { spread: 0.5, ...x("count", 0.012) }),
    clip("tail", "knife-twang", 0.5, 0.45, { wet: 0.2 }),
    tone("impact", "sine", 0.5, 0.1, 0.003, [200, 90], 0.35, 0),
  ],
  fireball: [
    clip("launch", "fire-ignite", 0, 0.8, { dur: 0.8 }),
    clip("launch", "whoosh-heavy", 0.12, 0.6),
    clip("travel", "fire-roar", 0.1, 0.5, { rate: 1.15, att: H(0.08), dur: 0.55, wet: 0.2 }),
    clip("impact", "blast", 0.5, 0.9, { wet: 0.2 }),
    clip("impact", "thunder-crack", 0.5, 0.8, { rate: 0.55, lp: 2500, wet: 0.3, hall: 0.25 }),
    clip("impact", "fire-ignite", 0.5, 0.8, { rate: 0.8, dur: 1.2, wet: 0.3 }),
    tone("impact", "sine", 0.5, 0.9, 0.004, [110, 36], 0.85, 0.25),
    tone("impact", "triangle", 0.5, 0.35, 0.004, [170, 70], 0.5, 0.15),
    clip("tail", "fire-crackle", 0.55, 0.5, { att: H(0.05), dur: 1.2, wet: 0.3 }),
  ],
  meteor: [
    clip("travel", "fire-roar", 0, 0.8, { rate: 0.7, att: R, dur: 0.82, wet: 0.2 }),
    clip("travel", "wind-howl", 0, 0.3, { rate: 1.3, att: R, dur: 0.82, wet: 0.2 }),
    tone("travel", "sawtooth", 0, 0.8, R, [400, 1400], 0.08, 0.15, { ...vib(9, 30), lp: 1800 }),
    clip("impact", "blast", 0.55, 1, { wet: 0.25 }),
    clip("impact", "thunder-crack", 0.55, 0.9, { rate: 0.5, wet: 0.3, hall: 0.4 }),
    tone("impact", "sine", 0.55, 1.1, 0.004, [95, 30], 0.95, 0.3),
    tone("impact", "triangle", 0.55, 0.4, 0.004, [150, 60], 0.6, 0.15),
    clip("tail", "stones-fall", 0.62, 0.6, { spread: 0.4 }),
    clip("tail", "stones-fall-2", 0.7, 0.45, { spread: 0.7, ...x(3, 0.1) }),
    clip("tail", "thunder-roll", 0.58, 0.45, { rate: 0.7, dur: 2, lp: 1200, hall: 0.4 }),
  ],
  explosion: [
    clip("launch", "fuse-sizzle", 0, 0.55, { att: H(0.02), dur: 1.2 }),
    clip("travel", "hammer-concrete", 0.3, 0.4, { rate: 0.8 }),
    tone("travel", "sine", 0.408, 0.1, 0.002, [170, 95], 0.3, 0.05),
    tone("travel", "sine", 0.4375, 0.035, 0.002, 1760, 0.12, 0.05, x(3, 0.075)),
    tone("travel", "sine", 0.533, 0.02, 0.002, 2400, 0.12, 0.05, x(5, 0.03)),
    clip("impact", "blast", 0.6, 1, { wet: 0.25 }),
    clip("impact", "thunder-crack", 0.6, 0.95, { rate: 0.5, wet: 0.3, hall: 0.4 }),
    tone("impact", "sine", 0.6, 1.2, 0.004, [90, 30], 0.95, 0.25),
    noise("impact", "brown", 0.6, 0.9, 0.01, [3500, 150], "lp", 0.8, 0.4, 0.4),
    clip("tail", "thunder-roll", 0.62, 0.5, { rate: 0.9, dur: 2, hall: 0.4 }),
    clip("tail", "stones-fall", 0.64, 0.55, { spread: 0.4 }),
    clip("tail", "stones-fall-2", 0.7, 0.35, { spread: 0.8, ...x(4, 0.09) }),
  ],
  bolt: [
    tone("launch", "sawtooth", 0, 0.33, R, [120, 360], 0.18, 0.15, { ...vib(30, 15), lp: 1200 }),
    clip("launch", "electric-shock", 0.25, 0.5),
    clip("travel", "arc-crackle", 0.25, 0.55, { att: H(0.01), dur: 0.45 }),
    clip("impact", "whip-crack", 0.6, 0.9, { wet: 0.2 }),
    clip("impact", "thunder-crack", 0.6, 0.7, { rate: 0.85, wet: 0.3 }),
    tone("impact", "sine", 0.6, 0.3, 0.003, [160, 55], 0.6, 0.1),
    clip("tail", "electric-shock", 0.6, 0.35, { spread: 0.5, ...x(3, 0.05) }),
  ],
  chain: [
    clip("launch", "arc-crackle", 0, 0.6, { att: R, dur: 0.45 }),
    tone("launch", "sawtooth", 0, 0.45, R, [150, 520], 0.15, 0.2, { ...vib(60, 40), lp: 3000 }),
    clip("impact", "thunder-crack", 0.3, 1, { wet: 0.3, hall: 0.4 }),
    clip("impact", "whip-crack", 0.3, 0.8),
    tone("impact", "sine", 0.3, 0.45, 0.003, [140, 50], 0.65, 0.2),
    tone("impact", "sine", 0.3, 0.7, 0.01, [62, 38], 0.5, 0.1),
    clip("travel", "arc-crackle", 0.3, 0.3, { dur: 0.15, ...x("count", chainStep, 0.9) }),
    clip("tail", "whip-crack", chainArrival, 0.6, { spread: 0.6, ...x("count", chainStep, 0.9) }),
    clip("tail", "electric-shock", chainArrival, 0.45, { spread: 0.6, ...x("count", chainStep, 0.9) }),
    clip("tail", "thunder-roll", 0.33, 0.4, { dur: 2.5, hall: 0.5 }),
  ],
  beam: [
    clip("launch", "blaster", 0, 0.8, { wet: 0.2 }),
    clip("travel", "transformer-hum", 0, 0.45, { att: H(0.04), dur: 0.98 }),
    tone("travel", "sawtooth", 0, 0.98, H(0.04), [220, 230], 0.12, 0.2, { ...vib(8.75, 6), lp: 1600 }),
    tone("travel", "sine", 0, 0.98, H(0.05), [1100, 1500], 0.06, 0.3, vib(8.75, 40)),
    clip("impact", "arc-crackle", 0.25, 0.3, { att: H(0.02), dur: 0.6 }),
    tone("impact", "sine", 0.25, 0.12, 0.003, [200, 100], 0.3, 0),
    tone("tail", "sawtooth", 0.7, 0.45, 0.01, [230, 80], 0.18, 0.45, { lp: 1000 }),
  ],
  frost: [
    noise("travel", "white", 0, 0.6, R, [2500, 5500], "bp", 2.5, 0.15, 0.2),
    clip("travel", "wind-howl", 0, 0.2, { rate: 1.6, att: R, dur: 0.6, wet: 0.2 }),
    clip("impact", "ice-crack-2", 0.45, 0.8, { wet: 0.2 }),
    clip("impact", "ice-crack", 0.46, 0.6, { spread: 0.4 }),
    tone("impact", "sine", 0.45, 0.15, 0.003, [180, 80], 0.4, 0.05),
    clip("tail", "singing-bowl", 0.45, 0.25, { rate: 1.5, dur: 2, wet: 0.6 }),
    clip("tail", "glass-burst", 0.835, 0.8, { wet: 0.35 }),
    tone("tail", "sine", 0.84, 0.08, 0.001, [4000, 3000], 0.08, 0.5, x("count", 0.02)),
  ],
  poison: [
    clip("launch", "whoosh-light", 0.05, 0.4, { rate: 0.8 }),
    tone("travel", "sine", 0.11, 0.09, 0.01, [350, 700], 0.08, 0.15, x(5, 0.132)),
    clip("impact", "glass-break", 0.55, 1, { wet: 0.2 }),
    clip("impact", "splash", 0.55, 0.7, { wet: 0.15 }),
    clip("tail", "boiling", 0.6, 0.35, { att: H(0.1), dur: 1 }),
    noise("tail", "white", 0.6, 0.6, H(0.15), 6000, "bp", 0.8, 0.08, 0.3),
    tone("tail", "sine", 0.775, 0.04, 0.001, [700, 1400], 0.12, 0.15, x((d) => Math.min(7, Math.max(4, d.count)) - 1, 0.065)),
    // The skulls in the vapour whisper.
    clip("tail", "whisper", 0.65, 0.25, { rate: 0.7, wet: 0.3, hall: 0.5 }),
  ],
  smite: [
    // The casting: a choir comes in at once on E major, "oh" opening to "ah", a soprano joining
    // above it, and sings while the holy circle draws and the light gathers, under the bowl; the
    // pads are its chest. It holds to 0.1 s before the strike and dies away under the thunder, so
    // the strike itself has no choir in it.
    ...choir("launch", 0, 1.8, H(0.12), [165, 247, 330, 415, 494], OH_TO_AH, 0.4, 0.4, 0.5),
    ...choir("launch", 0.06, 1.65, H(0.3), [659], OH_TO_AH, 0.28, 0.4, 0.6),
    tone("launch", "triangle", 0, 1.8, H(0.15), 165, 0.14, 0.7, vib(5.5, 2)),
    tone("launch", "triangle", 0, 1.8, H(0.15), 247, 0.1, 0.7, vib(5.5, 3)),
    tone("launch", "sine", 0, 1.8, H(0.2), 330, 0.08, 0.7, vib(6, 4)),
    clip("launch", "singing-bowl", 0, 0.35, { dur: 2, wet: 0.6 }),
    tone("travel", "sawtooth", 0.341, 0.7, R, [160, 1400], 0.12, 0.3, { ...vib(12, 40), lp: 2500 }),
    noise("travel", "pink", 0.341, 0.7, R, [500, 6000], "bp", 1.5, 0.18, 0.3),
    // The pillar breaks the ground: a deep crunch of stone and a slowed blast, the ground booming
    // two and a half octaves down over a heavy thump and a dark rumble, then the earth rolling
    // and big rubble falling back. The crack of the light and the bell sit low under it; the gong
    // rings an octave down.
    clip("impact", "hammer-concrete", 0.62, 1, { rate: 0.6, lp: 2500, wet: 0.2 }),
    clip("impact", "blast", 0.62, 0.8, { rate: 0.5, wet: 0.2 }),
    clip("impact", "thunder-crack", 0.62, 1, { rate: 0.4, lp: 1000, wet: 0.3, hall: 0.4 }),
    clip("impact", "thunder-crack", 0.62, 0.3, { rate: 0.8, lp: 3000, wet: 0.3, hall: 0.4 }),
    clip("impact", "church-bell", 0.62, 0.25, { dur: 3, wet: 0.3, hall: 0.5 }),
    tone("impact", "sine", 0.62, 1.4, 0.006, [58, 36], 0.8, 0.3),
    tone("impact", "sine", 0.62, 0.6, 0.004, [90, 30], 0.95, 0.2),
    tone("impact", "triangle", 0.62, 0.45, 0.004, [130, 55], 0.55, 0.15),
    noise("impact", "brown", 0.62, 1.2, 0.01, [1800, 100], "lp", 0.8, 0.45, 0.35),
    // Held, not hit: it starts on the strike and swells to its own peak 0.7 s later, so none of it
    // leads into the casting.
    clip("tail", "thunder-roll", 0.62, 0.55, { rate: 0.55, att: H(0.05), dur: 2, lp: 900, hall: 0.4 }),
    clip("tail", "stones-fall", 0.63, 0.9, { rate: 0.75, spread: 0.3 }),
    clip("tail", "stones-fall-2", 0.66, 0.6, { rate: 0.8, spread: 0.6, ...x(3, 0.12) }),
    clip("tail", "gong", 0.62, 0.4, { rate: 0.5, dur: 3, wet: 0.3, hall: 0.5 }),
    tone("tail", "sawtooth", 0.62, 0.69, H(0.02), 110, 0.15, 0.4, { ...vib(40, 6), lp: 700 }),
  ],
  sonic: [
    clip("launch", "bass-tom", 0, 0.8, x("count", sonicGap, 0.85)),
    noise("travel", "pink", 0, 0.5, 0.2, [200, 1400], "bp", 2, 0.2, 0.15),
    clip("impact", "bass-tom", 0.45, 1, { rate: 0.7, wet: 0.3, ...x("count", sonicGap, 0.85) }),
    tone("impact", "sine", 0.45, 0.3, 0.004, [120, 45], 0.7, 0.15, x("count", sonicGap, 0.85)),
    clip("tail", "gong", 0.45, 0.35, { rate: 0.6, dur: 2, wet: 0.3, hall: 0.3 }),
  ],
  tornado: [
    clip("travel", "wind-howl", 0, 0.7, { att: R, dur: 0.935, wet: 0.2 }),
    clip("travel", "wind-strong", 0, 0.35, { att: H(0.4), dur: 1.7, wet: 0.2 }),
    tone("travel", "sawtooth", 0, 0.935, R, [110, 160], 0.16, 0.2, { ...vib(3.7, 25), lp: 600 }),
    tone("tail", "sawtooth", 0.55, 0.8, 0.02, [160, 70], 0.14, 0.3, { ...vib(3.7, 25), lp: 600 }),
    noise("travel", "brown", 0, 1.7, H(0.6), 220, "lp", 0.7, 0.35, 0.3),
    clip("travel", "stones-fall-2", 0.06, 0.18, { dur: 0.3, spread: 0.8, ...x(rubble, 0.055) }),
    clip("impact", "whoosh-heavy", 0.55, 0.7, { rate: 0.6 }),
    tone("impact", "sine", 0.55, 0.45, 0.004, [90, 45], 0.65, 0.15),
    clip("tail", "wind-howl", 0.55, 0.5, { rate: 0.7, dur: 0.9, att: 0.02, wet: 0.3 }),
    clip("tail", "stones-fall", 0.6, 0.4, { spread: 0.8, ...x(6, 0.09) }),
  ],
  nuke: [
    // An air-raid siren winds up before the bomb falls, louder as it climbs, and settles on its
    // top pair (574 and 689 Hz) about 2 s in. It holds until the blast and is swallowed by it; the
    // drone under it ends 20 ms before it, a breath before the wall.
    ...siren("launch", 0, 3.7, H(1.2), [140, 574], 0.7, 0.28, 0.25, 0.5),
    tone("launch", "sawtooth", 0, 2.99, R, [55, 110], 0.2, 0.1, { lp: 200 }),
    clip("impact", "blast", BLAST, 1, { wet: 0.3, hall: 0.3 }),
    clip("impact", "thunder-crack", BLAST, 1, { rate: 0.45, wet: 0.2, hall: 0.6 }),
    tone("impact", "sine", BLAST, 2.6, 0.005, [80, 24], 0.85, 0.2),
    tone("impact", "triangle", BLAST, 1.6, 0.005, [140, 50], 0.5, 0.2),
    noise("impact", "brown", BLAST, 2.2, 0.01, [4000, 120], "lp", 0.8, 0.45, 0.45),
    clip("tail", "thunder-roll", BLAST, 0.8, { rate: 0.6, dur: 3.5, hall: 0.5 }),
    clip("tail", "thunder-crack", afterBlast(0.16), 0.45, { rate: 0.5, hall: 0.6, ...x(2, 0.15) }),
    clip("tail", "fire-roar", afterBlast(0.32), 0.5, { rate: 0.6, att: H(0.3), dur: 1.6, wet: 0.3 }),
    // The ringing in the ears; any louder and it only irritates.
    clip("tail", "tinnitus", afterBlast(0.16), 0.05, { att: 0.05, dur: 1.8, wet: 0 }),
    clip("tail", "stones-fall-2", afterBlast(0.92), 0.15, { spread: 0.9, ...x(10, 0.15) }),
    clip("tail", "wind-strong", afterBlast(1.32), 0.3, { att: H(0.4), dur: 2, wet: 0.3 }),
  ],
};

/**
 * Reduced animations show a still marker for a moment: one soft cue plays as it appears, with no
 * travel, sub-bass or tail (SOUND-PLAN.md, "Reduced-animations cues").
 */
const SOFT_HIT = [clip("impact", "punch", 0, 0.3, { dur: 0.3, wet: 0 })];
const SOFT_BLADE = [clip("impact", "sword-cut", 0, 0.25, { dur: 0.35, wet: 0 })];
const SOFT_SHADOW = [clip("impact", "whisper", 0, 0.25, { rate: 0.7, dur: 0.45, wet: 0 })];
const SOFT_MAGIC = [clip("impact", "electric-shock", 0, 0.2, { dur: 0.3, wet: 0 }), tone("impact", "triangle", 0, 0.15, 0.003, [880, 660], 0.15, 0.25)];
const SOFT_FIRE = [clip("impact", "fire-ignite", 0, 0.3, { dur: 0.45, wet: 0 })];
const SOFT_ICE = [clip("impact", "ice-crack-2", 0, 0.3, { dur: 0.45, wet: 0 })];
const SOFT_AIR = [clip("impact", "wind-strong", 0, 0.25, { att: 0.05, dur: 0.4, wet: 0 })];
const SOFT_HOLY = [clip("impact", "church-bell", 0, 0.2, { dur: 0.5, wet: 0 })];
const SOFT_NUKE = [clip("impact", "thunder-crack", 0, 0.3, { rate: 0.6, dur: 0.5, wet: 0 })];

export const REDUCED_SOUNDS: Record<AnimationShape, SoundLayer[]> = {
  slash: SOFT_BLADE, claw: SOFT_HIT, whirlwind: SOFT_BLADE, slam: SOFT_HIT, shadow: SOFT_SHADOW,
  projectile: SOFT_HIT, volley: SOFT_HIT, dagger: SOFT_BLADE, sonic: SOFT_HIT,
  bolt: SOFT_MAGIC, chain: SOFT_MAGIC, beam: SOFT_MAGIC,
  frost: SOFT_ICE, smite: SOFT_HOLY,
  fireball: SOFT_FIRE, meteor: SOFT_FIRE, explosion: SOFT_FIRE,
  poison: SOFT_AIR, tornado: SOFT_AIR,
  nuke: SOFT_NUKE,
};

// ---------- dice ----------

/**
 * Real dice on a wooden table (BigSoundBank's dice recordings, see `public/sfx/CREDITS.md`): hard
 * clacks for a die landing, softer taps for its small bounces and for dice knocking together, a
 * clatter of four landing at once, the rattle of dice leaving the hand and a die rolling to rest.
 * `scheduleDice` places them; each layer's hit lands on the moment it is placed at.
 */
export const DICE_CLACKS: SampleLayer[] = (["dice-clack-1", "dice-clack-2", "dice-clack-3", "dice-clack-4"] as const).map((name) => clip("impact", name, 0, 0.9, { wet: 0.06 }));
export const DICE_TAPS: SampleLayer[] = (["dice-tap-1", "dice-tap-2", "dice-tap-3"] as const).map((name) => clip("impact", name, 0, 0.8, { wet: 0.06 }));
export const DICE_CLATTER: SampleLayer = clip("impact", "dice-clatter", 0, 0.6, { wet: 0.08 });
export const DICE_RATTLE: SampleLayer = clip("launch", "dice-shake", 0, 0.35, { att: H(0.03), dur: 0.3, wet: 0.05 });
export const DICE_ROLL: SampleLayer = clip("tail", "dice-roll", 0, 0.5, { att: H(0.02), wet: 0.05 });
/** Unbroken shaking, sliced at random into the short rattles of a die held under the pointer. */
export const DICE_HAND_RATTLES: SampleLayer[] = (["dice-rattle", "dice-rattle-2"] as const).map((name) => clip("launch", name, 0, 1, { wet: 0.03 }));
/**
 * The weight of a heavy die on a solid table, under every real landing (the drop and the first
 * bounce), recorded or not: a low thud and a dark wooden knock.
 */
export const DICE_BODY: SoundLayer[] = [
  tone("impact", "sine", 0, 0.07, 0.001, [140, 85], 0.4, 0.08),
  noise("impact", "brown", 0, 0.05, 0.001, [700, 250], "lp", 0.8, 0.3, 0.1),
];

/**
 * The synthesized stand-in, heard only until the recordings have loaded: a hard click, the die
 * ringing at two pitches (a small resin cube rings high and dies fast), and the table's knock and
 * thump under it.
 */
const standIn = { unlessLoaded: "dice-clack-1" } as const;
export const DICE_CONTACT: SoundLayer[] = [
  noise("impact", "white", 0, 0.006, 0.0005, 6000, "hp", 0.7, 0.5, 0.05, standIn),
  tone("impact", "sine", 0, 0.035, 0.0005, [3400, 3300], 0.22, 0.08, standIn),
  tone("impact", "sine", 0, 0.025, 0.0005, [5100, 5000], 0.12, 0.08, standIn),
  noise("impact", "pink", 0, 0.03, 0.001, [1400, 700], "bp", 2.5, 0.35, 0.1, standIn),
  tone("impact", "sine", 0, 0.04, 0.001, [240, 170], 0.25, 0, standIn),
];
/** The small bounces are only the click and the ring; the table hardly answers them. */
export const DICE_TAP: SoundLayer[] = DICE_CONTACT.slice(0, 2);
/** Two dice knocking together, or a die's edge landing a moment before its face. */
export const DICE_TICK: SoundLayer[] = [DICE_CONTACT[0]!, DICE_CONTACT[2]!];
/** The die sliding to rest: a short, quiet scrape. */
export const DICE_SLIDE: SoundLayer[] = [noise("tail", "white", 0, 1, 0.02, [3500, 2200], "bp", 1.5, 0.06, 0.05, standIn)];
