// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANIMATION_SHAPES, type AnimationDef } from "@vtt/shared";
import { SHAPE_DEFAULTS, withDefaults } from "../src/board/effectPresets";
import type { RunningFx } from "../src/board/fx";
import { NUKE_DROP_SHARE } from "../src/board/fxBudget";
import { STRIKE_SHAPES } from "../src/board/fxStrikes";
import { createShakeTracker, MAX_REPEATS, MAX_VOICED_DICE, playDiceSound, playFxSound, scheduleDice, scheduleSound, SHAKE_MIN_GAP_MS, SHAKE_TRAVEL_PX, soundLength, startDiceShake, withSound, type ShakeSample } from "../src/board/fxSound";
import { DICE_CLACKS, DICE_CONTACT, DICE_SLIDE, DICE_TAPS, SFX_CLIPS, SHAPE_SOUNDS, SOUND_THEMES, type SfxClip } from "../src/board/fxSoundRecipes";
import { THROW_CONTACTS, THROW_MS, throwStagger } from "../src/ui/diceGeometry";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

afterEach(() => setClientSettings(DEFAULT_CLIENT_SETTINGS));

const still = () => 0.5;
const firstImpact = (def: AnimationDef) => scheduleSound(def, { reduced: false, rng: still }).filter((v) => v.layer.cue === "impact").reduce((a, v) => Math.min(a, v.beat), Infinity);

