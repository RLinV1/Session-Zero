import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type RoomState, type Token } from "@vtt/shared";
import { adjustedMessage, offersTokenPolicy, prepCommand, startPrep, TOKEN_POLICY_CHOICES } from "../src/pages/mapPrep";

const oldMap = { url: "/uploads/old.png", width: 1000, height: 800 };
const newMap = { url: "/uploads/new.png", width: 2000, height: 1600 };

const token = (id: string): Token => ({
  id, name: id, position: { x: 105, y: 105 }, size: 1, rotation: 0, color: "#ff0000", imageUrl: null, assetId: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
});

function room(tokens: Token[], map: typeof oldMap | null = oldMap): RoomState {
  const base = emptyRoomState("room");
  return { ...base, scene: { ...base.scene, map }, tokens: Object.fromEntries(tokens.map((t) => [t.id, t])) };
}

describe("choosing what happens to tokens on a map change (KAN-67)", () => {
  it("is offered only when a map is set and tokens exist", () => {
    expect(offersTokenPolicy(room([token("a")]))).toBe(true);
    expect(offersTokenPolicy(room([]))).toBe(false);
    expect(offersTokenPolicy(room([token("a")], null))).toBe(false);
  });

  it("lists scale first, so it is the default choice, and matches the contract values", () => {
    expect(TOKEN_POLICY_CHOICES.map((c) => c.value)).toEqual(["scale", "keep", "recenter"]);
  });

  it("sends the choice with the map and grid, and omits it when none is asked", () => {
    const prep = startPrep(newMap, undefined, DEFAULT_GRID, { boardEpoch: 0, revision: 0 });
    expect(prepCommand(prep, { tokenPolicy: "recenter" })).toMatchObject({ type: "scene.setMap", tokenPolicy: "recenter" });
    expect(prepCommand(prep)).not.toHaveProperty("tokenPolicy");
  });

  it("sends Select and place as the tokens to keep, with no policy (ADR 0068)", () => {
    const prep = startPrep(newMap, undefined, DEFAULT_GRID, { boardEpoch: 0, revision: 0 });
    const command = prepCommand(prep, { placeTokenIds: ["aria"] });
    expect(command).toMatchObject({ type: "scene.setMap", placeTokenIds: ["aria"] });
    expect(command).not.toHaveProperty("tokenPolicy");
  });

  it("words the confirmation, and says nothing when no token moved", () => {
    expect(adjustedMessage(3)).toBe("3 tokens adjusted");
    expect(adjustedMessage(1)).toBe("1 token adjusted");
    expect(adjustedMessage(0)).toBeNull();
  });
});
