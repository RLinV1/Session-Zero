import { describe, expect, it } from "vitest";
import { EMPTY_STATS, SHIPPED_MAPS, emptyRoomState, viewerSight, type Participant, type RoomState, type Token, type Wall } from "@vtt/shared";
import { darknessShapes, MAX_MERGED_SIGHT_CORNERS, type DarkShape } from "../src/board/sightMask";

/** The merged shapes, for sight under the corner cap. */
const merged = (...args: Parameters<typeof darknessShapes>) => {
  const shapes = darknessShapes(...args);
  if (!shapes) throw new Error("expected merged shapes, got the canvas fallback");
  return shapes;
};

type Pt = { x: number; y: number };
const square = (x: number, y: number, side: number): Pt[] => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];

/** Shoelace area of a flat ring. */
function ringArea(flat: number[]): number {
  let sum = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    sum += flat[i]! * flat[j + 1]! - flat[j]! * flat[i + 1]!;
  }
  return Math.abs(sum) / 2;
}
const darkArea = (shapes: DarkShape[]) => shapes.reduce((a, s) => a + ringArea(s.outer) - s.holes.reduce((h, r) => h + ringArea(r), 0), 0);

describe("darkness as merged shapes (fog-inner-fade-and-shared-dice, FR-GM-19)", () => {
  it("is the whole map with no sight", () => {
    const shapes = merged([], 800, 600);
    expect(shapes).toHaveLength(1);
    expect(darkArea(shapes)).toBe(800 * 600);
  });

  it("cuts one token's sight out of the map", () => {
    const shapes = merged([square(100, 100, 200)], 800, 600);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.holes).toHaveLength(1);
    expect(darkArea(shapes)).toBe(800 * 600 - 200 * 200);
  });

  it("merges overlapping sight from several tokens into one hole, with no seam", () => {
    // Two 200 px squares overlapping by 100 px: the lit area is 200*200*2 - 100*200.
    const shapes = merged([square(100, 100, 200), square(200, 100, 200)], 800, 600);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.holes).toHaveLength(1);
    expect(darkArea(shapes)).toBe(800 * 600 - (2 * 200 * 200 - 100 * 200));
  });

  it("keeps separate sight as separate holes", () => {
    const shapes = merged([square(50, 50, 100), square(500, 300, 100)], 800, 600);
    expect(shapes[0]!.holes).toHaveLength(2);
    expect(darkArea(shapes)).toBe(800 * 600 - 2 * 100 * 100);
  });

  it("handles sight that reaches the map's edge, with no hole outside the map", () => {
    const shapes = merged([square(0, 0, 300), square(-50, 400, 200)], 800, 600);
    for (const s of shapes) for (const xy of [s.outer, ...s.holes].flat()) expect(xy).toBeGreaterThanOrEqual(0);
    expect(darkArea(shapes)).toBe(800 * 600 - 300 * 300 - 150 * 200);
  });
});

