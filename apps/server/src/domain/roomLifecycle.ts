import { randomUUID } from "node:crypto";
import {
  DEFAULT_GRID,
  emptyRoomState,
  encounterTable,
  presetOf,
  tableForPreset,
  tableOf,
  type DomainEvent,
  type GamePreset,
  type GamePresetId,
  type GridSpec,
  type MapImage,
  type LibraryMapBoard,
  type ResolvedEncounter,
  type TableState,
} from "@vtt/shared";
import type { AssetStore } from "../store/assetStore";
import type { RoomStore } from "../store/roomStore";
import { hashToken, newInviteCode } from "./credentials";
import type { RoomRegistry } from "./roomRegistry";
import type { WallDetections } from "./wallDetection";

export interface NewRoomWithSeat {
  ownerGmId: string;
  userId: string;
  /** The sign-in the GM's seat is bound to (ADR 0017 M4). */
  sessionHash: string;
  /** Browser-generated; only its SHA-256 is stored (DESIGN.md §5). */
  guestToken: string;
  roomName: string;
  displayName: string;
  preset: GamePresetId;
  /** A temporary encounter-editing room (ADR 0033). */
  temporary?: boolean;
  editsEncounterId?: string | null;
  /** Start from this template's board (ADR 0024). */
  encounter?: ResolvedEncounter | null;
  /** Start with a library map, its grid and any prepared walls and fog. */
  scene?: { map: MapImage; grid: GridSpec; board?: LibraryMapBoard | null };
}

/**
 * Making and removing whole rooms, shared by `POST /api/rooms`, temporary encounter-editing
 * rooms and their sweep (ADR 0033), so every room gets the same seat, membership and first events,
 * and every delete removes the same things.
 */
export function roomLifecycle(deps: {
  store: RoomStore;
  registry: RoomRegistry;
  assets: AssetStore;
  walls: Pick<WallDetections, "forgetRoom">;
}) {
  const { store, registry, assets, walls } = deps;

  async function createRoomWithSeat(room: NewRoomWithSeat) {
    const roomId = randomUUID();
    const inviteCode = newInviteCode();
    const participantId = randomUUID();

    await store.createRoom(roomId, inviteCode, {
      ownerGmId: room.ownerGmId,
      name: room.roomName,
      temporary: room.temporary ?? false,
      editsEncounterId: room.editsEncounterId ?? null,
    });
    await store.saveCredential(hashToken(room.guestToken), { roomId, participantId, sessionHash: room.sessionHash });
    await store.putMember({ roomId, participantId, userId: room.userId });
    const live = await registry.get(roomId);
    // The game preset's defaults (KAN-63, ADR 0027): its grid units, when they aren't the default grid's.
    const preset = presetOf({ preset: room.preset });
    const grid = { ...DEFAULT_GRID, ...preset.grid };
    const events: DomainEvent[] = [
      { type: "RoomCreated", name: room.roomName, preset: preset.id },
      ...(grid.unitsPerCell !== DEFAULT_GRID.unitsPerCell || grid.unitLabel !== DEFAULT_GRID.unitLabel
        ? [{ type: "GridSet" as const, grid, previous: DEFAULT_GRID }]
        : []),
      {
        type: "ParticipantJoined",
        participant: { id: participantId, role: "gm", displayName: room.displayName.trim() },
      },
    ];
    if (room.encounter) {
      events.push({
        type: "EncounterApplied",
        templateId: room.encounter.id,
        name: room.encounter.name,
        applied: tableForPreset(withPresetGrid(encounterTable(room.encounter, randomUUID), preset), preset),
        previous: { ...tableOf(emptyRoomState(roomId)), scene: { map: null, grid } },
      });
    } else if (room.scene) {
      const sceneGrid = { ...room.scene.grid, ...preset.grid };
      const board = room.scene.board;
      events.push({ type: "MapSet", map: room.scene.map, previous: null, gridChange: { grid: sceneGrid, previous: grid }, ...(board?.terrain ? { terrainChange: { terrain: { base: board.terrain, effects: [] }, previous: { base: [], effects: [] } } } : {}) });
      if (board?.walls.length) events.push({ type: "WallsAdded", walls: board.walls.map((wall) => ({ ...wall, id: randomUUID() })) });
      for (const region of board?.fog ?? []) events.push({ type: "FogAdded", region: { ...region, id: randomUUID() } });
    }
    await live!.appendSystem(participantId, events);
    return { roomId, inviteCode, participantId };
  }

  /**
   * Closes, erases and forgets a room (ADR 0009): nothing commits into it and nobody stays in it,
   * then its uploads are removed best-effort. False when there was no such room.
   */
  async function deleteRoomFully(roomId: string): Promise<boolean> {
    await registry.close(roomId, "deleted");
    let deleted;
    try {
      deleted = await store.deleteRoom(roomId);
    } finally {
      // On failure too: the next access reloads the room from the store instead of finding it closed.
      registry.evict(roomId);
    }
    walls.forgetRoom(roomId);
    if (!deleted) return false;

    // After the commit, and best-effort: the room is gone, and a stray object has a random name.
    for (const key of deleted.uploadKeys) {
      await assets.delete(key).catch((err: unknown) => {
        console.error(`[vtt] could not delete upload ${key} of deleted room ${roomId}`, err);
      });
    }
    return true;
  }

  return { createRoomWithSeat, deleteRoomFully };
}

export type RoomLifecycle = ReturnType<typeof roomLifecycle>;

/** A template's table keeps its own grid alignment but takes the room's preset units (KAN-63). */
function withPresetGrid(table: TableState, preset: GamePreset): TableState {
  return { ...table, scene: { ...table.scene, grid: { ...table.scene.grid, ...preset.grid } } };
}
