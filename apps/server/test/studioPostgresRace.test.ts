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

/** An owner, an open build and one live delegated token for it. */
async function delegated(s: PostgresRoomStore) {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const user = await s.createUser({ id: randomUUID(), email: `${randomUUID()}@example.com`, displayName: "Sam", passwordHash: "x" });
  const build = await s.createBuild({ id: randomUUID(), ownerGmId: user.ownerId, name: "Poll" }, 3);
  const clientId = `szc_${randomUUID().replaceAll("-", "")}`;
  await s.registerStudioClient({ id: clientId, name: "x", redirectUris: ["https://ai-app.test.invalid/cb"], createdAt: iso(now), lastUsedAt: null }, 1_000_000, iso(now));
  const grantId = randomUUID();
  await s.createStudioGrant({
    id: grantId, ownerGmId: user.ownerId, clientId, resource: "r", scope: "studio:build", buildIds: [build.id], codeHash: `c-${randomUUID()}`, codeChallenge: "c",
    redirectUri: "https://ai-app.test.invalid/cb", codeExpiresAt: iso(now + 60_000), codeUsedAt: null, createdAt: iso(now), expiresAt: iso(now + 86_400_000), revokedAt: null, lastUsedAt: null,
  }, 20, iso(now));
  const tokenHash = `t-${randomUUID()}`;
  await s.redeemStudioCode(grantId, iso(now), [{ tokenHash, grantId, kind: "access", expiresAt: iso(now + 3_600_000), createdAt: iso(now), usedAt: null }]);
  return { build, grantId, access: { ownerGmId: user.ownerId, delegation: { tokenHash, now: Date.now } } };
}

/** Holds the build's write lock, as an AI write does, running `during` while it is held. */
async function whileBuildLocked(buildId: string, during: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<void>, waiting: () => Promise<void>) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const isLocked = new Promise<void>((resolve) => { locked = resolve; });
  const holder = blocker!.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`builds:item:${buildId}`}))`;
    locked();
    await held;
    await during(tx);
  }, { timeout: 20_000 });
  await isLocked;
  await waiting();
  release();
  await holder;
}

describe.skipIf(!store)("a Studio poll queued behind a write on postgres (FR-GM-27, ADR 0073)", () => {
  it("refuses to start a selection cleared while it waited on the build lock", async () => {
    const s = store!, f = await delegated(s);
    // Seed the queued request's input directly to isolate the lock/recheck from draft validation.
    const selectionId = randomUUID();
    await blocker!.studioChatSelection.create({ data: {
      id: selectionId, buildId: f.build.id, grantId: f.grantId, viewId: randomUUID(), sequence: 1, expiresAt: new Date(Date.now() + 60_000),
      draft: { mapKey: "chapel", encounterKey: null, inspectedVersion: "initial",
        selection: { region: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, layers: ["terrain"], objectIds: [], wholeObjectIds: [] } },
    } });
    let write!: Promise<unknown>;
    await whileBuildLocked(f.build.id, async (tx) => {
      await tx.studioChatSelection.update({ where: { id: selectionId }, data: { id: randomUUID(), sequence: 2 } });
    }, async () => {
      write = s.studioAuthoring(f.build.id, f.access, { kind: "startChatCorrection", selectionId, instruction: "Clear rubble." });
      void write.catch(() => {});
      expect(await settledWithin(write, 200)).toBe(false);
    });
    await expect(write).rejects.toMatchObject({ code: "conflict" });
  });

  it("reports a revocation made while it waited as ended access, not a storage failure", async () => {
    const s = store!, f = await delegated(s);
    let read!: Promise<unknown>;
    await whileBuildLocked(f.build.id, async () => {}, async () => {
      read = s.readStudioPreparation(f.build.id, f.access);
      read.catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 300));
      // The grant row changes while the poll waits for the build lock.
      await s.touchStudioGrant(f.grantId, new Date().toISOString());
      await s.revokeStudioGrant(f.grantId, new Date().toISOString());
    });
    await expect(read).rejects.toBeInstanceOf(StudioAccessEndedError);
  });

  it("returns the write it waited for, and a touched grant doesn't fail it", async () => {
    const s = store!, f = await delegated(s);
    await s.saveBuildItem({ buildId: f.build.id, kind: "creature", key: "goblin", data: { name: "Goblin" }, flags: [], notCarriedOver: "" }, 10);
    let read!: Promise<Awaited<ReturnType<PostgresRoomStore["readStudioPreparation"]>>>;
    await whileBuildLocked(f.build.id, async (tx) => {
      await tx.buildItem.updateMany({ where: { buildId: f.build.id, key: "goblin" }, data: { data: { name: "Hobgoblin" } } });
    }, async () => {
      read = s.readStudioPreparation(f.build.id, f.access);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await s.touchStudioGrant(f.grantId, new Date().toISOString());
    });
    expect((await read).items.find((i) => i.key === "goblin")?.data).toEqual({ name: "Hobgoblin" });
  });
});
