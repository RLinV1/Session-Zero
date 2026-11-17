// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type AttackPreset, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { AttackPanel } from "../src/panels/AttackPanel";

afterEach(cleanup);

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const token = (id: string, over: Partial<Token> = {}): Token => ({
  id, name: id, position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [], ...over,
});
/** As stored before mixed dice (ADR 0061), and as no shape at all. */
const oldBite = { name: "Bite", toHit: { count: 1, sides: 20, modifier: 4 }, damage: { count: 1, sides: 6, modifier: 2 } } as unknown as AttackPreset;
const brokenClaw = { name: "Claw", toHit: null, damage: { sides: "x" } } as unknown as AttackPreset;

const roomWith = (attacks: AttackPreset[]): RoomState => ({
  ...emptyRoomState("r"),
  participants: { gm },
  tokens: { wolf: token("wolf", { attacks }), hero: token("hero", { position: { x: 150, y: 100 } }) },
});

function panel(state: RoomState) {
  const connection = { command: vi.fn(async () => ({ ok: true as const, seq: null })), ephemeral: vi.fn(), snapshot: { seq: 0, state: null } } as unknown as RoomConnection;
  return render(
    <AttackPanel
      connection={connection} state={state} you={gm} pick={{ attackerId: "wolf", targetId: "hero" }} onPick={() => {}}
      reset={{ count: 0, clearedRollId: null }} rolling={false}
      onPickOnBoard={() => {}} onShowPing={() => {}} visibility="public" onVisibility={() => {}}
    />,
  );
}

describe("Attack section with attacks stored before mixed dice (FR-TAC-09, legacy attack dice)", () => {
  it("shows an old attack's formula and lets it be rolled", () => {
    const { container } = panel(roomWith([oldBite, brokenClaw]));
    expect(screen.getAllByText("1d20+4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1d6+2").length).toBeGreaterThan(0);
    expect(container.querySelector(".attack-roll")).not.toBeNull();
  });

  it("keeps working when an attack's dice can't be read, offering nothing to roll for it", () => {
    const { container } = panel(roomWith([brokenClaw, oldBite]));
    expect(screen.getAllByText("Claw").length).toBeGreaterThan(0);
    expect(container.querySelector(".attack-roll")).toBeNull();
    // The token's other attack is still listed with its formula.
    expect(screen.getAllByText("1d20+4").length).toBeGreaterThan(0);
  });
});
