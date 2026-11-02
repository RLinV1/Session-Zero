import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isGroupRoll, type Token } from "@vtt/shared";
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

/** A GM, Alice and Bob; Goblin 1 and Goblin 2 (7 HP each) and a hidden Assassin (20 HP). */
async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  const bob = await server.connect(bobCreds);
  clients.push(gm, alice, bob);

  await gm.command({ type: "token.create", name: "Goblin 1", position: { x: 35, y: 35 }, stats: { hp: 7, maxHp: 7, ac: 12 } });
  await gm.command({ type: "token.create", name: "Goblin 2", position: { x: 105, y: 35 }, stats: { hp: 7, maxHp: 7, ac: 12 } });
  await gm.command({ type: "token.create", name: "Assassin", position: { x: 175, y: 35 }, hidden: true, stats: { hp: 20, maxHp: 20, ac: 15 } });
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
  return { gm, alice, bob, aliceCreds, one: byName("Goblin 1"), two: byName("Goblin 2"), assassin: byName("Assassin") };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;

describe("Area Effect over the wire (FR-TAC-06, FR-TAC-09, ADR 0046)", () => {
  it("runs the whole flow: start, call, reassign, per-target damage, resolve", async () => {
    const { gm, alice, bob, one, two, assassin } = await setup();
    expect(await gm.command({ type: "areaEffect.start", tokenIds: [one.id, two.id, assassin.id], expression: "1d20+2", label: "Fireball" })).toMatchObject({ type: "ack" });
    const effectId = gm.state.areaEffect!.id;

    const called = await gm.command({ type: "areaEffect.call", effectId, participantId: alice.participantId });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(called))));
    expect(alice.state.areaEffect?.call).toEqual({ participantId: alice.participantId });

    // Called by mistake: the call moves to Bob, and Alice's prompt goes with it.
    const moved = await gm.command({ type: "areaEffect.call", effectId, participantId: bob.participantId });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(moved))));
    expect(alice.state.areaEffect?.call).toEqual({ participantId: bob.participantId });
    expect(await alice.command({ type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" })).toMatchObject({ type: "rejected", code: "forbidden" });

    const rolled = await bob.command({ type: "areaEffect.rollDamage", effectId, expression: "2d6", mode: "perTarget" });
    expect(rolled).toMatchObject({ type: "ack" });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(rolled))));
    const damage = gm.state.areaEffect!.damage!;
    if (damage.mode !== "perTarget") throw new Error("expected per-target damage");
    expect(damage.results).toHaveLength(3);
    const dealt = (id: string) => damage.results.find((r) => r.tokenId === id)!.total;

    const resolved = await gm.command({
      type: "areaEffect.resolve",
      effectId,
      rows: [
        { tokenId: one.id, amount: dealt(one.id), addConditions: ["prone"] },
        { tokenId: two.id, amount: Math.floor(dealt(two.id) / 2), addConditions: [] },
        { tokenId: assassin.id, amount: 0, addConditions: [] },
      ],
    });
    expect(resolved).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(resolved))));
    for (const c of [gm, alice, bob]) {
      expect(c.state.areaEffect).toBeNull();
      expect(c.state.tokens[one.id]?.stats.hp).toBe(7 - dealt(one.id));
      expect(c.state.tokens[two.id]?.stats.hp).toBe(7 - Math.floor(dealt(two.id) / 2));
      expect(c.state.tokens[one.id]?.conditions).toEqual(["prone"]);
    }
    expect(gm.state.tokens[assassin.id]?.stats.hp).toBe(20);
    expect(alice.state).toEqual(bob.state);
  });

  it("never sends a hidden target, a save or its damage to a player, live or on reconnect (FR-GM-23)", async () => {
    const { gm, alice, aliceCreds, one, assassin } = await setup();
    await gm.command({ type: "areaEffect.start", tokenIds: [one.id, assassin.id], expression: "1d20+2", label: "Fireball" });
    const effectId = gm.state.areaEffect!.id;
    const called = await gm.command({ type: "areaEffect.call", effectId, participantId: alice.participantId });
    await alice.waitForSeq(seqOf(called));
    expect(alice.state.areaEffect?.targets.map((t) => t.name)).toEqual(["Goblin 1"]);
    expect(alice.state.areaEffect?.targets[0]?.roll).toBeNull();

    const rolled = await alice.command({ type: "areaEffect.rollDamage", effectId, expression: "2d6", mode: "perTarget" });
    await gm.waitForSeq(seqOf(rolled));
    alice.close();
    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(again.state.areaEffect?.targets).toHaveLength(1);

    const resolved = await gm.command({
      type: "areaEffect.resolve",
      effectId,
      rows: [{ tokenId: one.id, amount: 3, addConditions: [] }, { tokenId: assassin.id, amount: 9, addConditions: ["prone"] }],
    });
    await again.waitForSeq(seqOf(resolved));
    const traffic = [...alice.rawLog, ...again.rawLog].join("\n");
    expect(traffic).not.toContain(assassin.id);
    expect(traffic).not.toContain("Assassin");
    expect(again.state.tokens[one.id]?.stats.hp).toBe(4);
  });

  it("tells players nothing of an effect on hidden tokens only, and only visible targets' amounts", async () => {
    const { gm, alice, one, assassin } = await setup();
    await gm.command({ type: "areaEffect.start", tokenIds: [assassin.id], expression: "1d20", label: "Poison gas" });
    const gas = gm.state.areaEffect!.id;
    const closed = await gm.command({ type: "areaEffect.close", effectId: gas });
    await alice.waitForSeq(seqOf(closed));
    expect(alice.state.areaEffect).toBeNull();

    await gm.command({ type: "areaEffect.start", tokenIds: [one.id], expression: "1d20" });
    await gm.command({ type: "areaEffect.close", effectId: gm.state.areaEffect!.id });
    await gm.command({ type: "areaEffect.start", tokenIds: [one.id, assassin.id], expression: "1d20" });
    const resolved = await gm.command({ type: "areaEffect.resolve", effectId: gm.state.areaEffect!.id, rows: [{ tokenId: one.id, amount: 3, addConditions: [] }, { tokenId: assassin.id, amount: 11, addConditions: [] }] });
    await alice.waitForSeq(seqOf(resolved));
    const traffic = alice.rawLog.join("\n");
    expect(traffic).not.toContain("Poison gas");
    // The damage number for the goblin she can see, and nothing of the assassin's.
    expect(traffic).toContain(`{"tokenId":"${one.id}","amount":3}`);
    expect(traffic).not.toContain('"amount":11');
    expect(alice.state.tokens[one.id]?.stats.hp).toBe(4);
  });

  it("accepts exactly one of a takeover and the caller's roll sent together", async () => {
    for (let i = 0; i < 5; i++) {
      const { gm, alice, one } = await setup();
      await gm.command({ type: "areaEffect.start", tokenIds: [one.id], expression: "1d20" });
      const effectId = gm.state.areaEffect!.id;
      const called = await gm.command({ type: "areaEffect.call", effectId, participantId: alice.participantId });
      await alice.waitForSeq(seqOf(called));

      const [takeover, roll] = await Promise.all([
        gm.command({ type: "areaEffect.call", effectId, participantId: gm.participantId }),
        alice.command({ type: "areaEffect.rollDamage", effectId, expression: "8d6", mode: "single" }),
      ]);
      expect([takeover.type, roll.type].filter((t) => t === "ack")).toHaveLength(1);
      clients.splice(0).forEach((c) => c.close());
    }
  });
});

