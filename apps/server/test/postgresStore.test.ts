import { Command, DEFAULT_GRID, DomainEvent, replayTo, tableOf } from "@vtt/shared";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { LiveRoom } from "../src/domain/liveRoom";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import { SeqConflictError } from "../src/store/roomStore";

/**
 * Exercises the real Postgres store. Skipped unless DATABASE_URL is set, so a checkout
 * with no containers running still gets a green `pnpm test`:
 *
 *   docker compose up -d postgres
 *   DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt pnpm --filter @vtt/server test
 */
const url = process.env.DATABASE_URL;
const store = url ? await PostgresRoomStore.connect(url) : null;

afterAll(async () => {
  await store?.close();
});

describe.skipIf(!store)("PostgresRoomStore (docs/adr/0001-event-model.md)", () => {
  const newRoom = async () => {
    const roomId = randomUUID();
    await store!.createRoom(roomId, randomUUID().slice(0, 10));
    return roomId;
  };

  it("assigns consecutive seqs and reads them back in order (FR-SYNC-04)", async () => {
    const roomId = await newRoom();
    const committed = await store!.append(roomId, 0, [
      { actorId: null, event: { type: "RoomCreated", name: "One" } },
      { actorId: null, event: { type: "RoomCreated", name: "Two" } },
    ]);

    expect(committed.map((c) => c.seq)).toEqual([1, 2]);
    const loaded = await store!.loadEvents(roomId);
    expect(loaded.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("round-trips a batch's command id, and loads older rows without one (ADR 0013)", async () => {
    const roomId = await newRoom();
    const commandId = randomUUID();
    await store!.append(roomId, 0, [{ actorId: null, event: { type: "RoomCreated", name: "Old" } }]);
    const committed = await store!.append(roomId, 1, [
      { actorId: null, commandId, event: { type: "RoomCreated", name: "One" } },
      { actorId: null, commandId, event: { type: "RoomCreated", name: "Two" } },
    ]);
    expect(committed.map((c) => c.commandId)).toEqual([commandId, commandId]);
    const loaded = await store!.loadEvents(roomId);
    expect(loaded.map((e) => e.commandId)).toEqual([undefined, commandId, commandId]);
  });

  it("persists preparation chunks as one undoable batch and rejects stale saves without a prefix (ADR 0046)", async () => {
    const roomId = await newRoom(), actor = { id: randomUUID(), role: "gm" as const, displayName: "GM" };
    const room = await LiveRoom.load(roomId, store!);
    await room.appendSystem(null, [{ type: "RoomCreated", name: "Preparation persistence" }, { type: "ParticipantJoined", participant: actor }]);
    await room.submit(actor.id, Command.parse({ type: "scene.setMap", map: { url: "/map", width: 7000, height: 7000 } }));
    const context = { boardEpoch: 1, revision: 1 };
    const preparation = Command.parse({ type: "scene.savePreparation", expectedMapUrl: "/map", context, edits: [
      { type: "fog.replace", removeIds: [], add: [{ shape: "rect", from: { x: 0, y: 0 }, to: { x: 7000, y: 7000 } }] },
      ...Array.from({ length: 4 }, (_, part) => ({ type: "terrain.paint", layerId: "base", context: { ...context, revision: 1 + part }, paint: Array.from({ length: 250 }, (_, cell) => { const i = part * 250 + cell; return { row: Math.floor(i / 100), start: i % 100, end: i % 100, kind: i % 2 ? "blocked" : "difficult" }; }) })),
    ] });
    const before = await store!.loadEvents(roomId), original = room.boardForOwner();
    expect(await room.submit(actor.id, preparation)).toMatchObject({ ok: true });
    const events = await store!.loadEvents(roomId), batch = events.slice(before.length);
    expect(batch).toHaveLength(5); expect(new Set(batch.map((event) => event.commandId)).size).toBe(1);
    const fresh = await PostgresRoomStore.connect(url!);
    try { expect((await LiveRoom.load(roomId, fresh)).boardForOwner()).toEqual(room.boardForOwner()); }
    finally { await fresh.close(); }
    const saved = room.boardForOwner();
    expect(await room.submit(actor.id, preparation)).toMatchObject({ ok: false });
    expect(await store!.loadEvents(roomId)).toEqual(events); expect(room.boardForOwner()).toEqual(saved);
    expect(await room.submit(actor.id, Command.parse({ type: "history.undo", commandId: batch[0]!.commandId }))).toMatchObject({ ok: true });
    expect(room.boardForOwner()).toEqual({ ...original, terrain: { base: [], effects: [] } });
  });

  it("round-trips terrain layers and checkpoint content through a fresh Postgres store (ADR 0046)", async () => {
    const roomId = await newRoom();
    const events = [
      { type: "RoomCreated", name: "Terrain persistence" },
      { type: "MapSet", map: { url: "/terrain.png", width: 700, height: 700 }, previous: null, gridChange: { grid: DEFAULT_GRID, previous: DEFAULT_GRID }, tokenChanges: [] },
      { type: "TerrainPainted", layerId: "base", paint: [{ row: 1, start: 1, end: 3, kind: "difficult" }], previous: [{ row: 1, start: 1, end: 3, kind: null }] },
      { type: "TerrainEffectCreated", effect: { id: "ice", name: "Private ice", runs: [] } },
      { type: "TerrainPainted", layerId: "ice", paint: [{ row: 1, start: 2, end: 2, kind: "blocked" }], previous: [{ row: 1, start: 2, end: 2, kind: null }] },
    ].map((e) => DomainEvent.parse(e));
    const committed = await store!.append(roomId, 0, events.map((event) => ({ actorId: null, commandId: randomUUID(), event })));
    const expected = replayTo(roomId, committed, committed.at(-1)!.seq);
    const fresh = await PostgresRoomStore.connect(url!);
    try {
      const loaded = replayTo(roomId, await fresh.loadEvents(roomId), committed.at(-1)!.seq);
      expect(loaded.terrain).toEqual(expected.terrain);
      expect(loaded.terrainRevision).toBe(expected.terrainRevision);
      const table = tableOf(expected);
      await fresh.append(roomId, committed.at(-1)!.seq, [{ actorId: null, event: { type: "CheckpointRestored", checkpointId: "c", name: "Terrain", restored: table, previous: table } }]);
      const restored = replayTo(roomId, await fresh.loadEvents(roomId), committed.at(-1)!.seq + 1);
      expect(restored.terrain).toEqual(expected.terrain); expect(restored.boardEpoch).toBeGreaterThan(expected.boardEpoch!);
    } finally { await fresh.close(); }
  });

  it("rejects an append whose expected last seq is stale, writing nothing", async () => {
    const roomId = await newRoom();
    await store!.append(roomId, 0, [{ actorId: null, event: { type: "RoomCreated", name: "One" } }]);

    await expect(
      store!.append(roomId, 0, [{ actorId: null, event: { type: "RoomCreated", name: "Clash" } }]),
    ).rejects.toBeInstanceOf(SeqConflictError);

    // The whole append is one transaction, so the losing writer leaves no partial rows.
    expect((await store!.loadEvents(roomId)).map((e) => e.seq)).toEqual([1]);
  });
  it("preserves full double precision across JSON payload writes and reads for exact undo", async () => {
    const roomId = await newRoom();
    const event = { type: "MapSet" as const, map: { url: "/map.png", width: 100, height: 100 }, previous: null,
      wallChange: { previous: [], walls: [{ id: randomUUID(), a: { x: 15.000000000000002, y: 0.6000000000000001 }, b: { x: 70, y: 100 }, uvttPortal: { position: { x: 32.50000000000001, y: 15.000000000000002 }, rotation: 1.2000000000000002, closed: false } }] },
    };
    const [committed] = await store!.append(roomId, 0, [{ actorId: null, event }]);
    expect((await store!.loadEvents(roomId))[0]?.event).toEqual(committed!.event);
  });
  it("keeps conflicting concurrent appends atomic with parameterized JSON inserts", async () => {
    const roomId = await newRoom();
    const results = await Promise.allSettled([1, 2].map((n) => store!.append(roomId, 0, [
      { actorId: null, event: { type: "RoomCreated", name: `Writer ${n}` } },
      { actorId: null, event: { type: "RoomCreated", name: `Writer ${n}, second` } },
    ])));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ status: "rejected", reason: expect.any(SeqConflictError) });
    expect((await store!.loadEvents(roomId)).map((e) => e.seq)).toEqual([1, 2]);
  });

  it("resolves a credential by hash and treats a revoked one as absent (FR-GM-20)", async () => {
    const roomId = await newRoom();
    const participantId = randomUUID();
    const hash = randomUUID().replace(/-/g, "");

    await store!.saveCredential(hash, { roomId, participantId });
    expect(await store!.findCredential(hash)).toEqual({ roomId, participantId, sessionHash: null });
    expect(await store!.findCredential("unknown")).toBeNull();
    expect(await store!.findRevokedCredential(hash)).toBeNull();

    await store!.revokeCredentials(roomId, participantId);
    expect(await store!.findCredential(hash)).toBeNull();
    expect(await store!.findRevokedCredential(hash)).toEqual({ roomId, participantId });
  });

  it("replaces a room's invite code; the old one stops resolving (FR-GM-20)", async () => {
    const roomId = randomUUID();
    const oldCode = randomUUID().slice(0, 10);
    await store!.createRoom(roomId, oldCode);
    expect(await store!.getInviteCode(roomId)).toBe(oldCode);

    // A colliding code is retried: the first candidate belongs to another room.
    const taken = randomUUID().slice(0, 10);
    await store!.createRoom(randomUUID(), taken);
    const fresh = randomUUID().slice(0, 10);
    const candidates = [taken, fresh];
    expect(await store!.setInviteCode(roomId, () => candidates.shift()!)).toBe(fresh);

    expect(await store!.findRoomByInvite(oldCode)).toBeNull();
    expect(await store!.findRoomByInvite(fresh)).toBe(roomId);
    expect(await store!.getInviteCode(roomId)).toBe(fresh);
  });
});

/**
 * The insert-only guard lives in the database (migration 0007), so these go around the store
 * with a raw client, as a buggy query or a manual psql session would (KAN-42, FR-REC-03).
 */
describe.skipIf(!store)("event log is insert-only (KAN-42, FR-REC-03)", () => {
  const raw = url ? new PrismaClient({ datasources: { db: { url } } }) : null;
  afterAll(async () => {
    await raw?.$disconnect();
  });
  const db = () => raw!;

  const roomWithEvents = async () => {
    const roomId = randomUUID();
    await store!.createRoom(roomId, randomUUID().slice(0, 10));
    await store!.append(roomId, 0, [
      { actorId: null, event: { type: "RoomCreated", name: "One" } },
      { actorId: null, event: { type: "RoomCreated", name: "Two" } },
    ]);
    return roomId;
  };
  const count = async (roomId: string) => (await store!.loadEvents(roomId)).length;

  it("rejects UPDATE, DELETE and TRUNCATE, leaving every row in place", async () => {
    const roomId = await roomWithEvents();
    await expect(db().$executeRaw`UPDATE events SET type = type WHERE room_id = ${roomId}::uuid`).rejects.toThrow(/append-only/);
    await expect(db().$executeRaw`DELETE FROM events WHERE room_id = ${roomId}::uuid`).rejects.toThrow(/append-only/);
    await expect(db().$executeRawUnsafe(`TRUNCATE events`)).rejects.toThrow(/append-only/);
    expect(await count(roomId)).toBe(2);
  });

  it("lets a room deletion remove only its own room's events", async () => {
    const a = await roomWithEvents();
    const b = await roomWithEvents();
    await expect(
      db().$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('vtt.room_delete', ${a}, true)`;
        await tx.$executeRaw`DELETE FROM events WHERE room_id = ${b}::uuid`;
      }),
    ).rejects.toThrow(/append-only/);
    expect(await count(b)).toBe(2);
    // The opt-in alone is not enough: deleting events while the room stays fails at commit.
    await expect(
      db().$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('vtt.room_delete', ${a}, true)`;
        await tx.$executeRaw`DELETE FROM events WHERE room_id = ${a}::uuid AND seq = 2`;
      }),
    ).rejects.toThrow(/only with their room/);
    expect(await count(a)).toBe(2);
    await store!.deleteRoom(a);
    expect(await count(a)).toBe(0);
    expect(await count(b)).toBe(2);
  });
});
