// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type AttackPreset, type DiagonalRule, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { AttackPanel, needsTwoRows } from "../src/panels/AttackPanel";
import { targetsByDistance } from "../src/panels/attackRoll";

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
});
// The custom roll builder remembers in this browser whether it was left open.
afterEach(() => { cleanup(); localStorage.clear(); });

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const d20 = { terms: [{ count: 1, sides: 20 }], modifier: 5 };
/** A token whose square is (col, row) on the default 70 px grid. */
const token = (id: string, col: number, row: number, over: Partial<Token> = {}): Token => ({
  id, name: id, position: { x: col * 70 + 35, y: row * 70 + 35 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [], ...over,
});
const LONGSWORD: AttackPreset = { name: "Longsword", toHit: d20, damage: null, range: { kind: "melee" } };
const SWEEP: AttackPreset = { name: "Sweep", toHit: d20, damage: null, range: { kind: "melee" }, maxTargets: 3 };

function room(attacks: AttackPreset[], tokens: Token[], rule: DiagonalRule = "equal"): RoomState {
  return {
    ...emptyRoomState("r"),
    participants: { gm },
    diagonalRule: rule,
    tokens: Object.fromEntries([token("Aria", 0, 0, { attacks }), ...tokens].map((t) => [t.id, t])),
  };
}

function panel(state: RoomState, targetId: string | null = null, onAttackRange = vi.fn()) {
  const connection = { command: vi.fn(async () => ({ ok: true as const, seq: null })), ephemeral: vi.fn(), snapshot: { seq: 0, state: null } } as unknown as RoomConnection;
  const onPick = vi.fn();
  render(
    <AttackPanel
      connection={connection} state={state} you={gm} pick={{ attackerId: "Aria", targetId }} onPick={onPick}
      reset={{ count: 0, clearedRollId: null }} rolling={false} onAttackRange={onAttackRange}
      onPickOnBoard={() => {}} onShowPing={() => {}} visibility="public" onVisibility={() => {}}
    />,
  );
  return { onPick, onAttackRange };
}

const optionNames = () => within(screen.getByRole("listbox", { name: "Target" })).getAllByRole("option").map((o) => o.textContent);

describe("targets grouped by the chosen attack's range (attack-range)", () => {
  it("measures under the room's Diagonals rule and marks who is in range", () => {
    const state = room([], [token("Goblin", 2, 2)], "alternating");
    expect(targetsByDistance(state, "Aria")[0]).toMatchObject({ distance: "15 ft", inRange: true });
    expect(targetsByDistance(state, "Aria", { kind: "melee", reach: 10 })[0]!.inRange).toBe(false);
  });

  it("lists in-range targets first, and the rest behind a collapsed group that opens", () => {
    panel(room([LONGSWORD], [token("Goblin", 1, 0), token("Orc", 6, 0), token("Wolf", 8, 0)]));
    fireEvent.click(screen.getByRole("combobox", { name: "Target" }));
    expect(optionNames()).toEqual(["Goblin5 ft", "Out of range (2)"]);
    const group = screen.getByRole("option", { name: /Out of range \(2\)/ });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(group);
    expect(optionNames()).toEqual(["Goblin5 ft", "Out of range (2)", "Orc30 ft", "Wolf40 ft"]);
  });

  it("starts the group collapsed every time the list opens", () => {
    panel(room([LONGSWORD], [token("Goblin", 1, 0), token("Orc", 6, 0)]));
    const picker = screen.getByRole("combobox", { name: "Target" });
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole("option", { name: /Out of range/ }));
    fireEvent.click(picker);
    fireEvent.click(picker);
    expect(screen.getByRole("option", { name: /Out of range/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("lets an out-of-range target be chosen, and turns the picker red saying so", () => {
    const { onPick } = panel(room([LONGSWORD], [token("Goblin", 1, 0), token("Orc", 6, 0)]));
    fireEvent.click(screen.getByRole("combobox", { name: "Target" }));
    fireEvent.click(screen.getByRole("option", { name: /Out of range/ }));
    fireEvent.click(screen.getByRole("option", { name: /Orc/ }));
    expect(onPick).toHaveBeenCalledWith({ attackerId: "Aria", targetId: "Orc" });
  });

  it("shows a chosen out-of-range target red, with the words, and still offers the roll", () => {
    panel(room([LONGSWORD], [token("Goblin", 1, 0), token("Orc", 6, 0)]), "Orc");
    const picker = screen.getByRole("combobox", { name: "Target" });
    expect(picker.textContent).toContain("Out of range");
    expect(picker.closest(".picker")!.className).toContain("picker-warning");
    expect((screen.getByRole("button", { name: /Longsword/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says when nothing is in range, above the group", () => {
    panel(room([LONGSWORD], [token("Orc", 6, 0)]));
    fireEvent.click(screen.getByRole("combobox", { name: "Target" }));
    expect(screen.getByText("No target is in range.")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Out of range \(1\)/ })).toBeTruthy();
  });

  it("lists every target with no group and nothing red for an attack with no range", () => {
    panel(room([{ name: "Shove", toHit: d20, damage: null }], [token("Goblin", 1, 0), token("Orc", 6, 0)]), "Orc");
    expect(screen.getByRole("combobox", { name: "Target" }).textContent).not.toContain("Out of range");
    fireEvent.click(screen.getByRole("combobox", { name: "Target" }));
    expect(optionNames()).toEqual(["Goblin5 ft", "Orc30 ft"]);
  });

  it("tells the board the chosen attack's range, and none for the custom roll", () => {
    const onAttackRange = vi.fn();
    panel(room([LONGSWORD], [token("Goblin", 1, 0)]), null, onAttackRange);
    expect(onAttackRange).toHaveBeenLastCalledWith({ kind: "melee" });
    fireEvent.click(screen.getByRole("button", { name: "Attack options" }));
    fireEvent.click(screen.getByRole("button", { name: /Custom roll/ }));
    expect(onAttackRange).toHaveBeenLastCalledWith(null);
  });
});

describe("the multi-target list by range (attack-range)", () => {
  it("groups out-of-range targets behind a closed section and marks a chosen one red", () => {
    panel(room([SWEEP], [token("Goblin", 1, 0), token("Orc", 6, 0)]), "Goblin");
    fireEvent.click(screen.getByRole("button", { name: "Targets" }));
    const group = screen.getByText("Out of range (1)").closest("details")!;
    expect(group.open).toBe(false);
    fireEvent.click(within(group).getByRole("checkbox", { name: /Orc/ }));
    const orc = within(group).getByRole("checkbox", { name: /Orc/ }).closest("label")!;
    expect(orc.className).toContain("attack-target-out");
    expect(orc.textContent).toContain("Out of range");
  });
});

describe("the Attack section's order and stats (attack-range)", () => {
  it("puts the attack before the target, since the target list depends on it", () => {
    panel(room([LONGSWORD], [token("Goblin", 1, 0)]));
    const attack = screen.getByRole("combobox", { name: "Aria's attack" });
    const target = screen.getByRole("combobox", { name: "Target" });
    expect(attack.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("spells out the chosen attack's range, attack roll and damage roll on its card", () => {
    const bow: AttackPreset = { name: "Longbow", toHit: d20, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 }, range: { kind: "ranged", distance: 80 } };
    panel(room([bow], [token("Goblin", 1, 0)]));
    const card = screen.getByRole("combobox", { name: "Aria's attack" });
    const stats = card.querySelector(".attack-stats") as HTMLElement;
    // In place of the old "+5 · 1d8+3".
    expect(card.querySelector(".picker-detail")).toBeNull();
    expect(within(stats).getByText("Range").nextElementSibling!.textContent).toBe("Ranged: 80 ft");
    // The die is named, even a plain d20.
    expect(within(stats).getByText("Attack roll").nextElementSibling!.textContent).toBe("1d20+5");
    expect(within(stats).getByText("Damage roll").nextElementSibling!.textContent).toBe("1d8+3");
  });

  it("says Melee with its reach, and Unlimited with no range", () => {
    panel(room([LONGSWORD], [token("Goblin", 1, 0)]));
    expect(document.querySelector(".attack-stats")!.textContent).toContain("Melee: 5 ft");
    cleanup();
    panel(room([{ name: "Shove", toHit: d20, damage: null }], [token("Goblin", 1, 0)]));
    expect(document.querySelector(".attack-stats")!.textContent).toContain("Unlimited");
    expect(document.querySelector(".attack-stats")!.textContent).not.toContain("Damage roll");
  });
});

describe("attack cards in the list (attack-range)", () => {
  it("shows each attack's range and rolls in the list too", () => {
    const bow: AttackPreset = { name: "Longbow", toHit: d20, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 }, range: { kind: "ranged", distance: 80 } };
    panel(room([LONGSWORD, bow], [token("Goblin", 1, 0)]));
    fireEvent.click(screen.getByRole("combobox", { name: "Aria's attack" }));
    const list = screen.getByRole("listbox", { name: "Aria's attack" });
    const options = within(list).getAllByRole("option").map((o) => o.textContent);
    expect(options[0]).toContain("Melee: 5 ft");
    expect(options[1]).toContain("Ranged: 80 ft");
    expect(options[1]).toContain("1d20+5");
    expect(options[1]).toContain("1d8+3");
  });
});

describe("a chosen target out of range (attack-range)", () => {
  it("says so in words on the picker", () => {
    panel(room([LONGSWORD], [token("Goblin", 1, 0), token("Orc", 6, 0)]), "Orc");
    expect(screen.getByRole("combobox", { name: "Target" }).querySelector(".picker-status")!.textContent).toBe("Out of range");
  });
});

describe("the attack card's layout (attack-range)", () => {
  it("keeps the two rolls together, apart from the range, under a divider from the name", () => {
    const bow: AttackPreset = { name: "Longbow", toHit: d20, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 }, range: { kind: "ranged", distance: 80 } };
    panel(room([bow], [token("Goblin", 1, 0)]));
    const card = screen.getByRole("combobox", { name: "Aria's attack" });
    const summary = card.querySelector(".picker-summary")!;
    const [range, rolls] = [...summary.querySelector(".attack-stats")!.children];
    expect(range!.textContent).toContain("Ranged: 80 ft");
    expect(rolls!.className).toBe("attack-rolls");
    expect(rolls!.textContent).toContain("1d20+5");
    expect(rolls!.textContent).toContain("1d8+3");
  });
});

describe("one layout for every attack's line (attack-range)", () => {
  it("uses two rows only when the widest line doesn't fit", () => {
    expect(needsTwoRows(180, 200)).toBe(false);
    expect(needsTwoRows(200.4, 200)).toBe(false);
    expect(needsTwoRows(240, 200)).toBe(true);
    expect(needsTwoRows(240, 0)).toBe(false);
  });

  function withWidths(widths: { line: (el: HTMLElement) => number; card: number }, run: () => void) {
    // jsdom lays nothing out: these own properties shadow its zeros on Element, and go again after.
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get(this: HTMLElement) { return this.classList.contains("attack-stats") ? widths.line(this) : 0; } });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get(this: HTMLElement) { return this.classList.contains("picker-summary") ? widths.card : 0; } });
    try { run(); } finally {
      delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  }
  const lines = () => [...document.querySelectorAll(".picker .attack-stats")].map((el) => el.classList.contains("stacked"));
  const bow: AttackPreset = { name: "Longbow", toHit: d20, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 }, range: { kind: "ranged", distance: 120 } };

  it("stacks every attack, chosen or listed, when one of them is too wide", () => {
    // The longbow's line is the wide one; the longsword's would fit on its own.
    withWidths({ line: (el) => (el.textContent!.includes("120") ? 260 : 150), card: 200 }, () => {
      panel(room([LONGSWORD, bow], [token("Goblin", 1, 0)]));
      fireEvent.click(screen.getByRole("combobox", { name: "Aria's attack" }));
      expect(lines().length).toBeGreaterThanOrEqual(3);
      expect(lines().every(Boolean)).toBe(true);
    });
  });

  it("keeps every attack on one row when all of them fit", () => {
    withWidths({ line: () => 150, card: 200 }, () => {
      panel(room([LONGSWORD, bow], [token("Goblin", 1, 0)]));
      fireEvent.click(screen.getByRole("combobox", { name: "Aria's attack" }));
      expect(lines().some(Boolean)).toBe(false);
    });
  });
});
