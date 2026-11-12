// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type DiceRoll, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { DicePoolInput } from "../src/ui/DicePoolInput";
import { diceBreakdown, poolExpression, poolOf, type DicePool } from "../src/ui/dicePool";
import { DicePanel, type RollThrow } from "../src/panels/DicePanel";
import { AttackPanel } from "../src/panels/AttackPanel";
import { LAST_USED_KEY } from "../src/panels/attackRoll";
import { RollCard } from "../src/ui/RollCard";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

/** The builder with its value kept here, and the latest value exposed. */
function Harness({ initial, onValue }: { initial: DicePool; onValue: (pool: DicePool) => void }) {
  const [pool, setPool] = useState(initial);
  return <DicePoolInput value={pool} onChange={(next) => { setPool(next); onValue(next); }} label="Damage" />;
}

function builder(initial: DicePool = poolOf(6)) {
  let latest = initial;
  render(<Harness initial={initial} onValue={(p) => (latest = p)} />);
  return { value: () => latest, readout: () => screen.getByRole("status", { name: "Formula" }).textContent };
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });

describe("the dice builder (dice-pool)", () => {
  it("builds a sneak attack with + Die and + Modifier", () => {
    const b = builder();
    fireEvent.click(button("+ Die"));
    fireEvent.change(screen.getByRole("combobox", { name: "Die type, row 2" }), { target: { value: "4" } });
    fireEvent.click(button("+ Modifier"));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Modifier" }), { target: { value: "3" } });
    expect(b.readout()).toBe("1d6 + 1d4 + 3");
    expect(poolExpression(b.value())).toBe("1d6+1d4+3");
    expect((button("+ Modifier") as HTMLButtonElement).disabled).toBe(true);
    // A small + between each row, hidden from screen readers, which read the formula instead.
    const pluses = [...document.querySelectorAll(".dice-pool-plus")];
    expect(pluses.map((p) => p.textContent)).toEqual(["+", "+"]);
    expect(pluses.every((p) => p.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("never offers a die type another row already uses", () => {
    builder();
    fireEvent.click(button("+ Die"));
    const second = screen.getByRole("combobox", { name: "Die type, row 2" });
    expect(within(second).queryByRole("option", { name: "d6" })).toBeNull();
    const first = screen.getByRole("combobox", { name: "Die type, row 1" });
    expect(within(first).getByRole("option", { name: "d6" })).toBeTruthy();
    expect(within(first).queryByRole("option", { name: "d4" })).toBeNull();
  });

  it("removes a row, but never the last die row, and removes the modifier", () => {
    const b = builder({ terms: [{ count: 2, sides: 6 }, { count: 1, sides: 4 }], modifier: 3 });
    fireEvent.click(button("Remove d4"));
    expect(b.readout()).toBe("2d6 + 3");
    expect(screen.queryByRole("button", { name: "Remove d6" })).toBeNull();
    fireEvent.click(button("Remove modifier"));
    expect(b.readout()).toBe("2d6");
    expect(screen.queryByRole("spinbutton", { name: "Modifier" })).toBeNull();
  });

  it("keeps the builder at 20 dice", () => {
    const b = builder({ terms: [{ count: 18, sides: 6 }], modifier: 0 });
    fireEvent.click(button("+ Die"));
    expect(b.value().terms[1]).toEqual({ count: 1, sides: 4 });
    fireEvent.click(button("One d4 more"));
    expect(b.value().terms[1]!.count).toBe(2);
    expect((button("One d4 more") as HTMLButtonElement).disabled).toBe(true);
    expect((button("+ Die") as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers + Die until all seven die types are used", () => {
    builder({ terms: [{ count: 1, sides: 4 }], modifier: 0 });
    for (let i = 0; i < 6; i++) fireEvent.click(button("+ Die"));
    expect(screen.getAllByRole("combobox")).toHaveLength(7);
    expect((button("+ Die") as HTMLButtonElement).disabled).toBe(true);
  });
});

const rollThrow: RollThrow = { airborne: new Set(), rolling: false, justLandedId: null, onLanded: () => {}, expectDrop: () => () => {} };
const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };

describe("the Dice panel uses the builder (dice-pool)", () => {
  function panel(state: RoomState = { ...emptyRoomState("r"), participants: { gm } }) {
    const command = vi.fn(async (_c: unknown) => ({ ok: true as const, seq: null }));
    render(<DicePanel connection={{ command } as unknown as RoomConnection} state={state} isGm={false} rollThrow={rollThrow} />);
    return command;
  }

  it("rolls 1d20 by default, with no example rolls to pick from, and rolls what is built", async () => {
    const command = panel();
    expect(document.querySelector(".dice-form input:not([type])")).toBeNull();
    expect(screen.queryByRole("button", { name: "1d8+3" })).toBeNull();
    await act(async () => fireEvent.click(button("Roll")));
    expect(command).toHaveBeenLastCalledWith({ type: "dice.roll", expression: "1d20", visibility: "public" });

    fireEvent.click(button("+ Modifier"));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Modifier" }), { target: { value: "3" } });
    await act(async () => fireEvent.click(button("Roll")));
    expect(command).toHaveBeenLastCalledWith({ type: "dice.roll", expression: "1d20+3", visibility: "public" });
  });

  it("shows each die grouped by type in the roll log, and an old roll the same way", () => {
    const roll = (id: string, expression: string, dice: number[], modifier: number): DiceRoll => ({
      id, expression, byParticipantId: "gm", dice, modifier, total: dice.reduce((a, b) => a + b, 0) + modifier, visibility: "public",
    });
    panel({ ...emptyRoomState("r"), participants: { gm }, rolls: [roll("old", "1d20+5", [12], 5), roll("new", "2d6+1d4+3", [4, 2, 3], 3)] });
    expect(document.querySelector(".roll-log .roll-breakdown")!.textContent).toBe("2d6 (4, 2) + 1d4 (3) + 3");
    expect(diceBreakdown(roll("old", "1d20+5", [12], 5))).toBe("1d20 (12) + 5");
  });
});

describe("the board's roll pop-up (dice-pool)", () => {
  it("shows the breakdown outside what it announces", () => {
    const roll: DiceRoll = { id: "r", expression: "2d6+1d4+3", byParticipantId: "gm", dice: [4, 2, 3], modifier: 3, total: 12, visibility: "public" };
    render(<RollCard roll={roll} rollerName={() => "Aria"} />);
    const live = screen.getByRole("status");
    expect(live.textContent).toContain("12");
    expect(live.textContent).not.toContain("(4, 2)");
    const breakdown = document.querySelector(".board-roll-breakdown")!;
    expect(breakdown.textContent).toBe("2d6 (4, 2) + 1d4 (3) + 3");
    expect(breakdown.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("custom roll settings saved before mixed dice (dice-pool)", () => {
  it("opens an old stored 1 × d20 + 5 as one d20 row with a modifier of 5", async () => {
    const token = (id: string): Token => ({
      id, name: id, position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
      ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [],
    });
    window.localStorage.setItem(LAST_USED_KEY, JSON.stringify({ a: { count: 1, sides: 20, modifier: 5, label: "" } }));
    window.localStorage.setItem("vtt.ui.customRoll", "true");
    const command = vi.fn(async (_c: unknown) => ({ ok: true as const, seq: null }));
    const connection = { command, ephemeral: vi.fn(), snapshot: { seq: 0, state: null } } as unknown as RoomConnection;
    render(
      <AttackPanel
        connection={connection} state={{ ...emptyRoomState("r"), participants: { gm }, tokens: { a: token("a"), b: token("b") } }} you={gm}
        pick={{ attackerId: "a", targetId: "b" }} onPick={() => {}} reset={{ count: 0, clearedRollId: null }} rolling={false}
        onPickOnBoard={() => {}} onShowPing={() => {}} visibility="public" onVisibility={() => {}}
      />,
    );
    expect(screen.getByRole("status", { name: "Formula" }).textContent).toBe("1d20 + 5");
    expect((screen.getByRole("combobox", { name: "Die type, row 1" }) as HTMLSelectElement).value).toBe("20");
    expect((screen.getByRole("spinbutton", { name: "Modifier" }) as HTMLInputElement).value).toBe("5");
  });
});
