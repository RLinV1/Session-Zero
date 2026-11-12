import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addToken, eventually, gmDoes, joinAs, openTable, squareCenter, startStack, type Stack } from "./helpers";

describe("an AI seat ends its turn (FR-GM-21, ADR 0060)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  const fight = async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat, participantId } = await joinAs(stack.ai, inviteCode, "Oswin");
    const oswin = await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    const goblin = await addToken(gm, { name: "Goblin", position: squareCenter(gm, 3, 3) });
    return { gm, seat, oswin, goblin };
  };

  it("hands the turn on for everyone when it is the seat's turn", async () => {
    const { gm, seat, oswin, goblin } = await fight();
    await gmDoes(gm, { type: "initiative.start", entries: [{ tokenId: oswin, score: 20 }, { tokenId: goblin, score: 10 }] });
    // The seat's view catches up with the start on its own; a refusal until then changes nothing.
    const ended = await eventually(() => stack.ai.call("end_turn", { seat }), (r) => !r.isError);
    expect(ended.json).toEqual({ ended: "Oswin", round: 1 });
    await eventually(() => gm.state.initiative?.activeIndex, (i) => i === 1);
    gm.close();
  });

  it("says it isn't the seat's turn, and the turn doesn't move", async () => {
    const { gm, seat, oswin, goblin } = await fight();
    await gmDoes(gm, { type: "initiative.start", entries: [{ tokenId: goblin, score: 20 }, { tokenId: oswin, score: 10 }] });
    const result = await stack.ai.call("end_turn", { seat });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/isn't your turn|no encounter/i);
    expect(gm.state.initiative?.activeIndex).toBe(0);
    gm.close();
  });

  it("says when no encounter is running", async () => {
    const { gm, seat } = await fight();
    const result = await stack.ai.call("end_turn", { seat });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/No encounter is running/);
    gm.close();
  });
});
