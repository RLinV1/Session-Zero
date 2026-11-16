import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type HttpAccount } from "./helpers";
import {
  TEST_ORIGIN, TEST_REDIRECT, TEST_RESOURCE, authorizeParams, bearer, connectStudio, consent, exchange, form, pkcePair, registerClient,
} from "./studioFlow";

/**
 * Delegated Studio access (FR-GM-26, FR-GM-27, ADR 0073, design D7 "M1a implementation record"):
 * Session Zero's own authorization server, and the build API's separate delegated route family.
 * Synthetic accounts, hosts and fixtures only.
 */

let store: MemoryRoomStore;
let server: Awaited<ReturnType<typeof startServer>>;
let clock: number;

const HOUR = 60 * 60_000;

beforeEach(async () => {
  store = new MemoryRoomStore();
  clock = Date.now();
  server = await startServer(store, { now: () => clock, studio: { publicOrigin: TEST_ORIGIN } });
});
afterEach(() => server.close());

async function startBuild(account?: HttpAccount, name = "Hollow Coast") {
  const owner = account ?? await server.signUp({ displayName: "Vincent" });
  const res = await owner.request("POST", "/api/builds", { name });
  expect(res.status).toBe(201);
  const body = await res.json() as { build: { id: string }; pass: string };
  return { account: owner, id: body.build.id, pass: body.pass };
}

