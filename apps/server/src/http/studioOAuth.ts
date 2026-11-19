import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { BUILD_LIMITS } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import { requireAccount } from "../identity/middleware";
import { addressKey, refused, type AccountLimits } from "../identity/routes";
import type { RoomStore } from "../store/roomStore";
import {
  StudioClientLimitError,
  StudioGrantLimitError,
  grantIsLive,
  type StudioGrantRecord,
  type StudioTokenRecord,
} from "../store/studioStore";

/**
 * Session Zero's own OAuth authorization server for delegated Studio access (FR-GM-26, ADR 0073,
 * design D7 "M1a implementation record"). Exactly: RFC 6749 authorization code, RFC 7636 PKCE
 * (S256 only), RFC 7591 registration of public clients, RFC 8707 resource binding, RFC 8414 and
 * RFC 9728 metadata, RFC 7009 revocation and RFC 9207 `iss`. No OpenID Connect is offered or
 * advertised, and no external identity provider is used: consent is the owner's own signed-in
 * website session.
 *
 * Everything here is off unless `STUDIO_PUBLIC_ORIGIN` names the website's origin.
 */

export interface StudioAccessConfig {
  /** The website's origin, which is the issuer; the Studio MCP resource is `<origin>/mcp/studio`. */
  publicOrigin: string;
}

export const STUDIO_RESOURCE_PATH = "/mcp/studio";
export const STUDIO_SCOPE = "studio:build";
export const STUDIO_CONSENT_PATH = "/studio/connect";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const STUDIO_LIMITS = {
  /** About one working session (design D7 amendment 6a); ChatGPT reconnects rather than refreshing. */
  accessTtlMs: 8 * HOUR,
  refreshTtlMs: 14 * DAY,
  /** No token in a grant outlives this, however often it is refreshed. */
  familyTtlMs: 30 * DAY,
  codeTtlMs: 5 * MINUTE,
  maxClients: 200,
  unusedClientMs: HOUR,
  /** A full table may drop a never-used client this old to make room, so a flood can't hold registration shut. */
  evictUnusedClientMs: 10 * MINUTE,
  /**
   * Ended tokens and grants are kept this long before the sweep drops them, so a host still sending
   * a stale token is told it ended rather than counted as guessing.
   */
  endedRetentionMs: 7 * DAY,
  idleClientMs: 90 * DAY,
  maxGrantsPerOwner: 20,
  maxRedirectUris: 5,
  /** `last_used_at` is written at most this often. */
  touchEveryMs: HOUR,
} as const;

const ACCESS_PREFIX = "szs_at_";
const REFRESH_PREFIX = "szs_rt_";
const CODE_PREFIX = "szs_ac_";
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const AccessToken = z.string().regex(new RegExp(`^${ACCESS_PREFIX}[A-Za-z0-9_-]{43}$`));

/** A random 256-bit value, shown once to its holder. Only its SHA-256 is ever stored. */
const mint = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/** `undefined` when unset (the default), so nothing of this exists; a malformed value stops the server. */
export function studioAccessFromEnv(env: NodeJS.ProcessEnv = process.env): StudioAccessConfig | null {
  const value = env.STUDIO_PUBLIC_ORIGIN;
  if (!value) return null;
  return { publicOrigin: parseStudioOrigin(value) };
}

/** An https origin, or http on a loopback host for local development. Throws otherwise. */
export function parseStudioOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("STUDIO_PUBLIC_ORIGIN must be an origin such as https://example.com");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("STUDIO_PUBLIC_ORIGIN must be an https origin such as https://example.com (http only for localhost)");
  }
  return url.origin;
}

export const studioResource = (config: StudioAccessConfig) => `${config.publicOrigin}${STUDIO_RESOURCE_PATH}`;

