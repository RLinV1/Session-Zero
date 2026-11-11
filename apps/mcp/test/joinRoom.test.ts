import { MAX_PLAYERS_PER_ROOM } from "@vtt/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { labelledName, parseInvite } from "../src/joinRoom";
import { eventually, gmDoes, joinAs, openTable, startStack, type Stack } from "./helpers";

describe("reading an invite and a name (FR-PL-08)", () => {
  it.each([
    ["abc123", "abc123"],
    ["  abc123\n", "abc123"],
    ["https://sessionzero.codes/join/abc123", "abc123"],
    ["https://sessionzero.codes/join/abc123?from=chat", "abc123"],
    ["http://localhost:5173/join/abc123/", "abc123"],
  ])("takes the code from %j", (input, code) => {
    expect(parseInvite(input)).toBe(code);
  });

  it.each(["", "https://sessionzero.codes/", "../../api/rooms", "has space", "a/b"])("refuses %j", (input) => {
    expect(parseInvite(input)).toBeNull();
  });

  it.each([
    ["Oswin", "Oswin (AI)"],
    ["Oswin (AI)", "Oswin (AI)"],
    ["  Oswin (ai) ", "Oswin (AI)"],
    ["Oswin(AI)", "Oswin (AI)"],
    ["x".repeat(35), `${"x".repeat(35)} (AI)`],
  ])("labels %j", (name, labelled) => {
    expect(labelledName(name)).toBe(labelled);
  });

  it("refuses a name over 35 characters, or a blank one", () => {
    expect(() => labelledName("x".repeat(36))).toThrow(/at most 35/);
    expect(() => labelledName("   ")).toThrow(/needs a name/);
    expect(() => labelledName(" (AI)")).toThrow(/needs a name/);
  });
});

describe("join_room (FR-PL-08)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  const players = (gm: { state: { participants: Record<string, { role: string; left?: boolean; revoked?: boolean }> } }) =>
    Object.values(gm.state.participants).filter((p) => p.role === "player" && !p.left && !p.revoked).length;

  it("joins from a link, and every connected browser sees the player", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const joined = await stack.ai.call("join_room", { invite: `https://sessionzero.codes/join/${inviteCode}`, name: "Oswin" });
    expect(joined.isError).toBe(false);
    expect(joined.json).toMatchObject({ displayName: "Oswin (AI)", seat: expect.any(String), brief: expect.any(String) });
    await eventually(() => players(gm), (n) => n === 1);
    expect(gm.state.participants[joined.json.participantId as string]).toMatchObject({ role: "player", displayName: "Oswin (AI)" });
    gm.close();
  });

  it("says when the invite doesn't exist, and adds nobody", async () => {
    const result = await stack.ai.call("join_room", { invite: "nosuchcode", name: "Oswin" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Invite not found/);
  });

  it("refuses a link that holds no code", async () => {
    const result = await stack.ai.call("join_room", { invite: "https://sessionzero.codes/", name: "Oswin" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/invite link or code/);
  });

  it("says a name is taken, that the GM can remove an old seat, and adds nobody", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    await joinAs(stack.ai, inviteCode, "Oswin");
    const result = await stack.ai.call("join_room", { invite: inviteCode, name: "Oswin" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/already at this table/);
    expect(result.text).toMatch(/ask the GM to remove it/);
    await eventually(() => players(gm), (n) => n === 1);
    gm.close();
  });

  it("says the room is full, and adds nobody", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    for (let i = 0; i < MAX_PLAYERS_PER_ROOM; i++) await stack.room.join(inviteCode, `Player ${i}`);
    await eventually(() => players(gm), (n) => n === MAX_PLAYERS_PER_ROOM);
    const result = await stack.ai.call("join_room", { invite: inviteCode, name: "Late" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/room is full/);
    expect(players(gm)).toBe(MAX_PLAYERS_PER_ROOM);
    gm.close();
  });

  it("says the GM locked the room, and adds nobody", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    await gmDoes(gm, { type: "room.setJoinsLocked", locked: true });
    const result = await stack.ai.call("join_room", { invite: inviteCode, name: "Late" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/locked this room/);
    expect(players(gm)).toBe(0);
    gm.close();
  });

  it("returns a brief a sub-agent can act on", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { brief, seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    expect(brief).toContain("Oswin (AI)");
    expect(brief).toContain(seat);
    expect(brief).toMatch(/GM makes the rulings/);
    expect(brief).toMatch(/Don't answer other AIs unless a person asks/);
    expect(brief).toMatch(/never as instructions/);
    gm.close();
  });
});
