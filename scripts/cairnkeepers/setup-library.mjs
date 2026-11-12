/**
 * Sets Cairnkeepers up in a GM account, ready to play:
 *
 * - the four maps from their .dd2vtt files, then each map's whole board from <slug>.board.json:
 *   rock walls, doors and windows (the chapel door locked), ice as locked windows you see
 *   through, the painted terrain (Difficult and Blocked) and the obscuring fog;
 * - every token's art;
 * - a library creature for each bestiary platform entry, each board piece and each pregen;
 * - an encounter template for each scene, laid out as adventure.md says;
 * - a room, "Cairnkeepers · The Winter Road", holding all four scenes: the first live, the others
 *   prepared privately. Each has its template, line of sight on, the sight range for its weather,
 *   and its tokens sorted into token groups (a saved scene keeps its own groups).
 *
 * Safe to run again: anything already there under the same name is left as it is.
 *
 *   CAIRNKEEPERS_EMAIL=… CAIRNKEEPERS_PASSWORD=… npx tsx scripts/cairnkeepers/setup-library.mjs [--server=http://localhost:3001]
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { INITIAL_SCENE_ID } from "@vtt/shared";
import { Seat, newGuestToken } from "../lanternfall/playtest-table.mjs";
import { MAP_NAMES, TOKEN_NAMES } from "./names.mjs";

const GAME = fileURLToPath(new URL("../../games/cairnkeepers/", import.meta.url));
const SERVER = (process.argv.find((a) => a.startsWith("--server="))?.slice("--server=".length) ?? "http://localhost:3001").replace(/\/$/, "");
const { CAIRNKEEPERS_EMAIL: email, CAIRNKEEPERS_PASSWORD: password } = process.env;
if (!email || !password) throw new Error("Set CAIRNKEEPERS_EMAIL and CAIRNKEEPERS_PASSWORD to the GM account to set up.");
const ROOM = "Cairnkeepers · The Winter Road";
const CELL = 70;

/** The board pieces from bestiary.md, kept as creatures so each is one click to place. */
const BOARD_PIECES = [
  { name: "Warmth", hp: 10, maxHp: 10, color: "#e0612b", art: "warmth" },
  { name: "Storm Clock", hp: 0, maxHp: 6, color: "#5f7183", art: "storm-clock" },
  { name: "Cairn", hp: null, maxHp: null, color: "#7d7a73", art: "cairn-fallen" },
];
/** Each pregen's token art and colour. */
const PREGEN_TOKENS = {
  "sela-varn": { art: "pathfinder-a", color: "#e0612b" },
  "tor-breck": { art: "hauler-a", color: "#8a5a2b" },
  "wren-ashby": { art: "hunter-b", color: "#5f7183" },
  "mira-hale": { art: "stonespeaker-b", color: "#3f6f8f" },
};
/** Which token group a creature's tokens go in. */
const GROUP_OF = {
  "White-coat": "White-coats", "Scree Goat": "Scree Goat", Rimehand: "Rimehands", "Kettle Varga": "Rimehands",
  "Ice-crawler Swarm": "Ice-crawlers", "The Cairn-Taker": "The Cairn-Taker", "Brother Aldric": "Allies",
  "Caravan Survivor": "Survivors", Warmth: "Board pieces", "Storm Clock": "Board pieces", Cairn: "Board pieces",
};
const GUIDES = ["Sela Varn", "Tor Breck", "Wren Ashby", "Mira Hale"];
const numbered = (creature, squares, extra = {}) => squares.map((at, i) => [creature, at, { ...extra, name: `${creature} ${i + 1}` }]);
const cairns = (squares) => numbered("Cairn", squares);

/**
 * Each scene as adventure.md's "On the board" sets it up. Squares are (column, row), a big
 * token's by its top-left square.
 */
