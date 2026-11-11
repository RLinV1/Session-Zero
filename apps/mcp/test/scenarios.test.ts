import { MAX_PLAYERS_PER_ROOM, type ServerMessage } from "@vtt/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiClient, addToken, eventually, gmDoes, joinAs, openTable, squareCenter, startStack, viewTokens, type Stack } from "./helpers";

const activePlayers = (gm: { state: { participants: Record<string, { role: string; left?: boolean; revoked?: boolean }> } }) =>
  Object.values(gm.state.participants).filter((p) => p.role === "player" && !p.left && !p.revoked).length;

describe("one AI with one character, start to finish (FR-PL-08)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  it("joins, is told it has no token, gets one, moves it and leaves, with the log and a browser agreeing at each step", async () => {
    const { gm, inviteCode, roomId } = await openTable(stack.room, "Full Run");
    const friend = await stack.room.join(inviteCode, "Dana");
    const browser = await stack.room.connect({ roomId, guestToken: friend.guestToken });
    const log: string[] = [];
    gm.onMessage((msg: ServerMessage) => {
      if (msg.type === "event") log.push(msg.committed.event.type);
    });

    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    await eventually(() => browser.state.participants[participantId]?.displayName, (name) => name === "Oswin (AI)");
    expect(log).toEqual(["ParticipantJoined"]);

    expect((await stack.ai.call("get_view", { seat })).json.hint).toMatch(/owns no tokens/);

    const token = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1) });
    await gmDoes(gm, { type: "token.setOwners", tokenId: token, ownerIds: [participantId] });
    expect(log).toEqual(["ParticipantJoined", "TokenCreated", "TokenOwnersSet"]);
    const owned = await eventually(() => stack.ai.call("get_view", { seat }), (v) => viewTokens(v).some((t) => t.id === token && t.yours));
    expect(owned.json.hint).toBeUndefined();

    expect((await stack.ai.call("move_token", { seat, tokenId: token, column: 4, row: 2 })).isError).toBe(false);
    const target = squareCenter(gm, 4, 2);
    await eventually(() => browser.state.tokens[token]?.position, (p) => p?.x === target.x && p.y === target.y);
    expect(log.at(-1)).toBe("TokenMoved");

    expect((await stack.ai.call("leave_room", { seat })).isError).toBe(false);
    await eventually(() => browser.state.participants[participantId]?.left, Boolean);
    expect(log.at(-1)).toBe("ParticipantLeft");
    expect(browser.state.participants[participantId]?.displayName).toBe("Oswin (AI)");
    browser.close();
    gm.close();
  });
});

describe("one AI holding several seats (FR-PL-09)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  it("requires a seat on every tool except join_room", async () => {
    const { tools } = await stack.ai.listTools();
    for (const tool of tools) {
      if (tool.name === "join_room") expect(tool.inputSchema.required).not.toContain("seat");
      else expect(tool.inputSchema.required).toContain("seat");
    }
  });

  it("gives one connection different views for different seats, and neither can act for the other", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const oswin = await joinAs(stack.ai, inviteCode, "Oswin");
    const pip = await joinAs(stack.ai, inviteCode, "Pip");
    await gmDoes(gm, { type: "scene.setMap", map: { url: "/uploads/room.png", width: 1400, height: 1400 } });
    const { cellSize } = gm.state.scene.grid;
    const oswinToken = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [oswin.participantId] });
    await addToken(gm, { name: "Pip", position: squareCenter(gm, 18, 1), ownerIds: [pip.participantId] });
    await addToken(gm, { name: "Goblin", position: squareCenter(gm, 2, 1) });
    await gmDoes(gm, { type: "wall.add", walls: [{ a: { x: 10 * cellSize, y: 0 }, b: { x: 10 * cellSize, y: 1400 } }] });
    await gmDoes(gm, { type: "scene.setLineOfSight", enabled: true });

    const oswinView = await eventually(() => stack.ai.call("get_view", { seat: oswin.seat }), (v) => viewTokens(v).some((t) => t.name === "Goblin"));
    const pipView = await eventually(() => stack.ai.call("get_view", { seat: pip.seat }), (v) => !v.text.includes("Goblin"));
    expect(oswinView.json.you).toMatchObject({ name: "Oswin (AI)" });
    expect(pipView.json.you).toMatchObject({ name: "Pip (AI)" });
    expect(pipView.text).not.toContain(oswin.seat);

    // Pip can't see Oswin's token past the wall, so this reads as a token it doesn't know about.
    const seq = gm.seq;
    const moved = await stack.ai.call("move_token", { seat: pip.seat, tokenId: oswinToken, column: 3, row: 1 });
    expect(moved.isError).toBe(true);
    expect(gm.seq).toBe(seq);
    gm.close();
  });

  it("refuses a token owned only by another seat even when both can see it", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const oswin = await joinAs(stack.ai, inviteCode, "Oswin");
    const pip = await joinAs(stack.ai, inviteCode, "Pip");
    const oswinToken = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [oswin.participantId] });
    await eventually(() => stack.ai.call("get_view", { seat: pip.seat }), (v) => viewTokens(v).some((t) => t.id === oswinToken));
    const seq = gm.seq;
    const moved = await stack.ai.call("move_token", { seat: pip.seat, tokenId: oswinToken, column: 3, row: 1 });
    expect(moved.isError).toBe(true);
    expect(gm.seq).toBe(seq);
    gm.close();
  });

  it("joins two characters at once where one name is taken, and retries only that one", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    await joinAs(stack.ai, inviteCode, "Pip");
    const [oswin, pip] = await Promise.all([
      stack.ai.call("join_room", { invite: inviteCode, name: "Oswin" }),
      stack.ai.call("join_room", { invite: inviteCode, name: "Pip" }),
    ]);
    expect(oswin!.isError).toBe(false);
    expect(oswin!.json.seat).toBeDefined();
    expect(pip!.isError).toBe(true);
    expect(pip!.text).toMatch(/already at this table/);
    const retry = await stack.ai.call("join_room", { invite: inviteCode, name: "Pippin" });
    expect(retry.isError).toBe(false);
    await eventually(() => activePlayers(gm), (n) => n === 3);
    gm.close();
  });
});

