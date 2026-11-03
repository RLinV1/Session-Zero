import { describe, expect, it, vi } from "vitest";
import { Command, MAX_TERRAIN_PAINT_BYTES, emptyRoomState, reduceCommitted, type CommandInput, type PreparationEdit, type ServerMessage } from "@vtt/shared";
import { LiveRoom } from "../src/domain/liveRoom";
import { startServer } from "./helpers";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
const gm = { id: "gm", role: "gm" as const, displayName: "GM" };
const player = { id: "p", role: "player" as const, displayName: "Player" };
async function setup() {
  const store = new MemoryRoomStore(); await store.createRoom("r", "invite");
  const room = await LiveRoom.load("r", store);
  await room.appendSystem(null, [{ type: "RoomCreated", name: "Preparation" }, { type: "ParticipantJoined", participant: gm }, { type: "ParticipantJoined", participant: player }]);
  await room.submit(gm.id, Command.parse({ type: "scene.setMap", map: { url: "/map", width: 1000, height: 1000 }, grid: { cellSize: 10, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" } }));
  return { store, room };
}
const fog: PreparationEdit = { type: "fog.replace", removeIds: [], add: [{ shape: "rect", from: { x: 0, y: 0 }, to: { x: 1000, y: 1000 } }] };
const wall: PreparationEdit = { type: "wall.add", walls: [{ a: { x: 500, y: 0 }, b: { x: 500, y: 500 } }] };
const paint = (revision = 1): PreparationEdit => ({ type: "terrain.paint", layerId: "base", context: { boardEpoch: 1, revision }, paint: [{ row: 0, start: 0, end: 0, kind: "blocked" }] });
const save = (edits: PreparationEdit[] = [wall, fog, paint()]) => Command.parse({ type: "scene.savePreparation", expectedMapUrl: "/map", context: { boardEpoch: 1, revision: 1 }, edits });

describe("preparation through the authoritative FIFO (FR-GM-15/23, FR-REC-02)", () => {
  it("refuses a stale preparation without publishing its fog or walls", async () => {
    const { store, room } = await setup();
    await room.submit(gm.id, Command.parse(paint()));
    const before = await store.loadEvents("r"), board = room.boardForOwner();
    const append = vi.spyOn(store, "append");
    expect(await room.submit(gm.id, save())).toMatchObject({ ok: false });
    expect(append).not.toHaveBeenCalled(); expect(await store.loadEvents("r")).toEqual(before);
    expect(room.boardForOwner()).toEqual(board);
  });
  it.each(["terrain", "geometry"])("revalidates after a queued %s change between submission and execution", async (change) => {
    const { store, room } = await setup();
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const appendOriginal = store.append.bind(store);
    const append = vi.spyOn(store, "append").mockImplementationOnce(async (...args) => { started(); await gate; return appendOriginal(...args); });
    const first: CommandInput = change === "terrain" ? paint() : { type: "scene.setGrid", grid: { cellSize: 20, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" } };
    const changing = room.submit(gm.id, Command.parse(first));
    await entered;
    const saving = room.submit(gm.id, save());
    release();
    expect(await changing).toMatchObject({ ok: true });
    const afterChange = await store.loadEvents("r"), board = room.boardForOwner();
    expect(await saving).toMatchObject({ ok: false });
    expect(append).toHaveBeenCalledTimes(1); expect(await store.loadEvents("r")).toEqual(afterChange);
    expect(room.boardForOwner()).toEqual(board); expect(board.fog).toEqual({}); expect(board.walls).toEqual({});
  });
  it("rejects invalid late edits and append failure without changing events or the board", async () => {
    const { store, room } = await setup();
    const before = await store.loadEvents("r"), board = room.boardForOwner();
    const append = vi.spyOn(store, "append");
    expect(await room.submit(gm.id, save([wall, fog, { type: "wall.update", wall: { id: "missing", a: { x: 0, y: 0 }, b: { x: 0, y: 50 } } }]))).toMatchObject({ ok: false });
    expect(append).not.toHaveBeenCalled();
    append.mockRejectedValueOnce(new Error("disposable store failure"));
    await expect(room.submit(gm.id, save())).rejects.toThrow("disposable store failure");
    expect(await store.loadEvents("r")).toEqual(before); expect(room.boardForOwner()).toEqual(board);
  });
  it("commits a large save in one append and undo unit, using filtered broadcasts and reload", async () => {
    const { store, room } = await setup();
    const original = room.boardForOwner(), messages: ServerMessage[] = [];
    room.attach({ participantId: player.id, send: (message) => messages.push(message), close: () => {} });
    messages.length = 0;
    const base = Array.from({ length: 1000 }, (_, i) => ({ row: Math.floor(i / 100), start: i % 100, end: i % 100, kind: i % 2 ? "blocked" as const : "difficult" as const }));
    const edits: PreparationEdit[] = [wall, fog];
    for (let start = 0; start < base.length; start += 256) edits.push({ type: "terrain.paint", layerId: "base", paint: base.slice(start, start + 256), context: { boardEpoch: 1, revision: 1 + Math.floor(start / 256) } });
    for (const edit of edits.filter((e) => e.type === "terrain.paint")) expect(JSON.stringify(edit).length).toBeLessThan(MAX_TERRAIN_PAINT_BYTES);
    const command = save(edits); expect(JSON.stringify(command).length).toBeGreaterThan(MAX_TERRAIN_PAINT_BYTES);
    const append = vi.spyOn(store, "append");
    expect(await room.submit(player.id, command)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await room.submit(gm.id, command)).toMatchObject({ ok: true });
    expect(append).toHaveBeenCalledTimes(1);
    const events = await store.loadEvents("r"), batch = events.slice(-edits.length);
    expect(new Set(batch.map((e) => e.commandId)).size).toBe(1);
    expect(room.boardForOwner().terrain?.base).toEqual(base);
    expect((await LiveRoom.load("r", store)).boardForOwner()).toEqual(room.boardForOwner());
    const received = JSON.stringify(messages);
    for (const secret of ["TerrainPainted", "previous", "layerId", "terrainRevision", '"walls":[{', '"base"']) expect(received).not.toContain(secret);
    const canonical = events.reduce(reduceCommitted, emptyRoomState("r"));
    expect(canonical.undo.at(-1)?.events).toHaveLength(edits.length);
    expect(await room.submit(gm.id, Command.parse({ type: "history.undo", commandId: batch[0]!.commandId }))).toMatchObject({ ok: true });
    expect(room.boardForOwner()).toEqual({ ...original, terrain: { base: [], effects: [] } });
  });
});


describe("preparation-only HTTP transport (FR-GM-15/23)", () => {
  it("rejects malformed JSON with 400 before submitting any preparation", async () => {
    const server = await startServer();
    try {
      const credentials = await server.createRoom();
      const before = await server.store.loadEvents(credentials.roomId);
      const append = vi.spyOn(server.store, "append");
      const response = await fetch(server.base + `/api/rooms/${credentials.roomId}/preparation`, {
        method: "POST",
        headers: { authorization: `Bearer ${credentials.guestToken}`, "content-type": "application/json" },
        body: '{"type":"scene.savePreparation",',
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid JSON for map preparation." });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(append).not.toHaveBeenCalled();
      expect(await server.store.loadEvents(credentials.roomId)).toEqual(before);
    } finally { await server.close(); }
  });
  it("saves 10,000 fragmented cells above 64 KiB and retains all ordinary, paint and auth limits", async () => {
    const server = await startServer();
    const credentials = await server.createRoom(), gm = await server.connect(credentials);
    try {
      expect(await gm.command({ type: "scene.setMap", map: { url: "/map", width: 1000, height: 1000 }, grid: { cellSize: 10, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" } })).toMatchObject({ type: "ack" });
      const context = { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 };
      const base = Array.from({ length: 10_000 }, (_, i) => ({ row: Math.floor(i / 100), start: i % 100, end: i % 100, kind: i % 2 ? "blocked" as const : "difficult" as const }));
      const edits: PreparationEdit[] = [];
      for (let start = 0; start < base.length; start += 256) edits.push({ type: "terrain.paint", layerId: "base", paint: base.slice(start, start + 256), context: { ...context, revision: context.revision + Math.floor(start / 256) } });
      const command: CommandInput = { type: "scene.savePreparation", expectedMapUrl: "/map", context, edits };
      const endpoint = server.base + `/api/rooms/${credentials.roomId}/preparation`;
      const post = (body: unknown, token = credentials.guestToken) => fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      expect(JSON.stringify(command).length).toBeGreaterThan(64 * 1024);
      const append = vi.spyOn(server.store, "append");
      const response = await post(command); expect(response.status).toBe(200);
      const saved = await response.json() as { seq: number };
      expect(Object.keys(saved)).toEqual(["seq"]); await gm.waitForSeq(saved.seq);
      expect(append).toHaveBeenCalledTimes(1); expect(gm.state.terrain?.base).toEqual(base);
      const before = await server.store.loadEvents(credentials.roomId);
      expect((await post(command)).status).toBe(409);
      const current = { ...context, revision: gm.state.terrainRevision! };
      expect((await post({ type: "scene.savePreparation", expectedMapUrl: "/map", context: current, edits: [{ type: "terrain.paint", layerId: "base", context: current, paint: base.slice(0, 1000) }] })).status).toBe(409);
      expect((await post({ ...command, padding: "x".repeat(768 * 1024) })).status).toBe(413);
      expect((await post(command, "not-a-credential")).status).toBe(403);
      expect((await post({ ...command, context: current, edits: [fog, command] })).status).toBe(400);
      append.mockRejectedValueOnce(new Error("private database failure"));
      const failed = await post({ ...command, context: current, edits: [fog] });
      expect(failed.status).toBe(500); expect(await failed.json()).toEqual({ error: "Couldn't save the map draft. Try again." });
      expect(await server.store.loadEvents(credentials.roomId)).toEqual(before);
      const player = await server.join(credentials.inviteCode, "Player");
      expect((await post({ ...command, padding: "x".repeat(768 * 1024) }, player.guestToken)).status).toBe(403);
      const afterJoin = await server.store.loadEvents(credentials.roomId);
      expect(afterJoin.slice(0, before.length)).toEqual(before); expect(afterJoin).toHaveLength(before.length + 1);
      // Ordinary JSON and Socket.IO retain their original 64-KiB caps.
      expect((await fetch(server.base + "/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(65 * 1024) }) })).status).toBe(413);
      gm.send({ type: "resync", padding: "x".repeat(65 * 1024) } as unknown as Parameters<typeof gm.send>[0]);
      await gm.disconnected;
      expect(await server.store.loadEvents(credentials.roomId)).toEqual(afterJoin);
    } finally { gm.close(); await server.close(); }
  });
});
