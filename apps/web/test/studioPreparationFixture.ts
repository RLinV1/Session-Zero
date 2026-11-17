import { DEFAULT_GRID, footprintCenter, StudioSnapshot } from "@vtt/shared";

export const STUDIO_BUILD_ID = "11111111-1111-4111-8111-111111111111";
export const STUDIO_MAP_ID = "22222222-2222-4222-8222-222222222222";
export const STUDIO_ART_ID = "33333333-3333-4333-8333-333333333333";
export function preparationFixture(): StudioSnapshot {
  const grid = { ...DEFAULT_GRID, cellSize: 50, offsetX: 10, offsetY: 5 };
  const dimensions = { width: 800, height: 600 };
  const source = { id: STUDIO_MAP_ID, kind: "map", name: "Chapel.png", ...dimensions, sizeBytes: 1000, privacy: "private", originalSha256: "a".repeat(64), canonicalId: "canonical-a", orientation: 1, previewHash: "preview-a" };
  return StudioSnapshot.parse({
    version: 2, buildId: STUDIO_BUILD_ID, buildName: "Synthetic chapel", ownerName: "Synthetic GM", sourceFileId: STUDIO_MAP_ID,
    context: { sourceFileId: STUDIO_MAP_ID, mapKey: "chapel", encounterKey: "sentries" }, files: [source, { ...source, id: STUDIO_ART_ID, kind: "token", name: "Sentry.png" }],
    maps: [{ key: "chapel", name: "Chapel", fileId: STUDIO_MAP_ID }, { key: "courtyard", name: "Courtyard", fileId: STUDIO_MAP_ID }],
    encounters: [{ key: "sentries", name: "Sentries", mapKey: "chapel" }, { key: "guards", name: "Guards", mapKey: "courtyard" }], allowed: { grids: true, walls: true, terrain: true },
    scene: { source, mapName: "Chapel", encounterName: "Sentries", grid, gridStatus: "proposed", gridBy: null,
      detection: { status: "suggested", suggestion: { cellSize: 50, offsetX: 10, offsetY: 5 }, error: null, attempt: 1 },
      walls: [{ id: "wall-left", a: { x: 10, y: 5 }, b: { x: 60, y: 5 } }, { id: "door", a: { x: 60, y: 5 }, b: { x: 110, y: 5 }, portal: { kind: "door", state: "open" } }],
      terrain: [{ row: 0, start: -1, end: 0, kind: "difficult" }, { row: 1, start: 2, end: 2, kind: "blocked" }], terrainState: "ready", marks: [{ square: { column: 3, row: 2 }, reason: "Unclear archway" }],
      tokens: [{ index: 0, creatureKey: "sentry", name: "Sentry", size: .5, color: "#446688", imageFileId: STUDIO_ART_ID, hidden: true, square: { column: 1, row: 1 }, center: footprintCenter({ column: 1, row: 1 }, .5, grid, dimensions) }], issues: [{ kind: "uncertain", key: "chapel", message: "Unclear archway" }],
    }, outcomes: [], intakeOutcomes: [], fingerprint: "saved-a", refreshIntervalMs: 5000, websitePath: `/builds/${STUDIO_BUILD_ID}`,
  });
}
