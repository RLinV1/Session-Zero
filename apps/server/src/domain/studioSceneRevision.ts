import { createHash, randomUUID } from "node:crypto";
import {
  DEFAULT_GRID, DraftEncounter, DraftMapSetup, DraftOpening, EMPTY_MAP_SETUP, TerrainRuns, cellRect, cornerPoint,
  draftMapBoard, draftTerrainState, footprintCenter, footprintOnBlocked, hasPortalBounds, listOpenings, mapOpenings, paintProblem, paintTerrain,
  readDraftMap, removePortalOverlaps, runOnMap, studioContains as contains, studioObjectCoverage, studioOverlaps as overlaps, terrainGridOf,
  type DraftCreatureState, type DraftEncounterState, type DraftLine, type DraftMapState, type GridSpec,
  type LibraryMapBoard, type Point, type Segment, type StudioFile, type StudioOperation, type StudioOwnerIds,
  type StudioRectangle, type StudioSelection, type StudioSelectionObject,
} from "@vtt/shared";
import type { BuildFileRecord } from "../store/buildStore";
import type { StudioPreparationRecords } from "../store/studioPreparation";
import { studioFile } from "./studioPreparation";

export class StudioAuthoringError extends Error {
  constructor(readonly code: "missing" | "access" | "conflict" | "limit" | "invalid" | "scope" | "permission" | "corrections_disabled" | "enrolled", message: string) { super(message); }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value)) ?? "null").digest("hex");

export interface StudioTarget { mapKey: string; encounterKey: string | null }
export interface RevisionScene {
  source: StudioFile;
  sourceContentHash?: string | null;
  sourceBoard: LibraryMapBoard | null;
  map: DraftMapState;
  grid: GridSpec;
  encounter: DraftEncounterState | null;
  creatures: { key: string; hash: string; data: Pick<DraftCreatureState, "name" | "size" | "color" | "imageFileId">; art: StudioFile | null }[];
  ids: { lines: string[]; openings: string[]; marks: string[]; placements: string[] };
  binding: string;
  materializedVersion: string;
}

function fileIdentity(file: BuildFileRecord) {
  return { id: file.id, canonicalId: file.studio?.canonicalId ?? file.sourceHash, width: file.width, height: file.height, orientation: file.studio?.orientation ?? null };
}