describe("animation sounds (FR-TAC-09)", () => {
  it("gives every shape a sound with an impact", () => {
    for (const shape of ANIMATION_SHAPES) {
      const layers = SHAPE_SOUNDS[shape];
      expect(layers.length, shape).toBeGreaterThan(0);
      expect(layers.some((l) => l.cue === "impact"), shape).toBe(true);
      for (const l of layers) {
        const at = typeof l.at === "function" ? l.at(withDefaults(SHAPE_DEFAULTS[shape])) : l.at;
        expect(at, shape).toBeGreaterThanOrEqual(0);
        expect(at, shape).toBeLessThanOrEqual(1);
        expect(l.gain, shape).toBeGreaterThan(0);
        expect(l.gain, shape).toBeLessThanOrEqual(1);
      }
    }
  });

  it("lands each animation's first impact sound on the frame its impact is drawn", () => {
    for (const shape of ANIMATION_SHAPES) {
      const def = SHAPE_DEFAULTS[shape];
      const land = shape === "nuke" ? NUKE_DROP_SHARE : STRIKE_SHAPES[shape].land;
      expect(firstImpact(def), shape).toBeCloseTo(land * def.duration, 2);
    }
  });

  it("follows the hits the drawing spaces by count", () => {
    const def = SHAPE_DEFAULTS.chain;
    const cracks = (count: number) => scheduleSound({ ...def, count }, { reduced: false, rng: still }).filter((v) => v.layer.cue === "tail" && v.layer.kind === "sample" && v.layer.clip === "whip-crack");
    // Chain lightning: jump i arrives at L + (i - 1 + 0.6) * step, step = (0.85 D - L) / n (SOUND-PLAN.md).
    const step = (0.55 * def.duration) / 4;
    expect(cracks(4).map((v) => v.beat)).toEqual([0, 1, 2, 3].map((i) => expect.closeTo(0.3 * def.duration + (i + 0.6) * step, 1)));
    expect(cracks(8)).toHaveLength(8);
  });

  it("winds the nuke's siren up like a rotor, in step with the nuke's duration", () => {
    const glides = (duration: number) => scheduleSound({ ...SHAPE_DEFAULTS.nuke, duration }, { reduced: false, rng: still }).flatMap((v) => (v.glide ? [v.glide] : []));
    expect(glides(SHAPE_DEFAULTS.nuke.duration)).toEqual([0.7, 0.7]);
    expect(glides(SHAPE_DEFAULTS.nuke.duration / 2)).toEqual([0.35, 0.35]);
  });

  it("gives every shape a real-world theme", () => {
    for (const shape of ANIMATION_SHAPES) expect(SOUND_THEMES[shape].length, shape).toBeGreaterThan(10);
  });

  it("starts each recorded hit early by its own lead-in, so the hit lands on the beat", () => {
    for (const shape of ANIMATION_SHAPES) {
      for (const v of scheduleSound(SHAPE_DEFAULTS[shape], { reduced: false, rng: still })) {
        if (v.layer.kind !== "sample" || v.layer.env !== "hit") continue;
        const lead = SFX_CLIPS[v.layer.clip].hit / (v.layer.rate * v.pitch);
        // A hit too close to the start begins part-way into its clip instead.
        expect(v.start + lead - v.offset / (v.layer.rate * v.pitch), `${shape} ${v.layer.clip}`).toBeCloseTo(v.beat, 5);
      }
    }
  });

  it("ships every clip it plays, each credited with its source and CC0 licence", () => {
    // jsdom serves the test module from an http URL, so locate the folder from the file instead.
    const dir = join(__dirname, "../public/sfx");
    const files = readdirSync(dir).filter((f) => f.endsWith(".mp3")).map((f) => f.replace(/\.mp3$/, "")).sort();
    expect(files).toEqual(Object.keys(SFX_CLIPS).sort());
    const credits = readFileSync(join(dir, "CREDITS.md"), "utf8");
    for (const name of Object.keys(SFX_CLIPS) as SfxClip[]) {
      const row = credits.split("\n").find((line) => line.startsWith(`| \`${name}.mp3\``));
      expect(row, name).toMatch(/\]\(https:\/\/(bigsoundbank\.com|opengameart\.org)\/[^)]+\) \| [^|]+ \| CC0/);
      expect(SFX_CLIPS[name].hit, name).toBeLessThan(SFX_CLIPS[name].length);
    }
  });

  it("keeps the impact on its beat when the duration is changed", () => {
    const def = SHAPE_DEFAULTS.fireball;
    for (const duration of [0.4, 1.4, 4]) {
      expect(firstImpact({ ...def, duration })).toBeCloseTo(STRIKE_SHAPES.fireball.land * duration, 5);
    }
  });

  it("repeats a counted layer once per hit, capped", () => {
    const counted = ANIMATION_SHAPES.flatMap((shape) => SHAPE_SOUNDS[shape].filter((l) => l.repeat?.count === "count").map((l) => ({ shape, layer: l })));
    expect(counted.length).toBeGreaterThan(0);
    const { shape, layer } = counted[0]!;
    const of = (count: number) => scheduleSound({ ...SHAPE_DEFAULTS[shape], count }, { reduced: false, rng: still }).filter((v) => v.layer === layer).length;
    expect(of(3)).toBe(3);
    expect(of(40)).toBe(MAX_REPEATS);
  });

  it("plays only a short, soft cue at once with reduced animations", () => {
    for (const shape of ANIMATION_SHAPES) {
      const voices = scheduleSound(SHAPE_DEFAULTS[shape], { reduced: true, rng: still });
      expect(voices.length, shape).toBeGreaterThan(0);
      for (const v of voices) {
        expect(v.start, shape).toBe(0);
        expect(v.gain, shape).toBeLessThanOrEqual(0.3);
      }
      expect(soundLength(voices), shape).toBeLessThanOrEqual(0.5);
      // Still the same cue when the animation runs long: there is no timeline to follow.
      expect(soundLength(scheduleSound({ ...SHAPE_DEFAULTS[shape], duration: 4 }, { reduced: true, rng: still }))).toBe(soundLength(voices));
    }
  });

  it("ends every sound within a short tail of its animation", () => {
    for (const shape of ANIMATION_SHAPES) {
      const def = SHAPE_DEFAULTS[shape];
      expect(soundLength(scheduleSound(def, { reduced: false, rng: still })), shape).toBeLessThanOrEqual(def.duration + 2.5);
    }
  });

  it("varies pitch a little from play to play", () => {
    const def = SHAPE_DEFAULTS.slash;
    const low = scheduleSound(def, { reduced: false, rng: () => 0 })[0]!.pitch;
    const high = scheduleSound(def, { reduced: false, rng: () => 0.999 })[0]!.pitch;
    expect(high / low).toBeGreaterThan(1.05);
    expect(high / low).toBeLessThan(1.12);
  });

  it("stays silent and leaves the effect untouched where there is no audio or the volume is zero", () => {
    const run: RunningFx = { update: () => true, destroy: vi.fn() };
    expect(playFxSound(SHAPE_DEFAULTS.slash)).toBeNull();
    expect(withSound(run, SHAPE_DEFAULTS.slash, false)).toBe(run);
    setClientSettings({ soundVolume: 0 });
    expect(playFxSound(SHAPE_DEFAULTS.nuke)).toBeNull();
  });
});

