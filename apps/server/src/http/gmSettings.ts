import type { Express, Request, Response } from "express";
import { BUILTIN_ROOM_DEFAULTS, RoomDefaults } from "@vtt/shared";
import { requireAccount } from "../identity/middleware";
import type { SignedIn } from "../identity/sessions";
import type { RoomStore } from "../store/roomStore";

/**
 * The signed-in GM's defaults for new rooms (gm-room-defaults, ADR 0066). Account only, and only
 * ever the account's own owner row: there is no way to name another GM's. Nothing here reaches a
 * room that already exists; room creation reads them for the room it makes.
 */
export function registerGmSettingsRoutes(app: Express, deps: { store: RoomStore }) {
  const { store } = deps;

  app.get("/api/gm/settings", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      res.setHeader("Cache-Control", "no-store");
      res.json(await store.getRoomDefaults(user.ownerId) ?? BUILTIN_ROOM_DEFAULTS);
    });
  });

  app.put("/api/gm/settings", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      const body = RoomDefaults.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues[0]?.message, issues: body.error.issues });
      await store.setRoomDefaults(user.ownerId, body.data);
      res.json(body.data);
    });
  });

  async function withAccount(req: Request, res: Response, handler: (account: SignedIn) => Promise<void>) {
    try {
      const account = requireAccount(res);
      if (account) await handler(account);
    } catch (err) {
      console.error(`[vtt] ${req.method} GM settings request failed:`, err);
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  }
}
