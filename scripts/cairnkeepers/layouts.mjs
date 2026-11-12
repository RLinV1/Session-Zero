/**
 * The four Cairnkeepers maps as layouts: one character per 5 ft square, built from a few drawing
 * operations so the shapes stay easy to change. render-maps.mjs draws the art AND builds the walls,
 * the ice windows, the terrain and the obscuring fog from the same grid, so none of them can drift.
 *
 * Normal ground            Difficult ground          Blocked ground (no walls; you see across)
 *   .  trail, packed snow    *  deep snow              V  crevasse, gorge, chasm
 *   :  flagstones            ^  scree                  ~  open water
 *   _  floorboards           -  stream, meltwater      r  rubble
 *   c  cave floor            i  thin ice
 *   e  thick ice             b  scrub                Solid (walls on their faces, block sight)
 *   =  planks, bridge        d  drifted snow (inside)  X  rock, cliff, boulder
 *   s  stairs                                          #  masonry
 *   p  pines (obscuring)   Portals across a square     o  stone pillar
 *   v  steam (obscuring)     D  door   L  locked door  I  ice: walls of it are locked windows,
 *                            w  window                    so you see through but can't pass
 *
 * Props are in squares (c, r = top-left; w, h = size). `keys` are the GM key's labels.
 */

/** A grid from operations, applied in order onto a filled rectangle. */
function build(cols, rows, fill, ops) {
  const g = Array.from({ length: rows }, () => Array(cols).fill(fill));
  const set = (c, r, ch) => { if (c >= 0 && r >= 0 && c < cols && r < rows) g[r][c] = ch; };
  for (const [op, ch, ...a] of ops) {
    if (op === "rect") { const [c0, r0, c1, r1] = a; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(c, r, ch); }
    else if (op === "cells") for (const [c, r] of a[0]) set(c, r, ch);
    else if (op === "path") {
      // A walk through the points, `w` squares wide, stepping one square at a time.
      const [pts, w = 1] = a;
      for (let i = 0; i + 1 < pts.length; i++) {
        let [c, r] = pts[i]; const [c1, r1] = pts[i + 1];
        for (;;) {
          for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < w; dr++) set(c + dc, r + dr, ch);
          if (c === c1 && r === r1) break;
          c += Math.sign(c1 - c); r += Math.sign(r1 - r);
        }
      }
    } else if (op === "blob") {
      const [cx, cy, rx, ry] = a;
      for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++) for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++) {
        if (((c - cx) / rx) ** 2 + ((r - cy) / ry) ** 2 <= 1) set(c, r, ch);
      }
    } else if (op === "replace") {
      const [from, c0, r0, c1, r1] = a;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g[r]?.[c] !== undefined && from.includes(g[r][c])) set(c, r, ch);
    } else throw new Error(`Unknown layout op ${op}`);
  }
  return g.map((row) => row.join(""));
}

