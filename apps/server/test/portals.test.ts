import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Token, Wall } from "@vtt/shared";
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

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const walls = (c: TestClient) => Object.values(c.state.walls) as Wall[];
/** A doorway on the edge between columns 1 and 2, beside Aria's cell, and a plain wall far away. */
const DOORWAY = { a: { x: 140, y: 70 }, b: { x: 140, y: 140 } };
const FAR_WALL = { a: { x: 560, y: 560 }, b: { x: 630, y: 560 } };

/** A room with a map, a GM, and Alice, who owns Aria at (105, 105) beside the doorway. */
async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  clients.push(gm, alice);
  await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 700, height: 700 } });
  await gm.command({ type: "token.create", name: "Aria", position: { x: 105, y: 105 }, ownerIds: [aliceCreds.participantId] });
  const added = await gm.command({ type: "wall.add", walls: [DOORWAY, FAR_WALL] });
  await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(added))));
  const doorway = walls(gm).find((w) => w.a.y === 70)!;
  const aria = Object.values(alice.state.tokens)[0] as Token;
  return { gm, alice, doorway, aria };
}

describe("portals over the wire (FR-GM-18, FR-GM-09, ADR 0030)", () => {
  it("shows a player the door but not the walls, and lets them open it and walk through", async () => {
    const { gm, alice, doorway, aria } = await setup();
    expect(walls(alice)).toEqual([]);

    const marked = await gm.command({ type: "portal.set", wallId: doorway.id, portal: { kind: "door", state: "closed" } });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(marked))));
    expect(walls(alice)).toEqual([{ ...doorway, portal: { kind: "door", state: "closed" } }]);
    // The plain wall's geometry never reaches the player.
    expect(alice.rawLog.join(" ")).not.toContain('"x":630');

    const through = { type: "token.move", tokenId: aria.id, to: { x: 175, y: 105 } } as const;
    expect(await alice.command(through)).toMatchObject({ type: "rejected", message: "That move is unavailable." });

    const opened = await alice.command({ type: "portal.setState", wallId: doorway.id, state: "open" });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(opened))));
    expect(walls(gm).find((w) => w.id === doorway.id)!.portal).toEqual({ kind: "door", state: "open" });
    expect(walls(alice)[0]!.portal).toEqual({ kind: "door", state: "open" });

    expect(await alice.command(through)).toMatchObject({ type: "ack" });
  });

  it("keeps a locked door shut for players and refuses them locks", async () => {
    const { gm, alice, doorway } = await setup();
    await gm.waitForSeq(seqOf(await gm.command({ type: "portal.set", wallId: doorway.id, portal: { kind: "door", state: "closed" } })));
    const locked = await gm.command({ type: "portal.setState", wallId: doorway.id, state: "locked" });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(locked))));
    expect(walls(alice)[0]!.portal).toEqual({ kind: "door", state: "locked" });

    expect(await alice.command({ type: "portal.setState", wallId: doorway.id, state: "open" }))
      .toMatchObject({ type: "rejected", code: "invalid", message: "That door is locked." });
    expect(await alice.command({ type: "portal.set", wallId: doorway.id, portal: null }))
      .toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("withdraws a door when fog covers it, and refuses to open it then", async () => {
    const { gm, alice, doorway } = await setup();
    await gm.waitForSeq(seqOf(await gm.command({ type: "portal.set", wallId: doorway.id, portal: { kind: "window", state: "closed" } })));
    const fogged = await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 100, y: 0 }, to: { x: 200, y: 200 } } });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(fogged))));
    expect(walls(alice)).toEqual([]);
    expect(await alice.command({ type: "portal.setState", wallId: doorway.id, state: "open" }))
      .toMatchObject({ type: "rejected", code: "not_found" });
  });
});
