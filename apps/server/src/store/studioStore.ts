/**
 * Delegated Studio access (FR-GM-26, ADR 0073, design D7 "M1a implementation record"). Session
 * Zero's own OAuth authorization server keeps three kinds of record here: registered public
 * clients, grants (one owner's consent to one client for chosen builds, which is also one token
 * family) and token hashes. Nothing here is room state or part of the library, and no token,
 * authorization code or PKCE verifier is ever stored, only SHA-256 hashes of the first two.
 */

export type StudioTokenKind = "access" | "refresh";

export interface StudioClientRecord {
  /** Public: the host shows it and sends it on every request. */
  id: string;
  /** As the client registered it, so it is shown as a claim, never as proof of who it is. */
  name: string;
  redirectUris: string[];
  createdAt: string;
  /** When it first or last received a token; null until then, and such a client expires within an hour. */
  lastUsedAt: string | null;
}

export interface StudioGrantRecord {
  id: string;
  ownerGmId: string;
  clientId: string;
  /** The one resource its tokens are for (RFC 8707): `<origin>/mcp/studio`. */
  resource: string;
  scope: string;
  /** The builds the owner ticked on the consent page. Fixed for the grant's life. */
  buildIds: string[];
  /** Build-by-build permission to create private requests and restore revisions. */
  correctionBuildIds?: string[];
  /** SHA-256 of the single-use authorization code. */
  codeHash: string;
  /** The PKCE S256 challenge the code was issued against. */
  codeChallenge: string;
  redirectUri: string;
  codeExpiresAt: string;
  /** Set once the code is exchanged; a second exchange revokes the grant (RFC 6749 §4.1.2). */
  codeUsedAt: string | null;
  createdAt: string;
  /** The family's absolute end: no token in it outlives this. */
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface StudioTokenRecord {
  tokenHash: string;
  grantId: string;
  kind: StudioTokenKind;
  expiresAt: string;
  createdAt: string;
  /** For a refresh token: when it was rotated. Presenting it again revokes the grant. */
  usedAt: string | null;
}

/** A grant the server can still act on at `now`: exchanged, not revoked and not past its family's end. */
export function grantIsLive(grant: Pick<StudioGrantRecord, "codeUsedAt" | "revokedAt" | "expiresAt">, now: number): boolean {
  return grant.codeUsedAt !== null && grant.revokedAt === null && Date.parse(grant.expiresAt) > now;
}

/** Registration is open to anyone (RFC 7591), so the table is full at some point; then it refuses. */
export class StudioClientLimitError extends Error {
  constructor() {
    super("studio_client_limit");
  }
}

/** The owner already has as many live connections as an account may. */
export class StudioGrantLimitError extends Error {
  constructor() {
    super("studio_grant_limit");
  }
}

/**
 * A delegated write's access ended before it could commit: the token expired, or the grant was
 * revoked, expired or no longer covers this build. Thrown inside the write, which saved nothing.
 */
export class StudioAccessEndedError extends Error {
  constructor() {
    super("studio_access_ended");
  }
}

/**
 * The delegated token a build write is made with, checked again inside the write (design D7):
 * `tokenHash` must still be a live access token whose grant covers `buildId`, owned by the build's owner.
 */
export interface StudioDelegation {
  tokenHash: string;
  /** The server's clock, read inside the write, so a token that expires between check and write writes nothing. */
  now: () => number;
}

/** Whether `delegation` still allows a write to `build`, from records already read under the write's lock. */
export function delegationAllows(
  delegation: StudioDelegation,
  token: StudioTokenRecord | null | undefined,
  grant: StudioGrantRecord | null | undefined,
  build: { id: string; ownerGmId: string },
): boolean {
  return !!token && !!grant && token.kind === "access" && token.grantId === grant.id
    && Date.parse(token.expiresAt) > delegation.now() && grantIsLive(grant, delegation.now())
    && grant.ownerGmId === build.ownerGmId && grant.buildIds.includes(build.id);
}

export interface StudioSweepTimes {
  now: string;
  /** Clients with no token created before this are dropped. */
  unusedClientsBefore: string;
  /** Used clients with no live grant, last used before this, are dropped. */
  idleClientsBefore: string;
  /** Expired tokens, and revoked or expired grants, ended before this are dropped; newer ones are kept to read as ended. */
  endedBefore: string;
}

export interface StudioStore {
  /**
   * Adds a client. When `max` are held, first drops the oldest client that never got a token, has no
   * grant and was registered before `evictUnusedBefore`; with none, throws `StudioClientLimitError`.
   * One step, so concurrent registrations can't pass `max`.
   */
  registerStudioClient(client: StudioClientRecord, max: number, evictUnusedBefore: string): Promise<void>;
  findStudioClient(id: string): Promise<StudioClientRecord | null>;

  /** Adds a grant waiting for its code to be exchanged. Throws `StudioGrantLimitError` past `maxLive` live or pending grants. */
  createStudioGrant(grant: StudioGrantRecord, maxLive: number, now: string): Promise<void>;
  findStudioGrantByCode(codeHash: string): Promise<StudioGrantRecord | null>;
  /**
   * Marks the code used and stores the first tokens, in one step, only if the code was unused and
   * unexpired and the grant unrevoked. False otherwise, with nothing stored. Also marks the client used.
   */
  redeemStudioCode(grantId: string, now: string, tokens: StudioTokenRecord[]): Promise<boolean>;
  /** A token with its grant, or null. Expiry is the caller's to judge. */
  findStudioToken(tokenHash: string): Promise<{ token: StudioTokenRecord; grant: StudioGrantRecord } | null>;
  /**
   * Rotates a refresh token: marks it used and stores the new tokens, in one step, only while it is
   * unused and unexpired and its grant is live. False otherwise, with nothing stored.
   */
  rotateStudioRefresh(tokenHash: string, now: string, tokens: StudioTokenRecord[]): Promise<boolean>;
  /** Ends every token of the grant. `ownerGmId` limits it to that owner's grant. False when there is no such grant. */
  revokeStudioGrant(grantId: string, now: string, ownerGmId?: string): Promise<boolean>;
  /** Ends every grant of the account, as a password change must. */
  endStudioGrants(ownerGmId: string, now: string): Promise<void>;
  /** The owner's exchanged grants that are still live at `now`, newest first. */
  listStudioGrants(ownerGmId: string, now: string): Promise<StudioGrantRecord[]>;
  setStudioCorrectionPermission(buildId: string, ownerGmId: string, grantId: string, enabled: boolean, now: () => number): Promise<boolean>;
  /** Records use, at most as often as the caller decides. */
  touchStudioGrant(grantId: string, at: string): Promise<void>;
  /** Drops expired tokens, ended or never-exchanged grants, and unused or idle clients. */
  sweepStudio(times: StudioSweepTimes): Promise<void>;
}
