// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type AttackPreset, type Token, type TokenUpdate } from "@vtt/shared";
import { AddTokenButton } from "../src/panels/AddToken";
import { TokenEditor } from "../src/panels/TokenRoster";

const scimitar: AttackPreset = { name: "Scimitar", toHit: { count: 1, sides: 20, modifier: 4 }, damage: { count: 1, sides: 6, modifier: 2 } };
const bite: AttackPreset = { name: "Bite", toHit: null, damage: { count: 1, sides: 6, modifier: 1 } };

const goblin: Token = {
  id: "g1", name: "Goblin", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: ["alice"], hidden: false, stats: { hp: 7, maxHp: 7, ac: 15 }, conditions: [], attacks: [scimitar, bite],
};

beforeEach(() => {
  // jsdom has no modal dialogs; open and close are all these forms need.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);

function editor(isGm: boolean, onSave = vi.fn(async (_changes: TokenUpdate) => {})) {
  render(<TokenEditor token={goblin} roomToken="room" isGm={isGm} players={[]} departedOwner={null} error={null} onSave={onSave} onDelete={() => {}} />);
  return onSave;
}

const attacksSection = () => screen.getByText("Attacks", { selector: "summary" }).closest("details") as HTMLDetailsElement;

async function saveEditor() {
  // Save applies at once (token-editor): no confirmation step.
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await Promise.resolve();
}

describe("Token editor: Attacks (shared-token-attacks, FR-TAC-07)", () => {
  it.each([["the GM", true], ["an owner", false]])("is a closed section with the count, for %s", (_who, isGm) => {
    editor(isGm);
    const section = attacksSection();
    expect(section.open).toBe(false);
    expect(section.querySelector("summary")!.textContent).toBe("Attacks2");
    expect(within(section).getByText(/Scimitar/)).toBeTruthy();
  });

  it("does not send attacks when only something else changed", async () => {
    const onSave = editor(true);
    fireEvent.change(screen.getByRole("spinbutton", { name: "HP" }), { target: { value: "4" } });
    await saveEditor();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty("attacks");
  });

  it("sends the new list once an attack is removed", async () => {
    const onSave = editor(false);
    fireEvent.click(within(attacksSection()).getAllByRole("button", { name: "Edit" })[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(attacksSection().querySelector("summary")!.textContent).toBe("Attacks1");
    await saveEditor();
    expect(onSave.mock.calls[0]![0]).toMatchObject({ attacks: [scimitar] });
  });
});

describe("New Token: Attacks (shared-token-attacks)", () => {
  it("is a closed section, and an attack added there goes with the token", async () => {
    const onPlace = vi.fn();
    render(<AddTokenButton state={emptyRoomState("r1")} token="t" onPlace={onPlace} />);
    fireEvent.click(screen.getByRole("button", { name: "New Token" }));
    const section = attacksSection();
    expect(section.open).toBe(false);
    expect(section.querySelector("summary")!.textContent).toBe("Attacksnone");

    fireEvent.click(within(section).getByRole("button", { name: "Add attack" }));
    const form = await screen.findByRole("form", { name: "Add attack" });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Bite" } });
    // To hit and Damage both start ticked; Bite is damage only.
    fireEvent.click(within(form).getByLabelText("To hit"));
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(attacksSection().querySelector("summary")!.textContent).toBe("Attacks1");

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Wolf" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose a square" }));
    // The draft goes to the board once the dialog has closed.
    const dialog = document.querySelector("dialog");
    dialog?.dispatchEvent(new Event("close"));
    await vi.waitFor(() => expect(onPlace).toHaveBeenCalled());
    expect(onPlace.mock.calls[0]![0].attacks).toEqual([{ name: "Bite", toHit: null, damage: { count: 1, sides: 6, modifier: 0 } }]);
  });
});
