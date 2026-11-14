import { readFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, UvttError, UvttPreparation, replayTo, type CommandInput } from "@vtt/shared";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { LocalDiskAssetStore } from "../src/store/assetStore";
import { UvttValidationPool } from "../src/uvtt/validationPool";
import { startServer, type TestClient, viewFor } from "./helpers";

let store: MemoryRoomStore;
let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { store = new MemoryRoomStore(); server = await startServer(store); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); vi.restoreAllMocks(); });
const connect = async (creds: Parameters<typeof server.connect>[0]) => { const c = await server.connect(creds); clients.push(c); return c; };
const ok = async (client: TestClient, command: CommandInput) => { const result = await client.command(command); expect(result.type).toBe("ack"); if (result.type !== "ack") throw new Error(result.message); return result; };
const url = (roomId: string, suffix = "imports") => `${server.base}/api/rooms/${roomId}/uvtt/${suffix}`;
async function document(format: "png" | "webp" = "png") {
  const bytes = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#afafaf" } }).toFormat(format).toBuffer();
  return { format: 0.3, image: bytes.toString("base64"), resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: -0.25, y: 0.5 } },
    line_of_sight: [[{ x: -0.25, y: 2.5 }, { x: 7.75, y: 2.5 }]], objects_line_of_sight: [[{ x: 1, y: 4 }, { x: 2, y: 4 }]],
    portals: [{ bounds: [{ x: 2, y: 2.5 }, { x: 3, y: 2.5 }], position: { x: 1, y: 0 }, rotation: 0.8, closed: false, freestanding: true }],
  };
}
async function upload(roomId: string, token: string, value: unknown = null, filename = "map.dd2vtt") {
  const body = new FormData(); body.append("file", new Blob([JSON.stringify(value ?? await document())]), filename);
  return fetch(url(roomId), { method: "POST", headers: { authorization: `Bearer ${token}` }, body });
}
const prepared = async (roomId: string, token: string) => { const res = await upload(roomId, token); expect(res.status).toBe(201); return UvttPreparation.parse(await res.json()); };
const terrainContext = (client: TestClient) => ({ boardEpoch: client.state.boardEpoch ?? 0, revision: client.state.terrainRevision ?? 0 });
async function seedTerrain(client: TestClient) {
  await ok(client, { type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 0, end: 0, kind: "difficult" }], context: terrainContext(client) });
  await ok(client, { type: "terrain.effect.create", name: "Private ice", context: terrainContext(client) });
  const effectId = client.state.terrain!.effects[0]!.id;
  await ok(client, { type: "terrain.paint", layerId: effectId, paint: [{ row: 0, start: 1, end: 1, kind: "blocked" }], context: terrainContext(client) });
  return effectId;
}

async function setup() {
  const creds = await server.createRoom(); const gm = await connect(creds); const gm2 = await connect(creds);
  const ac = await server.join(creds.inviteCode, "Alice"), bc = await server.join(creds.inviteCode, "Bob");
  const alice = await connect(ac), bob = await connect(bc);
  await ok(gm, { type: "scene.setMap", map: { url: "/old.png", width: 800, height: 600 }, grid: { ...DEFAULT_GRID, cellSize: 50 } });
  await ok(gm, { type: "token.create", name: "Hero", position: { x: 241, y: 161 }, ownerIds: [alice.participantId] });
  await ok(gm, { type: "token.create", name: "Secret dragon", position: { x: 677.123, y: 533.456 }, hidden: true });
  await ok(gm, { type: "fog.add", region: { shape: "rect", from: { x: 200, y: 140 }, to: { x: 260, y: 180 } } });
  await Promise.all([gm2, alice, bob].map((c) => c.waitForSeq(gm.seq)));
  return { creds, gm, gm2, alice, bob, ac, bc };
}

