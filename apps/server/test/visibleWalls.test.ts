import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blocksMovement, cheapestPath, stepRulesOf, terrainCells, type Point, type ServerMessage, type Token } from "@vtt/shared";
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
const FOG_TOP = 350;
/** A wall between columns 2 and 3 on rows 0-2, in plain view. */
const SEEN = { a: { x: 210, y: 0 }, b: { x: 210, y: 210 } };
/** A wall that runs from open ground at (490, 140) down into the fog to (490, 560). */
const INTO_FOG = { a: { x: 490, y: 140 }, b: { x: 490, y: 560 } };
/** A wall wholly under the fog. */
const UNDER_FOG = { a: { x: 70, y: 490 }, b: { x: 280, y: 490 } };

/** A 700 px map with fog over rows 5 and below, the walls above, and Aria (Alice's) at (1,1). */
async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  clients.push(gm);
  await gm.command({ type: "scene.setMap", map: { url: "/img/map-emberwatch-archive.webp", width: 700, height: 700 } });
  // Fog first: a wall drawn on open ground is in plain view at that point in the room's history.
  await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: FOG_TOP }, to: { x: 700, y: 700 } } });
  await gm.command({ type: "wall.add", walls: [SEEN, INTO_FOG, UNDER_FOG] });
  await gm.command({ type: "token.create", name: "Aria", position: at(1, 1), ownerIds: [aliceCreds.participantId] });
  const alice = await server.connect(aliceCreds);
  clients.push(alice);
  await alice.waitForSeq(gm.seq);
  const aria = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Aria")!;
  return { gm, alice, aliceCreds, aria };
}

const pointsOf = (walls: Record<string, { a: Point; b: Point }>) => Object.values(walls).flatMap((w) => [w.a, w.b]);

describe("visible walls over the wire (FR-GM-23, ADR 0056)", () => {
  it("welcomes a player with the clipped pieces and no point of any wall inside fog", async () => {
    const { alice } = await setup();
    const walls = Object.values(alice.state.walls);
    expect(walls.map((w) => ({ a: w.a, b: w.b }))).toEqual([SEEN, { a: INTO_FOG.a, b: { x: 490, y: FOG_TOP } }]);
    expect(walls.every((w) => /^seen:\d+$/.test(w.id) && Object.keys(w).sort().join() === "a,b,id")).toBe(true);
    expect(pointsOf(alice.state.walls).every((p) => p.y <= FOG_TOP)).toBe(true);
  });

  it("delivers a wall drawn in view without reconnecting", async () => {
    const { gm, alice } = await setup();
    const drawn = { a: { x: 560, y: 70 }, b: { x: 630, y: 70 } };
    const added = await gm.command({ type: "wall.add", walls: [drawn] });
    await alice.waitForSeq(seqOf(added));
    expect(Object.values(alice.state.walls).some((w) => w.a.x === drawn.a.x && w.a.y === drawn.a.y && w.b.x === drawn.b.x)).toBe(true);
  });

  it("sends a wall drawn under fog only as a redacted step", async () => {
    const { gm, alice } = await setup();
    const seen: ServerMessage[] = [];
    alice.onMessage((m) => seen.push(m));
    const before = alice.state.walls;
    const added = await gm.command({ type: "wall.add", walls: [{ a: { x: 420, y: 630 }, b: { x: 630, y: 630 } }] });
    await alice.waitForSeq(seqOf(added));
    expect(seen.map((m) => m.type)).toEqual(["redacted"]);
    expect(alice.state.walls).toEqual(before);
    expect(JSON.stringify(seen)).not.toContain("630");
  });

  it("carries no unseen part of a wall in /replay frames", async () => {
    const { gm, alice, aliceCreds, aria } = await setup();
    const moved = await gm.command({ type: "token.move", tokenId: aria.id, to: at(1, 2) });
    await alice.waitForSeq(seqOf(moved));
    const replay = await fetch(`${server.base}/api/rooms/${aliceCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${aliceCreds.guestToken}` } });
    expect(replay.status).toBe(200);
    const raw = await replay.text();
    expect(raw).not.toContain(`{"x":${INTO_FOG.b.x},"y":${INTO_FOG.b.y}}`);
    for (const p of [UNDER_FOG.a, UNDER_FOG.b]) expect(raw).not.toContain(`{"x":${p.x},"y":${p.y}}`);
  });

  it("accepts a player's path around a wall they can see, and never offers one through it", async () => {
    const { alice, aria } = await setup();
    const state = alice.state;
    const knowledge = { kinds: terrainCells(state.terrainView?.runs ?? []), walls: Object.values(state.walls).filter(blocksMovement), map: state.scene.map! };
    const path = cheapestPath(aria.position, at(4, 1), 1, state.scene.grid, stepRulesOf(state), knowledge);
    expect(path).not.toBeNull();
    // Around the wall's end on row 3, never straight along row 1 through it.
    expect(path!.via.some((p) => p.y >= at(0, 3).y)).toBe(true);
    const moved = await alice.command({ type: "token.move", tokenId: aria.id, to: at(4, 1), via: path!.via });
    expect(moved).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(moved));
    expect(alice.state.tokens[aria.id]!.position).toEqual(at(4, 1));
  });
});
