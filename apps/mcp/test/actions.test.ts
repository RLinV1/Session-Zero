import { isDiceRoll } from "@vtt/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { moveCommand } from "../src/tools";
import { addToken, eventually, gmDoes, joinAs, openTable, squareCenter, startStack, viewTokens, type Stack } from "./helpers";

const sword = { name: "Sword", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 5 }, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 } };

describe("moving by grid square (FR-PL-08, FR-TAC-02)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  /** A 20x20 room with a wall across column 5. */
  const walledTable = async () => {
    const table = await openTable(stack.room);
    const { gm } = table;
    const { cellSize } = gm.state.scene.grid;
    await gmDoes(gm, { type: "scene.setMap", map: { url: "/uploads/room.png", width: 20 * cellSize, height: 20 * cellSize } });
    await gmDoes(gm, { type: "wall.add", walls: [{ a: { x: 5 * cellSize, y: 0 }, b: { x: 5 * cellSize, y: 20 * cellSize } }] });
    return table;
  };

  it("moves its own token, the GM sees it, and it reports back the same square", async () => {
    const { gm, inviteCode } = await walledTable();
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === token));

    const moved = await stack.ai.call("move_token", { seat, tokenId: token, column: 3, row: 4 });
    expect(moved.json).toEqual({ moved: true, tokenId: token, column: 3, row: 4 });
    await eventually(() => gm.state.tokens[token]!.position, (p) => p.x === squareCenter(gm, 3, 4).x && p.y === squareCenter(gm, 3, 4).y);
    const view = await stack.ai.call("get_view", { seat });
    expect(viewTokens(view).find((t) => t.id === token)).toMatchObject({ column: 3, row: 4 });
    gm.close();
  });

  it.each([1, 2, 3, 4])("reports a size-%i token on the square it was moved to", async (size) => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Big");
    const token = await addToken(gm, { name: "Big", size, position: squareCenter(gm, 8, 8), ownerIds: [participantId] });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === token));
    const moved = await stack.ai.call("move_token", { seat, tokenId: token, column: 12, row: 6 });
    expect(moved.isError).toBe(false);
    const view = await stack.ai.call("get_view", { seat });
    expect(viewTokens(view).find((t) => t.id === token)).toMatchObject({ column: 12, row: 6 });
    gm.close();
  });

  it("refuses a visible token it doesn't own, and nothing is recorded", async () => {
    const { gm, inviteCode } = await walledTable();
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Not Yours", position: squareCenter(gm, 1, 1) });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === token));
    const seq = gm.seq;
    const moved = await stack.ai.call("move_token", { seat, tokenId: token, column: 2, row: 2 });
    expect(moved.isError).toBe(true);
    expect(moved.text).toMatch(/permission|not allowed|can't|only/i);
    expect(gm.seq).toBe(seq);
    gm.close();
  });

  it("says a wall blocks the move, and nothing is recorded", async () => {
    const { gm, inviteCode } = await walledTable();
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === token));
    const seq = gm.seq;
    const moved = await stack.ai.call("move_token", { seat, tokenId: token, column: 9, row: 1 });
    expect(moved.isError).toBe(true);
    expect(moved.text).toMatch(/unavailable/);
    expect(gm.seq).toBe(seq);
    gm.close();
  });

  it("refuses a square off the map without sending anything", async () => {
    const { gm, inviteCode } = await walledTable();
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === token));
    const seq = gm.seq;
    for (const square of [{ column: 400, row: 1 }, { column: 1, row: 400 }, { column: -1, row: 1 }]) {
      const moved = await stack.ai.call("move_token", { seat, tokenId: token, ...square });
      expect(moved.isError).toBe(true);
      expect(moved.text).toMatch(/off the map/);
    }
    expect(gm.seq).toBe(seq);
    gm.close();
  });

  it("refuses a token the seat can't see with the same answer as a made-up id", async () => {
    const { gm, inviteCode } = await walledTable();
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const hidden = await addToken(gm, { name: "Hidden", position: squareCenter(gm, 1, 1), hidden: true });
    const real = await stack.ai.call("move_token", { seat, tokenId: hidden, column: 2, row: 2 });
    const fake = await stack.ai.call("move_token", { seat, tokenId: "no-such-token", column: 2, row: 2 });
    expect(real.isError).toBe(true);
    expect(real.text).toBe(fake.text);
    gm.close();
  });

  it("leaves one of two simultaneous moves refused, and the token on the winner's square", async () => {
    const { gm, inviteCode } = await walledTable();
    const a = await joinAs(stack.ai, inviteCode, "Aye");
    const b = await joinAs(stack.ai, inviteCode, "Bee");
    const token = await addToken(gm, { name: "Shared", position: squareCenter(gm, 1, 1), ownerIds: [a.participantId, b.participantId] });

    await stack.mcp.pool.withSeat(a.seat, (seatA) => stack.mcp.pool.withSeat(b.seat, async (seatB) => {
      await eventually(() => Boolean(seatA.connection.state.tokens[token] && seatB.connection.state.tokens[token]), Boolean);
      // Both commands are built from the same mirror state before either is answered, as two racing tool calls would be.
      const results = await Promise.allSettled([
        seatA.connection.command(moveCommand(seatA.connection, token, { column: 2, row: 1 })),
        seatB.connection.command(moveCommand(seatB.connection, token, { column: 1, row: 2 })),
      ]);
      const refused = results.filter((r) => r.status === "rejected");
      expect(refused).toHaveLength(1);
      expect(String((refused[0] as PromiseRejectedResult).reason.message)).toMatch(/token changed/);
      const winner = results[0]!.status === "fulfilled" ? squareCenter(gm, 2, 1) : squareCenter(gm, 1, 2);
      await eventually(() => gm.state.tokens[token]!.position, (p) => p.x === winner.x && p.y === winner.y);
    }));
    gm.close();
  });

  it("check_move answers clear or blocked, with no event, no wall details and no reason", async () => {
    const { gm, inviteCode } = await walledTable();
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === token));
    const seq = gm.seq;
    expect((await stack.ai.call("check_move", { seat, tokenId: token, column: 3, row: 1 })).json).toEqual({ status: "clear" });
    expect((await stack.ai.call("check_move", { seat, tokenId: token, column: 9, row: 1 })).json).toEqual({ status: "blocked" });
    expect(gm.seq).toBe(seq);
    expect(viewTokens(await stack.ai.call("get_view", { seat })).find((t) => t.id === token)).toMatchObject({ column: 1, row: 1 });
    gm.close();
  });

  it("check_move says unknown for a token the seat doesn't own, rather than telling it about the board", async () => {
    const { gm, inviteCode } = await walledTable();
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Not Yours", position: squareCenter(gm, 1, 1) });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === token));
    expect((await stack.ai.call("check_move", { seat, tokenId: token, column: 9, row: 1 })).json).toEqual({ status: "unknown" });
    gm.close();
  });
});

