// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type CommandInput, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { useState } from "react";
import { InitiativeTracker } from "../src/panels/InitiativeTracker";
import type { GroupSelection } from "../src/panels/GroupSelection";
import { ROLL_ANSWER_MS } from "../src/panels/useInitiativeRoll";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

const token = (id: string, name: string): Token => ({
  id, name, position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
});
const gm = { id: "g1", role: "gm", displayName: "Mara" } as Participant;

function room(activeIndex: number, round: number): RoomState {
  return {
    ...emptyRoomState("room"),
    tokens: { aria: token("aria", "Aria"), goblin: token("goblin", "Goblin") },
    initiative: { order: ["aria", "goblin"], activeIndex, round },
  };
}

/** The GM's selection as RoomPage keeps it: local state the tracker's checkboxes edit. */
function Selecting({ connection, state }: { connection: RoomConnection; state: RoomState }) {
  const [ids, setIds] = useState<string[]>([]);
  const selection: GroupSelection = {
    tokenIds: ids.filter((id) => state.tokens[id]),
    toggle: (id) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
    remove: (id) => setIds((cur) => cur.filter((x) => x !== id)),
    clear: () => setIds([]),
    fromTemplate: () => {},
  };
  return <InitiativeTracker connection={connection} state={state} you={gm} onFocusToken={() => {}} selection={selection} />;
}

function setupSelecting(state: RoomState) {
  const sent: CommandInput[] = [];
  const connection = { command: vi.fn(async (c: CommandInput) => { sent.push(c); return { ok: true }; }) } as unknown as RoomConnection;
  render(<Selecting connection={connection} state={state} />);
  return sent;
}

function setup(state: RoomState) {
  const sent: CommandInput[] = [];
  const connection = { command: vi.fn(async (c: CommandInput) => { sent.push(c); return { ok: true }; }) } as unknown as RoomConnection;
  render(<InitiativeTracker connection={connection} state={state} you={gm} onFocusToken={() => {}} />);
  return sent;
}

