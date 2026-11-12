import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Point, Token } from "@vtt/shared";
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
/** A short stub in the top-left corner of square (2, 1), well clear of its centre. */
const STUB = { a: { x: 140, y: 70 }, b: { x: 152, y: 82 } };
/** A wall along the edge between columns 1 and 2 on row 3, to be made a door. */
const DOOR = { a: { x: 140, y: 210 }, b: { x: 140, y: 280 } };

async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  clients.push(gm);
  await gm.command({ type: "scene.setMap", map: { url: "/img/map-emberwatch-archive.webp", width: 700, height: 700 } });
  await gm.command({ type: "wall.add", walls: [STUB] });
  await gm.command({ type: "wall.add", walls: [DOOR] });
  await gm.command({ type: "token.create", name: "Aria", position: at(1, 1), ownerIds: [aliceCreds.participantId] });
  const alice = await server.connect(aliceCreds);
  clients.push(alice);
  await alice.waitForSeq(gm.seq);
  const aria = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Aria")!;
  const door = Object.values(gm.state.walls).find((w) => w.a.x === DOOR.a.x && w.a.y === DOOR.a.y)!;
  return { gm, alice, aria, door };
}

describe("wall clearance over the wire (FR-GM-11, ADR 0063)", () => {
  it("accepts a player's move onto a square with a wall stub in its corner", async () => {
    const { alice, aria } = await setup();
    expect(await alice.command({ type: "token.move", tokenId: aria.id, to: at(2, 1) })).toMatchObject({ type: "ack" });
  });

  it("refuses a player's move through a closed door", async () => {
    const { gm, alice, aria, door } = await setup();
    await gm.command({ type: "portal.set", wallId: door.id, portal: { kind: "door", state: "closed" } });
    await alice.waitForSeq(gm.seq);
    const toRow3 = await alice.command({ type: "token.move", tokenId: aria.id, to: at(1, 3) });
    expect(toRow3).toMatchObject({ type: "ack" });
    await alice.waitForSeq((toRow3 as { seq: number }).seq);
    expect(await alice.command({ type: "token.move", tokenId: aria.id, to: at(2, 3) })).toMatchObject({ type: "rejected", message: "That move is unavailable." });
  });
});