describe("dice sounds (FR-TAC-09)", () => {
  // The die's own ring sounds on every contact and nowhere else, so it marks each one.
  const ring = DICE_CONTACT[1]!;
  const rings = (count: number, staggerMs: number) => scheduleDice({ count, staggerMs }, still).filter((v) => v.layer === ring);

  it("clacks each die on every bounce its keyframes make", () => {
    const stagger = throwStagger(3);
    const expected = [0, 1, 2].flatMap((i) => THROW_CONTACTS.map(({ at }) => (i * stagger + at * THROW_MS) / 1000));
    expect(rings(3, stagger).map((v) => v.start).sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b).map((t) => expect.closeTo(t, 5)));
  });

  it("strikes softer with each bounce, as each falls from lower", () => {
    const gains = rings(1, 0).map((v) => v.gain);
    expect(gains).toHaveLength(THROW_CONTACTS.length);
    for (let k = 1; k < gains.length; k++) expect(gains[k]!).toBeLessThan(gains[k - 1]!);
  });

  it("voices at most ten dice, and a handful is not ten times as loud", () => {
    expect(rings(20, 21)).toHaveLength(MAX_VOICED_DICE * THROW_CONTACTS.length);
    const total = (count: number) => rings(count, 40).reduce((sum, v) => sum + v.gain, 0);
    expect(total(10) / total(1)).toBeGreaterThan(3);
    expect(total(10) / total(1)).toBeLessThan(7);
  });

  it("slides each die to rest and is quiet once the last die has", () => {
    const stagger = throwStagger(4);
    const voices = scheduleDice({ count: 4, staggerMs: stagger }, still);
    expect(voices.filter((v) => v.layer === DICE_SLIDE[0])).toHaveLength(4);
    expect(soundLength(voices)).toBeGreaterThan((3 * stagger + THROW_MS) / 1000 - 0.01);
    expect(soundLength(voices)).toBeLessThan((3 * stagger + THROW_MS) / 1000 + 0.1);
  });

  it("lands a recorded clack or tap on every contact, its strike on the beat", () => {
    const stagger = throwStagger(2);
    const voices = scheduleDice({ count: 2, staggerMs: stagger }, still);
    const recorded = voices.filter((v) => DICE_CLACKS.includes(v.layer as never) || DICE_TAPS.includes(v.layer as never));
    const contacts = [0, 1].flatMap((i) => THROW_CONTACTS.map(({ at }) => (i * stagger + at * THROW_MS) / 1000));
    for (const t of contacts) expect(recorded.some((v) => Math.abs(v.beat - t) < 1e-9), `contact at ${t}`).toBe(true);
    for (const v of recorded) {
      if (v.layer.kind !== "sample") continue;
      const speed = v.layer.rate * v.pitch;
      expect(v.start + SFX_CLIPS[v.layer.clip].hit / speed - v.offset / speed).toBeCloseTo(v.beat, 9);
    }
  });

  it("gives dice drawn at rest one soft clack, at once", () => {
    const voices = scheduleDice({ count: 6, staggerMs: 0, reduced: true }, still);
    expect(voices.filter((v) => v.layer === ring).length).toBeLessThanOrEqual(3);
    for (const v of voices) expect(v.start).toBeLessThan(0.1);
    expect(voices.some((v) => v.layer === DICE_SLIDE[0])).toBe(false);
  });

  it("is silent where there is no audio, and for no dice", () => {
    expect(playDiceSound({ count: 2, staggerMs: 60 })).toBeNull();
    expect(scheduleDice({ count: 0, staggerMs: 60 }, still)).toEqual([]);
  });
});

