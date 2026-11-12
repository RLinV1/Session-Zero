// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { TurnBanner } from "../src/ui/TurnBanner";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";

const gm: Participant = { id: "g1", role: "gm", displayName: "GM" };
const token = (id: string, name: string): Token => ({
  id, name, position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
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
