import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CreateCreatureRequest, UpdateCreatureRequest } from "../src";
import { baseRoom, gm, run } from "./fixtures";

const valid = { name: "Goblin", size: 1, maxHp: 7, ac: 15, imageAssetId: null };
const ok = (input: object) => CreateCreatureRequest.safeParse({ ...valid, ...input }).success;

describe("library creature schemas (library-creatures, FR-TAC-07)", () => {
  it("bounds the name like a token's, and refuses a blank one", () => {
    expect(ok({ name: "" })).toBe(false);
    expect(ok({ name: "   " })).toBe(false);
    expect(ok({ name: "x".repeat(60) })).toBe(true);
    expect(ok({ name: "x".repeat(61) })).toBe(false);
  });

  it("bounds size, Max HP and AC like a token's", () => {
    expect([0, 10, 11].map((size) => ok({ size }))).toEqual([false, true, false]);
    expect([0, 1, 9999, 10000, 1.5].map((maxHp) => ok({ maxHp }))).toEqual([false, true, true, false, false]);
    expect([-1, 0, 99, 100].map((ac) => ok({ ac }))).toEqual([false, true, true, false]);
  });

  it("needs only a name, defaulting size to 1 and the rest to none", () => {
    expect(CreateCreatureRequest.parse({ name: "Rubble" })).toEqual({
      name: "Rubble", size: 1, hp: null, attacks: [], maxHp: null, ac: null, color: "#c0392b", conditions: [], imageAssetId: null, folder: null,
    });
  });

  it("takes only a uuid as the image id", () => {
    expect(ok({ imageAssetId: "builtin:brenna" })).toBe(false);
    expect(ok({ imageAssetId: randomUUID() })).toBe(true);
  });

  it("validates starting HP like TokenStats, without injecting it into partial updates (KAN-70)", () => {
    expect([-1000, -999, 0, 9999, 10000, 1.5].map((hp) => ok({ hp })))
      .toEqual([false, true, true, true, false, false]);
    expect(UpdateCreatureRequest.parse({ ac: 16 })).toEqual({ ac: 16 });
    expect(UpdateCreatureRequest.parse({ hp: null })).toEqual({ hp: null });
  });

  it("accepts a partial update and refuses an empty one", () => {
    expect(UpdateCreatureRequest.safeParse({ maxHp: 9 }).success).toBe(true);
    expect(UpdateCreatureRequest.safeParse({}).success).toBe(false);
    expect(UpdateCreatureRequest.safeParse({ size: 0 }).success).toBe(false);
  });

  it("always places as a valid token at full HP, at every boundary", () => {
    for (const creature of [
      { name: "x".repeat(60), size: 10, maxHp: 9999, ac: 99 },
      { name: "Imp", size: 0.25, maxHp: 1, ac: 0 },
      { name: "Rubble", size: 1, maxHp: null, ac: null },
    ]) {
      const parsed = CreateCreatureRequest.parse(creature);
      const { state } = run(baseRoom(), gm, {
        type: "token.create", name: parsed.name, position: { x: 35, y: 35 }, size: parsed.size,
        stats: { hp: parsed.maxHp, maxHp: parsed.maxHp, ac: parsed.ac },
      });
      expect(Object.values(state.tokens)[0]).toMatchObject({
        name: parsed.name, size: parsed.size, stats: { hp: parsed.maxHp, maxHp: parsed.maxHp, ac: parsed.ac },
      });
    }
  });
});
