import { describe, expect, it } from "vitest";
import { Command } from "../src";
import { CreateRoomRequest } from "../src/protocol";
import { hasVisibleCharacter } from "../src/names";

const guestToken = "a".repeat(43);
const roomWith = (displayName: string) => CreateRoomRequest.safeParse({ roomName: "Room", displayName, guestToken }).success;
const tokenWith = (name: string) => Command.safeParse({ type: "token.create", name, position: { x: 0, y: 0 } }).success;

const invisible = ["\u034f", "a".slice(0, 0) + "\u200d", "\u2060", "\ufe0f", "\u034f\u200d\u2060", " \u034f ", "\u0301", "\u2800"];
const visible = ["Ann", "a\u034f", "\u00e9\u0301", "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}", "\u{1F44D}\u{1F3FD}", "\u2764\ufe0f", "\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645"];

describe("names need a visible character (KAN-61)", () => {
  it.each(invisible)("hasVisibleCharacter rejects %j", (name) => {
    expect(hasVisibleCharacter(name)).toBe(false);
  });
  it.each(invisible)("CreateRoomRequest rejects displayName %j", (name) => {
    expect(roomWith(name)).toBe(false);
  });
  it.each(invisible)("token.create rejects name %j", (name) => {
    expect(tokenWith(name)).toBe(false);
  });
  it.each(visible)("accepts %j in both validators", (name) => {
    expect(hasVisibleCharacter(name)).toBe(true);
    expect(roomWith(name)).toBe(true);
    expect(tokenWith(name)).toBe(true);
  });
});