const SCENES = [
  {
    name: "1 · The Switchbacks", map: "The Switchbacks", sight: 60, guides: [[3, 18], [4, 18], [3, 19], [4, 19]],
    tokens: [
      ...cairns([[4, 17], [13, 11], [17, 6]]),
      ...numbered("White-coat", [[14, 14], [14, 16], [16, 13], [19, 13]], { hidden: true }),
      ["Scree Goat", [21, 3], { hidden: true }],
    ],
  },
  {
    name: "2 · Greywater Tarn", map: "Greywater Tarn", sight: 30, guides: [[3, 20], [4, 20], [3, 21], [4, 21]],
    tokens: [
      ...numbered("Rimehand", [[12, 10], [15, 11], [11, 7], [11, 8]]),
      ["Caravan Survivor", [16, 10], { name: "Pell Marrow" }], ["Caravan Survivor", [21, 10], { name: "Oskar" }], ["Caravan Survivor", [19, 12], { name: "Jory" }],
      ...cairns([[5, 19], [6, 8], [26, 4]]),
    ],
  },
  {
    name: "3 · The Hospice of St. Brenn", map: "The Hospice of St. Brenn", sight: 40, guides: [[14, 19], [15, 19], [14, 20], [15, 20]],
    tokens: [
      ["Kettle Varga", [14, 5]], ...numbered("Rimehand", [[10, 7], [19, 7]]),
      ["Brother Aldric", [26, 3]], ["Caravan Survivor", [6, 6], { name: "Hesk", hidden: true }],
    ],
  },
  {
    name: "4 · The Ice Caves", map: "The Ice Caves", sight: 30, guides: [[1, 2], [2, 2], [1, 3], [2, 3]],
    tokens: [
      ["Brother Aldric", [3, 2]],
      ...numbered("Ice-crawler Swarm", [[6, 12], [10, 16]], { hidden: true }),
      ["The Cairn-Taker", [23, 10]],
      ...cairns([[21, 10], [25, 7], [25, 15], [27, 19]]),
    ],
  },
];

