import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  ChangePasswordRequest,
  SIGN_IN_FAILED,
  SignInRequest,
  SignUpRequest,
  type MeResponse,
} from "@vtt/shared";
import { EmailTakenError, type IdentityStore } from "../store/identityStore";
import { requireAccount, signedIn } from "./middleware";
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from "./passwords";
import { RateLimiter, type LimitResult } from "./rateLimit";
import { clearSessionCookie, sessionCookie, toAccountView, type Sessions } from "./sessions";

const MINUTE = 60 * 1000;

/**
 * The server's HTTP limiters: those of ADR 0017 I4, plus password-change guesses and invite joins
 * (security-hardening). Exposed so tests can run them on a fake clock.
 */
export function accountLimits(now: () => number = Date.now) {
  return {
    signInFailuresPerEmail: new RateLimiter(10, 15 * MINUTE, now),
    signInPerIp: new RateLimiter(150, 15 * MINUTE, now),
    signUpPerIp: new RateLimiter(50, 60 * MINUTE, now),
    /** Wrong current passwords on a password change, per account: the sign-in budget, so a stolen cookie gains nothing. */
    passwordChangeFailuresPerUser: new RateLimiter(10, 15 * MINUTE, now),
    /** Invite join attempts per IP per room, so join-and-leave can't grow a room's log without bound. */
    joinsPerIpPerRoom: new RateLimiter(150, 15 * MINUTE, now),
    /** Replay requests per participant: each one folds the room's whole log on the event loop (FR-PL-07). */
    replaysPerParticipant: new RateLimiter(150, MINUTE, now),
    /** Wall detection runs per room, so one room can't hold the few server-wide job slots (FR-GM-11). */
    wallDetectionsPerRoom: new RateLimiter(50, 15 * MINUTE, now),
    /** Image uploads per account, in rooms and the library together: each one is stored and may queue analysis (FR-GM-02). */
    uploadsPerOwner: new RateLimiter(300, 15 * MINUTE, now),
  };
}
export type AccountLimits = ReturnType<typeof accountLimits>;