describe("held die rattle (FR-TAC-09)", () => {
  /** Feeds samples every 16 ms; returns each rattle's time and strength. */
  const run = (path: (t: number) => number, ms: number) => {
    const track = createShakeTracker();
    const hits: Array<{ t: number; strength: number }> = [];
    for (let t = 0; t <= ms; t += 16) {
      const strength = track({ x: path(t), y: 300, t });
      if (strength !== null) hits.push({ t, strength });
    }
    return hits;
  };

  it("stays quiet while the die is held still or dragged slowly", () => {
    expect(run(() => 400, 2000)).toEqual([]);
    expect(run((t) => 400 + 0.1 * t, 2000)).toEqual([]);
  });

  it("rattles softly every stretch of a steady drag", () => {
    const hits = run((t) => 100 + 0.6 * t, 1000);
    expect(hits.length).toBeGreaterThanOrEqual(Math.floor(600 / SHAKE_TRAVEL_PX) - 1);
    expect(hits.length).toBeLessThanOrEqual(Math.ceil(600 / SHAKE_TRAVEL_PX));
    for (const h of hits) expect(h.strength).toBeLessThanOrEqual(0.5);
  });

  it("rattles hard each time a shake turns, never closer than the minimum gap", () => {
    // Back and forth at 1.5 px/ms, turning every 120 ms.
    const hits = run((t) => 400 + 1.5 * (Math.floor(t / 120) % 2 === 0 ? t % 120 : 120 - (t % 120)), 1200);
    expect(hits.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...hits.map((h) => h.strength))).toBeGreaterThan(0.6);
    for (let i = 1; i < hits.length; i++) expect(hits[i]!.t - hits[i - 1]!.t).toBeGreaterThanOrEqual(SHAKE_MIN_GAP_MS);
  });

  it("counts a turn after a pause between two strokes", () => {
    const track = createShakeTracker();
    const feed = (samples: ShakeSample[]) => samples.map((sample) => track(sample));
    feed([{ x: 0, y: 0, t: 0 }, { x: 40, y: 0, t: 20 }, { x: 80, y: 0, t: 40 }]);
    feed([{ x: 80, y: 0, t: 60 }, { x: 80, y: 0, t: 80 }]);
    expect(feed([{ x: 40, y: 0, t: 100 }]).at(-1)).toBeGreaterThan(0.6);
  });

  it("is silent where there is no audio or the volume is zero", () => {
    expect(startDiceShake()).toBeNull();
    setClientSettings({ soundVolume: 0 });
    expect(startDiceShake()).toBeNull();
  });
});

/** Enough of Web Audio to build the node graph and see what was played and cut. */
function fakeAudio() {
  const param = () => {
    const p = {
      value: 0,
      setValueAtTime: (v: number) => { p.value = v; return p; },
      linearRampToValueAtTime: (v: number) => { p.value = v; return p; },
      exponentialRampToValueAtTime: (v: number) => {
        if (!(v > 0)) throw new RangeError("exponential ramp to a non-positive value");
        p.value = v;
        return p;
      },
      setTargetAtTime: () => p,
    };
    return p;
  };
  const node = () => ({ connect: <T>(n: T) => n, disconnect: vi.fn() });
  const started: string[] = [];
  const outs: Array<{ gain: ReturnType<typeof param> }> = [];
  class FakeContext {
    state = "running";
    currentTime = 0;
    sampleRate = 4000;
    destination = node();
    resume = () => Promise.resolve();
    createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
    createGain = () => {
      const g = { ...node(), gain: param() };
      // A GainNode starts at unity.
      g.gain.value = 1;
      outs.push(g);
      return g;
    };
    createDynamicsCompressor = () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
    createConvolver = () => ({ ...node(), buffer: null });
    createBiquadFilter = () => ({ ...node(), type: "lowpass", frequency: param(), Q: param() });
    createStereoPanner = () => ({ ...node(), pan: param() });
    createOscillator = () => ({ ...node(), type: "sine", frequency: param(), start: () => started.push("tone"), stop: vi.fn(), onended: null });
    createBufferSource = () => {
      const source = {
        ...node(), buffer: null as { clip?: boolean } | null, loop: false, loopStart: 0, loopEnd: 0, playbackRate: param(), stop: vi.fn(), onended: null,
        start: () => started.push(source.buffer?.clip ? "clip" : "noise"),
      };
      return source;
    };
    decodeAudioData = () => Promise.resolve({ duration: 1, clip: true });
  }
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
  return { started, outs };
}