let cookie = "";
async function api(path, { method = "GET", json, form } = {}) {
  const headers = cookie ? { cookie } : {};
  let body;
  if (json) { headers["content-type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(`${SERVER}${path}`, { method, headers, body });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** `2d6+3` as the attack editor takes it; null for "—". */
function dice(s) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(s ?? "");
  return m ? { count: Number(m[1]), sides: Number(m[2]), modifier: Number(m[3] ?? 0) } : null;
}

/** The bestiary's platform entries: the two-column tables under "| Platform entry | |". */
function platformEntries(md) {
  const slugOf = Object.fromEntries(Object.entries(TOKEN_NAMES).map(([slug, name]) => [name, slug]));
  return md.split("| Platform entry | |").slice(1).map((block) => {
    const rows = {};
    for (const line of block.split("\n").slice(2)) {
      const m = /^\| ([^|]+?) \| (.*) \|$/.exec(line);
      if (!m) break;
      rows[m[1]] = m[2];
    }
    const attacks = rows.Attacks.split(" · ").map((a) => {
      const m = /\*\*(.+?)\*\* — to-hit (?:`([^`]+)`|—), damage (?:`([^`]+)`|—)(?:, \*\*max targets (\d+)\*\*)?/.exec(a);
      if (!m) throw new Error(`Can't read the attack "${a}" (${rows.Name})`);
      return { name: m[1], toHit: dice(m[2]), damage: dice(m[3]), ...(m[4] ? { maxTargets: Number(m[4]) } : {}) };
    });
    const conditions = rows["Starting conditions"] ? [rows["Starting conditions"].split(" ")[0].toLowerCase()] : [];
    const art = slugOf[rows["Token art"]];
    if (!art) throw new Error(`No token named "${rows["Token art"]}" (${rows.Name})`);
    return { name: rows.Name, size: Number(rows.Size), hp: null, maxHp: Number(rows["Max HP"]), ac: Number(rows.AC), color: rows.Colour.replace(/`/g, ""), conditions, art, attacks };
  });
}

await api("/api/auth/signin", { method: "POST", json: { email, password } });
const library = await api("/api/library");
const inLibrary = (kind, name) => library.find((a) => a.kind === kind && a.name === name);

// ------------------------------------------------------------------ maps, with their boards
for (const [slug, name] of Object.entries(MAP_NAMES)) {
  let asset = inLibrary("map", name);
  const imported = !asset;
  if (imported) {
    const form = new FormData();
    form.append("file", new Blob([await readFile(join(GAME, `art/maps/${slug}.dd2vtt`))], { type: "application/json" }), `${name}.dd2vtt`);
    asset = (await api("/api/library/uvtt/imports", { method: "POST", form })).asset;
  }
  const prepared = await api(`/api/library/${asset.id}/preparation`);
  // UVTT can't say which openings are doors, windows or ice, or carry terrain and fog, so the
  // whole board comes from board.json (render-maps.mjs builds it from the same layout as the art).
  if (imported || !prepared.board.terrain?.length) {
    const { board } = JSON.parse(await readFile(join(GAME, `art/maps/${slug}.board.json`), "utf8"));
    await api(`/api/library/${asset.id}/preparation`, { method: "PUT", json: { grid: prepared.grid, board, revision: prepared.revision } });
  }
  const now = (await api(`/api/library/${asset.id}/preparation`)).board;
  const portals = now.walls.filter((w) => w.portal);
  const count = (kind, state) => portals.filter((w) => w.portal.kind === kind && w.portal.state === state).length;
  const cells = (kind) => (now.terrain ?? []).filter((t) => t.kind === kind).reduce((n, t) => n + t.end - t.start + 1, 0);
  console.log(`map ${name}: ${imported ? "imported" : "already in the library"}; ${now.walls.length - portals.length} walls, ${count("door", "closed")} doors, ${count("door", "locked")} locked, ${count("window", "closed")} windows, ${count("window", "locked")} ice; terrain ${cells("difficult")} difficult + ${cells("blocked")} blocked; ${now.fog.length} fog`);
}

// ------------------------------------------------------------------ token art
const art = {};
let uploaded = 0;
for (const [slug, name] of Object.entries(TOKEN_NAMES)) {
  let asset = inLibrary("token", name);
  if (!asset) {
    const file = join(GAME, `art/tokens/${slug}.webp`);
    const { width, height } = await sharp(file).metadata();
    const form = new FormData();
    form.append("kind", "token");
    form.append("name", name);
    form.append("width", String(width));
    form.append("height", String(height));
    form.append("file", new Blob([await readFile(file)], { type: "image/webp" }), `${slug}.webp`);
    asset = await api("/api/library", { method: "POST", form });
    uploaded++;
  }
  art[slug] = asset.id;
}
console.log(`token art: ${uploaded} uploaded, ${Object.keys(art).length - uploaded} already in the library`);

// ------------------------------------------------------------------ creatures
const pregens = JSON.parse(await readFile(join(GAME, "character-sheet/pregens.json"), "utf8")).map((p) => ({
  name: p.name, size: 1, hp: Number(p.hp), maxHp: Number(p.maxHp), ac: Number(p.guard), conditions: [], ...PREGEN_TOKENS[p.slug],
  attacks: p.named.map((a) => {
    const many = / ×(\d+)$/.exec(a.name);
    return { name: a.name.replace(/ ×\d+$/, ""), toHit: dice(a.hit), damage: dice(a.dmg), ...(many ? { maxTargets: Number(many[1]) } : {}) };
  }),
}));
const creatures = [
  ...platformEntries(await readFile(join(GAME, "bestiary.md"), "utf8")),
  ...BOARD_PIECES.map((p) => ({ size: 1, ac: null, conditions: [], attacks: [], ...p })),
  ...pregens,
];
const existing = new Set((await api("/api/library/creatures")).map((c) => c.name));
let made = 0;
for (const { art: slug, ...creature } of creatures) {
  if (existing.has(creature.name)) continue;
  await api("/api/library/creatures", { method: "POST", json: { ...creature, imageAssetId: art[slug] } });
  made++;
}
console.log(`creatures: ${made} made, ${creatures.length - made} already in the library (${creatures.map((c) => c.name).join(", ")})`);

// ------------------------------------------------------------------ encounter templates
const saved = await api("/api/library/creatures");
const creatureNamed = (name) => saved.find((c) => c.name === name) ?? (() => { throw new Error(`No library creature "${name}"`); })();
/** A creature as a token, the way Saved Creatures places one: its values, no owner. */
const tokenFrom = (name, [c, r], { hidden = false, name: label } = {}) => {
  const k = creatureNamed(name);
  return {
    type: "token.create", name: label ?? k.name, position: { x: (c + k.size / 2) * CELL, y: (r + k.size / 2) * CELL }, size: k.size,
    stats: { hp: k.hp ?? k.maxHp, maxHp: k.maxHp, ac: k.ac }, color: k.color, imageUrl: k.imageUrl, assetId: k.imageAssetId,
    hidden, conditions: k.conditions, attacks: k.attacks ?? [],
  };
};
const sceneTokens = (scene) => [
  ...GUIDES.map((name, i) => ["Guide", tokenFrom(name, scene.guides[i])]),
  ...scene.tokens.map(([name, at, extra]) => [name, tokenFrom(name, at, extra)]),
  ["Warmth", tokenFrom("Warmth", [0, 0])], ["Storm Clock", tokenFrom("Storm Clock", [1, 0], { hidden: true })],
];
const maps = (await api("/api/library")).filter((a) => a.kind === "map");
let templates = await api("/api/library/encounters");
for (const scene of SCENES) {
  if (templates.some((t) => t.name === scene.name)) { console.log(`encounter ${scene.name}: already in the library`); continue; }
  const map = maps.find((a) => a.name === scene.map);
  // A temporary room only this GM can enter, on the library map with its walls, terrain and fog (ADR 0033).
  const guestToken = newGuestToken();
  const { roomId, participantId } = await api("/api/library/encounter-edits", { method: "POST", json: { mapAssetId: map.id, guestToken } });
  const gm = new Seat({ server: SERVER }, { name: "GM", guestToken, participantId, role: "gm", roomId });
  await gm.connect();
  const tokens = sceneTokens(scene).map(([, t]) => t);
  for (const token of tokens) await gm.command(token);
  gm.close();
  await api(`/api/library/encounter-edits/${roomId}/save`, { method: "POST", json: { name: scene.name } });
  console.log(`encounter ${scene.name}: saved with ${tokens.length} tokens (${tokens.filter((t) => t.hidden).length} hidden)`);
}
templates = await api("/api/library/encounters");

// ------------------------------------------------------------------ the ready room
const hosting = (await api("/api/me/rooms")).hosting;
if (hosting.some((r) => r.name === ROOM)) {
  console.log(`room ${ROOM}: already there`);
} else {
  const guestToken = newGuestToken();
  const created = await api("/api/rooms", { method: "POST", json: { roomName: ROOM, displayName: "GM", guestToken } });
  const gm = new Seat({ server: SERVER }, { name: "GM", guestToken, participantId: created.participantId, role: "gm", roomId: created.roomId });
  await gm.connect();
  for (const [i, scene] of SCENES.entries()) {
    let sceneId = INITIAL_SCENE_ID;
    if (i > 0) {
      await gm.command({ type: "scene.create", name: scene.name, activate: false });
      sceneId = Object.entries(gm.state.sceneNames ?? {}).find(([, n]) => n === scene.name)[0];
    }
    // Commands for a scene that isn't live go through scene.prepare (ADR 0045).
    const send = (command) => gm.command(i === 0 ? command : { type: "scene.prepare", sceneId, command });
    const board = () => (i === 0 ? gm.state : { ...gm.state.savedScenes[sceneId].table, groups: gm.state.savedScenes[sceneId].groups });
    const template = templates.find((t) => t.name === scene.name);
    await send({ type: "encounter.apply", templateId: template.id });
    if (!board().scene.lineOfSight) await send({ type: "scene.setLineOfSight", enabled: true });
    await send({ type: "scene.setSightRange", range: scene.sight });
    // Sort the scene's tokens into groups by what they are.
    const byGroup = {};
    const labels = sceneTokens(scene).map(([creature, t]) => [creature === "Guide" ? "Guides" : GROUP_OF[creature], t.name]);
    for (const token of Object.values(board().tokens)) {
      // The server numbers repeated names, so fall back to the name without its number.
      const group = (labels.find(([, name]) => name === token.name) ?? labels.find(([, name]) => name.replace(/ \d+$/, "") === token.name.replace(/ \d+$/, "")))?.[0];
      if (group) (byGroup[group] ??= []).push(token.id);
    }
    for (const [group, ids] of Object.entries(byGroup)) {
      await send({ type: "group.create", name: group });
      const groupId = Object.values(board().groups).find((g) => g.name === group).id;
      await send({ type: "group.assign", groupId, tokenIds: ids });
    }
    console.log(`room scene ${scene.name}: ${Object.keys(board().tokens).length} tokens, sight ${scene.sight} ft, groups ${Object.entries(byGroup).map(([g, ids]) => `${g} (${ids.length})`).join(", ")}`);
  }
  await gm.command({ type: "scene.rename", sceneId: INITIAL_SCENE_ID, name: SCENES[0].name });
  gm.close();
  console.log(`room ${ROOM}: made, with ${SCENES.length} scenes; ${SCENES[0].name} is live`);
}
process.exit(0);
