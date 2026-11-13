import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defeatRemovalOf, type ServerMessage, type Token } from "@vtt/shared";
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

async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  clients.push(gm, alice);

  await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [alice.participantId], stats: { hp: 30, maxHp: 30, ac: 14 } });
  await gm.command({ type: "token.create", name: "Goblin", position: { x: 175, y: 35 }, stats: { hp: 15, maxHp: 15, ac: 13 } });
  await gm.command({ type: "token.create", name: "Shadow Lurker", position: { x: 315, y: 35 }, hidden: true, stats: { hp: 20, maxHp: 20, ac: 15 } });
  await alice.waitForSeq(gm.seq);
  const byName = (c: TestClient, name: string) => (Object.values(c.state.tokens) as Token[]).find((t) => t.name === name);
  return { gm, alice, aliceCreds, aria: byName(gm, "Aria")!, goblin: byName(gm, "Goblin")!, shadow: byName(gm, "Shadow Lurker")! };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const eventTypes = (messages: ServerMessage[]) =>
  messages.flatMap((m) => (m.type === "event" ? [m.committed.event.type] : []));

describe("auto-remove defeated tokens over the wire (FR-TAC-07, FR-GM-23, FR-REC-02)", () => {
  it("refuses a player's change to the option and shows the GM's change to everyone", async () => {
    const { gm, alice } = await setup();
    expect(defeatRemovalOf(alice.state)).toBe("all"); // on by default in a new room
    expect(await alice.command({ type: "room.setDefeatRemoval", mode: "off" })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await gm.command({ type: "room.setDefeatRemoval", mode: "all" })).toMatchObject({ type: "rejected", code: "invalid" });
    const ack = await gm.command({ type: "room.setDefeatRemoval", mode: "off" });
    expect(ack).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(ack));
    expect(defeatRemovalOf(alice.state)).toBe("off");
  });

  it("removes a visible defeated token for everyone, stats event first; reconnect lacks it; undo restores it", async () => {
    const { gm, alice, aliceCreds, goblin } = await setup();
    const messages: ServerMessage[] = [];
    alice.onMessage((m) => messages.push(m));

    const ack = await gm.command({ type: "token.setStats", tokenId: goblin.id, stats: { hp: 0, maxHp: 15, ac: 13 } });
    await alice.waitForSeq(seqOf(ack));
    expect(eventTypes(messages)).toEqual(["TokenStatsSet", "TokenDeleted"]);
    const deleted = messages.find((m) => m.type === "event" && m.committed.event.type === "TokenDeleted");
    expect(deleted).toMatchObject({ committed: { event: { reason: "defeated", token: { id: goblin.id } } } });
    expect(gm.state.tokens[goblin.id]).toBeUndefined();
    expect(alice.state.tokens[goblin.id]).toBeUndefined();

    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(again.state.tokens[goblin.id]).toBeUndefined();

    const commandId = gm.state.undo.at(-1)!.commandId;
    const undone = await gm.command({ type: "history.undo", commandId });
    expect(undone).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(undone));
    expect(alice.state.tokens[goblin.id]?.stats.hp).toBe(15);
    expect(gm.state.tokens[goblin.id]?.stats.hp).toBe(15);
  });

  it("takes a defeated token out of everyone's turn order, and undo leaves the order alone (FR-GM-21, ADR 0065)", async () => {
    const { gm, alice, aria, goblin } = await setup();
    await gm.command({ type: "initiative.start", entries: [{ tokenId: aria.id, score: 20 }, { tokenId: goblin.id, score: 15 }] });
    await gm.command({ type: "initiative.advance" });
    const ack = await gm.command({ type: "token.setStats", tokenId: goblin.id, stats: { hp: 0, maxHp: 15, ac: 13 } });
    await alice.waitForSeq(seqOf(ack));
    expect(alice.state.initiative?.order).toEqual([aria.id]);
    expect(alice.state.initiative).toMatchObject({ activeIndex: 0, round: 2 });

    const order = gm.state.initiative;
    const commandId = gm.state.undo.at(-1)!.commandId;
    const undone = await gm.command({ type: "history.undo", commandId });
    expect(undone).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(undone));
    expect(alice.state.tokens[goblin.id]).toBeDefined();
    expect(gm.state.initiative).toEqual(order);
    expect(alice.state.initiative?.order).toEqual([aria.id]);
  });

  it("doesn't tell a player that a hidden last token in the order was defeated (FR-GM-23, ADR 0065)", async () => {
    const { gm, alice, shadow } = await setup();
    await gm.command({ type: "initiative.start", entries: [{ tokenId: shadow.id, score: 12 }] });
    await alice.waitForSeq(gm.seq);
    const logStart = alice.rawLog.length;
    const ack = await gm.command({ type: "token.setStats", tokenId: shadow.id, stats: { hp: 0, maxHp: 20, ac: 15 } });
    await alice.waitForSeq(seqOf(ack));
    expect(gm.state.initiative).toBeNull();
    expect(alice.state.initiative).toBeNull();
    const seen = alice.rawLog.slice(logStart).join("\n");
    expect(seen).not.toContain('"deleted"');
    expect(seen).not.toContain(shadow.id);
    expect(seen).not.toContain("Shadow Lurker");
  });

  it("never tells a player about a defeated hidden token", async () => {
    const { gm, alice, aliceCreds, shadow } = await setup();
    const messages: ServerMessage[] = [];
    alice.onMessage((m) => messages.push(m));

    const ack = await gm.command({ type: "token.setStats", tokenId: shadow.id, stats: { hp: -3, maxHp: 20, ac: 15 } });
    await alice.waitForSeq(seqOf(ack));
    expect(gm.state.tokens[shadow.id]).toBeUndefined();
    expect(eventTypes(messages)).toEqual([]);
    expect(JSON.stringify(messages)).not.toContain("Shadow Lurker");

    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(JSON.stringify(again.state)).not.toContain("Shadow Lurker");
  });
});
