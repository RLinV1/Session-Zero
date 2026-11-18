// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BulkUpdateCreaturesRequest, LibraryCreature } from "@vtt/shared";

// jsdom has no scrollIntoView, which the sort Picker uses to follow its highlighted option.
Element.prototype.scrollIntoView = vi.fn();

vi.mock("../src/net/api", () => ({
  api: { library: { moveToFolder: vi.fn(), creatures: { updateMany: vi.fn(), removeMany: vi.fn(), remove: vi.fn() } } },
  // The creature form and cards pull in the account store, which registers for sign-out on load.
  whenSignedOut: vi.fn(),
}));
import { api } from "../src/net/api";
import { CreaturesTab } from "../src/pages/LibraryCreaturesTab";
import { ALL_FOLDERS, type FolderView } from "../src/pages/LibraryFolders";

const creature = (id: string, name: string, folder: string | null, createdAt: string): LibraryCreature => ({
  id, name, folder, createdAt, size: 1, maxHp: 10, ac: 8, color: "#c0392b", conditions: [], imageAssetId: null, imageUrl: null,
});
const START = [
  creature("1", "Mira Hale", "Cairnkeepers", "2026-11-01"),
  creature("2", "Tor Breck", "Cairnkeepers", "2026-11-02"),
  creature("3", "Kettle Varga", "Lanternfall", "2026-11-03"),
  creature("4", "Goblin", null, "2026-11-04"),
];

const updateMany = vi.mocked(api.library.creatures.updateMany);
const moveToFolder = vi.mocked(api.library.moveToFolder);
const removeMany = vi.mocked(api.library.creatures.removeMany);

/** The tab with the page's state around it, as LibraryPage holds it. */
function Harness() {
  const [creatures, setCreatures] = useState<LibraryCreature[] | null>(START);
  const [view, setView] = useState<FolderView>(ALL_FOLDERS);
  return <CreaturesTab creatures={creatures} setCreatures={setCreatures} loading={false} query="" view={view} onView={setView} onEdit={() => {}} />;
}

const names = () => [...document.querySelectorAll(".asset-name")].map((n) => n.textContent);
const chip = (label: RegExp) => within(screen.getByRole("group", { name: "Folders" })).getByRole("button", { name: label });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
  try { localStorage.clear(); } catch { /* no storage: the default order is used */ }
  // The server answers with the creatures as changed.
  updateMany.mockReset().mockImplementation(async ({ ids, patch }: BulkUpdateCreaturesRequest) =>
    START.filter((c) => ids.includes(c.id)).map((c) => ({ ...c, ...patch })));
  removeMany.mockReset().mockImplementation(async (ids: string[]) => ({ deleted: ids.length }));
  moveToFolder.mockReset().mockImplementation(async ({ ids }) => ({ moved: ids.length }));
});
afterEach(cleanup);

describe("Creatures tab folders, sorting and selection (library-organize, FR-GM-08)", () => {
  it("shows a chip per folder and the creatures grouped by folder, no folder last", () => {
    render(<Harness />);
    expect(chip(/^All/).getAttribute("aria-pressed")).toBe("true");
    expect(chip(/Cairnkeepers, 2 items/)).toBeTruthy();
    expect(chip(/Lanternfall, 1 item/)).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Cairnkeepers2", "Lanternfall1", "No folder1"]);
    // Newest first inside each folder.
    expect(names()).toEqual(["Tor Breck", "Mira Hale", "Kettle Varga", "Goblin"]);
  });

  it("opens one folder from its chip", () => {
    render(<Harness />);
    fireEvent.click(chip(/Cairnkeepers/));
    expect(names()).toEqual(["Tor Breck", "Mira Hale"]);
    expect(screen.getByRole("button", { name: "Rename folder" })).toBeTruthy();
  });

  it("moves the chosen creatures into a folder in one request", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Goblin" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Kettle Varga" }));
    const bar = screen.getByRole("region", { name: "Selection" });
    expect(within(bar).getByText("2 selected")).toBeTruthy();

    fireEvent.click(within(bar).getByRole("button", { name: "Move to folder" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Cairnkeepers" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Move to folder" }));

    await waitFor(() => expect(moveToFolder).toHaveBeenCalledWith({ kind: "creature", ids: ["3", "4"], folder: "Cairnkeepers" }));
    await waitFor(() => expect(chip(/Cairnkeepers, 4 items/)).toBeTruthy());
  });

  it("chooses a run with Shift-click, in the order the cards are shown", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Tor Breck" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Kettle Varga" }), { shiftKey: true });
    const chosen = screen.getAllByRole("checkbox").filter((b) => (b as HTMLInputElement).checked).map((b) => b.getAttribute("aria-label"));
    expect(chosen).toEqual(["Select Tor Breck", "Select Mira Hale", "Select Kettle Varga"]);
  });

  it("deletes the chosen creatures after naming them", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Mira Hale" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Goblin" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Selection" })).getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Mira Hale, Goblin")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete 2" }));
    await waitFor(() => expect(removeMany).toHaveBeenCalledWith(["1", "4"]));
    await waitFor(() => expect(names()).toEqual(["Tor Breck", "Kettle Varga"]));
    expect(screen.queryByRole("region", { name: "Selection" })).toBeNull();
  });

  it("renames a folder by moving every creature in it", async () => {
    render(<Harness />);
    fireEvent.click(chip(/Cairnkeepers/));
    fireEvent.click(screen.getByRole("button", { name: "Rename folder" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Folder name"), { target: { value: "Frost Peaks" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(moveToFolder).toHaveBeenCalledWith({ kind: "creature", ids: ["1", "2"], folder: "Frost Peaks" }));
    await waitFor(() => expect(chip(/Frost Peaks, 2 items/).getAttribute("aria-pressed")).toBe("true"));
  });

  it("edits Size, Max HP or AC on the chosen creatures together", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Mira Hale" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Tor Breck" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Selection" })).getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("AC"), { target: { value: "12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save 2 creatures" }));
    await waitFor(() => expect(updateMany).toHaveBeenCalledWith({ ids: ["2", "1"], patch: { ac: 12 } }));
  });

  it("stops selecting on Escape", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Goblin" }));
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(screen.queryByRole("region", { name: "Selection" })).toBeNull();
  });
});
