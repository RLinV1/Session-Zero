import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EncounterSummary, LibraryAsset, Token } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

const PNG = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#334455" } }).png().toBuffer();

async function connect(creds: Parameters<typeof server.connect>[0]) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

const named = (tokens: Record<string, Token>, name: string) => Object.values(tokens).find((t) => t.name === name);
const ok = async (p: Promise<unknown>) => expect(await p).toMatchObject({ type: "ack" });
const cell = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });

/** A tavern with Aria (Alice's) and Borin (Bob's), and a private Crypt scene to switch to. */
async function party(cookie?: string) {
  const creds = await server.createRoom("GM", cookie ? { cookie, roomName: "Keep" } : undefined);
  const gm = await connect(creds);
  const aliceCreds = await server.join(creds.inviteCode, "Alice");
  const alice = await connect(aliceCreds);
  const bob = await connect(await server.join(creds.inviteCode, "Bob"));
  await ok(gm.command({ type: "scene.setMap", map: { url: "/uploads/tavern.png", width: 700, height: 700 } }));
  await ok(gm.command({ type: "token.create", name: "Aria", position: cell(1, 1), ownerIds: [alice.participantId] }));
  await ok(gm.command({ type: "token.create", name: "Borin", position: cell(2, 1), ownerIds: [bob.participantId] }));
  await ok(gm.command({ type: "token.create", name: "Barkeep", position: cell(5, 5) }));
  await ok(gm.command({ type: "scene.create", name: "Crypt", activate: false }));
  const cryptId = Object.keys(gm.state.savedScenes!).find((id) => gm.state.sceneNames![id] === "Crypt")!;
  await ok(gm.command({ type: "scene.prepare", sceneId: cryptId, command: { type: "scene.setMap", map: { url: "/uploads/crypt.png", width: 700, height: 700 }, expectedSceneId: cryptId } }));
  const aria = named(gm.state.tokens, "Aria")!;
  const borin = named(gm.state.tokens, "Borin")!;
  await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
  return { creds, gm, alice, aliceCreds, bob, aria, borin, cryptId };
}

describe("carry tokens across a scene switch over the wire (FR-GM-25, ADR 0068)", () => {
  it("stages the party in the new scene; each player sees only their own token waiting", async () => {
    const { gm, alice, bob, aria, borin, cryptId } = await party();
    const before = alice.rawLog.length;
    await ok(gm.command({ type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id, borin.id] }));
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
    const sinceSwitch = alice.rawLog.slice(before).join("");

    expect(Object.keys(gm.state.staged).sort()).toEqual([aria.id, borin.id].sort());
    expect(Object.keys(alice.state.staged)).toEqual([aria.id]);
    expect(Object.keys(bob.state.staged)).toEqual([borin.id]);
    expect(alice.state.tokens).toEqual({});
    expect(JSON.stringify(alice.state)).not.toContain(borin.id);
    // Nothing on the wire either: no event, no carried ids, no other player's token.
    expect(sinceSwitch).not.toContain(borin.id);
    expect(sinceSwitch).not.toContain("carriedTokenIds");
  });

  it("places the party with one click, and both players then see both tokens on the map", async () => {
    const { gm, alice, bob, aria, borin, cryptId } = await party();
    await ok(gm.command({ type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id, borin.id] }));
    await ok(gm.command({ type: "token.placeStaged", origin: cell(3, 3), tokenIds: [aria.id, borin.id], expectedSceneId: cryptId }));
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);

    expect(gm.state.staged).toEqual({});
    for (const c of [alice, bob]) {
      expect(c.state.staged).toEqual({});
      expect(c.state.tokens[aria.id]!.position).toEqual(cell(3, 3));
      expect(c.state.tokens[borin.id]).toBeDefined();
    }
    expect(alice.state.tokens[aria.id]!.ownerIds).toEqual([alice.participantId]);
  });

  it("never sends a carried hidden or unowned token to any player", async () => {
    const { gm, alice, bob, aria, cryptId } = await party();
    const barkeep = named(gm.state.tokens, "Barkeep")!;
    await ok(gm.command({ type: "token.setHidden", tokenId: aria.id, hidden: true }));
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
    const since = { alice: alice.rawLog.length, bob: bob.rawLog.length };
    await ok(gm.command({ type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id, barkeep.id] }));
    await ok(gm.command({ type: "token.placeStaged", origin: cell(3, 3), tokenIds: [barkeep.id] }));
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
    for (const [c, from] of [[alice, since.alice], [bob, since.bob]] as const) {
      // Aria is hidden, even from her owner; the barkeep is unowned while staged.
      expect(c.rawLog.length).toBeGreaterThan(from);
      expect(c.rawLog.slice(from).join("")).not.toContain(aria.id);
      expect(Object.keys(c.state.staged)).toEqual([]);
    }
  });

  it("rejects forged carry ids and a player's placement, changing nothing", async () => {
    const { gm, alice, aria, cryptId } = await party();
    const seq = gm.seq;
    expect(await gm.command({ type: "scene.switch", sceneId: cryptId, carryTokenIds: ["forged"] })).toMatchObject({ type: "rejected" });
    expect(await alice.command({ type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] })).toMatchObject({ type: "rejected", code: "forbidden" });
    await ok(gm.command({ type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] }));
    await alice.waitForSeq(gm.seq);
    expect(await alice.command({ type: "token.placeStaged", origin: cell(3, 3) })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await alice.command({ type: "token.move", tokenId: aria.id, to: cell(3, 3) })).toMatchObject({ type: "rejected" });
    expect(gm.seq).toBeGreaterThan(seq);
    expect(Object.keys(gm.state.staged)).toEqual([aria.id]);
  });

  it("converges: a live client and a fresh one agree after carrying and after placing", async () => {
    const { creds, gm, alice, aliceCreds, aria, borin, cryptId } = await party();
    const gmTab = await connect(creds);
    const check = async () => {
      const aliceFresh = await connect(aliceCreds);
      const gmFresh = await connect(creds);
      await Promise.all([alice.waitForSeq(gm.seq), gmTab.waitForSeq(gm.seq), aliceFresh.waitForSeq(gm.seq), gmFresh.waitForSeq(gm.seq)]);
      expect(alice.state).toEqual(aliceFresh.state);
      expect(gmTab.state).toEqual(gm.state);
      expect(gmFresh.state).toEqual(gm.state);
    };
    await ok(gm.command({ type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id, borin.id] }));
    await check();
    await ok(gm.command({ type: "token.placeStaged", origin: cell(3, 3), tokenIds: [aria.id] }));
    await check();
  });

  it("keeps the waiting tray across a reconnect", async () => {
    const { gm, alice, aliceCreds, aria, cryptId } = await party();
    await ok(gm.command({ type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] }));
    await alice.waitForSeq(gm.seq);
    alice.close();
    const again = await connect(aliceCreds);
    await again.waitForSeq(gm.seq);
    expect(Object.keys(again.state.staged)).toEqual([aria.id]);
  });
});

