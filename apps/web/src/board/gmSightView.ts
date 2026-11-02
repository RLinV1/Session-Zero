import { viewerSight, type Participant, type Point, type RoomState } from "@vtt/shared";

/** The synthetic viewer that owns the tokens the GM is looking through; never a room participant. */
const VIEWER_ID = "gm-sight-view";
const VIEWER: Participant = { id: VIEWER_ID, role: "player", displayName: "Token view" };

/** Token view needs line of sight on and a token still in the room; otherwise there is nothing to look through. */
export const viewedTokenIds = (state: Pick<RoomState, "scene" | "tokens">, selected: readonly string[]): string[] =>
  state.scene.lineOfSight === true ? selected.filter((id) => state.tokens[id]) : [];

/** Sight polygons of the given tokens, computed as for a player who owns them; a hidden token still sees. */
export function gmSightPolygons(state: Pick<RoomState, "scene" | "walls" | "tokens" | "fog">, ids: readonly string[]): Point[][] | null {
  const own = viewedTokenIds(state, ids);
  if (own.length === 0) return null;
  // viewerSight skips hidden tokens, so the copies are unhidden.
  const tokens = Object.fromEntries(own.map((id) => [id, { ...state.tokens[id]!, hidden: false, ownerIds: [VIEWER_ID] }]));
  return viewerSight({ scene: state.scene, walls: state.walls, fog: state.fog, tokens }, VIEWER);
}

/** Changes only when something that shapes the viewed tokens' sight does, so unrelated events leave the board mask alone. Scene, walls and fog are compared by reference. */
export const sightKey = (state: Pick<RoomState, "tokens">, ids: readonly string[]): string =>
  ids.map((id) => { const t = state.tokens[id]; return t ? `${id}:${t.position.x},${t.position.y},${t.size},${t.hidden}` : id; }).join("|");
