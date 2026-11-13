import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDiceRoll, ReplayResponse, type Token } from "@vtt/shared";
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

/** Aria (Alice's), Goblin and a hidden Shadow, in that turn order. */
async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  const bob = await server.connect(bobCreds);
  clients.push(gm, alice, bob);

  await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [alice.participantId] });
  await gm.command({ type: "token.create", name: "Goblin", position: { x: 175, y: 35 }, stats: { hp: 15, maxHp: 15, ac: 13 } });
  await gm.command({ type: "token.create", name: "Shadow", position: { x: 315, y: 35 }, hidden: true });
  const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
  const aria = byName("Aria"), goblin = byName("Goblin"), shadow = byName("Shadow");
  await gm.command({
    type: "initiative.start",
    entries: [{ tokenId: aria.id, score: 20 }, { tokenId: goblin.id, score: 15 }, { tokenId: shadow.id, score: 10 }],
  });
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  return { gm, alice, bob, aria, goblin, shadow, aliceCreds };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const activeOf = (c: TestClient) => c.state.initiative && c.state.initiative.order[c.state.initiative.activeIndex];

describe("players end their own turn over the wire (FR-GM-21, ADR 0060)", () => {
  it("moves the turn exactly once when End turn and Next turn race", async () => {
    const { gm, alice, bob, aria, goblin } = await setup();
    const [next, end] = await Promise.all([
      gm.command({ type: "initiative.advance" }),
      alice.command({ type: "initiative.endTurn", tokenId: aria.id }),
    ]);
    const replies = [next, end];
    expect(replies.filter((r) => r.type === "ack")).toHaveLength(1);
    expect(replies.filter((r) => r.type === "rejected")).toEqual([expect.objectContaining({ code: "invalid" })]);
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(Math.max(...replies.filter((r) => r.type === "ack").map(seqOf)))));
    expect(activeOf(gm)).toBe(goblin.id);
    expect(activeOf(alice)).toBe(goblin.id);
    expect(gm.state.initiative?.round).toBe(1);
  });

  it("lets the owner end their turn, forbids anyone else, and keeps every client in step", async () => {
    const { gm, alice, bob, aria, goblin } = await setup();
    expect(await bob.command({ type: "initiative.endTurn", tokenId: aria.id })).toMatchObject({ type: "rejected", code: "forbidden" });
    const ended = await alice.command({ type: "initiative.endTurn", tokenId: aria.id });
    expect(ended).toMatchObject({ type: "ack" });
    await Promise.all([gm, bob].map((c) => c.waitForSeq(seqOf(ended))));
    for (const c of [gm, alice, bob]) expect(activeOf(c)).toBe(goblin.id);
    expect(alice.state.initiative).toEqual(bob.state.initiative);
  });

  it("steps the turn back for everyone, and only for the GM", async () => {
    const { gm, alice, aria } = await setup();
    const ended = await alice.command({ type: "initiative.endTurn", tokenId: aria.id });
    await gm.waitForSeq(seqOf(ended));
    expect(await alice.command({ type: "initiative.previous" })).toMatchObject({ type: "rejected", code: "forbidden" });
    const back = await gm.command({ type: "initiative.previous" });
    expect(back).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(back));
    expect(activeOf(alice)).toBe(aria.id);
  });
});

describe("ignored rulings over the wire (attack-rulings, ADR 0060)", () => {
  it("shows the GM the ignore and its undo, and tells players nothing", async () => {
    const { gm, alice, aria, goblin } = await setup();
    const rolled = await alice.command({ type: "dice.roll", expression: "1d20+5", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, kind: "toHit" } });
    await gm.waitForSeq(seqOf(rolled));
    const rollId = gm.state.rolls.filter(isDiceRoll).at(-1)!.id;
    const logStart = alice.rawLog.length;

    const dismissed = await gm.command({ type: "roll.dismiss", rollIds: [rollId] });
    expect(dismissed).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(dismissed));
    expect(gm.state.rolls.filter(isDiceRoll).at(-1)?.dismissed).toBe(true);

    const undone = await gm.command({ type: "history.undo", commandId: gm.state.undo.at(-1)!.commandId });
    expect(undone).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(undone));
    expect(gm.state.rolls.filter(isDiceRoll).at(-1)?.dismissed).toBeUndefined();

    const seen = alice.rawLog.slice(logStart).join("\n");
    expect(seen).not.toContain("dismissed");
    expect(seen).not.toContain("RollsDismissed");
    expect(seen).not.toContain("RollsRestored");
    expect(seen).not.toContain(rollId);
  });
});