describe("rolling through the server (FR-PL-08, FR-TAC-09)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  const lastRoll = (gm: { state: { rolls: Parameters<typeof isDiceRoll>[0][] } }) => gm.state.rolls.filter(isDiceRoll).at(-1)!;

  it("returns the dice and total the server rolled, and everyone sees the roll", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const result = await stack.ai.call("roll_dice", { seat, expression: "1d20+3" });
    expect(result.isError).toBe(false);
    await eventually(() => gm.state.rolls.length, (n) => n === 1);
    const roll = lastRoll(gm);
    expect(roll).toMatchObject({ byParticipantId: participantId, expression: "1d20+3", visibility: "public" });
    expect(result.json).toEqual({ expression: "1d20+3", dice: roll.dice, total: roll.total });
    gm.close();
  });

  it("passes on the room's refusal of a bad expression", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const result = await stack.ai.call("roll_dice", { seat, expression: "lots" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/NdX/);
    gm.close();
  });

  it("offers no hidden roll and no way to supply a result", async () => {
    const { tools } = await stack.ai.listTools();
    const keys = (name: string) => Object.keys(tools.find((t) => t.name === name)!.inputSchema.properties ?? {});
    expect(keys("roll_dice").sort()).toEqual(["expression", "seat"]);
    expect(keys("roll_attack").sort()).toEqual(["attackName", "roll", "seat", "targetTokenId", "tokenId"]);
    // An extra argument is dropped, not obeyed.
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.ai.call("roll_dice", { seat, expression: "1d6", visibility: "gm", total: 6 });
    await eventually(() => gm.state.rolls.length, (n) => n === 1);
    expect(lastRoll(gm).visibility).toBe("public");
    gm.close();
  });

  it("rolls a named attack for the GM to rule on, and then its damage for the GM to apply", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const mine = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId], attacks: [sword] });
    const goblin = await addToken(gm, { name: "Goblin", position: squareCenter(gm, 2, 1) });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).length === 2);

    const toHit = await stack.ai.call("roll_attack", { seat, tokenId: mine, targetTokenId: goblin, attackName: "sword" });
    expect(toHit.isError).toBe(false);
    expect(toHit.json).toMatchObject({ attack: "Sword", expression: "1d20+5", status: "waiting_for_gm_ruling" });
    await eventually(() => gm.state.rolls.length, (n) => n === 1);
    const roll = lastRoll(gm);
    expect(roll.attack).toMatchObject({ kind: "toHit", label: "Sword", actor: { tokenId: mine }, target: { tokenId: goblin } });
    expect(roll.verdict).toBeUndefined();

    const damage = await stack.ai.call("roll_attack", { seat, tokenId: mine, targetTokenId: goblin, attackName: "Sword", roll: "damage" });
    expect(damage.json).toMatchObject({ expression: "1d8+3", status: "waiting_for_gm_to_apply" });
    await eventually(() => gm.state.rolls.length, (n) => n === 2);
    expect(lastRoll(gm).attack).toMatchObject({ kind: "damage", label: "Sword damage" });
    gm.close();
  });

  it("refuses an attack with a token it doesn't own, and no roll is made", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const theirs = await addToken(gm, { name: "Theirs", position: squareCenter(gm, 1, 1), attacks: [sword] });
    const goblin = await addToken(gm, { name: "Goblin", position: squareCenter(gm, 2, 1) });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).length === 2);
    const result = await stack.ai.call("roll_attack", { seat, tokenId: theirs, targetTokenId: goblin, attackName: "Sword" });
    expect(result.isError).toBe(true);
    expect(gm.state.rolls).toHaveLength(0);
    gm.close();
  });

  it("names the attacks it has when asked for one it doesn't", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const mine = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId], attacks: [sword] });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === mine));
    const result = await stack.ai.call("roll_attack", { seat, tokenId: mine, targetTokenId: mine, attackName: "Fireball" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("It has: Sword");
    gm.close();
  });
});

