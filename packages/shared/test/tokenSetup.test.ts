import { describe, expect, it } from "vitest";
import { Command, filterEventForViewer, filterStateForViewer, reduce, reduceAll, Token, type CommittedEvent } from "../src";
import { alice, attempt, baseRoom, gm, run, withToken } from "./fixtures";

describe("KAN-12 token setup", () => {
  it("creates a placed token with image, size, rotation, and numeric resources in one event", () => {
    const { state, events } = run(baseRoom(), gm, {
      type: "token.create", name: "Ogre", position: { x: 125, y: 245 },
      imageUrl: "/uploads/ogre.webp", size: 2, rotation: -90,
      stats: { hp: 32, maxHp: 40, ac: 15 },
    });
    const token = Object.values(state.tokens)[0]!;
    expect(token).toMatchObject({
      name: "Ogre", position: { x: 125, y: 245 }, imageUrl: "/uploads/ogre.webp",
      size: 2, rotation: 270, stats: { hp: 32, maxHp: 40, ac: 15 },
    });
    expect(Token.parse(token)).toEqual(token);
    expect(reduceAll(baseRoom(), events).tokens[token.id]).toEqual(token);
  });

  it("rejects invalid starting resources and keeps old create defaults", () => {
    expect(attempt(baseRoom(), gm, {
      type: "token.create", name: "Ogre", position: { x: 0, y: 0 },
      stats: { hp: 9, maxHp: 8, ac: null },
    })).toMatchObject({ ok: false, code: "invalid" });
    const parsed = Command.parse({ type: "token.create", name: "Old client", position: { x: 0, y: 0 } });
    expect(parsed).toMatchObject({ rotation: 0, stats: { hp: null, maxHp: null, ac: null } });
  });

  it("renames, resizes and rotates a token with a reversible event", () => {
    const { state, token } = withToken(baseRoom(), { name: "Goblin" });
    const { state: changed, events } = run(state, gm, {
      type: "token.setAppearance", tokenId: token.id, name: "Hobgoblin", size: 1.5, rotation: 450,
    });
    expect(changed.tokens[token.id]).toMatchObject({ name: "Hobgoblin", size: 1.5, rotation: 90 });
    expect(events).toEqual([{
      type: "TokenAppearanceSet", tokenId: token.id, name: "Hobgoblin", size: 1.5,
      rotation: 90, previous: { name: "Goblin", size: 1, rotation: 0 },
    }]);
    expect(reduceAll(state, events)).toEqual(changed);
  });

  it("numbers a conflicting rename, rejects players, and redacts hidden updates", () => {
    const first = withToken(baseRoom(), { name: "Goblin" });
    const second = withToken(first.state, { name: "Wolf", hidden: true });
    const input = { type: "token.setAppearance" as const, tokenId: second.token.id, name: "Goblin", size: 2, rotation: 30 };
    expect(attempt(second.state, alice, input)).toMatchObject({ ok: false, code: "forbidden" });
    const { events } = run(second.state, gm, input);
    expect(events[0]).toMatchObject({ name: "Goblin 2" });
    const committed: CommittedEvent = { seq: 10, at: "2026-09-26T00:00:00Z", actorId: gm.id, event: events[0]! };
    expect(filterEventForViewer(committed, second.state, alice)).toEqual({ kind: "redacted", seq: 10 });
  });

  it("keeps a conflicting 60-character rename within the schema limit", () => {
    const long = "A".repeat(60);
    const first = withToken(baseRoom(), { name: long });
    const second = withToken(first.state, { name: "Other" });
    const originalCommand = run(second.state, gm, {
      type: "token.setAppearance", tokenId: second.token.id, name: long, size: 1, rotation: 0,
    });
    expect(originalCommand.state.tokens[second.token.id]!.name).toBe(`${"A".repeat(58)} 2`);
    const { state, events } = run(second.state, gm, {
      type: "token.configure", tokenId: second.token.id, changes: { name: long },
    });
    expect(state.tokens[second.token.id]!.name).toBe(`${"A".repeat(58)} 2`);
    expect(state.tokens[second.token.id]!.name).toHaveLength(60);
    expect(reduceAll(second.state, events)).toEqual(state);
  });

  it("rejects a whole edit before any field changes and avoids suffix drift on retry", () => {
    const first = withToken(baseRoom(), { name: "Goblin 1" });
    const second = withToken(first.state, { name: "Goblin 2" });
    const original = second.state.tokens[first.token.id]!;
    const invalid = { name: "Goblin 2", position: { x: 500, y: 300 }, hidden: true,
      stats: { hp: 20, maxHp: 10, ac: 12 } };
    expect(attempt(second.state, gm, { type: "token.configure", tokenId: first.token.id, changes: invalid }))
      .toMatchObject({ ok: false, code: "invalid" });
    expect(second.state.tokens[first.token.id]).toEqual(original);
    const { state, events } = run(second.state, gm, { type: "token.configure", tokenId: first.token.id,
      changes: { ...invalid, stats: { hp: 20, maxHp: 30, ac: 12 } } });
    expect(state.tokens[first.token.id]).toMatchObject({ name: "Goblin 3", position: { x: 500, y: 300 }, hidden: true });
    expect(events[0]).toMatchObject({ type: "TokenHiddenSet", hidden: true });
    expect(reduceAll(second.state, events)).toEqual(state);
  });

  it("hides before secret edits and reveals only after all edits", () => {
    const { state, token } = withToken(baseRoom(), { name: "Guard" });
    const hidden = run(state, gm, { type: "token.configure", tokenId: token.id,
      changes: { name: "Assassin", position: { x: 900, y: 600 }, imageUrl: "/uploads/assassin.webp", assetId: null, hidden: true } });
    expect(hidden.events.map((e) => e.type)).toEqual(["TokenHiddenSet", "TokenAppearanceSet", "TokenMoved", "TokenImageSet"]);
    let before = state;
    for (const [index, event] of hidden.events.entries()) {
      const committed: CommittedEvent = { seq: index + 1, at: "2026-09-26T00:00:00Z", actorId: gm.id, event };
      expect(filterEventForViewer(committed, before, alice).kind).toBe(index === 0 ? "resync" : "redacted");
      before = reduce(before, event);
      expect(Object.values(filterStateForViewer(before, alice).tokens)).toHaveLength(0);
    }
    const revealed = run(hidden.state, gm, { type: "token.configure", tokenId: token.id,
      changes: { name: "Captain", hidden: false } });
    expect(revealed.events.map((e) => e.type)).toEqual(["TokenAppearanceSet", "TokenHiddenSet"]);
    expect(filterEventForViewer({ seq: 10, at: "2026-09-26T00:00:00Z", actorId: gm.id, event: revealed.events[0]! }, hidden.state, alice))
      .toEqual({ kind: "redacted", seq: 10 });
  });

  it("lets an owner atomically edit resources but rejects GM-only fields", () => {
    const { state, token } = withToken(baseRoom(), { ownerIds: [alice.id] });
    const valid = run(state, alice, { type: "token.configure", tokenId: token.id,
      changes: { stats: { hp: 8, maxHp: 10, ac: 12 }, conditions: ["prone"] } });
    expect(valid.events.map((e) => e.type)).toEqual(["TokenStatsSet", "TokenConditionsSet"]);
    expect(valid.state.tokens[token.id]).toMatchObject({ stats: { hp: 8, maxHp: 10, ac: 12 }, conditions: ["prone"] });
    expect(attempt(state, alice, { type: "token.configure", tokenId: token.id,
      changes: { size: 2, stats: { hp: 8, maxHp: 10, ac: 12 } } })).toMatchObject({ ok: false, code: "forbidden" });
  });
});
