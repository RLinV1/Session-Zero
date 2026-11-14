import type { Id, RoomState } from "./state";

/**
 * Library assets the room's current state uses — the map and every token, hidden ones
 * included (ADR 0004). The server keeps a per-room index of this set so the library can
 * warn before deleting an asset in use. History does not count: only what is on the board now.
 */
export function referencedAssetIds(state: RoomState): Set<Id> {
  const ids = new Set<Id>();
  const mapAsset = state.scene.map?.assetId;
  if (mapAsset) ids.add(mapAsset);
  // Staged tokens (ADR 0068) are still the room's: their art comes back when they are placed.
  for (const token of [...Object.values(state.tokens), ...Object.values(state.staged ?? {})]) {
    if (token.assetId) ids.add(token.assetId);
  }
  for (const saved of Object.values(state.savedScenes ?? {})) {
    const map = saved.table.scene.map?.assetId;
    if (map) ids.add(map);
    for (const token of [...Object.values(saved.table.tokens), ...Object.values(saved.table.staged ?? {})]) {
      if (token.assetId) ids.add(token.assetId);
    }
  }
  return ids;
}
