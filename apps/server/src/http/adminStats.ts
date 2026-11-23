import type { Express, Response } from "express";
import { FeedbackCursor, FeedbackReference, LaunchStatsQuery, type AdminFeedbackResponse, type LaunchStatsResponse } from "@vtt/shared";
import { aggregateLaunchStats, resolveStatsRange } from "../domain/launchStats";
import { signedIn } from "../identity/middleware";
import type { RoomStore } from "../store/roomStore";
import { errorTag } from "./errorTag";

/**
 * The accounts allowed to read launch stats (ADR 0080): `ADMIN_ACCOUNT_IDS`, account ids separated
 * by commas. Unset or empty means nobody, so the page does not exist anywhere it isn't configured.
 */
export function adminAccountIdsFromEnv(value = process.env.ADMIN_ACCOUNT_IDS): ReadonlySet<string> {
  return new Set((value ?? "").split(",").map((id) => id.trim().toLowerCase()).filter(Boolean));
}

/**
 * `GET /api/admin/stats`: aggregate launch counts for site admins (ADR 0080). Anyone else, signed in
 * or not, falls through to whatever answers a route that does not exist, so the response cannot
 * tell them this one does.
 */
export function registerAdminStats(app: Express, { store, adminAccountIds, now }: { store: RoomStore; adminAccountIds: ReadonlySet<string>; now: () => number }) {
  const isAdmin = (res: Response) => {
    const account = signedIn(res);
    return account !== null && adminAccountIds.has(account.user.id.toLowerCase());
  };
  app.get("/api/admin/me", (_req, res, next) => {
    if (!isAdmin(res)) return next();
    res.status(204).end();
  });
  const pageSize = 25;
  app.get("/api/admin/feedback", async (req, res, next) => {
    if (!isAdmin(res)) return next();
    const { at, id } = req.query;
    const before = at === undefined && id === undefined ? null : FeedbackCursor.safeParse({ createdAt: at, id });
    if (before && !before.success) {
      res.sendStatus(400);
      return;
    }
    const page = await store.listAdminFeedback(pageSize + 1, before?.data);
    const last = page.length > pageSize ? page[pageSize - 1] : undefined;
    res.json({
      reports: page.slice(0, pageSize).map(({ id: _id, ...report }) => report),
      next: last ? { createdAt: last.createdAt, id: last.id } : null,
    } satisfies AdminFeedbackResponse);
  });
  app.get("/api/admin/feedback/:reference/screenshots/:position", async (req, res, next) => {
    if (!isAdmin(res)) return next();
    const reference = FeedbackReference.safeParse(req.params.reference);
    const position = req.params.position;
    if (!reference.success || !/^[0-2]$/.test(position ?? "")) return next();
    const shot = await store.getFeedbackScreenshot(reference.data, Number(position));
    if (!shot) return next();
    res.set("X-Content-Type-Options", "nosniff").type("webp").send(Buffer.from(shot.bytes));
  });
  app.get("/api/admin/stats", (req, res, next) => {
    if (!isAdmin(res)) return next();
    void (async () => {
      const query = LaunchStatsQuery.safeParse(req.query);
      const range = query.success ? resolveStatsRange(query.data, now()) : null;
      if (!range) return res.status(400).json({ error: "Pick real days, the start no later than the end, at most 366 days." });
      const facts = await store.launchStatsFacts(range.window.from, range.window.to);
      res.json(aggregateLaunchStats(facts, range) satisfies LaunchStatsResponse);
    })().catch((err: unknown) => {
      console.error("[vtt] GET /api/admin/stats failed:", errorTag(err));
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    });
  });
}
