import { createHash } from "node:crypto";
import {
  StudioSnapshot, DEFAULT_GRID, EMPTY_MAP_SETUP, readDraftMap, draftMapBoard, draftTerrainState, footprintCenter, checkBuild,
  type StudioContext, type StudioFile, type StudioScene, type DraftMapState, type DraftCreatureState, type DraftEncounterState, type Locale,
} from "@vtt/shared";
import type { BuildFileRecord } from "../store/buildStore";
import type { StudioPreparationRecords } from "../store/studioPreparation";
import { studioIssueText } from "../i18n/studioIssues";
import { serverZhTW } from "../i18n/zh-TW";
import { serverEn } from "../i18n/en";

export function studioFile(file: BuildFileRecord): StudioFile {
  return { id: file.id, kind: file.kind, name: file.originalName, width: file.width, height: file.height, sizeBytes: file.sizeBytes,
    privacy: file.studio ? "private" : "legacy-public", originalSha256: file.studio?.originalSha256 ?? null, canonicalId: file.studio?.canonicalId ?? null,
    orientation: file.studio?.orientation ?? null, previewHash: file.studio?.previewSha256 ?? null };
}

/** A single already-coherent store read becomes the same native scene for both adapters. */
export function studioPreparationSnapshot(records: StudioPreparationRecords, ownerName: string | null, locale: Locale = "en"): StudioSnapshot {
  const { build, files, items } = records;
  const units = { unitsPerCell: build.gameProfile?.unitsPerCell ?? DEFAULT_GRID.unitsPerCell, unitLabel: build.gameProfile?.unitLabel ?? DEFAULT_GRID.unitLabel };
  const maps = items.filter((i) => i.kind === "map").map((i) => ({ key: i.key, data: readDraftMap(i.data as unknown as DraftMapState, files.find((f) => f.id === i.data.fileId) ?? null, build.aiGrid, units), flags: i.flags }));
  const creatures = items.filter((i) => i.kind === "creature").map((i) => ({ key: i.key, data: i.data as unknown as DraftCreatureState, flags: i.flags }));
  const encounters = items.filter((i) => i.kind === "encounter").map((i) => ({ key: i.key, data: i.data as unknown as DraftEncounterState, flags: i.flags }));
  const requested = build.studioContext;
  const working = records.working;
  const candidate = working?.revision.scene;
  if (candidate && working) {
    for (const map of maps) if (map.key === working.target.mapKey) map.data = candidate.map;
    for (const encounter of encounters) if (encounter.key === working.target.encounterKey && candidate.encounter) encounter.data = candidate.encounter;
  }
  const sourceFileId = requested ? requested.sourceFileId : build.studioFileId ?? files.find((f) => f.kind === "map")?.id ?? null;
  const source = files.find((f) => f.id === sourceFileId && f.kind === "map") ?? null;
  const map = maps.find((m) => m.key === requested?.mapKey && m.data.fileId === source?.id);
  const encounter = encounters.find((e) => e.key === requested?.encounterKey && e.data.mapKey === map?.key);
  const context: StudioContext = { sourceFileId: source?.id ?? null, mapKey: map?.key ?? null, encounterKey: encounter?.key ?? null };
  const fallbackGrid = source?.grid ?? (source?.detectionStatus === "suggested" && source.detectionResult ? { ...source.detectionResult, ...units } : null);
  // A detector suggestion is inspectable before save_map, but never reinterprets a saved map
  // whose authoring grid was removed. Match setupView/publication's saved-map grid exactly.
  const grid = candidate?.grid ?? (map ? map.data.grid ?? (map.data.proposedGrid ? { ...map.data.proposedGrid, ...units } : null) : fallbackGrid);
  const setup = map?.data.setup ?? EMPTY_MAP_SETUP;
  const board = source ? draftMapBoard(candidate ? candidate.sourceBoard : source.board, setup, grid, source) : null;
  const terrainStatus = draftTerrainState(setup, grid);
  const referencedCreatures = new Set(encounter?.data.tokens.map((t) => t.creatureKey) ?? []);
  const issues: StudioScene["issues"] = checkBuild({ profile: build.gameProfile, audience: "owner", aiWalls: build.aiWalls, files,
    maps: map ? [map] : [], encounters: encounter ? [encounter] : [], creatures: creatures.filter((c) => referencedCreatures.has(c.key)),
  }).map((i) => ({ kind: i.type === "flag" ? "uncertain" as const : "problem" as const, key: i.target?.key ?? null, message: i.message }));
  if (board && !board.ok) issues.push(...board.problems.map((message) => ({ kind: "problem" as const, key: map?.key ?? null, message })));
  if ((requested?.mapKey && !map) || (requested?.encounterKey && !encounter)) {
    issues.push({ kind: "problem", key: requested.mapKey, message: serverEn["studio.issue.contextChanged"] });
  }
  const scene: StudioScene = {
    source: candidate?.source ?? (source ? studioFile(source) : null), mapName: map?.data.name ?? null, encounterName: encounter?.data.name ?? null,
    grid, gridStatus: map?.data.gridStatus ?? (source?.grid ? "confirmed" : "none"), gridBy: map?.data.gridBy ?? (source?.grid ? "file" : null),
    detection: source?.detectionStatus ? { status: source.detectionStatus, suggestion: source.detectionResult, error: source.detectionError, attempt: source.detectionAttempt } : null,
    // View-local keys only: M3 owns stable authoring identities.
    walls: (board?.ok ? board.board.walls : source?.board?.walls ?? []).map((wall, index) => ({ ...wall, id: `display-wall-${index}` })),
    terrain: terrainStatus === "ready" ? setup.terrain ?? [] : [], terrainState: terrainStatus === "none" ? "empty" : terrainStatus,
    marks: setup.marks,
    tokens: (encounter?.data.tokens ?? []).map((token, index) => {
      const creature = candidate ? candidate.creatures.find((c) => c.key === token.creatureKey)?.data : creatures.find((c) => c.key === token.creatureKey)?.data;
      const size = creature?.size ?? 1;
      return { index, ...(candidate ? { id: candidate.ids.placements[index] } : {}), creatureKey: token.creatureKey, name: token.name ?? creature?.name ?? token.creatureKey, size,
        color: creature?.color ?? "#6a7280", imageFileId: creature?.imageFileId ?? null, hidden: token.hidden, square: token.square,
        center: token.square && grid && source ? footprintCenter(token.square, size, grid, source) : null };
    }), issues: [
      ...issues.map((issue) => ({ ...issue, message: studioIssueText(locale, issue.kind, issue.message) })),
      ...(working?.drifted ? [{ kind: "problem" as const, key: working.target.mapKey,
        message: (locale === "zh-TW" ? serverZhTW : serverEn)["studio.authoring.drift"] }] : []),
    ],
  };
  const output = {
    version: 2 as const, buildId: build.id, buildName: build.name, ownerName, sourceFileId: context.sourceFileId, files: files.map(studioFile), context,
    ...(working ? { workingRevisionId: working.revision.id, workingBindingChanged: working.drifted } : {}),
    maps: maps.map((m) => ({ key: m.key, name: m.data.name, fileId: m.data.fileId })),
    encounters: encounters.map((e) => ({ key: e.key, name: e.data.name, mapKey: e.data.mapKey })),
    allowed: { grids: build.aiGrid, walls: build.aiWalls, terrain: build.aiTerrain }, scene, outcomes: build.studioOutcomes ?? [], intakeOutcomes: build.studioIntake ?? [],
    refreshIntervalMs: 5000, websitePath: `/builds/${build.id}`, fingerprint: "",
  };
  output.fingerprint = createHash("sha256").update(JSON.stringify(output)).digest("hex");
  return StudioSnapshot.parse(output);
}
