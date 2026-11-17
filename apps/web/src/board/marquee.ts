import { can, type Participant, type Point, type Token } from "@vtt/shared";

/** A box on the board, in board coordinates (map image pixels, invariant 8). */
export interface BoardBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box with `a` and `b` at opposite corners, whichever way it was dragged. */
export function boxBetween(a: Point, b: Point): BoardBox {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/**
 * The tokens a Shift-drag box selects (ADR 0074): those whose centre lies inside it, edges
 * included, that `you` may control. Only the GM drags one today, and the GM controls every token;
 * the check keeps a player from ever selecting a token they don't own.
 */
export function tokensInBox(tokens: readonly Token[], a: Point, b: Point, you: Participant): string[] {
  const box = boxBetween(a, b);
  return tokens
    .filter((token) => can.moveToken(you, token))
    .filter(({ position: p }) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height)
    .map((token) => token.id);
}