function initialId(version: string, layer: string, slot: number) {
  const hex = digest([version, layer, slot]);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function rowIds<T>(values: readonly T[], prior: readonly T[], priorIds: readonly string[], given?: readonly (string | null)[]) {
  if (given) {
    const used = given.filter((id): id is string => id !== null);
    if (values.length !== given.length || new Set(used).size !== used.length || used.some((id) => !priorIds.includes(id))) {
      throw new StudioAuthoringError("conflict", "These objects changed. Reload the build before saving.");
    }
    return given.map((id) => id ?? randomUUID());
  }
  const slots = prior.map((value, i) => ({ key: digest(value), id: priorIds[i] }));
  return values.map((v) => {
    const hash = digest(v);
    const match = slots.findIndex(({ key }) => key === hash);
    return match < 0 ? randomUUID() : slots.splice(match, 1)[0]!.id!;
  });
}

export function captureScene(records: StudioPreparationRecords, target: StudioTarget, prior?: RevisionScene, given?: StudioOwnerIds): RevisionScene {
  const { build, files, items } = records;
  const item = items.find((i) => i.kind === "map" && i.key === target.mapKey);
  const encounterItem = items.find((i) => i.kind === "encounter" && i.key === target.encounterKey);
  if (!item || (target.encounterKey !== null && (!encounterItem || encounterItem.data.mapKey !== item.key))) {
    throw new StudioAuthoringError("missing", "This map or encounter is unavailable.");
  }
  const data = item.data as unknown as DraftMapState;
  const file = files.find((f) => f.id === data.fileId && f.kind === "map");
  if (!file) throw new StudioAuthoringError("missing", "This map's source file is unavailable.");
  if (item.publishedId || file.publishedAssetId || encounterItem?.publishedId) {
    throw new StudioAuthoringError("conflict", "Choose an unpublished draft to start a correction.");
  }
  const units = { unitsPerCell: build.gameProfile?.unitsPerCell ?? DEFAULT_GRID.unitsPerCell, unitLabel: build.gameProfile?.unitLabel ?? DEFAULT_GRID.unitLabel };
  const map = readDraftMap(data, file, build.aiGrid, units);
  const grid = map.grid ?? (map.proposedGrid && { ...map.proposedGrid, ...units });
  if (!grid) throw new StudioAuthoringError("invalid", "Set a usable grid on this map in the builder before requesting a correction.");
  const setup = map.setup ?? EMPTY_MAP_SETUP;
  const encounter = (encounterItem?.data as unknown as DraftEncounterState | undefined) ?? null;
  const creatures = [...new Set(encounter?.tokens.map((t) => t.creatureKey))].sort().map((key) => {
    const item = items.find((i) => i.kind === "creature" && i.key === key);
    if (!item) throw new StudioAuthoringError("invalid", "Restore the missing draft creature before requesting a correction.");
    const { name, size, color, imageFileId } = item.data as unknown as DraftCreatureState;
    const art = files.find((f) => f.kind === "token" && f.id === imageFileId);
    if (imageFileId && !art) throw new StudioAuthoringError("invalid", "Restore the missing token artwork before requesting a correction.");
    return {
      key, data: { name, size, color, imageFileId }, art: art ? studioFile(art) : null,
      hash: digest({ data: item.data, art: art && fileIdentity(art) }),
    };
  });
  const binding = digest({ source: fileIdentity(file), board: file.board, grid, units, encounterKey: target.encounterKey, creatures: creatures.map(({ key, hash }) => [key, hash]) });
  const materializedVersion = digest({ buildId: build.id, target, binding, map: item.data, encounter: encounterItem?.data ?? null, mapAt: item.updatedAt, encounterAt: encounterItem?.updatedAt ?? null });
  const initial = (layer: string, count: number) => Array.from({ length: count }, (_, index) => initialId(materializedVersion, layer, index));
  return {
    source: studioFile(file), sourceContentHash: file.sourceHash, sourceBoard: file.board, map, grid, encounter, creatures, binding,
    materializedVersion,
    ids: prior ? {
      lines: rowIds(setup.lines, prior?.map.setup?.lines ?? [], prior?.ids.lines ?? [], given?.lines),
      openings: mapOpenings(file.board).map((_, i) => prior?.source.id === file.id ? prior.ids.openings[i] ?? randomUUID() : randomUUID()),
      marks: rowIds(setup.marks, prior?.map.setup?.marks ?? [], prior?.ids.marks ?? [], given?.marks),
      placements: rowIds(encounter?.tokens ?? [], prior?.encounter?.tokens ?? [], prior?.ids.placements ?? [], given?.placements),
    } : { lines: initial("lines", setup.lines.length), openings: initial("openings", mapOpenings(file.board).length), marks: initial("marks", setup.marks.length), placements: initial("placements", encounter?.tokens.length ?? 0) },
  };
}

const bounds = (a: Point, b = a): StudioRectangle => ({
  minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y),
});
const lineSegment = ({ from, to }: DraftLine, grid: GridSpec): Segment => ({ a: cornerPoint(from, grid), b: cornerPoint(to, grid) });
function placementBounds(scene: RevisionScene, placement: DraftEncounterState["tokens"][number]): StudioRectangle | null {
  const size = scene.creatures.find((c) => c.key === placement.creatureKey)?.data.size ?? 1;
  const center = placement.square && footprintCenter(placement.square, size, scene.grid, scene.source);
  if (!center) return null;
  const half = size * scene.grid.cellSize / 2;
  return bounds({ x: center.x - half, y: center.y - half }, { x: center.x + half, y: center.y + half });
}
/**
 * A mark annotates a whole square, drawn at its center, so its extent is that cell clipped to the
 * image like a terrain cell. Null when no part of the cell is on the image.
 */
function markBounds(square: { column: number; row: number }, grid: GridSpec, source: StudioFile): StudioRectangle | null {
  const cell = cellRect(square.column, square.row, grid);
  const clipped = { minX: Math.max(0, cell.minX), minY: Math.max(0, cell.minY), maxX: Math.min(source.width, cell.maxX), maxY: Math.min(source.height, cell.maxY) };
  return clipped.minX < clipped.maxX && clipped.minY < clipped.maxY ? clipped : null;
}
export function selectionObjects(scene: RevisionScene): StudioSelectionObject[] {
  const setup = scene.map.setup ?? EMPTY_MAP_SETUP;
  const importedOpenings = mapOpenings(scene.sourceBoard);
  return [
    ...setup.lines.map((line, i): StudioSelectionObject => {
      const segment = lineSegment(line, scene.grid);
      return { id: scene.ids.lines[i]!, layer: "geometry", kind: line.kind, state: line.state, bounds: bounds(segment.a, segment.b), segment };
    }),
    ...listOpenings(scene.sourceBoard, setup, scene.grid).map(({ a, b, now }, i): StudioSelectionObject => {
      const imported = importedOpenings[i]!;
      // Leaving an opening for review preserves the original portal's kind and state.
      const portal: Pick<StudioSelectionObject, "kind" | "state" | "label"> = now.kind === "left"
        ? { kind: imported.portal?.kind ?? "opening", state: imported.portal?.state ?? (imported.uvttPortal?.closed === false ? "open" : "closed"), label: now.reason }
        : now;
      return { id: scene.ids.openings[i]!, layer: "geometry", ...portal, bounds: bounds(a, b), segment: { a, b } };
    }),
    ...setup.marks.map((mark, i): StudioSelectionObject =>
      ({ id: scene.ids.marks[i]!, layer: "geometry", kind: "mark", label: mark.reason, bounds: markBounds(mark.square, scene.grid, scene.source) })),
    ...(scene.encounter?.tokens.map((p, i): StudioSelectionObject =>
      ({ id: scene.ids.placements[i]!, layer: "placements", kind: "token", hidden: p.hidden,
        label: p.name ?? scene.creatures.find((c) => c.key === p.creatureKey)?.data.name ?? p.creatureKey,
        bounds: placementBounds(scene, p) })) ?? []),
  ];
}

