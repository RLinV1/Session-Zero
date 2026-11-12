import { describe, expect, it } from "vitest";
import { Command, CreateCreatureRequest, filterEventForViewer, filterStateForViewer, TokenAttacks, type CommittedEvent } from "../src";
import { alice, baseRoom, bob, gm, run } from "./fixtures";

const attacks = [{ name: "Scimitar", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: { terms: [{ count: 1, sides: 6 }], modifier: 2 } }];

describe("copied template attacks (KAN-70, FR-GM-23)", () => {
  it("validates bounded, unique names and dice at both trust boundaries", () => {
    for (const bad of [
      [{ name: "Empty", toHit: null, damage: null }],
      [{ ...attacks[0], toHit: { terms: [{ count: 21, sides: 20 }], modifier: 4 } }],
      [{ ...attacks[0], damage: { terms: [{ count: 1, sides: 7 }], modifier: 2 } }],
      [{ ...attacks[0], damage: { terms: [{ count: 1, sides: 6 }], modifier: 100 } }],
      [attacks[0], { ...attacks[0], name: "scimitar" }],
      Array.from({ length: 9 }, (_, i) => ({ ...attacks[0], name: String(i) })),
    ]) {
      expect(TokenAttacks.safeParse(bad).success).toBe(false);
      expect(CreateCreatureRequest.safeParse({ name: "Goblin", attacks: bad }).success).toBe(false);
      expect(Command.safeParse({ type: "token.create", name: "Goblin", position: { x: 0, y: 0 }, attacks: bad }).success).toBe(false);
    }
    expect(TokenAttacks.parse(attacks)).toEqual(attacks);
  });

  it("copies attacks to every token, but sends them only to GM/owners in snapshots and events", () => {
    const before = baseRoom();
    const { state, events } = run(before, gm, { type: "token.create", name: "Goblin", position: { x: 35, y: 35 }, count: 3, attacks, ownerIds: [alice.id] });
    for (const token of Object.values(state.tokens)) {
      expect(token.attacks).toEqual(attacks);
      expect(filterStateForViewer(state, alice).tokens[token.id]?.attacks).toEqual(attacks);
      expect(filterStateForViewer(state, bob).tokens[token.id]?.attacks).toBeUndefined();
    }
    for (const event of events) {
      const committed: CommittedEvent = { seq: 1, at: new Date(0).toISOString(), actorId: gm.id, event };
      expect(JSON.stringify(filterEventForViewer(committed, before, bob))).not.toContain("Scimitar");
      expect(JSON.stringify(filterEventForViewer(committed, before, alice))).toContain("Scimitar");
      if (event.type !== "TokenCreated") throw new Error("Expected TokenCreated");
      const deleted: CommittedEvent = { ...committed, event: { type: "TokenDeleted", token: event.token } };
      expect(JSON.stringify(filterEventForViewer(deleted, state, bob))).not.toContain("Scimitar");
      const reassigned: CommittedEvent = { ...committed, event: { type: "TokenOwnersSet", tokenId: event.token.id, previous: [alice.id], ownerIds: [bob.id] } };
      expect(filterEventForViewer(reassigned, state, alice)).toEqual({ kind: "resync" });
      expect(filterEventForViewer(reassigned, state, bob)).toEqual({ kind: "resync" });
    }
  });
});
