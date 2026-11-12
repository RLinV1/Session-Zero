// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { MAX_DEFEAT_EFFECTS, attackEffectFor, defeatPlan } from "../src/board/effects";
import type { RoomConnection } from "../src/net/roomConnection";
import { SettingsMenu } from "../src/ui/SettingsMenu";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const player: Participant = { id: "p", role: "player", displayName: "Player" };
const token = (hidden = false): Token => ({
  id: "t", name: "Goblin", position: { x: 50, y: 50 }, size: 1, rotation: 0, color: "#cc5555", imageUrl: null,
  ownerIds: [], hidden, stats: { hp: 0, maxHp: 7, ac: 12 }, conditions: [],
});
const state = (autoRemoveDefeated = false): RoomState => ({ ...emptyRoomState("room"), autoRemoveDefeated, participants: { gm, p: player } });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  setClientSettings(DEFAULT_CLIENT_SETTINGS);
});
afterEach(() => { cleanup(); setClientSettings(DEFAULT_CLIENT_SETTINGS); });

const connectionWith = (result: { ok: true; seq: number } | { ok: false; code: string; message: string }) => {
  const command = vi.fn().mockResolvedValue(result);
  return { connection: { command } as unknown as RoomConnection, command };
};

describe("Table settings tab (FR-TAC-07, FR-GM-23, table-rules)", () => {
  const openTable = (room: RoomState, you = gm) => {
    const made = connectionWith({ ok: true, seq: 1 });
    render(<SettingsMenu open onClose={() => {}} room={{ connection: made.connection, state: room, you }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    return made.command;
  };

  it("is offered to a GM in a room, just before Language, with exactly the four rules and no hint text", () => {
    const { connection } = connectionWith({ ok: true, seq: 1 });
    render(<SettingsMenu open onClose={() => {}} room={{ connection, state: state(), you: gm }} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Audio", "Graphics", "Preferences", "Table", "Language"]);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Audio" }), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("tab", { name: "Language" }), { key: "ArrowLeft" });
    const panel = screen.getByRole("tabpanel");
    const select = screen.getByLabelText("Remove tokens at 0 HP") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["All", "Only NPC tokens", "Off"]);
    expect(screen.getAllByRole("switch").map((s) => s.closest("label")!.textContent)).toEqual(["Hide map from players without a token", "Hide HP from Players", "Hide AC from Players"]);
    expect([...(screen.getByLabelText("Diagonals") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Equal cost", "Alternating (1, 2)", "Euclidean"]);
    expect([...(screen.getByLabelText("Difficult terrain applies") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["On entry", "On exit", "Both"]);
    expect(screen.getAllByRole("combobox").map((c) => c.closest("label")!.firstChild!.textContent)).toEqual(["Remove tokens at 0 HP", "Diagonals", "Difficult terrain applies"]);
    expect(panel.querySelector(".small-print")).toBeNull();
  });

  it("reflects the room's rules, including an older room's switch", () => {
    openTable({ ...state(false), hideHp: true });
    expect((screen.getByLabelText("Remove tokens at 0 HP") as HTMLSelectElement).value).toBe("off");
    expect((screen.getByRole("switch", { name: "Hide HP from Players" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("switch", { name: "Hide AC from Players" }) as HTMLInputElement).checked).toBe(false);
    cleanup();
    openTable({ ...state(true), defeatRemoval: "npc" });
    expect((screen.getByLabelText("Remove tokens at 0 HP") as HTMLSelectElement).value).toBe("npc");
  });

  it("sends each rule's own command", async () => {
    const command = openTable(state());
    fireEvent.change(screen.getByLabelText("Remove tokens at 0 HP"), { target: { value: "npc" } });
    expect(command).toHaveBeenLastCalledWith({ type: "room.setDefeatRemoval", mode: "npc" });
    await waitFor(() => expect((screen.getByRole("switch", { name: "Hide HP from Players" }) as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Diagonals"), { target: { value: "alternating" } });
    expect(command).toHaveBeenLastCalledWith({ type: "room.setDiagonalRule", rule: "alternating" });
    await waitFor(() => expect((screen.getByLabelText("Diagonals") as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Difficult terrain applies"), { target: { value: "both" } });
    expect(command).toHaveBeenLastCalledWith({ type: "room.setDifficultTerrain", mode: "both" });
    await waitFor(() => expect((screen.getByLabelText("Difficult terrain applies") as HTMLSelectElement).disabled).toBe(false));
    for (const [name, type] of [
      ["Hide map from players without a token", "room.setHideMapWithoutToken"],
      ["Hide HP from Players", "room.setHideHp"],
      ["Hide AC from Players", "room.setHideAc"],
    ] as const) {
      fireEvent.click(screen.getByRole("switch", { name }));
      expect(command).toHaveBeenLastCalledWith({ type, enabled: true });
      await waitFor(() => expect((screen.getByRole("switch", { name }) as HTMLInputElement).disabled).toBe(false));
    }
  });

  it("shows the server's refusal", async () => {
    const { connection } = connectionWith({ ok: false, code: "forbidden", message: "Only the GM can change this" });
    render(<SettingsMenu open onClose={() => {}} room={{ connection, state: state(), you: gm }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    fireEvent.click(screen.getByRole("switch", { name: "Hide AC from Players" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Only the GM can change this");
  });

  it("is hidden from players and when there is no room", () => {
    const { connection } = connectionWith({ ok: true, seq: 1 });
    const { rerender } = render(<SettingsMenu open onClose={() => {}} room={{ connection, state: state(), you: player }} />);
    expect(screen.queryByRole("tab", { name: "Table" })).toBeNull();
    rerender(<SettingsMenu open onClose={() => {}} />);
    expect(screen.queryByRole("tab", { name: "Table" })).toBeNull();
  });
});

describe("defeat animation decision (FR-TAC-07)", () => {
  const defeated = (hidden = false) => ({ type: "TokenDeleted", token: token(hidden), reason: "defeated" }) as const;

  it("a defeat plays for the GM and for a player who can see the token", () => {
    expect(attackEffectFor(defeated(), state(true), gm)).toEqual({ kind: "defeat", tokenId: "t" });
    expect(attackEffectFor(defeated(), state(true), player)).toEqual({ kind: "defeat", tokenId: "t" });
  });

  it("a hidden token's defeat plays for the GM only", () => {
    expect(attackEffectFor(defeated(true), state(true), gm)).toEqual({ kind: "defeat", tokenId: "t" });
    expect(attackEffectFor(defeated(true), state(true), player)).toBeNull();
  });

  it("a manual delete plays nothing", () => {
    expect(attackEffectFor({ type: "TokenDeleted", token: token() }, state(), gm)).toBeNull();
  });

  it("reduced motion, low quality or a crowd give a plain fade of 250 ms or less", () => {
    for (const plan of [
      defeatPlan({ reducedMotion: true, quality: "high", active: 0 }),
      defeatPlan({ reducedMotion: false, quality: "low", active: 0 }),
      defeatPlan({ reducedMotion: false, quality: "high", active: MAX_DEFEAT_EFFECTS }),
    ]) {
      expect(plan).toMatchObject({ motion: false, particles: 0 });
      expect(plan.durationMs).toBeLessThanOrEqual(250);
    }
  });

  it("the full effect scales its particles with graphics quality", () => {
    const high = defeatPlan({ reducedMotion: false, quality: "high", active: 0 });
    const balanced = defeatPlan({ reducedMotion: false, quality: "balanced", active: 0 });
    expect(high.motion).toBe(true);
    expect(high.particles).toBeGreaterThan(balanced.particles);
    expect(balanced.particles).toBeGreaterThan(0);
  });
});
