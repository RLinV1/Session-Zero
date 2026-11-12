import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Point, ServerMessage, Token } from "@vtt/shared";
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

async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  clients.push(gm);
  await gm.command({ type: "scene.setMap", map: { url: "/img/map-emberwatch-archive.webp", width: 700, height: 700 } });
  await gm.command({ type: "token.create", name: "Aria", position: at(1, 1), ownerIds: [aliceCreds.participantId] });
  await gm.command({ type: "token.create", name: "Bram", position: at(2, 1) });
  const alice = await server.connect(aliceCreds);
  clients.push(alice);
  await alice.waitForSeq(gm.seq);
  const tokens = Object.values(gm.state.tokens) as Token[];
  return { gm, alice, aria: tokens.find((t) => t.name === "Aria")!, bram: tokens.find((t) => t.name === "Bram")! };
}

describe("no stacking over the wire (FR-TAC-02, token-no-stacking)", () => {
  it("refuses a GM's new token on an occupied square, and no client hears of it", async () => {
    const { gm, alice } = await setup();
    const seen: ServerMessage[] = [];
    alice.onMessage((m) => seen.push(m));
    const before = gm.seq;
    expect(await gm.command({ type: "token.create", name: "Orc", position: at(2, 1) }))
      .toMatchObject({ type: "rejected", code: "invalid", message: "Another token is already there." });
    expect(gm.seq).toBe(before);
    expect(Object.values(gm.state.tokens).some((t) => t.name === "Orc")).toBe(false);
    expect(seen.some((m) => m.type === "event")).toBe(false);
  });

  it("still accepts a player's move onto another token: the drag rule lives on the board", async () => {
    const { alice, aria, bram } = await setup();
    expect(await alice.command({ type: "token.move", tokenId: aria.id, to: bram.position })).toMatchObject({ type: "ack" });
  });
});
