// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type DiceRoll, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { AttackPanel } from "../src/panels/AttackPanel";
import { AttackPings, ATTACK_PING_WINDOW_MS } from "../src/board/attackPings";
import { RollCard } from "../src/ui/RollCard";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";

afterEach(() => { cleanup(); setClientSettings(DEFAULT_CLIENT_SETTINGS); });

const roll: DiceRoll = { id: "r", expression: "2d6+1d4+3", byParticipantId: "gm", dice: [4, 2, 3], modifier: 3, total: 12, visibility: "public" };

describe("the roll card at each Animations level (animation-levels)", () => {
  it("draws each die flat, with its value and type, at Reduced", () => {
    setClientSettings({ animationLevel: "reduced" });
    render(<RollCard roll={roll} rollerName={() => "Aria"} />);
    const dice = [...document.querySelectorAll(".board-roll-die")].map((d) => d.textContent);
    expect(dice).toEqual(["4d6", "2d6", "3d4"]);
    expect(document.querySelector(".board-roll-dice")!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("12");
  });

  it.each(["full", "none"] as const)("shows only the numbers at %s", (level) => {
    setClientSettings({ animationLevel: level });
    render(<RollCard roll={roll} rollerName={() => "Aria"} />);
    expect(document.querySelector(".board-roll-dice")).toBeNull();
    expect(document.querySelector(".board-roll-breakdown")!.textContent).toBe("2d6 (4, 2) + 1d4 (3) + 3");
  });
});

describe("recognising an attack roll's target ping (animation-levels)", () => {
  it("matches the roller's ping at the target, once, within the window", () => {
    const pings = new AttackPings();
    pings.note("p1", { x: 35, y: 35 }, 0);
    expect(pings.take("p2", { x: 35, y: 35 }, 10)).toBe(false);
    expect(pings.take("p1", { x: 105, y: 35 }, 10)).toBe(false);
    expect(pings.take("p1", { x: 35, y: 35 }, 10)).toBe(true);
    expect(pings.take("p1", { x: 35, y: 35 }, 20)).toBe(false);
    pings.note("p1", { x: 35, y: 35 }, 100);
    expect(pings.take("p1", { x: 35, y: 35 }, 100 + ATTACK_PING_WINDOW_MS + 1)).toBe(false);
  });
});

describe("the roller's own target ping (animation-levels)", () => {
  const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
  const token = (id: string, x: number, over: Partial<Token> = {}): Token => ({
    id, name: id, position: { x, y: 100 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
    ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [], ...over,
  });
  const state: RoomState = {
    ...emptyRoomState("r"),
    participants: { gm },
    tokens: {
      a: token("a", 100, { attacks: [{ name: "Club", toHit: null, damage: { terms: [{ count: 1, sides: 6 }], modifier: 0 } }] }),
      b: token("b", 170),
    },
  };
  async function attack() {
    const command = vi.fn(async () => ({ ok: true as const, seq: 1 }));
    const ephemeral = vi.fn();
    const onShowPing = vi.fn();
    const connection = { command, ephemeral, snapshot: { seq: 1, state } } as unknown as RoomConnection;
    render(
      <AttackPanel
        connection={connection} state={state} you={gm} pick={{ attackerId: "a", targetId: "b" }} onPick={() => {}}
        reset={{ count: 0, clearedRollId: null }} rolling={false}
        onPickOnBoard={() => {}} onShowPing={onShowPing} visibility="public" onVisibility={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /: Club against/ }));
    await waitFor(() => expect(ephemeral).toHaveBeenCalledTimes(1));
    return { onShowPing, ephemeral };
  }

  it("is drawn at Full and still sent to everyone", async () => {
    setClientSettings({ animationLevel: "full" });
    const { onShowPing, ephemeral } = await attack();
    expect(onShowPing).toHaveBeenCalledWith({ x: 170, y: 100 });
    expect(ephemeral).toHaveBeenCalledWith({ type: "ping", at: { x: 170, y: 100 } });
  });

  it("is left out of this board at None, but still sent to everyone", async () => {
    setClientSettings({ animationLevel: "none" });
    const { onShowPing, ephemeral } = await attack();
    expect(onShowPing).not.toHaveBeenCalled();
    expect(ephemeral).toHaveBeenCalledWith({ type: "ping", at: { x: 170, y: 100 } });
  });
});
