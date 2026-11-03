import { describe, expect, it } from "vitest";
import { EMPTY_STATS, viewerSight, type Participant, type Token } from "@vtt/shared";
import { isBorderEdge, DIMMED_ALPHA, sightColor, sightMaskAlpha } from "../src/board/sightMask";
import { room } from "./mapEditorHarness";

describe("sight mask helpers (line-of-sight, FR-GM-19)", () => {
  it("detects edges lying along the map border only", () => {
    expect(isBorderEdge({ x: 0, y: 10 }, { x: 0, y: 90 }, 100, 100)).toBe(true);
    expect(isBorderEdge({ x: 10, y: 100 }, { x: 90, y: 99.5 }, 100, 100)).toBe(true);
    expect(isBorderEdge({ x: 0, y: 10 }, { x: 50, y: 50 }, 100, 100)).toBe(false);
    expect(isBorderEdge({ x: 0, y: 0 }, { x: 100, y: 100 }, 100, 100)).toBe(false);
  });

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
});
