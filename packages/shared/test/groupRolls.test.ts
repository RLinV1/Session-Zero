import { beforeEach, describe, expect, it } from "vitest";
import {
  emptyRoomState,
  filterEventForViewer,
  filterStateForViewer,
  isGroupRoll,
  LoggedRoll,
  reduce,
  ROLL_LOG_LIMIT,
  type CommittedEvent,
  type GroupRoll,
  type RoomState,
} from "../src";
import { alice, attempt, baseRoom, gm, resetRandom, run, withToken } from "./fixtures";

/** Goblin 1, Goblin 2 and a hidden Assassin. */
function table() {
  const one = withToken(baseRoom(), { name: "Goblin 1" });
  const two = withToken(one.state, { name: "Goblin 2" });
  const assassin = withToken(two.state, { name: "Assassin", hidden: true });
  return { state: assassin.state, one: one.token, two: two.token, assassin: assassin.token };
}

const groupRolls = (state: RoomState) => state.rolls.filter(isGroupRoll);
const committed = (event: CommittedEvent["event"], seq = 1): CommittedEvent => ({ seq, at: "2026-10-28T12:00:00.000Z", actorId: gm.id, event });

beforeEach(resetRandom);

describe("Group rolls (FR-TAC-09, ADR 0046)", () => {
  it("rolls the expression once per token and logs one entry", () => {
    const { state, one, two } = table();
    const before = state.rolls.length;
    const { state: after, events } = run(state, gm, { type: "dice.rollGroup", tokenIds: [one.id, two.id], expression: "1d20+2", label: "Dex save" });
    expect(after.rolls).toHaveLength(before + 1);
    const roll = groupRolls(after).at(-1)!;
    expect(events).toEqual([{ type: "GroupRolled", roll }]);
    expect(roll).toMatchObject({ kind: "group", expression: "1d20+2", label: "Dex save", byParticipantId: gm.id, visibility: "public" });
    expect(roll.entries.map((e) => e.name)).toEqual(["Goblin 1", "Goblin 2"]);
    // The fixture's random sequence starts 0.0, 0.5: two independent rolls.
    expect(roll.entries.map((e) => e.total)).toEqual([3, 13]);
    for (const entry of roll.entries) expect(entry.total).toBe(entry.dice.reduce((a, b) => a + b, 0) + 2);
  });

  it("takes one slot in the capped roll log", () => {
    const t = table();
    const { one, two } = t;
    let state = t.state;
    for (let i = 0; i < ROLL_LOG_LIMIT + 3; i++) {
      state = run(state, gm, { type: "dice.rollGroup", tokenIds: [one.id, two.id], expression: "1d20" }).state;
    }
    expect(state.rolls).toHaveLength(ROLL_LOG_LIMIT);
  });

  it("is GM only", () => {
    const { state, one } = table();
    expect(attempt(state, alice, { type: "dice.rollGroup", tokenIds: [one.id], expression: "1d20" })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses repeated, missing and too many tokens, and bad expressions", () => {
    const { state, one } = table();
    expect(attempt(state, gm, { type: "dice.rollGroup", tokenIds: [one.id, one.id], expression: "1d20" })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(state, gm, { type: "dice.rollGroup", tokenIds: ["nope"], expression: "1d20" })).toMatchObject({ ok: false, code: "not_found" });
    expect(attempt(state, gm, { type: "dice.rollGroup", tokenIds: [one.id], expression: "1d20+banana" })).toMatchObject({ ok: false, code: "invalid" });
    // Empty and over-long lists fail to parse, as any forged payload does.
    expect(() => attempt(state, gm, { type: "dice.rollGroup", tokenIds: [], expression: "1d20" })).toThrow();
    expect(() => attempt(state, gm, { type: "dice.rollGroup", tokenIds: Array.from({ length: 31 }, (_, i) => `t${i}`), expression: "1d20" })).toThrow();
  });

  it("parses a stored plain roll and a group roll from the same log", () => {
    const { state, one } = table();
    const after = run(state, gm, { type: "dice.rollGroup", tokenIds: [one.id], expression: "1d20" }).state;
    const plain = run(after, gm, { type: "dice.roll", expression: "1d6" }).state;
    for (const roll of plain.rolls) expect(LoggedRoll.safeParse(roll).success).toBe(true);
    // A roll stored before ADR 0046 has no `kind` and is still a plain roll.
    const legacy = { id: "r1", expression: "1d20", byParticipantId: gm.id, dice: [4], modifier: 0, total: 4, visibility: "public" };
    expect(isGroupRoll(LoggedRoll.parse(legacy))).toBe(false);
  });
});

describe("Group roll visibility (FR-GM-22, FR-GM-23, ADR 0046)", () => {
  it("leaves out hidden tokens for players and keeps them for the GM", () => {
    const { state, one, assassin } = table();
    const { state: after, events } = run(state, gm, { type: "dice.rollGroup", tokenIds: [one.id, assassin.id], expression: "1d20" });
    const seen = groupRolls(filterStateForViewer(after, alice)).at(-1)!;
    expect(seen.entries.map((e) => e.name)).toEqual(["Goblin 1"]);
    expect(JSON.stringify(seen)).not.toContain(assassin.id);
    expect(groupRolls(filterStateForViewer(after, gm)).at(-1)!.entries).toHaveLength(2);

    const live = filterEventForViewer(committed(events[0]!), state, alice);
    expect(live.kind).toBe("event");
    expect(JSON.stringify(live)).not.toContain(assassin.id);
  });

  it("leaves out unowned tokens under fog", () => {
    const { state, one, two } = table();
    const fogged = run(state, gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 70, y: 70 } } }).state;
    const after = run(fogged, gm, { type: "dice.rollGroup", tokenIds: [one.id, two.id], expression: "1d20" }).state;
    // Every token sits under the fog, so the player gets no entry at all.
    expect(groupRolls(filterStateForViewer(after, alice))).toHaveLength(0);
  });

  it("stays concealed after a hidden token is revealed", () => {
    const { state, one, assassin } = table();
    const rolled = run(state, gm, { type: "dice.rollGroup", tokenIds: [one.id, assassin.id], expression: "1d20" }).state;
    const revealed = run(rolled, gm, { type: "token.setHidden", tokenId: assassin.id, hidden: false }).state;
    expect(groupRolls(filterStateForViewer(revealed, alice)).at(-1)!.entries).toHaveLength(1);
  });

  it("conceals a token hidden after the roll", () => {
    const { state, one, two } = table();
    const rolled = run(state, gm, { type: "dice.rollGroup", tokenIds: [one.id, two.id], expression: "1d20" }).state;
    const hidden = run(rolled, gm, { type: "token.setHidden", tokenId: two.id, hidden: true }).state;
    const unhidden = run(hidden, gm, { type: "token.setHidden", tokenId: two.id, hidden: false }).state;
    expect(groupRolls(filterStateForViewer(unhidden, alice)).at(-1)!.entries.map((e) => e.name)).toEqual(["Goblin 1"]);
  });

  it("never sends a GM-only group roll to a player", () => {
    const { state, one } = table();
    const { state: after, events } = run(state, gm, { type: "dice.rollGroup", tokenIds: [one.id], expression: "1d20", visibility: "gm" });
    expect(groupRolls(filterStateForViewer(after, alice))).toHaveLength(0);
    expect(filterEventForViewer(committed(events[0]!), state, alice)).toEqual({ kind: "redacted", seq: 1 });
  });

  it("withholds a public group roll whose tokens are all hidden", () => {
    const { state, assassin } = table();
    const { events } = run(state, gm, { type: "dice.rollGroup", tokenIds: [assassin.id], expression: "1d20" });
    expect(filterEventForViewer(committed(events[0]!), state, alice)).toEqual({ kind: "redacted", seq: 1 });
  });

  it("reduces into an empty state", () => {
    const roll: GroupRoll = { kind: "group", id: "g", expression: "1d4", label: null, byParticipantId: gm.id, visibility: "public", entries: [] };
    expect(reduce(emptyRoomState("r"), { type: "GroupRolled", roll }).rolls).toEqual([roll]);
  });
});
