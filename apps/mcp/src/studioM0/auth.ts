import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response, type Router } from "express";
import type { EvidenceLog } from "./store";

/**
 * M0 ONLY — a STUB OAuth 2.1 authorization server and resource-server check for the fixture Studio.
 * It is shaped like the M1 proposal (research.md Q5): Session Zero issues opaque, hashed, expiring,
 * revocable tokens bound to one resource, and the resource server looks them up. It is NOT that
 * implementation: identities are two fixture testers chosen on a consent page with no password,
 * nothing is persisted, and there is no link to Session Zero accounts or builds.
 */

export const STUDIO_SCOPE = "studio:m0";
export const TESTERS = ["m0-tester-a", "m0-tester-b"] as const;

const CODE_TTL_MS = 5 * 60_000;
const REFRESH_TTL_MS = 24 * 60 * 60_000;
const FORM_TTL_MS = 10 * 60_000;

export interface Principal {
  subject: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

interface Client {
  clientId: string;
  secret?: string;
  redirectUris: string[];
  authMethod: "none" | "client_secret_post" | "client_secret_basic";
  registration: "dcr" | "static";
  name?: string;
}

interface Grant {
  subject: string;
  clientId: string;
  scopes: string[];
  resource: string;
  expiresAt: number;
  kind: "access" | "refresh";
}

interface PendingCode extends Omit<Grant, "kind" | "expiresAt"> {
  redirectUri: string;
  challenge: string;
  expiresAt: number;
}

export interface StudioAuthOptions {
  publicOrigin: string;
  resourcePath: string;
  dataDir: string;
  accessTtlSeconds?: number;
  now?: () => number;
  log: EvidenceLog;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export class StudioAuth {
  readonly resourceUrl: string;
  readonly issuer: string;
  readonly metadataUrl: string;
  private clients = new Map<string, Client>();
  private codes = new Map<string, PendingCode>();
  private grants = new Map<string, Grant>();
  private forms = new Map<string, number>();
  private now: () => number;
  private accessTtlMs: number;
  operatorKey = "";
  /** Set by the Studio M0 wiring: re-download a held host descriptor and report only the outcome. */
  replayDescriptor?: (hostFileId: string) => Promise<Record<string, unknown>>;

  constructor(private options: StudioAuthOptions) {
    this.issuer = options.publicOrigin;
    this.resourceUrl = `${options.publicOrigin}${options.resourcePath}`;
    this.metadataUrl = `${options.publicOrigin}/.well-known/oauth-protected-resource${options.resourcePath}`;
    this.now = options.now ?? Date.now;
    this.accessTtlMs = (options.accessTtlSeconds ?? 3600) * 1000;
  }

  /** Writes the operator key and a static fallback client to a private file (mode 0600), never to logs. */
  async init() {
    this.operatorKey = token("op_");
    // Dynamically registered clients survive a restart, so a host's stored client_id stays valid.
    // Tokens and codes deliberately do not: a restart behaves like a revocation (fixture only).
    try {
      const saved = JSON.parse(await readFile(this.clientsFile(), "utf8")) as Client[];
      for (const client of saved) if (client.registration === "dcr") this.clients.set(client.clientId, client);
    } catch { /* first start */ }
    const fallback: Client = {
      clientId: `static_${randomBytes(8).toString("hex")}`, secret: token("cs_"), redirectUris: [],
      authMethod: "client_secret_post", registration: "static", name: "static fallback",
    };
    this.clients.set(fallback.clientId, fallback);
    await mkdir(this.options.dataDir, { recursive: true });
    await writeFile(path.join(this.options.dataDir, "operator.json"), JSON.stringify({
      operatorKey: this.operatorKey,
      staticClient: { clientId: fallback.clientId, clientSecret: fallback.secret, note: "Only if ChatGPT's dynamic registration fails; add its exact callback with POST /studio-m0-operator/static-redirect." },
    }, null, 2), { mode: 0o600 });
  }

  // ---------- Resource server ----------

  /** The bearer token's principal, or null. Expiry, revocation, audience and scope are all checked. */
  verify(header: string | undefined): Principal | null {
    if (!header?.startsWith("Bearer ")) return null;
    const grant = this.grants.get(hash(header.slice(7)));
    if (!grant || grant.kind !== "access") return null;
    if (grant.expiresAt <= this.now() || grant.resource !== this.resourceUrl || !grant.scopes.includes(STUDIO_SCOPE)) return null;
    return { subject: grant.subject, clientId: grant.clientId, scopes: grant.scopes, expiresAt: grant.expiresAt };
  }

  challenge(res: Response, description = "Connect a Session Zero M0 test identity.") {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${this.metadataUrl}", scope="${STUDIO_SCOPE}", error="invalid_token", error_description="${description}"`);
    res.status(401).json({ error: "invalid_token", error_description: description });
  }

  /** For a tool result: asks the host to (re)link without leaking why a token failed. */
  wwwAuthenticate() {
    return `Bearer resource_metadata="${this.metadataUrl}", scope="${STUDIO_SCOPE}", error="invalid_token", error_description="Reconnect the Session Zero M0 test identity."`;
  }

  // ---------- Authorization server ----------

  router(): Router {
    const router = express.Router();
    const form = express.urlencoded({ extended: false, limit: "16kb" });
    const json = express.json({ limit: "16kb" });
    const noStore = (_req: Request, res: Response, next: () => void) => {
      res.setHeader("Cache-Control", "no-store");
      next();
    };
    router.use(["/.well-known", "/oauth", "/studio-m0-operator"], noStore);

    const protectedResource = {
      resource: this.resourceUrl,
      authorization_servers: [this.issuer],
      scopes_supported: [STUDIO_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Session Zero Studio M0 fixture (test only)",
    };
    router.get([`/.well-known/oauth-protected-resource${this.options.resourcePath}`, "/.well-known/oauth-protected-resource"], (req, res) => {
      void this.options.log.write("oauth_metadata", { path: req.path, kind: "protected-resource", userAgent: req.get("user-agent") ?? null });
      res.json(protectedResource);
    });
    const asMetadata = {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/oauth/authorize`,
      token_endpoint: `${this.issuer}/oauth/token`,
      registration_endpoint: `${this.issuer}/oauth/register`,
      revocation_endpoint: `${this.issuer}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: [STUDIO_SCOPE],
      authorization_response_iss_parameter_supported: true,
    };
    // OAuth metadata only: also answering /.well-known/openid-configuration made ChatGPT turn OIDC on
    // by default and request scopes this stub doesn't grant (observed 2026-11-14).
    router.get("/.well-known/oauth-authorization-server", (req, res) => {
      void this.options.log.write("oauth_metadata", { path: req.path, kind: "authorization-server", userAgent: req.get("user-agent") ?? null });
      res.json(asMetadata);
    });

    router.post("/oauth/register", json, (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)) : [];
      if (redirectUris.length === 0) return void res.status(400).json({ error: "invalid_redirect_uri", error_description: "At least one https redirect_uri is required." });
      const requested = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "client_secret_basic";
      const authMethod = (["none", "client_secret_post", "client_secret_basic"] as const).find((m) => m === requested);
      if (!authMethod) return void res.status(400).json({ error: "invalid_client_metadata", error_description: `token_endpoint_auth_method ${requested} isn't supported.` });
      const client: Client = {
        clientId: `dcr_${randomBytes(12).toString("hex")}`, redirectUris, authMethod, registration: "dcr",
        name: typeof body.client_name === "string" ? body.client_name.slice(0, 100) : undefined,
        ...(authMethod !== "none" && { secret: token("cs_") }),
      };
      this.clients.set(client.clientId, client);
      void this.saveClients();
      // Evidence of what the host registered: names and callbacks only, never the secret.
      void this.options.log.write("oauth_register", {
        clientId: client.clientId, clientName: client.name ?? null, redirectUris, authMethod,
        grantTypes: body.grant_types ?? null, scope: body.scope ?? null, applicationType: body.application_type ?? null,
      });
      res.status(201).json({
        client_id: client.clientId, ...(client.secret && { client_secret: client.secret, client_secret_expires_at: 0 }),
        client_id_issued_at: Math.floor(this.now() / 1000), redirect_uris: redirectUris, token_endpoint_auth_method: authMethod,
        grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: STUDIO_SCOPE,
      });
    });

    router.get("/oauth/authorize", (req, res) => {
      this.prune();
      const params = Object.fromEntries(Object.entries(req.query).filter((e): e is [string, string] => typeof e[1] === "string"));
      const problem = this.checkAuthorize(params);
      void this.options.log.write("oauth_authorize_view", {
        clientId: params.client_id ?? null, redirectUri: params.redirect_uri ?? null, resource: params.resource ?? null,
        scope: params.scope ?? null, challengeMethod: params.code_challenge_method ?? null, hasState: Boolean(params.state), problem,
      });
      if (problem) return void res.status(400).type("text/plain").send(`Session Zero M0 test sign-in refused: ${problem}`);
      const nonce = token("f_");
      this.forms.set(nonce, this.now() + FORM_TTL_MS);
      const hidden = Object.entries(params).map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join("");
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
      res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Session Zero M0 test sign-in</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}button{font-size:1rem;padding:.5rem 1rem;margin-right:.5rem}fieldset{margin:1rem 0}</style></head><body>
<h1>Session Zero — M0 test sign-in</h1>
<p><strong>Test only.</strong> This connects an AI app to a fixture workspace with synthetic images. It has no access to Session Zero accounts, builds, rooms or library items.</p>
<p>Requested access: <code>${escapeHtml(params.scope ?? STUDIO_SCOPE)}</code> for <code>${escapeHtml(this.resourceUrl)}</code>.</p>
<form method="post" action="/oauth/authorize">${hidden}<input type="hidden" name="form_nonce" value="${nonce}">
<fieldset><legend>Fixture identity</legend>${TESTERS.map((t, i) => `<label><input type="radio" name="tester" value="${t}"${i === 0 ? " checked" : ""}> ${t}</label><br>`).join("")}</fieldset>
<label><input type="checkbox" name="grant_workspace" value="yes" checked> Allow this AI to read and change the M0 fixture workspace</label>
<p><button type="submit" name="decision" value="approve">Approve</button><button type="submit" name="decision" value="deny">Deny</button></p>
</form></body></html>`);
    });

    router.post("/oauth/authorize", form, (req, res) => {
      const params = Object.fromEntries(Object.entries(req.body as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
      const nonceExpiry = this.forms.get(params.form_nonce ?? "");
      this.forms.delete(params.form_nonce ?? "");
      if (!nonceExpiry || nonceExpiry <= this.now()) return void res.status(400).type("text/plain").send("This sign-in form expired. Start connecting again from the AI app.");
      const problem = this.checkAuthorize(params);
      if (problem) return void res.status(400).type("text/plain").send(`Session Zero M0 test sign-in refused: ${problem}`);
      // checkAuthorize has confirmed these three are present and valid.
      const { client_id: clientId = "", redirect_uri: redirectUri = "", code_challenge: challenge = "" } = params;
      const redirect = new URL(redirectUri);
      if (params.state) redirect.searchParams.set("state", params.state);
      redirect.searchParams.set("iss", this.issuer);
      const tester = TESTERS.find((t) => t === params.tester);
      if (params.decision !== "approve" || params.grant_workspace !== "yes" || !tester) {
        redirect.searchParams.set("error", "access_denied");
        void this.options.log.write("oauth_decision", { clientId: params.client_id, decision: "deny" });
        return void res.redirect(303, redirect.toString());
      }
      const code = token("code_");
      this.codes.set(hash(code), {
        subject: tester, clientId, scopes: [STUDIO_SCOPE], resource: this.resourceUrl,
        redirectUri, challenge, expiresAt: this.now() + CODE_TTL_MS,
      });
      redirect.searchParams.set("code", code);
      void this.options.log.write("oauth_decision", { clientId: params.client_id, decision: "approve", subject: tester });
      res.redirect(303, redirect.toString());
    });

    router.post("/oauth/token", form, (req, res) => {
      const body = req.body as Record<string, string | undefined>;
      const client = this.authenticateClient(req, body);
      if (!client) {
        void this.options.log.write("oauth_token", { grantType: body.grant_type ?? null, outcome: "invalid_client" });
        return void res.status(401).json({ error: "invalid_client" });
      }
      if (body.resource !== undefined && body.resource !== this.resourceUrl) {
        return void res.status(400).json({ error: "invalid_target", error_description: "This server only issues tokens for its own resource." });
      }
      let subject: string;
      let scopes: string[];
      if (body.grant_type === "authorization_code") {
        const pending = this.codes.get(hash(body.code ?? ""));
        this.codes.delete(hash(body.code ?? ""));
        const verifierOk = pending && body.code_verifier
          && createHash("sha256").update(body.code_verifier).digest("base64url") === pending.challenge;
        if (!pending || pending.expiresAt <= this.now() || pending.clientId !== client.clientId || pending.redirectUri !== body.redirect_uri || !verifierOk) {
          void this.options.log.write("oauth_token", { grantType: "authorization_code", clientId: client.clientId, outcome: "invalid_grant" });
          return void res.status(400).json({ error: "invalid_grant" });
        }
        subject = pending.subject;
        scopes = pending.scopes;
      } else if (body.grant_type === "refresh_token") {
        const key = hash(body.refresh_token ?? "");
        const refresh = this.grants.get(key);
        if (!refresh || refresh.kind !== "refresh" || refresh.expiresAt <= this.now() || refresh.clientId !== client.clientId) {
          void this.options.log.write("oauth_token", { grantType: "refresh_token", clientId: client.clientId, outcome: "invalid_grant" });
          return void res.status(400).json({ error: "invalid_grant" });
        }
        this.grants.delete(key); // Rotation: a refresh token works once.
        subject = refresh.subject;
        scopes = refresh.scopes;
      } else {
        return void res.status(400).json({ error: "unsupported_grant_type" });
      }
      const access = token("s0m0_");
      const refresh = token("s0r_");
      const accessExpires = this.now() + this.accessTtlMs;
      this.grants.set(hash(access), { subject, clientId: client.clientId, scopes, resource: this.resourceUrl, expiresAt: accessExpires, kind: "access" });
      this.grants.set(hash(refresh), { subject, clientId: client.clientId, scopes, resource: this.resourceUrl, expiresAt: this.now() + REFRESH_TTL_MS, kind: "refresh" });
      void this.options.log.write("oauth_token", { grantType: body.grant_type, clientId: client.clientId, subject, outcome: "issued", resourceParam: body.resource ?? null, expiresInSeconds: this.accessTtlMs / 1000 });
      res.json({ access_token: access, token_type: "Bearer", expires_in: Math.floor(this.accessTtlMs / 1000), refresh_token: refresh, scope: scopes.join(" ") });
    });

    router.post("/oauth/revoke", form, (req, res) => {
      const body = req.body as Record<string, string | undefined>;
      if (this.authenticateClient(req, body)) this.grants.delete(hash(body.token ?? ""));
      res.status(200).end();
    });

    // Operator controls for E6 (expire/revoke mid-session). They need the private key and refuse
    // anything that came through the tunnel (cloudflared adds cf-connecting-ip).
    router.post("/studio-m0-operator/:action", json, (req, res) => {
      const key = req.get("x-operator-key") ?? "";
      if (req.get("cf-connecting-ip") || !this.operatorKey || !sameSecret(key, this.operatorKey)) return void res.status(404).end();
      const body = (req.body ?? {}) as Record<string, unknown>;
      switch (req.params.action) {
        case "revoke-all": {
          const count = this.grants.size;
          this.grants.clear();
          void this.options.log.write("operator", { action: "revoke-all", grants: count });
          return void res.json({ revoked: count });
        }
        case "expire-access": {
          let count = 0;
          for (const grant of this.grants.values()) if (grant.kind === "access") { grant.expiresAt = this.now() - 1; count++; }
          void this.options.log.write("operator", { action: "expire-access", grants: count });
          return void res.json({ expired: count });
        }
        case "access-ttl": {
          const seconds = Number(body.seconds);
          if (!Number.isInteger(seconds) || seconds < 10 || seconds > 86_400) return void res.status(400).json({ error: "seconds must be 10 to 86400" });
          this.accessTtlMs = seconds * 1000;
          void this.options.log.write("operator", { action: "access-ttl", seconds });
          return void res.json({ seconds });
        }
        case "static-redirect": {
          const uri = typeof body.redirectUri === "string" ? body.redirectUri : "";
          const fallback = [...this.clients.values()].find((c) => c.registration === "static");
          if (!fallback || !/^https:\/\//.test(uri)) return void res.status(400).json({ error: "redirectUri must be https" });
          fallback.redirectUris = [uri];
          return void res.json({ clientId: fallback.clientId, redirectUris: fallback.redirectUris });
        }
        case "replay-descriptor": {
          const hostFileId = typeof body.hostFileId === "string" ? body.hostFileId : "";
          if (!this.replayDescriptor) return void res.status(404).end();
          void this.replayDescriptor(hostFileId).then((outcome) => {
            void this.options.log.write("operator", { action: "replay-descriptor", hostFileId, ...outcome });
            res.json(outcome);
          });
          return;
        }
        case "state":
          return void res.json({
            clients: [...this.clients.values()].map((c) => ({ clientId: c.clientId, registration: c.registration, authMethod: c.authMethod, redirectUris: c.redirectUris })),
            grants: [...this.grants.values()].map((g) => ({ subject: g.subject, clientId: g.clientId, kind: g.kind, expiresInSeconds: Math.round((g.expiresAt - this.now()) / 1000) })),
          });
        default:
          return void res.status(404).end();
      }
    });
    return router;
  }

  /** Drops expired sign-in forms, codes and grants so a public test endpoint can't grow them without bound. */
  private prune() {
    const now = this.now();
    for (const [key, expires] of this.forms) if (expires <= now) this.forms.delete(key);
    for (const [key, code] of this.codes) if (code.expiresAt <= now) this.codes.delete(key);
    for (const [key, grant] of this.grants) if (grant.expiresAt <= now) this.grants.delete(key);
  }

  private clientsFile() {
    return path.join(this.options.dataDir, "clients.json");
  }

  private async saveClients() {
    const dcr = [...this.clients.values()].filter((c) => c.registration === "dcr");
    await writeFile(this.clientsFile(), JSON.stringify(dcr), { mode: 0o600 });
  }

  private checkAuthorize(params: Record<string, string>): string | null {
    if (params.response_type !== "code") return "response_type must be code.";
    const client = this.clients.get(params.client_id ?? "");
    if (!client) return "unknown client_id.";
    if (!params.redirect_uri || !client.redirectUris.includes(params.redirect_uri)) return "redirect_uri isn't registered for this client.";
    if (!params.code_challenge || params.code_challenge_method !== "S256") return "PKCE with S256 is required.";
    if (params.resource !== undefined && params.resource !== this.resourceUrl) return `resource must be ${this.resourceUrl}.`;
    const scopes = (params.scope ?? STUDIO_SCOPE).split(" ").filter(Boolean);
    if (scopes.some((s) => s !== STUDIO_SCOPE)) return `only the ${STUDIO_SCOPE} scope is available.`;
    return null;
  }

  private authenticateClient(req: Request, body: Record<string, string | undefined>): Client | null {
    let clientId = body.client_id;
    let secret = body.client_secret;
    const basic = req.get("authorization");
    if (basic?.startsWith("Basic ")) {
      const decoded = Buffer.from(basic.slice(6), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon > 0) {
        clientId = decodeURIComponent(decoded.slice(0, colon));
        secret = decodeURIComponent(decoded.slice(colon + 1));
      }
    }
    const client = this.clients.get(clientId ?? "");
    if (!client) return null;
    if (client.authMethod === "none") return client;
    return client.secret && secret && sameSecret(secret, client.secret) ? client : null;
  }
}
