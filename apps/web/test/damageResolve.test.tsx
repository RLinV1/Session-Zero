// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, presetOf, type DiceRoll, type Participant, type RoomState, type Token } from "@vtt/shared";
import { RulingsPanel } from "../src/panels/RulingsPanel";
import type { RoomConnection } from "../src/net/roomConnection";

vi.mock("@vtt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vtt/shared")>();
  return { ...actual, presetOf: vi.fn(actual.presetOf) };
});

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const token = (id: string, name: string, extra: Partial<Token> = {}): Token => ({
  id, name, position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [], ...extra,
});

/** Goblin at 12/15 HP, and Aria's `total`-damage roll at it. */
function room(total = 8, applied = false): RoomState {
  const state = emptyRoomState("r1");
  state.participants = { [gm.id]: gm };
  state.tokens = {
    aria: token("aria", "Aria"),
    goblin: token("goblin", "Goblin", { stats: { hp: 12, maxHp: 15, ac: 13 } }),
  };
  const roll: DiceRoll = {
    id: "d1", expression: "1d8+3", byParticipantId: gm.id, dice: [Math.max(1, total - 3)], modifier: 3, total, visibility: "public",
    attack: { actor: { tokenId: "aria", name: "Aria", hidden: false }, target: { tokenId: "goblin", name: "Goblin", hidden: false }, label: "Longsword damage", kind: "damage" },
    ...(applied && { damageApplied: true }),
  };
  state.rolls = [roll];
  return state;
}

function panel(state: RoomState, result: { ok: boolean; message?: string } = { ok: true }) {
  const command = vi.fn(async (_c: unknown) => result);
  const connection = { command } as unknown as RoomConnection;
  const view = render(<RulingsPanel connection={connection} state={state} you={gm} airborne={new Set()} onResolve={() => {}} />);
  const rerender = (next: RoomState) => view.rerender(<RulingsPanel connection={connection} state={next} you={gm} airborne={new Set()} onResolve={() => {}} />);
  return { command, rerender };
}

const dialog = () => screen.getByRole("dialog");
const amount = () => within(dialog()).getByLabelText("Amount") as HTMLInputElement;
const openResolve = () => fireEvent.click(screen.getByRole("button", { name: /^Resolve damage: / }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(() => {
  cleanup();
  vi.mocked(presetOf).mockRestore();
});

describe("damage resolve dialog (FR-TAC-07, ADR 0060)", () => {
  it("offers Resolve, not Apply −N, on a pending damage roll", () => {
    panel(room());
    expect(screen.getByRole("button", { name: "Resolve damage: Aria → Goblin · Longsword damage, 8" }).textContent).toBe("Resolve");
    expect(screen.queryByText(/Apply −/)).toBeNull();
  });

  it("opens titled with the target, showing the damage, HP and an amount at the rolled damage", () => {
    panel(room());
    openResolve();
    expect(within(dialog()).getByRole("heading", { name: "Goblin" })).toBeTruthy();
    const text = dialog().textContent!;
    expect(text).toContain("Damage8");
    expect(text).toContain("HP12of 15");
    expect(amount().value).toBe("8");
  });

  it("presses Half (rounded down), checks Poisoned, and sends the GM's choice", async () => {
    const { command } = panel(room(9));
    openResolve();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Half" }));
    expect(amount().value).toBe("4");
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Poisoned/ }));
    await act(async () => fireEvent.click(within(dialog()).getByRole("button", { name: "Confirm resolution" })));
    expect(command).toHaveBeenCalledWith({ type: "roll.applyDamage", rollId: "d1", amount: 4, addConditions: ["poisoned"] });
  });

  it("keeps an invalid amount from sending and says why", () => {
    const { command } = panel(room());
    openResolve();
    fireEvent.change(amount(), { target: { value: "2.5" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Confirm resolution" }));
    expect(command).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole("alert").textContent).toMatch(/whole number/);
  });

  it("keeps the dialog open with the server's message when the resolve is refused", async () => {
    panel(room(), { ok: false, message: "That damage has already been applied." });
    openResolve();
    await act(async () => fireEvent.click(within(dialog()).getByRole("button", { name: "Confirm resolution" })));
    expect(within(dialog()).getByRole("alert").textContent).toBe("That damage has already been applied.");
  });

  it("keeps the draft when closed, sending nothing, and brings it back on reopening", () => {
    const { command } = panel(room());
    openResolve();
    fireEvent.change(amount(), { target: { value: "3" } });
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Prone/ }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(command).not.toHaveBeenCalled();

    openResolve();
    expect(amount().value).toBe("3");
    expect((within(dialog()).getByRole("checkbox", { name: /Prone/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("closes by itself once the roll is applied, e.g. from another device", () => {
    const { rerender } = panel(room());
    openResolve();
    expect(screen.getByRole("dialog")).toBeTruthy();
    rerender(room(8, true));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Resolve damage: / })).toBeNull();
  });

  it("shows no conditions checklist when the room's preset has conditions off", () => {
    const actual = presetOf(emptyRoomState("r1"));
    vi.mocked(presetOf).mockReturnValue({ ...actual, features: { ...actual.features, conditions: false } });
    panel(room());
    openResolve();
    expect(within(dialog()).queryByRole("checkbox")).toBeNull();
    expect(amount()).toBeTruthy();
  });
});
