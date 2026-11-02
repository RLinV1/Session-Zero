import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GRID, DomainEvent, filterStateForViewer, isDiceRoll, replayTo, undoableAction,
  type CommandInput, type ServerMessage,
} from "@vtt/shared";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type TestClient, viewFor } from "./helpers";

let store: MemoryRoomStore;
let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { store = new MemoryRoomStore(); server = await startServer(store); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); });

const oldMap = { url: "/old.png", width: 1000, height: 800 };
const map = { url: "/new.png", width: 500, height: 400 };
const grid = { ...DEFAULT_GRID, cellSize: 20 };

async function connect(creds: Parameters<typeof server.connect>[0]) {
  const client = await server.connect(creds);
  clients.push(client);
  return client;
}
async function ok(client: TestClient, command: CommandInput) {
  const response = await client.command(command);
  expect(response.type).toBe("ack");
  if (response.type !== "ack") throw new Error(response.message);
  return response;
}

async function setup(first = false) {
  const gmCreds = await server.createRoom();
  const gm = await connect(gmCreds);
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const alice = await connect(aliceCreds);
  const bob = await connect(bobCreds);
  if (!first) await ok(gm, { type: "scene.setMap", map: oldMap, grid });
  await ok(gm, { type: "token.create", name: "Hero", position: { x: 241, y: 161 }, ownerIds: [alice.participantId] });
  await ok(gm, { type: "token.create", name: "Secret dragon", position: { x: 877.123, y: 733.456 }, size: 2, hidden: true });
  await ok(gm, { type: "token.create", name: "Foe", position: { x: 240, y: 160 } });
  await ok(gm, { type: "token.create", name: "Ally", position: { x: 260, y: 180 }, ownerIds: [alice.participantId] });
  const id = (name: string) => Object.values(gm.state.tokens).find((t) => t.name === name)!.id;
  const hero = id("Hero"), secret = id("Secret dragon"), foe = id("Foe"), ally = id("Ally");
  if (!first) {
    await ok(gm, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: hero, targetTokenId: foe } });
    await ok(gm, { type: "dice.roll", expression: "1d6", visibility: "gm" });
    await ok(gm, { type: "initiative.start", entries: [{ tokenId: secret, score: 20 }, { tokenId: foe, score: 15 }, { tokenId: hero, score: 10 }, { tokenId: ally, score: 5 }] });
    await ok(gm, { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 60 }, to: { x: 150, y: 110 } } });
    await ok(gm, { type: "template.place", shape: "circle", origin: { x: 120, y: 80 }, toward: { x: 120, y: 80 }, size: 5, gmOnly: true });
    await ok(bob, { type: "template.place", shape: "circle", origin: { x: 125, y: 85 }, toward: { x: 125, y: 85 }, size: 5 });
    await gm.waitForSeq(bob.seq);
  }
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  return { gm, alice, bob, gmCreds, aliceCreds, bobCreds, hero, secret, foe, ally };
}

const messages = (client: TestClient, from: number) => client.rawLog.slice(from).map((raw) => JSON.parse(raw) as ServerMessage);
const actionId = (gm: TestClient) => gm.state.undo.at(-1)!.commandId;
function privateResult(client: TestClient, from: number, secret: string) {
  const raw = client.rawLog.slice(from).join("\n");
  for (const text of [secret, "Secret dragon", "877.123", "733.456", '"tokenChanges"', '"commandId"', '"previous"', '"from"']) expect(raw).not.toContain(text);
  expect(client.state.undo).toEqual([]);
  expect(client.state.checkpoints).toEqual([]);
}

