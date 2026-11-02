import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDiceRoll, type ServerMessage, type Token } from "@vtt/shared";
import { startServer, type TestClient, viewFor } from "./helpers";

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
  return { gm, alice, bob, gmCreds, aliceCreds, bobCreds };
}

const tokens = (c: TestClient) => Object.values(c.state.tokens) as Token[];

describe("committed channel", () => {
  it("synchronizes full GM token setup and later appearance edits to every client (KAN-12)", async () => {
    const { gm, alice, bob } = await setup();
    const created = await gm.command({
      type: "token.create", name: "Ogre", position: { x: 120, y: 240 },
      size: 2, rotation: 45, imageUrl: "/uploads/ogre.webp",
      stats: { hp: 30, maxHp: 40, ac: 14 },
    });
    expect(created.type).toBe("ack");
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    const tokenId = tokens(gm)[0]!.id;
    expect(tokens(alice)[0]).toEqual(tokens(gm)[0]);
    expect(tokens(bob)[0]).toEqual(tokens(gm)[0]);

    const edited = await gm.command({ type: "token.setAppearance", tokenId, name: "Elder Ogre", size: 3, rotation: 90 });
    expect(edited.type).toBe("ack");
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    for (const client of [gm, alice, bob]) {
      expect(client.state.tokens[tokenId]).toMatchObject({ name: "Elder Ogre", size: 3, rotation: 90 });
      expect(client.state).toEqual(viewFor(gm.state, client));
    }
    expect(await alice.command({ type: "token.setAppearance", tokenId, name: "Changed", size: 1, rotation: 0 }))
      .toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("converges all clients on the same state after an owner moves a token (FR-SYNC-01/02)", async () => {
    const { gm, alice, bob } = await setup();

    const created = await gm.command({
      type: "token.create",
      name: "Fighter",
      position: { x: 35, y: 35 },
      ownerIds: [alice.participantId],
    });
    expect(created.type).toBe("ack");

    await alice.waitForSeq(gm.seq);
    const tokenId = tokens(alice)[0]!.id;
    const moved = await alice.command({ type: "token.move", tokenId, to: { x: 105, y: 35 } });
    expect(moved).toMatchObject({ type: "ack" });

    const finalSeq = (moved as { seq: number }).seq;
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(finalSeq)));
    for (const c of [gm, alice, bob]) {
      expect(c.state.tokens[tokenId]!.position).toEqual({ x: 105, y: 35 });
      expect(c.state).toEqual(viewFor(gm.state, c));
    }
  });

  it("rejects moving a token you don't own and changes nothing (FR-GM-15)", async () => {
    const { gm, alice, bob } = await setup();
    await gm.command({ type: "token.create", name: "Fighter", position: { x: 0, y: 0 }, ownerIds: [alice.participantId] });
    await bob.waitForSeq(gm.seq);
    const seqBefore = gm.seq;

    const res = await bob.command({ type: "token.move", tokenId: tokens(bob)[0]!.id, to: { x: 999, y: 999 } });
    expect(res).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(gm.seq).toBe(seqBefore);
  });

  it("assigns gap-free, strictly increasing seqs to concurrent commands (FR-SYNC-04)", async () => {
    const { gm, alice, bob } = await setup();
    await gm.command({ type: "token.create", name: "A", position: { x: 0, y: 0 }, ownerIds: [alice.participantId] });
    await gm.command({ type: "token.create", name: "B", position: { x: 0, y: 0 }, ownerIds: [bob.participantId] });
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
    const a = tokens(alice).find((t) => t.name === "A")!;
    const b = tokens(bob).find((t) => t.name === "B")!;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2
          ? alice.command({ type: "token.move", tokenId: a.id, to: { x: i, y: i } })
          : bob.command({ type: "token.move", tokenId: b.id, to: { x: i, y: i } }),
      ),
    );
    const seqs = results.map((r) => (r as { seq: number }).seq).sort((x, y) => x - y);
    expect(new Set(seqs).size).toBe(20);
    expect(seqs.at(-1)! - seqs[0]!).toBe(19);

    const last = seqs.at(-1)!;
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(last)));
    expect(alice.state).toEqual(viewFor(gm.state, alice));
    expect(bob.state).toEqual(viewFor(gm.state, bob));
  });
});

