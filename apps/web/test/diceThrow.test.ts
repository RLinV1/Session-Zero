import { describe, expect, it } from "vitest";
import { attackAim, ownDiceShowing, rollAim, BOARD_THROW_MAX_DICE, boardDiePaths, boardDieSize, centreThrow, clientToBoard, crowdedOffset, holdEvent, releaseVelocity, throwBlocker, throwLanding } from "../src/board/diceThrow";

const canvas = { left: 100, top: 50, width: 800, height: 600 };
const map = { width: 1400, height: 1000 };
const grid = { cellSize: 70 };

describe("throwing dice onto the board (throw-dice-on-board, FR-TAC-09)", () => {
  describe("clientToBoard", () => {
    it("undoes the isometric projection after pan and zoom", () => {
      const view = { scale: 2, x: 350, y: 40, isometric: true };
      const board = { x: 200, y: 120 };
      const client = { x: canvas.left + view.x + Math.sqrt(3) / 2 * (board.x - board.y) * view.scale,
        y: canvas.top + view.y + (board.x + board.y) / 2 * view.scale };
      const back = clientToBoard(client, canvas, view)!;
      expect(back.x).toBeCloseTo(board.x);
      expect(back.y).toBeCloseTo(board.y);
    });

    it("undoes the world transform", () => {
      const view = { scale: 2, x: -300, y: 40 };
      const board = { x: 250, y: 130 };
      // Where that board point is drawn on the page.
      const client = { x: canvas.left + view.x + board.x * view.scale, y: canvas.top + view.y + board.y * view.scale };
      const back = clientToBoard(client, canvas, view)!;
      expect(back.x).toBeCloseTo(board.x);
      expect(back.y).toBeCloseTo(board.y);
    });

    it("is null off the canvas", () => {
      expect(clientToBoard({ x: 99, y: 300 }, canvas, { scale: 1, x: 0, y: 0 })).toBeNull();
      expect(clientToBoard({ x: 500, y: 651 }, canvas, { scale: 1, x: 0, y: 0 })).toBeNull();
    });
  });

  describe("throwBlocker", () => {
    it(`allows up to ${BOARD_THROW_MAX_DICE} dice and no more`, () => {
      expect(throwBlocker("10d6", true)).toBeNull();
      expect(throwBlocker("1d20+5", true)).toBeNull();
      expect(throwBlocker("11d6", true)).toMatch(/At most 10 dice/);
      expect(throwBlocker("12d6", true)).toMatch(/At most 10 dice/);
    });

    it("needs a valid expression and a map", () => {
      expect(throwBlocker("banana", true)).toMatch(/valid expression/);
      expect(throwBlocker("2d6", false)).toMatch(/needs a map/);
    });

    it("keeps private rolls off the board (board-dice-rolls)", () => {
      expect(throwBlocker("2d6", true, true)).toMatch(/Private rolls stay off the board/);
    });
  });

  describe("releaseVelocity", () => {
    it("measures the last 80 ms only", () => {
      const samples = [
        { x: 0, y: 0, t: 0 },
        { x: 10, y: 0, t: 930 },
        { x: 50, y: 20, t: 990 },
      ];
      const v = releaseVelocity(samples, 1000);
      expect(v.x).toBeCloseTo(40 / 70);
      expect(v.y).toBeCloseTo(20 / 70);
    });

    it("is still for a die held still before release", () => {
      expect(releaseVelocity([{ x: 5, y: 5, t: 0 }, { x: 6, y: 5, t: 10 }], 1000)).toEqual({ x: 0, y: 0 });
    });
  });

  describe("throwLanding", () => {
    const from = { x: 700, y: 500 };
    const view = { scale: 1 };

    it("goes the way it was flicked, further for a faster flick", () => {
      const slow = throwLanding(from, { x: 0.2, y: 0 }, view, grid, map);
      const fast = throwLanding(from, { x: 1, y: 0 }, view, grid, map);
      expect(slow.x).toBeGreaterThan(from.x);
      expect(fast.x).toBeGreaterThan(slow.x);
      expect(slow.y).toBeCloseTo(from.y);
    });

    it("lands near the release when dropped, and at most 3 cells away", () => {
      const dropped = throwLanding(from, { x: 0, y: 0 }, view, grid, map);
      expect(Math.hypot(dropped.x - from.x, dropped.y - from.y)).toBeCloseTo(0.6 * grid.cellSize);
      const hard = throwLanding(from, { x: 50, y: 0 }, view, grid, map);
      expect(hard.x - from.x).toBeCloseTo(3 * grid.cellSize);
    });

    it("stays inside the map when flicked at the edge", () => {
      const edge = throwLanding({ x: 1380, y: 20 }, { x: 5, y: -5 }, view, grid, map);
      expect(edge.x).toBeLessThanOrEqual(map.width);
      expect(edge.y).toBeGreaterThanOrEqual(0);
      expect(edge.x).toBeGreaterThan(1380);
    });
  });

  describe("centreThrow", () => {
    const view = { scale: 1 };

    it("lands a Roll in the middle of the visible board, tossed in from up and to the left", () => {
      const aim = centreThrow({ x: 700, y: 500 }, view, grid, map);
      expect(aim.to).toEqual({ x: 700, y: 500 });
      expect(aim.from.x).toBeLessThan(aim.to.x);
      expect(aim.from.y).toBeLessThan(aim.to.y);
    });

    it("keeps it on the map when the middle of the view is off it, and anywhere with no map", () => {
      expect(centreThrow({ x: -300, y: 500 }, view, grid, map).to.x).toBeGreaterThanOrEqual(0);
      expect(centreThrow({ x: -300, y: 500 }, view, grid, null).to).toEqual({ x: -300, y: 500 });
    });
  });
});

