import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerMessage } from "@vtt/shared";
import { LiveRoom, type RoomClient } from "../src/domain/liveRoom";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
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

async function connect(creds: Parameters<typeof server.connect>[0]) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

/** GM, Alice (open in two tabs) and Bob; Alice owns Aria and Wolf. */
async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await connect(gmCreds);
  const alice = await connect(aliceCreds);
  const aliceTab2 = await connect(aliceCreds);
  const bob = await connect(bobCreds);
  for (const [i, name] of ["Aria", "Wolf"].entries()) {
    await gm.command({ type: "token.create", name, position: { x: 35 + 70 * i, y: 35 }, ownerIds: [alice.participantId] });
  }
  const tokenId = (name: string) => Object.values(gm.state.tokens).find((t) => t.name === name)!.id;
  return { gm, alice, aliceTab2, bob, gmCreds, aliceCreds, tokenId };
}

describe("leaving the table (KAN-58)", () => {
  it("ends every tab of the leaving seat and leaves everyone else connected", async () => {
    const { gm, alice, aliceTab2, bob } = await setup();
    alice.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });

    for (const tab of [alice, aliceTab2]) {
      expect(await tab.waitFor((m) => m.type === "sessionEnded")).toEqual({ type: "sessionEnded", reason: "left" });
      expect(await tab.disconnected).toBe("io server disconnect");
    }

    await bob.waitForSeq(gm.seq);
    expect(bob.state.participants[alice.participantId]).toMatchObject({ displayName: "Alice", left: true });
    // Bob is still live: his commands go through after Alice left.
    expect(await bob.command({ type: "dice.roll", expression: "1d20" })).toMatchObject({ type: "ack" });
    // Leaving changes no token.
    expect(Object.values(gm.state.tokens).every((t) => t.ownerIds.includes(alice.participantId))).toBe(true);
  });

  it("tells every other client who left and who was removed (FR-PL-06, KAN-73)", async () => {
    const { gm, alice, bob } = await setup();
    alice.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
    await bob.waitFor((m) => m.type === "event" && m.committed.event.type === "ParticipantLeft");
    expect(bob.state.participants[alice.participantId]).toMatchObject({ left: true });
    expect(bob.state.participants[alice.participantId]?.revoked).toBeUndefined();

    await gm.command({ type: "participant.revoke", participantId: bob.participantId });
    expect(gm.state.participants[bob.participantId]).toMatchObject({ revoked: true });
    expect(gm.state.participants[bob.participantId]?.left).toBeUndefined();
  });

  it("refuses the departed credential afterwards", async () => {
    const { alice, aliceCreds } = await setup();
    alice.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
    await alice.disconnected;
    await expect(server.connect(aliceCreds)).rejects.toThrow(/left/);
  });

  it("treats a departed participant as signed out for REST routes", async () => {
    const { alice, aliceCreds } = await setup();
    alice.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
    await alice.disconnected;
    const res = await fetch(`${server.base}/api/rooms/${aliceCreds.roomId}/history`, {
      headers: { authorization: `Bearer ${aliceCreds.guestToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("rejects the GM leaving", async () => {
    const { gm } = await setup();
    const seq = gm.seq;
    expect(await gm.command({ type: "participant.leave" })).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.seq).toBe(seq);
  });

  it("lets a new guest rejoin under the same name as a fresh participant", async () => {
    const { gm, alice, gmCreds } = await setup();
    alice.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
    await alice.disconnected;

    const again = await server.join(gmCreds.inviteCode, "Alice");
    expect(again.participantId).not.toBe(alice.participantId);
    const newAlice = await connect(again);
    expect(Object.values(newAlice.state.tokens).some((t) => t.ownerIds.includes(again.participantId))).toBe(false);
    await gm.waitForSeq(newAlice.seq);
  });

  it("resolves a departure atomically over the wire", async () => {
    const { gm, alice, bob, tokenId } = await setup();
    alice.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
    await gm.waitFor((m) => m.type === "event" && m.committed.event.type === "ParticipantLeft");

    // An invalid target anywhere in the list rejects the whole command.
    const before = gm.seq;
    const bad = await gm.command({
      type: "participant.resolveDeparture",
      participantId: alice.participantId,
      actions: [
        { tokenId: tokenId("Wolf"), action: "delete" },
        { tokenId: tokenId("Aria"), action: "reassign", to: alice.participantId },
      ],
    });
    expect(bad).toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.seq).toBe(before);

    const aria = tokenId("Aria");
    const ok = await gm.command({
      type: "participant.resolveDeparture",
      participantId: alice.participantId,
      actions: [
        { tokenId: aria, action: "reassign", to: bob.participantId },
        { tokenId: tokenId("Wolf"), action: "delete" },
      ],
    });
    expect(ok).toMatchObject({ type: "ack", seq: before + 2 });
    await bob.waitForSeq(before + 2);
    expect(Object.values(bob.state.tokens).map((t) => [t.name, t.ownerIds])).toEqual([["Aria", [bob.participantId]]]);
    expect(bob.state.tokens[aria]!.ownerIds).toEqual([bob.participantId]);
    // No hidden tokens here, so the GM and a player converge on identical state (FR-SYNC-02).
    await gm.waitForSeq(before + 2);
    expect(bob.state).toEqual(viewFor(gm.state, bob));
  });

  it("never sends a resolved hidden token to other players (FR-GM-23)", async () => {
    const { gm, alice, bob } = await setup();
    for (const [i, name] of ["Moonblade", "Nightshade"].entries()) {
      await gm.command({ type: "token.create", name, position: { x: 35 + 70 * i, y: 175 }, ownerIds: [alice.participantId], hidden: true });
    }
    const secret = (name: string) => Object.values(gm.state.tokens).find((t) => t.name === name)!.id;
    const [moonblade, nightshade] = [secret("Moonblade"), secret("Nightshade")];
    alice.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
    await gm.waitFor((m) => m.type === "event" && m.committed.event.type === "ParticipantLeft");

    const r = await gm.command({
      type: "participant.resolveDeparture",
      participantId: alice.participantId,
      actions: [
        { tokenId: moonblade, action: "reassign", to: bob.participantId },
        { tokenId: nightshade, action: "delete" },
      ],
    });
    expect(r).toMatchObject({ type: "ack" });
    await bob.waitForSeq(gm.seq);

    const raw = bob.rawLog.join("\n");
    for (const leak of [moonblade, nightshade, "Moonblade", "Nightshade"]) expect(raw).not.toContain(leak);
    // Bob owns Moonblade now, but it stays hidden until the GM reveals it.
    expect(Object.keys(bob.state.tokens)).not.toContain(moonblade);
  });

  it("forbids a player from resolving a departure", async () => {
    const { alice, bob, tokenId } = await setup();
    alice.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
    await alice.disconnected;
    const r = await bob.command({
      type: "participant.resolveDeparture",
      participantId: alice.participantId,
      actions: [{ tokenId: tokenId("Aria"), action: "delete" }],
    });
    expect(r).toMatchObject({ type: "rejected", code: "forbidden" });
  });
});

describe("attaching after the seat ended (KAN-58)", () => {
  it("ends a socket that passed the handshake just before the leave committed", async () => {
    // The handshake checks the participant, but Socket.IO attaches one tick later; this is
    // that attach landing after ParticipantLeft.
    const store = new MemoryRoomStore();
    await store.createRoom("r1", "invite1");
    const room = await LiveRoom.load("r1", store);
    const alice = { id: "p-alice", role: "player" as const, displayName: "Alice" };
    await room.appendSystem(null, [{ type: "RoomCreated", name: "Room" }, { type: "ParticipantJoined", participant: alice }]);
    expect(await room.submit(alice.id, { type: "participant.leave" })).toMatchObject({ ok: true });

    const received: ServerMessage[] = [];
    let closed = false;
    const late: RoomClient = { participantId: alice.id, send: (m) => received.push(m), close: () => (closed = true) };
    room.attach(late);

    expect(received).toEqual([{ type: "sessionEnded", reason: "left" }]);
    expect(closed).toBe(true);
    expect(room.clientCount).toBe(0);
  });
});
