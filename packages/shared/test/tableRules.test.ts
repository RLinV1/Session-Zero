import { beforeEach, describe, expect, it } from "vitest";
import {
  defeatRemovalOf,
  filterEventForViewer,
  filterStateForViewer,
  reduceAll,
  type CommittedEvent,
  type DomainEvent,
  type RoomState,
  type TokenStats,
} from "../src";
import { alice, attempt, baseRoom, bob, gm, resetRandom, run, withToken } from "./fixtures";

const committed = (event: DomainEvent, seq = 1): CommittedEvent => ({ seq, at: "2026-11-11T12:00:00.000Z", actorId: gm.id, event });
const stats = (hp: number | null, ac: number | null = 14): TokenStats => ({ hp, maxHp: hp === null ? null : 20, ac });

/** Aria (Alice's), Goblin (no owner), a template, and the given rules; HP 10 each, AC 14. */
function table(rules: Partial<Pick<RoomState, "hideMapWithoutToken" | "hideHp" | "hideAc" | "defeatRemoval">> = {}) {
  const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
  const goblin = withToken(aria.state, { name: "Goblin" });
  let state = goblin.state;
  for (const id of [aria.token.id, goblin.token.id]) state = run(state, gm, { type: "token.setStats", tokenId: id, stats: stats(10) }).state;
  state = run(state, gm, { type: "template.place", shape: "circle", origin: { x: 300, y: 300 }, toward: { x: 370, y: 300 }, size: 10 }).state;
  return { state: { ...state, ...rules }, aria: aria.token, goblin: goblin.token };
}

beforeEach(resetRandom);