describe("board throw paths (throw-dice-on-board, FR-TAC-09)", () => {
  const t = { rollId: "roll-1", from: { x: 300, y: 300 }, to: { x: 500, y: 360 } };
  const size = 42;

  it("leaves from the release point and rests around the landing point, inside the map", () => {
    const paths = boardDiePaths(t, 10, size, map);
    expect(paths[0]!.landing).toEqual(t.to);
    for (const { landing, path } of paths) {
      expect(Math.hypot(landing.x - t.to.x, landing.y - t.to.y)).toBeLessThanOrEqual(size * 1.1 * 3 + 1e-9);
      expect(Math.abs(landing.x + path.offset.x - t.from.x)).toBeLessThanOrEqual(size * 0.15);
      expect(Math.abs(landing.y + path.offset.y - t.from.y)).toBeLessThanOrEqual(size * 0.15);
    }
  });

  it("keeps dice thrown into a corner on the map", () => {
    for (const { landing } of boardDiePaths({ ...t, to: { x: 1, y: 1 } }, 10, size, map)) {
      expect(landing.x).toBeGreaterThanOrEqual(size / 2);
      expect(landing.y).toBeGreaterThanOrEqual(size / 2);
    }
  });

  it("doesn't hold dice in when there is no map", () => {
    expect(boardDiePaths({ ...t, to: { x: -50, y: -50 } }, 1, size, null)[0]!.landing).toEqual({ x: -50, y: -50 });
  });

  it("plays the same throw the same way", () => {
    expect(boardDiePaths(t, 4, size, map)).toEqual(boardDiePaths(t, 4, size, map));
    expect(boardDiePaths(t, 4, size, map)).not.toEqual(boardDiePaths({ ...t, rollId: "roll-2" }, 4, size, map));
  });

  it("sizes dice to the grid, never smaller on screen than the held die", () => {
    expect(boardDieSize({ cellSize: 70 }, { scale: 1 })).toBeCloseTo(63);
    // Zoomed out, 0.9 cells would be 16 px on screen; the die stays 44 px.
    expect(boardDieSize({ cellSize: 70 }, { scale: 0.25 })).toBeCloseTo(176);
  });
});

describe("holding the die (throw-dice-on-board, FR-TAC-09)", () => {
  const e = (type: string, buttons = 1, pointerId = 1) => ({ type, pointerId, buttons });

  it("follows the held pointer and throws on its release", () => {
    expect(holdEvent(1, e("pointermove"))).toBe("move");
    expect(holdEvent(1, e("pointerup", 0))).toBe("release");
  });

  it("ends the hold when its release can no longer arrive, so the die can't stick to the pointer", () => {
    // The button came up somewhere the handle never heard about (a context menu, another window).
    expect(holdEvent(1, e("pointermove", 0))).toBe("end");
    expect(holdEvent(1, e("lostpointercapture", 0))).toBe("end");
    expect(holdEvent(1, e("pointercancel", 0))).toBe("end");
  });

  it("ignores other pointers, and everything when nothing is held", () => {
    expect(holdEvent(1, e("pointerup", 0, 2))).toBe("ignore");
    expect(holdEvent(1, e("pointermove", 1, 2))).toBe("ignore");
    expect(holdEvent(null, e("pointermove"))).toBe("ignore");
    // Capture is released right after a release too; by then nothing is held.
    expect(holdEvent(null, e("lostpointercapture", 0))).toBe("ignore");
  });
});

describe("rolls made together lie apart (multi-target attacks, FR-TAC-09)", () => {
  it("lands the first where aimed and the rest to its right and left, never on one another", () => {
    const size = 70;
    const xs = [0, 1, 2, 3].map((n) => crowdedOffset(n, size).x);
    expect(xs[0]).toBe(0);
    expect(new Set(xs).size).toBe(4);
    for (const a of xs) for (const b of xs) if (a !== b) expect(Math.abs(a - b)).toBeGreaterThanOrEqual(size * 2);
  });
});