describe("private atomic UVTT room import/export (KAN-43/44/49, FR-GM-06/07/12/23)", () => {
  // First test pays the UVTT validator's cold start; slow under a loaded full run.
  it("keeps drafts private, uses current tokens, delivers one scene, retries once, undoes exactly and survives reload", async () => {
    const { creds, gm, gm2, alice, bob, ac, bc } = await setup();
    await seedTerrain(gm);
    await Promise.all([gm2, alice, bob].map((c) => c.waitForSeq(gm.seq)));
    const counts = [gm.seq, gm2.rawLog.length, alice.rawLog.length, bob.rawLog.length];
    const prep = await prepared(creds.roomId, creds.guestToken);
    expect(gm.seq).toBe(counts[0]); expect([gm2.rawLog.length, alice.rawLog.length, bob.rawLog.length]).toEqual(counts.slice(1));
    expect(JSON.stringify(prep)).not.toContain('"image"');
    const hero = Object.values(gm.state.tokens).find((t) => t.name === "Hero")!;
    await ok(gm, { type: "token.move", tokenId: hero.id, to: { x: 243, y: 163 }, reposition: true });
    await gm2.waitForSeq(gm.seq);
    const before = structuredClone(gm.state); const oldSeq = gm.seq;
    const offsets = [alice.rawLog.length, bob.rawLog.length];
    const ack = await ok(gm2, { type: "scene.importUVTT", importId: prep.id, revision: prep.revision });
    expect(ack.seq).toBe(oldSeq + 1); await gm.waitForSeq(gm2.seq);
    const commandId = gm.state.undo.at(-1)!.commandId;
    for (const [i, player] of [alice, bob].entries()) {
      await player.waitForSeq(gm.seq);
      const raw = player.rawLog.slice(offsets[i]).join("\n");
      for (const secret of [prep.id, "Secret dragon", '"wallChange"', '"portal"', '"previous"', '"tokenChanges"', '"commandId"']) expect(raw).not.toContain(secret);
      expect(player.state).toEqual(viewFor(gm.state, player)); expect(Object.values(player.state.walls).every((w) => /^seen:\d+$/.test(w.id) && Object.keys(w).sort().join() === "a,b,id")).toBe(true);
    }
    expect(gm.state.tokens[hero.id]?.position).toEqual({ x: 121.5, y: 81.5 });
    expect(gm.state.fog).toEqual({});
    expect(gm.state.terrain).toBeUndefined();
    expect(bob.state.tokens[hero.id]).toBeDefined(); expect(alice.state.tokens[hero.id]).toBeDefined();
    expect(Object.values(gm.state.walls).find((w) => w.uvttPortal)?.uvttPortal).toEqual({ closed: false, freestanding: true, rotation: 0.8, position: { x: 62.5, y: -25 } });
    const retry = await ok(gm, { type: "scene.importUVTT", importId: prep.id, revision: prep.revision });
    expect(retry.seq).toBe(ack.seq); expect((await store.loadEvents(creds.roomId)).length).toBe(oldSeq + 1);
    const exported = await fetch(url(creds.roomId, "export"), { headers: { authorization: `Bearer ${creds.guestToken}` } });
    expect(exported.status).toBe(200); const text = await exported.text();
    for (const secret of [creds.roomId, hero.id, "Secret dragon", '"tokens"', '"fog"', '"history"', '"url"']) expect(text).not.toContain(secret);
    const roundTrip = await upload(creds.roomId, creds.guestToken, JSON.parse(text), "map.uvtt");
    expect(roundTrip.status).toBe(201); const next = UvttPreparation.parse(await roundTrip.json());
    expect(next.grid).toEqual(prep.grid); expect(next.walls).toEqual(prep.walls);
    expect(await sharp(await readFile(`${server.uploadDir}/${next.map.url.split("/").at(-1)}`)).raw().toBuffer()).toEqual(await sharp(await readFile(`${server.uploadDir}/${prep.map.url.split("/").at(-1)}`)).raw().toBuffer());
    await ok(gm, { type: "history.undo", commandId });
    expect(gm.state.scene).toEqual(before.scene); expect(gm.state.walls).toEqual(before.walls); expect(gm.state.fog).toEqual(before.fog); expect(gm.state.tokens).toEqual(before.tokens);
    expect(gm.state.terrain).toEqual(before.terrain);
    for (const player of [alice, bob]) {
      await player.waitForSeq(gm.seq); expect(player.state).toEqual(viewFor(gm.state, player));
      const rawOffset = player.rawLog.length;
      player.send({ type: "resync" }); await player.waitFor((message) => message.type === "welcome" && message.seq === gm.seq);
      for (const secret of [prep.id, '"portal"', '"previous"', '"tokenChanges"', '"commandId"', "Secret dragon"]) expect(player.rawLog.slice(rawOffset).join("\n")).not.toContain(secret);
    }
    const log = await store.loadEvents(creds.roomId);
    expect(log.slice(oldSeq).map((e) => e.event.type)).toEqual(["MapSet", "MapSet", "ActionUndone"]);
    const restart = await startServer(store);
    try {
      const reconnected = await restart.connect(creds);
      expect(reconnected.state).toEqual(replayTo(creds.roomId, log, log.at(-1)!.seq)); reconnected.close();
      for (const credential of [ac, bc]) {
        const player = await restart.connect(credential);
        expect(player.state.walls).toEqual({}); expect(player.state.undo).toEqual([]); player.close();
      }
      const restarted = await restart.connect(creds);
      const missing = await restarted.command({ type: "scene.importUVTT", importId: next.id, revision: next.revision });
      expect(missing.type).toBe("rejected"); restarted.close();
    } finally { await restart.close(); }
  }, 15_000);
  it("publishes explicitly designated portals through existing player controls without UVTT metadata", async () => {
    const { creds, gm, gm2, alice, bob } = await setup();
    const prep = await prepared(creds.roomId, creds.guestToken);
    const walls = prep.walls.map((w) => w.uvttPortal ? { ...w, portal: { kind: "door" as const, state: "closed" as const } } : w);
    const revised = await fetch(url(creds.roomId, `imports/${prep.id}`), { method: "PUT", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" }, body: JSON.stringify({ revision: 1, grid: prep.grid, walls }) });
    expect(revised.status).toBe(200);
    const starts = [alice.rawLog.length, bob.rawLog.length];
    await ok(gm2, { type: "scene.importUVTT", importId: prep.id, revision: 2 });
    await gm.waitForSeq(gm2.seq);
    const commandId = gm.state.undo.at(-1)!.commandId;
    const door = Object.values(gm.state.walls).find((w) => w.portal)!;
    for (const [i, player] of [alice, bob].entries()) {
      await player.waitForSeq(gm.seq); expect(player.state).toEqual(viewFor(gm.state, player));
      expect(player.state.walls[door.id]).toEqual({ id: door.id, a: door.a, b: door.b, portal: door.portal });
      const raw = player.rawLog.slice(starts[i]).join("\n");
      for (const secret of [prep.id, '"uvttPortal"', '"source"', '"freestanding"', '"rotation":0.8', '"previous"', '"wallChange"', '"fogChange"', '"tokenChanges"', '"commandId"']) expect(raw).not.toContain(secret);
    }
    await ok(alice, { type: "portal.setState", wallId: door.id, state: "open" });
    await gm.waitForSeq(alice.seq); await bob.waitForSeq(alice.seq);
    expect(gm.state.walls[door.id]!.uvttPortal).toEqual(door.uvttPortal);
    expect(bob.state.walls[door.id]!.portal?.state).toBe("open");
    expect((await gm.command({ type: "history.undo", commandId })).type).toBe("rejected");
    const exported = await fetch(url(creds.roomId, "export"), { headers: { authorization: `Bearer ${creds.guestToken}` } });
    expect(exported.headers.get("x-uvtt-warnings")).toContain("portal_lock_omitted");
    const output = await exported.json() as { portals: { closed: boolean; position: { x: number; y: number } }[] };
    expect(output.portals[0]!.closed).toBe(false); expect(output.portals[0]!.position).toEqual({ x: 2, y: 0 });
    await ok(gm, { type: "wall.update", wall: { ...gm.state.walls[door.id]!, b: { x: 175, y: 100 } } });
    for (const player of [alice, bob]) { await player.waitForSeq(gm.seq); expect(player.state.walls[door.id]!.b.x).toBe(175); expect(player.state.walls[door.id]).not.toHaveProperty("uvttPortal"); }
    await ok(gm, { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 70 }, to: { x: 190, y: 140 } } });
    await alice.waitForSeq(gm.seq); expect(alice.state.walls[door.id]).toBeUndefined();
    expect((await alice.command({ type: "portal.setState", wallId: door.id, state: "closed" })).type).toBe("rejected");
    for (const player of [alice, bob]) { player.send({ type: "resync" }); await player.waitFor((m) => m.type === "welcome" && m.seq === gm.seq); expect(player.state).toEqual(viewFor(gm.state, player)); }
    expect(replayTo(creds.roomId, await store.loadEvents(creds.roomId), gm.seq).walls).toEqual(gm.state.walls);
  });
  it("retains a preparation after a concurrent fog change and refuses undo after later fog edits", async () => {
    const { creds, gm, gm2 } = await setup();
    const stale = await prepared(creds.roomId, creds.guestToken);
    await ok(gm2, { type: "fog.add", region: { shape: "rect", from: { x: 10, y: 10 }, to: { x: 60, y: 60 } } });
    await gm.waitForSeq(gm2.seq); const before = gm.seq;
    expect((await gm.command({ type: "scene.importUVTT", importId: stale.id, revision: 1 })).type).toBe("rejected");
    expect(gm.seq).toBe(before);
    expect((await fetch(url(creds.roomId, `imports/${stale.id}`), { method: "DELETE", headers: { authorization: `Bearer ${creds.guestToken}` } })).status).toBe(204);
    const fresh = await prepared(creds.roomId, creds.guestToken);
    await ok(gm, { type: "scene.importUVTT", importId: fresh.id, revision: 1 });
    const commandId = gm.state.undo.at(-1)!.commandId;
    expect(gm.state.fog).toEqual({});
    await ok(gm, { type: "fog.add", region: { shape: "rect", from: { x: 10, y: 10 }, to: { x: 60, y: 60 } } });
    expect((await gm.command({ type: "history.undo", commandId })).type).toBe("rejected");
  });
  it.each(["base paint", "effect creation", "effect paint", "effect rename", "effect removal", "paint undone"] as const)("refuses a prepared import after %s without writes or rebasing its draft (FR-TAC-03)", async (edit) => {
    const { creds, gm, gm2 } = await setup();
    const effectId = await seedTerrain(gm);
    const originalTerrain = structuredClone(gm.state.terrain);
    const originalRevision = gm.state.terrainRevision!;
    const prep = await prepared(creds.roomId, creds.guestToken);
    await gm2.waitForSeq(gm.seq);
    const context = terrainContext(gm2);
    const paint: CommandInput = { type: "terrain.paint", layerId: "base", paint: [{ row: 0, start: 0, end: 0, kind: "blocked" }], context };
    const edits: Record<typeof edit, CommandInput> = {
      "base paint": paint,
      "effect creation": { type: "terrain.effect.create", name: "New effect", context },
      "effect paint": { type: "terrain.paint", layerId: effectId, paint: [{ row: 0, start: 2, end: 2, kind: "difficult" }], context },
      "effect rename": { type: "terrain.effect.rename", effectId, name: "Renamed ice", context },
      "effect removal": { type: "terrain.effect.remove", effectId, context },
      "paint undone": paint,
    };
    await ok(gm2, edits[edit]);
    if (edit === "paint undone") {
      await ok(gm2, { type: "history.undo", commandId: gm2.state.undo.at(-1)!.commandId });
      expect(gm2.state.terrain).toEqual(originalTerrain);
      expect(gm2.state.terrainRevision).toBe(originalRevision + 2);
    }
    await gm.waitForSeq(gm2.seq);
    const before = structuredClone(gm.state), beforeSeq = gm.seq;
    const events = await store.loadEvents(creds.roomId);
    const append = vi.spyOn(store, "append");
    const refuse = async (revision: number) => {
      expect(await gm.command({ type: "scene.importUVTT", importId: prep.id, revision })).toMatchObject({ type: "rejected", code: "invalid", message: expect.stringMatching(/terrain.*changed.*draft has been kept/) });
      expect(append).not.toHaveBeenCalled();
      expect(await store.loadEvents(creds.roomId)).toEqual(events);
      expect(gm.seq).toBe(beforeSeq); expect(gm.state).toEqual(before);
    };
    await refuse(prep.revision);
    // Releasing a failed lease permits edits, but editing the preparation must retain its original baseline.
    const revised = await fetch(url(creds.roomId, `imports/${prep.id}`), { method: "PUT", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" }, body: JSON.stringify({ revision: prep.revision, grid: { ...prep.grid, offsetX: 5 }, walls: prep.walls }) });
    expect(revised.status).toBe(200);
    await refuse(UvttPreparation.parse(await revised.json()).revision);
    expect((await fetch(url(creds.roomId, `imports/${prep.id}`), { method: "DELETE", headers: { authorization: `Bearer ${creds.guestToken}` } })).status).toBe(204);
  });
  it("keeps the original terrain baseline when terrain changes during file validation (FR-TAC-03)", async () => {
    const { creds, gm } = await setup();
    let started!: () => void, release!: () => void;
    const validating = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const validate = UvttValidationPool.prototype.validate;
    vi.spyOn(UvttValidationPool.prototype, "validate").mockImplementationOnce(async function (this: UvttValidationPool, filename, grid) {
      started(); await gate;
      return validate.call(this, filename, grid);
    });
    const uploading = prepared(creds.roomId, creds.guestToken);
    try {
      await validating;
      await seedTerrain(gm);
    } finally { release(); }
    const prep = await uploading;
    const before = structuredClone(gm.state), beforeSeq = gm.seq;
    const events = await store.loadEvents(creds.roomId);
    const append = vi.spyOn(store, "append");
    expect(await gm.command({ type: "scene.importUVTT", importId: prep.id, revision: prep.revision })).toMatchObject({ type: "rejected", code: "invalid", message: expect.stringContaining("terrain") });
    expect(append).not.toHaveBeenCalled(); expect(await store.loadEvents(creds.roomId)).toEqual(events);
    expect(gm.seq).toBe(beforeSeq); expect(gm.state).toEqual(before);
  });
  it("retains rejected drafts, guards baseline/revision, handles append failure and cancellation", async () => {
    const { creds, gm } = await setup();
    const prep = await prepared(creds.roomId, creds.guestToken);
    const revise = (revision: number) => fetch(url(creds.roomId, `imports/${prep.id}`), { method: "PUT", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" }, body: JSON.stringify({ revision, grid: { ...prep.grid, offsetX: 5 }, walls: prep.walls }) });
    expect((await revise(1)).status).toBe(200); expect((await revise(1)).status).toBe(409);
    const before = gm.seq;
    expect((await gm.command({ type: "scene.importUVTT", importId: prep.id, revision: 1 })).type).toBe("rejected");
    const append = vi.spyOn(store, "append").mockRejectedValueOnce(new Error("persist failed"));
    expect((await gm.command({ type: "scene.importUVTT", importId: prep.id, revision: 2 })).type).toBe("rejected"); expect(gm.seq).toBe(before);
    append.mockRestore();
    await ok(gm, { type: "scene.importUVTT", importId: prep.id, revision: 2 });
    const stale = await prepared(creds.roomId, creds.guestToken);
    await ok(gm, { type: "scene.setGrid", grid: { ...gm.state.scene.grid, offsetX: 6 } });
    const refusal = await gm.command({ type: "scene.importUVTT", importId: stale.id, revision: stale.revision });
    expect(refusal.type).toBe("rejected"); if (refusal.type === "rejected") expect(refusal.message).toMatch(/changed/);
    expect((await fetch(url(creds.roomId, `imports/${stale.id}`), { method: "PUT", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" }, body: JSON.stringify({ revision: 1, grid: stale.grid, walls: stale.walls }) })).status).toBe(200);
    expect((await fetch(url(creds.roomId, `imports/${stale.id}`), { method: "DELETE", headers: { authorization: `Bearer ${creds.guestToken}` } })).status).toBe(204);
    expect((await gm.command({ type: "scene.importUVTT", importId: stale.id, revision: 2 })).type).toBe("rejected");
    const files = await readdir(server.uploadDir); expect(files.every((name) => /\.(png|webp)$/.test(name))).toBe(true);
  });
  it("rejects players, cross-room credentials, unsupported suffixes and malformed files without scene changes", async () => {
    const { creds, gm, alice, ac } = await setup();
    const other = await server.createRoom("Other");
    const before = gm.seq;
    expect((await upload(creds.roomId, ac.guestToken)).status).toBe(403);
    expect((await upload(creds.roomId, other.guestToken)).status).toBe(403);
    expect((await fetch(url(creds.roomId, "export"), { headers: { authorization: `Bearer ${ac.guestToken}` } })).status).toBe(403);
    expect((await upload(creds.roomId, creds.guestToken, { format: 2, image: "private" })).status).toBe(422);
    expect((await upload(creds.roomId, creds.guestToken, null, "malware.txt")).status).toBe(415);
    const prep = await prepared(creds.roomId, creds.guestToken);
    expect((await alice.command({ type: "scene.importUVTT", importId: prep.id, revision: 1 })).type).toBe("rejected");
    const otherGm = await connect(other);
    expect((await otherGm.command({ type: "scene.importUVTT", importId: prep.id, revision: 1 })).type).toBe("rejected");
    expect((await fetch(url(other.roomId, `imports/${prep.id}`), { method: "DELETE", headers: { authorization: `Bearer ${other.guestToken}` } })).status).toBe(404);
    expect(gm.seq).toBe(before); expect(alice.state.walls).toEqual({});
  });
  it("checks expired bound sessions before consuming a multipart body", async () => {
    const creds = await server.createRoom();
    await store.deleteSession((await store.findCredential((await import("../src/domain/credentials")).hashToken(creds.guestToken)))!.sessionHash!);
    const res = await fetch(url(creds.roomId), { method: "POST", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "multipart/form-data; boundary=invalid" }, body: "not multipart" });
    expect(res.status).toBe(403);
  });
  it("rejects full preparation capacity before multipart parsing, validation or storage and accepts after discard", async () => {
    const creds = await server.createRoom();
    const first = await prepared(creds.roomId, creds.guestToken);
    await prepared(creds.roomId, creds.guestToken);
    const validate = vi.spyOn(UvttValidationPool.prototype, "validate");
    const put = vi.spyOn(LocalDiskAssetStore.prototype, "put");
    const record = vi.spyOn(store, "recordRoomUpload");
    const files = await readdir(server.uploadDir);
    const events = await store.loadEvents(creds.roomId);
    const expected = { error: "Too many preparations. Discard an unused draft or wait for it to expire.", issues: [
      { code: "preparation_limit", path: "file", severity: "error", message: "Too many preparations. Discard an unused draft or wait for it to expire." },
    ] };
    const limited = await upload(creds.roomId, creds.guestToken);
    expect(limited.status).toBe(422); expect(await limited.json()).toEqual(expected);
    expect(validate).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
    const malformed = await fetch(url(creds.roomId), { method: "POST", headers: {
      authorization: `Bearer ${creds.guestToken}`, "content-type": "multipart/form-data; boundary=invalid",
    }, body: "not multipart" });
    expect(malformed.status).toBe(422); expect(await malformed.json()).toEqual(expected);
    expect(await readdir(server.uploadDir)).toEqual(files); expect(await store.loadEvents(creds.roomId)).toEqual(events);
    expect((await fetch(url(creds.roomId, `imports/${first.id}`), { method: "DELETE", headers: { authorization: `Bearer ${creds.guestToken}` } })).status).toBe(204);
    await prepared(creds.roomId, creds.guestToken);
    expect(validate).toHaveBeenCalledTimes(1); expect(put).toHaveBeenCalledTimes(1); expect(record).toHaveBeenCalledTimes(1);
  });
  // 20 UVTT preparations run about 24s on Windows.
  it("shares the owner's draft quota across distinct GM seats without blocking another owner", async () => {
    let now = Date.now();
    await server.close(); server = await startServer(store, { now: () => now });
    const account = await server.signUp();
    for (let i = 0; i < 10; i++) {
      const creds = await server.createRoom("GM", { cookie: account.cookie });
      await prepared(creds.roomId, creds.guestToken);
      await prepared(creds.roomId, creds.guestToken);
      now += 60_000;
    }
    const overflow = await server.createRoom("GM", { cookie: account.cookie });
    const validate = vi.spyOn(UvttValidationPool.prototype, "validate");
    const limited = await upload(overflow.roomId, overflow.guestToken);
    expect(limited.status).toBe(422);
    expect(await limited.json()).toMatchObject({ issues: [{ code: "preparation_limit" }] });
    expect(validate).not.toHaveBeenCalled();
    const other = await server.createRoom("Other owner");
    await prepared(other.roomId, other.guestToken);
    expect(validate).toHaveBeenCalledTimes(1);
  }, 60_000);
  it("keeps the general JSON limit and supports large draft geometry within the dedicated limit", async () => {
    const creds = await server.createRoom(); const prep = await prepared(creds.roomId, creds.guestToken);
    const walls = Array.from({ length: 1500 }, (_, i) => ({ a: { x: i % 399, y: 0 }, b: { x: i % 399 + 1, y: 100 }, source: "objects_line_of_sight", uvttPortal: { position: { x: 20, y: 30 }, rotation: 1, closed: false, freestanding: true } }));
    const body = JSON.stringify({ revision: 1, grid: prep.grid, walls }); expect(body.length).toBeGreaterThan(65536);
    expect((await fetch(url(creds.roomId, `imports/${prep.id}`), { method: "PUT", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" }, body })).status).toBe(200);
    expect((await fetch(`${server.base}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body })).status).toBe(413);
    const malformed = await fetch(url(creds.roomId, `imports/${prep.id}`), { method: "PUT", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" }, body: '{"private":"do not echo"' });
    expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain("do not echo");
    const oversized = await fetch(url(creds.roomId, `imports/${prep.id}`), { method: "PUT", headers: { authorization: `Bearer ${creds.guestToken}`, "content-type": "application/json" }, body: JSON.stringify({ private: "x".repeat(1024 * 1024) }) });
    expect(oversized.status).toBe(413); expect((await oversized.text()).length).toBeLessThan(200);
  });
  it("caps multipart uploads and rate-limits authorized preparation attempts", async () => {
    vi.spyOn(UvttValidationPool.prototype, "validate").mockRejectedValue(new UvttError([{ code: "unsupported_format", path: "file", severity: "error", message: "Unsupported format" }]));
    const creds = await server.createRoom();
    const body = new FormData(); body.append("file", new Blob([new Uint8Array(40 * 1024 * 1024 + 1)]), "large.uvtt");
    expect((await fetch(url(creds.roomId), { method: "POST", headers: { authorization: `Bearer ${creds.guestToken}` }, body })).status).toBe(413);
    for (let i = 0; i < 24; i++) expect((await upload(creds.roomId, creds.guestToken, { format: 2 })).status).toBe(422);
    const limited = await upload(creds.roomId, creds.guestToken, { format: 2 });
    expect(limited.status).toBe(429); expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await readdir(server.uploadDir).catch(() => [])).toEqual([]);
  });
  it("captures a private scene's own baseline so its import applies (FR-GM-25)", async () => {
    const { creds, gm } = await setup();
    await ok(gm, { type: "scene.create", name: "Cellar", activate: false });
    const sceneId = Object.keys(gm.state.savedScenes!)[0]!;
    const body = new FormData(); body.append("file", new Blob([JSON.stringify(await document())]), "map.dd2vtt");
    const res = await fetch(`${url(creds.roomId)}?sceneId=${sceneId}`, { method: "POST", headers: { authorization: `Bearer ${creds.guestToken}` }, body });
    expect(res.status).toBe(201);
    const prep = UvttPreparation.parse(await res.json());
    await ok(gm, { type: "scene.prepare", sceneId, command: { type: "scene.importUVTT", importId: prep.id, revision: prep.revision, expectedSceneId: sceneId } });
    expect(gm.state.scene.map?.url).toBe("/old.png");
    expect(gm.state.savedScenes![sceneId]!.table.scene.map?.url).toBe(prep.map.url);
    const missing = new FormData(); missing.append("file", new Blob([JSON.stringify(await document())]), "map.dd2vtt");
    expect((await fetch(`${url(creds.roomId)}?sceneId=nope`, { method: "POST", headers: { authorization: `Bearer ${creds.guestToken}` }, body: missing })).status).toBe(403);
  });
});
