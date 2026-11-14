import { randomUUID } from "node:crypto";
import {
  DEFAULT_GRID,
  ENCOUNTER_TEMPLATE_VERSION,
  EMPTY_LIBRARY_BOARD,
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

export type PublishPlanResult = { ok: true; plan: BuildPublishPlan } | { ok: false; problems: PublishProblem[] };

/** The name a published file gets when no draft names it: its file name, without the extension. */
const nameFromFile = (file: BuildFileRecord) => file.originalName.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "Untitled";

/**
 * Works out what a publish adds, reading only (ADR 0053). An encounter brings the map, creatures
 * and art it needs. What was already published is reused, at its current library values, so a
 * later publish sees the GM's edits. Everything is checked here so `publishBuild` can write it in one step.
 */
export async function planPublish(store: RoomStore, build: BuildRecord, selection: PublishSelection, now: string): Promise<PublishPlanResult> {
  const [files, items] = await Promise.all([store.listBuildFiles(build.id), store.listBuildItems(build.id)]);
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
  const relied = [
    ...encounterItems,
    ...[...mapKeys].flatMap((key) => itemByKey.get(`map/${key}`) ?? []),
    ...[...creatureKeys].flatMap((key) => itemByKey.get(`creature/${key}`) ?? []),
  ].filter((item) => !item.publishedId);
  const changed = relied.filter((item) => selection.reviewed[`${item.kind}/${item.key}`] !== item.updatedAt);
  if (changed.length > 0) {
    throw new BuildPublishConflictError(`Something changed since you looked at it: ${changed.map((i) => `${i.kind} ${i.key}`).join(", ")}. Check it, then publish again.`);
  }

  const plan: BuildPublishPlan = {
    buildId: build.id, ownerGmId: build.ownerGmId,
    reviewed: relied.map((i) => ({ kind: i.kind, key: i.key, updatedAt: i.updatedAt })),
    assets: [], creatures: [], maps: [], encounters: [],
  };
  const assetForFile = new Map<string, LibraryAssetRecord>();

  /** The library row for a file: the one it already has, or a new one added to the plan. A map brings its grid and board. */
  const assetOf = async (fileId: string, item: string, name: string, draft: { grid: DraftMapState["grid"]; board: LibraryMapBoard | null } | null): Promise<LibraryAssetRecord | null> => {
    const planned = assetForFile.get(fileId);
    if (planned) return planned;
    const file = fileById.get(fileId);
    if (!file) { problem(item, "Its file isn't in this build any more."); return null; }
    if (file.publishedAssetId) {
      const existing = await store.findAsset(file.publishedAssetId, build.ownerGmId);
      if (!existing) { problem(item, "Its file was published and then deleted from the library."); return null; }
      assetForFile.set(fileId, existing);
      return existing;
    }
    // The object stays where it is: the new row points at what the build already stored.
    const record: LibraryAssetRecord = {
      id: randomUUID(), ownerGmId: build.ownerGmId, kind: file.kind, objectKey: file.objectKey, url: file.url, name: name.slice(0, 80) || nameFromFile(file),
      width: file.width, height: file.height, byteSize: file.sizeBytes, grid: draft?.grid ?? null, board: draft ? draft.board : file.board,
      sourceHash: file.sourceHash, detectionSourceHash: file.detectionSourceHash, detectionVersion: file.detectionVersion, detectionError: file.detectionError,
      detectionStatus: file.detectionStatus, detectionAttempt: file.detectionAttempt, detectionResult: file.detectionResult, detectionUpdatedAt: file.detectionUpdatedAt,
      createdAt: now,
    };
    plan.assets.push({ fileId, record });
    assetForFile.set(fileId, record);
    return record;
  };

  const units = { unitsPerCell: build.gameProfile?.unitsPerCell ?? DEFAULT_GRID.unitsPerCell, unitLabel: build.gameProfile?.unitLabel ?? DEFAULT_GRID.unitLabel };
  /** A draft map as it reads now: its grid follows the owner's choice and detection (ADR 0053). */
  const readMap = (data: DraftMapState) => readDraftMap(data, fileById.get(data.fileId) ?? null, build.aiGrid, units);

  // A grid detection and the AI agreed on takes its square size from the game profile now, which
  // the AI can change without touching any map. So it must still be the size the person saw.
  const agreed = [...mapKeys].some((key) => {
    const item = itemByKey.get(`map/${key}`);
    return item && !item.publishedId && readMap(item.data as unknown as DraftMapState).gridBy === "agreement";
  });
  if (agreed && selection.reviewed.profile !== squareSizeOf(build.gameProfile)) {
    throw new BuildPublishConflictError(`The game's square size changed since you looked: one square is now ${squareSizeOf(build.gameProfile)}. Check it, then publish again.`);
  }

  const mapAssets = new Map<string, LibraryAssetRecord>();
  for (const key of mapKeys) {
    const item = find("map", key);
    if (!item) continue;
    const data = readMap(item.data as unknown as DraftMapState);
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
    if (!item.publishedId) plan.maps.push({ key, assetId: asset.id });
  }

  const creatures = new Map<string, BuildCreatureValues>();
  for (const key of creatureKeys) {
    const item = find("creature", key);
    if (!item) continue;
    if (item.publishedId) {
      const existing = await store.findCreature(item.publishedId, build.ownerGmId);
      if (!existing) { problem(`creature ${key}`, "It was published and then deleted from the library."); continue; }
      creatures.set(key, { ...existing, assetId: existing.imageAssetId });
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
      },
    });
    creatures.set(key, { name: data.name, size: data.size, hp: data.hp, maxHp: data.maxHp, ac: data.ac, color: data.color, conditions: data.conditions, attacks: data.attacks, imageUrl: art?.url ?? null, assetId: art?.id ?? null });
  }

  for (const item of encounterItems) {
    const label = `encounter ${item.key}`;
    const data = item.data as unknown as DraftEncounterState;
    const mapItem = itemByKey.get(`map/${data.mapKey}`);
    const asset = mapAssets.get(data.mapKey);
    if (!mapItem || !asset) continue;
    const mapData = readMap(mapItem.data as unknown as DraftMapState);
    // Already published: the library's grid and walls, which the GM may since have changed.
    const grid = mapItem.publishedId ? asset.grid : mapData.gridStatus === "confirmed" ? mapData.grid : null;
    if (!grid) { problem(label, `Its map "${mapData.name}" needs a confirmed grid first.`); continue; }
    const board: LibraryMapBoard = mapItem.publishedId
      ? await store.findAssetBoard(asset.id, build.ownerGmId) ?? EMPTY_LIBRARY_BOARD
      : asset.board ?? EMPTY_LIBRARY_BOARD;
    const built = draftEncounterToTemplate({ map: { assetId: asset.id, width: asset.width, height: asset.height }, grid, board, creatures, tokens: data.tokens });
    if (!built.ok) {
      for (const p of built.problems) problem(label, `${p.token}: ${p.message}`);
      continue;
    }
    plan.encounters.push({
      key: item.key,
      record: { id: randomUUID(), ownerGmId: build.ownerGmId, name: data.name, version: ENCOUNTER_TEMPLATE_VERSION, data: built.data, mapAssetId: asset.id, createdAt: now, updatedAt: now },
    });
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, plan };
}