function outOfScope(): never {
  throw new StudioAuthoringError("scope", "An edit falls outside the saved layer, object or destination scope. Ask the owner for a new selection.");
}

export function deriveScope(scene: RevisionScene, selection: StudioSelection): StudioSelection {
  const { region, objectIds, wholeObjectIds, layers } = selection;
  if (region.maxX > scene.source.width || region.maxY > scene.source.height) outOfScope();
  const objects = new Map(selectionObjects(scene).map((object) => [object.id, object]));
  const whole = new Set(wholeObjectIds);
  if (wholeObjectIds.some((id) => !objectIds.includes(id))) outOfScope();
  for (const id of objectIds) {
    const object = objects.get(id);
    if (!object || !layers.includes(object.layer)) outOfScope();
    const coverage = studioObjectCoverage(object, region);
    if (coverage !== "inside" && (!whole.has(id) || (object.bounds && coverage !== "crossing"))) outOfScope();
  }
  return { region, layers: [...new Set(layers)], objectIds: [...new Set(objectIds)], wholeObjectIds: [...whole] };
}

/** Recompiling a drawn portal can cut or fill a gap in a separate solid wall. */
function checkPortalCuts(base: RevisionScene, lines: readonly DraftLine[], authorized: ReadonlySet<string>) {
  const previousLines = base.map.setup?.lines ?? [];
  const portals = (draft: readonly DraftLine[]) => draft.filter((line) => line.kind !== "wall")
    .map((line) => ({ ...lineSegment(line, base.grid), portal: true }));
  const before = portals(previousLines), after = portals(lines);
  if (digest(before) === digest(after)) return;

  const parts = (wall: Segment, cuts: typeof before) => cuts.length ? removePortalOverlaps([wall, ...cuts]).slice(0, -cuts.length) : [wall];
  const changed = (wall: Segment) => digest(parts(wall, before)) !== digest(parts(wall, after));
  for (const [index, line] of previousLines.entries()) {
    if (line.kind === "wall" && !authorized.has(base.ids.lines[index]!) && changed(lineSegment(line, base.grid))) outOfScope();
  }
  if (base.sourceBoard?.walls.some((wall) => !hasPortalBounds(wall) && changed(wall))) {
    throw new StudioAuthoringError("scope", "This edit would change an imported source wall. Adjust it in the builder.");
  }
}

