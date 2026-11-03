import { paintTerrain, terrainCells, compressTerrain, TerrainRuns, type PaintRun, type TerrainRun } from "@vtt/shared";
import {
  MAX_WALLS_PER_ADD, MAX_WALLS_PER_REMOVE,
  polygonArea, wallsFitMap, removePortalOverlaps, sameValue,
  type PreparationEdit, type CommandInput, type FogRegion, type Point, type Portal, type RoomState, type Wall,
} from "@vtt/shared";

/**
 * The map editor's private copy of the room's walls and fog (map-editor-drafts). The Walls and Fog
 * steps edit it; Save submits their differences as one atomic preparation command.
 */
export interface MapDraft {
  /** The applied map this draft belongs to. */
  mapUrl: string;
  sceneId?: string;
  terrain?: TerrainRun[];
  terrainContext?: { boardEpoch: number; revision: number };
  walls: Record<string, Wall>;
  fog: Record<string, FogRegion>;
  /** Line of sight on or off (Sight step). */
  lineOfSight: boolean;
  /** 2.5D isometric map style; false is flat (Sight step, ADR 0048). */
  isometric: boolean;
  /** Sight range in grid units; null is unlimited. */
  sightRange: number | null;
}

/** Walls and fog drawn in the editor carry ids with this prefix; the room gives them real ones on Save. */
export const DRAFT_ID = "draft:";

export function draftFrom(state: Pick<RoomState, "scene" | "walls" | "fog"> & Partial<Pick<RoomState, "terrain" | "boardEpoch" | "terrainRevision" | "activeSceneId">>): MapDraft {
  return { sceneId: state.activeSceneId ?? "initial", terrain: state.terrain?.base, terrainContext: { boardEpoch: state.boardEpoch ?? 0, revision: state.terrainRevision ?? 0 }, mapUrl: state.scene.map?.url ?? "", walls: state.walls, fog: state.fog, lineOfSight: state.scene.lineOfSight ?? false, isometric: state.scene.isometric ?? false, sightRange: state.scene.sightRange ?? null };
}

const pointKey = (p: Point) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;

