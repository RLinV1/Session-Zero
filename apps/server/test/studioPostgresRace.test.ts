import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import { StudioAccessEndedError } from "../src/store/studioStore";

/**
 * The Postgres write-time recheck under a real race (FR-GM-26, ADR 0073, design D7): a revocation
 * that arrives while a delegated write holds the grant waits until the write commits, and the next
 * write is refused. Runs only with DATABASE_URL, on an isolated database.
 */
const url = process.env.DATABASE_URL;
const store = url ? await PostgresRoomStore.connect(url) : null;
const blocker = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
afterAll(async () => {
  await store?.close();
  await blocker?.$disconnect();
});

const settledWithin = async (promise: Promise<unknown>, ms: number) =>
  Promise.race([promise.then(() => true, () => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);

describe.skipIf(!store)("delegated write and revocation race on postgres (FR-GM-26, ADR 0073)", () => {
  it("makes a revocation wait for a delegated write already holding the grant, then refuses the next write", async () => {
    const s = store!;
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const user = await s.createUser({ id: randomUUID(), email: `${randomUUID()}@example.com`, displayName: "Sam", passwordHash: "x" });
    const build = await s.createBuild({ id: randomUUID(), ownerGmId: user.ownerId, name: "Race" }, 3);
    const clientId = `szc_${randomUUID().replaceAll("-", "")}`;
    await s.registerStudioClient({ id: clientId, name: "x", redirectUris: ["https://ai-app.test.invalid/cb"], createdAt: iso(now), lastUsedAt: null }, 1_000_000, iso(now));
    const grantId = randomUUID();
    await s.createStudioGrant({
      id: grantId, ownerGmId: user.ownerId, clientId, resource: "r", scope: "studio:build", buildIds: [build.id], codeHash: `c-${randomUUID()}`, codeChallenge: "c",
      redirectUri: "https://ai-app.test.invalid/cb", codeExpiresAt: iso(now + 60_000), codeUsedAt: null, createdAt: iso(now), expiresAt: iso(now + 86_400_000), revokedAt: null, lastUsedAt: null,
    }, 20, iso(now));
    const tokenHash = `t-${randomUUID()}`;
    await s.redeemStudioCode(grantId, iso(now), [{ tokenHash, grantId, kind: "access", expiresAt: iso(now + 3_600_000), createdAt: iso(now), usedAt: null }]);
    const item = { buildId: build.id, kind: "creature" as const, key: "goblin", data: { name: "Goblin" }, flags: [], notCarriedOver: "" };
    await s.saveBuildItem(item, 10);

    // Hold the item's row so the delegated write stops after it has taken the grant FOR SHARE.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => { locked = resolve; });
    const holder = blocker!.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM build_items WHERE build_id = ${build.id}::uuid AND key = 'goblin' FOR UPDATE`;
      locked();
      await held;
    }, { timeout: 20_000 });
    await isLocked;
    const write = s.saveBuildItem({ ...item, data: { name: "Hobgoblin" } }, 10, { delegation: { tokenHash, now: Date.now } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const revoke = s.revokeStudioGrant(grantId, iso(Date.now()));
    // The revocation can't commit while the write holds the grant.
    expect(await settledWithin(revoke, 500)).toBe(false);
    release();
    await holder;
    await write;
    await revoke;
    expect((await s.findBuildItem(build.id, "creature", "goblin"))?.data).toEqual({ name: "Hobgoblin" });
    await expect(s.saveBuildItem({ ...item, data: { name: "Late" } }, 10, { delegation: { tokenHash, now: Date.now } })).rejects.toBeInstanceOf(StudioAccessEndedError);
  });
});