describe("animation sound playback (FR-TAC-09)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function freshModule() {
    vi.resetModules();
    return import("../src/board/fxSound");
  }

  it("builds every shape's sound without an invalid ramp, synth alone and with its clips", async () => {
    const audio = fakeAudio();
    const sound = await freshModule();
    // The first play starts the engine, which begins loading the clips: this one is synth only.
    for (const shape of ANIMATION_SHAPES) {
      const handle = sound.playFxSound(SHAPE_DEFAULTS[shape]);
      expect(handle, shape).not.toBeNull();
      handle!.stop();
    }
    expect(audio.started).not.toContain("clip");
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const shape of ANIMATION_SHAPES) {
      const handle = sound.playFxSound(SHAPE_DEFAULTS[shape]);
      expect(handle, shape).not.toBeNull();
      handle!.stop();
    }
    const clips = SHAPE_SOUNDS.slash.filter((l) => l.kind === "sample").length;
    expect(audio.started.filter((s) => s === "clip").length).toBeGreaterThan(clips * 5);
  });

  it("hears one attack at several targets once, and caps how many play together", async () => {
    fakeAudio();
    const sound = await freshModule();
    expect(sound.playFxSound(SHAPE_DEFAULTS.slash)).not.toBeNull();
    expect(sound.playFxSound(SHAPE_DEFAULTS.slash)).toBeNull();
    const others = ANIMATION_SHAPES.filter((s) => s !== "slash").map((s) => sound.playFxSound(SHAPE_DEFAULTS[s]));
    expect(others.filter(Boolean)).toHaveLength(sound.MAX_SOUNDS - 1);
  });

  it("plays the dice stand-in only until the recordings have loaded", async () => {
    const audio = fakeAudio();
    const sound = await freshModule();
    const tones = () => audio.started.filter((s) => s === "tone").length;
    // Two dice each land hard twice (the drop and the first bounce): one table thump each.
    const thumps = 2 * 2;
    sound.playDiceSound({ count: 2, staggerMs: 60 })!.stop();
    expect(tones()).toBeGreaterThan(thumps);
    expect(audio.started).not.toContain("clip");
    await new Promise((resolve) => setTimeout(resolve, 0));
    audio.started.length = 0;
    sound.playDiceSound({ count: 2, staggerMs: 60 })!.stop();
    expect(audio.started).toContain("clip");
    expect(tones()).toBe(thumps);
  });

  it("rattles a held die as it is shaken and now and then while still, and stops dead on release", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
    try {
      const audio = fakeAudio();
      const sound = await freshModule();
      // The first hold starts the engine; let the clips load.
      sound.startDiceShake()!.stop();
      await vi.advanceTimersByTimeAsync(10);
      audio.started.length = 0;
      const before = audio.outs.length;
      const shake = sound.startDiceShake()!;
      const out = audio.outs[before]!;
      for (let t = 0; t <= 480; t += 16) shake.move({ x: 400 + 1.5 * (Math.floor(t / 120) % 2 === 0 ? t % 120 : 120 - (t % 120)), y: 300, t });
      const shaken = audio.started.filter((s) => s === "clip").length;
      expect(shaken).toBeGreaterThanOrEqual(3);
      // Held still: a faint jiggle within a second and a half.
      vi.advanceTimersByTime(1500);
      expect(audio.started.filter((s) => s === "clip").length).toBeGreaterThan(shaken);
      shake.stop();
      expect(out.gain.value).toBe(0);
      const after = audio.started.length;
      for (let t = 500; t <= 900; t += 16) shake.move({ x: 400 + (t % 64 < 32 ? 0 : 60), y: 300, t });
      vi.advanceTimersByTime(3000);
      expect(audio.started.length).toBe(after);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps dice throws on their own, so a roll never silences its attack", async () => {
    fakeAudio();
    const sound = await freshModule();
    const throws = Array.from({ length: sound.MAX_DICE_SOUNDS + 1 }, () => sound.playDiceSound({ count: 2, staggerMs: 60 }));
    expect(throws.filter(Boolean)).toHaveLength(sound.MAX_DICE_SOUNDS);
    expect(sound.playFxSound(SHAPE_DEFAULTS.slash)).not.toBeNull();
  });

  it("hears a replay a second later even while a new audio clock has not started", async () => {
    fakeAudio();
    const sound = await freshModule();
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    // The fake clock stays at 0, as a just-created context's does until the output device starts.
    expect(sound.playFxSound(SHAPE_DEFAULTS.slash)).not.toBeNull();
    now.mockReturnValue(2000);
    expect(sound.playFxSound(SHAPE_DEFAULTS.slash)).not.toBeNull();
  });

  it("cuts the sound of an effect destroyed early, and lets one that finished ring out", async () => {
    const audio = fakeAudio();
    const sound = await freshModule();
    const destroy = vi.fn();
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    // Starts the engine (its own gains come first), then cuts that sound so it does not count.
    sound.playFxSound(SHAPE_DEFAULTS.slash)!.stop();
    // Each play's own output gain is the first one it makes.
    let before = audio.outs.length;
    const early = sound.withSound({ update: () => true, destroy }, SHAPE_DEFAULTS.fireball, false);
    const out = audio.outs[before]!;
    early.destroy();
    expect(destroy).toHaveBeenCalledOnce();
    expect(out.gain.value).toBe(0);

    before = audio.outs.length;
    const late = sound.withSound({ update: () => true, destroy: vi.fn() }, SHAPE_DEFAULTS.bolt, false);
    const lateOut = audio.outs[before]!;
    now.mockReturnValue(1000 + SHAPE_DEFAULTS.bolt.duration * 1000);
    late.destroy();
    expect(lateOut.gain.value).toBe(1);
  });
});
