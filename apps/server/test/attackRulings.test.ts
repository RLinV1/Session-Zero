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
  await gm.command({ type: "token.create", name: "Shadow Lurker", position: { x: 315, y: 35 }, hidden: true, stats: { hp: 20, maxHp: 20, ac: 15 } });
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
  return { gm, alice, bob, aria: byName("Aria"), goblin: byName("Goblin"), shadow: byName("Shadow Lurker") };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const lastRoll = (c: TestClient) => c.state.rolls.filter(isDiceRoll).at(-1)!;

describe("GM rulings over the wire (FR-TAC-09, FR-GM-22, FR-GM-23, ADR 0011)", () => {
  it("shows the GM's Hit to everyone on a player's to-hit roll", async () => {
    const { gm, alice, bob, aria, goblin } = await setup();
    const rolled = await alice.command({ type: "dice.roll", expression: "1d20+5", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, kind: "toHit" } });
    await gm.waitForSeq(seqOf(rolled));

    const ruled = await gm.command({ type: "roll.rule", rollId: lastRoll(gm).id, verdict: "hit" });
    expect(ruled).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(ruled))));
    for (const c of [gm, alice, bob]) expect(lastRoll(c)).toMatchObject({ verdict: "hit", attack: { kind: "toHit" } });
    expect(alice.state).toEqual(bob.state);
  });

  it("refuses rulings and damage from players (FR-GM-15)", async () => {
    const { gm, alice, aria, goblin } = await setup();
    const rolled = await alice.command({ type: "dice.roll", expression: "1d8", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, kind: "damage" } });
    await alice.waitForSeq(seqOf(rolled));
    const rollId = lastRoll(alice).id;
    expect(await alice.command({ type: "roll.rule", rollId, verdict: "hit" })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await alice.command({ type: "roll.applyDamage", rollId })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(gm.state.tokens[goblin.id]?.stats.hp).toBe(15);
  });

  it("applies damage once, from the server's current HP", async () => {
    const { gm, alice, bob, aria, goblin } = await setup();
    const rolled = await alice.command({ type: "dice.roll", expression: "1d8+3", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, kind: "damage" } });
    await gm.waitForSeq(seqOf(rolled));
    const roll = lastRoll(gm);

    const applied = await gm.command({ type: "roll.applyDamage", rollId: roll.id });
    expect(applied).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(applied))));
    for (const c of [gm, alice, bob]) {
      expect(c.state.tokens[goblin.id]?.stats.hp).toBe(15 - roll.total);
      expect(lastRoll(c).damageApplied).toBe(true);
    }

    expect(await gm.command({ type: "roll.applyDamage", rollId: roll.id })).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.state.tokens[goblin.id]?.stats.hp).toBe(15 - roll.total);
  });

  it("never sends a GM-only roll's ruling to players", async () => {
    const { gm, alice, aria, shadow } = await setup();
    const rolled = await gm.command({ type: "dice.roll", expression: "1d20", visibility: "gm", attack: { actorTokenId: shadow.id, targetTokenId: aria.id } });
    await gm.waitForSeq(seqOf(rolled));
    const rollId = lastRoll(gm).id;
    const ruled = await gm.command({ type: "roll.rule", rollId, verdict: "hit" });
    await alice.waitForSeq(seqOf(ruled));

    const traffic = alice.rawLog.join("\n");
    expect(traffic).not.toContain("RollRuled");
    expect(traffic).not.toContain(rollId);
  });

  it("never sends a hidden target's id, name or HP when damage is applied to it", async () => {
    const { gm, alice, aria, shadow } = await setup();
    const rolled = await gm.command({ type: "dice.roll", expression: "1d8+3", attack: { actorTokenId: aria.id, targetTokenId: shadow.id, kind: "damage" } });
    await gm.waitForSeq(seqOf(rolled));
    const applied = await gm.command({ type: "roll.applyDamage", rollId: lastRoll(gm).id });
    await alice.waitForSeq(seqOf(applied));

    expect(lastRoll(alice)).toMatchObject({ attack: { target: null } });
    expect(lastRoll(alice)).not.toHaveProperty("damageApplied");
    expect(gm.state.tokens[shadow.id]?.stats.hp).toBeLessThan(20);
    const traffic = alice.rawLog.join("\n");
    expect(traffic).not.toContain(shadow.id);
    expect(traffic).not.toContain("Shadow Lurker");
    expect(traffic).not.toContain("TokenStatsSet");
  });

  it("never ties an applied roll to a hidden target revealed before applying", async () => {
    const { gm, alice, aria, shadow } = await setup();
    const rolled = await gm.command({ type: "dice.roll", expression: "1d8+3", attack: { actorTokenId: aria.id, targetTokenId: shadow.id, kind: "damage" } });
    await gm.waitForSeq(seqOf(rolled));
    const rollId = lastRoll(gm).id;
    await gm.command({ type: "token.setHidden", tokenId: shadow.id, hidden: false });
    const applied = await gm.command({ type: "roll.applyDamage", rollId });
    await alice.waitForSeq(seqOf(applied));

    expect(alice.state.rolls.find((r) => r.id === rollId)).toMatchObject({ attack: { target: null } });
    expect(alice.state.rolls.find((r) => r.id === rollId)).not.toHaveProperty("damageApplied");
    expect(alice.rawLog.join("\n")).not.toContain("RollDamageApplied");
  });
});
