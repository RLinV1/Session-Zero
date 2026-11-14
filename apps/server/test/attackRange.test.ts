import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AnimationDef, AttackPreset, LibraryAnimation, ServerMessage, Token } from "@vtt/shared";
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

const d20 = { terms: [{ count: 1, sides: 20 }], modifier: 5 };
const LONGSWORD: AttackPreset = { name: "Longsword", toHit: d20, damage: null, range: { kind: "melee" } };
const LONGBOW: AttackPreset = { name: "Longbow", toHit: d20, damage: null, range: { kind: "ranged", distance: 4321 } };
/** The longbow's distance as a number of its own, not four digits inside a random hex id in the same payload. */
const SECRET_DISTANCE = /(?<![0-9a-f-])4321(?![0-9a-f-])/i;

async function connect(creds: Parameters<typeof server.connect>[0]) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

/** The GM, Aria's owner Alice, and Bob, who owns nothing; a goblin far from Aria. */
async function table() {
  const gmCreds = await server.createRoom();
  const gm = await connect(gmCreds);
  const alice = await connect(await server.join(gmCreds.inviteCode, "Alice"));
  const bob = await connect(await server.join(gmCreds.inviteCode, "Bob"));
  await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [alice.participantId] });
  await gm.command({ type: "token.create", name: "Goblin", position: { x: 35 + 70 * 10, y: 35 } });
  const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
  await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
  return { gm, alice, bob, aria: byName("Aria"), goblin: byName("Goblin") };
}

const rolled = (m: ServerMessage): m is Extract<ServerMessage, { type: "event" }> => m.type === "event" && m.committed.event.type === "DiceRolled";

describe("attack range over the wire (attack-range)", () => {
  it("saves a range to the GM's and owners' devices only", async () => {
    const { gm, alice, bob, aria } = await table();
    expect(await gm.command({ type: "token.configure", tokenId: aria.id, changes: { attacks: [LONGSWORD, LONGBOW] } })).toMatchObject({ type: "ack" });
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
    expect(gm.state.tokens[aria.id]!.attacks?.map((a) => a.range)).toEqual([{ kind: "melee" }, { kind: "ranged", distance: 4321 }]);
    expect(alice.state.tokens[aria.id]!.attacks?.[1]?.range).toEqual({ kind: "ranged", distance: 4321 });
    expect(bob.state.tokens[aria.id]!.attacks ?? []).toEqual([]);
    expect(bob.rawLog.join("\n")).not.toMatch(SECRET_DISTANCE);
  });

  it("refuses a range outside the limits", async () => {
    const { gm, aria } = await table();
    const forged = { ...LONGBOW, range: { kind: "ranged", distance: 0 } } as unknown as AttackPreset;
    expect(await gm.command({ type: "token.configure", tokenId: aria.id, changes: { attacks: [forged] } })).toMatchObject({ type: "rejected" });
    expect(gm.state.tokens[aria.id]!.attacks ?? []).toEqual([]);
  });

  it("accepts and broadcasts a roll at a target out of range, carrying only melee or ranged", async () => {
    const { gm, alice, bob, aria, goblin } = await table();
    await gm.command({ type: "token.configure", tokenId: aria.id, changes: { attacks: [LONGSWORD, LONGBOW] } });
    await alice.waitForSeq(gm.seq);
    // The goblin is ten squares away: far out of the longsword's reach.
    const reply = await alice.command({ type: "dice.roll", expression: "1d20+5", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, label: "Longsword", kind: "toHit" } });
    expect(reply).toMatchObject({ type: "ack" });
    const seen = await bob.waitFor(rolled);
    const event = seen.committed.event;
    expect(event.type === "DiceRolled" && event.roll.attack?.range).toBe("melee");

    await alice.command({ type: "dice.roll", expression: "1d20+5", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, label: "Longbow", kind: "toHit" } });
    const bow = await bob.waitFor(rolled);
    expect(bow.committed.event.type === "DiceRolled" && bow.committed.event.roll.attack?.range).toBe("ranged");
    expect(bob.rawLog.join("\n")).not.toMatch(SECRET_DISTANCE);
  });

  it("stores the attack's real kind of range, whatever the client claims", async () => {
    const { gm, alice, aria, goblin } = await table();
    await gm.command({ type: "token.configure", tokenId: aria.id, changes: { attacks: [LONGSWORD] } });
    await alice.waitForSeq(gm.seq);
    const forged = { type: "dice.roll", expression: "1d20", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, label: "Longsword", kind: "toHit", range: "ranged" } };
    expect(await alice.command(forged as never)).toMatchObject({ type: "ack" });
    await gm.waitForSeq(alice.seq);
    const roll = gm.state.rolls.at(-1);
    expect(roll && "attack" in roll ? roll.attack?.range : undefined).toBe("melee");
  });
});

describe("arrow and pierce animations in the library (library-animations)", () => {
  const base = { duration: 1, primary: "#9ca3af", secondary: "#e5e7eb", size: 1.8, particles: 12, glow: 0.4, shake: 0.2, flash: 0.2 };
  it("creates and lists an arrow and a pierce animation", async () => {
    const gm = await server.signUp();
    const arrow: AnimationDef = { ...base, shape: "arrow" };
    const pierce: AnimationDef = { ...base, shape: "pierce" };
    expect((await gm.request("POST", "/api/library/animations", { name: "Heavy bolt", def: arrow })).status).toBe(201);
    expect((await gm.request("POST", "/api/library/animations", { name: "Lunge", def: pierce })).status).toBe(201);
    const listed = await gm.json<LibraryAnimation[]>("GET", "/api/library/animations");
    expect(listed.map((a) => [a.name, a.def.shape]).sort()).toEqual([["Heavy bolt", "arrow"], ["Lunge", "pierce"]]);
  });
});
