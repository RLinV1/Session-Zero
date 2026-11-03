import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type AreaEffect, type GridSpec, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import { areaShape, tokensTouchingArea } from "../src/board/tools";
import { defaultCaller, pendingRulingCount } from "../src/panels/attackRoll";
import { attackEffectFor } from "../src/board/effects";

const grid: GridSpec = DEFAULT_GRID; // 70 px cells, 5 ft per cell
const cell = (col: number, row: number): Point => ({ x: col * 70 + 35, y: row * 70 + 35 });
const at = (name: string, position: Point, size = 1) => ({ name, position, size });
const names = (tokens: { name: string }[]) => tokens.map((t) => t.name);

describe("Tokens touching an area (FR-TAC-06, ADR 0046)", () => {
  it("selects tokens a circle overlaps, including a Large token clipped at the edge", () => {
    // A 10 ft circle (two cells) centred on the corner between cells (4,4) and (5,5).
    const circle = areaShape("circle", { x: 350, y: 350 }, { x: 350, y: 350 }, 10, grid);
    const inside = at("Inside", cell(4, 4));
    // A Large token spanning cells (6,4)-(7,5): its left edge is 70 px from the centre, inside the radius.
    const large = at("Large", { x: 490, y: 350 }, 2);
    const outside = at("Outside", cell(8, 4));
    expect(names(tokensTouchingArea(circle, [inside, large, outside], grid))).toEqual(["Inside", "Large"]);
  });

  it("does not count a circle that only reaches a footprint's edge", () => {
    // Radius 70 from (350, 350): the square of cell (6,4) starts exactly 70 px away.
    const circle = areaShape("circle", { x: 350, y: 350 }, { x: 350, y: 350 }, 5, grid);
    expect(names(tokensTouchingArea(circle, [at("Next to the centre", cell(5, 4)), at("Edge only", cell(6, 4))], grid))).toEqual(["Next to the centre"]);
  });

  it("selects tokens in a cone and not beside it", () => {
    // A 30 ft cone from (0, 245) pointing right: 6 cells long and as wide at its far end.
    const cone = areaShape("cone", { x: 0, y: 245 }, { x: 420, y: 245 }, 30, grid);
    const ahead = at("Ahead", cell(4, 3));
    const beside = at("Beside", cell(0, 0));
    const behind = at("Behind", { x: -105, y: 245 });
    expect(names(tokensTouchingArea(cone, [ahead, beside, behind], grid))).toEqual(["Ahead"]);
  });

  it("selects tokens along a line, not ones that only share its edge", () => {
    // A 30 ft line one cell wide along row 2 (y from 140 to 210).
    const line = areaShape("line", { x: 0, y: 175 }, { x: 420, y: 175 }, 30, grid);
    const onIt = at("On it", cell(3, 2));
    const above = at("Above", cell(3, 1));
    expect(names(tokensTouchingArea(line, [onIt, above], grid))).toEqual(["On it"]);
  });

  it("selects tokens in a box", () => {
    // A 15 ft box centred on cell (4,4)'s centre: cells (3,3) to (5,5).
    const box = areaShape("box", cell(4, 4), { x: cell(4, 4).x + 1, y: cell(4, 4).y }, 15, grid);
    expect(names(tokensTouchingArea(box, [at("Corner", cell(5, 5)), at("Out", cell(6, 6))], grid))).toEqual(["Corner"]);
  });
});

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const mira: Participant = { id: "mira", role: "player", displayName: "Mira" };
const token = (id: string, ownerIds: string[]): Token => ({
  id, name: id, position: cell(0, 0), size: 1, rotation: 0, color: "#c0392b", imageUrl: null, ownerIds, hidden: false,
  stats: { hp: 10, maxHp: 10, ac: null }, conditions: [],
});

function room(overrides: Partial<RoomState> = {}): RoomState {
  return { ...emptyRoomState("r"), participants: { gm, mira }, ...overrides };
}

describe("Calling for damage (ADR 0046)", () => {
  it("pre-fills the owner of the token whose turn it is", () => {
    const state = room({ tokens: { wiz: token("wiz", ["mira"]) }, initiative: { order: ["wiz"], activeIndex: 0, round: 1 } });
    expect(defaultCaller(state, gm.id)).toBe("mira");
  });

  it("falls back to the GM with no encounter, an unowned token, or an owner who left", () => {
    expect(defaultCaller(room(), gm.id)).toBe("gm");
    const unowned = room({ tokens: { orc: token("orc", []) }, initiative: { order: ["orc"], activeIndex: 0, round: 1 } });
    expect(defaultCaller(unowned, gm.id)).toBe("gm");
    const left = room({
      participants: { gm, mira: { ...mira, left: true } },
      tokens: { wiz: token("wiz", ["mira"]) },
      initiative: { order: ["wiz"], activeIndex: 0, round: 1 },
    });
    expect(defaultCaller(left, gm.id)).toBe("gm");
  });
});

describe("Rulings pending with an Area Effect (attack-rulings, ADR 0046)", () => {
  const effect: AreaEffect = {
    id: "e", label: "Fireball", expression: "1d20", byParticipantId: "gm",
    targets: [], call: { participantId: "mira" }, damage: null,
  };

  it("counts an open effect as one, even while it waits on a player", () => {
    expect(pendingRulingCount(room())).toBe(0);
    expect(pendingRulingCount(room({ areaEffect: effect }))).toBe(1);
  });
});

describe("Damage numbers when an Area Effect is resolved (ADR 0046)", () => {
  const effect: AreaEffect = { id: "e", label: null, expression: "1d20", byParticipantId: "gm", targets: [], call: null, damage: null };
  const state = room({ tokens: { a: token("a", []), b: { ...token("b", []), hidden: true }, c: token("c", []) } });

  it("plays a number on every target that took damage, and none for heals, 0 or hidden targets", () => {
    const amounts = [{ tokenId: "a", amount: 9 }, { tokenId: "b", amount: 4 }, { tokenId: "c", amount: -3 }];
    expect(attackEffectFor({ type: "AreaEffectResolved", effect, amounts }, state, mira)).toEqual({ kind: "damages", hits: [{ tokenId: "a", amount: 9 }] });
    expect(attackEffectFor({ type: "AreaEffectResolved", effect, amounts }, state, gm)).toEqual({ kind: "damages", hits: [{ tokenId: "a", amount: 9 }, { tokenId: "b", amount: 4 }] });
    expect(attackEffectFor({ type: "AreaEffectResolved", effect, amounts: [{ tokenId: "c", amount: 0 }] }, state, gm)).toBeNull();
  });
});