describe("visibility (FR-GM-16, FR-GM-23)", () => {
  it("never sends hidden tokens to players, and resyncs them on reveal", async () => {
    const { gm, alice } = await setup();
    const res = await gm.command({ type: "token.create", name: "Secret Ogre", position: { x: 0, y: 0 }, hidden: true });
    expect(res.type).toBe("ack");
    await alice.waitForSeq(gm.seq);

    expect(tokens(alice)).toHaveLength(0);
    expect(alice.rawLog.some((raw) => raw.includes("Secret Ogre"))).toBe(false);

    const ogre = tokens(gm)[0]!;
    await gm.command({ type: "token.setHidden", tokenId: ogre.id, hidden: false });
    await alice.waitFor((m) => m.type === "welcome");
    expect(tokens(alice).map((t) => t.name)).toEqual(["Secret Ogre"]);
  });

  it("applies a token edit together and hides secret changes before broadcasting (KAN-12)", async () => {
    const { gm, alice } = await setup();
    await gm.command({ type: "token.create", name: "Guard", position: { x: 0, y: 0 } });
    await alice.waitForSeq(gm.seq);
    const tokenId = tokens(gm)[0]!.id;
    const before = gm.seq;

    const rejected = await gm.command({ type: "token.configure", tokenId, changes: {
      name: "Assassin", position: { x: 900, y: 600 }, hidden: true,
      stats: { hp: 20, maxHp: 10, ac: 12 },
    } });
    expect(rejected).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.seq).toBe(before);
    expect(gm.state.tokens[tokenId]).toMatchObject({ name: "Guard", position: { x: 0, y: 0 }, hidden: false });

    const saved = await gm.command({ type: "token.configure", tokenId, changes: {
      name: "Assassin", position: { x: 900, y: 600 }, hidden: true,
      imageUrl: "/uploads/assassin.webp", assetId: null,
      stats: { hp: 20, maxHp: 30, ac: 12 },
    } });
    expect(saved.type).toBe("ack");
    await alice.waitForSeq(gm.seq);
    expect(tokens(alice)).toHaveLength(0);
    const playerTraffic = alice.rawLog.join("\n");
    expect(playerTraffic).not.toContain("Assassin");
    expect(playerTraffic).not.toContain("assassin.webp");
    expect(playerTraffic).not.toContain('"x":900');
    expect(playerTraffic).not.toContain('"y":600');

    const revealed = await gm.command({ type: "token.configure", tokenId, changes: { hidden: false } });
    expect(revealed.type).toBe("ack");
    await alice.waitForSeq(gm.seq);
    expect(alice.state.tokens[tokenId]).toEqual(gm.state.tokens[tokenId]);
  });
});

