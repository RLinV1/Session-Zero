import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AttackPreset } from "@vtt/shared";
import { startServer, viewFor, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); });

const fireBolt: AttackPreset = { name: "Fire Bolt", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 5 }, damage: { terms: [{ count: 1, sides: 10 }], modifier: 0 } };

async function table() {
  const owner = await server.createRoom("Mara");
  const alice = await server.join(owner.inviteCode, "Alice");
  const bob = await server.join(owner.inviteCode, "Bob");
  const gm = await server.connect(owner);
  const pa = await server.connect(alice);
  const pb = await server.connect(bob);
  clients.push(gm, pa, pb);
  return { alice, gm, pa, pb };
}

const tokenId = (client: TestClient, name: string) => Object.values(client.state.tokens).find((t) => t.name === name)!.id;

describe("Shared token attacks across the wire (FR-TAC-07, FR-GM-23, ADR 0034)", () => {
  it("sends an owner's attack change to the GM, and never to another player", async () => {
    const { alice, gm, pa, pb } = await table();
    await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [pa.participantId] });
    await pa.waitForSeq(gm.seq);
    expect((await pa.command({ type: "token.configure", tokenId: tokenId(pa, "Aria"), changes: { attacks: [fireBolt] } })).type).toBe("ack");
    await gm.waitForSeq(pa.seq);
    await pb.waitForSeq(pa.seq);
    expect(gm.state.tokens[tokenId(gm, "Aria")]?.attacks).toEqual([fireBolt]);
    expect(pb.rawLog.join("\n")).not.toContain("Fire Bolt");
    expect(pb.state).toEqual(viewFor(gm.state, pb));
    expect(pa.state).toEqual(viewFor(gm.state, pa));

    // A reconnect gets the same from the snapshot.
    const again = await server.connect(alice);
    clients.push(again);
    expect(again.state.tokens[tokenId(again, "Aria")]?.attacks).toEqual([fireBolt]);
  });

  it("refuses a forged attack change to another player's token (FR-GM-15)", async () => {
    const { gm, pa, pb } = await table();
    await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [pa.participantId] });
    await pb.waitForSeq(gm.seq);
    const seq = gm.seq;
    expect(await pb.command({ type: "token.configure", tokenId: tokenId(pb, "Aria"), changes: { attacks: [fireBolt] } })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(gm.seq).toBe(seq);
  });
});
