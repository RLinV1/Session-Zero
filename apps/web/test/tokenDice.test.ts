import { describe, expect, it } from "vitest";
import { emptyRoomState, type AreaEffect, type DomainEvent, type Participant, type RoomState, type Token } from "@vtt/shared";
import { addDrop, centroid, damageRollId, dropFor, MAX_DROP_DICE, savesRollId, type BoardDrop } from "../src/board/tokenDice";

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const player: Participant = { id: "p", role: "player", displayName: "Mira" };
const token = (id: string, x: number, y: number): Token => ({
  id, name: id, position: { x, y }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null, ownerIds: [], hidden: false,
  stats: { hp: 10, maxHp: 10, ac: null }, conditions: [],
});
const room = (areaEffect: AreaEffect | null = null): RoomState => ({
  ...emptyRoomState("r"), tokens: { a: token("a", 35, 35), b: token("b", 175, 35) }, areaEffect,
});
const effect: AreaEffect = {
  id: "e", label: null, expression: "1d20+2", byParticipantId: "gm",
  targets: [
    { tokenId: "a", name: "a", hidden: false, roll: { dice: [10], total: 12 } },
    { tokenId: "b", name: "b", hidden: false, roll: { dice: [3], total: 5 } },
  ],
  call: null, damage: null,
};

describe("Dice dropped onto tokens (ADR 0046)", () => {
  it("drops a group roll's dice on each token it names", () => {
    const event: DomainEvent = { type: "GroupRolled", roll: { kind: "group", id: "g", expression: "1d20", label: null, byParticipantId: "gm", visibility: "public", entries: [
      { tokenId: "a", name: "a", hidden: false, dice: [7], total: 7 },
      { tokenId: "gone", name: "gone", hidden: false, dice: [2], total: 2 },
    ] } };
    const drop = dropFor(event, room(), player)!;
    expect(drop).toMatchObject({ rollId: "g", sides: 20, gmOnly: false, totalsOnly: false });
    expect(drop.groups).toEqual([{ key: "a", at: { x: 35, y: 35 }, dice: [7], total: 7 }]);
  });

  it("drops the saves for the GM only", () => {
    const started: DomainEvent = { type: "AreaEffectStarted", effect };
    expect(dropFor(started, room(effect), gm)).toMatchObject({ rollId: savesRollId("e"), gmOnly: true });
    expect(dropFor(started, room(effect), player)).toBeNull();
  });

  it("drops one damage roll in the middle of the targets, or each target's on it", () => {
    const single: DomainEvent = { type: "AreaEffectDamageRolled", effectId: "e", damage: { mode: "single", expression: "8d6", byParticipantId: "p", dice: [1, 2, 3, 4, 5, 6, 1, 2], total: 24 } };
    const one = dropFor(single, room(effect), player)!;
    expect(one.rollId).toBe(damageRollId("e"));
    expect(one.groups).toEqual([{ key: "all", at: { x: 105, y: 35 }, dice: [1, 2, 3, 4, 5, 6, 1, 2], total: 24 }]);
    const per: DomainEvent = { type: "AreaEffectDamageRolled", effectId: "e", damage: { mode: "perTarget", expression: "2d6", byParticipantId: "p", results: [{ tokenId: "b", dice: [3, 4], total: 7 }] } };
    expect(dropFor(per, room(effect), player)!.groups.map((g) => g.key)).toEqual(["b"]);
  });

  it("shows one total per token once a roll has too many dice", () => {
    const results = Array.from({ length: 6 }, (_, i) => ({ tokenId: i % 2 ? "a" : "b", dice: [1, 2, 3, 4, 5, 6, 1, 2], total: 24 }));
    const per: DomainEvent = { type: "AreaEffectDamageRolled", effectId: "e", damage: { mode: "perTarget", expression: "8d6", byParticipantId: "p", results } };
    expect(6 * 8).toBeGreaterThan(MAX_DROP_DICE);
    expect(dropFor(per, room(effect), gm)!.totalsOnly).toBe(true);
  });

  it("takes one board slot per roll and clears the oldest past the limit", () => {
    const d = (rollId: string) => ({ drop: { rollId, sides: 20, gmOnly: false, groups: [], totalsOnly: false } as BoardDrop });
    let list = [d("1"), d("2")];
    let added = addDrop(list, d("3"));
    expect(added.kept.map((x) => x.drop.rollId)).toEqual(["1", "2", "3"]);
    expect(added.evicted).toEqual([]);
    list = added.kept;
    added = addDrop(list, d("4"));
    expect(added.kept.map((x) => x.drop.rollId)).toEqual(["2", "3", "4"]);
    expect(added.evicted.map((x) => x.drop.rollId)).toEqual(["1"]);
  });

  it("finds the middle of the targets", () => {
    expect(centroid([])).toBeNull();
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
  });
});