describe("several people's AIs in one room (FR-PL-09)", () => {
  let stack: Stack;
  let other: AiClient;
  beforeAll(async () => {
    stack = await startStack();
    other = await AiClient.connect(stack.mcp.url);
  });
  afterAll(async () => {
    await other.close();
    await stack.close();
  });

  it("gives separate connections separate seats and views, and they meet only through the room", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const mine = await joinAs(stack.ai, inviteCode, "Oswin");
    const theirs = await joinAs(other, inviteCode, "Pip");
    expect(mine.seat).not.toBe(theirs.seat);
    expect((await stack.ai.call("get_view", { seat: mine.seat })).json.you).toMatchObject({ name: "Oswin (AI)" });
    expect((await other.call("get_view", { seat: theirs.seat })).json.you).toMatchObject({ name: "Pip (AI)" });

    await stack.ai.call("send_chat", { seat: mine.seat, text: "Hello from Oswin" });
    const seen = await eventually(() => other.call("get_view", { seat: theirs.seat }), (v) => (v.json.chat as unknown[]).length === 1);
    expect(seen.json.chat).toEqual([expect.objectContaining({ from: "Oswin (AI)", text: "Hello from Oswin" })]);
    expect(seen.text).not.toContain(mine.seat);
    gm.close();
  });

  it("gives exactly one of several connections a contested name", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const results = await Promise.all([stack.ai, other, stack.ai, other].map((ai) => ai.call("join_room", { invite: inviteCode, name: "Oswin" })));
    expect(results.filter((r) => !r.isError)).toHaveLength(1);
    for (const refused of results.filter((r) => r.isError)) expect(refused.text).toMatch(/already at this table/);
    await eventually(() => activePlayers(gm), (n) => n === 1);
    gm.close();
  });

  it("gives exactly one of several connections the last seat, and the room stays at the cap", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    for (let i = 0; i < MAX_PLAYERS_PER_ROOM - 1; i++) await stack.room.join(inviteCode, `Player ${i}`);
    const results = await Promise.all(["A", "B", "C"].map((name, i) => (i % 2 ? other : stack.ai).call("join_room", { invite: inviteCode, name })));
    expect(results.filter((r) => !r.isError)).toHaveLength(1);
    for (const refused of results.filter((r) => r.isError)) expect(refused.text).toMatch(/room is full/);
    await eventually(() => activePlayers(gm), (n) => n === MAX_PLAYERS_PER_ROOM);
    gm.close();
  });

  it("lets a person join a full table after the GM removes an AI seat", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const ai = await joinAs(stack.ai, inviteCode, "Oswin");
    for (let i = 0; i < MAX_PLAYERS_PER_ROOM - 1; i++) await stack.room.join(inviteCode, `Player ${i}`);
    expect((await stack.room.tryJoin(inviteCode, "Dana")).status).toBe(409);
    await eventually(() => activePlayers(gm), (n) => n === MAX_PLAYERS_PER_ROOM);
    await gmDoes(gm, { type: "participant.revoke", participantId: ai.participantId });
    expect((await stack.room.tryJoin(inviteCode, "Dana")).status).toBe(200);
    gm.close();
  });
});

describe("returning in a new chat (FR-PL-08)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  it("is refused with the fix in the error, and after the GM removes the old seat can rejoin and be given its token", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const old = await joinAs(stack.ai, inviteCode, "Oswin");
    const token = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [old.participantId] });

    // A new chat has no seat value, only the invite.
    const refused = await stack.ai.call("join_room", { invite: inviteCode, name: "Oswin" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/ask the GM to remove it/);

    await gmDoes(gm, { type: "participant.revoke", participantId: old.participantId });
    const fresh = await joinAs(stack.ai, inviteCode, "Oswin");
    expect(fresh.participantId).not.toBe(old.participantId);
    await eventually(() => gm.state.participants[fresh.participantId], Boolean);

    const reply = await gm.command({ type: "participant.resolveDeparture", participantId: old.participantId, actions: [{ tokenId: token, action: "reassign", to: fresh.participantId }] });
    expect(reply.type).toBe("ack");
    const view = await eventually(() => stack.ai.call("get_view", { seat: fresh.seat }), (v) => viewTokens(v).some((t) => t.id === token && t.yours));
    expect(viewTokens(view).find((t) => t.id === token)).toMatchObject({ yours: true });
    gm.close();
  });
});
