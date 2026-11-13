// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { TokenCard } from "../src/board/TokenCard";

const gm: Participant = { id: "gm", role: "gm", displayName: "Mara" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };

const goblin: Token = {
  id: "g1", name: "Goblin", position: { x: 105, y: 105 }, size: 1, rotation: 0, color: "#336699", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 12, maxHp: 12, ac: 15 }, conditions: [],
};
const hero: Token = { ...goblin, id: "h1", name: "Aria", ownerIds: ["alice"], stats: { hp: 10, maxHp: 12, ac: 16 } };
const base = emptyRoomState("r1");
const room = (extra: Partial<RoomState> = {}): RoomState => ({ ...base, participants: { gm, alice }, tokens: { g1: goblin, h1: hero }, ...extra });

afterEach(cleanup);

function card(token: Token, you: Participant, state = room(), result: { ok: true } | { ok: false; message: string } = { ok: true }) {
  const onSetStats = vi.fn(async () => result);
  render(<TokenCard token={token} state={state} you={you} onClose={() => {}} onSetStats={onSetStats} />);
  return onSetStats;
}

describe("quick HP on the token card (token-quick-hp, FR-PL-03)", () => {
  it("the GM damages a goblin with −5", async () => {
    const send = card(goblin, gm);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Damage Goblin by 5" })); });
    expect(send).toHaveBeenCalledWith({ hp: 7, maxHp: 12, ac: 15 });
  });

  it("healing a token already at max HP sends nothing", async () => {
    const send = card(goblin, gm);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Heal Goblin by 1" })); });
    expect(send).not.toHaveBeenCalled();
  });

  it("healing stops at max HP for an owner on their own token", async () => {
    const send = card(hero, alice);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Heal Aria by 5" })); });
    expect(send).toHaveBeenCalledWith({ hp: 12, maxHp: 12, ac: 16 });
  });

  it("a player gets no controls on a token they don't own", () => {
    card(goblin, alice);
    expect(screen.queryByRole("group", { name: "Quick HP" })).toBeNull();
  });

  it("no controls for a token without HP, or with HP hidden from the viewer", () => {
    card({ ...goblin, stats: { hp: null, maxHp: null, ac: 15 } }, gm);
    expect(screen.queryByRole("group", { name: "Quick HP" })).toBeNull();
    cleanup();
    // Hidden HP only applies to tokens the player doesn't own, which they can't edit anyway; the owner keeps the controls.
    card(hero, alice, room({ hideHp: true }));
    expect(screen.getByRole("group", { name: "Quick HP" })).toBeTruthy();
  });

  it("no controls while previewing or replaying", () => {
    render(<TokenCard token={goblin} state={room()} you={gm} readOnly onClose={() => {}} onSetStats={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Quick HP" })).toBeNull();
  });

  it("shows the server's refusal and keeps the card open", async () => {
    card(goblin, gm, room(), { ok: false, message: "That token changed." });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Damage Goblin by 1" })); });
    expect(screen.getByRole("alert").textContent).toBe("That token changed.");
    expect(screen.getByRole("complementary", { name: "Goblin details" })).toBeTruthy();
  });

  it("disables the buttons while a change is in flight", async () => {
    let resolve!: (r: { ok: true }) => void;
    const onSetStats = vi.fn(() => new Promise<{ ok: true }>((r) => { resolve = r; }));
    render(<TokenCard token={goblin} state={room()} you={gm} onClose={() => {}} onSetStats={onSetStats} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Damage Goblin by 1" })); });
    expect((screen.getByRole("button", { name: "Damage Goblin by 5" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolve({ ok: true }); });
    expect((screen.getByRole("button", { name: "Damage Goblin by 5" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers only the four buttons: no typed amount", () => {
    card(goblin, gm);
    const group = screen.getByRole("group", { name: "Quick HP" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["-5", "-1", "+1", "+5"]);
    expect(group.querySelector("input")).toBeNull();
  });

  it("has no roster button", () => {
    card(goblin, gm);
    expect(screen.queryByRole("button", { name: "Open in roster" })).toBeNull();
  });
});
