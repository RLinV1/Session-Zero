// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { RoomState } from "@vtt/shared";
import { demoPair, demoTokenIds } from "../src/ui/tutorialDemo";
import { TUTORIAL_STEPS, countKeyChange, countMarks, countMoves, loadProgress, rollMarks, saveProgress, settle, type TutorialFacts } from "../src/ui/tutorialSteps";

const none: TutorialFacts = { tokens: 0, fog: 0, gmRolls: 0, moves: 0, invites: 0, mapEdits: 0, gridEdits: 0, wallEdits: 0, sightEdits: 0, terrainEdits: 0, encounters: 0, attackRolls: 0, rulings: 0, damageApplied: 0 };
const step = (name: string) => TUTORIAL_STEPS.findIndex((s) => s === name);
const broken = () => {
  throw new Error("storage blocked");
};

describe("the guest room's interactive demo (guest-gm-hosting: A guest room offers an interactive demo)", () => {
  beforeEach(() => localStorage.clear());

  it("walks through each map editor section independently", () => {
    expect(TUTORIAL_STEPS).toEqual(["table", "invite", "map", "grid", "walls", "fog", "sight", "terrain", "token", "move", "roll", "encounter", "attack", "ruling", "damage", "done"]);
  });

  it("stays on a step until its action happens, then moves on", () => {
    expect(settle(1, none)).toBe(1);
    expect(settle(1, { ...none, invites: 1 })).toBe(2);
    expect(settle(2, { ...none, invites: 1, mapEdits: 1 })).toBe(3);
    expect(settle(step("terrain"), { ...none, terrainEdits: 1 })).toBe(step("token"));
    expect(settle(0, { ...none, invites: 1 })).toBe(0); // Your table waits for Start
  });

  it("skips a step already done when it would start", () => {
    expect(settle(step("fog"), { ...none, fog: 2 })).toBe(step("sight"));
    expect(settle(step("walls"), { ...none, gridEdits: 1 })).toBe(step("walls"));
    expect(settle(step("sight"), { ...none, wallEdits: 1 })).toBe(step("sight"));
    const all = { ...none, invites: 1, mapEdits: 1, gridEdits: 1, wallEdits: 1, sightEdits: 1, terrainEdits: 1, tokens: 1, moves: 1, fog: 1 };
    expect(settle(1, all)).toBe(step("roll"));
    const rolled = { ...all, gmRolls: 1 };
    expect(settle(1, rolled)).toBe(step("encounter"));
    expect(settle(1, { ...rolled, encounters: 1 })).toBe(step("attack"));
    expect(settle(1, { ...rolled, encounters: 1, attackRolls: 1 })).toBe(step("ruling"));
    expect(settle(1, { ...rolled, encounters: 1, attackRolls: 1, rulings: 1 })).toBe(step("damage"));
    expect(settle(step("attack"), { ...rolled, attackRolls: 0, rulings: 1 })).toBe(step("attack"));
    const combat = { ...rolled, encounters: 1, attackRolls: 1, rulings: 1, damageApplied: 1 };
    expect(settle(1, combat)).toBe(step("done"));
  });

  it("counts only attacks, rulings and applied damage made after the baseline (the demo's start or restart)", () => {
    const old = [{ id: "a", attack: { kind: "toHit" as const }, verdict: "hit" }, { id: "b", attack: { kind: "damage" as const }, damageApplied: true }];
    const base = rollMarks(old);
    expect([...base].sort()).toEqual(["attack:a", "damage:b", "ruling:a"]);
    expect(countMarks(rollMarks(old), base, "attack")).toBe(0);
    const now = [...old, { id: "c", attack: { kind: "toHit" as const } }, { id: "d", attack: { kind: "damage" as const } }, { id: "e" }];
    const marks = rollMarks(now);
    expect([countMarks(marks, base, "attack"), countMarks(marks, base, "ruling"), countMarks(marks, base, "damage")]).toEqual([1, 0, 0]);
    const done = rollMarks([...now.slice(0, 2), { id: "c", attack: { kind: "toHit" as const }, verdict: "miss" }, { id: "d", attack: { kind: "damage" as const }, damageApplied: true }]);
    expect([countMarks(done, base, "ruling"), countMarks(done, base, "damage")]).toEqual([1, 1]);
  });

  it("counts a token that is somewhere else as a move, not a new or removed one", () => {
    expect(countMoves({ a: "1,1", b: "2,2" }, { a: "1,1", b: "2,2" })).toBe(0);
    expect(countMoves({ a: "1,1" }, { a: "3,1", b: "9,9" })).toBe(1);
    expect(countMoves({ a: "1,1", b: "2,2" }, { b: "2,2" })).toBe(0);
  });

  it("counts a changed state key once and an unchanged one not at all", () => {
    expect(countKeyChange('{"a":1}', '{"a":1}')).toBe(0);
    expect(countKeyChange('{"a":1}', '{"a":2}')).toBe(1);
  });

  it("resumes from storage", () => {
    expect(loadProgress("r1")).toBeNull();
    saveProgress("r1", 3);
    expect(loadProgress("r1")).toBe(3);
    expect(loadProgress("r2")).toBeNull();
  });

  it("remembers a declined and a finished demo", () => {
    saveProgress("r1", "declined");
    expect(loadProgress("r1")).toBe("declined");
    saveProgress("r1", "done");
    expect(loadProgress("r1")).toBe("done");
  });

  it("can resume the final lesson before Finish is pressed", () => {
    saveProgress("r1", step("done"));
    expect(loadProgress("r1")).toBe(step("done"));
  });

  it("resumes older progress at the same lesson after new editor lessons are inserted", () => {
    localStorage.setItem("vtt.tutorial.r1", "4");
    expect(loadProgress("r1")).toBe(step("token"));
    saveProgress("r1", step("walls"));
    expect(localStorage.getItem("vtt.tutorial.r1")).toBe("step:walls");
    expect(loadProgress("r1")).toBe(step("walls"));
  });

  it("resumes the new combat lessons by name, and old numbered progress still lands on its lesson", () => {
    for (const name of ["encounter", "attack", "ruling", "damage"]) {
      localStorage.setItem("vtt.tutorial.r1", `step:${name}`);
      expect(loadProgress("r1")).toBe(step(name));
    }
    localStorage.setItem("vtt.tutorial.r1", "7"); // Roll dice, before the combat lessons existed
    expect(loadProgress("r1")).toBe(step("roll"));
    localStorage.setItem("vtt.tutorial.r1", "5"); // Move it
    expect(loadProgress("r1")).toBe(step("move"));
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem("vtt.tutorial.r1", "99");
    expect(loadProgress("r1")).toBeNull();
    localStorage.setItem("vtt.tutorial.r1", "soon");
    expect(loadProgress("r1")).toBeNull();
  });

  it("works when storage fails", () => {
    expect(loadProgress("r1", broken)).toBeNull();
    expect(() => saveProgress("r1", 2, broken)).not.toThrow();
  });

  it("picks the demo fight's two tokens from the room, and only when both can fight", () => {
    const sword = { name: "Sword", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 5 }, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 } };
    const token = (id: string, name: string, stats: { hp: number | null; maxHp: number | null; ac: number | null }, attacks: unknown[] = []) => ({ id, name, stats, attacks });
    const room = (tokens: ReturnType<typeof token>[]) => ({ tokens: Object.fromEntries(tokens.map((x) => [x.id, x])) }) as unknown as RoomState;
    const plain = token("a", "Aria", { hp: 9, maxHp: 9, ac: 12 });
    expect(demoPair(room([]))).toBeNull();
    expect(demoPair(room([plain]))).toBeNull(); // no attack to roll
    expect(demoPair(room([plain, token("b", "Goblin", { hp: 7, maxHp: 7, ac: 8 })]))).toBeNull();
    const hero = token("h", "Hero", { hp: 12, maxHp: 12, ac: 14 }, [sword]);
    expect(demoPair(room([hero, token("g", "Orc", { hp: null, maxHp: null, ac: null })]))).toBeNull(); // nothing to hurt
    const pair = demoPair(room([hero, token("g", "Goblin", { hp: 7, maxHp: 7, ac: 8 })]));
    expect([pair?.hero.id, pair?.foe.id, pair?.attack.name]).toEqual(["h", "g", "Sword"]);
    expect(demoTokenIds(room([plain, token("d", "Demo hero", { hp: 1, maxHp: 1, ac: 1 })]))).toEqual(["d"]);
  });
});