export function applyCorrection(base: RevisionScene, scope: StudioSelection, operations: readonly StudioOperation[]): RevisionScene {
  const candidate = structuredClone(base);
  const setup = candidate.map.setup ?? structuredClone(EMPTY_MAP_SETUP);
  const authorized = new Set(scope.objectIds);
  const { grid } = base;
  const layer = (key: StudioSelection["layers"][number]) => { if (!scope.layers.includes(key)) outOfScope(); };
  const index = (ids: readonly string[], id: string) => {
    const i = ids.indexOf(id);
    if (i < 0 || !authorized.has(id)) outOfScope();
    return i;
  };
  const inside = (p: Point) => { if (!contains(scope.region, bounds(p))) outOfScope(); };
  const invalid = (message: string): never => { throw new StudioAuthoringError("invalid", message); };
  let painted = false;
  let geometryChanged = false;
  for (const op of operations) {
    switch (op.op) {
      case "terrain.paint": {
        layer("terrain");
        if (draftTerrainState(setup, grid) === "otherGrid") invalid("This terrain belongs to a different grid. Review it in the builder first.");
        if (paintProblem(op.runs)) invalid("Use bounded terrain runs with no overlapping cells.");
        for (const run of op.runs) {
          if (!runOnMap(run, grid, base.source) || !overlaps(scope.region, cellRect(run.start, run.row, grid)) ||
              !overlaps(scope.region, cellRect(run.end, run.row, grid))) outOfScope();
        }
        setup.terrain = paintTerrain(setup.terrain ?? [], op.runs);
        if (!TerrainRuns.safeParse(setup.terrain).success) invalid("The edited terrain exceeds the native map limit.");
        setup.terrainGrid = terrainGridOf(grid);
        painted = true;
        break;
      }
      case "placement.move":
      case "placement.set_visibility": {
        layer("placements");
        const i = index(candidate.ids.placements, op.id);
        const token = candidate.encounter!.tokens[i]!;
        if (op.op === "placement.move") {
          token.square = op.square;
          const area = placementBounds(candidate, token);
          if (!area || !contains(scope.region, area)) outOfScope();
        } else token.hidden = op.hidden;
        break;
      }
      case "line.add":
      case "line.update":
      case "line.remove": {
        layer("geometry");
        const i = op.op === "line.add" ? setup.lines.length : index(candidate.ids.lines, op.id);
        if (op.op === "line.remove") {
          setup.lines.splice(i, 1);
          candidate.ids.lines.splice(i, 1);
        } else {
          const previous = setup.lines[i];
          for (const endpoint of ["from", "to"] as const) {
            if (!previous || digest(previous[endpoint]) !== digest(op.line[endpoint])) inside(cornerPoint(op.line[endpoint], grid));
          }
          setup.lines[i] = op.line;
          if (op.op === "line.add") candidate.ids.lines.push(randomUUID());
        }
        geometryChanged = true;
        break;
      }
      case "opening.set": {
        layer("geometry");
        const number = index(candidate.ids.openings, op.id) + 1;
        const checked = DraftOpening.safeParse({ ...op.opening, number });
        if (!checked.success) invalid("Provide valid opening settings.");
        setup.openings = [...setup.openings.filter((o) => o.number !== number), checked.data!].sort((a, b) => a.number - b.number);
        geometryChanged = true;
        break;
      }
      case "mark.add":
      case "mark.update":
      case "mark.remove": {
        layer("geometry");
        const i = op.op === "mark.add" ? setup.marks.length : index(candidate.ids.marks, op.id);
        if (op.op === "mark.remove") {
          setup.marks.splice(i, 1);
          candidate.ids.marks.splice(i, 1);
        } else {
          const previous = setup.marks[i];
          if (!previous || digest(previous.square) !== digest(op.mark.square)) {
            const cell = markBounds(op.mark.square, grid, base.source);
            if (!cell) throw new StudioAuthoringError("invalid", "That mark is off the map.");
            if (!contains(scope.region, cell)) outOfScope();
          }
          setup.marks[i] = op.mark;
          if (op.op === "mark.add") candidate.ids.marks.push(randomUUID());
        }
        geometryChanged = true;
        break;
      }
    }
  }
  if (!DraftMapSetup.safeParse(setup).success) invalid("The edited setup exceeds native map limits.");
  if (geometryChanged) {
    checkPortalCuts(base, setup.lines, authorized);
    const beforeBoard = draftMapBoard(base.sourceBoard, base.map.setup, grid, base.source);
    const board = draftMapBoard(candidate.sourceBoard, setup, grid, candidate.source);
    if (!board.ok) invalid(board.problems.join("\n"));
    if (board.ok && board.blockedLines.some((i) => !beforeBoard.ok || !beforeBoard.blockedLines.some((j) =>
      base.ids.lines[j] === candidate.ids.lines[i] && digest(base.map.setup?.lines[j]) === digest(setup.lines[i])))) {
      invalid("A proposed opening is still obstructed by a wall.");
    }
  }
  if (candidate.encounter && !DraftEncounter.safeParse({ key: "draft", ...candidate.encounter }).success) invalid("The edited encounter exceeds native placement limits.");
  const terrain = draftTerrainState(setup, grid) === "ready" ? setup.terrain ?? [] : [];
  const oldSetup = base.map.setup;
  const oldTerrain = draftTerrainState(oldSetup, grid) === "ready" ? oldSetup?.terrain ?? [] : [];
  for (const [i, placement] of (candidate.encounter?.tokens ?? []).entries()) {
    const old = base.encounter!.tokens[i]!;
    const moved = digest(placement.square) !== digest(old.square);
    if (!placement.square || (!moved && !painted)) continue;
    const size = candidate.creatures.find((c) => c.key === placement.creatureKey)!.data.size;
    const center = footprintCenter(placement.square, size, grid, candidate.source);
    if (moved && !center) invalid("That token footprint is off the map.");
    if (center && footprintOnBlocked(center, size, grid, terrain) && (moved || !footprintOnBlocked(center, size, grid, oldTerrain))) {
      invalid(`Placement ${candidate.ids.placements[i]} would occupy Blocked terrain.`);
    }
  }
  candidate.map.setup = setup;
  return candidate;
}
