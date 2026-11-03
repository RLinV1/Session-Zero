import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  ENCOUNTER_TEMPLATE_VERSION,
  MAX_ENCOUNTER_TEMPLATES,
  RenameEncounterRequest,
  ReplaceEncounterFromRoomRequest,
  SaveEncounterRequest,
  type EncounterPreview,
  type EncounterSummary,
} from "@vtt/shared";
import { boardFromRoom, resolveEncounter } from "../domain/encounterTemplates";
import type { RoomRegistry } from "../domain/roomRegistry";
import { requireAccountOwner, resolveOwner, type Owner } from "../ownership/resolveOwner";
import { EncounterNameConflictError, EncounterLimitError, EncounterMapMissingError, type EncounterRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";

const IdParam = z.uuid();

/**
 * Reusable encounter templates (FR-GM-13, ADR 0024), beside the asset library and under the same
 * rules: another GM's template answers 404, the same as one that does not exist. A template is
 * built here, on the server, from the live room the caller owns; the client sends no board data.
 */
export function registerEncounterRoutes(app: Express, deps: { store: RoomStore; registry: RoomRegistry }) {
  const { store, registry } = deps;

  app.get("/api/library/encounters", (req, res) => {
    void withOwner(req, res, async (gmId) => {
      res.json((await store.listEncounters(gmId)).map(toSummary));
    });
  });

  // The saved board as the GM would see it, for a read-only preview in the library (hidden tokens included).
  app.get("/api/library/encounters/:id/preview", (req, res) => {
    void withOwner(req, res, async (gmId) => {
      const id = IdParam.safeParse(req.params.id);
      if (!id.success) return void res.status(404).json({ error: "Template not found" });
      const resolved = await resolveEncounter(store, gmId, id.data);
      if (!resolved.ok) return void res.status(resolved.reason === "missing" ? 404 : 409).json({ error: resolved.message });
      const { name, scene, tokens, fog, terrain } = resolved.encounter;
      const preview: EncounterPreview = { name, map: scene.map!, grid: scene.grid, tokens, fog, ...(terrain ? { terrain } : {}) };
      res.json(preview);
    });
  });

  app.post("/api/library/encounters", (req, res) => {
    void withOwner(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      const body = SaveEncounterRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });

      const built = await boardFromRoom(store, registry, gmId, body.data.roomId);
      if (!built.ok) return void res.status(built.status).json({ error: built.error });
      const data = built.data;

      const now = new Date().toISOString();
      try {
        const created = await store.createEncounter({
          id: randomUUID(),
          ownerGmId: gmId,
          name: body.data.name,
          version: ENCOUNTER_TEMPLATE_VERSION,
          data,
          mapAssetId: data.map.assetId,
          createdAt: now,
          updatedAt: now,
        }, MAX_ENCOUNTER_TEMPLATES);
        res.status(201).json(toSummary(created));
      } catch (err) {
        if (err instanceof EncounterMapMissingError || err instanceof EncounterLimitError) {
          return void res.status(400).json({ error: err.message });
        }
        throw err;
      }
    });
  });

  app.put("/api/library/encounters/:id/from-room", (req, res) => {
    void withOwner(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      const id = IdParam.safeParse(req.params.id);
      const record = id.success ? await store.findEncounter(id.data, gmId) : null;
      if (!record) return void notFound(res);
      const body = ReplaceEncounterFromRoomRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });

      const built = await boardFromRoom(store, registry, gmId, body.data.roomId);
      if (!built.ok) return void res.status(built.status).json({ error: built.error });
      if (!record.mapAssetId) return void res.status(409).json({ error: mapDeletedMessage(record.name) });
      if (built.data.map.assetId !== record.mapAssetId) {
        return void res.status(409).json({ error: `This room uses a different map than "${record.name}". Save it as a new template instead.` });
      }
      const updated = await store.updateEncounter(record.id, gmId, { name: record.name, data: built.data, updatedAt: new Date().toISOString() });
      if (!updated) return void notFound(res);
      res.json(toSummary(updated));
    });
  });

  app.patch("/api/library/encounters/:id", (req, res) => {
    void withOwner(req, res, async (gmId) => {
      const id = IdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const body = RenameEncounterRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      const updated = await store.renameEncounter(id.data, gmId, body.data.name, new Date().toISOString());
      if (!updated) return void notFound(res);
      res.json(toSummary(updated));
    });
  });

  app.delete("/api/library/encounters/:id", (req, res) => {
    void withOwner(req, res, async (gmId) => {
      const id = IdParam.safeParse(req.params.id);
      if (!id.success || !(await store.deleteEncounter(id.data, gmId))) return void notFound(res);
      res.status(204).end();
    });
  });

  async function withOwner(req: Request, res: Response, handler: (gmId: string, owner: Owner) => Promise<void>) {
    try {
      const owner = await resolveOwner(req, res, store);
      if (!owner) return void res.status(401).json({ error: "Sign in to do that" });
      await handler(owner.ownerId, owner);
    } catch (err) {
      if (err instanceof EncounterNameConflictError) {
        if (!res.headersSent) res.status(409).json({ error: err.message });
        return;
      }
      console.error("[vtt] encounter route failed", err);
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  }
}

export function notFound(res: Response) {
  res.status(404).json({ error: "Encounter template not found" });
}

export function mapDeletedMessage(name: string) {
  return `The map for "${name}" was deleted from your library.`;
}

/** The board data stays on the server; the library needs only what it lists. */
export function toSummary(record: EncounterRecord): EncounterSummary {
  return {
    id: record.id,
    name: record.name,
    mapName: record.mapName,
    mapAssetId: record.mapAssetId,
    tokenCount: record.data.tokens.length,
    fogCount: record.data.fog.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
