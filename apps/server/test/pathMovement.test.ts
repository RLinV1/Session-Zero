import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MovementPreviewRequest, Point, ServerMessage, Token } from "@vtt/shared";
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

/** The centre of square (col, row) on the default 70 px grid. */
const at = (col: number, row: number): Point => ({ x: col * 70 + 35, y: row * 70 + 35 });
const seqOf = (reply: unknown) => (reply as { seq: number }).seq;

/**
 * A 700 px map with a wall between columns 2 and 3 on rows 0-2, fog over rows 5 and below,
 * Aria (Alice's) at (1,1) and Goblin (the GM's) at (1,3).
 */
async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  clients.push(gm, alice);
  await gm.command({ type: "scene.setMap", map: { url: "/img/map-emberwatch-archive.webp", width: 700, height: 700 } });
  await gm.command({ type: "wall.add", walls: [{ a: { x: 210, y: 0 }, b: { x: 210, y: 210 } }] });
  await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 350 }, to: { x: 700, y: 700 } } });
  await gm.command({ type: "token.create", name: "Aria", position: at(1, 1), ownerIds: [alice.participantId] });
  await gm.command({ type: "token.create", name: "Goblin", position: at(1, 3) });
  await alice.waitForSeq(gm.seq);
  const byName = (name: string) => (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === name)!;
  return { gm, alice, aliceCreds, gmCreds, aria: byName("Aria"), goblin: byName("Goblin") };
}

describe("path movement over the wire (FR-TAC-02, FR-GM-23, ADR 0055)", () => {
  it("moves a token along a path around a wall, and every client ends where it landed", async () => {
    const { gm, alice, aria } = await setup();
    const moved = await gm.command({ type: "token.move", tokenId: aria.id, to: at(4, 1), via: [at(1, 4), at(4, 4)] });
    expect(moved).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(moved));
    expect(gm.state.tokens[aria.id]!.position).toEqual(at(4, 1));
    expect(alice.state.tokens[aria.id]!.position).toEqual(at(4, 1));
  });

  it("refuses a player's path whose leg crosses a wall", async () => {
    const { alice, aria } = await setup();
    // Alice holds the wall in view only as an opaque piece (ADR 0056); the straight middle leg along row 1 crosses it.
    expect(Object.values(alice.state.walls)).toEqual([{ id: "seen:0", a: { x: 210, y: 0 }, b: { x: 210, y: 210 } }]);
    const refused = await alice.command({ type: "token.move", tokenId: aria.id, to: at(4, 2), via: [at(1, 2)] });
    expect(refused).toMatchObject({ type: "rejected", message: "That move is unavailable." });
    expect(alice.state.tokens[aria.id]!.position).toEqual(at(1, 1));
  });

  it("never sends a player any point of a path under fog, live or in replay", async () => {
    const { gm, alice, aliceCreds, goblin } = await setup();
    const seen: ServerMessage[] = [];
    alice.onMessage((m) => seen.push(m));
    // Goblin dips under the fog on rows 6-7 and comes back out at (5,3).
    const hidden = [at(1, 7), at(5, 7)];
    const moved = await gm.command({ type: "token.move", tokenId: goblin.id, to: at(5, 3), via: hidden });
    await alice.waitForSeq(seqOf(moved));
    expect(alice.state.tokens[goblin.id]!.position).toEqual(at(5, 3));
    const live = seen.flatMap((m) => (m.type === "event" && m.committed.event.type === "TokenMoved" ? [m.committed.event] : []));
    expect(live).toHaveLength(1);
    // The stretches outside fog arrive, with a gap across the one under it; no point lies in the fog.
    const event = live[0]!;
    expect(event.type === "TokenMoved" && event.gaps).toEqual([1]);
    expect(event.type === "TokenMoved" && event.via?.every((p) => p.y <= 350)).toBe(true);
    const replay = await fetch(`${server.base}/api/rooms/${aliceCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${aliceCreds.guestToken}` } });
    expect(replay.status).toBe(200);
    const raw = await replay.text();
    for (const p of hidden) expect(raw).not.toContain(`{"x":${p.x},"y":${p.y}}`);
  });

  it("answers a player's preview of a path through fog with unknown, and one around the wall with clear", async () => {
    const { gm, alice, aria } = await setup();
    const preview = (requestId: string, to: Point, via: Point[]): MovementPreviewRequest =>
      ({ type: "tokenMovePreview", requestId, tokenId: aria.id, from: at(1, 1), to, via, boardEpoch: gm.state.boardEpoch ?? 0 });
    alice.send({ type: "ephemeral", payload: preview("fogged", at(4, 1), [at(1, 7), at(4, 7)]) });
    expect(await alice.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback" && m.payload.requestId === "fogged")).toMatchObject({ payload: { status: "unknown" } });
    alice.send({ type: "ephemeral", payload: preview("around", at(4, 1), [at(1, 3), at(4, 3)]) });
    expect(await alice.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback" && m.payload.requestId === "around")).toMatchObject({ payload: { status: "clear" } });
  });

  it("leaves a player's live copy equal to a fresh player's after a path with hidden stretches", async () => {
    const { gm, alice, gmCreds, goblin } = await setup();
    const moved = await gm.command({ type: "token.move", tokenId: goblin.id, to: at(5, 3), via: [at(1, 7), at(5, 7)] });
    await alice.waitForSeq(seqOf(moved));
    const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
    const bob = await server.connect(bobCreds);
    clients.push(bob);
    await alice.waitForSeq(bob.seq);
    // Same viewer role, same view: only who "you" are differs, and that isn't room state.
    expect(alice.state).toEqual(bob.state);
  });

  it("brings the Diagonals and Difficult terrain rules to every client", async () => {
    const { gm, alice } = await setup();
    await gm.command({ type: "room.setDiagonalRule", rule: "alternating" });
    const last = await gm.command({ type: "room.setDifficultTerrain", mode: "both" });
    await alice.waitForSeq(seqOf(last));
    for (const client of [gm, alice]) {
      expect(client.state.diagonalRule).toBe("alternating");
      expect(client.state.difficultTerrain).toBe("both");
    }
  });
});