describe("doors, chat and leaving (FR-PL-08, FR-GM-18)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  const doorTable = async (state: "closed" | "locked") => {
    const table = await openTable(stack.room);
    const { gm } = table;
    const { cellSize } = gm.state.scene.grid;
    await gmDoes(gm, { type: "scene.setMap", map: { url: "/uploads/room.png", width: 20 * cellSize, height: 20 * cellSize } });
    await gmDoes(gm, { type: "wall.add", walls: [{ a: { x: 3 * cellSize, y: 2 * cellSize }, b: { x: 4 * cellSize, y: 2 * cellSize }, portal: { kind: "door", state } }] });
    return { ...table, door: Object.keys(gm.state.walls)[0]! };
  };

  it("opens and closes a door for everyone", async () => {
    const { gm, inviteCode, door } = await doorTable("closed");
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const opened = await stack.ai.call("set_door", { seat, doorId: door, state: "open" });
    expect(opened.json).toEqual({ doorId: door, state: "open" });
    await eventually(() => gm.state.walls[door]!.portal!.state, (s) => s === "open");
    await stack.ai.call("set_door", { seat, doorId: door, state: "closed" });
    await eventually(() => gm.state.walls[door]!.portal!.state, (s) => s === "closed");
    gm.close();
  });

  it("passes on the refusal for a locked door, which stays locked", async () => {
    const { gm, inviteCode, door } = await doorTable("locked");
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const result = await stack.ai.call("set_door", { seat, doorId: door, state: "open" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/locked/);
    expect(gm.state.walls[door]!.portal!.state).toBe("locked");
    gm.close();
  });

  it("chats as the character", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    expect((await stack.ai.call("send_chat", { seat, text: "I hold the door" })).json).toEqual({ sent: true });
    await eventually(() => gm.state.chat.length, (n) => n === 1);
    expect(gm.state.chat[0]).toMatchObject({ senderName: "Oswin (AI)", text: "I hold the door" });
    gm.close();
  });

  it("passes on the room's own chat limit, and the message isn't posted", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    let refusal = "";
    let sent = 0;
    for (let i = 0; i < 12 && !refusal; i++) {
      const result = await stack.ai.call("send_chat", { seat, text: `Message ${i}` });
      if (result.isError) refusal = result.text;
      else sent++;
    }
    expect(refusal).toMatch(/too fast/);
    await eventually(() => gm.state.chat.length, (n) => n === sent);
    gm.close();
  });

  it("leaves through the normal action, and the GM can still review its tokens", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await stack.ai.call("get_view", { seat });

    expect((await stack.ai.call("leave_room", { seat })).json).toEqual({ left: true });
    await eventually(() => gm.state.participants[participantId]!.left, Boolean);
    // The departure review works from tokens still owned by someone who left (ADR 0006).
    expect(gm.state.tokens[token]!.ownerIds).toContain(participantId);
    const reply = await gm.command({ type: "participant.resolveDeparture", participantId, actions: [{ tokenId: token, action: "delete" }] });
    expect(reply.type).toBe("ack");

    const after = await stack.ai.call("get_view", { seat });
    expect(after.isError).toBe(true);
    expect(after.text).toMatch(/has left the room/);
    gm.close();
  });
});
