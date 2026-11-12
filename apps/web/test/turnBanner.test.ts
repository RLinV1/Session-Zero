import { describe, expect, it } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { turnBannerToken } from "../src/ui/TurnBanner";

const token = (id: string, name: string, ownerIds: string[]): Token => ({
  id, name, position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds, hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
});

const player = { id: "p1", role: "player" } as Participant;
const other = { id: "p2", role: "player" } as Participant;
const gm = { id: "g1", role: "gm" } as Participant;

function withTurn(activeIndex: number, order = ["goblin", "aria", "bran"], round = 2): RoomState {
  const base = emptyRoomState("room");
  return {
    ...base,
    tokens: { aria: token("aria", "Aria", ["p1"]), bran: token("bran", "Bran", ["p1"]), goblin: token("goblin", "Goblin", []) },
    initiative: { order, activeIndex, round },
  };
}

describe("turn banner (turn-notice, FR-GM-21)", () => {
  it("names the player's active token and the round", () => {
    expect(turnBannerToken(withTurn(1), player)).toEqual({ id: "aria", name: "Aria", round: 2 });
  });

  it("shows straight from the state, so a reload mid-turn shows it", () => {
    // No previous turn is needed: the banner reads only the current state.
    expect(turnBannerToken(withTurn(1), player)).not.toBeNull();
  });

  it("names the new token when the turn passes between two of the player's tokens", () => {
    expect(turnBannerToken(withTurn(2), player)?.name).toBe("Bran");
  });

  it("is absent for a token the player doesn't own, and for the GM", () => {
    expect(turnBannerToken(withTurn(0), player)).toBeNull();
    expect(turnBannerToken(withTurn(1), other)).toBeNull();
    expect(turnBannerToken(withTurn(1), gm)).toBeNull();
  });

  it("is absent while a token hidden from the player has the turn, or with no encounter", () => {
    // A player's order leaves hidden tokens out and points past its end (FR-GM-23).
    expect(turnBannerToken(withTurn(2, ["goblin", "aria"]), player)).toBeNull();
    expect(turnBannerToken({ ...withTurn(1), initiative: null }, player)).toBeNull();
  });

  it("names every turn's token for the GM who turned on Turn banner on every turn (turn-notice)", () => {
    expect(turnBannerToken(withTurn(0), gm, true)).toEqual({ id: "goblin", name: "Goblin", round: 2 });
    expect(turnBannerToken(withTurn(1), gm, true)?.name).toBe("Aria");
    expect(turnBannerToken({ ...withTurn(1), initiative: null }, gm, true)).toBeNull();
  });

  it("never widens a player's banner, whatever the setting says", () => {
    expect(turnBannerToken(withTurn(0), player, true)).toBeNull();
    expect(turnBannerToken(withTurn(1), other, true)).toBeNull();
  });
});
