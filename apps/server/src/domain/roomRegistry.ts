import type { SessionEndReason } from "@vtt/shared";
import type { RoomStore } from "../store/roomStore";
import { LiveRoom, type RoomHooks } from "./liveRoom";

/**
 * Loads each room at most once per process. Single-process only: running more than one
 * server instance requires routing each room to one instance (see ADR 0001).
 */
export class RoomRegistry {
  private rooms = new Map<string, Promise<LiveRoom>>();

  constructor(private store: RoomStore, private hooks: RoomHooks = {}) {}

  async get(roomId: string): Promise<LiveRoom | null> {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    let exists: boolean;
    try {
      exists = await this.store.roomExists(roomId);
    } catch (err) {
      // Before the load starts, so the handler below never sees it: name the room here too.
      console.error(`[vtt] room ${roomId} failed to load:`, err);
      throw err;
    }
    if (!exists) return null;
    // Re-check after the await so concurrent callers share one load.
    let loading = this.rooms.get(roomId);
    if (!loading) {
      loading = LiveRoom.load(roomId, this.store, this.hooks);
      this.rooms.set(roomId, loading);
      // A failed load is logged and forgotten, so the next caller tries again (room-load-isolation).
      loading.catch((err: unknown) => {
        console.error(`[vtt] room ${roomId} failed to load:`, err);
        this.rooms.delete(roomId);
      });
    }
    return loading;
  }

  /**
   * Ends a loaded room for everyone ahead of deleting it (ADR 0009). The closed room stays
   * registered until `evict`, so a handshake in between finds it closed instead of reloading it.
   */
  async close(roomId: string, reason: SessionEndReason) {
    const room = await this.rooms.get(roomId)?.catch(() => null);
    await room?.close(reason);
  }

  /** Closes open connections on these seat credentials, in every loaded room (ADR 0017 M4). */
  async closeCredentials(hashes: Iterable<string>) {
    const set = new Set(hashes);
    if (set.size === 0) return;
    for (const loading of this.rooms.values()) {
      const room = await loading.catch(() => null);
      room?.closeCredentials(set);
    }
  }

  /**
   * Closes connections whose credential row is gone. Sessions ended in another process (the
   * operator reset, ADR 0017 I5) delete their seats there; this sweep closes what was still open
   * here.
   */
  async closeDeletedCredentials() {
    const gone: string[] = [];
    for (const loading of this.rooms.values()) {
      const room = await loading.catch(() => null);
      for (const hash of room?.connectedCredentials() ?? []) {
        if (!(await this.store.findCredential(hash))) gone.push(hash);
      }
    }
    await this.closeCredentials(gone);
  }

  /** The room if it is already loaded; never loads one. For notices only its connected clients need. */
  async loaded(roomId: string): Promise<LiveRoom | null> {
    return (await this.rooms.get(roomId)?.catch(() => null)) ?? null;
  }

  async evictIdle(idleMs: number, now = Date.now()) {
    for (const [roomId, loading] of [...this.rooms]) {
      const room = await loading.catch(() => null);
      if (room?.isIdleFor(idleMs, now) && this.rooms.get(roomId) === loading) this.rooms.delete(roomId);
    }
  }

  /** Forgets a room, so the next `get` reads the store again. */
  evict(roomId: string) {
    this.rooms.delete(roomId);
  }
}
