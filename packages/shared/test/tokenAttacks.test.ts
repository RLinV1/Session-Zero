import { describe, expect, it } from "vitest";
import { AttackPreset as AttackPresetSchema, Command, GAME_PRESETS, decide, filterEventForViewer, type AttackPreset, type CommandInput, type DomainEvent, type Token } from "../src";
import { committedRoom } from "./committedRoom";
import { alice, bob, gm } from "./fixtures";

const scimitar: AttackPreset = { name: "Scimitar", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: { terms: [{ count: 1, sides: 6 }], modifier: 2 } };
const bite: AttackPreset = { name: "Bite", toHit: null, damage: { terms: [{ count: 1, sides: 6 }], modifier: 1 } };

function withGoblin(overrides: { hidden?: boolean; ownerIds?: string[] } = {}) {
  const room = committedRoom();
  const { events } = room.run(gm, {
    type: "token.create", name: "Goblin", position: { x: 105, y: 105 },
    ownerIds: overrides.ownerIds ?? [alice.id], hidden: overrides.hidden ?? false, attacks: [scimitar],
  });
  const created = events[0];
  if (created?.type !== "TokenCreated") throw new Error("expected TokenCreated");
  return { room, goblin: created.token };
}

const setAttacks = (token: Token, attacks: AttackPreset[]): CommandInput => ({ type: "token.configure", tokenId: token.id, changes: { attacks } });

describe("Shared named attacks (FR-TAC-07, ADR 0034)", () => {
  it("lets the GM replace a token's attacks, keeping the previous list on the event", () => {
    const { room, goblin } = withGoblin();
    const { events } = room.run(gm, setAttacks(goblin, [scimitar, bite]));
    expect(events).toEqual([{ type: "TokenAttacksSet", tokenId: goblin.id, attacks: [scimitar, bite], previous: [scimitar] }]);
    expect(room.state.tokens[goblin.id]!.attacks).toEqual([scimitar, bite]);
  });

  it("lets an owner set their own token's attacks", () => {
    const { room, goblin } = withGoblin();
    room.run(alice, setAttacks(goblin, [bite]));
    expect(room.state.tokens[goblin.id]!.attacks).toEqual([bite]);
  });

  it("refuses a player who does not own the token", () => {
    const { room, goblin } = withGoblin();
    expect(room.attempt(bob, setAttacks(goblin, [bite]))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("answers a player about a hidden token as if it did not exist", () => {
    const { room, goblin } = withGoblin({ hidden: true, ownerIds: [] });
    expect(room.attempt(bob, setAttacks(goblin, [bite]))).toMatchObject({ ok: false, code: "not_found" });
  });

  it("refuses more than 8 attacks or names repeated ignoring case", () => {
    const { goblin } = withGoblin();
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...bite, name: `Bite ${i}` }));
    expect(() => Command.parse(setAttacks(goblin, nine))).toThrow();
    expect(() => Command.parse(setAttacks(goblin, [bite, { ...bite, name: "BITE" }]))).toThrow();
  });

  it("refuses attacks while the room's preset has them off", () => {
    const { room, goblin } = withGoblin();
    const registry = GAME_PRESETS as unknown as { push: (p: unknown) => void; pop: () => void };
    registry.push({ ...GAME_PRESETS[0], id: "limited", name: "Limited", features: { attacks: false, conditions: false, armorClass: false }, conditions: [] });
    try {
      const decision = decide({ ...room.state, preset: "limited" }, gm, Command.parse(setAttacks(goblin, [bite])), { newId: () => "x", random: () => 0.5, lastSeq: 0 });
      expect(decision).toMatchObject({ ok: false, code: "invalid", message: "Attack rolls are off in Limited." });
    } finally {
      registry.pop();
    }
  });

  it("emits nothing when the list is unchanged", () => {
    const { room, goblin } = withGoblin();
    expect(room.attempt(gm, setAttacks(goblin, [scimitar]))).toMatchObject({ ok: true, events: [] });
  });

  it("can be undone by the GM, restoring the previous list", () => {
    const { room, goblin } = withGoblin();
    const { commandId } = room.run(alice, setAttacks(goblin, []));
    room.run(gm, { type: "history.undo", commandId });
    expect(room.state.tokens[goblin.id]!.attacks).toEqual([scimitar]);
  });

  it("refuses to undo once the attacks have changed again", () => {
    const { room, goblin } = withGoblin();
    const { commandId } = room.run(gm, setAttacks(goblin, [bite]));
    room.run(alice, setAttacks(goblin, [bite, scimitar]));
    expect(room.attempt(gm, { type: "history.undo", commandId })).toMatchObject({ ok: false });
  });
});

describe("Shared named attacks stay private (FR-GM-23, ADR 0034)", () => {
  it("reaches the token's owner and is redacted for another player", () => {
    const { room, goblin } = withGoblin();
    const before = room.state;
    room.run(gm, setAttacks(goblin, [bite]));
    const committed = room.log.at(-1)!;
    expect(committed.event.type).toBe("TokenAttacksSet");
    expect(filterEventForViewer(committed, before, gm).kind).toBe("event");
    expect(filterEventForViewer(committed, before, alice).kind).toBe("event");
    const forBob = filterEventForViewer(committed, before, bob);
    expect(forBob.kind).toBe("redacted");
    expect(JSON.stringify(forBob)).not.toContain("Bite");
  });

  it("is redacted for a player the token is hidden from", () => {
    const { room, goblin } = withGoblin({ hidden: true, ownerIds: [] });
    const before = room.state;
    room.run(gm, setAttacks(goblin, [bite]));
    expect(filterEventForViewer(room.log.at(-1)!, before, bob).kind).toBe("redacted");
  });
});

describe("Attack changes alongside ownership (ADR 0034)", () => {
  it("orders the attack change before a new owner, who then gets a resync", () => {
    const { room, goblin } = withGoblin({ ownerIds: [] });
    const { events } = room.run(gm, { type: "token.configure", tokenId: goblin.id, changes: { attacks: [bite], ownerIds: [bob.id] } });
    expect(events.map((e: DomainEvent) => e.type)).toEqual(["TokenAttacksSet", "TokenOwnersSet"]);
  });
});

describe("multi-target attacks (FR-TAC-09)", () => {
  it("accepts a target count of 2 to 10 and rejects the rest, leaving old attacks single-target", () => {
    expect(AttackPresetSchema.parse(scimitar)).not.toHaveProperty("maxTargets");
    for (const maxTargets of [2, 5, 10]) expect(AttackPresetSchema.parse({ ...scimitar, maxTargets }).maxTargets).toBe(maxTargets);
    for (const maxTargets of [0, 1, 11, 2.5, -3]) expect(AttackPresetSchema.safeParse({ ...scimitar, maxTargets }).success).toBe(false);
  });
});
