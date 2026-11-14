// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type EncounterSummary, type LibraryAsset, type Participant, type RoomState, type Token } from "@vtt/shared";
import { api } from "../src/net/api";
import type { RoomConnection } from "../src/net/roomConnection";
import { placementCommand, stagedGhost } from "../src/board/placement";
import { CarryContext } from "../src/panels/CarryContext";
import { EncounterPanel } from "../src/panels/EncounterPanel";
import { ScenePreparationContext } from "../src/panels/ScenePreparationContext";
import { SceneActivationNotice } from "../src/panels/ScenesPanel";
import { StagedWaitingList, WaitingTray } from "../src/panels/StagedTokens";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const gm: Participant = { id: "p-gm", role: "gm", displayName: "GM" };
const alice: Participant = { id: "p-alice", role: "player", displayName: "Alice" };
const bob: Participant = { id: "p-bob", role: "player", displayName: "Bob" };

const token = (id: string, name: string, ownerIds: string[] = [], extra: Partial<Token> = {}): Token => ({
  id, name, position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#22aa44", imageUrl: null, ownerIds, hidden: false,
  stats: { hp: null, maxHp: null, ac: null }, conditions: [], ...extra,
});

/** A live tavern with Aria (Alice's), Borin (Bob's), an ownerless barkeep, and Wren already waiting. */
function tavern(): RoomState {
  const state = emptyRoomState("r1");
  state.participants = { [gm.id]: gm, [alice.id]: alice, [bob.id]: bob };
  state.activeSceneId = "tavern";
  state.sceneNames = { tavern: "Tavern", crypt: "Crypt" };
  state.tokens = { aria: token("aria", "Aria", [alice.id]), borin: token("borin", "Borin", [bob.id]), barkeep: token("barkeep", "Barkeep") };
  state.staged = { wren: token("wren", "Wren", [alice.id]) };
  return state;
}

const checkbox = (name: string) => screen.getByRole("checkbox", { name: new RegExp(`^${name}`) }) as HTMLInputElement;

describe("Activate carries the party (FR-GM-25, ADR 0068)", () => {
  function activate(withCarry = true) {
    const live = tavern();
    const crypt = { ...emptyRoomState("r1"), participants: live.participants, activeSceneId: "crypt", sceneNames: live.sceneNames };
    const command = vi.fn().mockResolvedValue({ ok: true });
    const carried = vi.fn();
    const notice = (
      <ScenePreparationContext.Provider value={{ activeId: "tavern", preparing: true, preview: vi.fn(), live }}>
        <SceneActivationNotice state={crypt} connection={{ command } as unknown as RoomConnection} />
      </ScenePreparationContext.Provider>
    );
    render(withCarry ? <CarryContext.Provider value={{ carried }}>{notice}</CarryContext.Provider> : notice);
    return { command, carried };
  }

  it("lists the live board's tokens, ticking those a player owns and those still waiting", () => {
    activate();
    expect(screen.getByRole("group", { name: "Carry to the new board" })).toBeTruthy();
    expect(checkbox("Aria").checked).toBe(true);
    expect(checkbox("Borin").checked).toBe(true);
    expect(checkbox("Barkeep").checked).toBe(false);
    expect(checkbox("Wren").checked).toBe(true);
  });

  it("switches carrying the ticked tokens, then asks the room to place them", async () => {
    const { command, carried } = activate();
    fireEvent.click(checkbox("Borin"));
    fireEvent.click(checkbox("Barkeep"));
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.switch", sceneId: "crypt", carryTokenIds: ["aria", "barkeep", "wren"] }));
    await waitFor(() => expect(carried).toHaveBeenCalledWith(["aria", "barkeep", "wren"]));
  });

  it("switches carrying nothing when everything is unticked", async () => {
    const { command, carried } = activate();
    for (const name of ["Aria", "Borin", "Wren"]) fireEvent.click(checkbox(name));
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.switch", sceneId: "crypt" }));
    expect(carried).not.toHaveBeenCalled();
  });

  it("lists player tokens first, and the rest under Other tokens", () => {
    activate();
    const group = screen.getByRole("group", { name: "Carry to the new board" });
    const others = group.querySelector("details.carry-others") as HTMLDetailsElement;
    expect(others.querySelector("summary")!.textContent).toBe("Other tokens (1)");
    expect(others.open).toBe(false);
    expect(within(others).getByText("Barkeep")).toBeTruthy();
    const top = group.querySelector(":scope > ul")!;
    expect(Array.from(top.querySelectorAll("label > span:first-of-type")).map((s) => s.textContent)).toEqual(["Aria", "Borin", "Wren"]);
  });

  it("opens Other tokens by itself when one of them is ticked", () => {
    activate();
    const others = () => screen.getByRole("group", { name: "Carry to the new board" }).querySelector("details.carry-others") as HTMLDetailsElement;
    fireEvent.click(screen.getByText("Other tokens (1)"));
    fireEvent.click(checkbox("Barkeep"));
    expect(others().open).toBe(true);
  });

  it("offers no checklist where carrying isn't available", () => {
    activate(false);
    expect(screen.queryByRole("group", { name: "Carry to the new board" })).toBeNull();
  });
});

