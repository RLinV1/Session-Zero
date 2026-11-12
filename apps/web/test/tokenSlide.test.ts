import { describe, expect, it } from "vitest";
import { slideDistance, slideDuration, SPEED_UP_MS } from "../src/board/tokenSlide";

const SQUARE = 70;
const live = (squares: number) => slideDuration(squares * SQUARE, SQUARE);

describe("token slide timing (token-slide)", () => {
  it("has gone under a third of a square 100 ms into a 3-square live slide", () => {
    const at100 = slideDistance(100, 3 * SQUARE, live(3));
    expect(at100).toBeLessThan(SQUARE / 3);
    expect(at100).toBeCloseTo(10.3, 0);
  });

  it("takes just under 1 s for 6 squares and about twice that for 12, with no cap", () => {
    expect(live(6)).toBeCloseTo(941, 0);
    expect(live(12)).toBeGreaterThan(2 * live(6) - SPEED_UP_MS);
    expect(live(30)).toBeCloseTo(4205, 0);
  });

  it("reaches the full length exactly at the duration", () => {
    for (const squares of [1, 3, 6, 30]) {
      const d = live(squares);
      expect(slideDistance(d, squares * SQUARE, d)).toBe(squares * SQUARE);
      expect(slideDistance(d - 1e-6, squares * SQUARE, d)).toBeCloseTo(squares * SQUARE, 3);
    }
  });

  it("fits a long replay slide into the 700 ms cap", () => {
    expect(slideDuration(30 * SQUARE, SQUARE, 700)).toBe(700);
    expect(slideDistance(700, 30 * SQUARE, 700)).toBe(30 * SQUARE);
  });

  it("never slows down", () => {
    for (const [length, duration] of [[3 * SQUARE, live(3)], [30 * SQUARE, 700], [SQUARE, 150]] as const) {
      let last = 0, lastSpeed = 0;
      for (let t = 1; t <= duration; t += 1) {
        const at = slideDistance(t, length, duration), speed = at - last;
        expect(speed).toBeGreaterThanOrEqual(lastSpeed - 1e-9);
        last = at; lastSpeed = speed;
      }
    }
  });

  it("ends on time when the whole slide is shorter than the speed-up", () => {
    expect(slideDistance(150, SQUARE, 150)).toBe(SQUARE);
    expect(slideDistance(75, SQUARE, 150)).toBeCloseTo(SQUARE / 4, 6);
  });
});