/** `/api/auth/*`: sign up, sign in, sign out, who am I, change password (FR-GM-01, ADR 0017 C2). */
export function registerIdentityRoutes(
  app: Express,
  deps: { store: IdentityStore; sessions: Sessions; limits: AccountLimits },
) {
  const { store, sessions, limits } = deps;

  app.post("/api/auth/signup", (req, res) => {
    void (async () => {
      noStore(res);
      if (refused(res, limits.signUpPerIp.hit(`signup:${req.ip}`))) return;
      if (!isJson(req, res)) return;
      const body = SignUpRequest.safeParse(req.body);
      if (!body.success) return badRequest(res, body.error.issues);
      let user;
      try {
        user = await store.createUser({
          id: randomUUID(),
          email: body.data.email,
          displayName: body.data.displayName,
          passwordHash: await hashPassword(body.data.password),
        });
      } catch (err) {
        if (err instanceof EmailTakenError) return void res.status(409).json({ error: err.message, field: "email" });
        throw err;
      }
      await startSession(res, user.id);
      res.status(201).json({ account: toAccountView(user) } satisfies MeResponse);
    })().catch(internalError(res));
  });

  app.post("/api/auth/signin", (req, res) => {
    void (async () => {
      noStore(res);
      if (refused(res, limits.signInPerIp.hit(`signin:${req.ip}`))) return;
      if (!isJson(req, res)) return;
      const body = SignInRequest.safeParse(req.body);
      if (!body.success) return void res.status(401).json({ error: SIGN_IN_FAILED });
      const emailKey = `signin:${body.data.email}`;
      // Counted before any password work, and cleared again on success: a limited email costs no
      // hashing, and the right password is refused too until the window passes. Counting up front
      // (not after the await) means a burst sent at once can't all pass before any failure is
      // recorded (security-hardening).
      if (refused(res, limits.signInFailuresPerEmail.hit(emailKey))) return;

      const user = await store.findUserByEmail(body.data.email);
      const ok = user
        ? await verifyPassword(user.passwordHash, body.data.password)
        : await verifyAgainstDummy(body.data.password);
      if (!user || !ok) return void res.status(401).json({ error: SIGN_IN_FAILED });
      limits.signInFailuresPerEmail.reset(emailKey);
      if (needsRehash(user.passwordHash)) {
        await store.setPasswordHash(user.id, await hashPassword(body.data.password), false);
      }
      await startSession(res, user.id);
      res.json({ account: toAccountView(user) } satisfies MeResponse);
    })().catch(internalError(res));
  });

  app.post("/api/auth/signout", (_req, res) => {
    void (async () => {
      noStore(res);
      const current = signedIn(res);
      if (current) await sessions.end(current.session.tokenHash);
      res.append("Set-Cookie", clearSessionCookie(sessions.cookie));
      res.status(204).end();
    })().catch(internalError(res));
  });

  /** Signed out is a normal state checked on every page load, so it is a 200 with null, not a 401. */
  app.get("/api/auth/me", (_req, res) => {
    noStore(res);
    const current = signedIn(res);
    res.json({ account: current ? toAccountView(current.user) : null } satisfies MeResponse);
  });

  /** Ends every other session of the account, and keeps this one (ADR 0017 I1). */
  app.post("/api/auth/password", (req, res) => {
    void (async () => {
      noStore(res);
      if (!isJson(req, res)) return;
      const current = requireAccount(res);
      if (!current) return;
      const body = ChangePasswordRequest.safeParse(req.body);
      if (!body.success) return badRequest(res, body.error.issues);
      const userKey = `password:${current.user.id}`;
      // Counted before any password work and cleared on success, as on sign-in: a limited account
      // costs no hashing, and a burst can't all pass before a failure is recorded.
      if (refused(res, limits.passwordChangeFailuresPerUser.hit(userKey))) return;
      if (!(await verifyPassword(current.user.passwordHash, body.data.currentPassword))) {
        return void res.status(403).json({ error: "Current password is incorrect", field: "currentPassword" });
      }
      limits.passwordChangeFailuresPerUser.reset(userKey);
      if (body.data.newPassword.trim().toLowerCase() === current.user.email) {
        return badRequest(res, [{ path: ["newPassword"], message: "Password can't be your email address" }]);
      }
      await store.setPasswordHash(current.user.id, await hashPassword(body.data.newPassword), true);
      await sessions.endOthers(current.user.id, current.session.tokenHash);
      res.status(204).end();
    })().catch(internalError(res));
  });

  async function startSession(res: Response, userId: string) {
    const { token, session } = await sessions.start(userId);
    res.append("Set-Cookie", sessionCookie(token, new Date(session.expiresAt), sessions.cookie));
  }
}

/** A 429 with `Retry-After` when the limiter refused; true if it did. */
export function refused(res: Response, limit: LimitResult, error = "Too many attempts. Try again later."): boolean {
  if (limit.ok) return false;
  res.setHeader("Retry-After", String(limit.retryAfterSec));
  res.status(429).json({ error, retryAfterSec: limit.retryAfterSec });
  return true;
}

/** Account requests are JSON only, so an HTML form on another site can't post to them at all. */
function isJson(req: Request, res: Response): boolean {
  if (req.is("application/json")) return true;
  res.status(415).json({ error: "Send JSON" });
  return false;
}

/** A 400 naming the first field that failed, so the form can show the message beside it. */
function badRequest(res: Response, issues: { path: PropertyKey[]; message: string }[]) {
  const first = issues[0];
  res.status(400).json({ error: first?.message ?? "Invalid request", field: first?.path[0] ?? null, issues });
}

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
}

/** Logs without the body: it may carry a password. */
function internalError(res: Response) {
  return (err: unknown) => {
    console.error("[vtt] account request failed:", err instanceof Error ? err.message : err);
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  };
}