describe("Applying a template carries the party (FR-GM-13, ADR 0068)", () => {
  const template: EncounterSummary = {
    id: "t1", name: "Goblins", mapName: "Crypt", mapAssetId: "m1", tokenCount: 1, fogCount: 0,
    createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z",
  };
  const mapAsset = { id: "m1", kind: "map", name: "Crypt", url: "/uploads/crypt.png", width: 700, height: 700, grid: DEFAULT_GRID, createdAt: template.createdAt } as LibraryAsset;

  function panel(preparing: boolean) {
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([template]);
    vi.spyOn(api.library, "list").mockResolvedValue([mapAsset]);
    vi.spyOn(api.library.encounters, "preview").mockReturnValue(new Promise(() => {}));
    const command = vi.fn().mockResolvedValue({ ok: true });
    const carried = vi.fn();
    render(
      <ScenePreparationContext.Provider value={{ activeId: "tavern", preparing, preview: vi.fn() }}>
        <CarryContext.Provider value={{ carried }}>
          <EncounterPanel connection={{ command } as unknown as RoomConnection} state={tavern()} />
        </CarryContext.Provider>
      </ScenePreparationContext.Provider>,
    );
    return { command, carried };
  }

  it("asks in the confirmation and applies with the ticked tokens", async () => {
    const { command, carried } = panel(false);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Goblins" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("group", { name: "Carry to the new board" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /^Wren/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^Apply/ }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "encounter.apply", templateId: "t1", carryTokenIds: ["aria", "borin"] }));
    await waitFor(() => expect(carried).toHaveBeenCalledWith(["aria", "borin"]));
  });

  it("offers no checklist when applying to a private scene", async () => {
    const { command } = panel(true);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Goblins" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("group", { name: "Carry to the new board" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Apply/ }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "encounter.apply", templateId: "t1" }));
  });
});

describe("The GM's waiting list (ADR 0068)", () => {
  function list(state = tavern()) {
    state.staged = { ...state.staged, kit: token("kit", "Kit", [bob.id], { hidden: true }) };
    const onPlace = vi.fn();
    const view = render(<StagedWaitingList state={state} onPlace={onPlace} />);
    return { onPlace, view, state };
  }

  it("lists every staged token with its owners, ticked, and places the ticked ones", () => {
    const { onPlace } = list();
    const section = screen.getByRole("region", { name: "Waiting to be placed" });
    expect(within(section).getByText("Wren")).toBeTruthy();
    expect(within(section).getByText("hidden")).toBeTruthy();
    expect(checkbox("Wren").checked).toBe(true);
    fireEvent.click(checkbox("Kit"));
    fireEvent.click(screen.getByRole("button", { name: "Place selected" }));
    expect(onPlace).toHaveBeenCalledWith(["wren"]);
  });

  it("can't place with nothing ticked", () => {
    list();
    fireEvent.click(checkbox("Wren"));
    fireEvent.click(checkbox("Kit"));
    expect((screen.getByRole("button", { name: "Place selected" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is gone when nothing is waiting", () => {
    const state = tavern();
    state.staged = {};
    render(<StagedWaitingList state={state} onPlace={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Waiting to be placed" })).toBeNull();
  });
});

describe("A player's waiting tray (ADR 0068)", () => {
  it("shows the player's own waiting tokens, and nothing for someone with none", () => {
    render(<WaitingTray state={tavern()} you={alice} />);
    expect(screen.getByText("Waiting for the GM to place you")).toBeTruthy();
    expect(screen.getByText("Wren")).toBeTruthy();
    cleanup();
    render(<WaitingTray state={tavern()} you={bob} />);
    expect(screen.queryByText("Wren")).toBeNull();
  });
});

describe("Placing carried tokens from the board (ADR 0068)", () => {
  it("sends one placement for the chosen tokens on the scene they wait in", () => {
    const ghost = stagedGhost(tavern(), ["wren"])!;
    expect(placementCommand({ kind: "staged", tokenIds: ["wren"], sceneId: "tavern", ghost }, { x: 105, y: 105 }))
      .toEqual({ type: "token.placeStaged", origin: { x: 105, y: 105 }, tokenIds: ["wren"], expectedSceneId: "tavern" });
  });

  it("draws the largest waiting token under the pointer, named for the group", () => {
    const state = tavern();
    state.staged = { ...state.staged, ogre: token("ogre", "Ogre", [], { size: 2 }) };
    expect(stagedGhost(state, ["wren", "ogre"])).toMatchObject({ name: "Ogre and 1 more", size: 2 });
    expect(stagedGhost(state, ["aria"])).toBeNull();
  });
});
