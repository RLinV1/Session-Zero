import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerMessage, Token } from "@vtt/shared";
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

/** Goblin's numbers are distinctive so a leak shows up in any payload, however it is shaped. */
const GOBLIN = { hp: 73, maxHp: 87, ac: 37 };
const leaksGoblin = (raw: string) => /"maxHp":87|"ac":37|"hp":(6\d|7\d)\b/.test(raw);
const seqOf = (reply: unknown) => (reply as { seq: number }).seq;

async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  const bob = await server.connect(bobCreds);
  clients.push(gm, alice, bob);
  await gm.command({ type: "room.setDefeatRemoval", mode: "off" });
  await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [alice.participantId], stats: { hp: 30, maxHp: 30, ac: 14 } });
  await gm.command({ type: "token.create", name: "Goblin", position: { x: 175, y: 35 }, stats: GOBLIN });
  await gm.command({ type: "template.place", shape: "circle", origin: { x: 300, y: 300 }, toward: { x: 370, y: 300 }, size: 10 });
  const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
  return { gm, alice, bob, gmCreds, aliceCreds, bobCreds, aria: byName("Aria"), goblin: byName("Goblin") };
}

describe("table rules over the wire (FR-GM-23, FR-GM-15, ADR 0057)", () => {
  it("never sends a player another token's hidden HP or AC, on any HP path, live or in replay", async () => {
    const { gm, alice, aliceCreds, aria, goblin } = await setup();
    await gm.command({ type: "room.setHideHp", enabled: true });
    const ack = await gm.command({ type: "room.setHideAc", enabled: true });
    await alice.waitForSeq(seqOf(ack));
    expect(alice.state.tokens[goblin.id]!.stats).toEqual({ hp: null, maxHp: null, ac: null });
    expect(alice.state.tokens[aria.id]!.stats).toEqual({ hp: 30, maxHp: 30, ac: 14 });

    const seen: ServerMessage[] = [];
    alice.onMessage((m) => seen.push(m));
    await gm.command({ type: "token.setStats", tokenId: goblin.id, stats: { ...GOBLIN, hp: 71 } });
    const roll = await gm.command({ type: "dice.roll", expression: "1d4", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, kind: "damage" } });
    expect(roll).toMatchObject({ type: "ack" });
    await gm.command({ type: "roll.applyDamage", rollId: gm.state.rolls.at(-1)!.id });
    await gm.command({ type: "areaEffect.start", tokenIds: [goblin.id], expression: "1d20" });
    await gm.command({ type: "areaEffect.resolve", effectId: gm.state.areaEffect!.id, rows: [{ tokenId: goblin.id, amount: 1, addConditions: [] }] });
    await gm.command({ type: "nuke.detonate", amount: 1, origin: { x: 100, y: 100 } });
    const undone = await gm.command({ type: "history.undo", commandId: gm.state.undo.at(-1)!.commandId });
    expect(undone).toMatchObject({ type: "ack" });
    await alice.waitForSeq(gm.seq);
    expect(leaksGoblin(JSON.stringify(seen))).toBe(false);
    expect(alice.state.tokens[goblin.id]!.stats).toEqual({ hp: null, maxHp: null, ac: null });
    // Her own token's HP still reaches her: the nuke took her to 29, and the undo back to 30.
    expect(JSON.stringify(seen)).toContain(`"tokenId":"${aria.id}","stats":{"hp":29`);
    expect(alice.state.tokens[aria.id]!.stats.hp).toBe(30);

    const replay = await fetch(`${server.base}/api/rooms/${aliceCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${aliceCreds.guestToken}` } });
    expect(replay.status).toBe(200);
    // Goblin was created before the rules were on; the replay still hides its numbers now.
    expect(leaksGoblin(await replay.text())).toBe(false);

    // A reconnect's welcome is filtered the same way.
    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(again.state.tokens[goblin.id]!.stats).toEqual({ hp: null, maxHp: null, ac: null });
    // What Alice built from live events is exactly what a fresh filtered snapshot gives.
    expect(alice.state.tokens).toEqual(again.state.tokens);

    // Owning Goblin gives Alice its real values, without reconnecting.
    const given = await gm.command({ type: "token.setOwners", tokenId: goblin.id, ownerIds: [alice.participantId] });
    await alice.waitForSeq(seqOf(given));
    expect(alice.state.tokens[goblin.id]!.stats.maxHp).toBe(GOBLIN.maxHp);
    expect(alice.state.tokens[goblin.id]!.stats.ac).toBe(GOBLIN.ac);

    // Losing it takes them away again.
    const taken = await gm.command({ type: "token.setOwners", tokenId: goblin.id, ownerIds: [] });
    await alice.waitForSeq(seqOf(taken));
    expect(alice.state.tokens[goblin.id]!.stats).toEqual({ hp: null, maxHp: null, ac: null });
  });

  it("shows the GM everything and every player everything once the rules are off", async () => {
    const { gm, alice, goblin } = await setup();
    await gm.command({ type: "room.setHideHp", enabled: true });
    expect(gm.state.tokens[goblin.id]!.stats).toEqual(GOBLIN);
    const off = await gm.command({ type: "room.setHideHp", enabled: false });
    await alice.waitForSeq(seqOf(off));
    expect(alice.state.tokens[goblin.id]!.stats).toEqual(GOBLIN);
    expect(await alice.command({ type: "room.setHideAc", enabled: true })).toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("keeps the board empty for a player without a token until the GM gives them one", async () => {
    const { gm, bob, bobCreds, goblin } = await setup();
    const on = await gm.command({ type: "room.setHideMapWithoutToken", enabled: true });
    await bob.waitForSeq(seqOf(on));
    expect(bob.state.tokens).toEqual({});
    expect(bob.state.templates).toEqual({});
    expect(bob.state.sight).toEqual([]);
    expect(Object.keys(gm.state.tokens)).toHaveLength(2);

    // Nor from the history: the board was set up before the rule, and the replay still keeps it dark.
    const replay = await fetch(`${server.base}/api/rooms/${bobCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${bobCreds.guestToken}` } });
    expect(replay.status).toBe(200);
    const history = await replay.text();
    for (const secret of [goblin.id, "Goblin", "Aria"]) expect(history).not.toContain(secret);

    const given = await gm.command({ type: "token.setOwners", tokenId: goblin.id, ownerIds: [bob.participantId] });
    await bob.waitForSeq(seqOf(given));
    expect(Object.keys(bob.state.tokens)).toHaveLength(2);
    expect(Object.keys(bob.state.templates)).toHaveLength(1);
    expect(bob.state.sight).toBeUndefined();
  });

  it("removes only NPC tokens at 0 HP under Only NPC tokens", async () => {
    const { gm, aria, goblin } = await setup();
    await gm.command({ type: "room.setDefeatRemoval", mode: "npc" });
    await gm.command({ type: "nuke.detonate", amount: 99, origin: { x: 100, y: 100 } });
    expect(gm.state.tokens[goblin.id]).toBeUndefined();
    expect(gm.state.tokens[aria.id]!.stats.hp).toBeLessThanOrEqual(0);
  });
});
