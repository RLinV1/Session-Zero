// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { AttackPanel } from "../src/panels/AttackPanel";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const token = (id: string, over: Partial<Token> = {}): Token => ({
  id, name: id, position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [], ...over,
});
const state: RoomState = {
  ...emptyRoomState("r"),
  participants: { gm },
  tokens: {
    a: token("a", { attacks: [{ name: "Slash", toHit: { count: 1, sides: 20, modifier: 0 }, damage: null }] }),
    b: token("b"),
  },
};

function renderPanel(room = state, you = gm, rolling = false) {
  const command = vi.fn(async (_command: unknown) => ({ ok: true as const, seq: null }));
  const connection = { command, ephemeral: vi.fn(), snapshot: { seq: 0, state: null } } as unknown as RoomConnection;
  render(
    <AttackPanel
      connection={connection} state={room} you={you} pick={{ attackerId: "a", targetId: "b" }} onPick={() => {}}
      reset={{ count: 0, clearedRollId: null }} rolling={rolling}
      onPickOnBoard={() => {}} onShowPing={() => {}} visibility="public" onVisibility={() => {}}
    />,
  );
  return command;
}

describe("Automatic attack style (FR-TAC-09, ADR 0038)", () => {
  it.each(["gm", "player"] as const)("guides a %s with no saved attacks to create one or use custom dice", async (role) => {
    window.localStorage.clear();
    const you: Participant = { id: "viewer", role, displayName: role };
    const room = { ...state, tokens: { a: token("a", { ownerIds: [you.id] }), b: token("b") } };
    const command = renderPanel(room, you);
    expect(screen.queryByRole("button", { name: "Roll to hit" })).toBeNull();
    expect(screen.getByText(/Create an attack or use Custom roll/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add an attack" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Custom roll" }));
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Damage" }));
    fireEvent.click(screen.getByRole("button", { name: "d6" }));
    fireEvent.click(screen.getByRole("button", { name: /^Roll 1d6/ }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({
      type: "dice.roll", expression: "1d6", visibility: "public",
      attack: { actorTokenId: "a", targetTokenId: "b", kind: "damage" },
    }));
  });

  it("lets players configure a custom roll while dice are rolling, but waits to roll again", () => {
    window.localStorage.clear();
    renderPanel({ ...state, tokens: { a: token("a"), b: token("b") } }, gm, true);
    fireEvent.click(screen.getByRole("button", { name: "Custom roll" }));
    expect((screen.getByRole("button", { name: /^Roll 1d20/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("leaves style selection out of the attack panel", () => {
    renderPanel();
    expect(screen.queryByRole("group", { name: "Attack style" })).toBeNull();
  });

  it("leaves named attack rolls to their saved animation or automatic style", async () => {
    const command = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Roll to hit: Slash against/ }));
    await waitFor(() => expect(command).toHaveBeenCalled());
    const sent = command.mock.calls[0]![0] as { attack: object };
    expect(sent.attack).not.toHaveProperty("style");
  });

});