describe("table rules: changing them (FR-GM-15)", () => {
  it("lets only the GM change a rule, refuses an unchanged value, and records what it replaced", () => {
    const { state } = table();
    for (const command of [
      { type: "room.setDefeatRemoval", mode: "npc" },
      { type: "room.setHideMapWithoutToken", enabled: true },
      { type: "room.setHideHp", enabled: true },
      { type: "room.setHideAc", enabled: true },
    ] as const) {
      expect(attempt(state, alice, command)).toMatchObject({ ok: false, code: "forbidden" });
      const { state: after, events } = run(state, gm, command);
      expect(events).toHaveLength(1);
      expect(attempt(after, gm, command)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(run(state, gm, { type: "room.setHideHp", enabled: true }).events).toEqual([{ type: "HideHpSet", enabled: true, previous: false }]);
    // The fixture's room has removal off, so that is the value the first change replaces.
    expect(run(state, gm, { type: "room.setDefeatRemoval", mode: "npc" }).events).toEqual([{ type: "DefeatRemovalSet", mode: "npc", previous: "off" }]);
  });

  it("starts a new room on All with every switch off", () => {
    const fresh = reduceAll({ ...baseRoom(), autoRemoveDefeated: true }, []);
    expect(defeatRemovalOf(fresh)).toBe("all");
    expect([fresh.hideMapWithoutToken ?? false, fresh.hideHp ?? false, fresh.hideAc ?? false]).toEqual([false, false, false]);
  });

  it("keeps an older room's switch: absent or on reads All, off reads Off", () => {
    const { autoRemoveDefeated: _drop, ...older } = baseRoom();
    expect(defeatRemovalOf(older)).toBe("all");
    expect(defeatRemovalOf({ autoRemoveDefeated: true })).toBe("all");
    expect(defeatRemovalOf({ autoRemoveDefeated: false })).toBe("off");
  });

  it("replays an old switch event followed by a new mode to the new mode", () => {
    const replayed = reduceAll(baseRoom(), [
      { type: "AutoRemoveDefeatedSet", enabled: true, previous: false },
      { type: "AutoRemoveDefeatedSet", enabled: false, previous: true },
    ]);
    expect(defeatRemovalOf(replayed)).toBe("off");
    expect(defeatRemovalOf(reduceAll(replayed, [{ type: "DefeatRemovalSet", mode: "npc", previous: "off" }]))).toBe("npc");
  });
});

describe("table rules: Remove tokens at 0 HP (FR-TAC-07)", () => {
  const nuke = (state: RoomState) => run(state, gm, { type: "nuke.detonate", amount: 10, origin: { x: 50, y: 50 } }).state;

  it("Only NPC tokens removes Goblin and keeps Alice's Aria at 0", () => {
    const { state, aria, goblin } = table({ defeatRemoval: "npc" });
    const after = nuke(state);
    expect(after.tokens[goblin.id]).toBeUndefined();
    expect(after.tokens[aria.id]!.stats.hp).toBe(0);
  });

  it("All removes both, and Off removes neither", () => {
    const { state, aria, goblin } = table({ defeatRemoval: "all" });
    const all = nuke(state);
    expect([all.tokens[aria.id], all.tokens[goblin.id]]).toEqual([undefined, undefined]);
    const off = nuke({ ...state, defeatRemoval: "off" });
    expect(Object.keys(off.tokens)).toEqual(expect.arrayContaining([aria.id, goblin.id]));
  });

  it("does not sweep a token already at 0 when the mode changes", () => {
    const { state, aria } = table({ defeatRemoval: "npc" });
    const down = nuke(state);
    expect(run(down, gm, { type: "room.setDefeatRemoval", mode: "all" }).state.tokens[aria.id]).toBeDefined();
  });
});

describe("table rules: Hide map from players without a token (FR-GM-23)", () => {
  it("gives a player without a token no sight and nothing on the board, without line of sight", () => {
    const { state } = table({ hideMapWithoutToken: true });
    const seen = filterStateForViewer(state, bob);
    expect(seen.sight).toEqual([]);
    expect(seen.tokens).toEqual({});
    expect(seen.templates).toEqual({});
  });

  it("does not count a hidden token, and opens the board once the player owns a visible one", () => {
    const { state, goblin } = table({ hideMapWithoutToken: true });
    const hiddenOwn = withToken(state, { name: "Scout", ownerIds: [bob.id], hidden: true }).state;
    expect(filterStateForViewer(hiddenOwn, bob).tokens).toEqual({});
    const given = run(state, gm, { type: "token.setOwners", tokenId: goblin.id, ownerIds: [bob.id] }).state;
    const seen = filterStateForViewer(given, bob);
    expect(seen.sight).toBeUndefined();
    expect(Object.keys(seen.tokens)).toHaveLength(2);
    expect(Object.keys(seen.templates)).toHaveLength(1);
  });

  it("changes nothing when off, and never for the GM", () => {
    const { state } = table();
    expect(Object.keys(filterStateForViewer(state, bob).tokens)).toHaveLength(2);
    expect(Object.keys(filterStateForViewer({ ...state, hideMapWithoutToken: true }, gm).tokens)).toHaveLength(2);
  });

  it("resyncs a player when they gain a token, not when they move theirs, and on a rule change", () => {
    const { state, aria, goblin } = table({ hideMapWithoutToken: true });
    expect(filterEventForViewer(committed({ type: "TokenOwnersSet", tokenId: goblin.id, ownerIds: [bob.id], previous: [] }), state, bob).kind).toBe("resync");
    expect(filterEventForViewer(committed({ type: "TokenMoved", tokenId: aria.id, from: aria.position, to: { x: 105, y: 35 } }), state, alice).kind).toBe("event");
    const rule: DomainEvent = { type: "HideMapWithoutTokenSet", enabled: false, previous: true };
    expect(filterEventForViewer(committed(rule), state, bob).kind).toBe("resync");
    expect(filterEventForViewer(committed(rule), state, gm).kind).toBe("event");
  });
});

describe("table rules: Hide HP and Hide AC from Players (FR-GM-23)", () => {
  it("withholds HP from players on tokens they don't own, in snapshots, and keeps their own", () => {
    const { state, aria, goblin } = table({ hideHp: true });
    const seen = filterStateForViewer(state, alice);
    expect(seen.tokens[goblin.id]!.stats).toEqual({ hp: null, maxHp: null, ac: 14 });
    expect(seen.tokens[aria.id]!.stats).toEqual(stats(10));
    expect(filterStateForViewer(state, gm).tokens[goblin.id]!.stats).toEqual(stats(10));
    // Another player's token is hidden from Bob too.
    expect(filterStateForViewer(state, bob).tokens[aria.id]!.stats.hp).toBeNull();
  });

  it("withholds AC on its own switch", () => {
    const { state, goblin } = table({ hideAc: true });
    expect(filterStateForViewer(state, alice).tokens[goblin.id]!.stats).toEqual({ hp: 10, maxHp: 20, ac: null });
    expect(filterStateForViewer({ ...state, hideAc: false }, alice).tokens[goblin.id]!.stats).toEqual(stats(10));
  });

  it("redacts an HP-only change, strips HP from a mixed one, and sends owners everything", () => {
    const { state, aria, goblin } = table({ hideHp: true });
    const hpOnly: DomainEvent = { type: "TokenStatsSet", tokenId: goblin.id, stats: stats(3), previous: stats(10) };
    expect(filterEventForViewer(committed(hpOnly), state, alice).kind).toBe("redacted");
    const mixed: DomainEvent = { type: "TokenStatsSet", tokenId: goblin.id, stats: stats(3, 16), previous: stats(10) };
    const sent = filterEventForViewer(committed(mixed), state, alice);
    expect(sent.kind === "event" && sent.committed.event).toEqual({ ...mixed, stats: { hp: null, maxHp: null, ac: 16 }, previous: { hp: null, maxHp: null, ac: 14 } });
    const own: DomainEvent = { type: "TokenStatsSet", tokenId: aria.id, stats: stats(3), previous: stats(10) };
    const toOwner = filterEventForViewer(committed(own), state, alice);
    expect(toOwner.kind === "event" && toOwner.committed.event).toEqual(own);
  });

  it("strips created and deleted tokens, and resyncs on ownership and rule changes", () => {
    const { state, goblin } = table({ hideHp: true, hideAc: true });
    const deleted = filterEventForViewer(committed({ type: "TokenDeleted", token: state.tokens[goblin.id]!, reason: "defeated" }), state, alice);
    expect(deleted.kind === "event" && deleted.committed.event.type === "TokenDeleted" && deleted.committed.event.token.stats).toEqual({ hp: null, maxHp: null, ac: null });
    expect(filterEventForViewer(committed({ type: "TokenOwnersSet", tokenId: goblin.id, ownerIds: [alice.id], previous: [] }), state, alice).kind).toBe("resync");
    // Bob's ownership doesn't change, so his copy is already right.
    expect(filterEventForViewer(committed({ type: "TokenOwnersSet", tokenId: goblin.id, ownerIds: [alice.id], previous: [] }), state, bob).kind).toBe("event");
    for (const rule of [{ type: "HideHpSet", enabled: false, previous: true }, { type: "HideAcSet", enabled: false, previous: true }] as const) {
      expect(filterEventForViewer(committed(rule), state, alice).kind).toBe("resync");
    }
    expect(filterEventForViewer(committed({ type: "DefeatRemovalSet", mode: "npc", previous: "all" }), state, alice).kind).toBe("event");
  });
});
