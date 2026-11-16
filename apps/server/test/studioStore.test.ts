import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RoomStore } from "../src/store/roomStore";
import {
  StudioAccessEndedError,
  StudioClientLimitError,
  StudioGrantLimitError,
  type StudioGrantRecord,
  type StudioTokenRecord,
} from "../src/store/studioStore";
import { storeCases } from "./storeHarness";

const HOUR = 60 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

async function newOwner(store: RoomStore) {
  const user = await store.createUser({ id: randomUUID(), email: `${randomUUID()}@example.com`, displayName: "Sam", passwordHash: "x" });
  return { userId: user.id, ownerGmId: user.ownerId };
}

describe.each(storeCases)("delegated Studio store on %s (FR-GM-26, ADR 0073)", (_name, makeStore) => {
  async function setup(store: RoomStore, now = Date.now()) {
    const owner = await newOwner(store);
    const build = await store.createBuild({ id: randomUUID(), ownerGmId: owner.ownerGmId, name: "Hollow Coast" }, 3);
    const clientId = `szc_${randomUUID().replaceAll("-", "")}`;
    await store.registerStudioClient({ id: clientId, name: "Test AI app", redirectUris: ["https://ai-app.test.invalid/cb"], createdAt: iso(now), lastUsedAt: null }, 1_000_000);
    const grant: StudioGrantRecord = {
      id: randomUUID(), ownerGmId: owner.ownerGmId, clientId, resource: "https://studio.test.invalid/mcp/studio", scope: "studio:build", buildIds: [build.id],
      codeHash: `code-${randomUUID()}`, codeChallenge: "c".repeat(43), redirectUri: "https://ai-app.test.invalid/cb", codeExpiresAt: iso(now + 5 * 60_000),
      codeUsedAt: null, createdAt: iso(now), expiresAt: iso(now + 30 * 24 * HOUR), revokedAt: null, lastUsedAt: null,
    };
    await store.createStudioGrant(grant, 20, iso(now));
    const token = (kind: StudioTokenRecord["kind"], ttl = 8 * HOUR): StudioTokenRecord => ({
      tokenHash: `${kind}-${randomUUID()}`, grantId: grant.id, kind, expiresAt: iso(now + ttl), createdAt: iso(now), usedAt: null,
    });
    return { owner, build, clientId, grant, token, now };
  }

  it("redeems a code once, storing its tokens, and marks the client used", async () => {
    const store = makeStore();
    const { grant, token, clientId, now } = await setup(store);
    const first = token("access"), second = token("access");
    const twice = await Promise.all([store.redeemStudioCode(grant.id, iso(now), [first]), store.redeemStudioCode(grant.id, iso(now), [second])]);
    expect(twice.filter(Boolean)).toHaveLength(1);
    // Only the exchange that won stored its tokens.
    expect([await store.findStudioToken(first.tokenHash), await store.findStudioToken(second.tokenHash)].filter(Boolean)).toHaveLength(1);
    expect((await store.findStudioGrantByCode(grant.codeHash))?.codeUsedAt).not.toBeNull();
    expect((await store.findStudioClient(clientId))?.lastUsedAt).not.toBeNull();
    expect(await store.listStudioGrants(grant.ownerGmId, iso(now))).toHaveLength(1);
  });

  it("refuses an expired or revoked code", async () => {
    const store = makeStore();
    const first = await setup(store);
    expect(await store.redeemStudioCode(first.grant.id, iso(first.now + 5 * 60_000 + 1), [first.token("access")])).toBe(false);
    const second = await setup(store);
    await store.revokeStudioGrant(second.grant.id, iso(second.now));
    expect(await store.redeemStudioCode(second.grant.id, iso(second.now), [second.token("access")])).toBe(false);
  });

  it("rotates a refresh token once, and not after revocation", async () => {
    const store = makeStore();
    const { grant, token, now } = await setup(store);
    const refresh = token("refresh", 14 * 24 * HOUR);
    await store.redeemStudioCode(grant.id, iso(now), [token("access"), refresh]);
    const results = await Promise.all([store.rotateStudioRefresh(refresh.tokenHash, iso(now), [token("refresh")]), store.rotateStudioRefresh(refresh.tokenHash, iso(now), [token("refresh")])]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await store.findStudioToken(refresh.tokenHash))?.token.usedAt).not.toBeNull();
    const next = token("refresh");
    await store.revokeStudioGrant(grant.id, iso(now));
    expect(await store.rotateStudioRefresh(next.tokenHash, iso(now), [token("refresh")])).toBe(false);
  });

  it("revokes only the owner's own grant when an owner is named, and ends every grant on a password change", async () => {
    const store = makeStore();
    const a = await setup(store);
    const b = await setup(store);
    await store.redeemStudioCode(a.grant.id, iso(a.now), [a.token("access")]);
    await store.redeemStudioCode(b.grant.id, iso(b.now), [b.token("access")]);
    expect(await store.revokeStudioGrant(a.grant.id, iso(a.now), b.owner.ownerGmId)).toBe(false);
    expect(await store.listStudioGrants(a.owner.ownerGmId, iso(a.now))).toHaveLength(1);
    await store.endStudioGrants(a.owner.ownerGmId, iso(a.now));
    expect(await store.listStudioGrants(a.owner.ownerGmId, iso(a.now))).toEqual([]);
    expect(await store.listStudioGrants(b.owner.ownerGmId, iso(b.now))).toHaveLength(1);
  });

  it("checks a delegated write inside the write: refused once revoked, expired or outside the grant, and nothing saved", async () => {
    const store = makeStore();
    const { grant, token, build, owner, now } = await setup(store);
    const access = token("access");
    await store.redeemStudioCode(grant.id, iso(now), [access]);
    const item = { buildId: build.id, kind: "creature" as const, key: "goblin", data: { name: "Goblin" }, flags: [], notCarriedOver: "" };
    const delegation = { tokenHash: access.tokenHash, now };
    await store.saveBuildItem(item, 10, { delegation });
    await store.saveGameProfile(build.id, { name: "Game" } as never, { delegation });

    await expect(store.saveBuildItem({ ...item, data: { name: "Late" } }, 10, { delegation: { ...delegation, now: now + 8 * HOUR } })).rejects.toBeInstanceOf(StudioAccessEndedError);
    const other = await store.createBuild({ id: randomUUID(), ownerGmId: owner.ownerGmId, name: "Not granted" }, 3);
    await expect(store.saveBuildItem({ ...item, buildId: other.id }, 10, { delegation })).rejects.toBeInstanceOf(StudioAccessEndedError);
    await store.revokeStudioGrant(grant.id, iso(now));
    await expect(store.saveBuildItem({ ...item, data: { name: "Revoked" } }, 10, { delegation })).rejects.toBeInstanceOf(StudioAccessEndedError);
    await expect(store.saveGameProfile(build.id, { name: "Revoked" } as never, { delegation })).rejects.toBeInstanceOf(StudioAccessEndedError);
    expect((await store.findBuildItem(build.id, "creature", "goblin"))?.data).toEqual({ name: "Goblin" });
    expect((await store.findBuild(build.id, owner.ownerGmId))?.gameProfile).toEqual({ name: "Game" });
    expect(await store.listBuildItems(other.id)).toEqual([]);
    // A pass's write, with no delegation, is unaffected.
    await store.saveBuildItem({ ...item, data: { name: "Pass" } }, 10);
  });

  it("serializes a revocation with a delegated write already holding the grant", async () => {
    const store = makeStore();
    const { grant, token, build, now } = await setup(store);
    const access = token("access");
    await store.redeemStudioCode(grant.id, iso(now), [access]);
    const item = { buildId: build.id, kind: "creature" as const, key: "goblin", data: { name: "Goblin" }, flags: [], notCarriedOver: "" };
    // Either order is allowed; what may not happen is a write that commits after it saw the grant revoked.
    const [write] = await Promise.allSettled([store.saveBuildItem(item, 10, { delegation: { tokenHash: access.tokenHash, now } }), store.revokeStudioGrant(grant.id, iso(now))]);
    const saved = await store.findBuildItem(build.id, "creature", "goblin");
    expect(write.status === "fulfilled").toBe(saved !== null);
    await expect(store.saveBuildItem({ ...item, key: "after" }, 10, { delegation: { tokenHash: access.tokenHash, now } })).rejects.toBeInstanceOf(StudioAccessEndedError);
  });

  it("bounds registered clients and live grants per owner", async () => {
    const store = makeStore();
    const { owner, grant, now } = await setup(store);
    const count = (await store.findStudioClient(grant.clientId)) ? 1 : 0;
    expect(count).toBe(1);
    await expect(store.registerStudioClient({ id: `szc_${randomUUID()}`, name: "x", redirectUris: [], createdAt: iso(now), lastUsedAt: null }, 0)).rejects.toBeInstanceOf(StudioClientLimitError);
    const another = { ...grant, id: randomUUID(), codeHash: `code-${randomUUID()}` };
    await expect(store.createStudioGrant(another, 1, iso(now))).rejects.toBeInstanceOf(StudioGrantLimitError);
    // A pending grant whose code expired no longer counts.
    await store.createStudioGrant(another, 1, iso(now + 5 * 60_000 + 1));
    expect(await store.listStudioGrants(owner.ownerGmId, iso(now))).toEqual([]);
  });

  it("sweeps expired tokens, ended and abandoned grants, and unused clients", async () => {
    const store = makeStore();
    const live = await setup(store);
    const access = live.token("access");
    await store.redeemStudioCode(live.grant.id, iso(live.now), [access]);
    const revoked = await setup(store);
    const revokedAccess = revoked.token("access");
    await store.redeemStudioCode(revoked.grant.id, iso(revoked.now), [revokedAccess]);
    await store.revokeStudioGrant(revoked.grant.id, iso(revoked.now));
    const pending = await setup(store);
    const later = live.now + 2 * HOUR;
    await store.sweepStudio({ now: iso(later), unusedClientsBefore: iso(later - HOUR), idleClientsBefore: iso(later - 90 * 24 * HOUR) });
    expect(await store.findStudioToken(access.tokenHash)).not.toBeNull();
    expect(await store.findStudioToken(revokedAccess.tokenHash)).toBeNull();
    expect(await store.findStudioGrantByCode(pending.grant.codeHash)).toBeNull();
    expect(await store.findStudioClient(pending.clientId)).toBeNull();
    expect(await store.findStudioClient(live.clientId)).not.toBeNull();
    await store.sweepStudio({ now: iso(live.now + 9 * HOUR), unusedClientsBefore: iso(live.now), idleClientsBefore: iso(live.now) });
    expect(await store.findStudioToken(access.tokenHash)).toBeNull();
  });

  it("deletes an account's grants and tokens with the account", async () => {
    const store = makeStore();
    const { owner, grant, token, now } = await setup(store);
    const access = token("access");
    await store.redeemStudioCode(grant.id, iso(now), [access]);
    expect(await store.deleteUser(owner.userId)).not.toBeNull();
    expect(await store.findStudioToken(access.tokenHash)).toBeNull();
    expect(await store.findStudioGrantByCode(grant.codeHash)).toBeNull();
  });
});