describe("GM initiative controls (FR-GM-21, ADR 0060)", () => {
  it("steps the turn back, but not on round 1's first turn", () => {
    expect((screen.queryByRole("button", { name: "Previous turn" }) as HTMLButtonElement | null)).toBeNull();
    setup(room(0, 1));
    expect((screen.getByRole("button", { name: "Previous turn" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const sent = setup(room(1, 1));
    fireEvent.click(screen.getByRole("button", { name: "Previous turn" }));
    expect(sent).toEqual([{ type: "initiative.previous" }]);
  });

  it("ends the encounter only after confirming, with Cancel focused first", async () => {
    const sent = setup(room(1, 2));
    fireEvent.click(screen.getByRole("button", { name: "End encounter" }));
    const dialog = screen.getByRole("dialog", { name: "End the encounter?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(sent).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "End encounter" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "End the encounter?" })).getByRole("button", { name: "End encounter" }));
    await waitFor(() => expect(sent).toEqual([{ type: "initiative.end" }]));
  });
});

/** A GM-only group roll as the server would log it, one entry per token. */
function groupRoll(id: string, totals: Record<string, number>, names: Record<string, string>) {
  return {
    kind: "group" as const, id, expression: "1d20", label: "Initiative", byParticipantId: gm.id, visibility: "gm" as const,
    entries: Object.entries(totals).map(([tokenId, total]) => ({ tokenId, name: names[tokenId] ?? tokenId, hidden: false, dice: [total], total })),
  };
}

function lobby(extra: Record<string, Token> = {}): RoomState {
  return {
    ...emptyRoomState("room"),
    tokens: { aria: token("aria", "Aria"), goblin: token("goblin", "Goblin"), wolf: token("wolf", "Wolf"), ...extra },
    initiative: null,
  };
}

function live(state: RoomState, reply: (c: CommandInput) => { ok: boolean; message?: string } = () => ({ ok: true })) {
  const sent: CommandInput[] = [];
  const connection = { command: vi.fn(async (c: CommandInput) => { sent.push(c); return reply(c); }) } as unknown as RoomConnection;
  const view = render(<InitiativeTracker connection={connection} state={state} you={gm} onFocusToken={() => {}} />);
  const update = (next: RoomState) => view.rerender(<InitiativeTracker connection={connection} state={next} you={gm} onFocusToken={() => {}} />);
  return { sent, update };
}
const field = (name: string) => screen.getByRole("spinbutton", { name: `Initiative for ${name}` }) as HTMLInputElement;

describe("mass initiative roll in Start encounter (initiative-mass-roll, ADR 0061)", () => {
  it("rolls GM-only for the checked tokens only, then fills their fields and keeps each roll beside its score", async () => {
    const state = lobby();
    const { sent, update } = live(state);
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Wolf" }));
    fireEvent.click(screen.getByRole("button", { name: /^Roll initiative for 2/ }));
    await waitFor(() => expect(sent).toEqual([
      { type: "dice.rollGroup", tokenIds: ["aria", "goblin"], expression: "1d20", visibility: "gm", label: "Initiative" },
    ]));

    update({ ...state, rolls: [groupRoll("r1", { aria: 14, goblin: 7 }, { aria: "Aria", goblin: "Goblin" })] });
    await waitFor(() => expect(field("Aria").value).toBe("14"));
    expect(field("Goblin").value).toBe("7");
    expect(field("Wolf").value).toBe("");
    expect(screen.getByText(/Goblin rolled 7/)).toBeTruthy();

    // Editing the score leaves the roll shown for reference.
    fireEvent.change(field("Goblin"), { target: { value: "9" } });
    expect(screen.getByText(/Goblin rolled 7/)).toBeTruthy();
  });

  it("replaces only the re-rolled tokens' results, and dims an unchecked row's", async () => {
    const state = lobby();
    const { sent, update } = live(state);
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    fireEvent.click(screen.getByRole("button", { name: /^Roll initiative for 3/ }));
    const first = { ...state, rolls: [groupRoll("r1", { aria: 14, goblin: 7, wolf: 3 }, {})] };
    update(first);
    await waitFor(() => expect(field("Goblin").value).toBe("7"));

    fireEvent.click(screen.getByRole("checkbox", { name: "Include Aria" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Wolf" }));
    fireEvent.click(screen.getByRole("button", { name: /^Roll initiative for 1/ }));
    await waitFor(() => expect(sent).toHaveLength(2));
    update({ ...first, rolls: [...first.rolls, groupRoll("r2", { goblin: 15 }, {})] });
    await waitFor(() => expect(field("Goblin").value).toBe("15"));
    expect(screen.getByText(/Goblin rolled 15/)).toBeTruthy();
    expect(screen.getByText(/Aria rolled 14/)).toBeTruthy();
    expect(screen.getByText(/Aria rolled 14/).closest("li")?.className).toBe("init-left-out");
  });

  it("splits more than 30 checked tokens into two rolls", async () => {
    const many = Object.fromEntries(Array.from({ length: 37 }, (_, i) => [`t${i}`, token(`t${i}`, `Token ${i}`)]));
    const { sent } = live(lobby(many));
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    fireEvent.click(screen.getByRole("button", { name: /^Roll initiative for 40/ }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent.map((c) => (c as { tokenIds: string[] }).tokenIds.length)).toEqual([30, 10]);
  });

  it("builds the formula in the dice builder, with no text field, and rolls 1d20 + 2", async () => {
    const { sent } = live(lobby());
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    const dialog = screen.getByRole("dialog", { name: "Start encounter" });
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    within(dialog).getByRole("group", { name: "Initiative dice" });
    fireEvent.click(within(dialog).getByRole("button", { name: "+ Modifier" }));
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Modifier" }), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Roll initiative for 3/ }));
    await waitFor(() => expect(sent[0]).toMatchObject({ type: "dice.rollGroup", expression: "1d20+2" }));
  });

  it("shows a refused roll and changes no field", async () => {
    const { sent } = live(lobby(), () => ({ ok: false, message: "That token is gone" }));
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    fireEvent.click(screen.getByRole("button", { name: /^Roll initiative/ }));
    await screen.findByText("That token is gone");
    expect(sent).toHaveLength(1);
    expect(field("Aria").value).toBe("");
  });

  it("gives up on a roll that never shows up, so Roll works again", async () => {
    vi.useFakeTimers();
    try {
      live(lobby());
      fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
      const roll = () => screen.getByRole("button", { name: /^Roll initiative/ }) as HTMLButtonElement;
      fireEvent.click(roll());
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(roll().disabled).toBe(true);
      await act(() => vi.advanceTimersByTimeAsync(ROLL_ANSWER_MS));
      expect(roll().disabled).toBe(false);
      expect(screen.getByText("The roll didn't come back. Try again.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the shown rolls when the dialog is closed and reopened", async () => {
    const state = lobby();
    const { update } = live(state);
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    fireEvent.click(screen.getByRole("button", { name: /^Roll initiative/ }));
    update({ ...state, rolls: [groupRoll("r1", { aria: 14, goblin: 7, wolf: 3 }, {})] });
    await screen.findByText(/aria rolled 14|Aria rolled 14/);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    expect(screen.queryByText(/rolled 14/)).toBeNull();
  });
});

describe("editing the turn order mid-encounter (FR-GM-21, ADR 0065)", () => {
  it("removes the ticked tokens with one button, in turn order, and asks before removing them all (ADR 0074)", async () => {
    const sent = setupSelecting(room(0, 1));
    expect(screen.queryByRole("button", { name: /Remove \d+ from encounter/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Goblin" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 1 from encounter" }));
    await waitFor(() => expect(sent).toEqual([{ type: "initiative.remove", tokenId: "goblin" }]));
    sent.length = 0;

    // Both ticked is the whole order: removing them ends the encounter, so it asks first.
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Aria" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 2 from encounter" }));
    const dialog = screen.getByRole("dialog", { name: "Remove every token?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(sent).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Remove 2 from encounter" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove every token?" })).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(sent).toEqual([{ type: "initiative.removeSeveral", tokenIds: ["aria", "goblin"] }]));
  });

  it("asks before removing the only token left", async () => {
    const lone: RoomState = { ...room(0, 1), initiative: { order: ["aria"], activeIndex: 0, round: 1 } };
    const sent = setupSelecting(lone);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Aria" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 1 from encounter" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove the last token?" })).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(sent).toEqual([{ type: "initiative.remove", tokenId: "aria" }]));
  });

  it("clears the selection, and has no Remove on each row", () => {
    setupSelecting(room(0, 1));
    expect(screen.queryByRole("button", { name: /from the turn order/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Goblin" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect((screen.getByRole("checkbox", { name: "Select Goblin" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("button", { name: /from encounter/ })).toBeNull();
  });

  it("keeps a Remove on a row whose token is gone, which can't be selected", async () => {
    const legacy: RoomState = { ...room(0, 1), initiative: { order: ["aria", "gone", "goblin"], activeIndex: 0, round: 1 } };
    const sent = setupSelecting(legacy);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove (removed) from the turn order" }));
    await waitFor(() => expect(sent).toEqual([{ type: "initiative.remove", tokenId: "gone" }]));
  });

  it("shows players no Remove or Add to encounter", () => {
    const connection = { command: vi.fn() } as unknown as RoomConnection;
    render(<InitiativeTracker connection={connection} state={room(0, 1)} you={{ id: "p1", role: "player", displayName: "Alice" } as Participant} onFocusToken={() => {}} />);
    expect(screen.queryByRole("button", { name: /from the turn order/ })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add to encounter" })).toBeNull();
  });

  it("lists only the tokens outside the order, none checked", () => {
    const state: RoomState = { ...room(0, 1), tokens: { ...room(0, 1).tokens, orc: token("orc", "Orc"), bat: token("bat", "Bat") } };
    live(state);
    fireEvent.click(screen.getByRole("button", { name: "Add to encounter" }));
    const dialog = screen.getByRole("dialog", { name: "Add to encounter" });
    const boxes = within(dialog).getAllByRole("checkbox", { name: /^Include / }) as HTMLInputElement[];
    expect(boxes.map((b) => b.getAttribute("aria-label"))).toEqual(["Include Orc", "Include Bat"]);
    expect(boxes.every((b) => !b.checked)).toBe(true);
    expect((within(dialog).getByRole("button", { name: /^Roll initiative for 0/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds a group's rolled tokens in one command, and shows the server's refusal", async () => {
    const tokens = { ...room(0, 1).tokens, orc1: token("orc1", "Orc 1"), orc2: token("orc2", "Orc 2"), bat: token("bat", "Bat") };
    const state: RoomState = {
      ...room(0, 1),
      tokens,
      groups: { orcs: { id: "orcs", name: "Orcs" }, all: { id: "all", name: "Everyone" } },
      tokenGroups: { orc1: "orcs", orc2: "orcs", aria: "orcs" },
    };
    let refuse = false;
    const { sent, update } = live(state, () => (refuse ? { ok: false, message: "Orc 1 is already in the turn order" } : { ok: true }));
    fireEvent.click(screen.getByRole("button", { name: "Add to encounter" }));
    const dialog = () => screen.getByRole("dialog", { name: "Add to encounter" });
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: "Orcs" }));
    const checked = (name: string) => (within(dialog()).getByRole("checkbox", { name: `Include ${name}` }) as HTMLInputElement).checked;
    expect([checked("Orc 1"), checked("Orc 2"), checked("Bat")]).toEqual([true, true, false]);
    fireEvent.click(within(dialog()).getByRole("button", { name: /^Roll initiative for 2/ }));
    await waitFor(() => expect(sent[0]).toMatchObject({ type: "dice.rollGroup", tokenIds: ["orc1", "orc2"], visibility: "gm" }));
    update({ ...state, rolls: [groupRoll("r1", { orc1: 16, orc2: 4 }, {})] });
    await waitFor(() => expect(field("Orc 1").value).toBe("16"));
    expect(field("Orc 2").value).toBe("4");
    refuse = true;
    fireEvent.click(within(dialog()).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(sent[1]).toEqual({ type: "initiative.add", entries: [{ tokenId: "orc1", score: 16 }, { tokenId: "orc2", score: 4 }] }));
    await screen.findByText("Orc 1 is already in the turn order");
  });

  it("refuses an empty or bad score the way Start encounter does", async () => {
    const state: RoomState = { ...room(0, 1), tokens: { ...room(0, 1).tokens, orc: token("orc", "Orc") } };
    const { sent } = live(state);
    fireEvent.click(screen.getByRole("button", { name: "Add to encounter" }));
    const dialog = screen.getByRole("dialog", { name: "Add to encounter" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await within(dialog).findByText("Give at least one included token an initiative score");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include Orc" }));
    fireEvent.change(field("Orc"), { target: { value: "1000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await within(dialog).findByText(/Initiative must be a whole number from -99 to 999: Orc/);
    expect(sent).toEqual([]);
  });
});

describe("Players' tokens filter (token-groups, ADR 0065)", () => {
  const players = (): RoomState => ({
    ...lobby(),
    participants: { g1: gm, p1: { id: "p1", role: "player", displayName: "Alice" } as Participant },
    tokens: { ...lobby().tokens, aria: { ...token("aria", "Aria"), ownerIds: ["p1"] } },
    groups: { gate: { id: "gate", name: "Gate guards" } },
    tokenGroups: { goblin: "gate" },
  });
  const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

  it("in Start encounter, a group ticks only its own tokens and Players' tokens adds the players'", () => {
    live(players());
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    const included = () => [box("Include Aria"), box("Include Goblin"), box("Include Wolf")].map((b) => b.checked);
    expect(box("Players' tokens").checked).toBe(false);
    expect(included()).toEqual([true, true, true]);
    fireEvent.click(box("Gate guards"));
    expect(box("Players' tokens").checked).toBe(false);
    expect(included()).toEqual([false, true, false]);
    fireEvent.click(box("Players' tokens"));
    expect(included()).toEqual([true, true, false]);
  });

  it("puts the dice builder below the group filters and above the tokens", () => {
    live(players());
    fireEvent.click(screen.getByRole("button", { name: "Start encounter" }));
    const dialog = screen.getByRole("dialog", { name: "Start encounter" });
    const filters = within(dialog).getByRole("group", { name: "Start from groups" });
    const dice = within(dialog).getByRole("group", { name: "Initiative dice" });
    const firstRow = within(dialog).getByRole("checkbox", { name: "Include Aria" });
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(filters, dice)).toBe(true);
    expect(follows(dice, firstRow)).toBe(true);
  });

  it("in Add to encounter, a group ticks only its own tokens", () => {
    const state: RoomState = { ...players(), initiative: { order: ["wolf"], activeIndex: 0, round: 1 } };
    live(state);
    fireEvent.click(screen.getByRole("button", { name: "Add to encounter" }));
    fireEvent.click(box("Gate guards"));
    expect(box("Players' tokens").checked).toBe(false);
    expect([box("Include Aria"), box("Include Goblin")].map((b) => b.checked)).toEqual([false, true]);
    fireEvent.click(box("Players' tokens"));
    expect([box("Include Aria"), box("Include Goblin")].map((b) => b.checked)).toEqual([true, true]);
  });
});

/** Eleven combatants, as in a real fight: Oswin first, then Maren, the moths and the rest. */
function crowd(activeIndex: number, round = 1): RoomState {
  const names = ["Oswin", "Maren", "Moth 4", "Pip", "Moth 2", "Moth 1", "Party Oil", "Moth 3", "Old Wick", "Hush Clock", "Ysolde"];
  const tokens = Object.fromEntries(names.map((name, i) => [`t${i}`, token(`t${i}`, name)]));
  return { ...emptyRoomState("room"), tokens, initiative: { order: names.map((_, i) => `t${i}`), activeIndex, round } };
}
const rowNames = () => screen.getAllByRole("listitem").filter((li) => li.classList.contains("init-entry")).map((li) => li.querySelector(".init-name")!.textContent);

describe("compact turn order (FR-GM-21, gm-bulk-select)", () => {
  it("shows three rows from the active turn and folds the rest into one row that says how many", () => {
    setup(crowd(0));
    expect(rowNames()).toEqual(["Oswin", "Maren", "Moth 4"]);
    const more = screen.getByRole("button", { name: "+8 more" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(more.getAttribute("aria-controls")).toBe("init-order");
  });

  it("unfolds and folds again from the keyboard's button, the active turn first throughout", () => {
    setup(crowd(0));
    fireEvent.click(screen.getByRole("button", { name: "+8 more" }));
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer.getAttribute("aria-expanded")).toBe("true");
    expect(rowNames()).toHaveLength(11);
    expect(rowNames()[0]).toBe("Oswin");
    fireEvent.click(fewer);
    expect(rowNames()).toEqual(["Oswin", "Maren", "Moth 4"]);
    expect(screen.getByRole("button", { name: "+8 more" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("starts from the active turn wherever it is, wrapping into the next round when unfolded", () => {
    setup(crowd(9, 2));
    // Hush Clock (10th) has the turn: it, Ysolde, then Oswin opening round 3.
    expect(rowNames()).toEqual(["Hush Clock", "Ysolde", "Oswin"]);
    const current = screen.getByRole("button", { current: true });
    expect(current.textContent).toContain("Hush Clock");
    expect(current.textContent).toContain("▶");
    // The row that opens the next round says so, to sighted readers and screen readers alike.
    expect(screen.getByText("Round 3", { selector: ".init-round-break" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Oswin\W+Round 3/ })).toBeTruthy();
  });

  it("keeps each row's place in the order beside its name", () => {
    setup(crowd(4));
    const turns = screen.getAllByRole("listitem").filter((li) => li.classList.contains("init-entry")).map((li) => li.querySelector(".init-turn")!.textContent);
    expect(turns).toEqual(["▶", "6", "7"]);
  });

  it("doesn't fold four rows: +1 more would take the row it hides", () => {
    const four: RoomState = { ...crowd(0), initiative: { order: ["t0", "t1", "t2", "t3"], activeIndex: 1, round: 1 } };
    setup(four);
    expect(rowNames()).toEqual(["Maren", "Moth 4", "Pip", "Oswin"]);
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("says how many selected tokens are folded away", () => {
    setupSelecting(crowd(0));
    fireEvent.click(screen.getByRole("button", { name: "+8 more" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Ysolde" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Pip" }));
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getByRole("button", { name: /\+8 more/ }).textContent).toContain("2 selected");
    expect(screen.getByRole("button", { name: "Remove 2 from encounter" })).toBeTruthy();
  });

  it("folds the players' list the same way", () => {
    const connection = { command: vi.fn() } as unknown as RoomConnection;
    render(<InitiativeTracker connection={connection} state={crowd(0)} you={{ id: "p1", role: "player", displayName: "Alice" } as Participant} onFocusToken={() => {}} />);
    expect(rowNames()).toEqual(["Oswin", "Maren", "Moth 4"]);
    expect(screen.getByRole("button", { name: "+8 more" })).toBeTruthy();
  });
});
