import { ENCOUNTER_TEMPLATE_VERSION, EncounterTemplateData, shippedMapByUrl, templateMapImage, type ResolvedEncounter } from "@vtt/shared";
import { ensureShippedMaps } from "./shippedMaps";
import type { LibraryStore } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";
import type { RoomRegistry } from "./roomRegistry";

export type ResolveEncounterResult =
  | { ok: true; encounter: ResolvedEncounter }
  | { ok: false; reason: "missing" | "unreadable" | "map_missing"; message: string };

/**
 * Reads one of the owner's encounter templates for an apply (ADR 0024): validated against the
 * shared schema, with its map's address resolved now. A template that is another account's
 * reads exactly as one that does not exist.
 */
export async function resolveEncounter(
  store: Pick<LibraryStore, "findEncounter">,
  ownerGmId: string,
  templateId: string,
): Promise<ResolveEncounterResult> {
  const record = await store.findEncounter(templateId, ownerGmId);
  if (!record) return { ok: false, reason: "missing", message: "That encounter template isn't available." };
  if (record.version !== ENCOUNTER_TEMPLATE_VERSION) {
    return { ok: false, reason: "unreadable", message: `"${record.name}" was saved in a format this server can't read.` };
  }
  const data = EncounterTemplateData.safeParse(record.data);
  if (!data.success) return { ok: false, reason: "unreadable", message: `"${record.name}" can't be read. It may be damaged.` };
  if (!record.mapAssetId || !record.mapUrl) {
    return { ok: false, reason: "map_missing", message: `The map for "${record.name}" was deleted from your library.` };
  }
  return {
    ok: true,
    encounter: {
      id: record.id,
      name: record.name,
      scene: { map: templateMapImage({ ...data.data.map, assetId: record.mapAssetId }, record.mapUrl), grid: data.data.grid },
      tokens: data.data.tokens,
      fog: data.data.fog,
      walls: data.data.walls,
      terrain: data.data.terrain,
    },
  };
}


export type BoardFromRoomResult = { ok: true; data: EncounterTemplateData } | { ok: false; status: 400 | 404; error: string };

/**
 * A template's board from the live state of a room the caller owns (ADR 0024): the GM's view, so
 * hidden tokens, walls and portals are kept; no owners, initiative or ids. The map must be one of the
 * caller's library maps. A room that is missing or someone else's is the same 404.
 */
export async function boardFromRoom(
  store: Pick<RoomStore, "findRoomOwner" | "findAsset" | "listAssets" | "seedShippedMaps">,
  registry: Pick<RoomRegistry, "get">,
  gmId: string,
  roomId: string,
): Promise<BoardFromRoomResult> {
  if ((await store.findRoomOwner(roomId)) !== gmId) return { ok: false, status: 404, error: "Room not found" };
  const room = await registry.get(roomId);
  if (!room) return { ok: false, status: 404, error: "Room not found" };
  const board = room.boardForOwner();
  const map = board.scene.map;
  let mapAsset = map?.assetId ? await store.findAsset(map.assetId, gmId) : null;
  if (map && !mapAsset && shippedMapByUrl(map.url)) {
    // A room that placed a shipped map before maps were library rows records only its URL (ADR 0036).
    await ensureShippedMaps(store, gmId);
    mapAsset = (await store.listAssets(gmId)).find((a) => a.kind === "map" && a.url === map.url) ?? null;
  }
  if (!map || !mapAsset || mapAsset.kind !== "map") {
    return { ok: false, status: 400, error: "Put this room's map in your library first, then save the encounter" };
  }
  const data = EncounterTemplateData.safeParse({
    map: { assetId: mapAsset.id, width: mapAsset.width, height: mapAsset.height },
    grid: board.scene.grid,
    terrain: board.terrain?.base,
    tokens: Object.values(board.tokens).map(({ id: _id, ownerIds: _owners, initiative: _initiative, ...token }) => token),
    fog: Object.values(board.fog).map(({ id: _id, ...region }) => region),
    walls: Object.values(board.walls ?? {}).map(({ id: _id, ...wall }) => wall),
  });
  if (!data.success) return { ok: false, status: 400, error: "This board is too large to save as a template" };
  return { ok: true, data: data.data };
}
