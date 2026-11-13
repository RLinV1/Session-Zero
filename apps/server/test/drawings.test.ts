import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Drawing } from "@vtt/shared";
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
  await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  return { gm, alice, bob, aliceCreds };
}

const drawings = (c: TestClient) => Object.values(c.state.drawings ?? {}) as Drawing[];
const line = { type: "drawing.add", drawing: { kind: "line", color: "red", from: { x: 70, y: 70 }, to: { x: 280, y: 140 } } } as const;
const seqOf = (reply: unknown) => (reply as { seq: number }).seq;

describe("shared drawings over the wire (FR-TAC-04, FR-SYNC-02, ADR 0064)", () => {
  it("shows a player's drawing to everyone, and still after a reconnect", async () => {
    const { gm, alice, bob, aliceCreds } = await setup();
    const seq = seqOf(await alice.command(line));
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(seq)));
    for (const c of [gm, alice, bob]) expect(drawings(c)).toMatchObject([{ kind: "line", color: "red", ownerId: alice.participantId }]);

    alice.close();
    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(drawings(again)).toMatchObject([{ kind: "line", ownerId: alice.participantId }]);
  });

  it("refuses a player erasing someone else's drawing, and lets the GM erase it for everyone", async () => {
    const { gm, alice, bob } = await setup();
    const seq = seqOf(await alice.command(line));
    await Promise.all([gm, bob].map((c) => c.waitForSeq(seq)));
    const id = drawings(bob)[0]!.id;

    expect(await bob.command({ type: "drawing.remove", drawingId: id })).toMatchObject({ type: "rejected", code: "forbidden" });
    const erased = seqOf(await gm.command({ type: "drawing.remove", drawingId: id }));
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(erased)));
    for (const c of [gm, alice, bob]) expect(drawings(c)).toEqual([]);
  });

  it("refuses a forged 5000-point stroke and saves nothing", async () => {
    const { alice, bob } = await setup();
    const points = Array.from({ length: 5000 }, (_, i) => [i % 1000, i % 800]).flat();
    const reply = await alice.command({ type: "drawing.add", drawing: { kind: "stroke", color: "blue", points } });
    expect(reply).toMatchObject({ type: "rejected" });
    expect(drawings(alice)).toEqual([]);
    expect(drawings(bob)).toEqual([]);
  });
});
