// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATS, viewerSight, type Participant, type Token } from "@vtt/shared";
import { DIMMED_ALPHA, makeSightMaskCanvas, sightColor, sightMaskAlpha } from "../src/board/sightMask";
import { room } from "./mapEditorHarness";

describe("sight mask helpers (line-of-sight, FR-GM-19)", () => {
  it("tints the darkness to the map, near-black but never pure black", () => {
    const [r, g, b] = sightColor([40, 120, 50]);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(Math.max(r, g, b)).toBeLessThan(40);
    expect(sightColor(null).some((c) => c > 0)).toBe(true);
    expect(sightColor([0, 0, 0]).every((c) => c > 0)).toBe(true);
  });

  it("dims the map rather than blacking it out for a player with no token to see through", () => {
    const player: Participant = { id: "p", role: "player", displayName: "New player" };
    const token = (ownerIds: string[], hidden = false): Token => ({
      id: "t", name: "Scout", position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#fff", imageUrl: null,
      ownerIds, hidden, stats: EMPTY_STATS, conditions: [],
    });
    const s = room({ walls: [] });
    s.scene = { ...s.scene, lineOfSight: true };
    // Just joined: no token, so no sight at all, and the map shows dimmed.
    expect(viewerSight(s, player)).toEqual([]);
    expect(sightMaskAlpha(viewerSight(s, player)!)).toBe(DIMMED_ALPHA);
    expect(DIMMED_ALPHA).toBeLessThan(1);
    // Their only token is hidden: the same.
    s.tokens = { t: token(["p"], true) };
    expect(sightMaskAlpha(viewerSight(s, player)!)).toBe(DIMMED_ALPHA);
    // A token of their own: full darkness outside what it sees.
    s.tokens = { t: token(["p"]) };
    expect(sightMaskAlpha(viewerSight(s, player)!)).toBe(1);
  });

  it("blacks the map out for a player with no token when the GM hides it, with or without line of sight (table-rules)", () => {
    const player: Participant = { id: "p", role: "player", displayName: "New player" };
    const s = { ...room({ walls: [] }), hideMapWithoutToken: true };
    expect(s.scene.lineOfSight).not.toBe(true);
    expect(viewerSight(s, player)).toEqual([]);
    expect(sightMaskAlpha(viewerSight(s, player)!, true)).toBe(1);
    s.scene = { ...s.scene, lineOfSight: true };
    expect(sightMaskAlpha(viewerSight(s, player)!, true)).toBe(1);
  });
});

describe("darkness has a crisp edge (fog-inner-fade-and-shared-dice, FR-GM-19)", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Records what the mask paints, since jsdom has no 2D canvas. */
  function recordPaint() {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (target, key) => (key in target ? target[key] : (...args: unknown[]) => void calls.push(`${String(key)}(${args.join(",")})`)),
      set: (target, key, value) => {
        target[key] = value;
        calls.push(`${String(key)}=${String(value)}`);
        return true;
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    return calls;
  }

  it("darkens everything, then clears exactly the sight polygons, with no fade or blur", () => {
    const calls = recordPaint();
    const room = [{ x: 200, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 500 }, { x: 200, y: 500 }];
    makeSightMaskCanvas([room], 800, 700, 50, [10, 12, 14]);
    expect(calls).toContain("fillRect(0,0,800,700)");
    expect(calls.filter((c) => c.startsWith("clearRect"))).toHaveLength(1);
    expect(calls.some((c) => c.startsWith("filter") || c.startsWith("stroke") || c.startsWith("globalAlpha"))).toBe(false);
  });

  it("stays fully dark with no sight", () => {
    const calls = recordPaint();
    makeSightMaskCanvas([], 800, 700, 50, [10, 12, 14]);
    expect(calls).toContain("fillRect(0,0,800,700)");
    expect(calls.some((c) => c.startsWith("clearRect"))).toBe(false);
  });
});
