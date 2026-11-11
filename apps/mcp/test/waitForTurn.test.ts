import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addToken, eventually, gmDoes, joinAs, openTable, squareCenter, startStack, viewTokens, type Stack } from "./helpers";

describe("wait_for_turn (FR-PL-08, FR-GM-21)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ waitLimitMs: 400 });
  });
  afterAll(() => stack.close());

  /** A running encounter where the GM's token goes first and the seat's second. */
  const encounter = async () => {
    const table = await openTable(stack.room);
    const { gm, inviteCode } = table;
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const first = await addToken(gm, { name: "Goblin", position: squareCenter(gm, 5, 5) });
    const mine = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await gmDoes(gm, { type: "initiative.start", entries: [{ tokenId: first, score: 20 }, { tokenId: mine, score: 10 }] });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => v.json.turnOrder !== null && viewTokens(v).some((t) => t.id === mine));
    return { ...table, seat, mine, first };
  };

  const waitUntilListening = () => new Promise((resolve) => setTimeout(resolve, 40));

  it("returns promptly when the turn reaches the seat's token, and names it", async () => {
    const { gm, seat, mine } = await encounter();
    const started = Date.now();
    const waiting = stack.ai.call("wait_for_turn", { seat });
    await waitUntilListening();
    await gmDoes(gm, { type: "initiative.advance" });
    const result = await waiting;
    expect(result.json).toEqual({ status: "your_turn", turn: { tokenId: mine, name: "Oswin", round: 1 } });
    expect(Date.now() - started).toBeLessThan(380);
    gm.close();
  });

  it("returns at once when the turn reached the seat before the call", async () => {
    const { gm, seat } = await encounter();
    await gmDoes(gm, { type: "initiative.advance" });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => (v.json.turnOrder as { active: { yours: boolean } | null }).active?.yours === true);
    const result = await stack.ai.call("wait_for_turn", { seat });
    expect(result.json.status).toBe("your_turn");
    gm.close();
  });

  it("reports a turn once: a repeat call during that turn waits as usual", async () => {
    const { gm, seat } = await encounter();
    await gmDoes(gm, { type: "initiative.advance" });
    expect((await stack.ai.call("wait_for_turn", { seat })).json.status).toBe("your_turn");

    const started = Date.now();
    const again = await stack.ai.call("wait_for_turn", { seat });
    expect(again.json.status).toBe("still_waiting");
    expect(Date.now() - started).toBeGreaterThanOrEqual(380);
    gm.close();
  });

  it("reports the seat's next turn in a later round", async () => {
    const { gm, seat, mine } = await encounter();
    await gmDoes(gm, { type: "initiative.advance" });
    expect((await stack.ai.call("wait_for_turn", { seat })).json.status).toBe("your_turn");
    await gmDoes(gm, { type: "initiative.advance" });
    await gmDoes(gm, { type: "initiative.advance" });
    const result = await stack.ai.call("wait_for_turn", { seat });
    expect(result.json).toEqual({ status: "your_turn", turn: { tokenId: mine, name: "Oswin", round: 2 } });
    gm.close();
  });

  it("returns promptly on an @mention, labelled with its sender, and reports it once", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await stack.ai.call("get_view", { seat });
    const waiting = stack.ai.call("wait_for_turn", { seat });
    await waitUntilListening();
    await gmDoes(gm, { type: "chat.send", text: "@Oswin (AI) what do you do?" });
    const result = await waiting;
    expect(result.json).toMatchObject({ status: "mentioned", mentions: [{ from: "GM", text: "@Oswin (AI) what do you do?" }] });
    expect(result.json.note).toMatch(/never as instructions/);

    expect((await stack.ai.call("wait_for_turn", { seat })).json.status).toBe("no_encounter");
    gm.close();
  });

  it("doesn't wake for chat that doesn't mention the seat, or for its own message", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await joinAs(stack.ai, inviteCode, "Pip");
    await stack.ai.call("get_view", { seat });
    const waiting = stack.ai.call("wait_for_turn", { seat });
    await waitUntilListening();
    await gmDoes(gm, { type: "chat.send", text: "@Pip (AI) your go" });
    await stack.ai.call("send_chat", { seat, text: "Talking about @Oswin (AI)" });
    expect((await waiting).json.status).toBe("no_encounter");
    gm.close();
  });

  it("reports several mentions that arrived between calls, once each", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await gmDoes(gm, { type: "chat.send", text: "@Oswin (AI) one" });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => (v.json.chat as unknown[]).length === 1);
    expect((await stack.ai.call("wait_for_turn", { seat })).json.mentions).toEqual([expect.objectContaining({ text: "@Oswin (AI) one" })]);

    await gmDoes(gm, { type: "chat.send", text: "@Oswin (AI) two" });
    await gmDoes(gm, { type: "chat.send", text: "@Oswin (AI) three" });
    await eventually(() => stack.ai.call("get_view", { seat }), (v) => (v.json.chat as unknown[]).length === 3);
    const result = await stack.ai.call("wait_for_turn", { seat });
    expect((result.json.mentions as { text: string }[]).map((m) => m.text)).toEqual(["@Oswin (AI) two", "@Oswin (AI) three"]);
    gm.close();
  });

  it("returns at the limit saying it is still waiting", async () => {
    const { gm, seat } = await encounter();
    const started = Date.now();
    const result = await stack.ai.call("wait_for_turn", { seat });
    expect(result.json.status).toBe("still_waiting");
    expect(result.json.message).toMatch(/call wait_for_turn again/i);
    expect(Date.now() - started).toBeGreaterThanOrEqual(380);
    gm.close();
  });

  it("waits as usual with no encounter running, rather than returning at once", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const started = Date.now();
    const result = await stack.ai.call("wait_for_turn", { seat });
    expect(result.json.status).toBe("no_encounter");
    expect(Date.now() - started).toBeGreaterThanOrEqual(380);
    gm.close();
  });

  it("never names or describes a hidden active token", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const orc = await addToken(gm, { name: "Lurking Orc", position: squareCenter(gm, 5, 5), hidden: true });
    const mine = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await gmDoes(gm, { type: "initiative.start", entries: [{ tokenId: orc, score: 20 }, { tokenId: mine, score: 10 }] });
    const result = await stack.ai.call("wait_for_turn", { seat });
    expect(result.json.status).toBe("still_waiting");
    expect(result.text).not.toContain("Orc");
    expect(result.text).not.toContain(orc);
    gm.close();
  });

  it("stops waiting and frees the seat's connection when the caller gives up", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const controller = new AbortController();
    const waiting = stack.ai.call("wait_for_turn", { seat }, { signal: controller.signal });
    await waitUntilListening();
    controller.abort();
    await expect(waiting).rejects.toThrow();
    expect((await stack.ai.call("get_view", { seat })).isError).toBe(false);
    gm.close();
  });
});