describe("atomic map adjustment across the wire (KAN-66, FR-GM-02, FR-GM-23, FR-REC-02)", () => {
  it("delivers one GM event and viewer-specific player snapshots, then one exact inverse with append-only history", async () => {
    const { gm, alice, bob, hero, secret, foe, ally } = await setup();
    const resized = { ...map, url: oldMap.url };
    const before = gm.state;
    const log = await store.loadEvents(gm.state.roomId);
    const offsets = [gm.rawLog.length, alice.rawLog.length, bob.rawLog.length];
    const ack = await ok(gm, { type: "scene.setMap", map: resized });
    expect(ack.seq).toBe(log.length + 1);
    const commandId = actionId(gm);
    expect(undoableAction(gm.state.undo, commandId)).toBeDefined();
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    const appended = await store.loadEvents(gm.state.roomId);
    expect(appended.slice(0, log.length)).toEqual(log);
    expect(appended.slice(log.length)).toHaveLength(1);
    expect(appended.at(-1)?.event).toMatchObject({
      type: "MapSet", previous: oldMap, map: resized, gridChange: { grid, previous: grid },
      tokenChanges: expect.arrayContaining([{ tokenId: hero, from: { x: 241, y: 161 }, to: { x: 120.5, y: 80.5 } }]),
    });
    expect(DomainEvent.safeParse(appended.at(-1)?.event).success).toBe(true);
    expect(messages(gm, offsets[0]!).map((m) => m.type)).toEqual(["event", "ack"]);
    for (const [i, client] of [alice, bob].entries()) {
      expect(messages(client, offsets[i + 1]!).map((m) => m.type)).toEqual(["welcome"]);
      expect(client.state).toEqual(viewFor(gm.state, client));
      privateResult(client, offsets[i + 1]!, secret);
    }
    expect(alice.state.tokens[hero]?.position).toEqual({ x: 120.5, y: 80.5 });
    expect(alice.state.tokens[ally]).toBeDefined();
    expect(bob.state.tokens[hero]).toBeUndefined();
    expect(bob.state.tokens[ally]).toBeUndefined();
    expect(alice.state.tokens[foe]).toBeUndefined();
    expect(alice.state.rolls.filter(isDiceRoll)[0]?.attack?.target).toBeNull();
    expect(gm.state.fog).toEqual(before.fog);
    expect(gm.state.templates).toEqual(before.templates);

    const inverseOffsets = [alice.rawLog.length, bob.rawLog.length];
    await ok(gm, { type: "history.undo", commandId });
    const undoneLog = await store.loadEvents(gm.state.roomId);
    expect(undoneLog.slice(0, appended.length)).toEqual(appended);
    expect(undoneLog.slice(appended.length).map((c) => c.event.type)).toEqual(["MapSet", "ActionUndone"]);
    expect(undoneLog.at(-1)?.commandId).toBe(undoneLog.at(-2)?.commandId);
    expect(gm.state.scene).toEqual(before.scene);
    expect(gm.state.tokens).toEqual(before.tokens);
    for (const [i, client] of [alice, bob].entries()) {
      await client.waitForSeq(gm.seq);
      expect(messages(client, inverseOffsets[i]!).map((m) => m.type)).toEqual(["welcome", "redacted"]);
      expect(messages(client, inverseOffsets[i]!)[0]).toMatchObject({ type: "welcome", seq: gm.seq - 1 });
      expect(client.state).toEqual(viewFor(gm.state, client));
      privateResult(client, inverseOffsets[i]!, secret);
      expect(client.state.rolls.filter(isDiceRoll)[0]?.attack?.target).toBeNull();
    }
  });

  it("undoes first-map placement to null and preserves exact originally outside positions", async () => {
    const { gm, alice, bob, secret, hero } = await setup(true);
    await ok(gm, { type: "token.move", tokenId: hero, to: { x: -123.456, y: 987.654 } });
    const before = gm.state;
    await ok(gm, { type: "scene.setMap", map, grid: { ...grid, cellSize: 50, offsetX: 5 }, tokenPolicy: "recenter" });
    expect(gm.state.tokens[hero]?.position).toEqual({ x: 25, y: 375 });
    await ok(gm, { type: "history.undo", commandId: actionId(gm) });
    expect(gm.state.scene).toEqual(before.scene);
    expect(gm.state.tokens).toEqual(before.tokens);
    expect((await store.loadEvents(gm.state.roomId)).at(-2)?.event).toMatchObject({ type: "MapSet", map: null });
    for (const client of [alice, bob]) {
      await client.waitForSeq(gm.seq);
      expect(client.state.scene.map).toBeNull();
      expect(client.state).toEqual(viewFor(gm.state, client));
      expect(client.rawLog.join("\n")).not.toContain(secret);
    }
  });

  it.each(["scale", "keep", "recenter"] as const)("rejects hidden oversize atomically for %s and refuses forged player requests", async (tokenPolicy) => {
    const { gm, alice, bob, secret } = await setup();
    await ok(gm, { type: "token.configure", tokenId: secret, changes: { size: 10 } });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    const before = await store.loadEvents(gm.state.roomId);
    const state = gm.state;
    const offsets = [alice.rawLog.length, bob.rawLog.length];
    const small = { ...map, width: 100 };
    expect(await gm.command({ type: "scene.setMap", map: small, tokenPolicy })).toMatchObject({ type: "rejected", code: "invalid", message: expect.stringMatching(/Secret dragon.*200 px.*larger map.*grid cell size/) });
    expect(await alice.command({ type: "scene.setMap", map: small, tokenPolicy })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await alice.command({ type: "history.undo", commandId: actionId(gm) })).toMatchObject({ type: "rejected", code: "forbidden" });
    // A malformed enum is rejected by the socket schema before decision.
    expect(await gm.command({ type: "scene.setMap", map, tokenPolicy: "forged" } as unknown as CommandInput)).toMatchObject({ type: "rejected", code: "bad_request" });
    expect(await store.loadEvents(gm.state.roomId)).toEqual(before);
    expect(gm.state).toEqual(state);
    expect(messages(bob, offsets[1]!)).toEqual([]);
    privateResult(alice, offsets[0]!, secret);
  });

  it("uses moves committed while map preparation was open", async () => {
    const { gm, alice, hero } = await setup();
    // This is the draft's map; preparation stores no token coordinates or room command.
    const draft = { type: "scene.setMap", map, grid } as const;
    await ok(alice, { type: "token.move", tokenId: hero, to: { x: 330.25, y: 321.75 } });
    await gm.waitForSeq(alice.seq);
    await ok(gm, draft);
    const event = (await store.loadEvents(gm.state.roomId)).at(-1)!.event;
    expect(event).toMatchObject({ type: "MapSet", tokenChanges: expect.arrayContaining([
      { tokenId: hero, from: { x: 330.25, y: 321.75 }, to: { x: 165.125, y: 160.875 } },
    ]) });
    await alice.waitForSeq(gm.seq);
    expect(alice.state.tokens[hero]?.position).toEqual({ x: 165.125, y: 160.875 });
  });

  it.each(["map", "grid", "position", "deleted"] as const)("rejects %s undo conflicts without appending", async (conflict) => {
    const { gm, hero } = await setup();
    await ok(gm, { type: "scene.setMap", map });
    const commandId = actionId(gm);
    if (conflict === "map") await ok(gm, { type: "scene.setMap", map: { ...map, url: "/other.png" }, tokenPolicy: "keep" });
    if (conflict === "grid") await ok(gm, { type: "scene.setGrid", grid: { ...grid, lineOpacity: 0.75 } });
    if (conflict === "position") await ok(gm, { type: "token.move", tokenId: hero, to: { x: 222, y: 333 } });
    if (conflict === "deleted") await ok(gm, { type: "token.delete", tokenId: hero });
    const before = await store.loadEvents(gm.state.roomId);
    expect(await gm.command({ type: "history.undo", commandId })).toMatchObject({ type: "rejected", code: "invalid", message: expect.stringContaining("Can't undo:") });
    expect(await store.loadEvents(gm.state.roomId)).toEqual(before);
  });

  it("protects raw resync/reconnect/reload snapshots and rebuilds map undo after persisted-log replay", async () => {
    const { gm, alice, bob, gmCreds, aliceCreds, bobCreds, secret, hero, foe } = await setup();
    const before = gm.state;
    await ok(gm, { type: "scene.setMap", map: { ...map, url: oldMap.url } });
    const commandId = actionId(gm);
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    for (const client of [alice, bob]) {
      const offset = client.rawLog.length;
      client.send({ type: "resync" });
      await client.waitFor((m) => m.type === "welcome" && m.seq === gm.seq);
      expect(client.state).toEqual(viewFor(gm.state, client));
      privateResult(client, offset, secret);
    }
    const persisted = await store.loadEvents(gm.state.roomId);
    const expected = replayTo(gm.state.roomId, persisted, gm.seq);
    expect(expected).toEqual(gm.state);
    clients.splice(0).forEach((c) => c.close());
    await server.close();
    server = await startServer(store);
    const loadedGm = await connect(gmCreds);
    const loadedAlice = await connect(aliceCreds);
    const loadedBob = await connect(bobCreds);
    expect(loadedGm.state).toEqual(expected);
    expect(undoableAction(loadedGm.state.undo, commandId)).toBeDefined();
    for (const client of [loadedAlice, loadedBob]) {
      expect(client.state).toEqual(filterStateForViewer(expected, expected.participants[client.participantId]!));
      privateResult(client, 0, secret);
      expect(client.rawLog.join("\n")).not.toContain(foe);
    }
    await ok(loadedGm, { type: "token.configure", tokenId: hero, changes: { name: "Renamed Hero", stats: { hp: 3, maxHp: 10, ac: 12 } } });
    await ok(loadedGm, { type: "history.undo", commandId });
    expect(loadedGm.state.scene).toEqual(before.scene);
    expect(loadedGm.state.tokens[hero]?.position).toEqual(before.tokens[hero]?.position);
    expect(loadedGm.state.tokens[hero]?.name).toBe("Renamed Hero");
    expect(loadedGm.state.tokens[hero]?.stats.hp).toBe(3);
    for (const client of [loadedAlice, loadedBob]) {
      await client.waitForSeq(loadedGm.seq);
      expect(client.state).toEqual(viewFor(loadedGm.state, client));
      expect(client.state.rolls.filter(isDiceRoll)[0]?.attack?.target).toBeNull();
    }
    const after = await store.loadEvents(loadedGm.state.roomId);
    expect(after.slice(0, persisted.length)).toEqual(persisted);
    expect(replayTo(loadedGm.state.roomId, after, after.length)).toEqual(loadedGm.state);
  });
});
