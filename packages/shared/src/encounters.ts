import { TerrainRuns, type TerrainRun } from "./terrain";
import { z } from "zod";
import { GridSpec } from "./geometry";
import { FogRegion, Id, MapImage, Scene, Token, Wall, MAX_WALLS, type TableState } from "./state";

/** Format version of a stored encounter template (FR-GM-13, ADR 0024). Bump when the data shape changes. */
export const ENCOUNTER_TEMPLATE_VERSION = 1;
/** Most encounter templates one GM account holds. */
export const MAX_ENCOUNTER_TEMPLATES = 50;
export const MAX_ENCOUNTER_NAME = 60;

/**
 * A token as a template stores it: everything that makes the monster, nothing that ties it to
 * a table. No id (each apply makes new ones), no owners (players differ per table) and no
 * initiative score (an encounter is not running).
 */
export const TemplateToken = Token.omit({ id: true, ownerIds: true, initiative: true });
export type TemplateToken = z.infer<typeof TemplateToken>;

/**
 * The board a template saves. The map is the GM's library map by id, so the file outlives any
 * room; apply resolves its address at that moment. Walls are optional for compatibility with
 * existing version-one templates; new saves include walls and portals.
 */
export const EncounterTemplateData = z.object({
  map: z.object({
    assetId: Id,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  grid: GridSpec,
  terrain: TerrainRuns.optional(),
  tokens: z.array(TemplateToken).max(500),
  fog: z.array(FogRegion.omit({ id: true })).max(100),
  walls: z.array(Wall.omit({ id: true })).max(MAX_WALLS).optional(),
});
export type EncounterTemplateData = z.infer<typeof EncounterTemplateData>;

/** A template read by the server for one apply: validated, with its map's address resolved. */
export interface ResolvedEncounter {
  id: string;
  name: string;
  scene: Scene;
  tokens: TemplateToken[];
  fog: Omit<FogRegion, "id">[];
  walls?: Omit<Wall, "id">[];
  terrain?: TerrainRun[];
}

/** A template's saved board for a read-only preview in the library: what an apply would place, before it is placed. */
export interface EncounterPreview {
  name: string;
  terrain?: TerrainRun[];
  map: MapImage;
  grid: GridSpec;
  tokens: TemplateToken[];
  fog: Omit<FogRegion, "id">[];
}

/** The board an apply makes: the template's, with fresh ids, no owners and nothing running. */
export function encounterTable(encounter: ResolvedEncounter, newId: () => string): TableState {
  const tokens: TableState["tokens"] = {};
  for (const token of encounter.tokens) {
    const id = newId();
    tokens[id] = { ...token, id, ownerIds: [] };
  }
  const fog: TableState["fog"] = {};
  for (const region of encounter.fog) {
    const id = newId();
    fog[id] = { ...region, id };
  }
  const walls: TableState["walls"] = {};
  for (const wall of encounter.walls ?? []) {
    const id = newId();
    walls[id] = { ...wall, id };
  }
  return { scene: encounter.scene, tokens, templates: {}, fog, initiative: null, walls, ...(encounter.terrain ? { terrain: { base: encounter.terrain, effects: [] } } : {}) };
}

/** Rebuilds a map image from a template's saved reference and the address the server resolved. */
export function templateMapImage(data: EncounterTemplateData["map"], url: string): MapImage {
  return { url, width: data.width, height: data.height, assetId: data.assetId };
}
