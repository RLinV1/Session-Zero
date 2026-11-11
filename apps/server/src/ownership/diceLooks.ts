import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  ActiveDiceLookRequest,
  CreateDiceLookRequest,
  DiceLookFaceFields,
  DieName,
  MAX_DICE_LOOKS,
  MAX_DICE_PICTURE_BYTES,
  RenameDiceLookRequest,
  type DiceLookView,
  type DiceLooksResponse,
} from "@vtt/shared";
import { imageUploader } from "../http/imageUpload";
import { requireAccount } from "../identity/middleware";
import type { SignedIn } from "../identity/sessions";
import type { AssetStore } from "../store/assetStore";
import { UPLOAD_ALLOWANCE, UploadAllowanceError, type DiceLookRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";

const LookIdParam = z.uuid();

/**
 * Dice looks saved to the account (ADR 0017 O3): the same looks, and the same look in use, on
 * every device the person signs in on and in every room they are in. Account only; another
 * account's look answers 404, the same as one that does not exist. A look is still drawn only on
 * its owner's screen: nothing here reaches a room.
 */
export function registerDiceLookRoutes(
  app: Express,
  deps: { store: RoomStore; uploadDir: string; assets: AssetStore },
) {
  const { store, uploadDir, assets } = deps;
  const receivePicture = imageUploader(uploadDir, MAX_DICE_PICTURE_BYTES);

  app.get("/api/library/dice", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      res.setHeader("Cache-Control", "no-store");
      const looks = await store.listDiceLooks(user.ownerId);
      const response: DiceLooksResponse = { looks: looks.map(toView), activeId: user.activeDiceLookId };
      res.json(response);
    });
  });

  app.post("/api/library/dice", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      const body = CreateDiceLookRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues[0]?.message, issues: body.error.issues });
      if ((await store.countDiceLooks(user.ownerId)) >= MAX_DICE_LOOKS) {
        return void res.status(409).json({ error: `You can keep up to ${MAX_DICE_LOOKS} dice looks. Delete one to make another.` });
      }
      const now = new Date().toISOString();
      const look: DiceLookRecord = { id: randomUUID(), ownerGmId: user.ownerId, name: body.data.name, faces: {}, createdAt: now, updatedAt: now };
      await store.createDiceLook(look);
      res.status(201).json(toView(look));
    });
  });

  /** Before `/:id`, so "active" is never read as a look id. */
  app.put("/api/library/dice/active", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      const body = ActiveDiceLookRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: "Invalid look" });
      if (body.data.id && !(await store.findDiceLook(body.data.id, user.ownerId))) return void notFound(res);
      await store.setActiveDiceLook(user.id, body.data.id);
      res.status(204).end();
    });
  });

  app.patch("/api/library/dice/:id", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      const id = LookIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const body = RenameDiceLookRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues[0]?.message, issues: body.error.issues });
      const look = await store.renameDiceLook(id.data, user.ownerId, body.data.name, new Date().toISOString());
      if (!look) return void notFound(res);
      res.json(toView(look));
    });
  });

  app.delete("/api/library/dice/:id", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      const id = LookIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const keys = await store.deleteDiceLook(id.data, user.ownerId);
      if (!keys) return void notFound(res);
      await deleteObjects(keys);
      res.status(204).end();
    });
  });

  /** Sets or replaces one die's picture. The replaced picture's object is deleted once the look no longer names it. */
  app.put("/api/library/dice/:id/faces/:die", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      const id = LookIdParam.safeParse(req.params.id);
      const die = DieName.safeParse(req.params.die);
      if (!id.success || !die.success || !(await store.findDiceLook(id.data, user.ownerId))) return void notFound(res);
      const upload = await receivePicture(req, res);
      if (!upload.ok) return void res.status(upload.status).json({ error: upload.error });
      const fields = DiceLookFaceFields.safeParse(req.body);
      if (!fields.success) {
        await unlink(upload.image.path).catch(() => {});
        return void res.status(400).json({ error: fields.error.issues[0]?.message ?? "Invalid picture size" });
      }
      // Other people's browsers load these pictures (ADR 0018 D5), so the size the browser
      // declared must be the file's real size.
      const { key: objectKey, width, height, contentType, bytes } = upload.image;
      if (width !== fields.data.width || height !== fields.data.height) {
        await unlink(upload.image.path).catch(() => {});
        return void res.status(400).json({ error: "The picture's size doesn't match what was sent" });
      }
      const url = await assets.put(upload.image.path, objectKey, contentType);
      const face = { objectKey, url, width, height, bytes };
      let updated;
      try {
        updated = await store.setDiceLookFace(id.data, user.ownerId, die.data, face, new Date().toISOString(), UPLOAD_ALLOWANCE);
      } catch (err) {
        await deleteObjects([objectKey]);
        if (err instanceof UploadAllowanceError) return void res.status(409).json({ error: err.message });
        throw err;
      }
      // Deleted while the picture uploaded: keep nothing behind.
      if (!updated) {
        await deleteObjects([objectKey]);
        return void notFound(res);
      }
      if (updated.replacedKey) await deleteObjects([updated.replacedKey]);
      res.json(toView(updated.look));
    });
  });

  /** Resets one die to the classic look. */
  app.delete("/api/library/dice/:id/faces/:die", (req, res) => {
    void withAccount(req, res, async ({ user }) => {
      const id = LookIdParam.safeParse(req.params.id);
      const die = DieName.safeParse(req.params.die);
      if (!id.success || !die.success) return void notFound(res);
      const updated = await store.setDiceLookFace(id.data, user.ownerId, die.data, null, new Date().toISOString(), UPLOAD_ALLOWANCE);
      if (!updated) return void notFound(res);
      if (updated.replacedKey) await deleteObjects([updated.replacedKey]);
      res.json(toView(updated.look));
    });
  });

  /** Best effort, after the row changed: an orphaned object has a random name and harms nobody. */
  async function deleteObjects(keys: string[]) {
    for (const key of keys) {
      await assets.delete(key).catch((err: unknown) => console.error(`[vtt] could not delete dice picture ${key}`, err));
    }
  }

  async function withAccount(req: Request, res: Response, handler: (account: SignedIn) => Promise<void>) {
    try {
      const account = requireAccount(res);
      if (account) await handler(account);
    } catch (err) {
      console.error(`[vtt] ${req.method} dice look request failed:`, err);
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  }
}

function notFound(res: Response) {
  res.status(404).json({ error: "Dice look not found" });
}

/** The server-only object keys stay behind. */
function toView(look: DiceLookRecord): DiceLookView {
  const faces: DiceLookView["faces"] = {};
  for (const [die, face] of Object.entries(look.faces) as [DieName, NonNullable<DiceLookRecord["faces"][DieName]>][]) {
    faces[die] = { url: face.url, width: face.width, height: face.height };
  }
  return { id: look.id, name: look.name, faces, updatedAt: look.updatedAt };
}
