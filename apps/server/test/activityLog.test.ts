import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryResponse } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); });

const request = (roomId: string, token?: string, query = "") => fetch(`${server.base}/api/rooms/${roomId}/history${query}`, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe("Human-readable activity API (FR-REC-01)", () => {
  it("never sends GM-only entries to a player or foreign-room credential", async () => {
    const owner = await server.createRoom("Mara");
    const player = await server.join(owner.inviteCode, "Tomas");
    const foreign = await server.createRoom("Other GM");
    const gm = await server.connect(owner);
    const pc = await server.connect(player);
    clients.push(gm, pc);
    expect((await gm.command({ type: "token.create", name: "Secret dragon", position: { x: 0, y: 0 }, hidden: true })).type).toBe("ack");
    expect((await gm.command({ type: "dice.roll", expression: "1d20+97", visibility: "gm" })).type).toBe("ack");
    await pc.waitForSeq(gm.seq);
    const allowed = await request(owner.roomId, owner.guestToken);
    const history = HistoryResponse.parse(await allowed.json());
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(history)).toContain("Secret dragon");
    expect(JSON.stringify(history)).toContain("1d20+97");
    for (const credential of [player.guestToken, foreign.guestToken, "invalid", undefined]) {
      const denied = await request(owner.roomId, credential);
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: "GM only" });
    }
    expect(pc.rawLog.join("\n")).not.toContain("Secret dragon");
    expect(pc.rawLog.join("\n")).not.toContain("1d20+97");
  });

  it("pages stored history beyond the roll cap, searches all actors, and survives new appends", async () => {
    const owner = await server.createRoom("Mara");
    const player = await server.join(owner.inviteCode, "Tomas");
    const gm = await server.connect(owner);
    const pc = await server.connect(player);
    clients.push(gm, pc);
    await pc.command({ type: "dice.roll", expression: "1d20", visibility: "public" });
    for (let i = 0; i < 32; i++) await gm.command({ type: "dice.roll", expression: "1d6", visibility: "public" });
    expect(gm.state.rolls).toHaveLength(30);
    const first = HistoryResponse.parse(await (await request(owner.roomId, owner.guestToken, "?limit=5")).json());
    expect(first.entries).toHaveLength(5);
    await gm.command({ type: "dice.roll", expression: "1d8", visibility: "public" });
    const rest = HistoryResponse.parse(await (await request(owner.roomId, owner.guestToken, `?before=${first.nextBefore}&limit=100`)).json());
    const seqs = [...first.entries, ...rest.entries].map((e) => e.committed.seq);
    expect(seqs).toEqual(Array.from({ length: 36 }, (_, i) => 36 - i));
    expect(rest.nextBefore).toBeNull();
    const searched = HistoryResponse.parse(await (await request(owner.roomId, owner.guestToken, "?player=tOmAs&limit=1")).json());
    expect(searched.entries[0]?.sentence).toMatch(/^Tomas rolled 1d20: /);
    expect(searched.nextBefore).toBe(4);
    const last = HistoryResponse.parse(await (await request(owner.roomId, owner.guestToken, "?player=Tomas&before=4")).json());
    expect(last.entries[0]?.sentence).toBe("Tomas joined the room as a player");
    expect(last.nextBefore).toBeNull();
    const fresh = HistoryResponse.parse(await (await request(owner.roomId, owner.guestToken)).json());
    expect(fresh.entries[0]?.committed.seq).toBe(37);
  });

  it("rejects malformed queries and returns empty results at the end", async () => {
    const owner = await server.createRoom();
    for (const query of ["?limit=101", "?before=oops", "?limit=1&limit=2", "?role=gm", "?before=0"]) {
      expect((await request(owner.roomId, owner.guestToken, query)).status).toBe(400);
    }
    for (const query of ["?before=1", "?player=missing"]) {
      expect(await (await request(owner.roomId, owner.guestToken, query)).json()).toEqual({ entries: [], nextBefore: null });
    }
  });
});

describe("activity history and replay in the requested language (localization)", () => {
  const get = (url: string, token: string, language?: string) =>
    fetch(`${server.base}${url}`, { headers: { authorization: `Bearer ${token}`, ...(language ? { "accept-language": language } : {}) } });

  it("writes the same entries in English and Traditional Chinese, with identical events and filtering", async () => {
    const owner = await server.createRoom("Mara");
    const gm = await server.connect(owner);
    clients.push(gm);
    expect((await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, hidden: false })).type).toBe("ack");
    const aria = Object.values(gm.state.tokens).find((t) => t.name === "Aria")!;
    expect((await gm.command({ type: "token.setConditions", tokenId: aria.id, conditions: ["prone"] })).type).toBe("ack");

    const english = HistoryResponse.parse(await (await get(`/api/rooms/${owner.roomId}/history`, owner.guestToken)).json());
    const chinese = HistoryResponse.parse(await (await get(`/api/rooms/${owner.roomId}/history`, owner.guestToken, "zh-TW")).json());
    expect(chinese.entries.map((e) => e.committed)).toEqual(english.entries.map((e) => e.committed));
    expect(english.entries[0]!.sentence).toBe("Mara set Aria's conditions to prone");
    expect(chinese.entries[0]!.sentence).toBe("Mara 將 Aria 的狀態設為倒地");
    expect(chinese.entries.at(-1)!.sentence).toBe("Mara 建立了房間「Test」");
  });

  it("labels replay points in the requested language", async () => {
    const owner = await server.createRoom("Mara");
    const player = await server.join(owner.inviteCode, "Tomas");
    const points = await (await get(`/api/rooms/${owner.roomId}/replay`, player.guestToken, "zh-TW")).json() as { points: { label: string }[] };
    expect(points.points[0]!.label).toBe("房間的開始");
  });
});
