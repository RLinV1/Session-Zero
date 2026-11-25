import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, viewFor, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); });

async function table() {
  const owner = await server.createRoom("Mara");
  const alice = await server.join(owner.inviteCode, "Alice");
  const bob = await server.join(owner.inviteCode, "Bob");
  const gm = await server.connect(owner);
  const pa = await server.connect(alice);
  const pb = await server.connect(bob);
  clients.push(gm, pa, pb);
  await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [pa.participantId] });
  await pa.waitForSeq(gm.seq);
  await pb.waitForSeq(gm.seq);
  const aria = Object.values(gm.state.tokens).find((t) => t.name === "Aria")!.id;
  return { gm, pa, pb, aria };
}

describe("Player renames own token across the wire (FR-PL-04, token-names)", () => {
  it("sends an owner's rename to the GM and other players", async () => {
    const { gm, pa, pb, aria } = await table();
    expect((await pa.command({ type: "token.configure", tokenId: aria, changes: { name: "Aria the Bold" } })).type).toBe("ack");
    await gm.waitForSeq(pa.seq);
    await pb.waitForSeq(pa.seq);
    expect(gm.state.tokens[aria]?.name).toBe("Aria the Bold");
    expect(pb.state.tokens[aria]?.name).toBe("Aria the Bold");
    expect(pb.state).toEqual(viewFor(gm.state, pb));
  });

  it("keeps a rename to a hidden token's name as typed, and players' raw messages never mention the hidden token", async () => {
    const { gm, pa, pb, aria } = await table();
    await gm.command({ type: "token.create", name: "Dragon", position: { x: 385, y: 385 }, hidden: true });
    const dragon = Object.values(gm.state.tokens).find((t) => t.name === "Dragon")!.id;
    expect((await pa.command({ type: "token.configure", tokenId: aria, changes: { name: "Dragon" } })).type).toBe("ack");
    await gm.waitForSeq(pa.seq);
    await pb.waitForSeq(pa.seq);
    expect(gm.state.tokens[aria]?.name).toBe("Dragon");
    for (const player of [pa, pb]) {
      const raw = player.rawLog.join("\n");
      expect(raw).not.toContain(dragon);
      expect(raw).not.toContain("Dragon 2");
      expect(player.state.tokens[aria]?.name).toBe("Dragon");
      expect(Object.keys(player.state.tokens)).toEqual([aria]);
    }
  });

  it("refuses a rename of another player's token and records nothing (FR-GM-15)", async () => {
    const { gm, pb, aria } = await table();
    const seq = gm.seq;
    expect(await pb.command({ type: "token.configure", tokenId: aria, changes: { name: "Mine now" } })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(gm.seq).toBe(seq);
    expect(gm.state.tokens[aria]?.name).toBe("Aria");
  });
});
