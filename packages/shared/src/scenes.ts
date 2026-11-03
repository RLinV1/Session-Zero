import { z } from "zod";
import { TableState, TokenGroup, Id, tableOf, type RoomState } from "./state";

export const MAX_SCENES = 20;
export const MAX_SCENE_NAME = 60;
export const INITIAL_SCENE_ID = "initial";
export const SceneName = z.string().trim().min(1).max(MAX_SCENE_NAME);
/** Inactive boards are GM-only. Active board fields remain in RoomState. */
export const SavedScene = z.object({
  table: TableState,
  groups: z.record(Id, TokenGroup),
  tokenGroups: z.record(Id, Id),
  boardEpoch: z.number().int().nonnegative().optional(),
  terrainRevision: z.number().int().nonnegative().optional(),
});
export type SavedScene = z.infer<typeof SavedScene>;

export function sceneNamesOf(state: RoomState): Record<string, string> {
  return state.sceneNames ?? { [INITIAL_SCENE_ID]: "Scene 1" };
}

/** Only board preparation: room-wide actions and live combat stay on the active scene. */
export function isScenePreparationCommand(command: { type: string }): boolean {
  return /^(token\.(create|duplicate|move|delete|setAppearance|configure|setImage|setOwners|setHidden|setStats|setConditions)|group\.(create|rename|delete|assign|unassign)|scene\.(setMap|setGrid|setLineOfSight|setIsometric|setSightRange|importUVTT|savePreparation)|terrain\.(paint|effect\.(create|rename|remove))|wall\.(add|update|remove|clear|applyDetected)|portal\.(set|setState)|fog\.(add|remove|replace)|template\.(place|remove)|encounter\.apply|checkpoint\.restore)$/.test(command.type);
}

/** Own-property reads only: a scene id like `__proto__` or `constructor` must not resolve via Object.prototype. */
export const savedSceneOf = (state: RoomState, sceneId: string): SavedScene | undefined =>
  state.savedScenes && Object.hasOwn(state.savedScenes, sceneId) ? state.savedScenes[sceneId] : undefined;
export const sceneNameOf = (state: RoomState, sceneId: string): string | undefined => {
  const names = sceneNamesOf(state);
  return Object.hasOwn(names, sceneId) ? names[sceneId] : undefined;
};

export function sceneState(state: RoomState, sceneId: string): RoomState | null {
  if (sceneId === (state.activeSceneId ?? INITIAL_SCENE_ID)) return state;
  const saved = savedSceneOf(state, sceneId);
  return saved ? { ...state, ...saved.table, terrain: saved.table.terrain, boardEpoch: saved.boardEpoch ?? 0, terrainRevision: saved.terrainRevision ?? 0, walls: saved.table.walls ?? {}, groups: saved.groups, tokenGroups: saved.tokenGroups, activeSceneId: sceneId, areaEffect: null, undo: [] } : null;
}

export function saveScene(state: RoomState): SavedScene {
  return { table: tableOf(state), groups: state.groups, tokenGroups: state.tokenGroups,
    ...(state.boardEpoch !== undefined && { boardEpoch: state.boardEpoch }),
    ...(state.terrainRevision !== undefined && { terrainRevision: state.terrainRevision }),
  };
}
