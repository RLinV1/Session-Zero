import { describe, expect, it } from "vitest";
import { Command, decide, filterEventForViewer, reduceAll, type CommittedEvent, type RoomState } from "../src";
import { alice, attempt, baseRoom, bob, ctx, gm, run, withToken } from "./fixtures";

/** Alice owns "Aria"; the room optionally holds other tokens first. */
function room(others: { name: string; hidden?: boolean }[] = []) {
  let state: RoomState = baseRoom();
  for (const o of others) state = withToken(state, o).state;
  const aria = withToken(state, { name: "Aria", ownerIds: [alice.id] });
  return { state: aria.state, aria: aria.token };
}

const rename = (tokenId: string, name: string) => ({ type: "token.configure" as const, tokenId, changes: { name } });
const committed = (event: CommittedEvent["event"]): CommittedEvent => ({ seq: 7, at: "2026-11-23T00:00:00Z", actorId: alice.id, event });

describe("player renames own token (FR-PL-04, token-names)", () => {
  it("lets an owner rename their token with a reversible event that keeps size and rotation", () => {
    const { state, aria } = room();
    const { state: next, events } = run(state, alice, rename(aria.id, "  Aria the Bold "));
    expect(events).toEqual([{
      type: "TokenAppearanceSet", tokenId: aria.id, name: "Aria the Bold", size: aria.size, rotation: aria.rotation,
      previous: { name: "Aria", size: aria.size, rotation: aria.rotation },
    }]);
    expect(next.tokens[aria.id]!.name).toBe("Aria the Bold");
    expect(reduceAll(state, events)).toEqual(next);
  });

  it("refuses a rename of a token the player doesn't own", () => {
    const { state, aria } = room();
    expect(attempt(state, bob, rename(aria.id, "Mine now"))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses a blank name", () => {
    // Blank names fail the command schema before decide runs; decide refuses them too.
    expect(Command.safeParse(rename("id", "   ")).success).toBe(false);
    const { state, aria } = room();
    const blank = decide(state, alice, { type: "token.configure", tokenId: aria.id, changes: { name: "   " } }, ctx);
    expect(blank).toMatchObject({ ok: false, code: "invalid" });
  });

  it("keeps size and rotation the GM's", () => {
    const { state, aria } = room();
    const sized = { type: "token.configure" as const, tokenId: aria.id, changes: { name: "Aria", size: 2 } };
    const turned = { type: "token.configure" as const, tokenId: aria.id, changes: { name: "Aria", rotation: 90 } };
    expect(attempt(state, alice, sized)).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(state, alice, turned)).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("keeps a player's rename as typed when a hidden token has the name, revealing nothing", () => {
    const hidden = room([{ name: "Dragon", hidden: true }]);
    // Same shape, but the hidden token is named otherwise: only its name differs.
    const plain = room([{ name: "Wolf", hidden: true }]);
    const withHidden = run(hidden.state, alice, rename(hidden.aria.id, "Dragon"));
    const without = run(plain.state, alice, rename(plain.aria.id, "Dragon"));
    expect(withHidden.state.tokens[hidden.aria.id]!.name).toBe("Dragon");
    // What Alice receives doesn't depend on the hidden token's name.
    // Token ids come from a shared counter, so compare with Aria's id masked.
    const seen = (event: CommittedEvent["event"], state: RoomState, id: string) =>
      JSON.stringify(filterEventForViewer(committed(event), state, alice)).replaceAll(id, "ARIA");
    expect(seen(withHidden.events[0]!, hidden.state, hidden.aria.id)).toBe(seen(without.events[0]!, plain.state, plain.aria.id));
  });

  it("keeps a player's rename as typed when a visible token has the name", () => {
    const { state, aria } = room([{ name: "Goblin" }]);
    const { state: next } = run(state, alice, rename(aria.id, "Goblin"));
    expect(Object.values(next.tokens).filter((t) => t.name === "Goblin")).toHaveLength(2);
  });

  it("still numbers the GM's rename against hidden tokens", () => {
    const { state, aria } = room([{ name: "Dragon", hidden: true }]);
    expect(run(state, gm, rename(aria.id, "Dragon")).state.tokens[aria.id]!.name).toBe("Dragon 2");
  });
});
