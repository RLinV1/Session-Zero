import { randomBytes, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  BUILD_LIMITS,
  ChangePasswordRequest,
  DeleteAccountRequest,
  EMAIL_UNVERIFIED_CODE,
  ResendVerificationRequest,
  SIGN_IN_FAILED,
  SignInRequest,
  SignUpRequest,
  VerifyEmailRequest,
  type MeResponse,
  type SignUpResponse,
} from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import { requestLocale } from "../i18n/locale";
import type { DeleteAccount } from "../domain/accountDeletion";
import type { BuildStore } from "../store/buildStore";
import type { StudioStore } from "../store/studioStore";
import { EmailTakenError, type IdentityStore } from "../store/identityStore";
import { requireAccount, signedIn } from "./middleware";
import type { EmailVerification } from "./mailer";
import { verificationEmail, verificationLink, VERIFY_LINK_LIFETIME_MS } from "./verificationEmail";
import { errorTag } from "../http/errorTag";
import { isCommonPassword } from "./commonPasswords";
import { PasswordBusyError, hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from "./passwords";
import { RateLimiter, type LimitResult } from "./rateLimit";
import { clearSessionCookie, sessionCookie, toAccountView, type Sessions } from "./sessions";

const MINUTE = 60 * 1000;
const TOO_COMMON = "That password is too common. Choose another.";

/**
 * The key a client address is limited by (guest-gm-hosting D3): IPv4 as it is, an IPv4-mapped IPv6
 * address as its IPv4, and any other IPv6 address as its /64, since one machine owns a whole /64.
 * An address it can't read is returned unchanged.
 */
export function addressKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  const address = ip.toLowerCase().split("%")[0]!;
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1]!;
  if (!address.includes(":")) return address;
  const [head = "", tail = ""] = address.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = address.includes("::") ? [...front, ...Array<string>(8 - front.length - back.length).fill("0"), ...back] : front;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return address;
  return `${groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}

/**
 * The server's HTTP limiters: those of ADR 0017 I4, plus password-change guesses and invite joins
 * (security-hardening). Exposed so tests can run them on a fake clock.
 */
export function accountLimits(now: () => number = Date.now) {
  return {
    signInFailuresPerEmail: new RateLimiter(10, 15 * MINUTE, now),
    signInPerEmail: new RateLimiter(100, 15 * MINUTE, now),
    signInPerIp: new RateLimiter(150, 15 * MINUTE, now),
    signUpPerIp: new RateLimiter(50, 60 * MINUTE, now),
    /** Rooms created per account, so a script can't fill the database one room at a time (FR-GM-01). */
    roomCreationsPerAccount: new RateLimiter(20, 60 * MINUTE, now),
    /** Wrong current passwords on a password change, per account: the sign-in budget, so a stolen cookie gains nothing. */
    passwordChangeFailuresPerUser: new RateLimiter(10, 15 * MINUTE, now),
    /** Invite join attempts per IP per room, so join-and-leave can't grow a room's log without bound. */
    joinsPerIpPerRoom: new RateLimiter(150, 15 * MINUTE, now),
    /** Invite requests per IP, any code and any room: a wrong code costs a lookup too. A whole class can share an address. */
    inviteLookupsPerIp: new RateLimiter(300, 15 * MINUTE, now),
    /** Replay requests per participant: each one folds the room's whole log on the event loop (FR-PL-07). */
    replaysPerParticipant: new RateLimiter(150, MINUTE, now),
    replaysPerRoom: new RateLimiter(600, MINUTE, now),
    replaysPerIp: new RateLimiter(600, MINUTE, now),
    /** History requests per participant: each one folds the room's whole log on the event loop (FR-REC-01). */
    historyPerParticipant: new RateLimiter(60, MINUTE, now),
    historyPerRoom: new RateLimiter(300, MINUTE, now),
    historyPerIp: new RateLimiter(300, MINUTE, now),
    /** Wall detection runs per room, so one room can't hold the few server-wide job slots (FR-GM-11). */
    wallDetectionsPerRoom: new RateLimiter(50, 15 * MINUTE, now),
    /** Image uploads per account, in rooms and the library together: each one is stored and may queue analysis (FR-GM-02). */
    uploadsPerOwner: new RateLimiter(300, 15 * MINUTE, now),
    /** Requests per build pass, so a runaway AI can't hammer the server (ADR 0053). */
    buildPassRequests: new RateLimiter(BUILD_LIMITS.requestsPerPassPerMinute, MINUTE, now),
    /** Invalid build passes per IP, counted only on failure, so guessing gets refused and working passes don't. */
    buildPassFailuresPerIp: new RateLimiter(60, 15 * MINUTE, now),
    /** OAuth client registrations per address (design D7): registration is open, so the table is bounded and so is this. */
    studioRegistrationsPerIp: new RateLimiter(20, 60 * MINUTE, now),
    /** Invalid delegated Studio tokens or token requests per address, counted only on failure, as for passes. */
    studioTokenFailuresPerIp: new RateLimiter(60, 15 * MINUTE, now),
    studioRevokesPerIp: new RateLimiter(60, 15 * MINUTE, now),
    studioRequestsPerClient: new RateLimiter(1200, 15 * MINUTE, now),
    /** Requests per delegated grant, the same budget as a pass (design D7). */
    studioGrantRequests: new RateLimiter(BUILD_LIMITS.requestsPerPassPerMinute, MINUTE, now),
    /** Guest room creations per address (IPv6 by /64, see `addressKey`); every attempt counts, accepted or not (guest-gm-hosting D3). */
    guestRoomsPerAddress: new RateLimiter(20, 60 * MINUTE, now),
    /** Verification link requests per address and per client address, counted up front as sign-in is (email-verification). */
    resendPerEmail: new RateLimiter(3, 15 * MINUTE, now),
    resendPerIp: new RateLimiter(20, 60 * MINUTE, now),
    verifyPerIp: new RateLimiter(30, 15 * MINUTE, now),
  };
}
export type AccountLimits = ReturnType<typeof accountLimits>;

/** `/api/auth/*`: sign up, sign in, sign out, who am I, change password (FR-GM-01, ADR 0017 C2). */
export function registerIdentityRoutes(
  app: Express,
  deps: { store: IdentityStore & Pick<BuildStore, "endBuildPasses"> & Pick<StudioStore, "endStudioGrants">; sessions: Sessions; limits: AccountLimits; deleteAccount: DeleteAccount; verification?: EmailVerification | null; clientOrigin?: string; now?: () => number },
) {
  const { store, sessions, limits, deleteAccount, verification = null, clientOrigin = "", now = Date.now } = deps;

  app.post("/api/auth/signup", (req, res) => {
    void (async () => {
      noStore(res);
      if (refused(res, limits.signUpPerIp.hit(`signup:${addressKey(req.ip)}`))) return;
      if (!isJson(req, res)) return;
      const body = SignUpRequest.safeParse(req.body);
      if (!body.success) return badRequest(res, body.error.issues);
      if (isCommonPassword(body.data.password)) return badRequest(res, [{ path: ["password"], message: TOO_COMMON }]);
      let user;
      const passwordHash = await hashPassword(body.data.password);
      try {
        user = await store.createUser({
          id: randomUUID(),
          email: body.data.email,
          displayName: body.data.displayName,
          passwordHash,
          emailVerifiedAt: verification ? null : new Date(now()).toISOString(),
        });
      } catch (err) {
        if (!(err instanceof EmailTakenError)) throw err;
        const existing = verification ? await store.findUserByEmail(body.data.email) : null;
        if (!verification || !existing || existing.emailVerifiedAt) return void res.status(409).json({ error: err.message, field: "email" });
        const issued = mintVerification();
        if (!(await store.replaceUnverifiedCredentials(existing.id, passwordHash, issued.hash, issued.createdAt, issued.expiresAt))) {
          return void res.status(409).json({ error: err.message, field: "email" });
        }
        await deliverVerification(verification, existing.email, issued.token, requestLocale(res));
        return void res.status(201).json({ verificationRequired: true, email: existing.email } satisfies SignUpResponse);
      }
      if (!verification) {
        await startSession(res, user.id);
        return void res.status(201).json({ account: toAccountView(user) } satisfies MeResponse);
      }
      await sendVerification(verification, user.id, user.email, requestLocale(res));
      res.status(201).json({ verificationRequired: true, email: user.email } satisfies SignUpResponse);
    })().catch(internalError(res));
  });

  app.post("/api/auth/verify", (req, res) => {
    void (async () => {
      noStore(res);
      if (refused(res, limits.verifyPerIp.hit(`verify:${addressKey(req.ip)}`))) return;
      if (!isJson(req, res)) return;
      const body = VerifyEmailRequest.safeParse(req.body);
      const user = body.success
        ? await store.consumeVerificationToken(hashToken(body.data.token), new Date(now()).toISOString())
        : null;
      if (!user) return void res.status(400).json({ error: "This verification link is invalid or has expired." });
      res.json({ account: null } satisfies MeResponse);
    })().catch(internalError(res));
  });

  app.post("/api/auth/verify/resend", (req, res) => {
    void (async () => {
      noStore(res);
      if (refused(res, limits.resendPerIp.hit(`resend:${addressKey(req.ip)}`))) return;
      if (!isJson(req, res)) return;
      const body = ResendVerificationRequest.safeParse(req.body);
      if (!body.success) return badRequest(res, body.error.issues);
      if (!verification) return void res.status(204).end();
      const user = await store.findUserByEmail(body.data.email);
      const target = user && !user.emailVerifiedAt && limits.resendPerEmail.hit(`resend:${body.data.email}`).ok ? user : null;
      res.status(204).end();
      if (target) await sendVerification(verification, target.id, target.email, requestLocale(res));
    })().catch(internalError(res));
  });

  app.post("/api/auth/signin", (req, res) => {
    void (async () => {
      noStore(res);
      if (refused(res, limits.signInPerIp.hit(`signin:${addressKey(req.ip)}`))) return;
      if (!isJson(req, res)) return;
      const body = SignInRequest.safeParse(req.body);
      if (!body.success) return void res.status(401).json({ error: SIGN_IN_FAILED });
      const emailKey = `signin:${body.data.email}:${addressKey(req.ip)}`;
      if (refused(res, limits.signInPerEmail.hit(`signin:${body.data.email}`))) return;
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
      if (verification && !user.emailVerifiedAt) {
        return void res.status(403).json({ error: "Verify your email address before signing in. Check your inbox for the link.", code: EMAIL_UNVERIFIED_CODE });
      }
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
      if (isCommonPassword(body.data.newPassword)) return badRequest(res, [{ path: ["newPassword"], message: TOO_COMMON }]);
      if (body.data.newPassword.trim().toLowerCase() === current.user.email) {
        return badRequest(res, [{ path: ["newPassword"], message: "Password can't be your email address" }]);
      }
      await store.setPasswordHash(current.user.id, await hashPassword(body.data.newPassword), true);
      await sessions.endOthers(current.user.id, current.session.tokenHash);
      await store.endBuildPasses(current.user.ownerId);
      // Delegated Studio access ends with it, as passes do (design D7).
      await store.endStudioGrants(current.user.ownerId, new Date().toISOString());
      res.status(204).end();
    })().catch(internalError(res));
  });

  /** Erases the account, its rooms and its library (ADR 0050). Asks for the password again. */
  app.delete("/api/auth/account", (req, res) => {
    void (async () => {
      noStore(res);
      if (!isJson(req, res)) return;
      const current = requireAccount(res);
      if (!current) return;
      const body = DeleteAccountRequest.safeParse(req.body);
      if (!body.success) return badRequest(res, body.error.issues);
      const userKey = `password:${current.user.id}`;
      // The password-change budget, counted up front as there: a stolen cookie can't guess here either.
      if (refused(res, limits.passwordChangeFailuresPerUser.hit(userKey))) return;
      if (!(await verifyPassword(current.user.passwordHash, body.data.password))) {
        return void res.status(403).json({ error: "Password is incorrect", field: "password" });
      }
      limits.passwordChangeFailuresPerUser.reset(userKey);
      await deleteAccount(current.user.id, current.user.ownerId);
      res.append("Set-Cookie", clearSessionCookie(sessions.cookie));
      res.status(204).end();
    })().catch(internalError(res));
  });

  function mintVerification() {
    const token = randomBytes(32).toString("base64url");
    const issued = now();
    return { token, hash: hashToken(token), createdAt: new Date(issued).toISOString(), expiresAt: new Date(issued + VERIFY_LINK_LIFETIME_MS).toISOString() };
  }

  async function sendVerification(active: EmailVerification, userId: string, email: string, locale: ReturnType<typeof requestLocale>) {
    const issued = mintVerification();
    await store.createVerificationToken(userId, issued.hash, issued.createdAt, issued.expiresAt);
    await deliverVerification(active, email, issued.token, locale);
  }

  async function deliverVerification(active: EmailVerification, email: string, token: string, locale: ReturnType<typeof requestLocale>) {
    try {
      await active.mailer.send(verificationEmail(locale, email, verificationLink(clientOrigin, token)));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[vtt] verification email failed:", reason);
    }
  }

  async function startSession(res: Response, userId: string) {
    const { token, session } = await sessions.start(userId);
    res.append("Set-Cookie", sessionCookie(token, new Date(session.expiresAt), sessions.cookie));
  }
}

export const TOO_MANY_INVITE_ATTEMPTS = "Too many invite attempts from this address. Try again later.";

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
    if (err instanceof PasswordBusyError) {
      if (!res.headersSent) res.setHeader("Retry-After", "5");
      if (!res.headersSent) res.status(503).json({ error: "The server is busy. Try again in a moment." });
      return;
    }
    console.error("[vtt] account request failed:", errorTag(err));
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  };
}
