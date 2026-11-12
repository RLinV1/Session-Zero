// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type EncounterSummary, type LibraryAsset } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import * as router from "../src/router";
import { EncounterCard } from "../src/pages/LibraryEncounters";
import { LibraryPage } from "../src/pages/LibraryPage";
import { EncounterPanel } from "../src/panels/EncounterPanel";
import { stubMapEditorEnvironment } from "./mapEditorHarness";

const map = (overrides: Partial<LibraryAsset> = {}): LibraryAsset => ({
  id: "m1", kind: "map", name: "Crypt", url: "/uploads/crypt.png", width: 800, height: 600, grid: DEFAULT_GRID,
  createdAt: "2026-10-01T00:00:00.000Z", ...overrides,
} as LibraryAsset);
const template = (overrides: Partial<EncounterSummary> = {}): EncounterSummary => ({
  id: "t1", name: "Crypt guards", mapName: "Crypt", mapAssetId: "m1", tokenCount: 2, fogCount: 1,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: new Date().toISOString(), ...overrides,
});

let navigate: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  stubMapEditorEnvironment();
  accountStore.setState({ status: "signedIn", account: { id: "u1", email: "gm@example.com", displayName: "Dana" } });
  navigate = vi.spyOn(router, "navigate").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  accountStore.setState({ status: "loading" });
});

describe("an encounter card's Edit (encounter-templates, ADR 0033)", () => {
  const renderCard = (encounter: EncounterSummary) =>
    render(<ul><EncounterCard encounter={encounter} onChanged={() => {}} onDeleted={() => {}} /></ul>);

  it("opens the template in a temporary room and shows when it was saved", async () => {
    const start = vi.spyOn(api.library.encounterEdits, "start").mockResolvedValue({ roomId: "temp-1", participantId: "p1" });
    renderCard(template());
    expect(screen.getByText("Saved just now")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/encounters/edit/temp-1"));
    expect(start).toHaveBeenCalledWith({ templateId: "t1", guestToken: expect.any(String) });
    expect(localStorage.getItem("vtt.credentials.temp-1")).toContain("temp-1");
  });

  it("offers no Edit once its map was deleted", () => {
    renderCard(template({ mapName: null, mapAssetId: null }));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
  });
});

describe("New encounter in the library (encounter-templates, ADR 0033)", () => {
  function mountLibrary(maps: LibraryAsset[]) {
    vi.spyOn(api.library, "list").mockResolvedValue(maps);
    vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
    render(<LibraryPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Encounters" }));
  }

  it("says how to make a template, and starts one on a chosen map with a grid", async () => {
    const start = vi.spyOn(api.library.encounterEdits, "start").mockResolvedValue({ roomId: "temp-2", participantId: "p2" });
    mountLibrary([map()]);
    expect(await screen.findByText(/Use New encounter/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New encounter" }));
    const picker = screen.getByRole("dialog", { name: "Choose a map for the encounter" });
    fireEvent.click(await within(picker).findByTitle("Crypt"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/encounters/edit/temp-2"));
    expect(start).toHaveBeenCalledWith({ mapAssetId: "m1", guestToken: expect.any(String) });
  });

  it("sets up the grid first for a map that has none", async () => {
    const start = vi.spyOn(api.library.encounterEdits, "start");
    mountLibrary([map({ grid: null })]);
    fireEvent.click(screen.getByRole("button", { name: "New encounter" }));
    const picker = screen.getByRole("dialog", { name: "Choose a map for the encounter" });
    fireEvent.click(await within(picker).findByTitle("Crypt"));
    expect(await screen.findByRole("dialog", { name: "Set up map" })).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });
});

describe("replace a template from a room (encounter-templates, ADR 0033)", () => {
  it("offers a per-row Replace for templates on this room's map, disables the others, and replaces at once (remove-save-confirmations)", async () => {
    const state = emptyRoomState("room-1");
    state.scene = { map: { url: "/uploads/crypt.png", width: 800, height: 600, assetId: "m1" }, grid: DEFAULT_GRID };
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([
      template(),
      template({ id: "t2", name: "Cave ambush", mapName: "Cave", mapAssetId: "m2" }),
    ]);
    const replaced = template({ tokenCount: 5 });
    const replaceFromRoom = vi.spyOn(api.library.encounters, "replaceFromRoom").mockResolvedValue(replaced);
    const connection = { command: vi.fn() } as never;
    render(<EncounterPanel connection={connection} state={state} />);

    const own = (await screen.findByRole("button", { name: "Replace Crypt guards" })) as HTMLButtonElement;
    expect(own.disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Replace Cave ambush" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(own);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(replaceFromRoom).toHaveBeenCalledWith("t1", "room-1"));
    expect(replaceFromRoom).toHaveBeenCalledTimes(1);
    const result = await screen.findByText(`Replaced encounter template "Crypt guards" with this room's board.`);
    expect(result.className).not.toContain("sr-only");
    await screen.findByText(/5 tokens/);
  });

  it("still asks before applying a template to the room", async () => {
    const state = emptyRoomState("room-1");
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([template()]);
    const connection = { command: vi.fn() } as never;
    render(<EncounterPanel connection={connection} state={state} />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Crypt guards" }));
    expect(screen.getByRole("dialog", { name: "Apply encounter template?" })).toBeTruthy();
    expect((connection as { command: ReturnType<typeof vi.fn> }).command).not.toHaveBeenCalled();
  });
});