describe("Group rolls over the wire (FR-TAC-09, FR-GM-22, ADR 0046)", () => {
  it("shows a public group roll to players without its hidden tokens", async () => {
    const { gm, alice, one, two, assassin } = await setup();
    const rolled = await gm.command({ type: "dice.rollGroup", tokenIds: [one.id, two.id, assassin.id], expression: "1d20", label: "Dex save" });
    await alice.waitForSeq(seqOf(rolled));
    const seen = alice.state.rolls.filter(isGroupRoll).at(-1)!;
    expect(seen.entries.map((e) => e.name)).toEqual(["Goblin 1", "Goblin 2"]);
    expect(gm.state.rolls.filter(isGroupRoll).at(-1)!.entries).toHaveLength(3);
    expect(alice.rawLog.join("")).not.toContain(assassin.id);
    expect(await alice.command({ type: "dice.rollGroup", tokenIds: [one.id], expression: "1d20" })).toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("never sends a GM-only group roll to players", async () => {
    const { gm, alice, one } = await setup();
    const rolled = await gm.command({ type: "dice.rollGroup", tokenIds: [one.id], expression: "1d20", label: "Secret save", visibility: "gm" });
    await alice.waitForSeq(seqOf(rolled));
    expect(alice.state.rolls.filter(isGroupRoll)).toHaveLength(0);
    expect(alice.rawLog.join("")).not.toContain("Secret save");
  });
});
