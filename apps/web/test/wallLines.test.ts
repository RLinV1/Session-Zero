import { describe, expect, it } from "vitest";
import { EMPTY_STATS, emptyRoomState, filterStateForViewer, type Participant, type RoomState, type Token } from "@vtt/shared";
import { plainWallLines } from "../src/board/wallLines";
import { dragPlan } from "../src/board/movementRuler";

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };
/** The centre of square (col, row) on the default 70 px grid. */
const at = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });

const aria: Token = {
  id: "aria", name: "Aria", position: at(1, 1), size: 1, rotation: 0, color: "#c2410c", imageUrl: null,
  ownerIds: [alice.id], hidden: false, stats: EMPTY_STATS, conditions: [],
};

/** A 700 px map with a wall between columns 2 and 3 on rows 0-2, a door elsewhere, and Alice's token at (1,1). */
function room(): RoomState {
  const s = emptyRoomState("room");
  return {
    ...s,
    participants: { [gm.id]: gm, [alice.id]: alice },
    scene: { ...s.scene, map: { url: "/m.png", width: 700, height: 700 } },
    tokens: { aria },
    walls: {
      w: { id: "w", a: { x: 210, y: 0 }, b: { x: 210, y: 210 } },
      d: { id: "d", a: { x: 420, y: 420 }, b: { x: 490, y: 420 }, portal: { kind: "door", state: "closed" } },
    },
  } as RoomState;
}

describe("players' boards never draw plain walls (FR-GM-23, ADR 0056)", () => {
  it("draws no wall lines for the pieces in a player's state", () => {
    const view = filterStateForViewer(room(), alice);
    expect(Object.values(view.walls).some((w) => !w.portal)).toBe(true);
    expect(plainWallLines(view.walls, alice)).toEqual([]);
    expect(plainWallLines(view.walls, null)).toEqual([]);
  });

  it("draws every plain wall for the GM", () => {
    expect(plainWallLines(room().walls, gm).map((w) => w.id)).toEqual(["w"]);
  });

  it("routes a player's drag around a wall they can see", () => {
    const view = filterStateForViewer(room(), alice);
    const plan = dragPlan(view, alice, view.tokens.aria!, at(1, 1), at(4, 1), false, false, 30);
    expect(plan.via.length).toBeGreaterThan(0);
    expect(plan.via.some((p) => p.y >= at(0, 3).y)).toBe(true);
  });
});