describe("the GM edits the turn order over the wire (FR-GM-21, ADR 0065)", () => {
  it("adds and removes tokens for everyone, keeps the turn, and refuses players", async () => {
    const { gm, alice, bob, aria, goblin } = await setup();
    await gm.command({ type: "token.create", name: "Orc", position: { x: 455, y: 35 } });
    const orc = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Orc")!;
    expect(await alice.command({ type: "initiative.add", entries: [{ tokenId: orc.id, score: 16 }] })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await alice.command({ type: "initiative.remove", tokenId: aria.id })).toMatchObject({ type: "rejected", code: "forbidden" });

    await gm.command({ type: "initiative.advance" });
    const added = await gm.command({ type: "initiative.add", entries: [{ tokenId: orc.id, score: 16 }] });
    expect(added).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(added))));
    expect(alice.state.initiative?.order).toEqual([aria.id, orc.id, goblin.id]);
    expect(activeOf(alice)).toBe(goblin.id);

    const removed = await gm.command({ type: "initiative.remove", tokenId: aria.id });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(removed))));
    expect(bob.state.initiative?.order).toEqual([orc.id, goblin.id]);
    expect(activeOf(bob)).toBe(goblin.id);
    expect(bob.state.tokens[aria.id]).toBeDefined();
    // Both players' filtered states converge.
    expect(alice.state).toEqual(bob.state);
  });

  it("adds two tokens in one action, sending players only the visible one, and refuses a stale batch whole", async () => {
    const { gm, alice, bob, aria, goblin, shadow } = await setup();
    await gm.command({ type: "token.create", name: "Orc", position: { x: 455, y: 35 } });
    await gm.command({ type: "token.create", name: "Assassin", position: { x: 595, y: 35 }, hidden: true });
    const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
    const orc = byName("Orc"), assassin = byName("Assassin");
    const logStart = alice.rawLog.length;

    const added = await gm.command({ type: "initiative.add", entries: [{ tokenId: assassin.id, score: 30 }, { tokenId: orc.id, score: 16 }] });
    expect(added).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(added))));
    expect(gm.state.initiative?.order).toEqual([assassin.id, aria.id, orc.id, goblin.id, shadow.id]);
    expect(alice.state.initiative?.order).toEqual([aria.id, orc.id, goblin.id]);
    expect(alice.state).toEqual(bob.state);
    const seen = alice.rawLog.slice(logStart).join("\n");
    expect(seen).not.toContain(assassin.id);
    expect(seen).not.toContain("Assassin");

    await gm.command({ type: "token.create", name: "Bat", position: { x: 735, y: 35 } });
    const bat = byName("Bat");
    const before = gm.state.initiative;
    const stale = await gm.command({ type: "initiative.add", entries: [{ tokenId: bat.id, score: 3 }, { tokenId: orc.id, score: 4 }] });
    expect(stale).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.state.initiative).toEqual(before);
    expect(gm.state.tokens[bat.id]?.initiative ?? null).toBeNull();
  });

  it("moves the turn on for everyone when the active token is deleted", async () => {
    const { gm, alice, aria, goblin } = await setup();
    const deleted = await gm.command({ type: "token.delete", tokenId: aria.id });
    await alice.waitForSeq(seqOf(deleted));
    expect(activeOf(gm)).toBe(goblin.id);
    expect(activeOf(alice)).toBe(goblin.id);
    expect(alice.state.initiative?.order).not.toContain(aria.id);
  });

  it("never sends a player a hidden token added to the order mid-encounter", async () => {
    const { gm, alice } = await setup();
    await gm.command({ type: "token.create", name: "Assassin", position: { x: 455, y: 35 }, hidden: true });
    const assassin = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Assassin")!;
    const before = alice.state.initiative?.order;
    const added = await gm.command({ type: "initiative.add", entries: [{ tokenId: assassin.id, score: 30 }] });
    await alice.waitForSeq(seqOf(added));
    expect(gm.state.initiative?.order[0]).toBe(assassin.id);
    expect(alice.state.initiative?.order).toEqual(before);
    const removed = await gm.command({ type: "token.delete", tokenId: assassin.id });
    await alice.waitForSeq(seqOf(removed));
    expect(alice.rawLog.join("\n")).not.toContain(assassin.id);
    expect(alice.rawLog.join("\n")).not.toContain("Assassin");
  });

  it("doesn't tell a player, live or in replay, that a hidden last token was deleted (FR-GM-23)", async () => {
    const { gm, alice, aria, goblin, shadow, aliceCreds } = await setup();
    await gm.command({ type: "initiative.remove", tokenId: aria.id });
    await gm.command({ type: "initiative.remove", tokenId: goblin.id });
    await alice.waitForSeq(gm.seq);
    const logStart = alice.rawLog.length;
    const deleted = await gm.command({ type: "token.delete", tokenId: shadow.id });
    await alice.waitForSeq(seqOf(deleted));
    expect(alice.state.initiative).toBeNull();
    const seen = alice.rawLog.slice(logStart).join("\n");
    expect(seen).not.toContain('"deleted"');
    expect(seen).not.toContain(shadow.id);

    const res = await fetch(`${server.base}/api/rooms/${aliceCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${aliceCreds.guestToken}` } });
    const replay = ReplayResponse.parse(await res.json());
    const sentences = replay.frames.map((f) => f.sentence);
    expect(sentences).not.toContain("Initiative ended when its last token was deleted");
    expect(JSON.stringify(replay)).not.toContain(shadow.id);
  });
});
