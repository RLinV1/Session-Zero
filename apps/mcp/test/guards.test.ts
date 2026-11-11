import { afterEach, describe, expect, it, vi } from "vitest";
import { startServer } from "../../server/test/helpers";
import { scrubbed } from "../src/errors";
import { JOINS_PER_WINDOW, JOIN_WINDOW_MS, Limits, ROOM_CHATS_PER_MINUTE, ROOM_COMMANDS_PER_MINUTE, SEAT_COMMANDS_PER_MINUTE } from "../src/limits";
import { AiClient, eventually, gmDoes, joinAs, openTable, startStack, type Stack } from "./helpers";

const MINUTE = 60_000;

describe("limits on commands (FR-PL-08)", () => {
  let clock = 1_000_000;
  const stacks: Stack[] = [];
  const stackWithClock = async () => {
    clock = 1_000_000;
    const stack = await startStack({ now: () => clock });
    stacks.push(stack);
    return stack;
  };
  afterEach(async () => {
    await Promise.all(stacks.splice(0).map((s) => s.close()));
  });

  const rollMany = (ai: AiClient, seat: string, count: number) =>
    Promise.all(Array.from({ length: count }, () => ai.call("roll_dice", { seat, expression: "1d6" })));

  it("sends nothing for a seat's 61st command in a minute, and other seats are unaffected", async () => {
    const stack = await stackWithClock();
    const { gm, inviteCode } = await openTable(stack.room);
    const looping = await joinAs(stack.ai, inviteCode, "Looping");
    const calm = await joinAs(stack.ai, inviteCode, "Calm");

    const allowed = await rollMany(stack.ai, looping.seat, SEAT_COMMANDS_PER_MINUTE);
    expect(allowed.every((r) => !r.isError)).toBe(true);
    await eventually(() => gm.seq, (seq) => seq >= 2 + SEAT_COMMANDS_PER_MINUTE);
    const seq = gm.seq;

    const refused = await stack.ai.call("roll_dice", { seat: looping.seat, expression: "1d6" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/too fast/);
    expect(gm.seq).toBe(seq);

    expect((await stack.ai.call("roll_dice", { seat: calm.seat, expression: "1d6" })).isError).toBe(false);

    clock += MINUTE;
    expect((await stack.ai.call("roll_dice", { seat: looping.seat, expression: "1d6" })).isError).toBe(false);
    gm.close();
  });

  it("refuses a room's 241st command in a minute, while another room and a browser player can still act", async () => {
    const stack = await stackWithClock();
    const { gm, inviteCode, roomId } = await openTable(stack.room);
    const elsewhere = await openTable(stack.room);
    const elsewhereSeat = await joinAs(stack.ai, elsewhere.inviteCode, "Elsewhere");
    const friend = await stack.room.join(inviteCode, "Dana");
    const browser = await stack.room.connect({ roomId, guestToken: friend.guestToken });

    const seats = [];
    for (const name of ["A", "B", "C", "D", "E"]) seats.push(await joinAs(stack.ai, inviteCode, name));
    for (const { seat } of seats.slice(0, 4)) {
      const results = await rollMany(stack.ai, seat, ROOM_COMMANDS_PER_MINUTE / 4);
      expect(results.every((r) => !r.isError)).toBe(true);
    }
    await eventually(() => gm.seq, (seq) => seq >= ROOM_COMMANDS_PER_MINUTE);
    const seq = gm.seq;

    const refused = await stack.ai.call("roll_dice", { seat: seats[4]!.seat, expression: "1d6" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/in this room/);
    expect(gm.seq).toBe(seq);

    expect((await stack.ai.call("roll_dice", { seat: elsewhereSeat.seat, expression: "1d6" })).isError).toBe(false);
    expect((await browser.command({ type: "dice.roll", expression: "1d6", visibility: "public" })).type).toBe("ack");
    browser.close();
    gm.close();
    elsewhere.gm.close();
  });

  it("refuses a room's 31st AI chat in a minute, and a browser player can still chat", async () => {
    const stack = await stackWithClock();
    const { gm, inviteCode, roomId } = await openTable(stack.room);
    const friend = await stack.room.join(inviteCode, "Dana");
    const browser = await stack.room.connect({ roomId, guestToken: friend.guestToken });

    // The room's own limit is 10 messages per 10 seconds for each seat, so this takes several seats.
    const seats = [];
    for (const name of ["A", "B", "C", "D"]) seats.push(await joinAs(stack.ai, inviteCode, name));
    let sent = 0;
    for (const { seat } of seats.slice(0, 3)) {
      for (let i = 0; i < 10; i++) {
        expect((await stack.ai.call("send_chat", { seat, text: `Line ${i}` })).isError).toBe(false);
        sent++;
      }
    }
    expect(sent).toBe(ROOM_CHATS_PER_MINUTE);
    await eventually(() => gm.state.chat.length, (n) => n === sent);

    const refused = await stack.ai.call("send_chat", { seat: seats[3]!.seat, text: "One too many" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/chatting too fast/);
    expect(gm.state.chat).toHaveLength(sent);

    expect((await browser.command({ type: "chat.send", text: "I can still talk" })).type).toBe("ack");
    browser.close();
    gm.close();
  });

  it("doesn't limit read tools, or a refused command's retry after a slow-down", async () => {
    const stack = await stackWithClock();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Reader");
    const reads = await Promise.all(Array.from({ length: SEAT_COMMANDS_PER_MINUTE + 5 }, () => stack.ai.call("get_view", { seat })));
    expect(reads.every((r) => !r.isError)).toBe(true);
    expect((await stack.ai.call("roll_dice", { seat, expression: "1d6" })).isError).toBe(false);
    gm.close();
  });

  it("lets a seat over its limit still leave", async () => {
    const stack = await stackWithClock();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Quitter");
    await rollMany(stack.ai, seat, SEAT_COMMANDS_PER_MINUTE);
    expect((await stack.ai.call("roll_dice", { seat, expression: "1d6" })).isError).toBe(true);
    expect((await stack.ai.call("leave_room", { seat })).json).toEqual({ left: true });
    gm.close();
  });
});

describe("limits on joins (FR-PL-08, FR-PL-09)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("counts attempts per invite and address, and refunds an invite that matches no room", () => {
    let clock = 0;
    const limits = new Limits(() => clock);
    for (let i = 0; i < JOINS_PER_WINDOW; i++) expect(limits.takeJoin("abc", "1.1.1.1")).toBeNull();
    expect(limits.takeJoin("abc", "1.1.1.1")).toMatch(/Too many joins/);
    expect(limits.takeJoin("abc", "2.2.2.2")).toBeNull();
    expect(limits.takeJoin("xyz", "1.1.1.1")).toBeNull();

    for (let i = 0; i < JOINS_PER_WINDOW * 2; i++) {
      expect(limits.takeJoin("made-up", "1.1.1.1")).toBeNull();
      limits.refundJoin("made-up", "1.1.1.1");
    }

    clock += JOIN_WINDOW_MS;
    expect(limits.takeJoin("abc", "1.1.1.1")).toBeNull();
  });

  it("lets one address fill a table, refuses its 41st attempt, and it can still join another room", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const other = await openTable(stack.room);

    const results = [];
    for (let i = 0; i < JOINS_PER_WINDOW; i++) results.push(await stack.ai.call("join_room", { invite: inviteCode, name: `Seat ${i}` }));
    // 32 seats, all allowed. The attempts past that are refused by the room as full, and still count.
    expect(results.slice(0, 32).every((r) => !r.isError)).toBe(true);
    expect(results.slice(32).every((r) => /room is full/.test(r.text))).toBe(true);

    const refused = await stack.ai.call("join_room", { invite: inviteCode, name: "Seat 41" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/Too many joins/);

    expect((await stack.ai.call("join_room", { invite: other.inviteCode, name: "Elsewhere" })).isError).toBe(false);
    gm.close();
    other.gm.close();
    await stack.close();
  });

  it("forwards the client's address, so one client using up the room server's invite limit doesn't stop another", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    const room = await startServer();
    const stack = await startStack({ trustProxy: 1 }, room);
    const { gm, inviteCode } = await openTable(room);
    const noisy = await AiClient.connect(stack.mcp.url, { "x-forwarded-for": "203.0.113.1" });
    const polite = await AiClient.connect(stack.mcp.url, { "x-forwarded-for": "203.0.113.2" });

    // The room server allows 300 invite requests per 15 minutes per address, and wrong codes count (ADR 0051).
    const batches = await Promise.all(Array.from({ length: 300 }, (_, i) => noisy.call("join_room", { invite: `wrong${i}`, name: "Spammer" })));
    expect(batches.every((r) => /Invite not found/.test(r.text))).toBe(true);
    const blocked = await noisy.call("join_room", { invite: inviteCode, name: "Spammer" });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toMatch(/Too many/);

    const joined = await polite.call("join_room", { invite: inviteCode, name: "Polite" });
    expect(joined.isError).toBe(false);

    await noisy.close();
    await polite.close();
    gm.close();
    await stack.close();
    await room.close();
  });
});

