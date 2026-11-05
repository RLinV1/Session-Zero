import { describe, expect, it } from "vitest";
import { decideJoin, filterEventForViewer, reduce, type CommittedEvent, type Participant } from "../src";
import { alice, attempt, baseRoom, bob, gm, run, withToken } from "./fixtures";

const newcomer: Participant = { id: "p-new", role: "player", displayName: "Newcomer" };

describe("locking a room to new joins (FR-PL-01, FR-GM-20, ADR 0051)", () => {
  it("records the lock with what it replaced", () => {
    const { state, events } = run(baseRoom(), gm, { type: "room.setJoinsLocked", locked: true });
    expect(events).toEqual([{ type: "JoinsLockSet", locked: true, previous: false }]);
    expect(state.joinsLocked).toBe(true);
    const unlocked = run(state, gm, { type: "room.setJoinsLocked", locked: false });
    expect(unlocked.events).toEqual([{ type: "JoinsLockSet", locked: false, previous: true }]);
    expect(unlocked.state.joinsLocked).toBe(false);
  });

  it("is the GM's alone", () => {
    expect(attempt(baseRoom(), alice, { type: "room.setJoinsLocked", locked: true })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses a change that changes nothing, so the log gains no empty events", () => {
    expect(attempt(baseRoom(), gm, { type: "room.setJoinsLocked", locked: false })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses a join while locked and admits it again once unlocked", () => {
    const locked = run(baseRoom(), gm, { type: "room.setJoinsLocked", locked: true }).state;
    expect(decideJoin(locked, newcomer)).toMatchObject({ ok: false, reason: "room_locked" });
    const open = run(locked, gm, { type: "room.setJoinsLocked", locked: false }).state;
    expect(decideJoin(open, newcomer)).toMatchObject({ ok: true });
  });

  it("reads an older room, with no such field, as unlocked", () => {
    const { joinsLocked: _absent, ...older } = baseRoom();
    expect(decideJoin(older as ReturnType<typeof baseRoom>, newcomer)).toMatchObject({ ok: true });
    expect(run(older as ReturnType<typeof baseRoom>, gm, { type: "room.setJoinsLocked", locked: true }).events).toEqual([
      { type: "JoinsLockSet", locked: true, previous: false },
    ]);
  });

  it("is passed to players as is: it hides nothing", () => {
    const committed: CommittedEvent = { seq: 9, at: "2026-11-04T00:00:00Z", actorId: gm.id, event: { type: "JoinsLockSet", locked: true, previous: false } };
    expect(filterEventForViewer(committed, baseRoom(), alice)).toMatchObject({ kind: "event" });
    expect(reduce(baseRoom(), committed.event).joinsLocked).toBe(true);
  });
});

describe("removing several players at once (FR-GM-20, ADR 0051)", () => {
  const room = () => baseRoom();

  it("records one removal per player, each with the whole participant", () => {
    const { state, events } = run(room(), gm, { type: "participant.revokeMany", participantIds: [alice.id, bob.id] });
    expect(events).toEqual([
      { type: "ParticipantRevoked", participant: alice },
      { type: "ParticipantRevoked", participant: bob },
    ]);
    expect(state.participants[alice.id]!.revoked).toBe(true);
    expect(state.participants[bob.id]!.revoked).toBe(true);
  });

  it("counts a repeated id once", () => {
    const { events } = run(room(), gm, { type: "participant.revokeMany", participantIds: [alice.id, alice.id] });
    expect(events).toEqual([{ type: "ParticipantRevoked", participant: alice }]);
  });

  it("leaves each player's tokens alone, for the departure review", () => {
    const seeded = withToken(room(), { name: "Rogue", ownerIds: [alice.id] }).state;
    const { state } = run(seeded, gm, { type: "participant.revokeMany", participantIds: [alice.id, bob.id] });
    expect(state.tokens).toEqual(seeded.tokens);
  });

  it("is the GM's alone", () => {
    expect(attempt(room(), alice, { type: "participant.revokeMany", participantIds: [bob.id] })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it.each([
    ["the GM", gm.id, "invalid"],
    ["someone unknown", "p-nobody", "not_found"],
  ])("refuses the whole removal when the list includes %s", (_name, id, code) => {
    expect(attempt(room(), gm, { type: "participant.revokeMany", participantIds: [alice.id, id] })).toMatchObject({ ok: false, code });
  });

  it("refuses the whole removal when someone on the list has already gone", () => {
    const left = run(room(), bob, { type: "participant.leave" }).state;
    expect(attempt(left, gm, { type: "participant.revokeMany", participantIds: [alice.id, bob.id] })).toMatchObject({ ok: false, code: "invalid" });
  });
});
