// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type EncounterSummary, type LibraryAsset } from "@vtt/shared";
import { api } from "../src/net/api";
import { EncounterPanel } from "../src/panels/EncounterPanel";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const conn = { command: vi.fn() } as never;
const saved: EncounterSummary = {
  id: "t1", name: "First", mapName: "Crypt", mapAssetId: "m1", tokenCount: 1, fogCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
};
const mapAsset = { id: "m1", kind: "map", name: "Crypt", url: "/uploads/crypt.png", width: 800, height: 600, grid: DEFAULT_GRID, createdAt: saved.createdAt } as LibraryAsset;

describe("Encounter templates with none saved yet (FR-GM-13)", () => {
  it("lets a brand-new account name and save its first template, and shows a preview afterwards", async () => {
    const state = emptyRoomState("r1");
    state.scene = { map: { url: "/uploads/crypt.png", width: 800, height: 600, assetId: "m1" }, grid: DEFAULT_GRID };
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
    vi.spyOn(api.library, "list").mockResolvedValue([mapAsset]);
    const create = vi.spyOn(api.library.encounters, "save").mockResolvedValue(saved);
    render(<EncounterPanel connection={conn} state={state} />);

    expect(await screen.findByText(/No templates yet/)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
    const dialog = screen.getByRole("dialog", { name: "Save encounter template" });
    const button = within(dialog).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Template name"), { target: { value: "First" } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(create).toHaveBeenCalledWith({ roomId: "r1", name: "First" }));
    expect(await screen.findByRole("button", { name: "Apply First" })).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".encounter-row img")).not.toBeNull());
  });

  it("says why Save is off when the room has no map yet, instead of failing on click", async () => {
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
    vi.spyOn(api.library, "list").mockResolvedValue([]);
    render(<EncounterPanel connection={conn} state={emptyRoomState("r1")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save as template" }));
    expect(screen.getByText(/Add a map from your library/)).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "Save encounter template" });
    fireEvent.change(within(dialog).getByLabelText("Template name"), { target: { value: "X" } });
    expect((within(dialog).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