const call = (token: string, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => fetch(server.base + url, {
  method,
  headers: { ...bearer(token, headers), ...(body !== undefined && { "content-type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** The account's owner id, which builds and grants are keyed by. */
const ownerOf = async (account: HttpAccount) => (await store.findUserById(account.view!.id))!.ownerId;

const creature = (over: Record<string, unknown> = {}) => ({ key: "goblin", name: "Goblin", isPlayerCharacter: false, hp: 7, maxHp: 7, ac: 13, ...over });

describe("delegated Studio discovery (FR-GM-26, ADR 0073)", () => {
  it("serves authorization-server and protected-resource metadata, and no OpenID configuration", async () => {
    const as = await fetch(`${server.base}/.well-known/oauth-authorization-server`);
    expect(as.status).toBe(200);
    expect(as.headers.get("cache-control")).toBe("no-store");
    expect(await as.json()).toMatchObject({
      issuer: TEST_ORIGIN,
      authorization_endpoint: `${TEST_ORIGIN}/studio/connect`,
      token_endpoint: `${TEST_ORIGIN}/api/oauth/token`,
      registration_endpoint: `${TEST_ORIGIN}/api/oauth/register`,
      revocation_endpoint: `${TEST_ORIGIN}/api/oauth/revoke`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["studio:build"],
      authorization_response_iss_parameter_supported: true,
    });
    const prm = await fetch(`${server.base}/.well-known/oauth-protected-resource/mcp/studio`);
    expect(await prm.json()).toEqual({
      resource: TEST_RESOURCE, authorization_servers: [TEST_ORIGIN], scopes_supported: ["studio:build"], bearer_methods_supported: ["header"], resource_name: "Session Zero Studio",
    });
    for (const path of ["/.well-known/openid-configuration", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp/build", "/.well-known/oauth-authorization-server/api"]) {
      expect((await fetch(server.base + path)).status, path).toBe(404);
    }
  });

  it("offers none of it when STUDIO_PUBLIC_ORIGIN is unset, and passes still work", async () => {
    const plain = await startServer(new MemoryRoomStore(), { studio: null });
    try {
      for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource/mcp/studio", "/api/studio/builds"]) {
        expect((await fetch(plain.base + path)).status, path).toBe(404);
      }
      expect((await registerClient(plain.base)).status).toBe(404);
      const owner = await plain.signUp();
      const { build, pass } = await owner.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", { name: "Hollow Coast" });
      expect((await fetch(`${plain.base}/api/build/current`, { headers: bearer(pass) })).status).toBe(200);
      expect((await owner.request("GET", `/api/builds/${build.id}/grants`)).status).toBe(404);
    } finally {
      await plain.close();
    }
  });
});

describe("delegated Studio registration (FR-GM-26, ADR 0073)", () => {
  it("registers a public client with exact redirect URIs", async () => {
    const res = await registerClient(server.base, { client_name: "Some\u0007 AI" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      client_id: expect.stringMatching(/^szc_[0-9a-f]{32}$/), client_name: "Some AI", redirect_uris: [TEST_REDIRECT],
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    });
  });

  it("refuses confidential clients, other grants and unsafe redirect URIs", async () => {
    expect((await registerClient(server.base, { token_endpoint_auth_method: "client_secret_basic" })).status).toBe(400);
    expect((await registerClient(server.base, { grant_types: ["client_credentials"] })).status).toBe(400);
    for (const uri of ["http://ai-app.test.invalid/cb", "https://ai-app.test.invalid/cb#frag", "javascript:alert(1)", "https://user:pw@ai-app.test.invalid/cb"]) {
      expect((await registerClient(server.base, { redirect_uris: [uri] })).status, uri).toBe(400);
    }
    expect((await registerClient(server.base, { redirect_uris: ["http://127.0.0.1:4000/cb"] })).status).toBe(201);
  });

  it("holds a bounded number of clients, refusing rather than evicting, and drops unused ones after an hour", async () => {
    for (let i = 0; i < 200; i++) await store.registerStudioClient({ id: `szc_seed${i}`, name: "x", redirectUris: [TEST_REDIRECT], createdAt: new Date(clock).toISOString(), lastUsedAt: null }, 200);
    const full = await registerClient(server.base);
    expect(full.status).toBe(503);
    expect(await full.json()).toMatchObject({ error: "temporarily_unavailable" });
    clock += HOUR + 1;
    await server.app.sweepStudio();
    expect((await registerClient(server.base)).status).toBe(201);
  });

  it("limits registrations per address", async () => {
    for (let i = 0; i < 20; i++) expect((await registerClient(server.base)).status).toBe(201);
    expect((await registerClient(server.base)).status).toBe(429);
  });
});

describe("delegated Studio consent and tokens (FR-GM-26, ADR 0073)", () => {
  it("lets a signed-in owner choose builds, and the token reads exactly those", async () => {
    const { account, id } = await startBuild();
    const other = await startBuild(account, "Lanternfall");
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    const { challenge } = pkcePair();
    const query = new URLSearchParams(authorizeParams(client.client_id, challenge));
    const check = await account.request("GET", `/api/oauth/authorize?${query}`);
    expect(check.status).toBe(200);
    const shown = await check.json() as { client: { name: string; redirectHost: string }; builds: { id: string }[] };
    expect(shown.client).toEqual({ name: "Test AI app", redirectHost: "ai-app.test.invalid" });
    expect(shown.builds.map((b) => b.id).sort()).toEqual([id, other.id].sort());

    const { tokens } = await connectStudio(server.base, account, [id]);
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 8 * 60 * 60, scope: "studio:build" });
    expect(tokens.access_token).toMatch(/^szs_at_/);
    const list = await (await call(tokens.access_token, "GET", "/api/studio/builds")).json() as { builds: { id: string }[] };
    expect(list.builds.map((b) => b.id)).toEqual([id]);
    const read = await call(tokens.access_token, "GET", `/api/studio/builds/${id}`);
    expect(read.status).toBe(200);
    expect((await read.json() as { build: Record<string, unknown> }).build).toEqual({ id, name: "Hollow Coast" });
    // A build of the same owner that wasn't ticked reads as unknown.
    expect((await call(tokens.access_token, "GET", `/api/studio/builds/${other.id}`)).status).toBe(404);
  });

  it("asks a signed-out visitor to sign in and shows a bad client or redirect on the page, never redirecting", async () => {
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    const { challenge } = pkcePair();
    expect((await server.anonymous().request("GET", `/api/oauth/authorize?${new URLSearchParams(authorizeParams(client.client_id, challenge))}`)).status).toBe(401);
    const owner = await server.signUp();
    for (const over of [{ client_id: "szc_unknown" }, { redirect_uri: "https://evil.test.invalid/cb" }] as Record<string, string>[]) {
      const res = await owner.request("GET", `/api/oauth/authorize?${new URLSearchParams(authorizeParams(client.client_id, challenge, over))}`);
      expect(res.status).toBe(400);
      expect(await res.json()).not.toHaveProperty("redirectTo");
    }
    const noPkce = await owner.request("GET", `/api/oauth/authorize?${new URLSearchParams(authorizeParams(client.client_id, challenge, { code_challenge_method: "plain" }))}`);
    const redirect = new URL((await noPkce.json() as { redirectTo: string }).redirectTo);
    expect(redirect.origin + redirect.pathname).toBe(TEST_REDIRECT);
    expect(Object.fromEntries(redirect.searchParams)).toMatchObject({ error: "invalid_request", state: "s-123", iss: TEST_ORIGIN });
  });

  it("sends a refusal back to the AI app and grants nothing", async () => {
    const { account, id } = await startBuild();
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    const res = await consent(account, authorizeParams(client.client_id, pkcePair().challenge), [id], "deny");
    const redirect = new URL((await res.json() as { redirectTo: string }).redirectTo);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("code")).toBeNull();
    expect(await store.listStudioGrants(await ownerOf(account), new Date(clock).toISOString())).toEqual([]);
  });

  it("takes consent only from the app itself: a cross-site form gets 403", async () => {
    const { account, id } = await startBuild();
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    const res = await account.request("POST", "/api/oauth/authorize", { params: authorizeParams(client.client_id, pkcePair().challenge), decision: "allow", buildIds: [id] }, { origin: "https://evil.test.invalid" });
    expect(res.status).toBe(403);
  });

  it("refuses a wrong PKCE verifier, a reused code (ending the grant) and a different redirect URI", async () => {
    const { account, id } = await startBuild();
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    const { verifier, challenge } = pkcePair();
    const code = (redirectTo: string) => new URL(redirectTo).searchParams.get("code")!;
    const first = code((await (await consent(account, authorizeParams(client.client_id, challenge), [id])).json() as { redirectTo: string }).redirectTo);
    const fields = { grant_type: "authorization_code", code: first, redirect_uri: TEST_REDIRECT, client_id: client.client_id, code_verifier: verifier };
    expect((await exchange(server.base, { ...fields, code_verifier: pkcePair().verifier })).status).toBe(400);
    expect((await exchange(server.base, { ...fields, redirect_uri: "https://ai-app.test.invalid/other" })).status).toBe(400);
    const ok = await exchange(server.base, fields);
    expect(ok.status).toBe(200);
    const { access_token: access } = await ok.json() as { access_token: string };
    expect((await call(access, "GET", `/api/studio/builds/${id}`)).status).toBe(200);
    // Replaying the code ends the tokens it already gave out (RFC 6749 §4.1.2).
    const replay = await exchange(server.base, fields);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
    expect((await call(access, "GET", `/api/studio/builds/${id}`)).status).toBe(401);
  });

  it("refuses an expired authorization code", async () => {
    const { account, id } = await startBuild();
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    const { verifier, challenge } = pkcePair();
    const redirect = new URL((await (await consent(account, authorizeParams(client.client_id, challenge), [id])).json() as { redirectTo: string }).redirectTo);
    clock += 5 * 60_000 + 1;
    const res = await exchange(server.base, { grant_type: "authorization_code", code: redirect.searchParams.get("code")!, redirect_uri: TEST_REDIRECT, client_id: client.client_id, code_verifier: verifier });
    expect(res.status).toBe(400);
  });

  it("rotates refresh tokens, and a reused one ends the whole family", async () => {
    const { account, id } = await startBuild();
    const { clientId, tokens } = await connectStudio(server.base, account, [id]);
    const refresh = (token: string) => exchange(server.base, { grant_type: "refresh_token", refresh_token: token, client_id: clientId });
    const next = await refresh(tokens.refresh_token);
    expect(next.status).toBe(200);
    const rotated = await next.json() as { access_token: string; refresh_token: string };
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect((await call(rotated.access_token, "GET", `/api/studio/builds/${id}`)).status).toBe(200);
    expect((await refresh(tokens.refresh_token)).status).toBe(400);
    for (const token of [tokens.access_token, rotated.access_token]) expect((await call(token, "GET", `/api/studio/builds/${id}`)).status).toBe(401);
    expect((await refresh(rotated.refresh_token)).status).toBe(400);
  });

  it("caps live connections per account", async () => {
    const { account, id } = await startBuild();
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    for (let i = 0; i < 20; i++) expect((await consent(account, authorizeParams(client.client_id, pkcePair().challenge), [id])).status).toBe(200);
    const res = await consent(account, authorizeParams(client.client_id, pkcePair().challenge), [id]);
    expect(res.status).toBe(409);
  });
});

describe("delegated Studio access is refused or has no effect (FR-GM-26, FR-GM-27, ADR 0073)", () => {
  it("foreign build: another owner's build reads as unknown, and can't be granted", async () => {
    const mine = await startBuild();
    const theirs = await startBuild(await server.signUp({ displayName: "Mallory" }), "Their build");
    const { tokens } = await connectStudio(server.base, mine.account, [mine.id]);
    const foreign = await call(tokens.access_token, "GET", `/api/studio/builds/${theirs.id}`);
    const unknown = await call(tokens.access_token, "GET", `/api/studio/builds/${randomUUID()}`);
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
    expect((await call(tokens.access_token, "POST", `/api/studio/builds/${theirs.id}/creatures`, { creatures: [creature()] })).status).toBe(404);
    expect(await store.listBuildItems(theirs.id)).toEqual([]);
    // Ticking someone else's build on the consent page grants nothing.
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    const res = await consent(mine.account, authorizeParams(client.client_id, pkcePair().challenge), [mine.id, theirs.id]);
    expect(res.status).toBe(404);
    expect((await store.listStudioGrants(await ownerOf(mine.account), new Date(clock).toISOString())).length).toBe(1);
  });

  it("room or player credential: a guest token, a seat or a build pass is no delegated token", async () => {
    const { account, id, pass } = await startBuild();
    const room = await server.createRoom("GM", { cookie: account.cookie });
    const player = await server.join(room.inviteCode, "Player");
    for (const token of [room.guestToken, player.guestToken, pass, `szs_at_${"A".repeat(43)}`]) {
      expect((await call(token, "GET", "/api/studio/builds")).status, token.slice(0, 7)).toBe(401);
      expect((await call(token, "GET", `/api/studio/builds/${id}`)).status).toBe(401);
      const introspected = await fetch(`${server.base}/api/oauth/introspect`, { method: "POST", headers: bearer(token) });
      expect(await introspected.json()).toEqual({ active: false });
    }
    // And the other way round: a delegated token is no pass, no session and no room credential.
    const { tokens } = await connectStudio(server.base, account, [id]);
    expect((await call(tokens.access_token, "GET", "/api/build/current")).status).toBe(401);
    expect((await call(tokens.access_token, "GET", `/api/build/${id}`)).status).toBe(401);
    expect((await call(tokens.access_token, "GET", `/api/builds/${id}`)).status).toBe(401);
    expect((await call(tokens.access_token, "GET", "/api/builds")).status).toBe(401);
    expect((await call(tokens.access_token, "GET", "/api/library/creatures")).status).not.toBe(200);
    expect((await call(tokens.access_token, "GET", "/api/gm/rooms")).status).not.toBe(200);
  });

  it("forged owner id or forwarding header: identity comes only from the grant", async () => {
    const mine = await startBuild();
    const theirs = await startBuild(await server.signUp({ displayName: "Mallory" }), "Their build");
    const forged = { "x-owner-id": theirs.account.view!.id, "x-forwarded-user": theirs.account.view!.id, "x-forwarded-for": "203.0.113.9", "x-user-id": theirs.account.view!.id };
    // With no token, no header names anyone.
    expect((await fetch(`${server.base}/api/studio/builds/${theirs.id}`, { headers: forged })).status).toBe(401);
    expect((await fetch(`${server.base}/api/studio/builds`, { headers: { ...forged, cookie: theirs.account.cookie } })).status).toBe(401);
    // With a token, headers, query and body naming another owner change nothing.
    const { tokens } = await connectStudio(server.base, mine.account, [mine.id]);
    expect((await call(tokens.access_token, "GET", `/api/studio/builds/${theirs.id}?ownerGmId=${theirs.account.view!.id}`, undefined, forged)).status).toBe(404);
    const list = await (await call(tokens.access_token, "GET", `/api/studio/builds?ownerGmId=${theirs.account.view!.id}`, undefined, forged)).json() as { builds: { id: string }[] };
    expect(list.builds.map((b) => b.id)).toEqual([mine.id]);
    const saved = await call(tokens.access_token, "POST", `/api/studio/builds/${mine.id}/creatures`, { creatures: [creature({ ownerGmId: theirs.account.view!.id })] }, forged);
    expect(saved.status).toBe(200);
    expect((await saved.json() as { results: { saved: boolean }[] }).results[0]!.saved).toBe(false);
    expect(await store.listBuildItems(theirs.id)).toEqual([]);
  });

  it("expired token: refused after 8 hours, and introspection says inactive", async () => {
    const { account, id } = await startBuild();
    const { tokens } = await connectStudio(server.base, account, [id]);
    clock += 8 * HOUR - 1000;
    expect((await call(tokens.access_token, "GET", `/api/studio/builds/${id}`)).status).toBe(200);
    clock += 2000;
    const res = await call(tokens.access_token, "GET", `/api/studio/builds/${id}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
    const introspected = await fetch(`${server.base}/api/oauth/introspect`, { method: "POST", headers: bearer(tokens.access_token) });
    expect(await introspected.json()).toEqual({ active: false });
  });

  it("revoked token: by the owner on the build page, and by the client (RFC 7009)", async () => {
    const { account, id } = await startBuild();
    const second = await startBuild(account, "Lanternfall");
    const first = await connectStudio(server.base, account, [id, second.id]);
    const listed = await account.json<{ grants: { id: string; clientName: string; redirectHost: string; builds: { id: string }[] }[] }>("GET", `/api/builds/${id}/grants`);
    expect(listed.grants).toHaveLength(1);
    expect(listed.grants[0]).toMatchObject({ clientName: "Test AI app", redirectHost: "ai-app.test.invalid" });
    expect(listed.grants[0]!.builds.map((b) => b.id).sort()).toEqual([id, second.id].sort());
    // Another owner can't see or end it.
    const mallory = await server.signUp({ displayName: "Mallory" });
    expect((await mallory.request("GET", `/api/builds/${id}/grants`)).status).toBe(404);
    expect((await mallory.request("DELETE", `/api/builds/${id}/grants/${listed.grants[0]!.id}`)).status).toBe(404);
    expect((await call(first.tokens.access_token, "GET", `/api/studio/builds/${id}`)).status).toBe(200);

    expect((await account.request("DELETE", `/api/builds/${id}/grants/${listed.grants[0]!.id}`)).status).toBe(204);
    // The whole connection ends, for every build it covered, refresh included.
    for (const build of [id, second.id]) expect((await call(first.tokens.access_token, "GET", `/api/studio/builds/${build}`)).status).toBe(401);
    expect((await exchange(server.base, { grant_type: "refresh_token", refresh_token: first.tokens.refresh_token, client_id: first.clientId })).status).toBe(400);
    expect((await account.json<{ grants: unknown[] }>("GET", `/api/builds/${id}/grants`)).grants).toEqual([]);

    const again = await connectStudio(server.base, account, [id]);
    const revoked = await fetch(`${server.base}/api/oauth/revoke`, form({ token: again.tokens.refresh_token, client_id: again.clientId }));
    expect(revoked.status).toBe(200);
    expect((await call(again.tokens.access_token, "GET", `/api/studio/builds/${id}`)).status).toBe(401);
  });

  it("revocation between read and write: the write rechecks inside the store and saves nothing", async () => {
    const { account, id } = await startBuild();
    const { tokens } = await connectStudio(server.base, account, [id]);
    expect((await call(tokens.access_token, "POST", `/api/studio/builds/${id}/creatures`, { creatures: [creature()] })).status).toBe(200);
    const before = await store.findBuildItem(id, "creature", "goblin");
    const grantId = (await store.listStudioGrants(await ownerOf(account), new Date(clock).toISOString()))[0]!.id;
    // The guard has passed; the owner disconnects before the write commits.
    const save = store.saveBuildItem.bind(store);
    store.saveBuildItem = async (...args) => {
      await store.revokeStudioGrant(grantId, new Date(clock).toISOString());
      return save(...args);
    };
    const res = await call(tokens.access_token, "POST", `/api/studio/builds/${id}/creatures`, { creatures: [creature({ name: "Hobgoblin" })] });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "This connection to Session Zero has ended. Ask the user to reconnect it in their AI app." });
    expect(await store.findBuildItem(id, "creature", "goblin")).toEqual(before);

    // The same for a game profile, which a pass saves without a lock.
    const profile = store.saveGameProfile.bind(store);
    const again = await connectStudio(server.base, account, [id]);
    const againId = (await store.listStudioGrants(await ownerOf(account), new Date(clock).toISOString()))[0]!.id;
    store.saveGameProfile = async (...args) => {
      await store.revokeStudioGrant(againId, new Date(clock).toISOString());
      return profile(...args);
    };
    expect((await call(again.tokens.access_token, "PUT", `/api/studio/builds/${id}/profile`, { name: "Changed" })).status).toBe(401);
    expect((await store.findBuild(id, await ownerOf(account)))?.gameProfile).toBeNull();
  });

  it("token issued for a different resource: refused at authorization, exchange and use", async () => {
    const { account, id } = await startBuild();
    const client = await (await registerClient(server.base)).json() as { client_id: string };
    const { verifier, challenge } = pkcePair();
    const wrong = await consent(account, authorizeParams(client.client_id, challenge, { resource: `${TEST_ORIGIN}/mcp/build` }), [id]);
    expect(new URL((await wrong.json() as { redirectTo: string }).redirectTo).searchParams.get("error")).toBe("invalid_target");
    const right = new URL((await (await consent(account, authorizeParams(client.client_id, challenge), [id])).json() as { redirectTo: string }).redirectTo);
    const exchanged = await exchange(server.base, {
      grant_type: "authorization_code", code: right.searchParams.get("code")!, redirect_uri: TEST_REDIRECT, client_id: client.client_id, code_verifier: verifier, resource: "https://other.test.invalid/mcp",
    });
    expect(exchanged.status).toBe(400);
    expect(await exchanged.json()).toMatchObject({ error: "invalid_target" });

    // A token whose grant names another resource is no token here, even with a valid hash.
    const { tokens } = await connectStudio(server.base, account, [id]);
    const other = await startServer(store, { now: () => clock, studio: { publicOrigin: "https://other.test.invalid" } });
    try {
      expect((await fetch(`${other.base}/api/studio/builds/${id}`, { headers: bearer(tokens.access_token) })).status).toBe(401);
      expect(await (await fetch(`${other.base}/api/oauth/introspect`, { method: "POST", headers: bearer(tokens.access_token) })).json()).toEqual({ active: false });
    } finally {
      await other.close();
    }
  });

  it("owner choices and publication: no delegated route changes them, and owner routes ignore the token", async () => {
    const { account, id } = await startBuild();
    const { tokens } = await connectStudio(server.base, account, [id]);
    const choices = { aiGrid: true, aiWalls: true, aiTerrain: true };
    expect((await call(tokens.access_token, "PUT", `/api/builds/${id}/choices`, choices)).status).toBe(401);
    expect((await call(tokens.access_token, "POST", `/api/builds/${id}/publish`, { creatures: [], maps: [], encounters: [], reviewed: {} })).status).toBe(401);
    expect((await call(tokens.access_token, "POST", `/api/builds/${id}/pass`)).status).toBe(401);
    expect((await call(tokens.access_token, "DELETE", `/api/builds/${id}`)).status).toBe(401);
    for (const [method, path] of [["PUT", "/choices"], ["POST", "/publish"], ["POST", "/pass"], ["DELETE", ""], ["POST", "/files?kind=token"], ["DELETE", "/items/creature/goblin"], ["GET", "/grants"]] as const) {
      expect((await call(tokens.access_token, method, `/api/studio/builds/${id}${path}`, method === "DELETE" || method === "GET" ? undefined : choices)).status, `${method} ${path}`).toBe(404);
    }
    expect(await store.findBuild(id, await ownerOf(account))).toMatchObject({ aiGrid: false, aiWalls: false, aiTerrain: false, status: "open" });
    // Proposal-safe writes still respect the owner's choices.
    const setup = await call(tokens.access_token, "PUT", `/api/studio/builds/${id}/maps/cave/setup`, { terrain: [] });
    expect(setup.status).toBe(403);
  });

  it("ends with a password change, and an account deletion removes its grants", async () => {
    const { account, id } = await startBuild();
    const { tokens } = await connectStudio(server.base, account, [id]);
    expect((await account.request("POST", "/api/auth/password", { currentPassword: account.password, newPassword: "another horse battery" })).status).toBe(204);
    expect((await call(tokens.access_token, "GET", `/api/studio/builds/${id}`)).status).toBe(401);

    const other = await startBuild(await server.signUp({ displayName: "Sam" }), "Gone soon");
    const live = await connectStudio(server.base, other.account, [other.id]);
    expect((await other.account.request("DELETE", "/api/auth/account", { password: other.account.password })).status).toBe(204);
    expect(await store.findStudioToken(await import("../src/domain/credentials").then((m) => m.hashToken(live.tokens.access_token)))).toBeNull();
    expect((await call(live.tokens.access_token, "GET", `/api/studio/builds/${other.id}`)).status).toBe(401);
  });

  it("a closed build drops out of its grant", async () => {
    const { account, id } = await startBuild();
    const { tokens } = await connectStudio(server.base, account, [id]);
    expect((await account.request("DELETE", `/api/builds/${id}`)).status).toBe(204);
    expect((await call(tokens.access_token, "GET", `/api/studio/builds/${id}`)).status).toBe(404);
    expect((await (await call(tokens.access_token, "GET", "/api/studio/builds")).json() as { builds: unknown[] }).builds).toEqual([]);
  });
});

describe("passes and owner sessions behave as before alongside a grant (FR-GM-26, ADR 0053)", () => {
  it("keeps the pass, the owner's routes and the AI's writes separate", async () => {
    const { account, id, pass } = await startBuild();
    const { tokens } = await connectStudio(server.base, account, [id]);
    // The pass still works, and its answer still names its expiry.
    const viaPass = await fetch(`${server.base}/api/build/current`, { headers: bearer(pass) });
    expect(viaPass.status).toBe(200);
    expect((await viaPass.json() as { build: { passExpiresAt: string } }).build.passExpiresAt).toEqual(expect.any(String));
    // An AI save through the grant obeys the same item lock as a pass's.
    expect((await call(tokens.access_token, "POST", `/api/studio/builds/${id}/creatures`, { creatures: [creature()] })).status).toBe(200);
    expect((await account.request("PATCH", `/api/builds/${id}/creatures/goblin`, { name: "Owner's goblin" })).status).toBe(200);
    for (const send of [
      () => call(tokens.access_token, "POST", `/api/studio/builds/${id}/creatures`, { creatures: [creature({ name: "AI again" })] }),
      () => fetch(`${server.base}/api/build/current/creatures`, { method: "POST", headers: { ...bearer(pass), "content-type": "application/json" }, body: JSON.stringify({ creatures: [creature({ name: "AI again" })] }) }),
    ]) {
      const results = (await (await send()).json() as { results: { saved: boolean }[] }).results;
      expect(results[0]!.saved).toBe(false);
    }
    // Cancelling the pass leaves the grant; ending the grant leaves the pass.
    expect((await account.request("DELETE", `/api/builds/${id}/pass`)).status).toBe(204);
    expect((await call(tokens.access_token, "GET", `/api/studio/builds/${id}`)).status).toBe(200);
    const fresh = await account.json<{ pass: string }>("POST", `/api/builds/${id}/pass`);
    const grantId = (await account.json<{ grants: { id: string }[] }>("GET", `/api/builds/${id}/grants`)).grants[0]!.id;
    expect((await account.request("DELETE", `/api/builds/${id}/grants/${grantId}`)).status).toBe(204);
    expect((await fetch(`${server.base}/api/build/current`, { headers: bearer(fresh.pass) })).status).toBe(200);
  });
});
