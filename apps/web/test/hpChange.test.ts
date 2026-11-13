import { describe, expect, it } from "vitest";
import { MIN_HP } from "@vtt/shared";
import { applyHpDelta } from "../src/ui/hpChange";

describe("quick HP arithmetic (FR-PL-03, token-quick-hp)", () => {
  it("damages and heals within max HP", () => {
    expect(applyHpDelta({ hp: 12, maxHp: 12, ac: 15 }, -5)).toEqual({ hp: 7, maxHp: 12, ac: 15 });
    expect(applyHpDelta({ hp: 10, maxHp: 12, ac: null }, 5)).toEqual({ hp: 12, maxHp: 12, ac: null });
  });

  it("allows 0 and below, down to the lowest HP the server accepts", () => {
    expect(applyHpDelta({ hp: 3, maxHp: 12, ac: null }, -5)?.hp).toBe(-2);
    expect(applyHpDelta({ hp: -990, maxHp: 12, ac: null }, -50)?.hp).toBe(MIN_HP);
  });

  it("has no maximum to cap at when the token has none", () => {
    expect(applyHpDelta({ hp: 8, maxHp: null, ac: null }, 5)?.hp).toBe(13);
  });

  it("does nothing for a token that tracks no HP", () => {
    expect(applyHpDelta({ hp: null, maxHp: null, ac: 12 }, -1)).toBeNull();
  });
});
