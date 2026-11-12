import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID,
  DomainEvent,
  MapImage,
  Token,
  filterEventForViewer,
  filterStateForViewer,
  reduce,
  referencedAssetIds,
  type CommittedEvent,
  type GridSpec,
} from "../src";
import { alice, baseRoom, gm, run, withToken } from "./fixtures";

const libraryGrid: GridSpec = { cellSize: 64, offsetX: 10, offsetY: 12, unitsPerCell: 5, unitLabel: "ft" };
const libraryMap = { url: "/uploads/map-1.png", width: 2048, height: 1536, assetId: "asset-map" };

describe("contract compatibility (ADR 0004)", () => {
  it("parses a MapImage and Token recorded before assetId existed", () => {
    expect(MapImage.parse({ url: "/uploads/a.png", width: 10, height: 10 }).assetId).toBeUndefined();
    const { token } = withToken(baseRoom());
    const { assetId: _dropped, ...legacy } = token;
    expect(() => Token.parse(legacy)).not.toThrow();
  });

  it("rejects a grid change that omits the grid it replaced (invariant 6)", () => {
    const map = { url: "/uploads/a.png", width: 10, height: 10 };
    expect(() => DomainEvent.parse({ type: "MapSet", map, previous: null, gridChange: { grid: libraryGrid } })).toThrow();
  });

  it("parses a MapSet recorded before it could carry a grid", () => {
    const e = DomainEvent.parse({ type: "MapSet", map: { url: "/uploads/a.png", width: 10, height: 10 }, previous: null });
    expect(e).toMatchObject({ type: "MapSet" });
  });
});

describe("placing a library map (asset-library: Place a library asset in a room)", () => {
  it("commits the map and its grid as one event carrying both previous values", () => {
    const before = baseRoom();
    const { state, events } = run(before, gm, { type: "scene.setMap", map: libraryMap, grid: libraryGrid });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "MapSet",
      map: libraryMap,
      previous: null,
      gridChange: { grid: libraryGrid, previous: DEFAULT_GRID },
      wallChange: { walls: [], previous: [] }, fogChange: { fog: [], previous: [] },
      tokenChanges: [],
    });
    expect(state.scene).toEqual({ map: libraryMap, grid: libraryGrid });
  });

  it("is undone by one compensating MapSet built from the replaced map and grid", () => {
    const withOld = run(baseRoom(), gm, { type: "scene.setMap", map: { url: "/uploads/old.png", width: 100, height: 100 } }).state;
    const placed = run(withOld, gm, { type: "scene.setMap", map: libraryMap, grid: libraryGrid });
    const e = placed.events[0]!;
    if (e.type !== "MapSet" || !e.previous || !e.gridChange) throw new Error("expected MapSet with previous values");
    const undone = reduce(placed.state, {
      type: "MapSet",
      map: e.previous,
      previous: e.map,
      gridChange: { grid: e.gridChange.previous, previous: e.gridChange.grid },
    });
    expect(undone.scene).toEqual(withOld.scene);
  });

  it("leaves the grid alone for a map set without one", () => {
    const withGrid = run(baseRoom(), gm, { type: "scene.setGrid", grid: libraryGrid }).state;
    const { state, events } = run(withGrid, gm, {
      type: "scene.setMap",
      map: { url: "/uploads/b.png", width: 50, height: 50 },
    });
    expect(events[0]).toMatchObject({ gridChange: { grid: libraryGrid, previous: libraryGrid }, tokenChanges: [] });
    expect(state.scene.grid).toEqual(libraryGrid);
  });
});

describe("library tokens (asset-library)", () => {
  it("carries assetId from token.create into the created token", () => {
    const { events } = run(baseRoom(), gm, {
      type: "token.create",
      name: "Goblin",
      position: { x: 0, y: 0 },
      imageUrl: "/uploads/tok.png",
      assetId: "asset-tok",
    });
    expect(events[0]).toMatchObject({ type: "TokenCreated", token: { imageUrl: "/uploads/tok.png", assetId: "asset-tok" } });
  });
});

describe("referencedAssetIds (asset-library: Warn before deleting an asset in use)", () => {
  it("collects the map and every token, hidden ones included", () => {
    let s = run(baseRoom(), gm, { type: "scene.setMap", map: libraryMap }).state;
    s = run(s, gm, { type: "token.create", name: "A", position: { x: 35, y: 35 }, assetId: "asset-a" }).state;
    s = run(s, gm, { type: "token.create", name: "B", position: { x: 105, y: 35 }, assetId: "asset-b", hidden: true }).state;
    s = run(s, gm, { type: "token.create", name: "Plain", position: { x: 175, y: 35 } }).state;
    expect([...referencedAssetIds(s)].sort()).toEqual(["asset-a", "asset-b", "asset-map"]);
  });

  it("drops an asset once its only token is deleted", () => {
    const s = run(baseRoom(), gm, { type: "token.create", name: "A", position: { x: 35, y: 35 }, assetId: "asset-a" }).state;
    const token = Object.values(s.tokens)[0]!;
    const after = run(s, gm, { type: "token.delete", tokenId: token.id }).state;
    expect(referencedAssetIds(after).size).toBe(0);
  });
});

describe("library details stay private (asset-library, FR-GM-23)", () => {
  const commit = (seq: number, event: CommittedEvent["event"]): CommittedEvent => ({
    seq, at: new Date(0).toISOString(), actorId: gm.id, event,
  });

  it("withholds a hidden library token, including its image and asset id, from players", () => {
    const { state, events } = run(baseRoom(), gm, {
      type: "token.create", name: "Beholder", position: { x: 0, y: 0 },
      imageUrl: "/uploads/secret.png", assetId: "asset-secret", hidden: true,
    });
    const filtered = JSON.stringify(filterStateForViewer(state, alice));
    expect(filtered).not.toContain("asset-secret");
    expect(filtered).not.toContain("/uploads/secret.png");
    expect(filterEventForViewer(commit(5, events[0]!), baseRoom(), alice)).toEqual({ kind: "redacted", seq: 5 });
  });

  it("gives players a visible library token's opaque asset id but no library name", () => {
    const { state } = run(baseRoom(), gm, {
      type: "token.create", name: "Goblin", position: { x: 0, y: 0 },
      imageUrl: "/uploads/tok.png", assetId: "asset-tok",
    });
    const token = Object.values(filterStateForViewer(state, alice).tokens)[0]!;
    expect(token.assetId).toBe("asset-tok");
    // Token has no field for a library name; the only name is the GM-chosen token name.
    expect(Object.keys(token)).not.toContain("assetName");
  });
});
