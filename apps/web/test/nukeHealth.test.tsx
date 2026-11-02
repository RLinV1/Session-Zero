// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command, decide, emptyRoomState, type Participant, type RoomState, type ServerMessage, type Token } from "@vtt/shared";
import { NukeHealthContext, useDisplayedHealth, useNukeHealth } from "../src/board/nukeHealth";
import { RoomConnection, useRoomSnapshot } from "../src/net/roomConnection";
import { MyTokens } from "../src/panels/MyTokens";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";
import { NUKE_PRESET } from "../src/board/effectPresets";

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const player: Participant = { id: "p", role: "player", displayName: "Player" };
const token: Token = {
  id: "t", name: "Aria", position: { x: 50, y: 50 }, size: 1, rotation: 0, color: "#cc5555", imageUrl: null,
  ownerIds: [player.id], hidden: false, stats: { hp: 30, maxHp: 30, ac: 12 }, conditions: [],
};
const handle = (c: RoomConnection, message: ServerMessage) =>
  (c as unknown as { handle(message: ServerMessage): void }).handle(message);

function setup(viewer = player, reducedEffects = false) {
  const connection = new RoomConnection("room", "guest");
  const state: RoomState = { ...emptyRoomState("room"), reducedEffects, participants: { gm, p: player }, tokens: { t: token } };
  handle(connection, { type: "welcome", state, you: viewer, seq: 0 });
  const command = vi.spyOn(connection, "command").mockResolvedValue({ ok: true, seq: null });
  let impact = () => {};
  function Readout() {
    const { state } = useRoomSnapshot(connection);
    const displayed = useDisplayedHealth(state!);
    return <><output data-testid="hp">{displayed.tokens.t!.stats.hp}</output><MyTokens connection={connection} state={state!} you={player} onFocusToken={() => {}} /></>;
  }
  function View() {
    const health = useNukeHealth(connection, true);
    impact = health.impact;
    return <NukeHealthContext.Provider value={health.held}><Readout /></NukeHealthContext.Provider>;
  }
  const mounted = render(<View />);
  const nuke = (amount = 10, duration = 2) => {
    const result = decide(connection.snapshot.state!, gm, Command.parse({
      type: "nuke.detonate", amount, origin: { x: 50, y: 50 }, animation: { ...NUKE_PRESET, duration },
    }), { newId: () => "unused" });
    if (!result.ok) throw new Error(result.message);
    act(() => {
      for (const event of result.events) handle(connection, {
        type: "event", committed: { seq: connection.snapshot.seq + 1, actorId: gm.id, at: "2026-10-18T00:00:00Z", event },
      });
    });
  };
  return { connection, command, nuke, impact: () => act(() => impact()), unmount: mounted.unmount };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  setClientSettings(DEFAULT_CLIENT_SETTINGS);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); setClientSettings(DEFAULT_CLIENT_SETTINGS); });

describe("nuke HP presentation (FR-TAC-07, ADR 0038)", () => {
  it.each([gm, player])("holds $role HP and meters until the actual impact callback", (viewer) => {
    const { connection, nuke, impact } = setup(viewer);
    nuke();
    expect(connection.snapshot.state!.tokens.t!.stats.hp).toBe(20);
    expect(screen.getByTestId("hp").textContent).toBe("30");
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("30");
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByTestId("hp").textContent).toBe("30");
    impact();
    expect(screen.getByTestId("hp").textContent).toBe("20");
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("20");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses authoritative HP for quick healing while the displayed HP waits", () => {
    const { nuke, command } = setup();
    nuke();
    fireEvent.click(screen.getByRole("button", { name: "Heal Aria by 1" }));
    expect(command).toHaveBeenCalledWith({ type: "token.setStats", tokenId: "t", stats: { hp: 21, maxHp: 30, ac: 12 } });
  });

  it("settles without WebGL using the chosen animation's drop duration", () => {
    const { nuke } = setup();
    nuke(10, 4);
    act(() => vi.advanceTimersByTime(1939));
    expect(screen.getByTestId("hp").textContent).toBe("30");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("hp").textContent).toBe("20");
  });

  it("shows a reduced-motion hit immediately", () => {
    const { nuke } = setup(player, true);
    nuke();
    expect(screen.getByTestId("hp").textContent).toBe("20");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves held HP when a second nuke replaces the first animation", () => {
    const { nuke, impact } = setup();
    nuke();
    nuke(5);
    expect(screen.getByTestId("hp").textContent).toBe("30");
    impact();
    expect(screen.getByTestId("hp").textContent).toBe("15");
  });

  it("never hides a newer HP edit", () => {
    const { connection, nuke } = setup();
    nuke();
    act(() => handle(connection, { type: "event", committed: {
      seq: connection.snapshot.seq + 1, actorId: gm.id, at: "2026-10-18T00:00:00Z",
      event: { type: "TokenStatsSet", tokenId: "t", previous: { hp: 20, maxHp: 30, ac: 12 }, stats: { hp: 21, maxHp: 30, ac: 12 } },
    } }));
    expect(screen.getByTestId("hp").textContent).toBe("21");
  });

  it("clears on snapshots and releases timers on unmount", () => {
    const { connection, nuke, unmount } = setup();
    nuke();
    act(() => handle(connection, { type: "welcome", state: connection.snapshot.state!, you: player, seq: connection.snapshot.seq }));
    expect(screen.getByTestId("hp").textContent).toBe("20");
    nuke();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles immediately if the tab hides during the drop", () => {
    const { nuke } = setup();
    nuke();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByTestId("hp").textContent).toBe("20");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles when reduced animations interrupts a falling nuke", () => {
    const { nuke } = setup();
    nuke();
    act(() => setClientSettings({ reducedAnimations: true }));
    expect(screen.getByTestId("hp").textContent).toBe("20");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("hp").textContent).toBe("20");
  });
});
