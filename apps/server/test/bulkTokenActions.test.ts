import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Token } from "@vtt/shared";
import { startServer, viewFor, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

/** Aria (Alice's), Goblin, Wolf and a hidden Shadow, all in the turn order, Goblin's turn. */
async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  const bob = await server.connect(bobCreds);
  clients.push(gm, alice, bob);

  await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [alice.participantId] });
  await gm.command({ type: "token.create", name: "Goblin", position: { x: 175, y: 35 }, stats: { hp: 7, maxHp: 7, ac: 13 } });
  await gm.command({ type: "token.create", name: "Wolf", position: { x: 315, y: 35 } });
  await gm.command({ type: "token.create", name: "Shadow", position: { x: 455, y: 35 }, hidden: true });
  const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
  const aria = byName("Aria"), goblin = byName("Goblin"), wolf = byName("Wolf"), shadow = byName("Shadow");
  await gm.command({
    type: "initiative.start",
    entries: [{ tokenId: aria.id, score: 20 }, { tokenId: goblin.id, score: 15 }, { tokenId: wolf.id, score: 12 }, { tokenId: shadow.id, score: 10 }],
  });
  await gm.command({ type: "initiative.advance" });
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  return { gm, alice, bob, aria, goblin, wolf, shadow };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const activeOf = (c: TestClient) => c.state.initiative && c.state.initiative.order[c.state.initiative.activeIndex];

describe("removing several tokens from the encounter over the wire (FR-GM-21, ADR 0074)", () => {
  it("takes them out in one action for everyone, and never names the hidden one to players", async () => {
    const { gm, alice, bob, aria, goblin, wolf, shadow } = await setup();
    expect(await alice.command({ type: "initiative.removeSeveral", tokenIds: [aria.id] })).toMatchObject({ type: "rejected", code: "forbidden" });
    const logStart = alice.rawLog.length;

    const removed = await gm.command({ type: "initiative.removeSeveral", tokenIds: [shadow.id, goblin.id] });
    expect(removed).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(removed))));
    expect(gm.state.initiative?.order).toEqual([aria.id, wolf.id]);
    // Goblin had the turn: it passes to Wolf, the next token left.
    for (const c of [gm, alice, bob]) expect(activeOf(c)).toBe(wolf.id);
    expect(alice.state.initiative?.order).toEqual([aria.id, wolf.id]);
    expect(alice.state).toEqual(bob.state);
    expect(alice.state).toEqual(viewFor(gm.state, alice));
    expect(alice.rawLog.slice(logStart).join("\n")).not.toContain(shadow.id);
    // Both still stand on the board.
    expect(gm.state.tokens[goblin.id]).toBeDefined();
    expect(gm.state.tokens[shadow.id]).toBeDefined();
  });

  it("refuses the whole batch when one token isn't in the order", async () => {
    const { gm, goblin } = await setup();
    await gm.command({ type: "token.create", name: "Orc", position: { x: 595, y: 35 } });
    const orc = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Orc")!;
    const before = gm.state.initiative;
    expect(await gm.command({ type: "initiative.removeSeveral", tokenIds: [goblin.id, orc.id] })).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.state.initiative).toEqual(before);
  });
});

describe("deleting several tokens over the wire (FR-GM-10, FR-REC-02, ADR 0074)", () => {
  it("deletes them in one action for everyone, keeps the hidden one secret, and one undo brings them all back", async () => {
    const { gm, alice, bob, aria, goblin, wolf, shadow } = await setup();
    expect(await bob.command({ type: "token.deleteSeveral", tokenIds: [goblin.id] })).toMatchObject({ type: "rejected", code: "forbidden" });
    const logStart = alice.rawLog.length;

    const deleted = await gm.command({ type: "token.deleteSeveral", tokenIds: [goblin.id, wolf.id, shadow.id] });
    expect(deleted).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(deleted))));
    for (const c of [gm, alice, bob]) {
      expect(c.state.tokens[goblin.id]).toBeUndefined();
      expect(c.state.tokens[wolf.id]).toBeUndefined();
      expect(c.state.initiative?.order).toEqual([aria.id]);
    }
    expect(gm.state.tokens[shadow.id]).toBeUndefined();
    expect(alice.state).toEqual(bob.state);
    expect(alice.rawLog.slice(logStart).join("\n")).not.toContain(shadow.id);

    const entry = gm.state.undo.at(-1)!;
    expect(entry.undoable).toBe(true);
    const undone = await gm.command({ type: "history.undo", commandId: entry.commandId });
    expect(undone).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(undone))));
    expect(gm.state.tokens[goblin.id]?.stats.hp).toBe(7);
    expect(gm.state.tokens[wolf.id]).toBeDefined();
    expect(gm.state.tokens[shadow.id]?.hidden).toBe(true);
    expect(alice.state.tokens[goblin.id]).toBeDefined();
    expect(alice.state.tokens[shadow.id]).toBeUndefined();
    expect(alice.state).toEqual(viewFor(gm.state, alice));
    expect(alice.rawLog.slice(logStart).join("\n")).not.toContain(shadow.id);
    // Undo leaves the turn order alone (ADR 0065): the GM adds them back with Add to encounter.
    expect(gm.state.initiative?.order).toEqual([aria.id]);
  });

  it("makes deleting one token undoable too", async () => {
    const { gm, alice, goblin } = await setup();
    const deleted = await gm.command({ type: "token.delete", tokenId: goblin.id });
    await alice.waitForSeq(seqOf(deleted));
    const undone = await gm.command({ type: "history.undo", commandId: gm.state.undo.at(-1)!.commandId });
    expect(undone).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(undone));
    expect(alice.state.tokens[goblin.id]?.name).toBe("Goblin");
  });
});