describe("attack throws go from the attacker toward the target (shared-roll-throws)", () => {
  const side = (tokenId: string) => ({ tokenId, name: tokenId, hidden: false });
  const attack = { actor: side("a"), target: side("t") };
  const at = (x: number, y: number) => ({ position: { x, y } });

  it("lands a cell short of the target, thrown from the attacker", () => {
    const aim = attackAim(attack, { a: at(140, 500), t: at(140 + 3 * 70, 500) }, grid, map)!;
    expect(aim.to.x).toBeCloseTo(140 + 2 * 70);
    expect(aim.to.y).toBeCloseTo(500);
    expect(aim.from.x).toBeCloseTo(140);
  });

  it("lands halfway between adjacent tokens", () => {
    const aim = attackAim(attack, { a: at(140, 500), t: at(210, 500) }, grid, map)!;
    expect(aim.to.x).toBeCloseTo(175);
    expect(aim.from.x).toBeCloseTo(140);
  });

  it("travels no further than a hand throw for a distant target", () => {
    const aim = attackAim(attack, { a: at(100, 100), t: at(100 + 20 * 70, 100) }, grid, { width: 2000, height: 1000 })!;
    expect(aim.to.x).toBeCloseTo(100 + 19 * 70);
    expect(Math.hypot(aim.to.x - aim.from.x, aim.to.y - aim.from.y)).toBeCloseTo(3 * 70);
  });

  it("stays on the map", () => {
    const aim = attackAim(attack, { a: at(1390, 990), t: at(1399, 999 + 300) }, grid, map)!;
    for (const p of [aim.from, aim.to]) {
      expect(p.x).toBeLessThanOrEqual(map.width);
      expect(p.y).toBeLessThanOrEqual(map.height);
    }
  });

  it("is null when a side was blanked, a token is missing, or both stand on one spot", () => {
    const tokens = { a: at(140, 500), t: at(350, 500) };
    expect(attackAim({ actor: side("a"), target: null }, tokens, grid, map)).toBeNull();
    expect(attackAim({ actor: null, target: side("t") }, tokens, grid, map)).toBeNull();
    expect(attackAim(attack, { a: at(140, 500) }, grid, map)).toBeNull();
    expect(attackAim(attack, { a: at(140, 500), t: at(140, 500) }, grid, map)).toBeNull();
    expect(attackAim(undefined, tokens, grid, map)).toBeNull();
  });
});

describe("every public roll is thrown on every board (shared-roll-throws)", () => {
  const centre = { from: { x: 0, y: 0 }, to: { x: 500, y: 400 } };
  const drop = { from: { x: 10, y: 10 }, to: { x: 60, y: 30 } };
  const table = {
    tokens: { a: { position: { x: 140, y: 500 } }, t: { position: { x: 350, y: 500 } } },
    scene: { grid, map },
  };
  const side = (tokenId: string) => ({ tokenId, name: tokenId, hidden: false });
  const attack = { actor: side("a"), target: side("t"), kind: "toHit" as const, label: null };

  it("throws another player's Roll-button roll into the middle of this board", () => {
    expect(rollAim({ visibility: "public" }, null, table, () => centre)).toEqual(centre);
  });

  it("throws an attack roll from the attacker toward the target", () => {
    const aim = rollAim({ visibility: "public", attack }, null, table, () => centre)!;
    expect(aim.from.x).toBeCloseTo(140);
    expect(aim.to.x).toBeCloseTo(280);
  });

  it("throws an attack on a target hidden from this viewer into the middle", () => {
    expect(rollAim({ visibility: "public", attack: { ...attack, target: null } }, null, table, () => centre)).toEqual(centre);
  });

  it("lands a dropped die where it was let go, and a missed drop in the middle", () => {
    expect(rollAim({ visibility: "public", attack }, drop, table, () => centre)).toEqual(drop);
    expect(rollAim({ visibility: "public" }, null, table, () => centre)).toEqual(centre);
  });

  it("never throws a GM-only roll on the board", () => {
    expect(rollAim({ visibility: "gm" }, null, table, () => centre)).toBeNull();
    expect(rollAim({ visibility: "gm", attack }, drop, table, () => centre)).toBeNull();
  });
});

describe("other participants' dice never hold your roll controls (shared-roll-throws)", () => {
  const rolls = [{ id: "r1", byParticipantId: "other" }, { id: "r2", byParticipantId: "me" }];

  it("does not wait for another player's dice in the air", () => {
    expect(ownDiceShowing(new Set(), new Set(["r1"]), rolls, "me")).toBe(false);
  });

  it("waits for your own dice in the air or still on the board", () => {
    expect(ownDiceShowing(new Set(), new Set(["r2"]), rolls, "me")).toBe(true);
    expect(ownDiceShowing(new Set(["r2"]), new Set(), rolls, "me")).toBe(true);
  });
});