describe("the MCP endpoint (FR-PL-08)", () => {
  const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } } };
  const post = (url: string, body: string, headers: Record<string, string> = {}) =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body });

  it("refuses a page on another origin, and handles a request with none", async () => {
    const stack = await startStack();
    const refused = await post(stack.mcp.url, JSON.stringify(initialize), { origin: "https://evil.example" });
    expect(refused.status).toBe(403);
    expect((await post(stack.mcp.url, JSON.stringify(initialize))).status).toBe(200);
    expect((await post(stack.mcp.url, JSON.stringify(initialize), { origin: "http://localhost:5173" })).status).toBe(200);
    await stack.close();
  });

  it("refuses a body over 64 KB, and takes one under it", async () => {
    const stack = await startStack();
    const padded = (size: number) => JSON.stringify({ ...initialize, params: { ...initialize.params, clientInfo: { name: "x".repeat(size), version: "1" } } });
    expect((await post(stack.mcp.url, padded(70 * 1024))).status).toBe(413);
    expect((await post(stack.mcp.url, padded(60 * 1024))).status).toBe(200);
    // A Content-Type the JSON parser wouldn't usually read, but the transport would accept.
    expect((await post(stack.mcp.url, padded(70 * 1024), { "content-type": "text/plain, application/json" })).status).toBe(413);
    await stack.close();
  });

  it("answers malformed JSON without echoing it, and refuses methods a stateless server has no use for", async () => {
    const stack = await startStack();
    const malformed = await post(stack.mcp.url, `{"seat":"room.supersecretvalue"`);
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).not.toContain("supersecret");
    expect((await fetch(stack.mcp.url)).status).toBe(405);
    expect((await fetch(stack.mcp.url, { method: "DELETE" })).status).toBe(405);
    await stack.close();
  });
});

