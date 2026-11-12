import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  DEFAULT_PRESET_ID,
  ENCOUNTER_TEMPLATE_VERSION,
  MAX_ENCOUNTER_TEMPLATES,
  SaveEncounterEditRequest,
  StartEncounterEditRequest,
  type EncounterEditSession,
  type StartEncounterEditResponse,
} from "@vtt/shared";
import { boardFromRoom, resolveEncounter } from "../domain/encounterTemplates";
import type { RoomLifecycle } from "../domain/roomLifecycle";
import type { RoomRegistry } from "../domain/roomRegistry";
import { requireAccount } from "../identity/middleware";
import type { SignedIn } from "../identity/sessions";
import { EncounterNameConflictError, EncounterLimitError, EncounterMapMissingError } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";
import { mapDeletedMessage, toSummary } from "./encounters";
import { requestLocale } from "../i18n/locale";
import { sharedText } from "../i18n/localize";

const RoomIdParam = z.uuid();
const NEW_ENCOUNTER_ROOM_NAME = "New encounter";

/**
 * Editing encounter templates in temporary rooms (ADR 0033). A temporary room is a normal room
 * only its GM can enter: edits are ordinary commands, and Save builds the template from the live
 * room on the server, as every room save does (ADR 0024). Leaving uses `DELETE /api/rooms/:roomId`.
 * A room that is not one of the caller's temporary rooms answers 404, like one that does not exist.
 */
export function registerEncounterEditRoutes(
  app: Express,
  deps: { store: RoomStore; registry: RoomRegistry; rooms: RoomLifecycle },
) {
  const { store, registry, rooms } = deps;

  app.post("/api/library/encounter-edits", (req, res) => {
    void withAccount(req, res, async (account) => {
      const body = StartEncounterEditRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      const gmId = account.user.ownerId;
      const seat = {
        ownerGmId: gmId,
        userId: account.user.id,
        sessionHash: account.session.tokenHash,
        guestToken: body.data.guestToken,
        displayName: account.user.displayName,
        preset: DEFAULT_PRESET_ID,
        temporary: true,
      };

      let created;
      if ("templateId" in body.data) {
        // Resolved before anything is created, so a template that is gone leaves no room behind.
        const found = await resolveEncounter(store, gmId, body.data.templateId);
        if (!found.ok) return void res.status(found.reason === "missing" ? 404 : 409).json({ error: sharedText(requestLocale(res), found.text) });
        created = await rooms.createRoomWithSeat({
          ...seat, roomName: found.encounter.name, editsEncounterId: found.encounter.id, encounter: found.encounter,
        });
      } else {
        const map = await store.findAsset(body.data.mapAssetId, gmId);
        // Missing, someone else's, art rather than a map, or no grid yet: one answer.
        if (!map || map.kind !== "map" || !map.grid) {
          return void res.status(400).json({ error: "Choose one of your library maps with a saved grid." });
        }
        const board = await store.findAssetBoard(map.id, gmId);
        created = await rooms.createRoomWithSeat({
          ...seat,
          roomName: NEW_ENCOUNTER_ROOM_NAME,
          scene: { map: { url: map.url, width: map.width, height: map.height, assetId: map.id }, grid: map.grid, board },
        });
      }
      const response: StartEncounterEditResponse = { roomId: created.roomId, participantId: created.participantId };
      res.status(201).json(response);
    });
  });

  app.get("/api/library/encounter-edits/:roomId", (req, res) => {
    void withAccount(req, res, async (account) => {
      const roomId = RoomIdParam.safeParse(req.params.roomId);
      const gmId = account.user.ownerId;
      const session = roomId.success ? await store.findEditSession(roomId.data, gmId) : null;
      if (!roomId.success || !session) return void notTemporary(res);
      const record = session.editsEncounterId ? await store.findEncounter(session.editsEncounterId, gmId) : null;
      const room = await registry.get(roomId.data);
      const response: EncounterEditSession = {
        roomId: roomId.data,
        templateId: record?.id ?? null,
        templateName: record?.name ?? null,
        mapAssetId: record?.mapAssetId ?? room?.boardForOwner().scene.map?.assetId ?? null,
      };
      res.json(response);
    });
  });

  app.post("/api/library/encounter-edits/:roomId/save", (req, res) => {
    void withAccount(req, res, async (account) => {
      const roomId = RoomIdParam.safeParse(req.params.roomId);
      const gmId = account.user.ownerId;
      const session = roomId.success ? await store.findEditSession(roomId.data, gmId) : null;
      if (!roomId.success || !session) return void notTemporary(res);
      const body = SaveEncounterEditRequest.safeParse(req.body ?? {});
      if (!body.success) return void res.status(400).json({ error: body.error.issues });

      const built = await boardFromRoom(store, registry, gmId, roomId.data);
      if (!built.ok) return void res.status(built.status).json({ error: built.error });
      const now = new Date().toISOString();
      const board = built.data;

      /** Replaces a linked template's board; false when the template has since been deleted. */
      async function saveTo(templateId: string): Promise<boolean> {
        const record = await store.findEncounter(templateId, gmId);
        if (!record) return false;
        if (!record.mapAssetId) {
          res.status(409).json({ error: mapDeletedMessage(record.name) });
          return true;
        }
        if (board.map.assetId !== record.mapAssetId) {
          res.status(409).json({ error: `This room's map is no longer the map of "${record.name}". Save it as a new template instead.` });
          return true;
        }
        const updated = await store.updateEncounter(record.id, gmId, { name: record.name, data: board, updatedAt: now });
        if (!updated) return false;
        res.json(toSummary(updated));
        return true;
      }

      if (session.editsEncounterId && (await saveTo(session.editsEncounterId))) return;

      // A new template (or one deleted while it was being edited): the first save names it.
      if (!body.data.name) return void res.status(400).json({ error: "Name this encounter template to save it." });
      const name = body.data.name;
      try {
        // Creating and linking are one step, so overlapping first saves create one template; the
        // others update it. Twice at most: a template deleted in between unlinks the room again.
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await store.createEncounterForEditRoom(roomId.data, {
            id: randomUUID(),
            ownerGmId: gmId,
            name,
            version: ENCOUNTER_TEMPLATE_VERSION,
            data: board,
            mapAssetId: board.map.assetId,
            createdAt: now,
            updatedAt: now,
          }, MAX_ENCOUNTER_TEMPLATES);
          if (!result) return void notTemporary(res);
          if ("created" in result) return void res.status(201).json(toSummary(result.created));
          if (await saveTo(result.linkedTo)) return;
        }
        notTemporary(res);
      } catch (err) {
        if (err instanceof EncounterMapMissingError || err instanceof EncounterLimitError) {
          return void res.status(400).json({ error: err.message });
        }
        throw err;
      }
    });
  });

  async function withAccount(req: Request, res: Response, handler: (account: SignedIn) => Promise<void>) {
    try {
      const account = requireAccount(res);
      if (!account) return;
      await handler(account);
    } catch (err) {
      if (err instanceof EncounterNameConflictError) {
        if (!res.headersSent) res.status(409).json({ error: err.message });
        return;
      }
      console.error("[vtt] encounter edit route failed", err);
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  }
}

function notTemporary(res: Response) {
  res.status(404).json({ error: "Encounter editing room not found" });
}
