import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DeleteBucketCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { UvttPreparation, replayTo, type CommandInput, type CreateRoomResponse } from "@vtt/shared";
import { buildApp, type App } from "../src/app";
import { S3AssetStore } from "../src/store/assetStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import { HttpAccount, TestClient, listenForFetch, newGuestToken, viewFor } from "./helpers";

const database = process.env.DATABASE_URL;
const endpoint = process.env.UVTT_S3_ENDPOINT;

/** Opt-in real services: no mock database or S3 transport. See verification.md for invocation. */
describe.skipIf(!database || !endpoint)("UVTT Postgres/S3 persistence (FR-REC-02/03, FR-SYNC-04)", () => {
  it("persists portals/checkpoints/undo, exports S3 bytes after restart, filters reconnects and deletes room uploads", async () => {
    const bucket = `uvtt-${randomUUID()}`;
    const credentials = { accessKeyId: process.env.UVTT_S3_ACCESS_KEY ?? "vtt", secretAccessKey: process.env.UVTT_S3_SECRET_KEY ?? "vttvttvtt" };
    const assets = await S3AssetStore.connect({ endpoint: endpoint!, bucket, ...credentials });
    const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials });
    let store = await PostgresRoomStore.connect(database!);
    const uploadDir = await mkdtemp(path.join(os.tmpdir(), "uvtt-persistence-"));
    let app: App | undefined;
    let roomId: string | undefined;
    const clients: TestClient[] = [];
    const connect = async (base: string, credential: { roomId: string; guestToken: string }) => {
      const client = await TestClient.connect(base, credential); clients.push(client); return client;
    };
    const ok = async (client: TestClient, command: CommandInput) => {
      const reply = await client.command(command); expect(reply.type, `${command.type}: ${reply.type === "rejected" ? reply.message : ""}`).toBe("ack");
    };
    try {
      app = await buildApp({ store, assets, uploadDir, clientOrigin: "*", wallQueue: null });
      let base = await listenForFetch(app);
      const owner = new HttpAccount(base, `uvtt-${randomUUID()}@example.com`, "correct horse battery");
      expect((await owner.request("POST", "/api/auth/signup", { email: owner.email, password: owner.password, displayName: "GM" })).status).toBe(201);
      const guestToken = newGuestToken();
      const created = await owner.json<CreateRoomResponse>("POST", "/api/rooms", { roomName: "Persisted UVTT", displayName: "GM", guestToken });
      roomId = created.roomId;
      const gmCreds = { roomId, guestToken };
      let gm = await connect(base, gmCreds);
      const gm2 = await connect(base, gmCreds);
      const players = [];
      for (const name of ["Alice", "Bob"]) {
        const token = newGuestToken();
        const joined = await fetch(`${base}/api/invites/${created.inviteCode}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name, guestToken: token }) });
        expect(joined.status).toBe(200);
        players.push({ roomId, guestToken: token });
      }
      const alice = await connect(base, players[0]!);
      const bob = await connect(base, players[1]!);
      const bytes = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#326a95" } }).webp({ lossless: true }).toBuffer();
      const body = new FormData();
      body.append("file", new Blob([JSON.stringify({ format: 0.3, image: bytes.toString("base64"), resolution: { map_origin: { x: -0.25, y: 0.5 }, map_size: { x: 8, y: 6 }, pixels_per_grid: 50 },
        portals: [{ bounds: [{ x: 1, y: 1 }, { x: 2, y: 1 }], position: { x: 0.4, y: 0.8 }, closed: false, rotation: 1.2, freestanding: true }],
      })]), "map.uvtt");
      const uploaded = await fetch(`${base}/api/rooms/${roomId}/uvtt/imports`, { method: "POST", headers: { authorization: `Bearer ${guestToken}` }, body });
      expect(uploaded.status).toBe(201); let prep = UvttPreparation.parse(await uploaded.json());
      await ok(gm2, { type: "scene.importUVTT", importId: prep.id, revision: 1 });
      await gm.waitForSeq(gm2.seq);
      const importCommand = gm.state.undo.at(-1)!.commandId;
      const portal = Object.values(gm.state.walls)[0]!;
      const playerOffsets = [alice.rawLog.length, bob.rawLog.length];
      await ok(gm, { type: "wall.update", wall: { ...portal, uvttPortal: { ...portal.uvttPortal, closed: true } } });
      const editCommand = gm.state.undo.at(-1)!.commandId;
      expect((await gm.command({ type: "history.undo", commandId: importCommand })).type).toBe("rejected");
      for (const [i, player] of [alice, bob].entries()) {
        await player.waitForSeq(gm.seq); expect(player.state).toEqual(viewFor(gm.state, player));
        const raw = player.rawLog.slice(playerOffsets[i]).join("\n");
        for (const secret of [prep.id, portal.id, '"portal"', '"previous"', '"commandId"']) expect(raw).not.toContain(secret);
      }
      await ok(gm, { type: "history.undo", commandId: editCommand });
      expect(gm.state.walls[portal.id]).toEqual(portal);
      await ok(gm, { type: "history.undo", commandId: importCommand });
      expect(gm.state.scene.map).toBeNull(); expect(gm.state.walls).toEqual({});
      expect(await store.hasRoomUpload(roomId, prep.map.url.split("/").at(-1)!)).toBe(true);
      const second = await fetch(`${base}/api/rooms/${roomId}/uvtt/imports`, { method: "POST", headers: { authorization: `Bearer ${guestToken}` }, body });
      expect(second.status).toBe(201); prep = UvttPreparation.parse(await second.json());
      await ok(gm, { type: "scene.importUVTT", importId: prep.id, revision: 1 });
      const importedPortal = Object.values(gm.state.walls)[0]!;
      await ok(gm, { type: "portal.set", wallId: importedPortal.id, portal: { kind: "window", state: "open" } });
      const restoredPortal = gm.state.walls[importedPortal.id]!;
      await ok(gm, { type: "checkpoint.create", name: "UVTT portal" });
      const checkpointId = gm.state.checkpoints.at(-1)!.id;
      await ok(gm, { type: "wall.clear" });
      await ok(gm, { type: "checkpoint.restore", checkpointId });
      expect(gm.state.walls[restoredPortal.id]).toEqual(restoredPortal);
      const restoreCommand = gm.state.undo.at(-1)!.commandId;
      const applied = structuredClone(gm.state);
      const log = await store.loadEvents(roomId);
      expect(replayTo(roomId, log, gm.seq)).toEqual(applied);
      const objectKey = prep.map.url.split("/").at(-1)!;
      await rm(path.join(uploadDir, objectKey)); // Prove subsequent reads use S3, not the local copy.
      expect(Buffer.from((await assets.readPrivate(objectKey, 25 * 1024 * 1024))!)).toEqual(bytes);
      clients.splice(0).forEach((client) => client.close());
      await app.close(); app = undefined; await store.close();
      store = await PostgresRoomStore.connect(database!);
      app = await buildApp({ store, assets, uploadDir, clientOrigin: "*", wallQueue: null }); base = await listenForFetch(app);
      gm = await connect(base, gmCreds); expect(gm.state).toEqual(applied);
      for (const credential of players) {
        const player = await connect(base, credential);
        expect(player.state).toEqual(viewFor(gm.state, player));
        expect(player.state.walls[restoredPortal.id]).toEqual({ id: restoredPortal.id, a: restoredPortal.a, b: restoredPortal.b, portal: restoredPortal.portal });
        expect(player.rawLog.join("\n")).not.toContain('"uvttPortal"');
      }
      // Export lives in the library (ADR 0070): save the room's map there, then export that copy.
      const saved = await fetch(`${base}/api/rooms/${roomId}/map/library`, { method: "POST", headers: { authorization: `Bearer ${guestToken}`, cookie: owner.cookie, "content-type": "application/json" }, body: "{}" });
      expect(saved.status).toBe(201); const { assetId } = await saved.json() as { assetId: string };
      const exported = await fetch(`${base}/api/library/${assetId}/export`, { headers: { cookie: owner.cookie } });
      expect(exported.status).toBe(200); const output = await exported.json() as { image: string; portals: { closed: boolean }[] };
      expect(Buffer.from(output.image, "base64")).toEqual(bytes); expect(output.portals[0]?.closed).toBe(false);
      expect((await gm.command({ type: "scene.importUVTT", importId: prep.id, revision: 1 })).type).toBe("rejected");
      await ok(gm, { type: "history.undo", commandId: restoreCommand }); expect(gm.state.scene.map?.url).toBe(prep.map.url); expect(gm.state.walls).toEqual({});
      expect(await store.hasRoomUpload(roomId, objectKey)).toBe(true); // History assets survive Undo.
      const deleted = await fetch(`${base}/api/rooms/${roomId}`, { method: "DELETE", headers: { cookie: owner.cookie } });
      expect(deleted.status).toBe(204); expect((await store.loadEvents(roomId)).length).toBe(0);
      expect((await fetch(`${endpoint}/${bucket}/${objectKey}`)).status).toBe(404);
      roomId = undefined;
    } finally {
      clients.forEach((client) => client.close());
      await app?.close();
      if (roomId) {
        const removed = await store.deleteRoom(roomId);
        await Promise.all((removed?.uploadKeys ?? []).map((key) => assets.delete(key)));
      }
      await store.close();
      await rm(uploadDir, { recursive: true, force: true });
      await s3.send(new DeleteBucketCommand({ Bucket: bucket })); s3.destroy();
    }
  }, 30_000);
});
