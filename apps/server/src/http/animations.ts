import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { CreateAnimationRequest, MAX_LIBRARY_ANIMATIONS, UpdateAnimationRequest, type LibraryAnimation } from "@vtt/shared";
import { AnimationLimitError, type LibraryAnimationRecord } from "../store/libraryStore";
import { requireAccountOwner, type Owner } from "../ownership/resolveOwner";
import type { RoomStore } from "../store/roomStore";

const AnimationIdParam = z.uuid();

type WithGm = (req: Request, res: Response, handler: (gmId: string, owner: Owner) => Promise<void>) => Promise<void>;

/**
 * The GM's saved animations (ADR 0038), beside the asset library and under the same rules:
 * GM-only, and another GM's animation answers 404, the same as one that does not exist. The
 * definition is parsed with `AnimationDef` on every write, so the board never plays unchecked data.
 */
export function registerAnimationRoutes(app: Express, deps: { store: RoomStore; withGm: WithGm }) {
  const { store, withGm } = deps;

  app.get("/api/library/animations", (req, res) => {
    void withGm(req, res, async (gmId) => {
      res.json((await store.listAnimations(gmId)).map(toWire));
    });
  });

  app.post("/api/library/animations", (req, res) => {
    void withGm(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      const body = CreateAnimationRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      const now = new Date().toISOString();
      try {
        const created = await store.createAnimation(
          { id: randomUUID(), ownerGmId: gmId, name: body.data.name, def: body.data.def, createdAt: now, updatedAt: now },
          MAX_LIBRARY_ANIMATIONS,
        );
        res.status(201).json(toWire(created));
      } catch (err) {
        if (err instanceof AnimationLimitError) return void res.status(400).json({ error: err.message });
        throw err;
      }
    });
  });

  app.patch("/api/library/animations/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AnimationIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const patch = UpdateAnimationRequest.safeParse(req.body);
      if (!patch.success) return void res.status(400).json({ error: patch.error.issues });
      const updated = await store.updateAnimation(id.data, gmId, patch.data, new Date().toISOString());
      if (!updated) return void notFound(res);
      res.json(toWire(updated));
    });
  });

  app.delete("/api/library/animations/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AnimationIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.deleteAnimation(id.data, gmId))) return void notFound(res);
      res.status(204).end();
    });
  });
}

function notFound(res: Response) {
  res.status(404).json({ error: "Animation not found" });
}

/** The owner stays on the server, like an asset's object key. */
function toWire(record: LibraryAnimationRecord): LibraryAnimation {
  return { id: record.id, name: record.name, def: record.def, createdAt: record.createdAt, updatedAt: record.updatedAt, folder: record.folder ?? null };
}
