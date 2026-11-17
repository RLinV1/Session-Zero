import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { BulkDeleteCreaturesRequest, BulkUpdateCreaturesRequest, CreateCreatureRequest, UpdateCreatureRequest, creatureHpValid, type BulkDeleteCreaturesResponse, type LibraryCreature } from "@vtt/shared";
import { CreatureImageMissingError, type LibraryCreatureRecord } from "../store/libraryStore";
import { requireAccountOwner, type Owner } from "../ownership/resolveOwner";
import type { RoomStore } from "../store/roomStore";

const CreatureIdParam = z.uuid();

type WithGm = (req: Request, res: Response, handler: (gmId: string, owner: Owner) => Promise<void>) => Promise<void>;

/**
 * Reusable creatures (ADR 0012), beside the asset library and under the same rules: GM-only,
 * and another GM's creature answers 404, the same as one that does not exist.
 */
export function registerCreatureRoutes(app: Express, deps: { store: RoomStore; withGm: WithGm }) {
  const { store, withGm } = deps;

  /**
   * An image must be the caller's own token art. A missing id, another GM's asset and a map
   * all get the same answer, so this can't be used to learn which assets exist.
   */
  async function ownTokenArt(gmId: string, imageAssetId: string | null | undefined): Promise<boolean> {
    if (imageAssetId == null) return true;
    const asset = await store.findAsset(imageAssetId, gmId);
    return asset?.kind === "token";
  }

  app.get("/api/library/creatures", (req, res) => {
    void withGm(req, res, async (gmId) => {
      res.json((await store.listCreatures(gmId)).map(toWire));
    });
  });

  app.post("/api/library/creatures", (req, res) => {
    void withGm(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      const body = CreateCreatureRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      if (!creatureHpValid(body.data)) return void res.status(400).json({ error: "Starting HP cannot exceed Max HP" });
      if (!(await ownTokenArt(gmId, body.data.imageAssetId))) return void imageRejected(res);
      try {
        const created = await store.createCreature({
          id: randomUUID(), ownerGmId: gmId, ...body.data, createdAt: new Date().toISOString(),
        });
        res.status(201).json(toWire(created));
      } catch (err) {
        if (err instanceof CreatureImageMissingError) return void imageRejected(res);
        throw err;
      }
    });
  });

  /**
   * One edit to several creatures (library-organize, ADR 0075): their folder, size, Max HP or AC.
   * All or nothing: an id that isn't the GM's answers 404, the same as for one creature, and a
   * Max HP below any one's starting HP answers 400, with nothing changed either way. Registered
   * before `/:id` so "bulk" is never read as a creature id (`PATCH /api/library/:id` already
   * answers for `/api/library/creatures` itself).
   */
  app.patch("/api/library/creatures/bulk", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const body = BulkUpdateCreaturesRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      const { ids, patch } = body.data;
      const own = new Map((await store.listCreatures(gmId)).map((c) => [c.id, c]));
      if (ids.some((id) => !own.has(id))) return void notFound(res);
      if (ids.some((id) => !creatureHpValid({ ...own.get(id)!, ...patch }))) return void res.status(400).json({ error: "Starting HP cannot exceed Max HP" });
      const updated = await store.updateCreatures(ids, gmId, patch);
      if (!updated) return void notFound(res);
      res.json(updated.map(toWire));
    });
  });

  /** Deletes several creatures (ADR 0075). Ones already gone, or another GM's, are skipped and not counted. */
  app.post("/api/library/creatures/bulk-delete", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const body = BulkDeleteCreaturesRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      const response: BulkDeleteCreaturesResponse = { deleted: await store.deleteCreatures(body.data.ids, gmId) };
      res.json(response);
    });
  });

  app.patch("/api/library/creatures/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = CreatureIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const patch = UpdateCreatureRequest.safeParse(req.body);
      if (!patch.success) return void res.status(400).json({ error: patch.error.issues });
      const existing = await store.findCreature(id.data, gmId);
      if (!existing) return void notFound(res);
      if (!creatureHpValid({ ...existing, ...patch.data })) return void res.status(400).json({ error: "Starting HP cannot exceed Max HP" });
      if (!(await ownTokenArt(gmId, patch.data.imageAssetId))) return void imageRejected(res);
      try {
        const updated = await store.updateCreature(id.data, gmId, patch.data);
        if (!updated) return void notFound(res);
        res.json(toWire(updated));
      } catch (err) {
        if (err instanceof CreatureImageMissingError) return void imageRejected(res);
        throw err;
      }
    });
  });

  app.delete("/api/library/creatures/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = CreatureIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.deleteCreature(id.data, gmId))) return void notFound(res);
      res.status(204).end();
    });
  });
}

function notFound(res: Response) {
  res.status(404).json({ error: "Creature not found" });
}

function imageRejected(res: Response) {
  res.status(400).json({ error: new CreatureImageMissingError().message });
}

/** The owner stays on the server, like an asset's object key. */
function toWire(record: LibraryCreatureRecord): LibraryCreature {
  return {
    id: record.id,
    name: record.name,
    size: record.size,
    hp: record.hp,
    attacks: record.attacks,
    maxHp: record.maxHp,
    ac: record.ac,
    color: record.color,
    conditions: record.conditions,
    imageAssetId: record.imageAssetId,
    imageUrl: record.imageUrl,
    folder: record.folder,
    createdAt: record.createdAt,
  };
}
