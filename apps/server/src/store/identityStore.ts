/**
 * Accounts and sessions (FR-GM-01, ADR 0017, the identity layer). Nothing here is room state,
 * and nothing here knows about rooms, except that ending a session also ends the seat
 * credentials bound to it (ADR 0017 M4), in the same transaction.
 */

export interface UserRecord {
  id: string;
  /** Already trimmed and lowercased by the `Email` schema. */
  email: string;
  displayName: string;
  /** argon2id PHC string. Never leaves the server. */
  passwordHash: string;
  /** The account's own owner row (`gm_identities`), which owns its rooms and library. */
  ownerId: string;
  /** The dice look in use (ADR 0017 O3), one choice per person across devices. */
  activeDiceLookId: string | null;
  createdAt: string;
  passwordChangedAt: string;
}

export type NewUserRecord = Pick<UserRecord, "id" | "email" | "displayName" | "passwordHash">;

export interface SessionRecord {
  /** SHA-256 of the cookie token. */
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  /** Absolute end. The idle end is `lastSeenAt` + the idle window, checked by the caller. */
  expiresAt: string;
}

/** Another account already has this (normalised) email. */
export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists");
  }
}

/** What ending sessions removed, so open connections on those seats can be closed. */
export interface EndedSessions {
  credentialHashes: string[];
}

/** What deleting an account ended and orphaned, for the caller to close sockets and remove objects. */
export interface DeletedUser extends EndedSessions {
  /** Stored objects of the account's library (assets and dice faces); never built-in art. */
  objectKeys: string[];
}

export interface IdentityStore {
  /** Creates the user and its owner row together. Throws `EmailTakenError` on a duplicate email. */
  createUser(user: NewUserRecord): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /**
   * Replaces the password hash. `changed` marks a real password change (not a rehash of the same
   * password with new parameters), which moves `passwordChangedAt`.
   */
  setPasswordHash(userId: string, passwordHash: string, changed: boolean): Promise<void>;
  /** The caller has checked the look belongs to the user's owner row. */
  setActiveDiceLook(userId: string, lookId: string | null): Promise<void>;

  /**
   * Erases the account in one transaction: its sessions (seat credentials first), room
   * memberships, builds, library rows, then the user and its owner row. Its rooms must already be deleted
   * (the foreign keys refuse otherwise). Null when there is no such user.
   */
  deleteUser(userId: string): Promise<DeletedUser | null>;

  createSession(session: SessionRecord): Promise<void>;
  findSession(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(tokenHash: string, at: string): Promise<void>;
  /** Ends one session and its seat credentials. */
  deleteSession(tokenHash: string): Promise<EndedSessions>;
  /** Ends every session of the user except `exceptHash`, with their seat credentials. */
  deleteUserSessions(userId: string, exceptHash?: string): Promise<EndedSessions>;
  /** Ends sessions past their absolute end or idle since `idleBefore`, with their seat credentials. */
  deleteExpiredSessions(now: string, idleBefore: string): Promise<EndedSessions>;
}
