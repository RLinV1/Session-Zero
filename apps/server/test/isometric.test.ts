import { afterEach, describe, expect, it } from "vitest";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
  server = null;
});

describe("2.5D map style over the wire (FR-GM-19)", () => {
  it("saves a building's height, shares visible geometry, and withholds fogged outlines", async () => {
    server = await startServer();
    const gmCreds = await server.createRoom();
    const playerCreds = await server.join(gmCreds.inviteCode, "Alice");
    const gm = await server.connect(gmCreds), player = await server.connect(playerCreds);
    clients.push(gm, player);
    await gm.command({ type: "scene.setMap", map: { url: "/map", width: 700, height: 700 } });
    const building = { id: "house", name: "House", height: 2, footprint: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }] };
    const command = { type: "scene.setBuildings" as const, expectedMapUrl: "/map", buildings: [building] };
    expect(await gm.command(command)).toMatchObject({ type: "rejected", code: "invalid" });
    await gm.command({ type: "scene.setIsometric", enabled: true });
    expect(await player.command(command)).toMatchObject({ type: "rejected", code: "forbidden" });
    const saved = await gm.command(command);
    expect(saved.type).toBe("ack");
    if (saved.type !== "ack" || saved.seq === null) throw new Error("Building did not save");
    await player.waitForSeq(saved.seq);
    expect(player.state.scene.isometricBuildings?.items).toEqual([building]);
    const hidden = await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 150, y: 150 }, to: { x: 200, y: 200 } } });
    if (hidden.type !== "ack" || hidden.seq === null) throw new Error("Fog did not save");
    await player.waitForSeq(hidden.seq);
    expect(player.state.scene.isometricBuildings).toBeUndefined();
    expect(gm.state.scene.isometricBuildings?.items).toEqual([building]);
  });
  it("saves terrain and map style atomically, broadcasts the style, and undoes both (FR-TAC-03)", async () => {
    server = await startServer();
    const gmCreds = await server.createRoom();
    const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
    const gm = await server.connect(gmCreds);
    const alice = await server.connect(aliceCreds);
    clients.push(gm, alice);
    expect(await gm.command({ type: "scene.setMap", map: { url: "/map", width: 700, height: 700 } })).toMatchObject({ type: "ack" });
    const ack = await gm.command({
      type: "scene.savePreparation", expectedMapUrl: "/map",
      context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 },
      edits: [
        { type: "terrain.paint", layerId: "base", context: { boardEpoch: gm.state.boardEpoch ?? 0, revision: gm.state.terrainRevision ?? 0 }, paint: [{ row: 0, start: 0, end: 0, kind: "difficult" }] },
        { type: "scene.setIsometric", enabled: true },
      ],
    });
    expect(ack.type).toBe("ack");
    if (ack.type !== "ack" || ack.seq === null) throw new Error("Preparation did not commit");
    await alice.waitForSeq(ack.seq);
    expect(gm.state.scene.isometric).toBe(true);
    expect(alice.state.scene.isometric).toBe(true);
    expect(gm.state.terrain?.base).toEqual([{ row: 0, start: 0, end: 0, kind: "difficult" }]);
    const events = await server.store.loadEvents(gmCreds.roomId);
    const batch = events.slice(-2);
    expect(batch.map((event) => event.event.type)).toEqual(["TerrainPainted", "IsometricSet"]);
    expect(new Set(batch.map((event) => event.commandId)).size).toBe(1);
    const commandId = batch[0]!.commandId;
    if (!commandId) throw new Error("Preparation has no undo command");
    const undo = await gm.command({ type: "history.undo", commandId });
    expect(undo.type).toBe("ack");
    if (undo.type !== "ack" || undo.seq === null) throw new Error("Undo did not commit");
    await alice.waitForSeq(undo.seq);
    expect(gm.state.terrain?.base ?? []).toEqual([]);
    expect(gm.state.scene.isometric).toBe(false);
    expect(alice.state.scene.isometric).toBe(false);
  });

  it("lets the GM set it, reaches the player, and refuses the player", async () => {
    server = await startServer();
    const gmCreds = await server.createRoom();
    const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
    const gm = await server.connect(gmCreds);
    const alice = await server.connect(aliceCreds);
    clients.push(gm, alice);

    expect(alice.state.scene.isometric).toBeUndefined();
    const refused = await alice.command({ type: "scene.setIsometric", enabled: true });
    expect(refused).toMatchObject({ type: "rejected", code: "forbidden" });

    const ack = await gm.command({ type: "scene.setIsometric", enabled: true });
    expect(ack.type).toBe("ack");
    await alice.waitForSeq((ack as { seq: number }).seq);
    expect(alice.state.scene.isometric).toBe(true);
  });
});
