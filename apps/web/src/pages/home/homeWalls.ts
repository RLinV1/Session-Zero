import type { Point, Portal } from "@vtt/shared";

/**
 * The walls of the home page's own maps, in each map's own pixels (its source in
 * scripts/home-src, before cropping), stored the way a room stores walls: a segment, and a door
 * or window when it is one. Traced by hand from the drawings, measured along scanlines of the
 * dark wall bands. The page moves them onto each crop with the same arithmetic that cuts it
 * (crops.ts `toCrop`).
 */
export interface HomeWall {
  a: Point;
  b: Point;
  portal?: Portal;
}

const wall = (x1: number, y1: number, x2: number, y2: number, portal?: Portal): HomeWall => ({
  a: { x: x1, y: y1 },
  b: { x: x2, y: y2 },
  ...(portal ? { portal } : {}),
});

/** A thick wall drawn as a solid band: its four faces. */
function block(x0: number, y0: number, x1: number, y1: number): HomeWall[] {
  return [wall(x0, y0, x1, y0), wall(x1, y0, x1, y1), wall(x1, y1, x0, y1), wall(x0, y1, x0, y0)];
}

type Opening = [from: number, to: number, portal: Portal];
const door = (from: number, to: number, state: Portal["state"] = "closed"): Opening => [from, to, { kind: "door", state }];
const pane = (from: number, to: number): Opening => [from, to, { kind: "window", state: "closed" }];

/**
 * A straight wall along its centre line, horizontal (`y` fixed) or vertical (`x` fixed), from
 * `from` to `to`, with doors and windows set into it: wall pieces between the openings, and each
 * opening as its own door or window segment.
 */
function line(axis: "h" | "v", at: number, from: number, to: number, openings: Opening[] = []): HomeWall[] {
  const point = (t: number): [number, number] => (axis === "h" ? [t, at] : [at, t]);
  const out: HomeWall[] = [];
  let cursor = from;
  for (const [a, b, portal] of [...openings].sort((p, q) => p[0] - q[0])) {
    if (a > cursor) out.push(wall(...point(cursor), ...point(a)));
    out.push(wall(...point(a), ...point(b), portal));
    cursor = b;
  }
  if (to > cursor) out.push(wall(...point(cursor), ...point(to)));
  return out;
}

/** The sun tomb: a pillared hall, its side chamber, the entrance stair and a collapsed passage. */
const SUN_TOMB: HomeWall[] = [
  ...block(111, 299, 1121, 340), // the hall's north wall, west of the chamber's doorway
  ...block(1179, 299, 1387, 340), // ... and east of it
  ...block(981, 43, 1027, 299), // the side chamber: west, north and east walls
  ...block(981, 43, 1386, 84),
  ...block(1340, 43, 1386, 352),
  ...block(111, 299, 157, 495), // the hall's west wall, either side of the stair
  ...block(111, 687, 157, 921),
  ...block(0, 447, 111, 495), // the stair's walls
  ...block(0, 687, 111, 738),
  ...block(110, 865, 1344, 921), // the hall's south wall
  ...block(1288, 340, 1344, 582), // the hall's east wall, either side of the passage
  ...block(1288, 640, 1344, 921),
  ...block(1344, 537, 1536, 569), // the collapsed passage's walls
  ...block(1344, 639, 1536, 685),
  // The eight square pillars of the hall.
  ...[331, 522, 715, 906].flatMap((x) => [432, 692].flatMap((y) => block(x, y, x + 68, y + 68))),
];

/** The canal market: the fronts and sides of the two houses on the quay, each with its door. */
const CANAL_MARKET: HomeWall[] = [
  ...line("h", 186, 0, 627, [door(296, 349)]),
  ...line("v", 627, 0, 186),
  ...line("v", 907, 0, 186),
  ...line("h", 186, 907, 1536, [door(1200, 1260)]),
];

/** The moor inn's ground floor: walls on their centre lines, with its doors and windows. */
const MOOR_INN: HomeWall[] = [
  ...line("h", 118, 93, 1110, [pane(200, 268), pane(385, 445), pane(690, 755), pane(935, 1000)]),
  ...line("v", 93, 118, 818, [pane(205, 275), pane(590, 660)]),
  ...line("h", 818, 93, 1110, [pane(182, 270), door(382, 480, "open"), pane(550, 635), pane(740, 825), pane(945, 1030)]),
  ...line("v", 1110, 118, 818, [door(335, 390, "open"), door(440, 535, "locked")]),
  // The common room's east wall, with its doors to the kitchen and the corridor.
  ...line("v", 615, 118, 550, [door(305, 370, "open"), door(470, 532, "open")]),
  ...line("h", 428, 615, 1110), // kitchen | corridor
  ...line("h", 550, 615, 1110, [door(715, 770, "open"), door(905, 960, "open")]), // corridor | bedrooms
  ...line("v", 680, 550, 818), // stair | first bedroom
  ...line("v", 885, 550, 818), // between the bedrooms
];

export const HOME_WALLS: Partial<Record<string, readonly HomeWall[]>> = {
  "sun-tomb": SUN_TOMB,
  "canal-market": CANAL_MARKET,
  "moor-inn": MOOR_INN,
};
