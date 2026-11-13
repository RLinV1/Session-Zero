import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type AttackRange, type DiagonalRule, type RoomState, type Token } from "@vtt/shared";
import { attackAim } from "../src/board/attackAim";

const grid = { ...DEFAULT_GRID, cellSize: 70, offsetX: 0, offsetY: 0 };
const room = (rule: DiagonalRule = "equal"): RoomState => ({ ...emptyRoomState("r"), scene: { map: null, grid }, diagonalRule: rule });
const token = (id: string, col: number, row: number, size = 1): Token => ({
  id, name: id, position: { x: (col + size / 2) * 70, y: (row + size / 2) * 70 }, size, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [],
});

const aria = token("aria", 0, 0);
const goblin = token("goblin", 1, 0);
const orc = token("orc", 6, 0);
const LONGSWORD: AttackRange = { kind: "melee" };

describe("the aim while picking a target on the board (attack-targeting, attack-range)", () => {
  it("draws normally over an in-range token and red, saying so, over one out of range", () => {
    expect(attackAim(room(), aria, goblin, LONGSWORD)).toEqual({ outOfRange: false, label: "5 ft" });
    expect(attackAim(room(), aria, orc, LONGSWORD)).toEqual({ outOfRange: true, label: "30 ft · Out of range" });
  });

  it("stays normal with no range, as for the custom roll", () => {
    expect(attackAim(room(), aria, orc, null)).toEqual({ outOfRange: false, label: "30 ft" });
  });

  it("labels the distance under the room's Diagonals rule, as the ruler does", () => {
    const diagonal = token("goblin2", 2, 2);
    expect(attackAim(room("equal"), aria, diagonal, null).label).toBe("10 ft");
    expect(attackAim(room("alternating"), aria, diagonal, null).label).toBe("15 ft");
    expect(attackAim(room("euclidean"), aria, diagonal, null).label).toBe("14.1 ft");
  });

  it("measures to a large token's nearest square", () => {
    expect(attackAim(room(), aria, token("ogre", 2, 0, 2), null).label).toBe("10 ft");
  });
});

describe("the aim over an empty square (attack-range)", () => {
  const square = (col: number, row: number) => ({ position: { x: col * 70 + 35, y: row * 70 + 35 }, size: 1 });
  it("measures to the square under the pointer and says when it is out of range", () => {
    expect(attackAim(room(), aria, square(1, 1), LONGSWORD)).toEqual({ outOfRange: false, label: "5 ft" });
    expect(attackAim(room(), aria, square(3, 0), LONGSWORD)).toEqual({ outOfRange: true, label: "15 ft · Out of range" });
    expect(attackAim(room(), aria, square(16, 0), { kind: "ranged", distance: 80 })).toEqual({ outOfRange: false, label: "80 ft" });
    expect(attackAim(room(), aria, square(17, 0), { kind: "ranged", distance: 80 }).outOfRange).toBe(true);
  });
});
