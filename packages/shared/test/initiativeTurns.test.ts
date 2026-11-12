import { describe, expect, it } from "vitest";
import { filterEventForViewer, filterStateForViewer, formatActivity, type CommittedEvent, type RoomState } from "../src";
import { alice, attempt, baseRoom, bob, gm, run, withToken } from "./fixtures";

/** Aria (Alice's), Goblin, and a hidden Shadow, in that turn order, round 1. */
function encounter() {
  const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
  const goblin = withToken(aria.state, { name: "Goblin" });
  const shadow = withToken(goblin.state, { name: "Shadow", hidden: true });
  const state = run(shadow.state, gm, {
    type: "initiative.start",
    entries: [
      { tokenId: aria.token.id, score: 20 },
      { tokenId: goblin.token.id, score: 15 },
      { tokenId: shadow.token.id, score: 10 },
    ],
  }).state;
  return { state, aria: aria.token, goblin: goblin.token, shadow: shadow.token };
}

const active = (state: RoomState) => state.initiative!.order[state.initiative!.activeIndex];
const committed = (event: CommittedEvent["event"]): CommittedEvent => ({ seq: 9, at: "2026-11-12T00:00:00.000Z", actorId: gm.id, event });

describe("player ends their own turn (FR-GM-21, ADR 0060)", () => {
  it("moves the turn on when an owner ends their active token's turn", () => {
    const { state, aria, goblin } = encounter();
    const { state: next, events } = run(state, alice, { type: "initiative.endTurn", tokenId: aria.id });
    expect(events.map((e) => e.type)).toEqual(["InitiativeAdvanced"]);
    expect(active(next)).toBe(goblin.id);
    expect(next.initiative!.round).toBe(1);
  });

  it("wraps into the next round after the last token", () => {
    const { aria, ...start } = encounter();
    let state = start.state;
    state = run(state, gm, { type: "initiative.advance" }).state;
    state = run(state, gm, { type: "initiative.advance" }).state;
    state = run(state, gm, { type: "initiative.advance" }).state;
    expect(active(state)).toBe(aria.id);
    expect(state.initiative!.round).toBe(2);
    // Make Aria last: start a new order with her at the bottom.
    const last = run(state, gm, { type: "initiative.start", entries: [{ tokenId: aria.id, score: 1 }] }).state;
    const { state: next } = run(last, alice, { type: "initiative.endTurn", tokenId: aria.id });
    expect(next.initiative).toMatchObject({ activeIndex: 0, round: 2 });
  });

  it("refuses an end turn that crosses the GM's Next turn, so the turn moves once", () => {
    const { state, aria, goblin } = encounter();
    const afterGm = run(state, gm, { type: "initiative.advance" }).state;
    const late = attempt(afterGm, alice, { type: "initiative.endTurn", tokenId: aria.id });
    expect(late).toMatchObject({ ok: false, code: "invalid" });
    expect(active(afterGm)).toBe(goblin.id);
  });

  it("forbids ending the turn of a token the player doesn't own", () => {
    const { state, aria } = encounter();
    expect(attempt(state, bob, { type: "initiative.endTurn", tokenId: aria.id })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("answers a hidden token as missing, not forbidden", () => {
    const { state, shadow } = encounter();
    expect(attempt(state, bob, { type: "initiative.endTurn", tokenId: shadow.id })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("refuses with no encounter running", () => {
    const { state, aria } = encounter();
    const ended = run(state, gm, { type: "initiative.end" }).state;
    expect(attempt(ended, alice, { type: "initiative.endTurn", tokenId: aria.id })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("lets the GM end any active token's turn", () => {
    const { state, aria } = encounter();
    expect(attempt(state, gm, { type: "initiative.endTurn", tokenId: aria.id }).ok).toBe(true);
  });

  it("leaves pending rulings pending", () => {
    const { state, aria, goblin } = encounter();
    const rolled = run(state, alice, { type: "dice.roll", expression: "1d20+5", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, kind: "toHit" } }).state;
    const next = run(rolled, alice, { type: "initiative.endTurn", tokenId: aria.id }).state;
    expect(next.rolls).toEqual(rolled.rolls);
  });
});

describe("GM steps the turn back (FR-GM-21, ADR 0060)", () => {
  it("steps back within a round", () => {
    const { state, aria } = encounter();
    const ended = run(state, alice, { type: "initiative.endTurn", tokenId: aria.id }).state;
    const { state: back, events } = run(ended, gm, { type: "initiative.previous" });
    expect(events).toEqual([{ type: "InitiativeRewound", initiative: state.initiative, previous: ended.initiative }]);
    expect(active(back)).toBe(aria.id);
    expect(back.initiative!.round).toBe(1);
  });

  it("steps back across a round to the last token", () => {
    const { shadow, ...start } = encounter();
    let state = start.state;
    for (let i = 0; i < 3; i++) state = run(state, gm, { type: "initiative.advance" }).state;
    expect(state.initiative).toMatchObject({ activeIndex: 0, round: 2 });
    const back = run(state, gm, { type: "initiative.previous" }).state;
    expect(back.initiative).toMatchObject({ activeIndex: 2, round: 1 });
    expect(active(back)).toBe(shadow.id);
  });

  it("refuses on the first turn of round 1 and without an encounter", () => {
    const { state } = encounter();
    expect(attempt(state, gm, { type: "initiative.previous" })).toMatchObject({ ok: false, code: "invalid" });
    const ended = run(state, gm, { type: "initiative.end" }).state;
    expect(attempt(ended, gm, { type: "initiative.previous" })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("forbids players", () => {
    const { state } = encounter();
    const later = run(state, gm, { type: "initiative.advance" }).state;
    expect(attempt(later, alice, { type: "initiative.previous" })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("is a resync for players, so a hidden token's turn never reaches them", () => {
    const { shadow, ...start } = encounter();
    let state = start.state;
    for (let i = 0; i < 3; i++) state = run(state, gm, { type: "initiative.advance" }).state;
    const { state: back, events } = run(state, gm, { type: "initiative.previous" });
    expect(filterEventForViewer(committed(events[0]!), state, alice)).toEqual({ kind: "resync" });
    const seen = filterStateForViewer(back, alice).initiative!;
    expect(seen.order).not.toContain(shadow.id);
    expect(seen.order[seen.activeIndex]).toBeUndefined();
  });

  it("reads as a step back in the activity log", () => {
    const { state, aria } = encounter();
    const ended = run(state, alice, { type: "initiative.endTurn", tokenId: aria.id }).state;
    const { events } = run(ended, gm, { type: "initiative.previous" });
    expect(formatActivity(events[0]!, "Mara", ended)).toBe("Mara stepped the turn back to round 1, Aria's turn");
  });
});
