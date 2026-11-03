/** Run with `node --import tsx scripts/bench-terrain.ts`; observational local bounds evidence, not an SLA. */
import { performance } from "node:perf_hooks";
import { emptyRoomState, effectiveTerrain, movementTerrain, terrainForViewer, paintTerrain, type TerrainRun } from "../packages/shared/src";
const grid = { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" };
const runs: TerrainRun[] = Array.from({ length: 10_000 }, (_, i) => ({ row: Math.floor(i / 100), start: i % 100, end: i % 100, kind: i % 2 ? "blocked" : "difficult" }));
const fog = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`f${i}`, { id: `f${i}`, shape: "rect" as const, points: [{ x: i * 70, y: 7350 }, { x: i * 70 + 35, y: 7350 }, { x: i * 70 + 35, y: 7385 }, { x: i * 70, y: 7385 }] }]));
const state = { ...emptyRoomState("bench"), scene: { map: { url: "/map", width: 7700, height: 7700 }, grid }, terrain: { base: runs, effects: [] }, fog };
const measure = (fn: () => unknown) => { const times = []; for (let i = 0; i < 4; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); } return times.slice(1).map((n) => Math.round(n * 100) / 100); };
const result = {
  cells: 10000, runs: runs.length, fogRegions: 100,
  paintMs: measure(() => paintTerrain(runs, [{ row: 0, start: 0, end: 0, kind: "blocked" }])),
  routeMs: measure(() => movementTerrain({ x: 35, y: 35 }, { x: 6965, y: 6965 }, 2, grid, effectiveTerrain(state.terrain))),
  projectionMs: measure(() => terrainForViewer(state, { fog, sight: null })),
};
process.stdout.write(`${JSON.stringify(result)}\n`);
