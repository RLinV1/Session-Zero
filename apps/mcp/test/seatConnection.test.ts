import { filterStateForViewer, type ServerMessage } from "@vtt/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startMcpServer } from "../src/app";
import { SeatConnection, formatSeat, parseSeat } from "../src/seatConnection";
import { DEFAULT_IDLE_MS } from "../src/seatPool";
import { AiClient, addToken, eventually, gmDoes, joinAs, openTable, squareCenter, startStack, type Stack } from "./helpers";

describe("the seat value (FR-PL-08)", () => {
  it("round-trips a room id and guest token", () => {
    expect(parseSeat(formatSeat("room-1", "a".repeat(43)))).toEqual({ roomId: "room-1", guestToken: "a".repeat(43) });
  });

  it.each(["", "no-dot", ".token", "room.short"])("refuses %j", (seat) => {
    expect(parseSeat(seat)).toBeNull();
  });
});

describe("a seat's connection (FR-PL-08)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  it("keeps a mirror equal to the server's filtered view through a series of commands", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Mirror");
    await stack.mcp.pool.withSeat(seat, async ({ connection }) => {
      const hidden = await addToken(gm, { name: "Sneak", position: squareCenter(gm, 5, 5), hidden: true });
      const owned = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
      await gmDoes(gm, { type: "token.move", tokenId: owned, to: squareCenter(gm, 2, 2) });
      await gmDoes(gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 500 }, to: { x: 300, y: 800 } } });
      await gmDoes(gm, { type: "token.setHidden", tokenId: hidden, hidden: false });
      await gmDoes(gm, { type: "chat.send", text: "Hello" });
      await gmDoes(gm, { type: "dice.roll", expression: "1d20", visibility: "gm" });
      await gmDoes(gm, { type: "dice.roll", expression: "1d6", visibility: "public" });
      await gmDoes(gm, { type: "token.setHidden", tokenId: hidden, hidden: true });

      await eventually(() => connection.seq, (seq) => seq === gm.seq);
      const viewer = gm.state.participants[participantId]!;
      expect(connection.state).toEqual(filterStateForViewer(gm.state, viewer));
    });
    gm.close();
  });

  it("asks for a fresh snapshot on a sequence gap, and ends up current", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Gap");
    await stack.mcp.pool.withSeat(seat, async ({ connection }) => {
      const changes = vi.fn();
      connection.onChange(changes);
      // As if a message were lost: this event is one past what the seat should see next.
      const receive = (connection as unknown as { receive(msg: ServerMessage): void }).receive.bind(connection);
      receive({ type: "redacted", seq: connection.seq + 5 });
      await eventually(() => changes.mock.calls.length, (calls) => calls >= 1);

      await gmDoes(gm, { type: "chat.send", text: "After the gap" });
      await eventually(() => connection.seq, (seq) => seq === gm.seq);
      expect(connection.state).toEqual(filterStateForViewer(gm.state, gm.state.participants[participantId]!));
    });
    gm.close();
  });
});

describe("GM seats are refused (FR-PL-08)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  it("returns an error with no room data, and keeps no connection", async () => {
    const { gm, roomId, guestToken } = await openTable(stack.room, "The Secret Vault");
    await addToken(gm, { name: "Hidden Dragon", position: squareCenter(gm, 3, 3), hidden: true });
    const result = await stack.ai.call("get_view", { seat: formatSeat(roomId, guestToken) });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/only player seats/i);
    expect(result.text).not.toMatch(/Secret Vault|Dragon/);
    expect(stack.mcp.pool.openCount).toBe(0);
    gm.close();
  });

  it("closes without keeping the snapshot if a later welcome isn't a player's", async () => {
    const { gm, inviteCode } = await openTable(stack.room, "Later Welcome");
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.mcp.pool.withSeat(seat, async ({ connection }) => {
      const kept = connection.state;
      const receive = (connection as unknown as { receive(msg: ServerMessage): void }).receive.bind(connection);
      receive({ type: "welcome", you: { ...connection.you, role: "gm" }, seq: connection.seq, state: { ...kept, name: "Unfiltered" } });
      expect(connection.isOpen).toBe(false);
      expect(connection.state).toBe(kept);
    });
    gm.close();
  });

  it("refuses a seat value whose room doesn't match its credential", async () => {
    const one = await openTable(stack.room, "Room One");
    const two = await openTable(stack.room, "Room Two");
    const { seat } = await joinAs(stack.ai, one.inviteCode, "Wanderer");
    const guestToken = parseSeat(seat)!.guestToken;
    const result = await stack.ai.call("get_view", { seat: formatSeat(two.roomId, guestToken) });
    expect(result.isError).toBe(true);
    expect(result.text).not.toMatch(/Room (One|Two)/);
    one.gm.close();
    two.gm.close();
  });

  it("refuses a value that isn't a seat at all", async () => {
    const result = await stack.ai.call("get_view", { seat: "nonsense" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/seat doesn't work/);
  });
});

