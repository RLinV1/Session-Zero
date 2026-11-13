import { describe, expect, it } from "vitest";
import { MAX_STROKE_POINTS } from "@vtt/shared";
import { simplifyStroke } from "../src/board/simplifyStroke";

const pairs = (flat: number[]) => Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[2 * i]!, y: flat[2 * i + 1]! }));

describe("freehand strokes are simplified before sharing (shared-drawings, FR-TAC-04)", () => {
  it("collapses a straight line to its two ends", () => {
    const line = Array.from({ length: 200 }, (_, i) => ({ x: 10 + i * 2, y: 20 + i }));
    expect(simplifyStroke(line, 1.5)).toEqual([10, 20, 408, 219]);
  });

  it("keeps a circle's shape within the tolerance, in whole pixels", () => {
    const circle = Array.from({ length: 720 }, (_, i) => ({ x: 500 + 200 * Math.cos(i / 114.6), y: 400 + 200 * Math.sin(i / 114.6) }));
    const flat = simplifyStroke(circle, 1.5);
    expect(flat.every(Number.isInteger)).toBe(true);
    const kept = pairs(flat);
    expect(kept.length).toBeLessThan(80);
    // Every kept point still lies on the circle, give or take the tolerance and the rounding.
    for (const p of kept) expect(Math.abs(Math.hypot(p.x - 500, p.y - 400) - 200)).toBeLessThan(2.5);
  });

  it("fits a long scribble within the server's limit", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const scribble = Array.from({ length: 2000 }, () => ({ x: random() * 1400, y: random() * 1000 }));
    const flat = simplifyStroke(scribble, 1.5);
    expect(flat.length / 2).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    expect(flat.length / 2).toBeGreaterThanOrEqual(2);
  });

  it("turns a dot into a two-point stroke", () => {
    expect(simplifyStroke([{ x: 3.2, y: 4.7 }], 1.5)).toEqual([3, 5, 3, 5]);
  });
});
