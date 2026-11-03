import { describe, expect, it } from "vitest";
import { emptyRoomState, type AreaEffect, type RoomState, type Token } from "@vtt/shared";
import { amountText, applyToAll, draftFor, emptyDraft, parseAmount, resolveRows, resolveTargets } from "../src/panels/resolveDraft";

const token = (id: string, hp: number | null, conditions: Token["conditions"] = []): Token => ({
  id, name: id, position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null, ownerIds: [], hidden: false,
  stats: { hp, maxHp: hp, ac: null }, conditions,
});
const target = (tokenId: string) => ({ tokenId, name: tokenId, hidden: false, roll: { dice: [10], total: 12 } });
const effect = (damage: AreaEffect["damage"] = null): AreaEffect => ({
  id: "e1", label: "Fireball", expression: "1d20+2", byParticipantId: "gm",
  targets: [target("g1"), target("g2"), target("sign")], call: null, damage,
});
const room = (): RoomState => ({ ...emptyRoomState("r"), tokens: { g1: token("g1", 20, ["poisoned"]), g2: token("g2", 20), sign: token("sign", null) } });

describe("Resolve dialog draft (ADR 0046)", () => {
  it("is kept for the same effect and dropped for another or none", () => {
    const kept = { ...emptyDraft("e1"), step: 2, amounts: { g1: "14" } };
    expect(draftFor(kept, { id: "e1" })).toBe(kept);
    expect(draftFor(kept, { id: "e2" })).toEqual(emptyDraft("e2"));
    expect(draftFor(kept, null)).toBeNull();
  });

  it("shows rolled damage until the GM types an amount, so a later roll still fills in", () => {
    const draft = emptyDraft("e1");
    expect(amountText(draft, effect(), "g1")).toBe("0");
    const rolled = effect({ mode: "single", expression: "8d6", byParticipantId: "gm", dice: [5, 5, 5, 5, 4, 2, 1, 1], total: 28 });
    expect(amountText(draft, rolled, "g1")).toBe("28");
    expect(amountText({ ...draft, amounts: { g1: "14" } }, rolled, "g1")).toBe("14");
  });

  it("applies the shown target's conditions to every target, never one a target already has", () => {
    const draft = { ...emptyDraft("e1"), added: { g2: ["prone" as const, "poisoned" as const] } };
    const state = room();
    const next = applyToAll(draft, ["g1", "g2"], "g2", (id) => state.tokens[id]!.conditions);
    expect(next.added).toEqual({ g1: ["prone"], g2: ["prone", "poisoned"] });
  });

  it("builds the resolve rows for every target, and points at a bad amount", () => {
    const state = room();
    const rolled = effect({ mode: "single", expression: "8d6", byParticipantId: "gm", dice: [5, 5, 5, 5, 4, 2, 1, 1], total: 28 });
    const draft = { ...emptyDraft("e1"), amounts: { g2: "14" }, added: { g1: ["prone" as const] } };
    expect(resolveRows(draft, rolled, state)).toEqual({ ok: true, rows: [
      { tokenId: "g1", amount: 28, addConditions: ["prone"] },
      { tokenId: "g2", amount: 14, addConditions: [] },
      { tokenId: "sign", amount: null, addConditions: [] },
    ] });
    expect(resolveRows({ ...draft, amounts: { g2: "lots" } }, rolled, state)).toMatchObject({ ok: false, step: 1 });
  });

  it("steps only through targets still on the board, and reads amounts strictly", () => {
    const state = room();
    delete state.tokens.g2;
    expect(resolveTargets(effect(), state).map((t) => t.tokenId)).toEqual(["g1", "sign"]);
    expect(parseAmount("-5")).toBe(-5);
    expect(parseAmount("4.5")).toBeNull();
    expect(parseAmount("10000")).toBeNull();
  });
});
