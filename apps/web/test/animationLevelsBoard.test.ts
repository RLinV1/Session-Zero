// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type Point, type Token } from "@vtt/shared";

const sound = vi.hoisted(() => ({ fx: vi.fn(), defeat: vi.fn() }));
vi.mock("../src/board/fxSound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/board/fxSound")>()),
  playFxSound: sound.fx,
  playDefeatSound: sound.defeat,
}));

import { BoardView } from "../src/board/boardView";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET } from "../src/board/effectPresets";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings, type AnimationLevel } from "../src/ui/clientSettings";

/** The centre of square (col, row) on the default 70 px grid. */
const at = (col: number, row: number): Point => ({ x: col * 70 + 35, y: row * 70 + 35 });
const you: Participant = { id: "gm", displayName: "GM", role: "gm" };

function sprite(start: Point) {
  const c = {
    x: start.x, y: start.y, alpha: 1, eventMode: "auto", destroyed: false, history: [] as Point[],
    position: { get x() { return c.x; }, get y() { return c.y; }, set: (x: number, y: number) => { c.x = x; c.y = y; c.history.push({ x, y }); } },
    scale: { set: vi.fn() },
    destroy: () => { c.destroyed = true; },
  };
  return c;
}

type Harness = {
  animations: Set<(now: number) => boolean>;
  tokens: Map<string, { container: ReturnType<typeof sprite> }>;
  dying: Map<string, () => void>;
  slide(tokenId: string, points: readonly Point[]): boolean;
  focusStrike(effect: { fromId: string; toId: string }): void;
  playAttackEffect(effect: unknown): void;
};

/** A board holding Aria at (1, 1) and a goblin at (4, 1); nothing is rendered. */
function board() {
  const token = (id: string, position: Point): Token => ({ id, name: id, position, size: 1, rotation: 0, color: "#c2410c", imageUrl: null, ownerIds: [], hidden: false, stats: { hp: 5, maxHp: 5, ac: null }, conditions: [] });
  const state = emptyRoomState("r");
  state.scene = { ...state.scene, map: { url: "/m.png", width: 700, height: 700 } };
  state.tokens = { aria: token("aria", at(1, 1)), goblin: token("goblin", at(4, 1)) };
  const aria = sprite(at(1, 1));
  const goblin = sprite(at(4, 1));
  const callbacks = { nukeImpact: vi.fn() };
  const view = new BoardView(document.createElement("div"), callbacks as never) as unknown as Harness & Record<string, unknown>;
  const startFx = vi.fn();
  const focusFight = vi.fn();
  Object.assign(view, {
    initialized: true, state, you, callbacks, drag: null,
    tokens: new Map([["aria", { container: aria, art: {}, radius: 30 }], ["goblin", { container: goblin, art: {}, radius: 30 }]]),
    pendingMoves: new Map(), pathMoves: new Map(), ownSlides: new Set(), slideIds: 0, animations: new Set(), dying: new Map(),
    fxRuns: [], fxLayer: { addChild: vi.fn() }, app: { screen: { width: 800, height: 600 } },
    startFx, focusFight, schedule: vi.fn(), invalidate: vi.fn(), applyArtOffset: vi.fn(),
  });
  vi.spyOn(performance, "now").mockReturnValue(0);
  return { view, aria, goblin, startFx, focusFight, callbacks };
}

const level = (l: AnimationLevel) => setClientSettings({ animationLevel: l, autoFocusAttacks: true });

beforeEach(() => { sound.fx.mockClear(); sound.defeat.mockClear(); });
afterEach(() => { vi.restoreAllMocks(); setClientSettings(DEFAULT_CLIENT_SETTINGS); });

describe("token movement at each Animations level (animation-levels)", () => {
  it("slides at Full and Reduced", () => {
    for (const l of ["full", "reduced"] as const) {
      level(l);
      const { view, aria } = board();
      expect(view.slide("aria", [at(1, 1), at(4, 1)])).toBe(true);
      // Under way, not yet on the new square.
      expect(view.animations.size).toBe(1);
      expect(aria.history.at(-1)).not.toEqual(at(4, 1));
    }
  });

  it("jumps straight to the square at None", () => {
    level("none");
    const { view, aria } = board();
    expect(view.slide("aria", [at(1, 1), at(4, 1)])).toBe(false);
    expect(aria.history.at(-1)).toEqual(at(1, 1));
  });
});

describe("strikes, camera focus and the nuke below Full (animation-levels)", () => {
  const strike = { kind: "strike", fromId: "aria", toId: "goblin", animation: ATTACK_STYLE_PRESETS.melee } as const;
  const nuke = { kind: "nuke", animation: NUKE_PRESET, origin: { x: 0, y: 0 }, amount: 5, tokenIds: ["goblin"] } as const;

  it("frames the fighters only at Full", () => {
    for (const l of ["full", "reduced", "none"] as const) {
      level(l);
      const { view, focusFight } = board();
      view.focusStrike({ fromId: "aria", toId: "goblin" });
      expect(focusFight).toHaveBeenCalledTimes(l === "full" ? 1 : 0);
    }
  });

  it.each(["reduced", "none"] as const)("draws nothing for a strike at %s, and plays its one soft cue", (l) => {
    level(l);
    const { view, startFx } = board();
    view.playAttackEffect(strike);
    expect(startFx).not.toHaveBeenCalled();
    expect(sound.fx).toHaveBeenCalledTimes(1);
    expect(sound.fx).toHaveBeenCalledWith(strike.animation, true);
  });

  it("draws nothing for a nuke at None, lands its hit points at once and plays the soft cue", () => {
    level("none");
    const { view, startFx, callbacks } = board();
    view.playAttackEffect(nuke);
    expect(startFx).not.toHaveBeenCalled();
    expect(callbacks.nukeImpact).toHaveBeenCalledTimes(1);
    expect(sound.fx).toHaveBeenCalledWith(NUKE_PRESET, true);
  });
});

describe("a defeated token at None (animation-levels)", () => {
  it("is removed in the same frame, with no fade", () => {
    level("none");
    const { view, goblin } = board();
    view.playAttackEffect({ kind: "defeat", tokenId: "goblin" });
    expect(goblin.destroyed).toBe(true);
    expect(view.tokens.has("goblin")).toBe(false);
    expect(view.dying.size).toBe(0);
    expect(view.animations.size).toBe(0);
  });

  it("fades over the frame loop at Reduced", () => {
    level("reduced");
    const { view, goblin } = board();
    view.playAttackEffect({ kind: "defeat", tokenId: "goblin" });
    expect(goblin.destroyed).toBe(false);
    expect(view.dying.has("goblin")).toBe(true);
  });
});
