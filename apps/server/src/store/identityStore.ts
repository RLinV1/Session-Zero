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
  emailVerifiedAt: string | null;
  credentialVersion: number;
}

export type NewUserRecord = Pick<UserRecord, "id" | "email" | "displayName" | "passwordHash"> & { emailVerifiedAt?: string | null };

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
  markEmailVerified(userId: string, at: string): Promise<void>;
  /**
   * Stores the hash of a new verification token for `credentialVersion` and deletes the user's
   * earlier ones. False, storing nothing, when the user's credentials have moved past that version or the user is gone.
   */
  createVerificationToken(userId: string, tokenHash: string, createdAt: string, expiresAt: string, credentialVersion: number): Promise<boolean>;
  /**
   * One step, only while the user is still unverified: replaces the password hash and the user's
   * tokens with the new one, and moves the credential version on. False, changing nothing, when the user is verified or gone.
   */
  replaceUnverifiedCredentials(userId: string, passwordHash: string, tokenHash: string, createdAt: string, expiresAt: string): Promise<boolean>;
  /** Deletes the token and, when it exists, has not expired at `now` and matches the user's credential version, marks its user verified at `now` and returns it; null otherwise. */
  consumeVerificationToken(tokenHash: string, now: string): Promise<UserRecord | null>;
  deleteExpiredVerificationTokens(now: string): Promise<void>;
  /** Deletes unverified users created before `createdBefore` that hold no verification token (BE-AUDIT squatting), rechecking each one as it is deleted. */
  deleteStaleUnverifiedUsers(createdBefore: string): Promise<void>;
  /** The caller has checked the look belongs to the user's owner row. */
  setActiveDiceLook(userId: string, lookId: string | null): Promise<void>;

  /**
   * Erases the account in one transaction: its sessions (seat credentials first), room
   * memberships, builds, library rows, then the user and its owner row. Its rooms must already be deleted
   * (the foreign keys refuse otherwise). Null when there is no such user.
   */
  deleteUser(userId: string, staleBefore?: string): Promise<DeletedUser | null>;

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