/** What people read (ADR 0054). Each is in the server catalog. */
export const STUDIO_TEXT = {
  accessEnded: "This connection to Session Zero has ended. Ask the user to reconnect it in their AI app.",
  notAvailable: "Connecting an AI app isn't available on this server.",
  requestInvalid: "This connection request isn't valid. Start connecting again from your AI app.",
  chooseBuild: "Choose at least one build.",
  tooManyConnections: "You have as many AI connections as an account can. Disconnect one on a build page first.",
  tooManyRequests: "Too many requests on this connection: at most 120 a minute. Wait a minute, then continue.",
  tooManyInvalid: "Too many attempts with an invalid connection. Try again later.",
  noSuchConnection: "No such connection.",
} as const;

/** A redirect URI a public client may register: https, or http on loopback (RFC 8252), with no fragment. */
function redirectUriProblem(raw: string): boolean {
  if (raw.length > 512) return true;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  return url.hash !== "" || url.username !== "" || url.password !== "" || !(url.protocol === "https:" || (url.protocol === "http:" && loopback));
}

const Registration = z.looseObject({
  redirect_uris: z.array(z.string()).min(1).max(STUDIO_LIMITS.maxRedirectUris),
  client_name: z.string().max(500).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).max(10).optional(),
  response_types: z.array(z.string()).max(10).optional(),
  scope: z.string().max(500).optional(),
});

const VERIFIED_REDIRECT_HOSTS = new Set(["claude.ai", "claude.com", "chatgpt.com", "chat.openai.com"]);

const PkceValue = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);

/** The authorization request, as the consent page passes it back (RFC 6749 §4.1.1, RFC 7636, RFC 8707). */
const AuthorizationParams = z.object({
  response_type: z.string().max(40).optional(),
  client_id: z.string().max(100),
  redirect_uri: z.string().max(512),
  state: z.string().max(2000).optional(),
  scope: z.string().max(500).optional(),
  resource: z.string().max(512).optional(),
  code_challenge: z.string().max(200).optional(),
  code_challenge_method: z.string().max(20).optional(),
}).catchall(z.string().max(2000));

const Decision = z.strictObject({
  params: z.record(z.string(), z.string().max(2000)),
  decision: z.enum(["allow", "deny"]),
  buildIds: z.array(z.uuid()).max(BUILD_LIMITS.openBuildsPerAccount).default([]),
});

/** Plain text: control and format characters (bidi overrides, zero-width) removed, so a name can't pose as another. Empty when none. */
const shownName = (name: string | undefined) => (name ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 100);

/** The S256 challenge of a verifier, compared without leaking where it differs. */
function pkceMatches(verifier: string, challenge: string): boolean {
  const actual = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A token holder's live access. */
export type StudioAccess = { tokenHash: string; token: StudioTokenRecord; grant: StudioGrantRecord };

/**
 * The live delegated access an `Authorization` header carries for `resource`; otherwise why not.
 * `unknown`: no such token, which is what guessing looks like. `ended`: a real token that expired,
 * was revoked or is for something else. Only `unknown` should count against an address's failure
 * limit: one AI host sends every user's requests from a few addresses, and expired tokens are routine.
 */
export async function resolveStudioAccess(store: RoomStore, resource: string, header: string | undefined, now: number): Promise<StudioAccess | "unknown" | "ended"> {
  const raw = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!raw || !AccessToken.safeParse(raw).success) return "unknown";
  const tokenHash = hashToken(raw);
  const found = await store.findStudioToken(tokenHash);
  if (!found) return "unknown";
  const { token, grant } = found;
  if (token.kind !== "access" || Date.parse(token.expiresAt) <= now || !grantIsLive(grant, now)) return "ended";
  if (grant.resource !== resource || grant.scope.split(" ").indexOf(STUDIO_SCOPE) < 0) return "ended";
  return { tokenHash, token, grant };
}

/**
 * Counts a token that doesn't exist against its address and answers 429 once the address is over
 * its limit; true when it answered. Only the failure path calls this, so a live token is never
 * refused for its address: one AI host sends every user's requests from a few addresses.
 */
export function refusedGuess(limits: AccountLimits, req: Request, res: Response): boolean {
  return refused(res, limits.studioTokenFailuresPerIp.hit(`studio-token:${addressKey(req.ip)}`), STUDIO_TEXT.tooManyInvalid);
}

