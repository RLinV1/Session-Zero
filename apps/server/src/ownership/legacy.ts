import type { Express, Request, Response } from "express";
import { GM_TOKEN_HEADER, type LegacySummary } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import { requireAccount } from "../identity/middleware";
import type { RoomRegistry } from "../domain/roomRegistry";
import type { LibraryStore } from "../store/libraryStore";

/**
 * Bringing a browser's legacy GM device identity into an account (ADR 0017 O2). The browser
 * proves the device side with its token and the account side with its session; the move takes
 * everything the token owns and deletes the device identity, so the token stops working.
 */
export function registerLegacyRoutes(app: Express, deps: { store: LibraryStore; registry: RoomRegistry }) {
  const { store, registry } = deps;

  /** What this browser's legacy token owns, for the dashboard's offer. 401 for a token the server doesn't know. */
  app.get("/api/gm/legacy", (req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      const deviceId = await deviceOwner(req);
      if (!deviceId) return void res.status(401).json({ error: "Unknown device identity" });
      res.json((await store.ownedCounts(deviceId)) satisfies LegacySummary);
    })().catch(internalError(res));
  });

  /** Only when the person asks: never on sign-in by itself (§13.1, "Never silently merge"). */
  app.post("/api/gm/legacy/claim", (req, res) => {
    void (async () => {
      const account = requireAccount(res);
      if (!account) return;
      const deviceId = await deviceOwner(req);
      // Read before the move: afterwards the device owns nothing.
      const roomIds = deviceId ? await store.listOwnedRoomIds(deviceId) : [];
      const moved = deviceId ? await store.claimDeviceOwner(deviceId, account.user.ownerId) : null;
      if (!moved) return void res.status(404).json({ error: "Nothing to bring over from this browser" });
      // An open guest room stops being one now, so its built-in-art rule ends with no reconnect (guest-gm-hosting D7).
      // The claim has committed, so a failed refresh must not turn it into a 500.
      for (const roomId of roomIds) {
        try {
          await (await registry.loaded(roomId))?.refreshGuest();
        } catch (err) {
          console.error(`[vtt] could not refresh guest state of room ${roomId} after a claim`, err);
        }
      }
      res.json(moved satisfies LegacySummary);
    })().catch(internalError(res));
  });

  async function deviceOwner(req: Request): Promise<string | null> {
    const token = req.header(GM_TOKEN_HEADER);
    if (!token || token.length < 16 || token.length > 256) return null;
    return store.findGm(hashToken(token));
  }
}

function internalError(res: Response) {
  return (err: unknown) => {
    console.error("[vtt] legacy identity request failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  };
}