describe("an ended seat stays ended (FR-PL-08)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  /** A second MCP server has no memory of the seat, as after a restart: the room server's answer decides. */
  const afterRestart = async (seat: string) => {
    const restarted = await startMcpServer({ roomServerUrl: stack.room.base, allowedOrigins: [] });
    const ai = await AiClient.connect(restarted.url);
    const result = await ai.call("get_view", { seat });
    await ai.close();
    await restarted.close();
    return result;
  };

  it("says the GM removed it, with no data, live and after a restart", async () => {
    const { gm, inviteCode } = await openTable(stack.room, "Revoking Room");
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Removed");
    expect((await stack.ai.call("get_view", { seat })).isError).toBe(false);
    await gmDoes(gm, { type: "participant.revoke", participantId });
    const live = await eventually(() => stack.ai.call("get_view", { seat }), (r) => r.isError);
    expect(live.text).toMatch(/GM removed this seat/);
    expect(live.text).not.toMatch(/Revoking Room/);
    const restarted = await afterRestart(seat);
    expect(restarted.isError).toBe(true);
    expect(restarted.text).toMatch(/GM removed this seat/);
    gm.close();
  });

  it("says it left, live and after a restart", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Leaver");
    expect((await stack.ai.call("leave_room", { seat })).json).toEqual({ left: true });
    expect((await stack.ai.call("get_view", { seat })).text).toMatch(/has left the room/);
    expect((await afterRestart(seat)).text).toMatch(/has left the room/);
    gm.close();
  });

  it("says the room is gone, live and after a restart", async () => {
    const { gm, inviteCode, roomId, cookie } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Orphan");
    expect((await stack.ai.call("get_view", { seat })).isError).toBe(false);
    const res = await fetch(`${stack.room.base}/api/rooms/${roomId}`, { method: "DELETE", headers: { cookie } });
    expect(res.ok).toBe(true);
    const live = await eventually(() => stack.ai.call("get_view", { seat }), (r) => r.isError);
    expect(live.text).toMatch(/no longer exists/);
    const restarted = await afterRestart(seat);
    expect(restarted.isError).toBe(true);
    expect(restarted.text).toMatch(/no longer exist/);
    gm.close();
  });

  it("ends a wait in progress when the GM removes the seat", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Waiter");
    const waiting = stack.ai.call("wait_for_turn", { seat });
    await eventually(() => stack.mcp.pool.openCount, (n) => n > 0);
    await gmDoes(gm, { type: "participant.revoke", participantId });
    const result = await waiting;
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/GM removed this seat/);
    gm.close();
  });
});

