// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { TurnBanner } from "../src/ui/TurnBanner";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";

const gm: Participant = { id: "g1", role: "gm", displayName: "GM" };
const player: Participant = { id: "p1", role: "player", displayName: "Bea" };
const token = (id: string, name: string, ownerIds: string[] = []): Token => ({
  id, name, position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds, hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
});
const state: RoomState = { ...emptyRoomState("r"), tokens: { goblin: token("goblin", "Goblin") }, initiative: { order: ["goblin"], activeIndex: 0, round: 3 } };

afterEach(() => {
  cleanup();
  act(() => setClientSettings(DEFAULT_CLIENT_SETTINGS));
});

describe("GM turn banner setting (turn-notice)", () => {
  it("shows the GM nothing by default, and the banner with End turn on every turn once turned on", async () => {
    const onEndTurn = vi.fn(async () => ({ ok: true as const }));
    render(<TurnBanner state={state} you={gm} onFocusToken={() => {}} onEndTurn={onEndTurn} />);
    expect(document.querySelector(".turn-banner")).toBeNull();

    act(() => setClientSettings({ gmTurnBanner: true }));
    expect(document.querySelector(".turn-banner")!.textContent).toContain("Goblin");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "End Goblin's turn" })));
    expect(onEndTurn).toHaveBeenCalledWith("goblin");
  });
});

describe("Player turn banner setting (turn-notice)", () => {
  const encounter = (activeIndex: number): RoomState => ({
    ...emptyRoomState("r"),
    tokens: { goblin: token("goblin", "Goblin"), aria: token("aria", "Aria", ["p1"]) },
    initiative: { order: ["goblin", "aria"], activeIndex, round: 3 },
  });

  it("shows another token's turn with Show on board and no End turn once turned on", () => {
    const onEndTurn = vi.fn(async () => ({ ok: true as const }));
    render(<TurnBanner state={encounter(0)} you={player} onFocusToken={() => {}} onEndTurn={onEndTurn} />);
    expect(document.querySelector(".turn-banner")).toBeNull();

    act(() => setClientSettings({ gmTurnBanner: true }));
    expect(document.querySelector(".turn-banner")!.textContent).toContain("Goblin");
    expect(screen.getByRole("button", { name: "Show on board" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End Goblin's turn" })).toBeNull();
  });

  it("offers End turn on the player's own token's turn", async () => {
    act(() => setClientSettings({ gmTurnBanner: true }));
    const onEndTurn = vi.fn(async () => ({ ok: true as const }));
    render(<TurnBanner state={encounter(1)} you={player} onFocusToken={() => {}} onEndTurn={onEndTurn} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "End Aria's turn" })));
    expect(onEndTurn).toHaveBeenCalledWith("aria");
  });
});
