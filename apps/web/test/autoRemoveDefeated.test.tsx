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

describe("Remove tokens at 0 HP setting (FR-TAC-07)", () => {
  it("shows the switch to the GM in a room and sends the command", async () => {
    const { connection, command } = connectionWith({ ok: true, seq: 1 });
    render(<SettingsMenu open onClose={() => {}} room={{ connection, state: state(), you: gm }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    const toggle = screen.getByRole("switch", { name: "Remove tokens at 0 HP" });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    expect(command).toHaveBeenCalledWith({ type: "room.setAutoRemoveDefeated", enabled: true });
    await waitFor(() => expect((toggle as HTMLInputElement).disabled).toBe(false));
  });

  it("reflects the room state and shows the server's refusal", async () => {
    const { connection } = connectionWith({ ok: false, code: "forbidden", message: "Only the GM can change this" });
    render(<SettingsMenu open onClose={() => {}} room={{ connection, state: state(true), you: gm }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    const toggle = screen.getByRole("switch", { name: "Remove tokens at 0 HP" });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);
    expect((await screen.findByRole("alert")).textContent).toBe("Only the GM can change this");
  });

  it("is hidden from players and when there is no room", () => {
    const { connection } = connectionWith({ ok: true, seq: 1 });
    const { rerender } = render(<SettingsMenu open onClose={() => {}} room={{ connection, state: state(), you: player }} />);
    expect(screen.queryByRole("tab", { name: "Table" })).toBeNull();
    rerender(<SettingsMenu open onClose={() => {}} />);
    expect(screen.queryByRole("tab", { name: "Table" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Graphics" }));
    expect(screen.getByRole("switch", { name: "Reduced animations" })).toBeTruthy();
  });
});

describe("Table settings tab (FR-TAC-07)", () => {
  it("is offered to a GM in a room, after Audio, Graphics and Language, and holds the switch", () => {
    const { connection } = connectionWith({ ok: true, seq: 1 });
    render(<SettingsMenu open onClose={() => {}} room={{ connection, state: state(), you: gm }} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Audio", "Graphics", "Language", "Table"]);
    expect(screen.queryByRole("switch", { name: "Remove tokens at 0 HP" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Audio" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Table" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("switch", { name: "Remove tokens at 0 HP" })).toBeTruthy();
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