describe("the seat cache (FR-PL-08)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reconnects an idle seat as the same participant, adding nobody", async () => {
    let clock = 1_000_000;
    const stack = await startStack({ now: () => clock });
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Idler");
    expect((await stack.ai.call("get_view", { seat })).isError).toBe(false);
    expect(stack.mcp.pool.openCount).toBe(1);

    stack.mcp.pool.sweep();
    expect(stack.mcp.pool.openCount).toBe(1);
    clock += DEFAULT_IDLE_MS;
    stack.mcp.pool.sweep();
    expect(stack.mcp.pool.openCount).toBe(0);

    const before = Object.keys(gm.state.participants).length;
    const view = await stack.ai.call("get_view", { seat });
    expect(view.json.you).toMatchObject({ id: participantId });
    expect(Object.keys(gm.state.participants)).toHaveLength(before);
    gm.close();
    await stack.close();
  });

  it("works with the same seat after the MCP server restarts", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Survivor");
    const before = Object.keys(gm.state.participants).length;

    await stack.ai.close();
    await stack.mcp.close();
    const restarted = await startMcpServer({ roomServerUrl: stack.room.base, allowedOrigins: [] });
    const ai = await AiClient.connect(restarted.url);
    const view = await ai.call("get_view", { seat });
    expect(view.json.you).toMatchObject({ id: participantId });
    expect(Object.keys(gm.state.participants)).toHaveLength(before);

    gm.close();
    await ai.close();
    await restarted.close();
    await stack.room.close();
  });

  it("opens one socket for simultaneous calls on one seat", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Twice");
    const open = vi.spyOn(SeatConnection, "open");
    const results = await Promise.all([1, 2, 3].map(() => stack.ai.call("get_view", { seat })));
    expect(results.every((r) => !r.isError)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(stack.mcp.pool.openCount).toBe(1);
    gm.close();
    await stack.close();
  });

  it("returns a busy error when every socket is in use, and the seat works later as the same participant", async () => {
    const stack = await startStack({ maxSockets: 1, waitLimitMs: 400 });
    const { gm, inviteCode } = await openTable(stack.room);
    const busy = await joinAs(stack.ai, inviteCode, "Busy");
    const refused = await joinAs(stack.ai, inviteCode, "Refused");

    const waiting = stack.ai.call("wait_for_turn", { seat: busy.seat });
    await eventually(() => stack.mcp.pool.openCount, (n) => n === 1);
    const result = await stack.ai.call("get_view", { seat: refused.seat });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/busy/);
    expect(result.text).toMatch(/This seat is safe/);
    await waiting;

    const later = await stack.ai.call("get_view", { seat: refused.seat });
    expect(later.json.you).toMatchObject({ id: refused.participantId });
    expect(stack.mcp.pool.openCount).toBe(1);
    gm.close();
    await stack.close();
  });

  it("closes the least recently used idle socket to make room", async () => {
    let clock = 1_000_000;
    const stack = await startStack({ maxSockets: 2, now: () => clock });
    const { gm, inviteCode } = await openTable(stack.room);
    const [a, b, c] = [await joinAs(stack.ai, inviteCode, "Aye"), await joinAs(stack.ai, inviteCode, "Bee"), await joinAs(stack.ai, inviteCode, "Sea")];
    await stack.ai.call("get_view", { seat: a.seat });
    clock += 1;
    await stack.ai.call("get_view", { seat: b.seat });
    clock += 1;
    await stack.ai.call("get_view", { seat: a.seat });
    clock += 1;
    const open = vi.spyOn(SeatConnection, "open");
    expect((await stack.ai.call("get_view", { seat: c.seat })).isError).toBe(false);
    expect(stack.mcp.pool.openCount).toBe(2);
    // A was used more recently than B, so A's socket is still open and B's is not.
    await stack.ai.call("get_view", { seat: a.seat });
    expect(open).toHaveBeenCalledTimes(1);
    expect((await stack.ai.call("get_view", { seat: b.seat })).json.you).toMatchObject({ id: b.participantId });
    gm.close();
    await stack.close();
  });
});