/** A wall's identity for the diff: its endpoints to a tenth of a pixel, in either direction. */
function wallKey(wall: { a: Point; b: Point }): string {
  const [a, b] = [pointKey(wall.a), pointKey(wall.b)];
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** A fog region's identity for the diff: its shape and corners, so ids never need to match. */
const fogKey = (region: FogRegion) => `${region.shape}:${region.points.map(pointKey).join(" ")}`;

/** A fog region as `fog.add` takes it: a rectangle by its corners, or the polygon's points. */
function fogAdd(region: FogRegion): Extract<CommandInput, { type: "fog.add" }>["region"] {
  if (region.shape === "polygon") return { shape: "polygon", points: region.points };
  const xs = region.points.map((p) => p.x);
  const ys = region.points.map((p) => p.y);
  return { shape: "rect", from: { x: Math.min(...xs), y: Math.min(...ys) }, to: { x: Math.max(...xs), y: Math.max(...ys) } };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function matchEntities<T extends { id: string }>(room: Record<string, T>, draft: Record<string, T>, key: (entity: T) => string): Map<string, T> {
  const matches = new Map<string, T>();
  const available = new Map(Object.values(room).map((entity) => [entity.id, entity]));
  for (const entity of Object.values(draft)) {
    const retained = available.get(entity.id);
    if (!retained) continue;
    matches.set(entity.id, retained);
    available.delete(retained.id);
  }
  const byKey = new Map<string, T[]>();
  for (const entity of available.values()) {
    const value = key(entity);
    const bucket = byKey.get(value) ?? [];
    bucket.push(entity);
    byKey.set(value, bucket);
  }
  for (const entity of Object.values(draft)) {
    if (matches.has(entity.id)) continue;
    const retained = byKey.get(key(entity))?.pop();
    if (!retained) continue;
    matches.set(entity.id, retained);
  }
  return matches;
}

export function planDraftSave(room: Pick<RoomState, "scene" | "walls" | "fog"> & Partial<Pick<RoomState, "terrain" | "boardEpoch" | "terrainRevision" | "activeSceneId">>, draft: MapDraft): CommandInput[] {
  if (draft.sceneId !== undefined && draft.sceneId !== (room.activeSceneId ?? "initial")) throw new Error("The scene changed. Reopen the editor before saving.");
  if (room.scene.map?.url !== draft.mapUrl) throw new Error("The map changed. Reopen the editor before saving.");
  const commands: PreparationEdit[] = [];
  const fogMatches = matchEntities(room.fog, draft.fog, fogKey);

  const roomWalls = Object.values(room.walls);
  const draftWalls = Object.values(draft.walls);
  const wallMatches = matchEntities(room.walls, draft.walls, (w) => `${wallKey(w)}:${w.portal?.kind ?? ""}:${w.portal?.state ?? ""}`);
  const retainedWallIds = new Set([...wallMatches.values()].map((w) => w.id));
  if (draftWalls.length === 0 && roomWalls.length > 0) {
    commands.push({ type: "wall.clear" });
  } else {
    const removed = roomWalls.filter((w) => !retainedWallIds.has(w.id)).map((w) => w.id);
    for (const wallIds of chunks(removed, MAX_WALLS_PER_REMOVE)) commands.push({ type: "wall.remove", wallIds });
  }
  const added = draftWalls.filter((w) => !wallMatches.has(w.id)).map(({ id: _id, ...wall }) => wall);
  for (const walls of chunks(added, MAX_WALLS_PER_ADD)) commands.push({ type: "wall.add", walls });
  for (const w of draftWalls) {
    const roomWall = wallMatches.get(w.id);
    if (!roomWall) continue;
    const { portal: _roomPortal, ...roomGeometry } = roomWall;
    const { portal: _draftPortal, ...draftGeometry } = { ...w, id: roomWall.id };
    if (!sameValue(roomGeometry, draftGeometry)) commands.push({ type: "wall.update", wall: { ...w, id: roomWall.id } });
    else if (!samePortal(roomWall.portal, w.portal)) commands.push({ type: "portal.set", wallId: roomWall.id, portal: w.portal ?? null });
  }

  // Fog goes in one command so a full room can take a replacement and a refusal changes nothing (ADR 0032).
  const retainedFogIds = new Set([...fogMatches.values()].map((f) => f.id));
  const removeIds = Object.values(room.fog).filter((f) => !retainedFogIds.has(f.id)).map((f) => f.id);
  const add = Object.values(draft.fog).filter((f) => !fogMatches.has(f.id)).map(fogAdd);
  if (removeIds.length > 0 || add.length > 0) commands.push({ type: "fog.replace", removeIds, add });
  if (!sameValue(room.terrain?.base ?? [], draft.terrain ?? [])) {
    const old = terrainCells(room.terrain?.base ?? []), next = terrainCells(draft.terrain ?? []);
    const removed = new Map([...old].filter(([key]) => !next.has(key)));
    const changed = new Map([...next].filter(([key, kind]) => old.get(key) !== kind));
    const paint: PaintRun[] = [...compressTerrain(removed).map((r) => ({ ...r, kind: null })), ...compressTerrain(changed)];
    const context = draft.terrainContext ?? { boardEpoch: room.boardEpoch ?? 0, revision: room.terrainRevision ?? 0 };
    // A run has bounded coordinates; 256 runs leave ample room below the 32-KiB paint cap.
    for (const [index, part] of chunks(paint, 256).entries()) commands.push({ type: "terrain.paint", layerId: "base", paint: part, context: { ...context, revision: context.revision + index } });
  }
  const sight: PreparationEdit[] = [];
  if ((room.scene.lineOfSight ?? false) !== draft.lineOfSight) sight.push({ type: "scene.setLineOfSight", enabled: draft.lineOfSight });
  if ((room.scene.isometric ?? false) !== draft.isometric) sight.push({ type: "scene.setIsometric", enabled: draft.isometric });
  if ((room.scene.sightRange ?? null) !== draft.sightRange) sight.push({ type: "scene.setSightRange", range: draft.sightRange });
  const edits = [...commands.map((command) => command.type === "terrain.paint" ? command : { ...command, expectedMapUrl: draft.mapUrl }), ...sight].map((command) => ({ ...command, ...(draft.sceneId !== undefined && { expectedSceneId: draft.sceneId }) }));
  return edits.length ? [{ type: "scene.savePreparation", expectedMapUrl: draft.mapUrl, ...(draft.sceneId !== undefined && { expectedSceneId: draft.sceneId }),
    context: draft.terrainContext ?? { boardEpoch: room.boardEpoch ?? 0, revision: room.terrainRevision ?? 0 }, edits }] : [];
}

/** Whether two walls are the same kind of portal, or both plain. */
const samePortal = (a: Portal | undefined, b: Portal | undefined) => a?.kind === b?.kind && a?.state === b?.state;

/** Whether Save would send anything. */
export const draftDirty = (room: Pick<RoomState, "scene" | "walls" | "fog"> & Partial<Pick<RoomState, "terrain" | "boardEpoch" | "terrainRevision" | "activeSceneId">>, draft: MapDraft) => room.scene.map?.url === draft.mapUrl && planDraftSave(room, draft).length > 0;

type FogAdd = Extract<CommandInput, { type: "fog.add" }>["region"];

/** A fog region's corners, as the room stores them: a rectangle becomes its four corners. */
const fogPoints = (region: FogAdd): Point[] => region.shape === "rect"
  ? [
      { x: Math.min(region.from.x, region.to.x), y: Math.min(region.from.y, region.to.y) },
      { x: Math.max(region.from.x, region.to.x), y: Math.min(region.from.y, region.to.y) },
      { x: Math.max(region.from.x, region.to.x), y: Math.max(region.from.y, region.to.y) },
      { x: Math.min(region.from.x, region.to.x), y: Math.max(region.from.y, region.to.y) },
    ]
  : region.points;

/** Why the server would refuse this wall or fog addition on a map of this size, or null: the draft only holds what Save can send. */
export function draftCommandProblem(command: CommandInput, map: { width: number; height: number }): string | null {
  if (command.type === "terrain.paint" && !TerrainRuns.safeParse(paintTerrain([], command.paint)).success) return "Too many terrain cells.";
  if (command.type === "wall.add" || command.type === "wall.update") {
    const walls = command.type === "wall.add" ? command.walls : [command.wall];
    if (walls.some((w) => w.a.x === w.b.x && w.a.y === w.b.y)) return "A wall needs two different ends.";
    if (!wallsFitMap(walls, map)) return "Walls must lie on the map.";
  }
  if (command.type === "fog.add" && Math.abs(polygonArea(fogPoints(command.region))) < 1) return "A fog region needs some area.";
  if (command.type === "fog.replace" && command.add.some((region) => Math.abs(polygonArea(fogPoints(region))) < 1)) return "A fog region needs some area.";
  return null;
}

/**
 * A wall or fog command applied to the draft instead of the room. `newId` names anything new.
 * Returns null for a command the draft doesn't hold.
 */
export function applyToDraft(draft: MapDraft, command: CommandInput, newId: () => string): MapDraft | null {
  switch (command.type) {
    case "terrain.paint": return { ...draft, terrain: paintTerrain(draft.terrain ?? [], command.paint) };
    case "wall.add": {
      const walls = { ...draft.walls };
      for (const wall of command.walls) {
        const id = newId();
        walls[id] = { ...wall, id };
      }
      return normalizedDraft({ ...draft, walls }, newId);
    }
    case "wall.update":
      if (!Object.hasOwn(draft.walls, command.wall.id)) return draft;
      return normalizedDraft({ ...draft, walls: { ...draft.walls, [command.wall.id]: command.wall } }, newId);
    case "portal.set": {
      const wall = draft.walls[command.wallId];
      if (!wall) return draft;
      const { portal: _previous, ...plain } = wall;
      return { ...draft, walls: { ...draft.walls, [wall.id]: command.portal ? { ...plain, portal: command.portal } : plain } };
    }
    case "wall.remove": {
      const walls = { ...draft.walls };
      for (const id of command.wallIds) delete walls[id];
      return { ...draft, walls };
    }
    case "wall.clear":
      return { ...draft, walls: {} };
    case "fog.add": {
      const { region } = command;
      const points = fogPoints(region);
      const id = newId();
      return { ...draft, fog: { ...draft.fog, [id]: { id, shape: region.shape, points } } };
    }
    case "fog.remove": {
      const fog = { ...draft.fog };
      delete fog[command.regionId];
      return { ...draft, fog };
    }
    case "fog.replace": {
      const fog = { ...draft.fog };
      for (const id of command.removeIds) delete fog[id];
      for (const region of command.add) {
        const id = newId();
        fog[id] = { id, shape: region.shape, points: fogPoints(region) };
      }
      return { ...draft, fog };
    }
    case "scene.setLineOfSight":
      return { ...draft, lineOfSight: command.enabled };
    case "scene.setIsometric":
      return { ...draft, isometric: command.enabled };
    case "scene.setSightRange":
      return { ...draft, sightRange: command.range };
    default:
      return null;
  }
}

/**
 * Walls from a finished detection, as the draft's whole set of walls; a wall found twice counts
 * once. A wall the draft already had keeps its door or window (ADR 0030).
 */
export function withDetectedWalls(draft: MapDraft, detected: readonly { a: Point; b: Point; portal?: Portal }[], newId: () => string): MapDraft {
  const walls: Record<string, Wall> = {};
  const seen = new Map<string, string>();
  const existing = new Map<string, Wall>();
  for (const wall of Object.values(draft.walls)) {
    const key = wallKey(wall);
    if (!existing.has(key)) existing.set(key, wall);
  }
  for (const { a, b, portal } of detected) {
    const key = wallKey({ a, b });
    const id = seen.get(key) ?? existing.get(key)?.id ?? newId();
    seen.set(key, id);
    const wall = walls[id] ?? existing.get(key) ?? { id, a, b };
    // Stored walls for built-in maps carry their doors and windows (ADR 0029 amendment). A plain
    // wall gains one found on the same segment; one it already has wins.
    walls[id] = !wall.portal && portal ? { ...wall, portal } : wall;
  }
  return { ...draft, walls };
}

/** Keep a portal opening clear in every private edit; split solids get new draft identities. */
function normalizedDraft(draft: MapDraft, newId: () => string): MapDraft {
  const walls = Object.fromEntries(removePortalOverlaps(Object.values(draft.walls)).map((wall) => {
    const previous = draft.walls[wall.id];
    const id = previous && sameValue(previous, wall) ? wall.id : newId();
    return [id, { ...wall, id }];
  }));
  return { ...draft, walls };
}
