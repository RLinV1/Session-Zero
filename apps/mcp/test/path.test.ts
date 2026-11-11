import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./helpers";

describe("the path from an AI app to a room (FR-PL-08)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());

  it("negotiates the SDK's latest protocol version over stateless HTTP", () => {
    expect(stack.ai.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("offers every planned tool, with zod 4 schemas turned into JSON Schema", async () => {
    const { tools } = await stack.ai.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_move", "get_map_image", "get_view", "join_room", "leave_room", "move_token",
      "roll_attack", "roll_dice", "send_chat", "set_door", "wait_for_turn",
    ]);
    const join = tools.find((t) => t.name === "join_room")!;
    expect(join.inputSchema.required).toEqual(["invite", "name"]);
    expect(join.inputSchema.properties).toHaveProperty("invite.type", "string");
  });

  it("validates tool input with those schemas", async () => {
    const result = await stack.ai.call("get_view", {});
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/seat/);
  });

  it("joins a room from an invite and sees it", async () => {
    const { inviteCode, roomId, guestToken } = await stack.room.createRoom("GM", { roomName: "The Keep" });
    const gm = await stack.room.connect({ roomId, guestToken });
    const joined = await stack.ai.call("join_room", { invite: inviteCode, name: "Oswin" });
    expect(joined.isError).toBe(false);
    expect(joined.json.displayName).toBe("Oswin (AI)");

    const view = await stack.ai.call("get_view", { seat: joined.json.seat });
    expect(view.isError).toBe(false);
    expect(view.json).toMatchObject({ room: "The Keep", you: { name: "Oswin (AI)" } });
    expect(view.json.people).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "GM", role: "gm", isYou: false }),
      expect.objectContaining({ name: "Oswin (AI)", role: "player", isYou: true }),
    ]));
    gm.close();
  });
});
