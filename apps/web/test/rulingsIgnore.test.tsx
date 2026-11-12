// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type AreaEffect, type CommandInput, type DiceRoll, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { RulingsPanel } from "../src/panels/RulingsPanel";
import { pendingRulingCount, pendingRulings } from "../src/panels/attackRoll";

afterEach(cleanup);

const gm = { id: "gm", role: "gm", displayName: "Mara" } as Participant;
const toHit = (id: string, extra: Partial<DiceRoll> = {}): DiceRoll => ({
  id, expression: "1d20+5", byParticipantId: "p1", dice: [11], modifier: 5, total: 16, visibility: "public",
  attack: {
    actor: { tokenId: "t1", name: "Aria", hidden: false },
    target: { tokenId: "t2", name: "Goblin", hidden: false },
    label: null,
    kind: "toHit",
  },
  ...extra,
});
const effect: AreaEffect = {
  id: "e1", label: "Fireball", expression: "1d20+2", byParticipantId: "gm",
  targets: [{ tokenId: "t2", name: "Goblin", hidden: false, roll: { dice: [12], total: 14 } }], call: null, damage: null,
};

function room(rolls: DiceRoll[], areaEffect: AreaEffect | null = null): RoomState {
  return { ...emptyRoomState("r1"), participants: { gm, p1: { id: "p1", role: "player", displayName: "Alice" } }, rolls, areaEffect };
}

function setup(state: RoomState) {
  const sent: CommandInput[] = [];
  const connection = { command: vi.fn(async (c: CommandInput) => { sent.push(c); return { ok: true }; }) } as unknown as RoomConnection;
  render(<RulingsPanel connection={connection} state={state} you={gm} airborne={new Set()} onResolve={() => {}} />);
  return sent;
}

describe("ignoring rulings (attack-rulings, ADR 0060)", () => {
  it("leaves ignored rolls out of the list and the pending count", () => {
    const state = room([toHit("a"), toHit("b", { dismissed: true })]);
    expect(pendingRulings(state).map((p) => p.roll.id)).toEqual(["a"]);
    expect(pendingRulingCount(state)).toBe(1);
  });

  it("ignores one roll", () => {
    const sent = setup(room([toHit("a"), toHit("b")]));
    fireEvent.click(screen.getAllByRole("button", { name: /^Ignore:/ })[0]!);
    expect(sent).toEqual([{ type: "roll.dismiss", rollIds: ["b"] }]);
  });

  it("clears every attack roll shown and leaves the area effect alone", () => {
    const sent = setup(room([toHit("a"), toHit("b")], effect));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(sent).toEqual([{ type: "roll.dismiss", rollIds: ["b", "a"] }]);
    expect(screen.getAllByRole("button", { name: "Skip" })).toHaveLength(1);
  });

  it("offers no Clear all with only the area effect pending", () => {
    setup(room([], effect));
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });
});