describe("Select and place on a new map over the wire (ADR 0068)", () => {
  it("keeps the ticked tokens waiting, removes the rest, and undo brings back the whole board", async () => {
    const { gm, alice, bob, aria, borin } = await party();
    const before = { tokens: gm.state.tokens, map: gm.state.scene.map };
    await ok(gm.command({ type: "scene.setMap", map: { url: "/uploads/cellar.png", width: 1400, height: 1400 }, placeTokenIds: [aria.id] }));
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
    expect(gm.state.tokens).toEqual({});
    expect(Object.keys(gm.state.staged)).toEqual([aria.id]);
    expect(Object.keys(alice.state.staged)).toEqual([aria.id]);
    expect(bob.state.staged).toEqual({});
    expect(bob.state.tokens[borin.id]).toBeUndefined();

    const commandId = gm.state.undo.at(-1)!.commandId;
    await ok(gm.command({ type: "history.undo", commandId }));
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
    expect(gm.state.tokens).toEqual(before.tokens);
    expect(gm.state.scene.map).toEqual(before.map);
    expect(gm.state.staged).toEqual({});
    expect(alice.state.staged).toEqual({});
    expect(bob.state.tokens[borin.id]).toBeDefined();
  });
});

describe("carry tokens into an encounter template (FR-GM-13, ADR 0068)", () => {
  async function upload(cookie: string) {
    const form = new FormData();
    form.append("kind", "map");
    form.append("name", "Cave");
    form.append("width", "256");
    form.append("height", "256");
    form.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
    const res = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body: form });
    return (await res.json()) as LibraryAsset;
  }
  const save = (cookie: string, roomId: string, name: string) =>
    fetch(`${server.base}/api/library/encounters`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ roomId, name }) });

  it("applies a template carrying the party, players resync, and a template saved later leaves staged tokens out", async () => {
    const cookie = (await server.signUp()).cookie;
    const map = await upload(cookie);
    const { creds, gm, alice, aria } = await party(cookie);
    await ok(gm.command({ type: "scene.setMap", map: { url: map.url, width: map.width, height: map.height, assetId: map.id } }));
    await ok(gm.command({ type: "token.create", name: "Goblin", position: cell(1, 2) }));
    const template = await (await save(cookie, creds.roomId, "Goblins")).json() as EncounterSummary;

    await ok(gm.command({ type: "encounter.apply", templateId: template.id, carryTokenIds: [aria.id] }));
    await alice.waitForSeq(gm.seq);
    expect(Object.keys(gm.state.staged)).toEqual([aria.id]);
    expect(Object.keys(alice.state.staged)).toEqual([aria.id]);

    // Saving now: the staged party isn't part of the template.
    const resaved = await save(cookie, creds.roomId, "Goblins again");
    expect(resaved.status).toBe(201);
    // The board holds the template's copies plus nothing of the staged Aria: a count of the map alone.
    expect(await resaved.json()).toMatchObject({ tokenCount: Object.keys(gm.state.tokens).length });
    expect(gm.state.tokens[aria.id]).toBeUndefined();
  });
});
