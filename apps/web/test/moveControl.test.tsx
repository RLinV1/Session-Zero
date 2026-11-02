// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { ARROW_STEPS, MoveControl, ownsArrowKeys, stepTo } from "../src/ui/MoveControl";
import { TokenCard } from "../src/board/TokenCard";

const gm: Participant = { id: "gm", role: "gm", displayName: "Mara" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };
const bob: Participant = { id: "bob", role: "player", displayName: "Bob" };

const fighter: Token = {
  id: "f1", name: "Fighter", position: { x: 105, y: 105 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: ["alice"], hidden: false, stats: { hp: 12, maxHp: 12, ac: 16 }, conditions: [],
};
const base = emptyRoomState("r1");
const state: RoomState = {
  ...base,
  participants: { gm, alice, bob },
  tokens: { f1: fighter },
  scene: { ...base.scene, grid: { ...base.scene.grid, cellSize: 70 } },
};

afterEach(cleanup);

describe("moving a token without dragging (FR-PL-04, WCAG 2.5.7)", () => {
  it("steps one grid square in board coordinates", async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    render(<MoveControl name="Fighter" at={{ x: 105, y: 105 }} step={70} onMove={onMove} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Fighter right one square" }));
    await waitFor(() => expect(onMove).toHaveBeenCalledWith({ x: 175, y: 105 }));
    fireEvent.click(screen.getByRole("button", { name: "Move Fighter up one square" }));
    await waitFor(() => expect(onMove).toHaveBeenLastCalledWith({ x: 105, y: 35 }));
  });

  it("refuses a step that would leave the map, without taking it out of the tab order", () => {
    const onMove = vi.fn();
    render(<MoveControl name="Fighter" at={{ x: 35, y: 35 }} step={70} bounds={{ width: 140, height: 140 }} onMove={onMove} />);
    const left = screen.getByRole("button", { name: "Move Fighter left one square" }) as HTMLButtonElement;
    expect(left.getAttribute("aria-disabled")).toBe("true");
    expect(left.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Move Fighter up one square" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Move Fighter right one square" }).getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(left);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("allows one move at a time, so a second press can't start from a stale square", async () => {
    let finish: () => void = () => {};
    const onMove = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<MoveControl name="Fighter" at={{ x: 105, y: 105 }} step={70} onMove={onMove} />);
    const right = screen.getByRole("button", { name: "Move Fighter right one square" }) as HTMLButtonElement;
    right.focus();
    fireEvent.click(right);
    await waitFor(() => expect(right.getAttribute("aria-disabled")).toBe("true"));
    fireEvent.click(right);
    expect(onMove).toHaveBeenCalledTimes(1);
    // Still focused: a keyboard user keeps their place between steps.
    expect(document.activeElement).toBe(right);
    finish();
    await waitFor(() => expect(right.getAttribute("aria-disabled")).toBeNull());
  });

  it("is on the board's token card for the owner and the GM, not for other players", () => {
    const onMove = vi.fn();
    for (const [you, shown] of [[alice, true], [gm, true], [bob, false]] as const) {
      render(<TokenCard token={fighter} state={state} you={you} onClose={() => {}} onMove={onMove} />);
      expect(!!screen.queryByRole("group", { name: "Move Fighter" }), you.displayName).toBe(shown);
      cleanup();
    }
  });

  it("is not offered while previewing or replaying", () => {
    render(<TokenCard token={fighter} state={state} you={gm} readOnly onClose={() => {}} onMove={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Move Fighter" })).toBeNull();
  });
});

describe("moving the selected token with the arrow keys (FR-PL-04, WCAG 2.1.1)", () => {
  it("steps one square per arrow and stops at the map's edge", () => {
    const [dx, dy] = ARROW_STEPS.ArrowRight!;
    expect(stepTo({ x: 35, y: 35 }, 70, dx, dy)).toEqual({ x: 105, y: 35 });
    expect(stepTo({ x: 35, y: 35 }, 70, ...ARROW_STEPS.ArrowLeft!, { width: 140, height: 140 })).toBeNull();
    expect(ARROW_STEPS.Enter).toBeUndefined();
  });

  it("leaves the arrows to fields, tab lists and other widgets that use them", () => {
    const text = document.createElement("input");
    const box = Object.assign(document.createElement("input"), { type: "checkbox" });
    const tablist = document.createElement("div");
    tablist.setAttribute("role", "tablist");
    const tab = document.createElement("button");
    tablist.append(tab);
    const plain = document.createElement("button");
    expect(ownsArrowKeys(text)).toBe(true);
    expect(ownsArrowKeys(document.createElement("textarea"))).toBe(true);
    expect(ownsArrowKeys(tab)).toBe(true);
    // The card's own switch and Move buttons don't use the arrows, so the keys still move the token there.
    expect(ownsArrowKeys(box)).toBe(false);
    expect(ownsArrowKeys(plain)).toBe(false);
    expect(ownsArrowKeys(document.body)).toBe(false);
  });

  it("is switched on and off from the token card, for anyone who may move the token", () => {
    const onToggle = vi.fn();
    render(<TokenCard token={fighter} state={state} you={alice} onClose={() => {}} onMove={vi.fn()} arrowKeys={{ on: false, onToggle }} />);
    const toggle = screen.getByRole("switch", { name: "Move with arrow keys" }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
    cleanup();
    render(<TokenCard token={fighter} state={state} you={bob} onClose={() => {}} onMove={vi.fn()} arrowKeys={{ on: true, onToggle }} />);
    expect(screen.queryByRole("switch", { name: "Move with arrow keys" })).toBeNull();
  });

  it("says what the arrow keys do while the switch is on", () => {
    render(<TokenCard token={fighter} state={state} you={alice} onClose={() => {}} onMove={vi.fn()} arrowKeys={{ on: true, onToggle: () => {} }} />);
    expect((screen.getByRole("switch", { name: "Move with arrow keys" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Arrow keys move Fighter one square.")).toBeTruthy();
  });
});
