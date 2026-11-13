import { describe, expect, it } from "vitest";
import {
  BUILTIN_ROOM_DEFAULTS,
  DEFAULT_GRID,
  type DomainEvent,
  RoomDefaults,
  defeatRemovalOf,
  diagonalRuleOf,
  difficultTerrainOf,
  emptyRoomState,
  filterEventForViewer,
  reduce,
  type CommittedEvent,
  type RoomState,
} from "../src";
import { alice, gm } from "./fixtures";

const mine: RoomDefaults = {
  defeatRemoval: "npc",
  hideMapWithoutToken: true,
  hideHp: true,
  hideAc: false,
  diagonalRule: "euclidean",
  difficultTerrain: "exit",
  unitsPerCell: 1.5,
  unitLabel: "m",
};

describe("a GM's room defaults (gm-room-defaults)", () => {
  it("accepts the built-ins and a full set of choices", () => {
    expect(RoomDefaults.parse(BUILTIN_ROOM_DEFAULTS)).toEqual(BUILTIN_ROOM_DEFAULTS);
    expect(RoomDefaults.parse(mine)).toEqual(mine);
  });

  it.each([
    ["an unknown diagonal rule", { diagonalRule: "hex" }],
    ["a zero distance per square", { unitsPerCell: 0 }],
    ["a negative distance per square", { unitsPerCell: -5 }],
    ["an empty unit label", { unitLabel: "" }],
    ["a blank unit label", { unitLabel: "   " }],
    ["a 13-character unit label", { unitLabel: "abcdefghijklm" }],
    ["an unknown 0 HP mode", { defeatRemoval: "some" }],
  ])("refuses %s", (_name, change) => {
    expect(RoomDefaults.safeParse({ ...BUILTIN_ROOM_DEFAULTS, ...change }).success).toBe(false);
  });

  it("refuses a set with a rule missing", () => {
    const { hideAc: _missing, ...partial } = BUILTIN_ROOM_DEFAULTS;
    expect(RoomDefaults.safeParse(partial).success).toBe(false);
  });
});

describe("a new room starts with its GM's defaults (gm-room-defaults, table-rules)", () => {
  it("takes every rule and the grid units from RoomCreated", () => {
    const state = reduce(emptyRoomState("r1"), { type: "RoomCreated", name: "Crypt", preset: "free", defaults: mine });
    expect(defeatRemovalOf(state)).toBe("npc");
    expect(state.hideMapWithoutToken).toBe(true);
    expect(state.hideHp).toBe(true);
    expect(state.hideAc).toBe(false);
    expect(diagonalRuleOf(state)).toBe("euclidean");
    expect(difficultTerrainOf(state)).toBe("exit");
    expect(state.scene.grid).toEqual({ ...DEFAULT_GRID, unitsPerCell: 1.5, unitLabel: "m" });
  });

  it("reduces a RoomCreated without defaults exactly as before", () => {
    const state = reduce(emptyRoomState("r1"), { type: "RoomCreated", name: "Crypt", preset: "free" });
    expect(state).toEqual({ ...emptyRoomState("r1"), name: "Crypt", preset: "free" });
    expect(defeatRemovalOf(state)).toBe("all");
    expect(diagonalRuleOf(state)).toBe("equal");
    expect(difficultTerrainOf(state)).toBe("entry");
    expect(state.scene.grid).toEqual(DEFAULT_GRID);
  });

  it("replays an older room's log unchanged", () => {
    const log: DomainEvent[] = [
      { type: "RoomCreated", name: "Old room" },
      { type: "GridSet", grid: { ...DEFAULT_GRID, unitsPerCell: 10 }, previous: DEFAULT_GRID },
    ];
    const state = log.reduce<RoomState>((s, e) => reduce(s, e), emptyRoomState("r1"));
    expect(state.scene.grid.unitsPerCell).toBe(10);
    expect(state.hideHp).toBeUndefined();
    expect(diagonalRuleOf(state)).toBe("equal");
  });

  it("is passed to players as is: every rule is public", () => {
    const committed: CommittedEvent = { seq: 1, at: "2026-11-13T00:00:00Z", actorId: gm.id, event: { type: "RoomCreated", name: "Crypt", defaults: mine } };
    const filtered = filterEventForViewer(committed, emptyRoomState("r1"), alice);
    expect(filtered).toMatchObject({ kind: "event", committed: { event: { defaults: mine } } });
  });
});
