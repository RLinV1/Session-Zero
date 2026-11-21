import type { Express } from "express";
import { LaunchStatsQuery, type LaunchStatsResponse } from "@vtt/shared";
import { aggregateLaunchStats, resolveStatsRange } from "../domain/launchStats";
import { signedIn } from "../identity/middleware";
import type { RoomStore } from "../store/roomStore";
import { errorTag } from "./errorTag";

/**
 * The accounts allowed to read launch stats (ADR 0079): `ADMIN_ACCOUNT_IDS`, account ids separated
 * by commas. Unset or empty means nobody, so the page does not exist anywhere it isn't configured.
 */
export function adminAccountIdsFromEnv(value = process.env.ADMIN_ACCOUNT_IDS): ReadonlySet<string> {
  return new Set((value ?? "").split(",").map((id) => id.trim().toLowerCase()).filter(Boolean));
}

/**
 * `GET /api/admin/stats`: aggregate launch counts for site admins (ADR 0079). Anyone else, signed in
 * or not, falls through to whatever answers a route that does not exist, so the response cannot
 * tell them this one does.
 */
export function registerAdminStats(app: Express, { store, adminAccountIds, now }: { store: RoomStore; adminAccountIds: ReadonlySet<string>; now: () => number }) {
  app.get("/api/admin/stats", (req, res, next) => {
    const account = signedIn(res);
    if (!account || !adminAccountIds.has(account.user.id.toLowerCase())) return next();
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
