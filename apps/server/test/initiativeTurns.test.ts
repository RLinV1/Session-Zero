import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDiceRoll, type Token } from "@vtt/shared";
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
  return { gm, alice, bob, aria, goblin, shadow };
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
