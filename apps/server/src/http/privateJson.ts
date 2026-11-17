import type { RequestHandler } from "express";
import { serverEn } from "../i18n/en";

/** Express parse errors can quote a credential-bearing body. Never echo/log those errors. */
export function privateJson(parser: RequestHandler): RequestHandler {
  return (req, res, next) => parser(req, res, (error: unknown) => {
    if (!error || (!req.path.startsWith("/api/oauth/") && !req.path.startsWith("/api/studio/"))) return next(error);
    const status = (error as { type?: unknown }).type === "entity.too.large" ? 413 : 400;
    res.setHeader("Cache-Control", "no-store");
    res.status(status).json({ error: serverEn["studio.invalidJson"], messageId: "studio.invalidJson", code: "invalid_request" });
  });
}
