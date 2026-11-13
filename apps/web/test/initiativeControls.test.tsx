// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type CommandInput, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { InitiativeTracker } from "../src/panels/InitiativeTracker";
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
  it("removes a token, and asks before removing the last one", async () => {
    const sent = setup(room(0, 1));
    fireEvent.click(screen.getByRole("button", { name: "Remove Goblin from the turn order" }));
    await waitFor(() => expect(sent).toEqual([{ type: "initiative.remove", tokenId: "goblin" }]));
    cleanup();

    const lone: RoomState = { ...room(0, 1), initiative: { order: ["aria"], activeIndex: 0, round: 1 } };
    const sentLone = setup(lone);
    fireEvent.click(screen.getByRole("button", { name: "Remove Aria from the turn order" }));
    const dialog = screen.getByRole("dialog", { name: "Remove the last token?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(sentLone).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Aria from the turn order" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove the last token?" })).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(sentLone).toEqual([{ type: "initiative.remove", tokenId: "aria" }]));
  });

  it("shows players no Remove or Add to encounter", () => {
    const connection = { command: vi.fn() } as unknown as RoomConnection;
    render(<InitiativeTracker connection={connection} state={room(0, 1)} you={{ id: "p1", role: "player", displayName: "Alice" } as Participant} onFocusToken={() => {}} />);
    expect(screen.queryByRole("button", { name: /from the turn order/ })).toBeNull();
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
