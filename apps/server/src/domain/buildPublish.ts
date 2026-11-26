import { digest } from "./studioSceneRevision";
import { studioAlias } from "./studioLibraryMedia";
import { publicBoard } from "../store/libraryPreparation";
import { PRIVATE_PUBLISH_MESSAGE } from "./studioMedia";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_GRID,
  ENCOUNTER_TEMPLATE_VERSION,
  EMPTY_LIBRARY_BOARD,
  MAX_LIBRARY_FOLDER,
  draftEncounterToTemplate,
  draftMapBoard,
  draftTerrainProblems,
  draftTerrainState,
  readDraftMap,
  squareSizeOf,
  type BuildCreatureValues,
  type DraftCreatureState,
  type DraftEncounterState,
  type DraftMapState,
  type LibraryMapBoard,
} from "@vtt/shared";
import { BuildPublishConflictError, type BuildFileRecord, type BuildItemKind, type BuildItemRecord, type BuildPublishPlan, type BuildRecord } from "../store/buildStore";
import type { LibraryAssetRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";

export interface PublishSelection {
  creatures: string[];
  maps: string[];
  encounters: string[];
  /** The version of each item the person was looking at, keyed `kind/key`. */
  reviewed: Record<string, string>;
}

export interface PublishProblem {
  /** What it is about, such as `encounter ambush`. */
  item: string;
  message: string;
}

export type PublishDependencies = Pick<RoomStore, "findAsset" | "findCreature">;
export interface PublishTrace {
  items: BuildItemRecord[];
  files: Map<string, BuildFileRecord>;
  maps: Map<string, LibraryAssetRecord>;
  creatures: Map<string, { values: BuildCreatureValues; art: LibraryAssetRecord | null }>;
}
type ExactInputs = { files: BuildFileRecord[]; items: BuildItemRecord[]; trace: PublishTrace; pinnedMaps: ReadonlySet<string> };

export type PublishPlanResult = { ok: true; plan: BuildPublishPlan } | { ok: false; problems: PublishProblem[] };

/** The name a published file gets when no draft names it: its file name, without the extension. */
const nameFromFile = (file: BuildFileRecord) => file.originalName.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "Untitled";

/**
 * Works out what a publish adds, reading only (ADR 0053). An encounter brings the map, creatures
 * and art it needs. What was already published is reused, at its current library values, so a
 * later publish sees the GM's edits. Everything is checked here so `publishBuild` can write it in one step.
 */
export function planPublish(store: RoomStore, build: BuildRecord, selection: PublishSelection, now: string): Promise<PublishPlanResult>;
export function planPublish(store: PublishDependencies, build: BuildRecord, selection: PublishSelection, now: string, exact: ExactInputs): Promise<PublishPlanResult>;
export async function planPublish(store: PublishDependencies | RoomStore, build: BuildRecord, selection: PublishSelection, now: string, exact?: ExactInputs): Promise<PublishPlanResult> {
  const [files, items] = exact ? [exact.files, exact.items] : await Promise.all([
    (store as RoomStore).listBuildFiles(build.id), (store as RoomStore).listBuildItems(build.id),
  ]);
  const fileById = new Map(files.map((f) => [f.id, f]));
  const itemByKey = new Map(items.map((i) => [`${i.kind}/${i.key}`, i]));
  const problems: PublishProblem[] = [];
  const problem = (item: string, message: string) => void problems.push({ item, message });
  const find = (kind: BuildItemKind, key: string): BuildItemRecord | undefined => {
    const item = itemByKey.get(`${kind}/${key}`);
    if (!item) problem(`${kind} ${key}`, "It isn't in this build.");
    return item;
  };

  const creatureKeys = new Set(selection.creatures);
  const mapKeys = new Set(selection.maps);
  const encounterItems: BuildItemRecord[] = [];
  for (const key of new Set(selection.encounters)) {
    const item = find("encounter", key);
    if (!item || item.publishedId) continue;
    encounterItems.push(item);
    const data = item.data as unknown as DraftEncounterState;
    mapKeys.add(data.mapKey);
    for (const token of data.tokens) creatureKeys.add(token.creatureKey);
  }

  // A person looks before anything is used (ADR 0053), so every draft this publish relies on,
  // chosen or brought along, must still be the version they saw.
  const closure = [
    ...encounterItems,
    ...[...mapKeys].flatMap((key) => itemByKey.get(`map/${key}`) ?? []),
    ...[...creatureKeys].flatMap((key) => itemByKey.get(`creature/${key}`) ?? []),
  ];
  if (exact) exact.trace.items = closure;
  const relied = closure.filter((item) => !item.publishedId);
  const changed = relied.filter((item) => selection.reviewed[`${item.kind}/${item.key}`] !== item.updatedAt);
  if (changed.length > 0) {
    throw new BuildPublishConflictError(`Something changed since you looked at it: ${changed.map((i) => `${i.kind} ${i.key}`).join(", ")}. Check it, then publish again.`);
  }

  const plan: BuildPublishPlan = {
    buildId: build.id, ownerGmId: build.ownerGmId,
    reviewed: relied.map((i) => ({ kind: i.kind, key: i.key, updatedAt: i.updatedAt })),
    assets: [], creatures: [], maps: [], encounters: [],
  };
  plan.dependencies = closure.map(({ kind, key }) => ({ kind, key }));
  plan.sourceFiles = closure.flatMap((item) => [item.data.fileId, item.data.imageFileId].filter((id): id is string => typeof id === "string"));
  const assetForFile = new Map<string, LibraryAssetRecord>();

  /** The library row for a file: the one it already has, or a new one added to the plan. A map brings its grid and board. */
  const assetOf = async (fileId: string, item: string, name: string, draft: { grid: DraftMapState["grid"]; board: LibraryMapBoard | null } | null): Promise<LibraryAssetRecord | null> => {
    const planned = assetForFile.get(fileId);
    if (planned) {
      if (exact && draft && digest([draft.grid, publicBoard(draft.board)]) !== digest([planned.grid, publicBoard(planned.board)])) {
        problem(item, "These draft maps use the same artwork with incompatible grids or boards.");
        return null;
      }
      return planned;
    }
    const file = fileById.get(fileId);
    if (!file) { problem(item, "Its file isn't in this build any more."); return null; }
    if (file.studio && !exact) { problem(item, PRIVATE_PUBLISH_MESSAGE); return null; }
    exact?.trace.files.set(fileId, file);
    if (file.publishedAssetId) {
      const existing = await store.findAsset(file.publishedAssetId, build.ownerGmId);
      if (!existing) { problem(item, "Its file was published and then deleted from the library."); return null; }
      if (!exact && existing.studioOriginal) { problem(item, PRIVATE_PUBLISH_MESSAGE); return null; }
      if (exact && draft && digest([draft.grid, publicBoard(draft.board)]) !== digest([existing.grid, publicBoard(existing.board)])) {
        problem(item, "The draft grid or board differs from this artwork's library map.");
        return null;
      }
      assetForFile.set(fileId, existing);
      return existing;
    }
    // The object stays where it is: the new row points at what the build already stored.
    const id = randomUUID();
    const key = file.studio ? studioAlias(id, file.studio.contentType) : file.objectKey;
    const record: LibraryAssetRecord = {
      id, ownerGmId: build.ownerGmId, kind: file.kind, objectKey: key, url: file.studio ? `/uploads/${key}` : file.url,
      ...(file.studio && { studioOriginal: { key: file.objectKey, contentType: file.studio.contentType, buildId: build.id } }),
      name: name.slice(0, 80) || nameFromFile(file),
      width: file.width, height: file.height, byteSize: file.sizeBytes, grid: draft?.grid ?? null, board: draft ? draft.board : file.board,
      sourceHash: file.sourceHash, detectionSourceHash: file.detectionSourceHash, detectionVersion: file.detectionVersion, detectionError: file.detectionError,
      detectionStatus: file.detectionStatus, detectionAttempt: file.detectionAttempt, detectionResult: file.detectionResult, detectionUpdatedAt: file.detectionUpdatedAt,
      // Filed under the build's name, with everything else the game brings (ADR 0075).
      folder: buildFolder(build.name), createdAt: now,
    };
    plan.assets.push({ fileId, record });
    assetForFile.set(fileId, record);
    return record;
  };

  const units = { unitsPerCell: build.gameProfile?.unitsPerCell ?? DEFAULT_GRID.unitsPerCell, unitLabel: build.gameProfile?.unitLabel ?? DEFAULT_GRID.unitLabel };
  /** A draft map as it reads now: its grid follows the owner's choice and detection (ADR 0053). */
  const readMap = (key: string, data: DraftMapState) => exact?.pinnedMaps.has(key) ? data : readDraftMap(data, fileById.get(data.fileId) ?? null, build.aiGrid, units);

  // A grid detection and the AI agreed on takes its square size from the game profile now, which
  // the AI can change without touching any map. So it must still be the size the person saw.
  const agreed = [...mapKeys].some((key) => {
    const item = itemByKey.get(`map/${key}`);
    return item && !item.publishedId && readMap(key, item.data as unknown as DraftMapState).gridBy === "agreement";
  });
  if (agreed && selection.reviewed.profile !== squareSizeOf(build.gameProfile)) {
    throw new BuildPublishConflictError(`The game's square size changed since you looked: one square is now ${squareSizeOf(build.gameProfile)}. Check it, then publish again.`);
  }

  const mapAssets = new Map<string, LibraryAssetRecord>();
  for (const key of mapKeys) {
    const item = find("map", key);
    if (!item) continue;
    const data = readMap(key, item.data as unknown as DraftMapState);
    if (item.publishedId) {
      const reused = await store.findAsset(item.publishedId, build.ownerGmId);
      if (!reused || reused.kind !== "map") { problem(`map ${key}`, "It was published and then deleted from the library."); continue; }
      if (!exact && reused.studioOriginal) { problem(`map ${key}`, PRIVATE_PUBLISH_MESSAGE); continue; }
      mapAssets.set(key, reused);
      exact?.trace.maps.set(key, reused);
      continue;
    }
    let board: LibraryMapBoard | null = fileById.get(data.fileId)?.board ?? null;
    if (!item.publishedId && data.setup) {
      const file = fileById.get(data.fileId);
      // Lines are in squares, so they need the grid that will be published with them.
      if (data.setup.lines.length > 0 && data.gridStatus !== "confirmed") { problem(`map ${key}`, "Its drawn walls need a confirmed grid first."); continue; }
      // So is terrain, and it must be the grid it was proposed on, so a correction can't move it (ADR 0071).
      const terrain = data.setup.terrain ?? [];
      if (terrain.length > 0) {
        if (data.gridStatus !== "confirmed") { problem(`map ${key}`, "Its terrain needs a confirmed grid first."); continue; }
        if (draftTerrainState(data.setup, data.grid) === "otherGrid") {
          problem(`map ${key}`, "Its terrain was proposed on a different grid from the one confirmed. Clear the terrain, or put the grid back.");
          continue;
        }
        const off = file ? draftTerrainProblems(terrain, data.grid, file) : [];
        if (off.length > 0) { for (const message of off) problem(`map ${key}`, message); continue; }
      }
      // Marks are notes for the person and never go on the board, so they don't hold a map back.
      const built = file ? draftMapBoard(file.board, { ...data.setup, marks: [] }, data.grid, file) : null;
      if (built && !built.ok) { for (const message of built.problems) problem(`map ${key}`, message); continue; }
      // The proposed terrain is the published Base layer; no terrain keeps what the file had.
      if (built) board = terrain.length > 0 ? { ...built.board, terrain } : built.board;
    }
    const asset = await assetOf(data.fileId, `map ${key}`, data.name, { grid: data.grid, board });
    if (!asset) continue;
    mapAssets.set(key, asset);
    exact?.trace.maps.set(key, asset);
    if (!item.publishedId) plan.maps.push({ key, assetId: asset.id });
  }

  const creatures = new Map<string, BuildCreatureValues>();
  for (const key of creatureKeys) {
    const item = find("creature", key);
    if (!item) continue;
    if (item.publishedId) {
      const existing = await store.findCreature(item.publishedId, build.ownerGmId);
      if (!existing) { problem(`creature ${key}`, "It was published and then deleted from the library."); continue; }
      const art = existing.imageAssetId ? await store.findAsset(existing.imageAssetId, build.ownerGmId) : null;
      if (existing.imageAssetId && !art) { problem(`creature ${key}`, "Its library artwork is no longer available."); continue; }
      if (!exact && art?.studioOriginal) { problem(`creature ${key}`, PRIVATE_PUBLISH_MESSAGE); continue; }
      const values = { ...existing, imageUrl: art?.url ?? null, assetId: art?.id ?? null };
      creatures.set(key, values);
      exact?.trace.creatures.set(key, { values, art });
      continue;
    }
    const data = item.data as unknown as DraftCreatureState;
    const art = data.imageFileId ? await assetOf(data.imageFileId, `creature ${key}`, data.name, null) : null;
    if (data.imageFileId && !art) continue;
    plan.creatures.push({
      key,
      record: {
        id: randomUUID(), ownerGmId: build.ownerGmId, name: data.name, size: data.size, hp: data.hp, maxHp: data.maxHp, ac: data.ac,
        attacks: data.attacks, color: data.color, conditions: data.conditions, imageAssetId: art?.id ?? null, createdAt: now,
        // Filed under the build's name, so a game's items arrive together (ADR 0075).
        folder: buildFolder(build.name),
      },
    });
    const values = { name: data.name, size: data.size, hp: data.hp, maxHp: data.maxHp, ac: data.ac, color: data.color, conditions: data.conditions, attacks: data.attacks, imageUrl: art?.url ?? null, assetId: art?.id ?? null };
    creatures.set(key, values);
    exact?.trace.creatures.set(key, { values, art });
  }

  for (const item of encounterItems) {
    const label = `encounter ${item.key}`;
    const data = item.data as unknown as DraftEncounterState;
    const mapItem = itemByKey.get(`map/${data.mapKey}`);
    const asset = mapAssets.get(data.mapKey);
    if (!mapItem || !asset) continue;
    const mapData = readMap(mapItem.key, mapItem.data as unknown as DraftMapState);
    // Already published: the library's grid and walls, which the GM may since have changed.
    const grid = mapItem.publishedId ? asset.grid : mapData.gridStatus === "confirmed" ? mapData.grid : null;
    if (!grid) { problem(label, `Its map "${mapData.name}" needs a confirmed grid first.`); continue; }
    const board: LibraryMapBoard = mapItem.publishedId
      ? publicBoard(asset.board)
      : asset.board ?? EMPTY_LIBRARY_BOARD;
    const built = draftEncounterToTemplate({ map: { assetId: asset.id, width: asset.width, height: asset.height }, grid, board, creatures, tokens: data.tokens });
    if (!built.ok) {
      for (const p of built.problems) problem(label, `${p.token}: ${p.message}`);
      continue;
    }
    plan.encounters.push({
      key: item.key,
      record: { id: randomUUID(), ownerGmId: build.ownerGmId, name: data.name, version: ENCOUNTER_TEMPLATE_VERSION, data: built.data, mapAssetId: asset.id, folder: buildFolder(build.name), createdAt: now, updatedAt: now },
    });
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, plan };
}

/** The library folder a build's maps, art, creatures and templates are published into: its name, cut to the folder limit (ADR 0075). */
export function buildFolder(name: string): string | null {
  const folder = name.trim().slice(0, MAX_LIBRARY_FOLDER).trim();
  return folder === "" ? null : folder;
}
