import { randomBytes } from "node:crypto";
import type { AccountView } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import type { EndedSessions, IdentityStore, SessionRecord, UserRecord } from "../store/identityStore";

/**
 * Sessions (ADR 0017 I1). The server mints an opaque token and sets it as an HttpOnly cookie, so
 * page script never holds it; only its SHA-256 is stored. A session ends after 30 days without a
 * request or 90 days after sign-in, whichever comes first, and can be ended at once by deleting
 * its row.
 */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const UNVERIFIED_USER_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000;
/** `last_seen_at` is written at most this often, so ordinary requests don't each cost a write. */
export const TOUCH_EVERY_MS = 60 * 60 * 1000;

export interface CookieOptions {
  /** Adds `Secure` and the `__Host-` prefix. On whenever the app is served over HTTPS. */
  secure: boolean;
}

/** `__Host-` pins the cookie to this host with `Path=/` and no `Domain`; browsers require `Secure` for it. */
export const cookieName = ({ secure }: CookieOptions) => (secure ? "__Host-vtt_session" : "vtt_session");

export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The session token from a `Cookie` header, or null. Express 5 has no cookie parser; one cookie does not need one. */
export function readSessionCookie(header: string | undefined, options: CookieOptions): string | null {
  if (!header) return null;
  const name = cookieName(options);
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
    }
  }
  return null;
}

const flags = (options: CookieOptions) => `Path=/; HttpOnly; SameSite=Lax${options.secure ? "; Secure" : ""}`;

export function sessionCookie(token: string, expiresAt: Date, options: CookieOptions): string {
  return `${cookieName(options)}=${token}; ${flags(options)}; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie(options: CookieOptions): string {
  return `${cookieName(options)}=; ${flags(options)}; Max-Age=0`;
}

/** Whether a session may still be used at `now`: neither idle too long nor past its absolute end. */
export function isLive(session: SessionRecord, now: number): boolean {
  return now < Math.min(Date.parse(session.lastSeenAt) + SESSION_IDLE_MS, Date.parse(session.expiresAt));
}

export function toAccountView(user: UserRecord): AccountView {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export interface SignedIn {
  user: UserRecord;
  session: SessionRecord;
}

/**
 * Starting, resolving and ending sessions over the identity store, with an injected clock so
 * expiry is testable. Whatever ends sessions reports the seat credentials that ended with them
 * to `onEnded`, which closes those connections (ADR 0017 M4).
 */
export class Sessions {
  private onEnded: (ended: EndedSessions) => void = () => {};

  constructor(
    private store: IdentityStore,
    readonly cookie: CookieOptions,
    private now: () => number = Date.now,
  ) {}

  /** Called with the seat credentials that ended whenever sessions end. */
  whenEnded(handler: (ended: EndedSessions) => void) {
    this.onEnded = handler;
  }

  async start(userId: string): Promise<{ token: string; session: SessionRecord }> {
    const token = mintSessionToken();
    const now = this.now();
    const session: SessionRecord = {
      tokenHash: hashToken(token),
      userId,
      createdAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_MAX_MS).toISOString(),
    };
    await this.store.createSession(session);
    return { token, session };
  }

  /** The account behind a cookie token, touching the session at most hourly; null if it has ended. */
  async resolve(token: string): Promise<SignedIn | null> {
    const tokenHash = hashToken(token);
    const session = await this.store.findSession(tokenHash);
    if (!session) return null;
    const now = this.now();
    if (!isLive(session, now)) {
      // Ended but not swept yet: end it now, with its seats, rather than wait for the sweep.
      await this.end(tokenHash);
      return null;
    }
    const user = await this.store.findUserById(session.userId);
    if (!user) return null;
    if (now - Date.parse(session.lastSeenAt) >= TOUCH_EVERY_MS) {
      const at = new Date(now).toISOString();
      await this.store.touchSession(tokenHash, at);
      session.lastSeenAt = at;
    }
    return { user, session };
  }

  /** Whether a session is still live, for checks that already have its hash (the socket handshake). */
  async isLive(tokenHash: string): Promise<boolean> {
    const session = await this.store.findSession(tokenHash);
    return !!session && isLive(session, this.now());
  }

  async end(tokenHash: string) {
    this.report(await this.store.deleteSession(tokenHash));
  }

  /** Ends every other session of the user, keeping `keepHash` (a password change, ADR 0017 I1). */
  async endOthers(userId: string, keepHash?: string) {
    this.report(await this.store.deleteUserSessions(userId, keepHash));
  }

  /** Deletes ended sessions and their seats. Runs hourly; also safe to call at any time. */
  async sweep() {
    const now = this.now();
    this.report(
      await this.store.deleteExpiredSessions(new Date(now).toISOString(), new Date(now - SESSION_IDLE_MS).toISOString()),
    );
    await this.store.deleteExpiredVerificationTokens(new Date(now).toISOString());
    await this.store.deleteStaleUnverifiedUsers(new Date(now - UNVERIFIED_USER_MS).toISOString());
  }

  /**
   * Sweeps every `everyMs` until the returned function is called, then runs `alsoEachTime` (the
   * registry's check for seats ended in another process). The timer never holds the process open.
   */
  startSweeping(alsoEachTime: () => Promise<void> = async () => {}, everyMs = TOUCH_EVERY_MS): () => void {
    const timer = setInterval(() => {
      this.sweep()
        .then(alsoEachTime)
        .catch((err: unknown) => console.error("[vtt] session sweep failed:", err));
    }, everyMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  private report(ended: EndedSessions) {
    if (ended.credentialHashes.length > 0) this.onEnded(ended);
  }
}