describe("merging sight stays fast with 3 to 10 owned tokens (fog-inner-fade-and-shared-dice)", () => {
  // The largest shipped map, which also has the most walls: the worst case for sight's shape.
  const map = SHIPPED_MAPS.find((m) => m.slug === "broken-span")!;
  const player: Participant = { id: "p", role: "player", displayName: "Scout" };

  function room(tokens: number): RoomState {
    const state = emptyRoomState("r");
    state.scene = { map: { url: map.url, width: map.width, height: map.height }, grid: map.grid, lineOfSight: true };
    state.walls = Object.fromEntries((map.walls ?? []).map((w, i): [string, Wall] => [`w${i}`, { id: `w${i}`, ...w }]));
    // Spread over the map, a few cells apart, so each token sees a different part of it.
    for (let i = 0; i < tokens; i++) {
      const position = { x: map.width * ((i % 5) + 1) / 6, y: map.height * (Math.floor(i / 5) + 1) / 3 };
      const token: Token = { id: `t${i}`, name: `T${i}`, position, size: 1, rotation: 0, color: "#fff", imageUrl: null, ownerIds: [player.id], hidden: false, stats: EMPTY_STATS, conditions: [] };
      state.tokens[token.id] = token;
    }
    return state;
  }

  for (const count of [3, 5, 10]) {
    it(`merges ${count} tokens' sight on The Broken Span quickly`, () => {
      const sight = viewerSight(room(count), player)!;
      expect(sight.length).toBe(count);
      merged(sight, map.width, map.height);
      const runs = 10;
      const start = performance.now();
      for (let k = 0; k < runs; k++) merged(sight, map.width, map.height);
      const ms = (performance.now() - start) / runs;
      const corners = sight.reduce((n, p) => n + p.length, 0);
      // Reported so the cost can be read off the test run; the bound only catches a regression.
      console.info(`sight merge: ${count} tokens, ${corners} corners, ${ms.toFixed(2)} ms`);
      expect(ms).toBeLessThan(50);
      // The merged darkness never covers more than the map, and some of it is lit.
      expect(darkArea(merged(sight, map.width, map.height))).toBeLessThan(map.width * map.height);
    });
  }

  it("never fails to merge, over many random layouts of 3 to 10 tokens on every shipped map", () => {
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const shipped of SHIPPED_MAPS) {
      for (let trial = 0; trial < 16; trial++) {
        const state = emptyRoomState("r");
        state.scene = { map: { url: shipped.url, width: shipped.width, height: shipped.height }, grid: shipped.grid, lineOfSight: true };
        state.walls = Object.fromEntries((shipped.walls ?? []).map((w, i): [string, Wall] => [`w${i}`, { id: `w${i}`, ...w }]));
        for (let i = 0; i < 3 + (trial % 8); i++) {
          const position = { x: random() * shipped.width, y: random() * shipped.height };
          state.tokens[`t${i}`] = { id: `t${i}`, name: `T${i}`, position, size: 1, rotation: 0, color: "#fff", imageUrl: null, ownerIds: [player.id], hidden: false, stats: EMPTY_STATS, conditions: [] };
        }
        const sight = viewerSight(state, player)!;
        expect(() => darknessShapes(sight, shipped.width, shipped.height)).not.toThrow();
      }
    }
  });

  it("never crashes with 10 to 50 owned tokens crowded together, and caps the work", () => {
    let seed = 97;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const shipped of SHIPPED_MAPS) {
      const walls = Object.fromEntries((shipped.walls ?? []).map((w, i): [string, Wall] => [`w${i}`, { id: `w${i}`, ...w }]));
      for (let trial = 0; trial < 12; trial++) {
        const count = [10, 20, 30, 50][trial % 4]!;
        const state = emptyRoomState("r");
        state.scene = { map: { url: shipped.url, width: shipped.width, height: shipped.height }, grid: shipped.grid, lineOfSight: true };
        state.walls = walls;
        // Every token within three cells of one spot, half the time snapped to square centres.
        const cell = shipped.grid.cellSize;
        const cx = random() * shipped.width, cy = random() * shipped.height;
        for (let i = 0; i < count; i++) {
          let x = cx + (random() - 0.5) * 6 * cell, y = cy + (random() - 0.5) * 6 * cell;
          if (trial % 2 === 0) [x, y] = [Math.round(x / cell) * cell + cell / 2, Math.round(y / cell) * cell + cell / 2];
          const position = { x: Math.min(shipped.width - 1, Math.max(1, x)), y: Math.min(shipped.height - 1, Math.max(1, y)) };
          state.tokens[`t${i}`] = { id: `t${i}`, name: `T${i}`, position, size: 1, rotation: 0, color: "#fff", imageUrl: null, ownerIds: [player.id], hidden: false, stats: EMPTY_STATS, conditions: [] };
        }
        const sight = viewerSight(state, player)!;
        const corners = sight.reduce((n, p) => n + p.length, 0);
        const shapes = darknessShapes(sight, shipped.width, shipped.height);
        // Over the cap the board uses the canvas mask; under it, the merge always succeeds.
        if (corners > MAX_MERGED_SIGHT_CORNERS) expect(shapes === null || shapes.length > 0).toBe(true);
        else expect(shapes).not.toBeNull();
      }
    }
  });
});
