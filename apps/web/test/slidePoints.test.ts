import { describe, expect, it } from "vitest";
import type { FogRegion, Participant, Point } from "@vtt/shared";
import { slidePointsFor } from "../src/board/slidePoints";

const gm: Pick<Participant, "role"> = { role: "gm" };
const player: Pick<Participant, "role"> = { role: "player" };
/** Fog over x 200..300, the full height. */
const fog: Record<string, FogRegion> = { f: { id: "f", shape: "rect", points: [{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 700 }, { x: 200, y: 700 }] } };
const move = (from: Point, to: Point, via?: Point[], gaps?: number[]) => ({ type: "TokenMoved" as const, tokenId: "t", from, to, ...(via && { via }), ...(gaps && { gaps }) });

describe("what a board slides a move through (token-slide, ADR 0055)", () => {
  it("uses a path as the server cut it", () => {
    const moved = move({ x: 0, y: 0 }, { x: 400, y: 0 }, [{ x: 150, y: 0 }, { x: 350, y: 0 }], [1]);
    expect(slidePointsFor(moved, player, { fog })).toEqual({ points: [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 350, y: 0 }, { x: 400, y: 0 }], gaps: [1] });
  });

  it("gives the GM a straight move uncut, even through fog", () => {
    expect(slidePointsFor(move({ x: 0, y: 50 }, { x: 400, y: 50 }), gm, { fog })).toEqual({ points: [{ x: 0, y: 50 }, { x: 400, y: 50 }], gaps: [] });
  });

  it("cuts a player's straight move at fog, with no point inside it", () => {
    const { points, gaps } = slidePointsFor(move({ x: 0, y: 50 }, { x: 400, y: 50 }), player, { fog });
    expect(gaps).toHaveLength(1);
    expect(points.every((p) => p.x <= 200 || p.x >= 300)).toBe(true);
    expect(points.at(-1)).toEqual({ x: 400, y: 50 });
  });

  it("cuts a player's straight move at their sight", () => {
    const sight = [[{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 100 }, { x: 0, y: 100 }]];
    const { points, gaps } = slidePointsFor(move({ x: 0, y: 50 }, { x: 400, y: 50 }), player, { fog: {}, sight });
    expect(gaps).toEqual([1]);
    expect(points[1]).toEqual({ x: 250, y: 50 });
  });
});
