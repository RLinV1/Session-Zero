// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MoveToFolderRequest } from "@vtt/shared";

// jsdom has no scrollIntoView, which the sort Picker uses to follow its highlighted option.
Element.prototype.scrollIntoView = vi.fn();

vi.mock("../src/net/api", () => ({ api: { library: { moveToFolder: vi.fn() } } }));
import { api } from "../src/net/api";
import { FolderedList } from "../src/pages/LibraryFolderedList";
import { ALL_FOLDERS, type FolderView } from "../src/pages/LibraryFolders";
import { SelectableCard } from "../src/pages/LibraryListTools";

interface Map {
  id: string;
  name: string;
  folder?: string | null;
  createdAt: string;
}
const START: Map[] = [
  { id: "m1", name: "Crypt", folder: "Cairnkeepers", createdAt: "2026-11-01" },
  { id: "m2", name: "Bridge", createdAt: "2026-11-02" },
  { id: "m3", name: "Tower", folder: null, createdAt: "2026-11-03" },
];
const moveToFolder = vi.mocked(api.library.moveToFolder);

/** A maps list as the Maps tab holds it, with its own folders. */
function Maps() {
  const [maps, setMaps] = useState(START);
  const [view, setView] = useState<FolderView>(ALL_FOLDERS);
  return (
    <FolderedList
      kind="asset"
      sortKey="map"
      items={maps}
      query=""
      date={(m) => m.createdAt}
      view={view}
      onView={setView}
      onMoved={(ids, folder) => setMaps((all) => all.map((m) => (ids.includes(m.id) ? { ...m, folder } : m)))}
      noMatch="nothing"
      renderCard={(map, selection) => (
        <SelectableCard key={map.id} className="asset-card" name={map.name} selection={selection}>
          <strong className="asset-name">{map.name}</strong>
        </SelectableCard>
      )}
    />
  );
}

const names = () => [...document.querySelectorAll(".asset-name")].map((n) => n.textContent);
const chip = (label: RegExp) => within(screen.getByRole("group", { name: "Folders" })).getByRole("button", { name: label });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
  try { localStorage.clear(); } catch { /* no storage: the default order is used */ }
  moveToFolder.mockReset().mockImplementation(async ({ ids }: MoveToFolderRequest) => ({ moved: ids.length }));
});
afterEach(cleanup);

describe("folders on any library tab (library-organize, ADR 0075, FR-GM-08)", () => {
  it("gives maps the same chips and sections as creatures", () => {
    render(<Maps />);
    expect(chip(/Cairnkeepers, 1 item/)).toBeTruthy();
    expect(chip(/^No folder/)).toBeTruthy();
    expect(names()).toEqual(["Crypt", "Tower", "Bridge"]);
  });

  it("makes a folder, then files the maps chosen next into it, as maps", async () => {
    render(<Maps />);
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Folder name"), { target: { value: "Frost Peaks" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Choose items" }));

    const bar = screen.getByRole("region", { name: "Selection" });
    expect(within(bar).getByText("Choose what to put in “Frost Peaks”.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Tower" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Bridge" }));
    fireEvent.click(within(bar).getByRole("button", { name: "Move to “Frost Peaks”" }));

    await waitFor(() => expect(moveToFolder).toHaveBeenCalledWith({ kind: "asset", ids: ["m3", "m2"], folder: "Frost Peaks" }));
    // The new folder opens, showing what went in.
    await waitFor(() => expect(chip(/Frost Peaks, 2 items/).getAttribute("aria-pressed")).toBe("true"));
    expect(names()).toEqual(["Tower", "Bridge"]);
  });

  it("removes a folder by moving what is in it to no folder", async () => {
    render(<Maps />);
    fireEvent.click(chip(/Cairnkeepers/));
    fireEvent.click(screen.getByRole("button", { name: "Remove folder" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove folder" }));
    await waitFor(() => expect(moveToFolder).toHaveBeenCalledWith({ kind: "asset", ids: ["m1"], folder: null }));
    await waitFor(() => expect(chip(/^All/).getAttribute("aria-pressed")).toBe("true"));
  });
});
