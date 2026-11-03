import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type Wall } from "@vtt/shared";
import { importedDoor, importedOpenings, openingsToDoors } from "../src/pages/mapEditor/importedOpenings";
import { applyToDraft, planDraftSave, type MapDraft } from "../src/pages/mapEditor/mapDraft";

const expectedMapUrl = "/uploads/map.png";
const at = (x: number) => ({ a: { x, y: 0 }, b: { x, y: 50 } });
const walls: Record<string, Wall> = {
  shut: { id: "shut", ...at(10), uvttPortal: { closed: true, position: { x: 10, y: 25 }, rotation: 1.5, freestanding: false } },
  ajar: { id: "ajar", ...at(20), uvttPortal: { closed: false } },
  unmarked: { id: "unmarked", ...at(30), uvttPortal: {} },
  designated: { id: "designated", ...at(40), uvttPortal: { closed: true }, portal: { kind: "window", state: "locked" } },
  native: { id: "native", ...at(50), portal: { kind: "door", state: "open" } },
  plain: { id: "plain", ...at(60), source: "line_of_sight" },
};
const room = { scene: { map: { url: expectedMapUrl, width: 700, height: 700 }, grid: DEFAULT_GRID }, walls, fog: {} };
let n = 0;
const newId = () => `draft:${++n}`;

describe("imported openings to doors (FR-GM-09, FR-GM-18, ADR 0041)", () => {
  it("finds only openings with UVTT metadata and no door or window yet", () => {
    expect(importedOpenings(walls).map((w) => w.id)).toEqual(["shut", "ajar", "unmarked"]);
  });

  it("follows each opening's closed flag, and closes one the file leaves unmarked", () => {
    expect(importedDoor(walls.shut!)).toEqual({ kind: "door", state: "closed" });
    expect(importedDoor(walls.ajar!)).toEqual({ kind: "door", state: "open" });
    expect(importedDoor(walls.unmarked!)).toEqual({ kind: "door", state: "closed" });
  });

  it("makes one portal.set per opening, and nothing when none are left", () => {
    expect(openingsToDoors(walls)).toEqual([
      { type: "portal.set", wallId: "shut", portal: { kind: "door", state: "closed" } },
      { type: "portal.set", wallId: "ajar", portal: { kind: "door", state: "open" } },
      { type: "portal.set", wallId: "unmarked", portal: { kind: "door", state: "closed" } },
    ]);
    expect(openingsToDoors({ designated: walls.designated!, native: walls.native!, plain: walls.plain! })).toEqual([]);
  });

  it("keeps the UVTT metadata in the draft, and Save sends only portal designations", () => {
    const draft = openingsToDoors(walls).reduce<MapDraft>(
      (current, command) => applyToDraft(current, command, newId)!,
      { mapUrl: expectedMapUrl, walls, fog: {}, lineOfSight: false, isometric: false, sightRange: null },
    );
    expect(draft.walls.shut).toEqual({ ...walls.shut, portal: { kind: "door", state: "closed" } });
    expect(draft.walls.ajar!.uvttPortal).toEqual({ closed: false });
    expect(draft.walls.designated).toBe(walls.designated);
    expect(openingsToDoors(draft.walls)).toEqual([]);
    expect(planDraftSave(room, draft)).toEqual([
      { type: "portal.set", expectedMapUrl, wallId: "shut", portal: { kind: "door", state: "closed" } },
      { type: "portal.set", expectedMapUrl, wallId: "ajar", portal: { kind: "door", state: "open" } },
      { type: "portal.set", expectedMapUrl, wallId: "unmarked", portal: { kind: "door", state: "closed" } },
    ]);
  });
});