describe("reconnect (FR-PL-02, FR-PL-05, FR-PL-06)", () => {
  it("rebinds the same identity and ownership and catches up on missed events", async () => {
    const { gm, alice, aliceCreds } = await setup();
    await gm.command({ type: "token.create", name: "Fighter", position: { x: 0, y: 0 }, ownerIds: [alice.participantId] });
    const originalId = alice.participantId;
    alice.close();

    // Things happen while Alice is offline.
    const tokenId = tokens(gm)[0]!.id;
    await gm.command({ type: "token.move", tokenId, to: { x: 70, y: 70 } });

    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(again.participantId).toBe(originalId);
    expect(again.seq).toBe(gm.seq);
    expect(again.state.tokens[tokenId]!.position).toEqual({ x: 70, y: 70 });
    expect(await again.command({ type: "token.move", tokenId, to: { x: 0, y: 0 } })).toMatchObject({ type: "ack" });
  });

  it("keeps the GM as GM after a reconnect, even if players joined meanwhile", async () => {
    const gmCreds = await server.createRoom();
    const gm = await server.connect(gmCreds);
    gm.close();

    await server.join(gmCreds.inviteCode, "Alice");
    await server.join(gmCreds.inviteCode, "Bob");

    const again = await server.connect(gmCreds);
    clients.push(again);
    expect(again.participantId).toBe(gmCreds.participantId);
    expect(again.state.participants[again.participantId]!.role).toBe("gm");
    expect(await again.command({ type: "token.create", name: "Ogre", position: { x: 0, y: 0 } })).toMatchObject({
      type: "ack",
    });
  });

  it("refuses a handshake with a bad guest token (FR-GM-15)", async () => {
    const { gmCreds } = await setup();
    await expect(
      server.connect({ ...gmCreds, guestToken: server.newGuestToken() }),
    ).rejects.toThrow(/unauthorized/);
  });
});

describe("tactical panels (FR-GM-21, FR-GM-22, FR-TAC-07)", () => {
  it("never sends a GM-only roll to a player, over the real wire (FR-GM-22)", async () => {
    const { gm, alice } = await setup();

    const rolled = await gm.command({ type: "dice.roll", expression: "1d20+7", visibility: "gm" });
    expect(rolled.type).toBe("ack");
    await alice.waitForSeq(gm.seq);

    expect(gm.state.rolls).toHaveLength(1);
    expect(alice.state.rolls).toHaveLength(0);

    // The strongest form of the assertion: the result never appeared in any byte Alice got.
    const secret = String(gm.state.rolls.filter(isDiceRoll)[0]!.total);
    const dice = String(gm.state.rolls.filter(isDiceRoll)[0]!.dice[0]);
    const seen = alice.rawLog.join("");
    expect(seen).not.toContain(`"total":${secret}`);
    expect(seen).not.toContain(`"dice":[${dice}]`);
  });

  it("shares a public roll with everyone, with identical results (FR-TAC-09)", async () => {
    const { gm, alice, bob } = await setup();

    await alice.command({ type: "dice.roll", expression: "2d6+3" });
    await gm.waitForSeq(alice.seq);
    await bob.waitForSeq(alice.seq);

    expect(alice.state.rolls).toHaveLength(1);
    // Everyone sees the server's roll, not their own — convergence applies to dice too.
    expect(bob.state.rolls).toEqual(alice.state.rolls);
    expect(gm.state.rolls).toEqual(alice.state.rolls);
    expect(alice.state.rolls[0]!.expression).toBe("2d6+3");
  });

  it("keeps hidden tokens out of the turn order a player receives (FR-GM-21)", async () => {
    const { gm, alice } = await setup();

    const open = await gm.command({
      type: "token.create", name: "Guard", position: { x: 35, y: 35 }, ownerIds: [],
    });
    const secret = await gm.command({
      type: "token.create", name: "Ambusher", position: { x: 105, y: 35 }, ownerIds: [], hidden: true,
    });
    expect(open.type).toBe("ack");
    expect(secret.type).toBe("ack");
    await alice.waitForSeq(gm.seq);

    const ids = Object.keys(gm.state.tokens);
    await gm.command({
      type: "initiative.start",
      entries: ids.map((tokenId, i) => ({ tokenId, score: 20 - i })),
    });
    await alice.waitForSeq(gm.seq);

    expect(gm.state.initiative!.order).toHaveLength(2);
    expect(alice.state.initiative!.order).toHaveLength(1);
    expect(alice.rawLog.join("")).not.toContain("Ambusher");
  });

  it("saves initiative scores on tokens, across the encounter and a reconnect, without leaking hidden ones (ADR 0022)", async () => {
    const { gm, alice, gmCreds } = await setup();
    await gm.command({ type: "token.create", name: "Guard", position: { x: 35, y: 35 }, ownerIds: [] });
    await gm.command({ type: "token.create", name: "Ambusher", position: { x: 105, y: 35 }, ownerIds: [], hidden: true });
    await alice.waitForSeq(gm.seq);
    const byName = (c: TestClient, name: string) => tokens(c).find((t) => t.name === name);
    const guard = byName(gm, "Guard")!;
    const ambusher = byName(gm, "Ambusher")!;

    await gm.command({
      type: "initiative.start",
      entries: [{ tokenId: guard.id, score: 14 }, { tokenId: ambusher.id, score: 19 }],
    });
    await gm.command({ type: "initiative.end" });
    await alice.waitForSeq(gm.seq);

    expect(byName(gm, "Guard")!.initiative).toBe(14);
    expect(byName(gm, "Ambusher")!.initiative).toBe(19);
    expect(byName(alice, "Guard")!.initiative).toBe(14);
    expect(byName(alice, "Ambusher")).toBeUndefined();
    expect(alice.rawLog.join("")).not.toContain("Ambusher");
    expect(alice.rawLog.join("")).not.toContain('"initiative":19');

    // A fresh connection (a reload) still sees the saved scores.
    const again = await server.connect(gmCreds);
    clients.push(again);
    expect(byName(again, "Guard")!.initiative).toBe(14);
    expect(byName(again, "Ambusher")!.initiative).toBe(19);
  });

  it("lets an owner set their token's stats but refuses a stranger (FR-TAC-07)", async () => {
    const { gm, alice, bob } = await setup();

    const created = await gm.command({
      type: "token.create", name: "Rogue", position: { x: 35, y: 35 }, ownerIds: [alice.participantId],
    });
    expect(created.type).toBe("ack");
    await alice.waitForSeq(gm.seq);
    const tokenId = Object.keys(alice.state.tokens)[0]!;

    const mine = await alice.command({
      type: "token.setStats", tokenId, stats: { hp: 12, maxHp: 20, ac: 15 },
    });
    expect(mine.type).toBe("ack");

    const theirs = await bob.command({
      type: "token.setStats", tokenId, stats: { hp: 1, maxHp: 20, ac: 15 },
    });
    expect(theirs).toMatchObject({ type: "rejected", code: "forbidden" });

    await bob.waitForSeq(alice.seq);
    expect(bob.state.tokens[tokenId]!.stats).toEqual({ hp: 12, maxHp: 20, ac: 15 });
  });
});

