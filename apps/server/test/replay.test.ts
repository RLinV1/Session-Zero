import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReplayPointsResponse, ReplayResponse, tableOf } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); });

const get = (path: string, token?: string) => fetch(`${server.base}${path}`, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe("Encounter replay API (FR-PL-07)", () => {
  async function table() {
    const owner = await server.createRoom("Mara");
    const alice = await server.join(owner.inviteCode, "Alice");
    const bob = await server.join(owner.inviteCode, "Bob");
    const gm = await server.connect(owner);
    const pa = await server.connect(alice);
    const pb = await server.connect(bob);
    clients.push(gm, pa, pb);
    const fighter = await gm.command({ type: "token.create", name: "Fighter", position: { x: 35, y: 35 }, ownerIds: [alice.participantId] });
    expect(fighter.type).toBe("ack");
    await gm.command({ type: "token.create", name: "Secret dragon", position: { x: 315, y: 315 }, hidden: true });
    await gm.command({ type: "checkpoint.create", name: "Before the dragon" });
    const fighterId = Object.values(gm.state.tokens).find((t) => t.name === "Fighter")!.id;
    const dragonId = Object.values(gm.state.tokens).find((t) => t.name === "Secret dragon")!.id;
    await pa.command({ type: "token.move", tokenId: fighterId, to: { x: 105, y: 35 } });
    await gm.command({ type: "token.move", tokenId: dragonId, to: { x: 245, y: 245 } });
    await gm.command({ type: "dice.roll", expression: "1d20+97", visibility: "gm" });
    await pb.waitForSeq(gm.seq);
    return { owner, alice, bob, gm, pa, pb, dragonId };
  }

  it("lists replay points for any participant, with checkpoints unnamed for players", async () => {
    const { owner, alice } = await table();
    const res = await get(`/api/rooms/${owner.roomId}/replay`, alice.guestToken);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = ReplayPointsResponse.parse(await res.json());
    expect(body.points.map((p) => p.label)).toEqual(["Start of the room", "Checkpoint 1"]);
    expect(JSON.stringify(body)).not.toContain("Before the dragon");
    const gmPoints = ReplayPointsResponse.parse(await (await get(`/api/rooms/${owner.roomId}/replay`, owner.guestToken)).json());
    expect(gmPoints.points.map((p) => p.label)).toContain("Before the dragon");
  });

  it("refuses outsiders and credentials for another room", async () => {
    const { owner } = await table();
    const foreign = await server.createRoom("Other GM");
    for (const credential of [foreign.guestToken, "invalid", undefined]) {
      for (const path of [`/api/rooms/${owner.roomId}/replay`, `/api/rooms/${owner.roomId}/replay/start`]) {
        const denied = await get(path, credential);
        expect(denied.status).toBe(403);
        expect(JSON.stringify(await denied.json())).not.toContain("Fighter");
      }
    }
  });

  it("limits each participant to 150 replay requests a minute, shared by both routes", async () => {
    const { owner, alice } = await table();
    for (let i = 0; i < 150; i++) {
      const path = i % 2 ? `/api/rooms/${owner.roomId}/replay/start` : `/api/rooms/${owner.roomId}/replay`;
      expect((await get(path, alice.guestToken)).status).toBe(200);
    }
    const refused = await get(`/api/rooms/${owner.roomId}/replay/start`, alice.guestToken);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBeTruthy();
    // Another participant has their own budget.
    expect((await get(`/api/rooms/${owner.roomId}/replay`, owner.guestToken)).status).toBe(200);
  });

  it("filters a player's replay and gives the GM everything", async () => {
    const { owner, alice, dragonId } = await table();
    const forPlayer = await get(`/api/rooms/${owner.roomId}/replay/start`, alice.guestToken);
    expect(forPlayer.status).toBe(200);
    const raw = await forPlayer.text();
    const replay = ReplayResponse.parse(JSON.parse(raw));
    expect(replay.frames.length).toBeGreaterThan(0);
    for (const secret of [dragonId, "Secret dragon", "1d20+97", "Before the dragon", "commandId"]) expect(raw).not.toContain(secret);
    expect(replay.frames.some((f) => f.sentence === "Alice moved Fighter from (35, 35) to (105, 35)")).toBe(true);

    const forGm = await (await get(`/api/rooms/${owner.roomId}/replay/start`, owner.guestToken)).text();
    for (const secret of [dragonId, "1d20+97", "Before the dragon"]) expect(forGm).toContain(secret);
  });

  it("404s an unknown point, including a raw checkpoint id", async () => {
    const { owner, alice, gm } = await table();
    for (const id of ["c9", "e1", gm.state.checkpoints[0]!.id]) {
      expect((await get(`/api/rooms/${owner.roomId}/replay/${id}`, alice.guestToken)).status).toBe(404);
    }
  });

  it("changes nothing in the live room", async () => {
    const { owner, alice, gm, pa } = await table();
    const before = { seq: gm.seq, table: JSON.stringify(tableOf(gm.state)), rolls: gm.state.rolls.length };
    await get(`/api/rooms/${owner.roomId}/replay`, alice.guestToken);
    await get(`/api/rooms/${owner.roomId}/replay/c1`, alice.guestToken);
    // A round trip after the reads: anything they had committed would have arrived first.
    await pa.command({ type: "chat.send", text: "still here" });
    await gm.waitForSeq(before.seq + 1);
    expect(gm.seq).toBe(before.seq + 1);
    const latest = gm.state.chat.at(-1);
    expect(latest?.text).toBe("still here");
    expect(JSON.stringify(tableOf(gm.state))).toBe(before.table);
    expect(gm.state.rolls).toHaveLength(before.rolls);
  });
});