interface Deps {
  store: RoomStore;
  limits: AccountLimits;
  studio: StudioAccessConfig | null;
  now: () => number;
}

/**
 * The authorization server, both metadata documents, the consent page's two calls, introspection
 * for `apps/mcp`, and the owner's list and disconnect on the build page.
 */
export function registerStudioOAuth(app: Express, deps: Deps) {
  const { store, limits, studio, now } = deps;
  const form = express.urlencoded({ extended: false, limit: "16kb" });
  const refusedGuess_ = (req: Request, res: Response) => refusedGuess(limits, req, res);

  const oauthError = (res: Response, status: number, error: string, description: string) =>
    void res.status(status).json({ error, error_description: description });

  const clientBusy = (res: Response, clientId: string) => {
    const limit = limits.studioRequestsPerClient.hit(`studio-client:${clientId}`);
    if (limit.ok) return false;
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    oauthError(res, 429, "temporarily_unavailable", "Too many requests for this client. Try again later.");
    return true;
  };

  // ---------- Discovery ----------

  // Never OpenID Connect: when this answered, ChatGPT turned OIDC on by default (design D7 amendment 7).
  app.get(["/.well-known/openid-configuration", "/.well-known/openid-configuration/*rest"], (_req, res) => void res.status(404).json({ error: "not_found" }));

  app.get(["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/*rest"], (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // Only the issuer with no path exists (RFC 8414 §3).
    if (!studio || req.path !== "/.well-known/oauth-authorization-server") return void res.status(404).json({ error: "not_found" });
    const issuer = studio.publicOrigin;
    res.json({
      issuer,
      authorization_endpoint: `${issuer}${STUDIO_CONSENT_PATH}`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      revocation_endpoint: `${issuer}/api/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [STUDIO_SCOPE],
      authorization_response_iss_parameter_supported: true,
    });
  });

  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/*rest"], (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!studio || req.path !== `/.well-known/oauth-protected-resource${STUDIO_RESOURCE_PATH}`) return void res.status(404).json({ error: "not_found" });
    res.json({
      resource: studioResource(studio),
      authorization_servers: [studio.publicOrigin],
      scopes_supported: [STUDIO_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Session Zero Studio",
    });
  });

  // Everything below exists only when the Studio is configured.
  app.use(["/api/oauth", "/api/builds/:id/grants"], (_req, res, next) => {
    if (!studio) return void res.status(404).json({ error: STUDIO_TEXT.notAvailable });
    next();
  });
  if (!studio) return { sweep: async () => {} };
  const resource = studioResource(studio);
  const issuer = studio.publicOrigin;

  // ---------- Registration (RFC 7591), public clients only ----------

  app.post("/api/oauth/register", (req, res) => {
    void (async () => {
      const address = `studio-register:${addressKey(req.ip)}`;
      if (refused(res, limits.studioRegistrationsPerIp.hit(address), "Too many attempts. Try again later.")) return;
      const body = Registration.safeParse(req.body);
      if (!body.success) return oauthError(res, 400, "invalid_client_metadata", "redirect_uris is required: 1 to 5 https URLs.");
      const { redirect_uris: redirectUris, token_endpoint_auth_method: method = "none", grant_types: grants, response_types: responses } = body.data;
      if (redirectUris.some(redirectUriProblem)) return oauthError(res, 400, "invalid_redirect_uri", "Each redirect URI must be https (or http on loopback), with no fragment.");
      if (method !== "none") return oauthError(res, 400, "invalid_client_metadata", "Only public clients (token_endpoint_auth_method none) with PKCE are supported.");
      if (grants?.some((g) => g !== "authorization_code" && g !== "refresh_token")) return oauthError(res, 400, "invalid_client_metadata", "Only authorization_code and refresh_token are supported.");
      if (responses?.some((r) => r !== "code")) return oauthError(res, 400, "invalid_client_metadata", "Only the code response type is supported.");
      const at = new Date(now()).toISOString();
      const client = { id: `szc_${randomBytes(16).toString("hex")}`, name: shownName(body.data.client_name), redirectUris: [...new Set(redirectUris)], createdAt: at, lastUsedAt: null };
      try {
        await store.registerStudioClient(client, STUDIO_LIMITS.maxClients, new Date(now() - STUDIO_LIMITS.evictUnusedClientMs).toISOString());
      } catch (err) {
        if (!(err instanceof StudioClientLimitError)) throw err;
        // Only never-used clients older than ten minutes are ever dropped to make room, so a host's
        // working client id is never pushed out; with none of those, refuse.
        res.setHeader("Retry-After", "3600");
        return oauthError(res, 503, "temporarily_unavailable", "This server holds as many registered clients as it can. Unused ones expire within an hour.");
      }
      res.status(201).json({
        client_id: client.id, client_id_issued_at: Math.floor(Date.parse(at) / 1000), client_name: client.name, redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: STUDIO_SCOPE,
      });
    })().catch(failed(res));
  });

  // ---------- Authorization: the consent page's calls ----------

  /**
   * Checks an authorization request in the RFC's order: a bad client or redirect URI is shown on
   * the page and never redirected to; anything else goes back to the client as an error.
   */
  async function checkRequest(raw: unknown) {
    const parsed = AuthorizationParams.safeParse(raw);
    if (!parsed.success) return { fatal: true as const };
    const params = parsed.data;
    const client = await store.findStudioClient(params.client_id);
    if (!client || !client.redirectUris.includes(params.redirect_uri)) return { fatal: true as const };
    /** The client's redirect URI with `fields`, its `state` and our `iss` (RFC 9207) added. */
    const back = (fields: Record<string, string>) => {
      const url = new URL(params.redirect_uri);
      for (const [name, value] of Object.entries({ ...fields, ...(params.state !== undefined ? { state: params.state } : {}), iss: issuer })) url.searchParams.set(name, value);
      return url.toString();
    };
    if (params.response_type !== "code") return { redirect: back({ error: "unsupported_response_type" }) };
    if (params.code_challenge_method !== "S256" || !PkceValue.safeParse(params.code_challenge).success) {
      return { redirect: back({ error: "invalid_request", error_description: "PKCE with S256 is required." }) };
    }
    const scopes = (params.scope ?? STUDIO_SCOPE).split(" ").filter(Boolean);
    if (scopes.some((s) => s !== STUDIO_SCOPE)) return { redirect: back({ error: "invalid_scope" }) };
    if (params.resource !== undefined && params.resource !== resource) return { redirect: back({ error: "invalid_target" }) };
    return { client, params, back };
  }

  app.get("/api/oauth/authorize", (req, res) => {
    void (async () => {
      const checked = await checkRequest(req.query);
      if ("fatal" in checked) return void res.status(400).json({ error: STUDIO_TEXT.requestInvalid, code: "invalid_request" });
      if ("redirect" in checked) return void res.status(400).json({ error: STUDIO_TEXT.requestInvalid, code: "redirect", redirectTo: checked.redirect });
      const account = requireAccount(res);
      if (!account) return;
      const builds = (await store.listBuilds(account.user.ownerId)).filter((b) => b.status === "open");
      const redirectHost = new URL(checked.params.redirect_uri).host;
      res.json({
        client: { name: checked.client.name, redirectHost, verified: VERIFIED_REDIRECT_HOSTS.has(new URL(checked.params.redirect_uri).hostname) },
        builds: builds.map((b) => ({ id: b.id, name: b.name })),
      });
    })().catch(failed(res));
  });

  /** The owner's answer. Cookie and same-origin only, as every account write is (ADR 0017 I3). */
  app.post("/api/oauth/authorize", (req, res) => {
    void (async () => {
      const account = requireAccount(res);
      if (!account) return;
      const body = Decision.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: STUDIO_TEXT.requestInvalid });
      const checked = await checkRequest(body.data.params);
      if ("fatal" in checked) return void res.status(400).json({ error: STUDIO_TEXT.requestInvalid, code: "invalid_request" });
      if ("redirect" in checked) return void res.json({ redirectTo: checked.redirect });
      if (body.data.decision === "deny") return void res.json({ redirectTo: checked.back({ error: "access_denied" }) });
      const buildIds = [...new Set(body.data.buildIds)];
      if (buildIds.length === 0) return void res.status(400).json({ error: STUDIO_TEXT.chooseBuild });
      // Every build must be this owner's and open: another owner's build reads as one that doesn't exist.
      for (const id of buildIds) {
        if ((await store.findBuild(id, account.user.ownerId))?.status !== "open") return void res.status(404).json({ error: "No such build." });
      }
      const code = mint(CODE_PREFIX);
      const at = now();
      const grant: StudioGrantRecord = {
        id: randomUUID(), ownerGmId: account.user.ownerId, clientId: checked.client.id, resource, scope: STUDIO_SCOPE, buildIds,
        codeHash: hashToken(code), codeChallenge: checked.params.code_challenge!, redirectUri: checked.params.redirect_uri,
        codeExpiresAt: new Date(at + STUDIO_LIMITS.codeTtlMs).toISOString(), codeUsedAt: null, createdAt: new Date(at).toISOString(),
        expiresAt: new Date(at + STUDIO_LIMITS.familyTtlMs).toISOString(), revokedAt: null, lastUsedAt: null,
      };
      try {
        await store.createStudioGrant(grant, STUDIO_LIMITS.maxGrantsPerOwner, new Date(at).toISOString());
      } catch (err) {
        if (err instanceof StudioGrantLimitError) return void res.status(409).json({ error: STUDIO_TEXT.tooManyConnections });
        throw err;
      }
      res.json({ redirectTo: checked.back({ code }) });
    })().catch(failed(res));
  });

  // ---------- Tokens ----------

  const newTokens = (grant: StudioGrantRecord, at: number) => {
    const access = mint(ACCESS_PREFIX), refresh = mint(REFRESH_PREFIX);
    const end = Date.parse(grant.expiresAt);
    const accessExpires = Math.min(at + STUDIO_LIMITS.accessTtlMs, end);
    const records: StudioTokenRecord[] = [
      { tokenHash: hashToken(access), grantId: grant.id, kind: "access", expiresAt: new Date(accessExpires).toISOString(), createdAt: new Date(at).toISOString(), usedAt: null },
      { tokenHash: hashToken(refresh), grantId: grant.id, kind: "refresh", expiresAt: new Date(Math.min(at + STUDIO_LIMITS.refreshTtlMs, end)).toISOString(), createdAt: new Date(at).toISOString(), usedAt: null },
    ];
    const reply = { access_token: access, token_type: "Bearer", expires_in: Math.max(0, Math.floor((accessExpires - at) / 1000)), refresh_token: refresh, scope: grant.scope };
    return { records, reply };
  };

  /**
   * `guess`: the client, code or refresh token doesn't exist at all. Only those count against the
   * address, because one AI host sends every user's token requests from a few addresses, and an
   * expired code or a used refresh token is a real one gone stale, not a guess.
   */
  const tokenFailure = (req: Request, res: Response, status: number, error: string, description: string, guess = false) => {
    if (guess && refusedGuess_(req, res)) return;
    oauthError(res, status, error, description);
  };

  app.post("/api/oauth/token", form, (req, res) => {
    void (async () => {
      res.setHeader("Pragma", "no-cache");
      const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
      const field = (name: string) => (typeof body[name] === "string" ? body[name] as string : undefined);
      const client = field("client_id") ? await store.findStudioClient(field("client_id")!) : null;
      if (!client) return tokenFailure(req, res, 401, "invalid_client", "Unknown client_id.", true);
      if (clientBusy(res, client.id)) return;
      if (field("resource") !== undefined && field("resource") !== resource) return tokenFailure(req, res, 400, "invalid_target", "This server only issues tokens for its Studio resource.");
      const at = now();

      if (field("grant_type") === "authorization_code") {
        const code = field("code"), verifier = field("code_verifier");
        const grant = code?.startsWith(CODE_PREFIX) && SECRET.test(code.slice(CODE_PREFIX.length)) ? await store.findStudioGrantByCode(hashToken(code)) : null;
        if (!grant) return tokenFailure(req, res, 400, "invalid_grant", "The code isn't valid.", true);
        if (grant.clientId !== client.id) return tokenFailure(req, res, 400, "invalid_grant", "The code isn't valid.");
        if (grant.codeUsedAt !== null) {
          // A replayed code: whoever holds it may have the tokens too, so end them all (RFC 6749 §4.1.2).
          await store.revokeStudioGrant(grant.id, new Date(at).toISOString());
          return tokenFailure(req, res, 400, "invalid_grant", "The code was already used.");
        }
        if (Date.parse(grant.codeExpiresAt) <= at || grant.revokedAt !== null) return tokenFailure(req, res, 400, "invalid_grant", "The code has expired.");
        if (field("redirect_uri") !== grant.redirectUri) return tokenFailure(req, res, 400, "invalid_grant", "redirect_uri doesn't match the authorization request.");
        if (!verifier || !PkceValue.safeParse(verifier).success || !pkceMatches(verifier, grant.codeChallenge)) return tokenFailure(req, res, 400, "invalid_grant", "code_verifier doesn't match.");
        const issued = newTokens(grant, at);
        if (!await store.redeemStudioCode(grant.id, new Date(at).toISOString(), issued.records)) {
          // Another exchange of the same code won at the same moment: that is a replay too.
          if ((await store.findStudioGrantByCode(grant.codeHash))?.codeUsedAt) await store.revokeStudioGrant(grant.id, new Date(at).toISOString());
          return tokenFailure(req, res, 400, "invalid_grant", "The code isn't valid.");
        }
        return void res.json(issued.reply);
      }

      if (field("grant_type") === "refresh_token") {
        const refresh = field("refresh_token");
        const found = refresh?.startsWith(REFRESH_PREFIX) && SECRET.test(refresh.slice(REFRESH_PREFIX.length)) ? await store.findStudioToken(hashToken(refresh)) : null;
        if (!found) return tokenFailure(req, res, 400, "invalid_grant", "The refresh token isn't valid.", true);
        if (found.token.kind !== "refresh" || found.grant.clientId !== client.id) return tokenFailure(req, res, 400, "invalid_grant", "The refresh token isn't valid.");
        const scope = field("scope");
        if (scope !== undefined && scope.split(" ").some((s) => s && s !== STUDIO_SCOPE)) return tokenFailure(req, res, 400, "invalid_scope", "Only studio:build is available.");
        if (found.token.usedAt !== null) {
          // A rotated refresh token came back: one of its two holders isn't the client. End the family.
          await store.revokeStudioGrant(found.grant.id, new Date(at).toISOString());
          return tokenFailure(req, res, 400, "invalid_grant", "The refresh token was already used.");
        }
        const issued = newTokens(found.grant, at);
        if (!grantIsLive(found.grant, at) || !await store.rotateStudioRefresh(found.token.tokenHash, new Date(at).toISOString(), issued.records)) {
          // Rotated by another request at the same moment: reuse, so the family ends as above.
          if ((await store.findStudioToken(found.token.tokenHash))?.token.usedAt) await store.revokeStudioGrant(found.grant.id, new Date(at).toISOString());
          return tokenFailure(req, res, 400, "invalid_grant", "The refresh token has expired or was revoked.");
        }
        return void res.json(issued.reply);
      }

      oauthError(res, 400, "unsupported_grant_type", "Use authorization_code or refresh_token.");
    })().catch(failed(res));
  });

  /** RFC 7009. Ends the token's whole grant. Always 200 for a known client, whether or not the token was known. */
  app.post("/api/oauth/revoke", form, (req, res) => {
    void (async () => {
      const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
      const clientId = typeof body.client_id === "string" ? body.client_id : null;
      const token = typeof body.token === "string" ? body.token : null;
      if (refused(res, limits.studioRevokesPerIp.hit(`studio-revoke:${addressKey(req.ip)}`), "Too many attempts. Try again later.")) return;
      if (!clientId || !await store.findStudioClient(clientId)) return oauthError(res, 401, "invalid_client", "Unknown client_id.");
      if (clientBusy(res, clientId)) return;
      if (!token) return oauthError(res, 400, "invalid_request", "token is required.");
      const found = await store.findStudioToken(hashToken(token));
      if (found && found.grant.clientId === clientId) await store.revokeStudioGrant(found.grant.id, new Date(now()).toISOString());
      res.status(200).json({});
    })().catch(failed(res));
  });

  /**
   * For `apps/mcp`, which presents the token it was given as this request's own bearer. The answer
   * describes only that token, so the endpoint needs no other credential and an invalid token
   * learns nothing (RFC 7662's response shape). Failures are limited per address.
   */
  app.post("/api/oauth/introspect", (req, res) => {
    void (async () => {
      const access = await resolveStudioAccess(store, resource, req.headers.authorization, now());
      if (typeof access === "string") {
        if (access === "unknown" && refusedGuess_(req, res)) return;
        return void res.json({ active: false });
      }
      const { grant, token } = access;
      res.json({
        active: true, token_type: "Bearer", scope: grant.scope, client_id: grant.clientId, aud: grant.resource, iss: issuer,
        exp: Math.floor(Date.parse(token.expiresAt) / 1000), builds: grant.buildIds,
      });
    })().catch(failed(res));
  });

  // ---------- The owner's connections, on the build page ----------

  const ownerBuild = async (req: Request, res: Response) => {
    const account = requireAccount(res);
    if (!account) return null;
    const id = z.uuid().safeParse(req.params.id);
    const build = id.success ? await store.findBuild(id.data, account.user.ownerId) : null;
    if (!build) {
      res.status(404).json({ error: "No such build." });
      return null;
    }
    return { build, account };
  };

  app.get("/api/builds/:id/grants", (req, res) => {
    void (async () => {
      const found = await ownerBuild(req, res);
      if (!found) return;
      const ownerGmId = found.account.user.ownerId;
      const grants = (await store.listStudioGrants(ownerGmId, new Date(now()).toISOString())).filter((g) => g.buildIds.includes(found.build.id));
      const names = new Map((await store.listBuilds(ownerGmId)).map((b) => [b.id, b.name]));
      const view = [];
      for (const grant of grants) {
        const client = await store.findStudioClient(grant.clientId);
        view.push({
          id: grant.id, clientName: client?.name ?? "", redirectHost: new URL(grant.redirectUri).host,
          createdAt: grant.createdAt, lastUsedAt: grant.lastUsedAt, expiresAt: grant.expiresAt,
          builds: grant.buildIds.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! })),
        });
      }
      res.json({ grants: view });
    })().catch(failed(res));
  });

  /** Ends the whole connection: every token in it, for every build it covered. */
  app.delete("/api/builds/:id/grants/:grantId", (req, res) => {
    void (async () => {
      const found = await ownerBuild(req, res);
      if (!found) return;
      const ownerGmId = found.account.user.ownerId;
      const grant = (await store.listStudioGrants(ownerGmId, new Date(now()).toISOString())).find((g) => g.id === req.params.grantId && g.buildIds.includes(found.build.id));
      if (!grant || !await store.revokeStudioGrant(grant.id, new Date(now()).toISOString(), ownerGmId)) return void res.status(404).json({ error: STUDIO_TEXT.noSuchConnection });
      res.status(204).end();
    })().catch(failed(res));
  });

  /** Hourly: expired tokens, ended grants, unused and idle clients. */
  const sweep = async () => {
    const at = now();
    await store.sweepStudio({
      now: new Date(at).toISOString(),
      unusedClientsBefore: new Date(at - STUDIO_LIMITS.unusedClientMs).toISOString(),
      idleClientsBefore: new Date(at - STUDIO_LIMITS.idleClientMs).toISOString(),
      endedBefore: new Date(at - STUDIO_LIMITS.endedRetentionMs).toISOString(),
    });
  };
  return { sweep };
}

/** Logs the error's name only: a body here may hold a code, a token or a verifier. */
function failed(res: Response) {
  return (err: unknown) => {
    console.error("[vtt] studio access request failed", err instanceof Error ? err.name : "error");
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Try again." });
  };
}