describe("unique display names (KAN-61)", () => {
  const names = (c: TestClient) => Object.values(c.state.participants).map((p) => p.displayName);

  it("rejects a duplicate join with 409 and leaves the room unchanged", async () => {
    const gmCreds = await server.createRoom();
    await server.join(gmCreds.inviteCode, "Raymond");
    const dup = await server.tryJoin(gmCreds.inviteCode, "raymond ");
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already taken/);

    const gm = await server.connect(gmCreds);
    clients.push(gm);
    expect(names(gm).filter((n) => n === "Raymond")).toHaveLength(1);
    expect(names(gm)).toHaveLength(2);
  });

  it("leaves no usable credential behind for a rejected join", async () => {
    const gmCreds = await server.createRoom();
    await server.join(gmCreds.inviteCode, "Raymond");
    const dup = await server.tryJoin(gmCreds.inviteCode, "Raymond");
    await expect(server.connect({ roomId: gmCreds.roomId, guestToken: dup.guestToken })).rejects.toThrow(
      /unauthorized/,
    );
  });

  it("lets exactly one of two racing joins take the same name", async () => {
    const gmCreds = await server.createRoom();
    const results = await Promise.all([
      server.tryJoin(gmCreds.inviteCode, "Sam"),
      server.tryJoin(gmCreds.inviteCode, "sam"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

    const gm = await server.connect(gmCreds);
    clients.push(gm);
    expect(names(gm).filter((n) => n.toLowerCase() === "sam")).toHaveLength(1);
  });

  it("stores a trimmed name and rejects a blank one with 400", async () => {
    const gmCreds = await server.createRoom();
    const joined = await server.join(gmCreds.inviteCode, "  Raymond  ");
    const client = await server.connect(joined);
    clients.push(client);
    expect(client.state.participants[joined.participantId]!.displayName).toBe("Raymond");
    expect((await server.tryJoin(gmCreds.inviteCode, "   ")).status).toBe(400);
  });

  it("allows the same name in a different room", async () => {
    const roomA = await server.createRoom();
    const roomB = await server.createRoom();
    await server.join(roomA.inviteCode, "Raymond");
    expect((await server.tryJoin(roomB.inviteCode, "Raymond")).status).toBe(200);
  });

  it("rejects a rename to a taken name without emitting an event", async () => {
    const { gm, bob } = await setup();
    const seq = gm.seq;
    expect(await bob.command({ type: "participant.rename", displayName: "ALICE" })).toMatchObject({
      type: "rejected",
      code: "invalid",
    });
    expect(bob.seq).toBe(seq);
    expect(bob.state.participants[bob.participantId]!.displayName).toBe("Bob");
  });

  it("lets a returning guest reconnect with their own name", async () => {
    const { aliceCreds, alice } = await setup();
    alice.close();
    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(again.state.participants[again.participantId]!.displayName).toBe("Alice");
  });
});

describe("unique token names (KAN-62)", () => {
  it("numbers two concurrent creates of the same name instead of duplicating it", async () => {
    const { gm, alice } = await setup();
    const goblin = { type: "token.create" as const, name: "Goblin", position: { x: 0, y: 0 } };
    const results = await Promise.all([gm.command(goblin), gm.command(goblin)]);
    expect(results.map((r) => r.type)).toEqual(["ack", "ack"]);

    await alice.waitForSeq(gm.seq);
    for (const c of [gm, alice]) expect(tokens(c).map((t) => t.name).sort()).toEqual(["Goblin", "Goblin 2"]);
  });

  it("rejects a whitespace-only name and appends nothing", async () => {
    const { gm } = await setup();
    const seqBefore = gm.seq;
    const res = await gm.command({ type: "token.create", name: "   ", position: { x: 0, y: 0 } });
    expect(res).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.seq).toBe(seqBefore);
    expect(tokens(gm)).toEqual([]);
  });
});

describe("dice drops (ADR 0014, FR-TAC-09)", () => {
  async function withMap() {
    const room = await setup();
    await room.gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
    await room.alice.waitForSeq(room.gm.seq);
    await room.bob.waitForSeq(room.gm.seq);
    return room;
  }
  const drop = { type: "diceDrop" as const, expression: "2d6", from: { x: 100, y: 120 }, to: { x: 300, y: 160 } };

  it("relays a drop to everyone else, unsequenced and unpersisted", async () => {
    const { alice, bob, gm } = await withMap();
    const seqBefore = alice.seq;
    alice.send({ type: "ephemeral", payload: drop });
    const got = await bob.waitFor((m) => m.type === "ephemeral");
    expect(got).toEqual({ type: "ephemeral", from: alice.participantId, payload: drop });
    await gm.waitFor((m) => m.type === "ephemeral");
    // No seq, nothing in room state: the next command still gets the very next seq.
    const ack = await alice.command({ type: "dice.roll", expression: "2d6" });
    expect(ack.type === "ack" && ack.seq).toBe(seqBefore + 1);
  });

  it("delivers drops sent back to back, which a volatile relay would lose", async () => {
    const { alice, bob } = await withMap();
    const second = { ...drop, from: { x: 500, y: 500 }, to: { x: 520, y: 510 } };
    alice.send({ type: "ephemeral", payload: drop });
    alice.send({ type: "ephemeral", payload: second });
    // Each wait takes the next ephemeral message off bob's inbox.
    const first = await bob.waitFor((m) => m.type === "ephemeral");
    const next = await bob.waitFor((m) => m.type === "ephemeral");
    expect([first, next].map((m) => m.type === "ephemeral" && m.payload)).toEqual([drop, second]);
  });

  it("drops a drop that is off the map", async () => {
    const { alice, bob } = await withMap();
    alice.send({ type: "ephemeral", payload: { ...drop, to: { x: 5000, y: 160 } } });
    alice.send({ type: "ephemeral", payload: { type: "ping", at: { x: 1, y: 1 } } });
    // The ping sent after it arrives; the forged drop never does.
    const first = await bob.waitFor((m) => m.type === "ephemeral");
    expect(first.type === "ephemeral" && first.payload.type).toBe("ping");
  });
});

describe("target pings (KAN-34, FR-TAC-05)", () => {
  const isEphemeral = (m: ServerMessage): m is Extract<ServerMessage, { type: "ephemeral" }> => m.type === "ephemeral";
  const ping = (x: number, y = 10) => ({ type: "ping" as const, at: { x, y } });
  async function withMap() {
    const room = await setup();
    await room.gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
    await room.alice.waitForSeq(room.gm.seq);
    await room.bob.waitForSeq(room.gm.seq);
    return room;
  }

  it("shows a ping to the GM and the other player, never back to the sender", async () => {
    const { gm, alice, bob } = await withMap();
    alice.send({ type: "ephemeral", payload: ping(100) });
    expect(await gm.waitFor(isEphemeral)).toEqual({ type: "ephemeral", from: alice.participantId, payload: ping(100) });
    expect(await bob.waitFor(isEphemeral)).toEqual({ type: "ephemeral", from: alice.participantId, payload: ping(100) });
    bob.send({ type: "ephemeral", payload: ping(200) });
    expect((await alice.waitFor(isEphemeral)).from).toBe(bob.participantId);
    await expect(bob.waitFor(isEphemeral, 200)).rejects.toThrow(/Timed out/);
  });

  it("is never persisted: no seq, nothing in a fresh snapshot or the activity log", async () => {
    const { gm, alice, bob, bobCreds, gmCreds } = await withMap();
    const seqBefore = alice.seq;
    alice.send({ type: "ephemeral", payload: ping(321, 123) });
    await bob.waitFor(isEphemeral);
    const ack = await alice.command({ type: "dice.roll", expression: "1d20" });
    expect(ack.type === "ack" && ack.seq).toBe(seqBefore + 1);
    // A reconnecting client starts from a snapshot that carries nothing of it.
    bob.close();
    const again = await server.connect(bobCreds);
    clients.push(again);
    expect(JSON.stringify(again.state)).not.toContain('"ping"');
    expect(again.rawLog.join("\n")).not.toContain('"ping"');
    const history = await fetch(`${server.base}/api/rooms/${gm.state.roomId}/history`, {
      headers: { authorization: `Bearer ${gmCreds.guestToken}` },
    }).then((r) => r.text());
    expect(history).not.toMatch(/ping/i);
  });

  it("drops a ping off the map, or before there is a map", async () => {
    const { gm, alice, bob } = await setup();
    // No map yet: the ping goes nowhere.
    alice.send({ type: "ephemeral", payload: ping(10) });
    // Barrier: Alice's socket is read in order, so once her next command is answered the
    // server has already handled (and dropped) that ping, before the map exists.
    await alice.command({ type: "token.move", tokenId: "00000000-0000-4000-8000-000000000000", to: { x: 1, y: 1 } });
    await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
    await bob.waitForSeq(gm.seq);
    // Off the map: dropped too. The valid ping after it is the first one anyone receives.
    alice.send({ type: "ephemeral", payload: ping(5000) });
    alice.send({ type: "ephemeral", payload: ping(-1) });
    alice.send({ type: "ephemeral", payload: ping(500) });
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(ping(500));
    expect((await gm.waitFor(isEphemeral)).payload).toEqual(ping(500));
  });
});
