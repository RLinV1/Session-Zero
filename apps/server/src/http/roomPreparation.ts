import express, { type Express, type Request, type Response, type NextFunction, type ErrorRequestHandler } from "express";
import { MAX_PREPARATION_BYTES, PreparationSave, PreparationSaved } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import type { LiveRoom } from "../domain/liveRoom";
import type { RoomRegistry } from "../domain/roomRegistry";
import type { Sessions } from "../identity/sessions";
import type { RoomStore } from "../store/roomStore";

/** A preparation-only body limit, authorized before parsing. Socket and other JSON limits stay unchanged. */
export function registerRoomPreparation(app: Express, deps: { store: RoomStore; registry: RoomRegistry; sessions: Sessions }) {
  type Auth = { room: LiveRoom; actorId: string; sessionHash?: string | null };
  const auths = new WeakMap<Request, Auth>();
  const guard = (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const header = req.headers.authorization;
      const credential = header?.startsWith("Bearer ") ? await deps.store.findCredential(hashToken(header.slice(7))) : null;
      if (!credential || credential.roomId !== req.params.roomId || (credential.sessionHash && !await deps.sessions.isLive(credential.sessionHash))) {
        res.status(403).json({ error: "An active GM credential for this room is required." }); return;
      }
      const room = await deps.registry.get(credential.roomId);
      if (!room || room.closed || room.activeParticipant(credential.participantId)?.role !== "gm") {
        res.status(403).json({ error: "An active GM credential for this room is required." }); return;
      }
      auths.set(req, { room, actorId: credential.participantId, sessionHash: credential.sessionHash });
      res.setHeader("Cache-Control", "no-store"); next();
    })().catch(next);
  };
  const failure: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const type = typeof error === "object" && error !== null && "type" in error ? error.type : null;
    if (type === "entity.parse.failed") { res.status(400).json({ error: "Invalid JSON for map preparation." }); return; }
    const tooLarge = type === "entity.too.large";
    res.status(tooLarge ? 413 : 500).json({ error: tooLarge ? "Map preparation is too large." : "Couldn't save the map draft. Try again." });
  };
  app.post("/api/rooms/:roomId/preparation", guard, express.json({ limit: MAX_PREPARATION_BYTES - 1 }), (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const command = PreparationSave.safeParse(req.body);
      if (!command.success) { res.status(400).json({ error: "Invalid or oversized map preparation." }); return; }
      const auth = auths.get(req)!;
      if (auth.sessionHash && !await deps.sessions.isLive(auth.sessionHash)) { res.status(403).json({ error: "Your sign-in ended before saving." }); return; }
      // submit checks the active actor and all preparation context again inside the room FIFO.
      const result = await auth.room.submit(auth.actorId, command.data);
      if (!result.ok) { res.status(result.code === "forbidden" ? 403 : 409).json({ error: result.message, code: result.code }); return; }
      // No room state is returned here; snapshots and events retain the existing viewer filters.
      res.json(PreparationSaved.parse({ seq: result.seq }));
    })().catch(next);
  }, failure);
}
