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
  await gm.command({ type: "token.create", name: "Goblin 2", position: { x: 175, y: 35 } });
  await gm.command({ type: "token.create", name: "Shadow Lurker", position: { x: 315, y: 35 }, hidden: true });
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
  return { gm, alice, bob, aria: byName("Aria"), goblin: byName("Goblin 2"), shadow: byName("Shadow Lurker") };
}

const lastRoll = (c: TestClient) => c.state.rolls.filter(isDiceRoll).at(-1);

describe("attack rolls over the wire (FR-TAC-09, FR-GM-23, ADR 0010)", () => {
  it("shows a player's attack with names to everyone", async () => {
    const { gm, alice, bob, aria, goblin } = await setup();

    const res = await alice.command({ type: "dice.roll", expression: "1d20+5", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, label: "Longsword" } });
    expect(res).toMatchObject({ type: "ack" });
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq((res as { seq: number }).seq)));
    expect(alice.state).toEqual(bob.state);
    for (const c of [gm, alice, bob]) {
      expect(lastRoll(c)?.attack).toEqual({
        actor: { tokenId: aria.id, name: "Aria", hidden: false },
        target: { tokenId: goblin.id, name: "Goblin 2", hidden: false },
        label: "Longsword",
        kind: "toHit",
      });
    }
  });

  it("rejects a forged attack with another player's token (FR-GM-15)", async () => {
    const { bob, aria, goblin } = await setup();
    const before = bob.seq;
    expect(await bob.command({ type: "dice.roll", expression: "1d20", attack: { actorTokenId: aria.id, targetTokenId: goblin.id } }))
      .toMatchObject({ type: "rejected", code: "forbidden" });
    expect(bob.seq).toBe(before);
  });

  it("never sends a hidden attacker's ID or name to players", async () => {
    const { gm, alice, bob, aria, shadow } = await setup();

    const res = await gm.command({ type: "dice.roll", expression: "1d20+4", attack: { actorTokenId: shadow.id, targetTokenId: aria.id, label: "Claws" } });
    expect(res).toMatchObject({ type: "ack" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq((res as { seq: number }).seq)));

    expect(alice.state).toEqual(bob.state);
    expect(lastRoll(alice)?.attack).toEqual({ actor: null, target: { tokenId: aria.id, name: "Aria", hidden: false }, label: "Claws", kind: "toHit" });
    expect(lastRoll(gm)?.attack?.actor?.name).toBe("Shadow Lurker");
    const playerTraffic = alice.rawLog.join("\n");
    expect(playerTraffic).not.toContain(shadow.id);
    expect(playerTraffic).not.toContain("Shadow Lurker");
  });

  it("never sends a hidden target's ID or name to players", async () => {
    const { gm, alice, aria, shadow } = await setup();
    const res = await gm.command({ type: "dice.roll", expression: "1d20", attack: { actorTokenId: aria.id, targetTokenId: shadow.id } });
    await alice.waitForSeq((res as { seq: number }).seq);
    expect(lastRoll(alice)?.attack?.target).toBeNull();
    expect(alice.rawLog.join("\n")).not.toContain(shadow.id);
    expect(alice.rawLog.join("\n")).not.toContain("Shadow Lurker");
  });

  it("strips a target from players' rolls once the GM hides it", async () => {
    const { gm, alice, aria, goblin } = await setup();
    const rolled = await alice.command({ type: "dice.roll", expression: "1d20", attack: { actorTokenId: aria.id, targetTokenId: goblin.id } });
    await alice.waitForSeq((rolled as { seq: number }).seq);
    expect(lastRoll(alice)?.attack?.target?.name).toBe("Goblin 2");

    await gm.command({ type: "token.setHidden", tokenId: goblin.id, hidden: true });
    await alice.waitForSeq(gm.seq);
    expect(lastRoll(alice)?.attack?.target).toBeNull();
    expect(lastRoll(gm)?.attack?.target?.name).toBe("Goblin 2");
  });
});