describe("seat values stay out of the logs (FR-PL-08)", () => {
  afterEach(() => vi.restoreAllMocks());

  const captureOutput = () => {
    const captured: string[] = [];
    const record = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
      return true;
    };
    for (const method of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, method).mockImplementation(record);
    vi.spyOn(process.stdout, "write").mockImplementation(record);
    vi.spyOn(process.stderr, "write").mockImplementation(record);
    return captured;
  };

  it("logs no seat or guest token across a join, calls, a failed call and an unexpected failure", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const captured = captureOutput();

    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const guestToken = seat.slice(seat.indexOf(".") + 1);
    await stack.ai.call("get_view", { seat });
    await stack.ai.call("roll_dice", { seat, expression: "not dice" });
    await stack.ai.call("move_token", { seat, tokenId: "nothing", column: 1, row: 1 });
    await fetch(stack.mcp.url, { method: "POST", headers: { "content-type": "application/json" }, body: `{"seat":"${seat}"` });

    // An unexpected error whose message happens to quote the seat.
    vi.spyOn(stack.mcp.pool, "withSeat").mockRejectedValueOnce(new Error(`Boom with ${seat}`));
    const failed = await stack.ai.call("get_view", { seat });
    expect(failed.isError).toBe(true);
    expect(failed.text).not.toContain(guestToken);
    expect(captured.join("\n")).toContain("[redacted]");

    await gmDoes(gm, { type: "participant.revoke", participantId });
    await eventually(() => stack.ai.call("get_view", { seat }), (r) => r.isError);

    const output = captured.join("\n");
    expect(output).not.toContain(guestToken);
    expect(output).not.toContain(seat);
    vi.restoreAllMocks();
    gm.close();
    await stack.close();
  });

  it("returns a seat only from join_room", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    for (const [name, args] of [["get_view", { seat }], ["roll_dice", { seat, expression: "1d6" }], ["send_chat", { seat, text: "Hi" }], ["wait_for_turn", { seat }]] as const) {
      if (name === "wait_for_turn") continue;
      expect((await stack.ai.call(name, args)).text).not.toContain(seat);
    }
    gm.close();
    await stack.close();
  });

  it("blanks anything credential-shaped in an error", () => {
    const seat = `11111111-1111-1111-1111-111111111111.${"a".repeat(43)}`;
    expect(scrubbed(new Error(`failed for ${seat}`))).not.toContain("aaaa");
    expect(scrubbed(`plain ${"b".repeat(40)} text`)).toBe("plain [redacted] text");
    expect(scrubbed("short message")).toBe("short message");
  });
});
