import { describe, expect, it } from "vitest";
import type { LibraryCreature } from "@vtt/shared";
import { sortItems } from "../src/pages/librarySort";
import { clickSelection, keepShown } from "../src/ui/selection";
import { groupByFolder, inFolderView, libraryFolders, liveFolderView, resolveFolderName, sharedFolder, viewFolder } from "../src/pages/LibraryFolders";
import { combineUsage } from "../src/pages/LibraryBulkDelete";

const item = (id: string, name: string, createdAt: string) => ({ id, name, createdAt });
const creature = (id: string, name: string, folder: string | null): LibraryCreature => ({
  id, name, folder, size: 1, maxHp: null, ac: null, color: "#c0392b", conditions: [], imageAssetId: null, imageUrl: null, createdAt: "2026-11-01T00:00:00.000Z",
});

describe("library sorting (library-organize, FR-GM-08)", () => {
  const items = [
    item("a", "Goblin 10", "2026-11-03"),
    item("b", "goblin 2", "2026-11-01"),
    item("c", "Ogre", "2026-11-02"),
    item("d", "Ápex", "2026-11-02"),
  ];
  const names = (key: Parameters<typeof sortItems>[1]) => sortItems(items, key, (x) => x.createdAt, "en").map((x) => x.name);

  it("orders names as people read them: case and accents aside, numbers by value", () => {
    expect(names("nameAsc")).toEqual(["Ápex", "goblin 2", "Goblin 10", "Ogre"]);
    expect(names("nameDesc")).toEqual(["Ogre", "Goblin 10", "goblin 2", "Ápex"]);
  });

  it("orders by date either way, breaking ties by name so the order never shuffles", () => {
    expect(names("newest")).toEqual(["Goblin 10", "Ápex", "Ogre", "goblin 2"]);
    expect(names("oldest")).toEqual(["goblin 2", "Ápex", "Ogre", "Goblin 10"]);
  });

  it("returns a new array and leaves the list it was given alone", () => {
    const before = items.map((x) => x.id);
    expect(sortItems(items, "nameAsc", (x) => x.createdAt, "en")).not.toBe(items);
    expect(items.map((x) => x.id)).toEqual(before);
  });
});

describe("choosing several cards (library-organize)", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("turns one card on and off with a plain click", () => {
    const on = clickSelection(new Set(), order, "c", null, false);
    expect([...on]).toEqual(["c"]);
    expect([...clickSelection(on, order, "c", "c", false)]).toEqual([]);
  });

  it("chooses the run from the last card clicked with Shift, either way, keeping what was chosen", () => {
    expect([...clickSelection(new Set(["a"]), order, "d", "b", true)].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...clickSelection(new Set(), order, "a", "c", true)].sort()).toEqual(["a", "b", "c"]);
  });

  it("treats Shift with no earlier click still shown as a plain click", () => {
    expect([...clickSelection(new Set(), order, "b", null, true)]).toEqual(["b"]);
    expect([...clickSelection(new Set(), order, "b", "gone", true)]).toEqual(["b"]);
  });

  it("drops cards that stop being shown, and keeps the same set when nothing changed", () => {
    const chosen = new Set(["a", "c"]);
    expect([...keepShown(chosen, ["c", "d"])]).toEqual(["c"]);
    expect(keepShown(chosen, order)).toBe(chosen);
  });
});

describe("library folders (library-organize, ADR 0075)", () => {
  const all = [
    creature("1", "Mira", "Cairnkeepers"),
    creature("2", "Tor", "Cairnkeepers"),
    creature("3", "Kettle", "Lanternfall"),
    creature("4", "Goblin", null),
    creature("5", "Ápex", "ápex camp"),
  ];

  it("lists each folder once by name, with how many creatures it holds", () => {
    expect(libraryFolders(all, "en")).toEqual([
      { name: "ápex camp", count: 1 },
      { name: "Cairnkeepers", count: 2 },
      { name: "Lanternfall", count: 1 },
    ]);
  });

  it("shows all creatures, one folder's, or those in none", () => {
    const shown = (view: Parameters<typeof inFolderView>[1]) => all.filter((c) => inFolderView(c, view)).map((c) => c.id);
    expect(shown({ kind: "all" })).toHaveLength(5);
    expect(shown({ kind: "folder", name: "Cairnkeepers" })).toEqual(["1", "2"]);
    expect(shown({ kind: "unfiled" })).toEqual(["4"]);
  });

  it("groups by folder in folder order, keeps each group's order, and puts no folder last", () => {
    const groups = groupByFolder([all[3]!, all[1]!, all[2]!, all[0]!], libraryFolders(all, "en"));
    expect(groups.map((g) => [g.folder, g.items.map((c) => c.id)])).toEqual([
      ["Cairnkeepers", ["2", "1"]],
      ["Lanternfall", ["3"]],
      [null, ["4"]],
    ]);
  });

  it("joins a folder whose name matches apart from case instead of making a second one", () => {
    const folders = libraryFolders(all, "en");
    expect(resolveFolderName("  cairnkeepers ", folders)).toBe("Cairnkeepers");
    expect(resolveFolderName("Frost Peaks", folders)).toBe("Frost Peaks");
  });

  it("works the same for any library item with a name and a folder", () => {
    const maps = [{ id: "m1", name: "Crypt", folder: "Cairnkeepers" }, { id: "m2", name: "Tower" }];
    expect(libraryFolders(maps, "en")).toEqual([{ name: "Cairnkeepers", count: 1 }]);
    expect(groupByFolder(maps, libraryFolders(maps, "en")).map((g) => g.folder)).toEqual(["Cairnkeepers", null]);
  });

  it("knows the folder a choice shares, and the folder a view files new items into", () => {
    expect(sharedFolder([all[0]!, all[1]!])).toBe("Cairnkeepers");
    expect(sharedFolder([all[3]!])).toBeNull();
    expect(sharedFolder([all[0]!, all[3]!])).toBeUndefined();
    expect(viewFolder({ kind: "folder", name: "Bosses" })).toBe("Bosses");
    expect(viewFolder({ kind: "unfiled" })).toBeNull();
    expect(viewFolder(undefined)).toBeNull();
  });

  it("falls back to All when the folder being shown has gone", () => {
    const folders = libraryFolders(all, "en");
    expect(liveFolderView({ kind: "folder", name: "Gone" }, folders, 1)).toEqual({ kind: "all" });
    expect(liveFolderView({ kind: "unfiled" }, folders, 0)).toEqual({ kind: "all" });
    const lantern = { kind: "folder", name: "Lanternfall" } as const;
    expect(liveFolderView(lantern, folders, 1)).toBe(lantern);
  });
});

describe("deleting several maps or token images (library-organize, asset-library)", () => {
  it("names each room, creature and template that uses any of them once", () => {
    const room = { id: "r1", name: "Crypt" };
    expect(combineUsage([
      { rooms: [room], creatures: [{ id: "c1", name: "Goblin" }], encounters: [] },
      { rooms: [room, { id: "r2", name: "Tower" }], creatures: [], encounters: [{ id: "e1", name: "Ambush" }] },
    ])).toEqual({
      rooms: [room, { id: "r2", name: "Tower" }],
      creatures: [{ id: "c1", name: "Goblin" }],
      encounters: [{ id: "e1", name: "Ambush" }],
    });
  });
});
