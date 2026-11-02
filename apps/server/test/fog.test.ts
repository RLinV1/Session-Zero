import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDiceRoll, type FogRegion, type Token } from "@vtt/shared";
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

/** A room with a GM and one player, Alice, both connected. */
async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  clients.push(gm, alice);
  return { gm, alice };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const fog = (c: TestClient) => Object.values(c.state.fog) as FogRegion[];
const tokenNamed = (c: TestClient, name: string) => (Object.values(c.state.tokens) as Token[]).find((t) => t.name === name);
const FOG_RECT = { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 140, y: 140 } } } as const;

describe("manual fog of war over the wire (FR-GM-17, FR-GM-23, ADR 0016)", () => {
  it("shows fog to everyone and refuses it from a player", async () => {
    const { gm, alice } = await setup();
    const seq = seqOf(await gm.command(FOG_RECT));
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seq)));
    expect(fog(gm)).toHaveLength(1);
    expect(fog(alice)).toEqual(fog(gm));
    expect(await alice.command(FOG_RECT)).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await alice.command({ type: "fog.remove", regionId: fog(gm)[0]!.id })).toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("never sends a token under fog to a player, and reveals it when the fog is removed", async () => {
    const { gm, alice } = await setup();
    await gm.waitForSeq(seqOf(await gm.command(FOG_RECT)));
    const created = await gm.command({ type: "token.create", name: "Lurker", position: { x: 70, y: 70 } });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(created))));
    const lurker = tokenNamed(gm, "Lurker")!;
    const moved = await gm.command({ type: "token.move", tokenId: lurker.id, to: { x: 105, y: 35 } });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(moved))));

    expect(tokenNamed(alice, "Lurker")).toBeUndefined();
    expect(alice.rawLog.join(" ")).not.toContain("Lurker");
    expect(alice.rawLog.join(" ")).not.toContain(lurker.id);

    const removed = await gm.command({ type: "fog.remove", regionId: fog(gm)[0]!.id });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(removed))));
    expect(fog(alice)).toEqual([]);
    expect(tokenNamed(alice, "Lurker")).toMatchObject({ position: { x: 105, y: 35 } });
  });

  it("drops a token that walks into fog without sending where it went", async () => {
    const { gm, alice } = await setup();
    const created = await gm.command({ type: "token.create", name: "Scout", position: { x: 385, y: 385 } });
    await gm.waitForSeq(seqOf(await gm.command(FOG_RECT)));
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(created) + 1)));
    const scout = tokenNamed(gm, "Scout")!;
    expect(tokenNamed(alice, "Scout")).toBeDefined();

    gm.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: scout.id, at: { x: 77, y: 66 } } });
    const moved = await gm.command({ type: "token.move", tokenId: scout.id, to: { x: 35, y: 35 } });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(moved))));
    expect(tokenNamed(alice, "Scout")).toBeUndefined();
    expect(alice.rawLog.join(" ")).not.toContain('"x":35,"y":35');
    expect(alice.rawLog.join(" ")).not.toContain('"x":77,"y":66');
  });

  it("undoes an accidental reveal (FR-REC-02)", async () => {
    const { gm, alice } = await setup();
    await gm.waitForSeq(seqOf(await gm.command(FOG_RECT)));
    const created = await gm.command({ type: "token.create", name: "Lurker", position: { x: 70, y: 70 } });
    await gm.waitForSeq(seqOf(created));
    const removed = await gm.command({ type: "fog.remove", regionId: fog(gm)[0]!.id });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(removed))));
    expect(tokenNamed(alice, "Lurker")).toBeDefined();

    const entry = gm.state.undo.at(-1)!;
    const undone = await gm.command({ type: "history.undo", commandId: entry.commandId });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(undone))));
    expect(fog(gm)).toHaveLength(1);
    expect(fog(alice)).toEqual(fog(gm));
    expect(tokenNamed(alice, "Lurker")).toBeUndefined();
  });

  it("never leaks a fogged attacker on a roll, even after it is deleted (review fix)", async () => {
    const { gm, alice } = await setup();
    const hero = await gm.command({ type: "token.create", name: "Hero", position: { x: 385, y: 385 }, ownerIds: [alice.participantId] });
    await gm.waitForSeq(seqOf(hero));
    await gm.waitForSeq(seqOf(await gm.command(FOG_RECT)));
    const lurker = await gm.command({ type: "token.create", name: "Lurker", position: { x: 70, y: 70 } });
    await gm.waitForSeq(seqOf(lurker));
    const rolled = await gm.command({
      type: "dice.roll", expression: "1d20",
      attack: { actorTokenId: tokenNamed(gm, "Lurker")!.id, targetTokenId: tokenNamed(gm, "Hero")!.id },
    });
    await gm.waitForSeq(seqOf(rolled));
    await gm.waitForSeq(seqOf(await gm.command({ type: "token.delete", tokenId: tokenNamed(gm, "Lurker")!.id })));
    const ended = await gm.command({ type: "fog.remove", regionId: fog(gm)[0]!.id });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(ended))));
    expect(alice.state.rolls.filter(isDiceRoll).at(-1)?.attack?.actor).toBeNull();
    expect(alice.rawLog.join(" ")).not.toContain("Lurker");
  });
});

describe("fog.replace over the wire (FR-GM-17, ADR 0032)", () => {
  const rectAt = (n: number) => ({ shape: "rect", from: { x: n * 10, y: 0 }, to: { x: n * 10 + 5, y: 5 } }) as const;

  it("swaps a region in a room at the fog cap, for everyone, and refuses a player", async () => {
    const { gm, alice } = await setup();
    let seq = 0;
    for (let i = 0; i < 100; i++) seq = seqOf(await gm.command({ type: "fog.add", region: rectAt(i) }));
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seq)));
    expect(fog(gm)).toHaveLength(100);
    expect(await gm.command({ type: "fog.add", region: rectAt(200) })).toMatchObject({ type: "rejected", code: "invalid" });

    const old = fog(gm)[0]!;
    const swap = { type: "fog.replace" as const, removeIds: [old.id], add: [rectAt(300)] };
    expect(await alice.command(swap)).toMatchObject({ type: "rejected", code: "forbidden" });
    const done = seqOf(await gm.command(swap));
    await Promise.all([gm, alice].map((c) => c.waitForSeq(done)));
    for (const c of [gm, alice]) {
      expect(fog(c)).toHaveLength(100);
      expect(c.state.fog[old.id]).toBeUndefined();
    }
    // A refused swap changes nothing.
    expect(await gm.command({ type: "fog.replace", removeIds: [], add: [rectAt(301)] })).toMatchObject({ type: "rejected", code: "invalid" });
    expect(fog(gm)).toHaveLength(100);
  });
});