describe("what the review of the sync client found (FR-PL-08, FR-PL-06)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("doesn't end a seat over a brief store failure during a reconnect", async () => {
    let clock = 1_000_000;
    const stack = await startStack({ now: () => clock });
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.ai.call("get_view", { seat });
    clock += DEFAULT_IDLE_MS;
    stack.mcp.pool.sweep();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(stack.room.store, "findCredential").mockRejectedValueOnce(new Error("database down"));
    const failed = await stack.ai.call("get_view", { seat });
    expect(failed.isError).toBe(true);
    expect(failed.text).not.toMatch(/GM deleted/);
    expect(failed.text).toMatch(/try again/i);

    const recovered = await stack.ai.call("get_view", { seat });
    expect(recovered.isError).toBe(false);
    expect(recovered.json.you).toMatchObject({ id: participantId });
    gm.close();
    await stack.close();
  });

  it("gives each of several parallel rolls its own dice", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.ai.call("get_view", { seat });
    const results = await Promise.all(Array.from({ length: 8 }, () => stack.ai.call("roll_dice", { seat, expression: "6d100" })));
    expect(results.every((r) => !r.isError)).toBe(true);
    const reported = results.map((r) => JSON.stringify(r.json.dice));
    expect(new Set(reported).size).toBe(8);
    await eventually(() => gm.state.rolls.length, (n) => n === 8);
    const logged = gm.state.rolls.map((r) => JSON.stringify((r as { dice: number[] }).dice));
    expect([...reported].sort()).toEqual([...logged].sort());
    gm.close();
    await stack.close();
  });

  it("reports the seat's own change even when its mirror had missed a message", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => v.text.includes(token));

    const lostOne = async () => stack.mcp.pool.withSeat(seat, async ({ connection }) => { connection.seq -= 1; });
    await lostOne();
    const moved = await stack.ai.call("move_token", { seat, tokenId: token, column: 3, row: 3 });
    expect(moved.json).toEqual({ moved: true, tokenId: token, column: 3, row: 3 });
    expect((await stack.ai.call("get_view", { seat })).json.tokens).toEqual([expect.objectContaining({ id: token, column: 3, row: 3 })]);

    await lostOne();
    const rolled = await stack.ai.call("roll_dice", { seat, expression: "6d100" });
    await eventually(() => gm.state.rolls.length, (n) => n === 1);
    expect(rolled.json.dice).toEqual((gm.state.rolls[0] as { dice: number[] }).dice);
    gm.close();
    await stack.close();
  });

  it("asks again when a resync goes unanswered, and needs no further event to heal", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.mcp.pool.withSeat(seat, async ({ connection }) => {
      const internals = connection as unknown as { send(msg: unknown): void; receive(msg: ServerMessage): void };
      const send = internals.send.bind(connection);
      const sent: unknown[] = [];
      let dropped = false;
      // As the room server does past its resync limit (ADR 0051): the first request is dropped, unanswered.
      internals.send = (msg) => {
        sent.push(msg);
        if ((msg as { type: string }).type === "resync" && !dropped) dropped = true;
        else send(msg);
      };
      const before = gm.seq;
      await gmDoes(gm, { type: "chat.send", text: "One" });
      await gmDoes(gm, { type: "chat.send", text: "Two" });
      expect(gm.seq).toBe(before + 2);
      await eventually(() => connection.seq, (seq) => seq === gm.seq);

      connection.seq -= 1;
      await gmDoes(gm, { type: "chat.send", text: "Three" });
      const latest = gm.seq;
      await eventually(() => connection.seq, (seq) => seq === latest, 4_000);
      expect(connection.state.chat.map((m) => m.text)).toEqual(["One", "Two", "Three"]);
      expect(sent.filter((m) => (m as { type: string }).type === "resync")).toHaveLength(2);
    });
    gm.close();
    await stack.close();
  });

  it("answers a second gap straight away once the first has healed", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.mcp.pool.withSeat(seat, async ({ connection }) => {
      for (const text of ["One", "Two"]) {
        connection.seq -= 1;
        await gmDoes(gm, { type: "chat.send", text });
        const latest = gm.seq;
        await eventually(() => connection.seq, (seq) => seq === latest, 500);
      }
      expect(connection.state.chat.map((m) => m.text)).toEqual(["One", "Two"]);
    });
    gm.close();
    await stack.close();
  });

  it("forgets a connection that closed before anyone was listening", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.mcp.pool.withSeat(seat, async ({ connection }) => {
      connection.close();
      const closed = vi.fn();
      connection.onClose(closed);
      expect(closed).toHaveBeenCalledTimes(1);
    });
    expect(stack.mcp.pool.openCount).toBe(0);
    expect((await stack.ai.call("get_view", { seat })).isError).toBe(false);
    gm.close();
    await stack.close();
  });

  it("keeps the seat's own name current after a rename", async () => {
    const stack = await startStack();
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.mcp.pool.withSeat(seat, ({ connection }) => connection.command({ type: "participant.rename", displayName: "Oswin the Bold (AI)" }));
    expect((await stack.ai.call("get_view", { seat })).json.you).toMatchObject({ name: "Oswin the Bold (AI)" });
    gm.close();
    await stack.close();
  });
});
