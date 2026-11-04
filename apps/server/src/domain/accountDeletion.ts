import type { AssetStore } from "../store/assetStore";
import type { RoomStore } from "../store/roomStore";
import type { RoomRegistry } from "./roomRegistry";
import type { RoomLifecycle } from "./roomLifecycle";

/**
 * Deleting an account (FR-GM-01, ADR 0050). Rooms go first, each through the room-delete path
 * (ADR 0009); then `deleteUser` erases the sessions, memberships, library rows and the user in
 * one transaction. The user row is last, so a failure before it leaves a working account to retry.
 * Stored objects are removed after the commit, best-effort.
 */
export function accountDeletion(deps: {
  store: RoomStore;
  registry: Pick<RoomRegistry, "closeCredentials">;
  assets: AssetStore;
  rooms: Pick<RoomLifecycle, "deleteRoomFully">;
}) {
  const { store, registry, assets, rooms } = deps;

  /** False when there is no such user. */
  return async function deleteAccount(userId: string, ownerGmId: string): Promise<boolean> {
    for (const roomId of await store.listOwnedRoomIds(ownerGmId)) await rooms.deleteRoomFully(roomId);
    const deleted = await store.deleteUser(userId);
    if (!deleted) return false;
    await registry.closeCredentials(deleted.credentialHashes);
    for (const key of deleted.objectKeys) {
      await assets.delete(key).catch((err: unknown) => {
        console.error(`[vtt] could not delete object ${key} of a deleted account`, err);
      });
    }
    return true;
  };
}

export type DeleteAccount = ReturnType<typeof accountDeletion>;