export const LAYOUTS = [
  {
    slug: "the-switchbacks",
    name: "The Switchbacks",
    kind: "outdoor",
    seed: 4101,
    grid: build(30, 20, "*", [
      // The cliff band at the top, with the way north through it.
      ["rect", "X", 0, 0, 29, 0], ["rect", "X", 0, 1, 9, 1], ["rect", "X", 14, 1, 21, 1], ["rect", "X", 27, 1, 29, 2],
      ["cells", "X", [[0, 2], [1, 2], [2, 2], [17, 2], [18, 2], [19, 2], [29, 3]]],
      ["rect", "^", 10, 1, 13, 2], ["rect", "^", 3, 2, 8, 3], ["rect", "^", 20, 2, 26, 3], ["rect", "^", 14, 2, 16, 3],
      // The rock spur down the middle, with scree spilling off it.
      ["rect", "X", 12, 3, 14, 5], ["cells", "X", [[13, 6], [12, 6]]], ["rect", "^", 10, 4, 11, 7], ["rect", "^", 15, 4, 16, 7],
      // The gorge, west to east, and the stream it becomes.
      ["path", "V", [[0, 10], [5, 10], [9, 9], [15, 10], [19, 10]], 2],
      ["path", "-", [[20, 10], [23, 12], [25, 15], [27, 17], [29, 19]], 1],
      ["path", "-", [[21, 11], [24, 14], [26, 16], [28, 18]], 1],
      // Pines: obscuring stands.
      ["blob", "p", 2.5, 5, 2.6, 1.8], ["blob", "p", 1.5, 15, 1.6, 2.6], ["blob", "p", 17, 15.5, 3, 2.2], ["blob", "p", 26, 7, 2.2, 1.8],
      // Scrub.
      ["blob", "b", 9, 17, 2, 1], ["blob", "b", 21, 5, 1.5, 1], ["blob", "b", 6, 6, 1.4, 0.9],
      // Boulders that block sight along the way up.
      ["cells", "X", [[10, 13], [11, 13], [10, 14], [6, 12], [8, 6], [23, 4], [2, 12], [27, 12], [28, 12], [14, 17], [13, 9], [14, 9], [21, 8], [22, 8], [22, 9]]],
      // The trail: up from the south, over the bridge, east along the ledge, north to the gap.
      ["path", ".", [[3, 19], [3, 16], [5, 15], [12, 15], [12, 12], [8, 11], [7, 11]], 2],
      ["path", "=", [[7, 9], [7, 10]], 2],
      ["path", ".", [[7, 8], [9, 7], [18, 7], [21, 6], [23, 5], [25, 3], [24, 0]], 2],
    ]),
    props: [
      { t: "cairn", c: 4, r: 17 }, { t: "cairn", c: 13, r: 11 }, { t: "cairn", c: 17, r: 6 },
      { t: "ropeBridge", c: 7, r: 9, w: 2, h: 2 },
      { t: "deadfall", c: 15, r: 12, w: 3, h: 1 },
      { t: "bones", c: 22, r: 9 },
    ],
    keys: [
      { n: "1", c: 4, r: 18, text: "Trailhead" }, { n: "2", c: 9, r: 14, text: "Lower switchback" },
      { n: "3", c: 8, r: 10, text: "Rope bridge" }, { n: "4", c: 15, r: 8, text: "The ledge" },
      { n: "5", c: 2.5, r: 5, text: "North pines" }, { n: "6", c: 17, r: 15.5, text: "Wolf pines" },
      { n: "7", c: 24.5, r: 1.5, text: "The gap" },
    ],
  },
  {
    slug: "greywater-tarn",
    name: "Greywater Tarn",
    kind: "outdoor",
    seed: 4202,
    grid: build(32, 22, "*", [
      ["rect", "X", 0, 0, 31, 0], ["rect", "X", 0, 1, 6, 1], ["rect", "X", 26, 1, 31, 1],
      // The lake: thin ice, thicker in the middle around the island.
      ["blob", "i", 17, 11.5, 11.5, 7.5],
      ["blob", "e", 18, 11, 4.5, 3],
      ["blob", "X", 18.5, 10, 1.6, 1.2], ["cells", "X", [[17, 11]]],
      // Where the wagon went through, and other open leads.
      ["rect", "~", 12, 12, 13, 13], ["cells", "~", [[14, 13], [24, 7], [25, 7], [9, 15]]],
      // Pressure ridges: walls of clear ice.
      ["path", "I", [[10, 6], [10, 9]], 1], ["path", "I", [[22, 14], [25, 14]], 1], ["path", "I", [[15, 17], [17, 17]], 1],
      ["cells", "I", [[22, 6], [23, 7]]],
      // Crevasses along the north shore, under the cliffs.
      ["path", "V", [[8, 2], [12, 3], [15, 2], [19, 3], [23, 2]], 1], ["cells", "V", [[11, 2], [16, 3], [20, 2], [7, 3]]],
      ["rect", "^", 7, 1, 25, 1],
      // West shore pines, east shore scrub.
      ["blob", "p", 2, 10, 2.2, 4.5], ["blob", "b", 29.5, 13, 1.6, 3], ["blob", "b", 27, 19, 2, 1.3],
      // The trail round the west shore and up to the hospice road at the north-east.
      ["path", ".", [[3, 21], [4, 18], [5, 16], [5, 5], [7, 4], [24, 4], [27, 3], [29, 2], [30, 2]], 2],
    ]),
    props: [
      { t: "wagon", c: 13, r: 10, w: 2, h: 2, wreck: true },
      { t: "crates", c: 15, r: 12 }, { t: "crates", c: 20, r: 13 },
      { t: "cairn", c: 5, r: 19 }, { t: "cairn", c: 6, r: 8 }, { t: "cairn", c: 26, r: 4 },
      { t: "campfire", c: 19, r: 12 },
    ],
    keys: [
      { n: "1", c: 4, r: 20, text: "South shore" }, { n: "2", c: 13.5, r: 11, text: "The wagon" },
      { n: "3", c: 18.5, r: 10.5, text: "The island" }, { n: "4", c: 10.5, r: 7.5, text: "Pressure ridge" },
      { n: "5", c: 15, r: 2.5, text: "Crevasses" }, { n: "6", c: 2, r: 10, text: "Shore pines" },
      { n: "7", c: 29, r: 2.5, text: "Hospice road" },
    ],
  },
  {
    slug: "hospice-of-st-brenn",
    name: "The Hospice of St. Brenn",
    kind: "indoor",
    seed: 4303,
    grid: build(30, 22, "*", [
      // The building's shell.
      ["rect", "#", 0, 0, 29, 17],
      // Dormitory (west), great hall (centre), chapel (east).
      ["rect", "_", 1, 1, 7, 8], ["rect", ":", 9, 1, 20, 12], ["rect", ":", 22, 1, 28, 8],
      // Kitchen and cellar (south-west), the collapsed west hall, the stable (south-east).
      ["rect", ":", 1, 10, 7, 16], ["rect", "_", 22, 10, 28, 16],
      ["rect", ":", 9, 14, 20, 16],
      // The hall's pillars and hearth wall.
      ["cells", "o", [[12, 4], [17, 4], [12, 9], [17, 9]]],
      // Doors: dormitory, chapel (locked), kitchen, stable, porch to hall, front doors.
      ["cells", "D", [[8, 4], [21, 11], [8, 14], [4, 9], [14, 13], [15, 13]]],
      ["cells", "L", [[21, 4]]],
      ["cells", "D", [[14, 17], [15, 17], [27, 17]]],
      // Windows: dormitory, hall, chapel, stable.
      ["cells", "w", [[0, 3], [0, 6], [10, 0], [19, 0], [29, 3], [29, 6], [29, 13], [0, 12]]],
      // Snow that came in through the broken shutters.
      ["rect", "d", 1, 2, 2, 7], ["rect", "d", 9, 1, 11, 2], ["cells", "d", [[18, 1], [19, 1], [20, 1], [20, 2]]],
      // The collapsed corner of the kitchen.
      ["rect", "r", 1, 10, 3, 12], ["cells", "r", [[4, 10], [1, 13]]],
      // Cellar stairs.
      ["cells", "s", [[6, 15], [7, 15], [6, 16], [7, 16]]],
      // Stable stalls.
      ["cells", "#", [[24, 13], [24, 14], [26, 13], [26, 14]]],
      // The courtyard: a path through the snow to the front doors.
      ["path", ".", [[14, 18], [14, 21]], 2],
      ["rect", "d", 9, 15, 10, 16],
    ]),
    props: [
      { t: "hearth", c: 13, r: 1, w: 4, h: 1 },
      { t: "longTable", c: 11, r: 6, w: 8, h: 1 }, { t: "longTable", c: 11, r: 10, w: 8, h: 1 },
      { t: "bunks", c: 3, r: 1, w: 1, h: 2 }, { t: "bunks", c: 6, r: 1, w: 1, h: 2 }, { t: "bunks", c: 3, r: 5, w: 1, h: 2 }, { t: "bunks", c: 6, r: 5, w: 1, h: 2 },
      { t: "altar", c: 26, r: 2, w: 2, h: 1 }, { t: "pews", c: 23, r: 4, w: 3, h: 1 }, { t: "pews", c: 23, r: 6, w: 3, h: 1 },
      { t: "stove", c: 5, r: 11 }, { t: "barrels", c: 1, r: 15 }, { t: "crates", c: 4, r: 14 },
      { t: "hay", c: 27, r: 11, w: 2, h: 2 }, { t: "trough", c: 22, r: 15, w: 2, h: 1 },
      { t: "bell", c: 9, r: 12 },
    ],
    keys: [
      { n: "1", c: 14.5, r: 8, text: "Great hall" }, { n: "2", c: 4.5, r: 4.5, text: "Dormitory" },
      { n: "3", c: 25, r: 3, text: "Chapel (locked)" }, { n: "4", c: 4.5, r: 13.5, text: "Kitchen" },
      { n: "5", c: 6.5, r: 15.5, text: "Cellar stairs" }, { n: "6", c: 25, r: 13, text: "Stable" },
      { n: "7", c: 14.5, r: 15, text: "Porch" }, { n: "8", c: 14.5, r: 20, text: "Courtyard" },
    ],
  },
  {
    slug: "the-ice-caves",
    name: "The Ice Caves",
    kind: "cave",
    seed: 4404,
    grid: build(30, 22, "X", [
      // The way in from the hospice cellar, and the first chamber.
      ["rect", "s", 1, 1, 2, 1], ["rect", "c", 1, 2, 6, 6], ["rect", "c", 3, 7, 5, 9],
      // The meltwater hall, its stream running down into the chasm.
      ["rect", "c", 7, 3, 15, 8], ["path", "-", [[7, 2], [10, 4], [14, 6], [16, 9]], 1],
      // The ice maze: chambers divided by walls of clear ice.
      ["rect", "c", 2, 10, 14, 17], ["cells", "I", [[6, 10], [6, 11], [6, 12], [6, 13], [10, 14], [10, 15], [10, 16], [10, 17], [7, 15], [8, 15], [11, 11], [12, 11], [13, 11]]],
      ["blob", "v", 4, 15.5, 1.6, 1.4],
      // The den: a great cavern beyond the chasm, behind a curtain of clear ice.
      ["blob", "c", 23.5, 11, 5.4, 6.2],
      ["rect", "V", 15, 10, 16, 17], ["cells", "V", [[16, 9], [14, 17]]],
      ["rect", "I", 17, 6, 17, 17], ["rect", "c", 17, 12, 17, 12],
      ["rect", "=", 15, 12, 16, 12], ["rect", "c", 18, 7, 18, 16],
      ["cells", "o", [[22, 8], [26, 13], [24, 15]]],
      ["blob", "v", 26.5, 6.5, 1.2, 1.1],
      // The way out: a tunnel to the open mountainside, where the snow can come down.
      ["path", "c", [[25, 17], [27, 19], [28, 21]], 2],
      ["cells", "*", [[28, 20], [29, 20], [28, 21], [29, 21]]],
      // Loose ice and meltwater pools.
      ["cells", "-", [[21, 12], [22, 12], [21, 13], [25, 9], [26, 9]]],
      ["cells", "r", [[8, 7], [13, 4]]],
    ]),
    props: [
      { t: "lantern", c: 2, r: 3 },
      { t: "stoneHeap", c: 21, r: 6, w: 2, h: 2 },
      { t: "cairn", c: 21, r: 10 }, { t: "cairn", c: 25, r: 7 }, { t: "cairn", c: 25, r: 15 },
      { t: "cairn", c: 27, r: 19 },
      { t: "bones", c: 9, r: 13 }, { t: "bones", c: 27, r: 11 },
      { t: "crystals", c: 6, r: 9 }, { t: "crystals", c: 12, r: 16 }, { t: "crystals", c: 20, r: 16 },
    ],
    keys: [
      { n: "1", c: 3.5, r: 4, text: "Cellar way" }, { n: "2", c: 11, r: 5.5, text: "Meltwater hall" },
      { n: "3", c: 7, r: 13, text: "The ice maze" }, { n: "4", c: 16.5, r: 14.5, text: "Ice bridge" },
      { n: "5", c: 24, r: 11, text: "The den" }, { n: "6", c: 27.5, r: 20, text: "Way out" },
    ],
  },
];

/** Terrain each square gives: "difficult", "blocked" or null for Normal and for solid squares. */
export const TERRAIN = { "*": "difficult", "^": "difficult", "-": "difficult", i: "difficult", b: "difficult", d: "difficult", V: "blocked", "~": "blocked", r: "blocked" };
/** Squares whose connected regions become obscuring fog. */
export const OBSCURING = "pv";
