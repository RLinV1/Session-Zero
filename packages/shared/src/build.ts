import { z } from "zod";
import { AttackDice, AttackPreset, MAX_TOKEN_ATTACKS } from "./attackPresets";
import { DEFAULT_TOKEN_COLOR } from "./commands";
import type { ConditionId } from "./conditions";
import { EncounterTemplateData, MAX_ENCOUNTER_NAME, type TemplateToken } from "./encounters";
import { DEFAULT_GRID, GridSpec, footprintCrossesWall, snapTokenCenter, type Point, type Segment } from "./geometry";
import { EMPTY_LIBRARY_BOARD, libraryBoardProblem, type LibraryMapBoard } from "./libraryBoard";
import { blocksMovement } from "./portals";
import { CreatureFields, LibraryUploadFields } from "./protocol";
import { MAX_WALLS, PortalState, type Portal, type Wall } from "./state";
import { hasPortalBounds, removePortalOverlaps } from "./uvtt";

/**
 * The AI game builder's contract (FR-GM-26, FR-GM-27, ADR 0053). What an AI may put in a private
 * draft, and the pure step that turns an approved draft encounter into a template.
 *
 * Every input is strict: a field the app has no place for is refused, so nothing can arrive that
 * a person wouldn't see in review. No existing schema changes.
 */

export const BUILD_LIMITS = {
  openBuildsPerAccount: 3,
  passLifetimeMs: 24 * 60 * 60 * 1000,
  filesPerBuild: 100,
  mapsPerBuild: 20,
  storageBytesPerBuild: 500 * 1024 ** 2,
  requestsPerPassPerMinute: 120,
  creaturesPerBuild: 200,
  creaturesPerCall: 20,
  encountersPerBuild: 20,
  tokensPerEncounter: 500,
  flagsPerItem: 40,
  flagCharacters: 200,
  notCarriedOverCharacters: 2000,
  gameNotesCharacters: 8000,
  abandonedAfterDays: 14,
  /** Walls, doors and windows the AI draws on one map. */
  linesPerMap: 500,
  /** Places on one map the AI couldn't work out and left for the user. */
  marksPerMap: 50,
} as const;

/** What the owner lets the AI set up on maps, chosen per build (ADR 0053). Both are off unless ticked. */
export const BuildChoices = z.strictObject({
  /** The AI's grid counts as confirmed when grid detection agrees with it. */
  aiGrid: z.boolean(),
  /** The AI may set openings, and draw walls, doors and windows. */
  aiWalls: z.boolean(),
});
export type BuildChoices = z.infer<typeof BuildChoices>;
export const NO_BUILD_CHOICES: BuildChoices = { aiGrid: false, aiWalls: false };

/**
 * A build pass: 256 random bits in base64url, 43 characters. The prefix keeps it from being
 * mistaken for a seat value (`<roomId>.<guestToken>`), which a build tool must refuse.
 */
export const BUILD_PASS_PREFIX = "szb_";
export const BuildPass = z.string().regex(/^szb_[A-Za-z0-9_-]{43}$/, { message: "That isn't a build pass." });
export type BuildPass = z.infer<typeof BuildPass>;

/** The AI's own name for an item, so saving it again updates it. */
export const BuildKey = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, { message: "A key is 1 to 64 letters, digits, dashes or underscores." });
export type BuildKey = z.infer<typeof BuildKey>;

/** Why a value is blank or uncertain. May say where it came from, but holds no passages from the source. */
export const BuildFlag = z.strictObject({
  field: z.string().trim().min(1).max(60),
  message: z.string().trim().min(1).max(BUILD_LIMITS.flagCharacters),
});
export type BuildFlag = z.infer<typeof BuildFlag>;

const draftNotes = {
  flags: z.array(BuildFlag).max(BUILD_LIMITS.flagsPerItem).default([]),
  /** What the sheet had that the app has no field for. Plain text, never rendered as markup. */
  notCarriedOver: z.string().max(BUILD_LIMITS.notCarriedOverCharacters).default(""),
};

/** The dice an attack can roll. A test holds this equal to `AttackDice`, whose list isn't exported. */
export const BUILD_DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

/** `AttackDice`, with a refusal that names the die, so the AI knows to blank that roll and flag it. */
const DraftDice = z.strictObject({
  count: AttackDice.shape.count,
  sides: z.number().int().superRefine((sides, ctx) => {
    if (!(BUILD_DIE_SIDES as readonly number[]).includes(sides)) {
      ctx.addIssue({ code: "custom", message: `The app has no d${sides}. Leave this roll blank and add a flag.` });
    }
  }),
  modifier: AttackDice.shape.modifier,
});

const DraftAttack = z.strictObject({
  name: AttackPreset.shape.name,
  toHit: DraftDice.nullable(),
  damage: DraftDice.nullable(),
  maxTargets: AttackPreset.shape.maxTargets,
}).refine((a) => a.toHit !== null || a.damage !== null, { message: "An attack needs a to-hit or damage roll. If it has neither, list it as not carried over." });

const DraftAttacks = z.array(DraftAttack).max(MAX_TOKEN_ATTACKS).refine(
  (attacks) => new Set(attacks.map((a) => a.name.toLowerCase())).size === attacks.length,
  { message: "Attack names must be unique" },
);

/** What a library creature can hold, plus whether it is a player's character. A blank stays blank. */
export const DraftCreature = z.strictObject({
  key: BuildKey,
  name: CreatureFields.shape.name,
  /** Stays in the draft: the GM gives characters to players with the existing control. */
  isPlayerCharacter: z.boolean(),
  size: CreatureFields.shape.size.default(1),
  hp: CreatureFields.shape.hp.default(null),
  maxHp: CreatureFields.shape.maxHp.default(null),
  ac: CreatureFields.shape.ac.default(null),
  attacks: DraftAttacks.default([]),
  conditions: CreatureFields.shape.conditions.default([]),
  color: CreatureFields.shape.color.default(DEFAULT_TOKEN_COLOR),
  /** One of this build's own files, or null for a colour disc. */
  imageFileId: z.uuid().nullable().default(null),
  ...draftNotes,
}).refine((c) => c.hp === null || c.maxHp === null || c.hp <= c.maxHp, { message: "HP can't be more than Max HP.", path: ["hp"] });
export type DraftCreature = z.infer<typeof DraftCreature>;

/** A suggested grid in the map's pixels. Distance per square comes from the game profile. */
export const DraftProposedGrid = z.strictObject({
  cellSize: GridSpec.shape.cellSize,
  offsetX: GridSpec.shape.offsetX,
  offsetY: GridSpec.shape.offsetY,
}).refine((g) => g.offsetX < g.cellSize && g.offsetY < g.cellSize, { message: "Grid offset must be less than the cell size" });
export type DraftProposedGrid = z.infer<typeof DraftProposedGrid>;

/**
 * Where a draft map's grid stands. `confirmed` comes from a UVTT file, which is exact, from a
 * person, or, when the owner allows it, from the AI and grid detection agreeing (ADR 0053).
 */
export const BuildGridStatus = z.enum(["none", "proposed", "confirmed"]);
export type BuildGridStatus = z.infer<typeof BuildGridStatus>;
/** Who confirmed a grid: the UVTT file, the owner, or the AI and detection agreeing. */
export type BuildGridBy = "file" | "owner" | "agreement";

/** A corner of the grid, in squares: corner (4, 2) is the top-left corner of square (4, 2). Half steps reach mid-edges. */
const HalfSquares = z.number().finite().min(-1).max(100_000)
  .refine((n) => Number.isInteger(n * 2), { message: "Use whole or half squares, such as 3 or 3.5." });
export const DraftCorner = z.strictObject({ column: HalfSquares, row: HalfSquares });
export type DraftCorner = z.infer<typeof DraftCorner>;

const STATE_RULE = "A door or window needs a state: open, closed or locked. A wall has none.";

/** A wall, door or window the AI drew, between two grid corners, so it moves with a grid correction (ADR 0053). */
export const DraftLine = z.strictObject({
  from: DraftCorner,
  to: DraftCorner,
  kind: z.enum(["wall", "door", "window"]),
  state: PortalState.optional(),
})
  .refine((l) => l.from.column !== l.to.column || l.from.row !== l.to.row, { message: "A line needs two different corners." })
  .refine((l) => (l.kind === "wall") === (l.state === undefined), { message: STATE_RULE, path: ["state"] });
export type DraftLine = z.infer<typeof DraftLine>;

/** What one of a map's numbered openings becomes: a door or window, or left for the user with a reason. */
export const DraftOpening = z.strictObject({
  number: z.number().int().min(1).max(MAX_WALLS),
  kind: z.enum(["door", "window", "leave"]),
  state: PortalState.optional(),
  reason: z.string().trim().min(1).max(BUILD_LIMITS.flagCharacters).optional(),
}).refine((o) => (o.kind === "leave" ? o.reason !== undefined && o.state === undefined : o.state !== undefined && o.reason === undefined), {
  message: "A door or window needs a state (open, closed or locked) and no reason. Leaving an opening for the user needs a reason and no state.",
});
export type DraftOpening = z.infer<typeof DraftOpening>;

/** A place the AI couldn't work out, left for the user to finish. */
export const DraftMark = z.strictObject({
  square: z.strictObject({ column: z.number().int().min(0).max(100_000), row: z.number().int().min(0).max(100_000) }),
  reason: z.string().trim().min(1).max(BUILD_LIMITS.flagCharacters),
});
export type DraftMark = z.infer<typeof DraftMark>;

const SetupOpenings = z.array(DraftOpening).max(MAX_WALLS)
  .refine((list) => new Set(list.map((o) => o.number)).size === list.length, { message: "Set each opening once." });
const SetupLines = z.array(DraftLine).max(BUILD_LIMITS.linesPerMap);
const SetupMarks = z.array(DraftMark).max(BUILD_LIMITS.marksPerMap);

/** A draft map's walls, doors and windows beyond what its file has. Stored on the draft map; never room state. */
export const DraftMapSetup = z.strictObject({ openings: SetupOpenings, lines: SetupLines, marks: SetupMarks });
export type DraftMapSetup = z.infer<typeof DraftMapSetup>;
export const EMPTY_MAP_SETUP: DraftMapSetup = { openings: [], lines: [], marks: [] };

/** What the AI sends: each part it gives replaces that part, and a part it leaves out stays as it was. */
export const DraftMapSetupChange = z.strictObject({ openings: SetupOpenings.optional(), lines: SetupLines.optional(), marks: SetupMarks.optional() })
  .refine((c) => c.openings !== undefined || c.lines !== undefined || c.marks !== undefined, { message: "Send openings, lines or marks." });
export type DraftMapSetupChange = z.infer<typeof DraftMapSetupChange>;

/** A map from one of this build's files. Its walls, doors and windows are set separately, and only when the owner allows it. */
export const DraftMap = z.strictObject({
  key: BuildKey,
  name: LibraryUploadFields.shape.name,
  fileId: z.uuid(),
  proposedGrid: DraftProposedGrid.nullable().default(null),
  ...draftNotes,
});
export type DraftMap = z.infer<typeof DraftMap>;

/** A square on the grid. Bounded loosely here; the map's real size is checked at publish. */
export const DraftSquare = z.strictObject({
  column: z.number().int().min(-100_000).max(100_000),
  row: z.number().int().min(-100_000).max(100_000),
});
export type DraftSquare = z.infer<typeof DraftSquare>;

export const DraftEncounterToken = z.strictObject({
  creatureKey: BuildKey,
  /** The name on the board, such as "Goblin 2". Players can see it unless the token is hidden. */
  name: CreatureFields.shape.name.optional(),
  /** The top-left square the token covers, or null to leave it for the GM to place. */
  square: DraftSquare.nullable(),
  /** Required on every token, so the AI has to decide what players will see. */
  hidden: z.boolean(),
});
export type DraftEncounterToken = z.infer<typeof DraftEncounterToken>;

export const DraftEncounter = z.strictObject({
  key: BuildKey,
  name: z.string().trim().min(1).max(MAX_ENCOUNTER_NAME),
  mapKey: BuildKey,
  tokens: z.array(DraftEncounterToken).max(BUILD_LIMITS.tokensPerEncounter),
  ...draftNotes,
});
export type DraftEncounter = z.infer<typeof DraftEncounter>;

const ALL_FEATURES = { hitPoints: true, armorClass: true, attacks: true, conditions: true };

/** What a game sheet says about the game. Not a preset: presets are code, and the room uses one already in the app. */
export const GameProfile = z.strictObject({
  name: z.string().trim().min(1).max(80),
  /** Which fields this game uses, so a game with no AC raises no flag for a blank AC. */
  features: z.strictObject({
    hitPoints: z.boolean(),
    armorClass: z.boolean(),
    attacks: z.boolean(),
    conditions: z.boolean(),
  }).default(ALL_FEATURES),
  unitsPerCell: GridSpec.shape.unitsPerCell.default(5),
  unitLabel: GridSpec.shape.unitLabel.default("ft"),
  notes: z.string().max(BUILD_LIMITS.gameNotesCharacters).default(""),
  /** Readings the game sheet didn't support, such as taking "+5" as a d20 roll. Shown first in review. */
  flags: z.array(BuildFlag).max(BUILD_LIMITS.flagsPerItem).default([]),
});
export type GameProfile = z.infer<typeof GameProfile>;

/** A build as its owner's pages see it. */
export interface BuildSummary {
  id: string;
  name: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  passExpiresAt: string | null;
  /** When the 14-day sweep closes it, if nothing changes before then. */
  closesAt: string;
  /** What the owner lets the AI set up on maps. */
  choices: BuildChoices;
}

export interface BuildFileView {
  id: string;
  kind: "map" | "token";
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
  fromUvtt: boolean;
  grid: GridSpec | null;
  walls: number;
  detection: { status: string; suggestion: { cellSize: number; offsetX: number; offsetY: number } | null } | null;
  url: string;
  published: boolean;
  /** A UVTT file's walls and openings, to draw them in review. Null for a plain image. */
  board: LibraryMapBoard | null;
}

export interface BuildItemView {
  kind: "creature" | "map" | "encounter";
  key: string;
  data: Record<string, unknown>;
  flags: BuildFlag[];
  notCarriedOver: string;
  editedByUser: boolean;
  published: boolean;
  updatedAt: string;
}

export interface BuildDetail {
  build: BuildSummary;
  profile: GameProfile | null;
  files: BuildFileView[];
  items: BuildItemView[];
}

export interface BuildPublished {
  assets: number;
  creatures: { key: string; id: string }[];
  maps: { key: string; id: string }[];
  encounters: { key: string; id: string; name: string }[];
}

/** Something a build put in the library, and where it's in use, to warn before removing it. */
export interface PublishedBuildItem {
  type: "asset" | "creature" | "encounter";
  id: string;
  name: string;
  rooms: { id: string; name: string }[];
  creatures: { id: string; name: string }[];
  encounters: { id: string; name: string }[];
}

/** A published creature's values at the moment of publishing, with its published art. */
export interface BuildCreatureValues {
  name: string;
  size: number;
  hp: number | null;
  maxHp: number | null;
  ac: number | null;
  color: string;
  conditions: ConditionId[];
  attacks: AttackPreset[];
  imageUrl: string | null;
  assetId: string | null;
}

export interface DraftEncounterSource {
  map: EncounterTemplateData["map"];
  /** The grid the user confirmed, so a corrected grid can't misplace a token (invariant 8). */
  grid: GridSpec;
  board: LibraryMapBoard;
  /** A Map, because keys are chosen by the AI and could be `__proto__`. */
  creatures: ReadonlyMap<string, BuildCreatureValues>;
  tokens: readonly DraftEncounterToken[];
}

export interface DraftEncounterProblem {
  /** The token's name as the GM will see it, or the encounter's when it isn't about one token. */
  token: string;
  message: string;
}

export type DraftEncounterResult =
  | { ok: true; data: EncounterTemplateData }
  | { ok: false; problems: DraftEncounterProblem[] };

/** Allows for float noise when a footprint ends exactly on the map's edge. */
const EDGE_TOLERANCE = 1e-6;

/** Where a token whose top-left square is `square` has its center, or null unless it lies wholly on the map. */
export function footprintCenter(square: DraftSquare, size: number, grid: Pick<GridSpec, "cellSize" | "offsetX" | "offsetY">, map: { width: number; height: number }): Point | null {
  const span = size * grid.cellSize;
  const left = grid.offsetX + square.column * grid.cellSize;
  const top = grid.offsetY + square.row * grid.cellSize;
  const center = snapTokenCenter({ x: left + span / 2, y: top + span / 2 }, size, grid as GridSpec);
  // Checked after snapping: a token under one square wide can snap to a corner of its square.
  const half = span / 2;
  if (center.x - half < -EDGE_TOLERANCE || center.y - half < -EDGE_TOLERANCE) return null;
  if (center.x + half > map.width + EDGE_TOLERANCE || center.y + half > map.height + EDGE_TOLERANCE) return null;
  return center;
}

/** A saved draft map: what the AI gave, and where its grid stands. Only the server sets the grid fields. */
export interface DraftMapState {
  name: string;
  fileId: string;
  proposedGrid: DraftProposedGrid | null;
  gridStatus: BuildGridStatus;
  /** The confirmed grid: a UVTT file's, the one a person confirmed, or, when read, one detection and the AI agreed on. */
  grid: GridSpec | null;
  /** Who confirmed the grid. Worked out when read, never stored. */
  gridBy?: BuildGridBy | null;
  /** Detection's suggestion, when the owner allows AI grids and the AI's proposal differs from it. Worked out when read. */
  gridDiffers?: DraftProposedGrid | null;
  /** Openings, lines and marks the AI or the owner set (ADR 0053). Absent means none. */
  setup?: DraftMapSetup;
}

type GridNumbers = Pick<GridSpec, "cellSize" | "offsetX" | "offsetY">;

/** How close the AI's grid must be to detection's to count as agreeing, in map pixels (ADR 0053). */
export const GRID_AGREEMENT = { cellSize: 0.5, offset: 1 } as const;

/**
 * Whether two grids are the same within `GRID_AGREEMENT`. Offsets are compared across the cell,
 * because they wrap: on a 70-pixel grid, offsets 0 and 69.5 are half a pixel apart.
 */
export function gridsAgree(a: GridNumbers, b: GridNumbers): boolean {
  if (Math.abs(a.cellSize - b.cellSize) > GRID_AGREEMENT.cellSize) return false;
  const cell = Math.max(a.cellSize, b.cellSize);
  const near = (x: number, y: number) => {
    const apart = Math.abs(x - y) % cell;
    return Math.min(apart, cell - apart) <= GRID_AGREEMENT.offset;
  };
  return near(a.offsetX, b.offsetX) && near(a.offsetY, b.offsetY);
}

/** What a draft map's file says about its grid. */
export interface DraftMapFileGrid {
  grid: GridSpec | null;
  detectionStatus: string | null;
  detectionResult: GridNumbers | null;
}

/** The distance one square stands for, as the owner sees it, so publish can tell if the AI changed it since. */
export const squareSizeOf = (profile: Pick<GameProfile, "unitsPerCell" | "unitLabel"> | null) =>
  `${profile?.unitsPerCell ?? DEFAULT_GRID.unitsPerCell} ${profile?.unitLabel ?? DEFAULT_GRID.unitLabel}`;

/**
 * A draft map as it reads now (ADR 0053). Worked out each time, never stored: with the owner's
 * AI-grid choice on, a proposal that matches detection's suggestion counts as confirmed, so a
 * suggestion that arrives later counts, and turning the choice off sends the map back to waiting.
 *
 * An agreed grid takes detection's numbers, which are fitted across the whole map, rather than the
 * AI's: half a pixel per square would otherwise add up to squares of drift across a large map.
 */
export function readDraftMap(map: DraftMapState, file: DraftMapFileGrid | null, aiGrid: boolean, units: Pick<GridSpec, "unitsPerCell" | "unitLabel">): DraftMapState {
  const base = { ...map, gridBy: null, gridDiffers: null };
  if (file?.grid) return { ...base, grid: file.grid, gridStatus: "confirmed", gridBy: "file" };
  if (map.grid) return { ...base, gridStatus: "confirmed", gridBy: "owner" };
  if (!map.proposedGrid) return { ...base, grid: null, gridStatus: "none" };
  const suggestion = file?.detectionStatus === "suggested" ? file.detectionResult : null;
  if (aiGrid && suggestion) {
    if (gridsAgree(map.proposedGrid, suggestion)) {
      const grid = { cellSize: suggestion.cellSize, offsetX: suggestion.offsetX, offsetY: suggestion.offsetY, ...units };
      return { ...base, grid, gridStatus: "confirmed", gridBy: "agreement" };
    }
    return { ...base, grid: null, gridStatus: "proposed", gridDiffers: { cellSize: suggestion.cellSize, offsetX: suggestion.offsetX, offsetY: suggestion.offsetY } };
  }
  return { ...base, grid: null, gridStatus: "proposed" };
}

/** A map's openings: its file's doors, windows and UVTT portals, in the file's order, which never changes after upload. */
export function mapOpenings(fileBoard: LibraryMapBoard | null): LibraryMapBoard["walls"] {
  return (fileBoard?.walls ?? []).filter(hasPortalBounds);
}

/** What an opening is now: from its file, as the AI or owner set it, or left for the user. */
export type OpeningNow = { kind: "opening" | "door" | "window"; state: PortalState } | { kind: "left"; reason: string };

export interface OpeningView {
  /** Counted from 1 in the file's order. The same number in the picture and in every setting. */
  number: number;
  /** The square at its middle, or null while the map has no grid. */
  square: { column: number; row: number } | null;
  direction: "horizontal" | "vertical" | "diagonal";
  /** How long it is, in squares to one decimal, or null while the map has no grid. */
  lengthSquares: number | null;
  now: OpeningNow;
  /** True when the setup changed it from what the file had. */
  set: boolean;
  /** Its two ends in map pixels, for drawing it. */
  a: Point;
  b: Point;
}

const fileOpeningNow = (wall: Pick<Wall, "portal" | "uvttPortal">): OpeningNow =>
  wall.portal ? { kind: wall.portal.kind, state: wall.portal.state } : { kind: "opening", state: wall.uvttPortal?.closed === false ? "open" : "closed" };

/** A map's numbered openings, each with where it is and what it is now, for the AI's list and the review page. */
export function listOpenings(fileBoard: LibraryMapBoard | null, setup: DraftMapSetup | undefined, grid: GridNumbers | null): OpeningView[] {
  const settings = new Map((setup?.openings ?? []).map((o) => [o.number, o]));
  return mapOpenings(fileBoard).map((wall, index) => {
    const number = index + 1;
    const setting = settings.get(number);
    const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y;
    const middle = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
    const now: OpeningNow = !setting ? fileOpeningNow(wall)
      : setting.kind === "leave" ? { kind: "left", reason: setting.reason ?? "" }
        : { kind: setting.kind, state: setting.state ?? "closed" };
    return {
      number,
      square: grid ? { column: Math.floor((middle.x - grid.offsetX) / grid.cellSize), row: Math.floor((middle.y - grid.offsetY) / grid.cellSize) } : null,
      direction: Math.abs(dy) * 4 <= Math.abs(dx) ? "horizontal" : Math.abs(dx) * 4 <= Math.abs(dy) ? "vertical" : "diagonal",
      lengthSquares: grid ? Math.round((Math.hypot(dx, dy) / grid.cellSize) * 10) / 10 : null,
      now,
      set: setting !== undefined,
      a: wall.a,
      b: wall.b,
    };
  });
}

/** A corner in map pixels. */
export const cornerPoint = (corner: DraftCorner, grid: GridNumbers): Point =>
  ({ x: grid.offsetX + corner.column * grid.cellSize, y: grid.offsetY + corner.row * grid.cellSize });

/** A drawn line in words, numbered from 1 as the AI sent them. */
export const describeDraftLine = (line: DraftLine, index: number) =>
  `Line ${index + 1} (a ${line.kind} from column ${line.from.column}, row ${line.from.row} to column ${line.to.column}, row ${line.to.row})`;

function distanceToSegment(p: Point, s: Segment): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy));
}

export type DraftMapBoardResult =
  | { ok: true; board: LibraryMapBoard; blockedLines: number[] }
  | { ok: false; problems: string[] };

/**
 * The board a draft map publishes (ADR 0053): its file's walls with the setup's openings applied
 * and the AI's lines added, converted to map pixels with `grid`. A drawn door or window cuts the
 * walls under it by the UVTT importer's own rule. `blockedLines` are drawn doors and windows that
 * still sit on a wall they didn't cut, which would keep them shut.
 */
export function draftMapBoard(fileBoard: LibraryMapBoard | null, setup: DraftMapSetup | undefined, grid: GridNumbers | null, map: { width: number; height: number }): DraftMapBoardResult {
  const base = fileBoard ?? EMPTY_LIBRARY_BOARD;
  const problems: string[] = [];
  const settings = new Map((setup?.openings ?? []).map((o) => [o.number, o]));
  const openingCount = mapOpenings(base).length;
  for (const number of settings.keys()) {
    if (number > openingCount) problems.push(`Opening ${number} isn't on this map. It has ${openingCount === 1 ? "1 opening" : `${openingCount} openings`}.`);
  }

  let number = 0;
  const fileWalls = base.walls.map((wall) => {
    if (!hasPortalBounds(wall)) return wall;
    const setting = settings.get(++number);
    if (!setting || setting.kind === "leave") return wall;
    const portal: Portal = { kind: setting.kind, state: setting.state ?? "closed" };
    return { ...wall, portal };
  });

  const lines = setup?.lines ?? [];
  const marks = setup?.marks ?? [];
  if (lines.length > 0 && !grid) problems.push("Drawing lines needs a grid first. Propose one with save_map.");
  if (marks.length > 0 && !grid) problems.push("Marking places needs a grid first. Propose one with save_map.");
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
  const drawn: LibraryMapBoard["walls"] = [];
  if (grid) {
    lines.forEach((line, index) => {
      const a = cornerPoint(line.from, grid), b = cornerPoint(line.to, grid);
      if (!inside(a) || !inside(b)) return void problems.push(`${describeDraftLine(line, index)} has a corner off the map.`);
      drawn.push(line.kind === "wall" ? { a, b } : { a, b, portal: { kind: line.kind, state: line.state ?? "closed" } });
    });
    marks.forEach((mark, index) => {
      const corner = cornerPoint(mark.square, grid);
      if (!inside(corner)) problems.push(`Mark ${index + 1} (column ${mark.square.column}, row ${mark.square.row}) is off the map.`);
    });
  }
  if (problems.length > 0) return { ok: false, problems };

  // Only the drawn doors and windows cut: the file's own openings already cut its walls on import.
  // Walls stay in the file's order, each replaced by what is left of it.
  const drawnPortals = drawn.filter(hasPortalBounds);
  const cut = (wall: LibraryMapBoard["walls"][number]) =>
    drawnPortals.length === 0 || hasPortalBounds(wall) ? [wall] : removePortalOverlaps([wall, ...drawnPortals]).slice(0, -drawnPortals.length);
  const walls = [...fileWalls.flatMap(cut), ...drawn.flatMap(cut)];
  if (walls.length > MAX_WALLS) return { ok: false, problems: [`This map would have ${walls.length} walls. A map can hold at most ${MAX_WALLS}.`] };
  const board: LibraryMapBoard = { ...base, walls };
  const boardProblem = libraryBoardProblem(board, map);
  if (boardProblem) return { ok: false, problems: [boardProblem] };

  const remainingSolids = walls.filter((w) => !hasPortalBounds(w));
  const blockedLines: number[] = [];
  if (grid) {
    lines.forEach((line, index) => {
      if (line.kind === "wall") return;
      const a = cornerPoint(line.from, grid), b = cornerPoint(line.to, grid);
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (remainingSolids.some((wall) => distanceToSegment(middle, wall) < grid.cellSize / 4)) blockedLines.push(index);
    });
  }
  return { ok: true, board, blockedLines };
}

/** Why a map's setup can't be saved, naming each line, or null. Checked with the grid the map has now. */
export function mapSetupProblems(fileBoard: LibraryMapBoard | null, setup: DraftMapSetup, grid: GridNumbers | null, map: { width: number; height: number }): string[] {
  const result = draftMapBoard(fileBoard, setup, grid, map);
  return result.ok ? [] : result.problems;
}

export type DraftCreatureState = Omit<DraftCreature, "key" | "flags" | "notCarriedOver">;
export type DraftEncounterState = Omit<DraftEncounter, "key" | "flags" | "notCarriedOver">;

export interface BuildCheckIssue {
  /** A `flag` is something the AI marked for the GM. A `problem` still needs work. */
  type: "problem" | "flag";
  /** What it is about, such as `creature goblin`. */
  item: string;
  /** The item's own name for people, such as "Goblin", or "Game profile". */
  label: string;
  /** The draft item it is about, so a page can link to it. Null for the game profile. */
  target: { kind: "creature" | "map" | "encounter"; key: string } | null;
  message: string;
}

/**
 * Who reads the check. The AI is told what to do with its tools; the owner is told what to do on
 * the build page, because the same words would ask a person to call a tool they don't have.
 */
export type BuildCheckAudience = "ai" | "owner";

/** Whether a blank value is a problem: only on a player character, for a field the game uses, with no flag. */
export function creatureProblems(creature: Pick<DraftCreature, "isPlayerCharacter" | "hp" | "maxHp" | "ac">, flags: readonly BuildFlag[], features: GameProfile["features"], audience: BuildCheckAudience = "ai"): string[] {
  if (!creature.isPlayerCharacter) return [];
  const flagged = new Set(flags.map((f) => f.field.toLowerCase()));
  const wanted: [boolean, "hp" | "maxHp" | "ac", string][] = [
    [features.hitPoints, "hp", "HP"], [features.hitPoints, "maxHp", "Max HP"], [features.armorClass, "ac", "AC"],
  ];
  return wanted
    .filter(([used, field]) => used && creature[field] === null && !flagged.has(field.toLowerCase()))
    .map(([, , label]) => (audience === "owner"
      ? `${label} is blank, and your AI didn't say why. Fill it in, or publish it blank.`
      : `${label} is blank with no flag. Give a value, or flag it and say why.`));
}

/** How a flagged field reads to a person: the field names the AI uses are code. */
const FIELD_LABELS: Record<string, string> = {
  hp: "HP", maxhp: "Max HP", ac: "AC", attacks: "Attacks", conditions: "Conditions", size: "Size", name: "Name",
  color: "Colour", imagefileid: "Art", grid: "Grid", proposedgrid: "Grid", square: "Square", tokens: "Tokens",
  unitspercell: "Square size", unitlabel: "Square size", features: "Features", notes: "Notes",
};
export const buildFieldLabel = (field: string) => FIELD_LABELS[field.toLowerCase()] ?? field;

export interface BuildCheckInput {
  profile: GameProfile | null;
  /** Who reads it. Defaults to the AI, which `check_build` returns to. */
  audience?: BuildCheckAudience;
  /** Whether the owner lets the AI set walls, doors and windows. */
  aiWalls?: boolean;
  files: readonly { id: string; width: number; height: number; board?: LibraryMapBoard | null }[];
  creatures: readonly { key: string; data: DraftCreatureState; flags: readonly BuildFlag[] }[];
  maps: readonly { key: string; data: DraftMapState; flags: readonly BuildFlag[] }[];
  encounters: readonly { key: string; data: DraftEncounterState; flags: readonly BuildFlag[] }[];
}

const gridWords = (g: GridNumbers) => `${g.cellSize}-pixel squares at offset (${g.offsetX}, ${g.offsetY})`;

type AddIssue = (type: BuildCheckIssue["type"], message: string) => void;
/** The AI's words, or the owner's, for the same issue. */
type Say = (ai: string, owner: string) => string;

/** What still needs work on one map's walls, doors and windows, and what the AI left for the user. */
function mapSetupIssues(data: DraftMapState, file: BuildCheckInput["files"][number] | undefined, aiWalls: boolean, add: AddIssue, say: Say) {
  const setup = data.setup;
  const board = file?.board ?? null;
  const grid = data.grid ?? data.proposedGrid;
  for (const opening of listOpenings(board, setup, grid)) {
    if (opening.now.kind === "left") add("flag", say(`Opening ${opening.number} is left for the user: ${opening.now.reason}`, `Opening ${opening.number} is left for you: ${opening.now.reason}`));
  }
  for (const mark of setup?.marks ?? []) {
    add("flag", say(`Marked at column ${mark.square.column}, row ${mark.square.row}: ${mark.reason}`, `Left for you at column ${mark.square.column}, row ${mark.square.row}: ${mark.reason}`));
  }
  // Reported only while the AI may set them, so a build without the choice raises nothing new.
  if (aiWalls) {
    const untouched = listOpenings(board, setup, grid).filter((o) => !o.set).map((o) => o.number);
    if (untouched.length > 0) {
      add("problem", say(
        `Openings still as imported: ${untouched.join(", ")}. Set each as a door or window, or leave it for the user with a reason.`,
        `Openings still as the file has them: ${untouched.join(", ")}. Set them on the map below, or leave them hidden from players.`,
      ));
    }
  }
  if (!setup || !file) return;
  const result = draftMapBoard(board, setup, grid, file);
  if (!result.ok) {
    // The board's own messages are written for the AI's tools; the owner sets a grid on the page.
    for (const message of result.problems) add("problem", say(message, message.replace(/ Propose one with save_map\.$/, " Set the map's grid first.")));
    return;
  }
  for (const index of result.blockedLines) {
    const line = setup.lines[index]!;
    add("problem", say(
      `${describeDraftLine(line, index)} sits on a wall it doesn't cut, so the wall still blocks it. Draw it along the wall's line, or mark the place for the user.`,
      `${describeDraftLine(line, index)} sits on a wall it doesn't cut, so the wall still blocks it. Remove the line below, or fix it in the map editor after publishing.`,
    ));
  }
}

/** Every problem and flag in a draft, in plain words. Reads only: it changes and publishes nothing. */
export function checkBuild(input: BuildCheckInput): BuildCheckIssue[] {
  const issues: BuildCheckIssue[] = [];
  const audience = input.audience ?? "ai";
  const say: Say = (ai, owner) => (audience === "owner" ? owner : ai);
  const about = (item: string, label: string, target: BuildCheckIssue["target"]): AddIssue =>
    (type, message) => void issues.push({ type, item, label, target, message });
  const addFlags = (add: AddIssue, flags: readonly BuildFlag[]) =>
    flags.forEach((f) => add("flag", `${audience === "owner" ? buildFieldLabel(f.field) : f.field}: ${f.message}`));
  const features = input.profile?.features ?? ALL_FEATURES;

  const profile = about("game profile", "Game profile", null);
  if (input.profile) addFlags(profile, input.profile.flags);
  else {
    profile("problem", say(
      "No game profile yet. Save one so the GM knows which fields this game uses.",
      "Your AI hasn't saved a game profile, so every field counts as in use. Ask it to save one if that's wrong.",
    ));
  }

  const creatures = new Map(input.creatures.map((c) => [c.key, c]));
  const maps = new Map(input.maps.map((m) => [m.key, m]));
  const files = new Map(input.files.map((f) => [f.id, f]));

  for (const { key, data, flags } of input.creatures) {
    const add = about(`creature ${key}`, data.name, { kind: "creature", key });
    addFlags(add, flags);
    for (const message of creatureProblems(data, flags, features, audience)) add("problem", message);
    if (data.imageFileId !== null && !files.has(data.imageFileId)) add("problem", "Its art isn't in this build any more.");
  }

  for (const { key, data, flags } of input.maps) {
    const add = about(`map ${key}`, data.name, { kind: "map", key });
    addFlags(add, flags);
    if (data.gridStatus === "none") add("problem", say("It needs a grid. Propose one, or ask the user for the square size.", "It has no grid yet. Set the square size on the map below, then confirm it."));
    if (data.gridStatus === "proposed" && data.gridDiffers && data.proposedGrid) {
      add("problem", say(
        `Your grid (${gridWords(data.proposedGrid)}) differs from grid detection's (${gridWords(data.gridDiffers)}), so it waits for the user. Look at the map with the grid drawn, then propose again.`,
        `Your AI's grid (${gridWords(data.proposedGrid)}) differs from grid detection's (${gridWords(data.gridDiffers)}). Check the map below and confirm the right one.`,
      ));
    } else if (data.gridStatus === "proposed") {
      add("problem", say("Its grid is waiting for the user to confirm it on the build page.", "Its grid is waiting for you. Check it on the map below, then confirm it."));
    }
    const file = files.get(data.fileId);
    if (!file) add("problem", "Its file isn't in this build any more.");
    mapSetupIssues(data, file, input.aiWalls ?? false, add, say);
  }

  for (const { key, data, flags } of input.encounters) {
    const add = about(`encounter ${key}`, data.name, { kind: "encounter", key });
    addFlags(add, flags);
    const map = maps.get(data.mapKey);
    if (!map) add("problem", `It names map "${data.mapKey}", which isn't in this build.`);
    const file = map ? files.get(map.data.fileId) : undefined;
    const grid = map?.data.grid ?? map?.data.proposedGrid ?? null;
    data.tokens.forEach((token, index) => {
      const creature = creatures.get(token.creatureKey);
      const label = token.name ?? creature?.data.name ?? token.creatureKey;
      if (!creature) add("problem", `Token ${index + 1} names creature "${token.creatureKey}", which isn't in this build.`);
      if (!token.square) add("problem", say(`${label} has no square yet.`, `${label} has no square yet. Place it in the encounter's editor, or remove it.`));
      else if (creature && grid && file && !footprintCenter(token.square, creature.data.size, grid, file)) add("problem", `${label} is off the map.`);
    });
  }
  return issues;
}

/**
 * Builds a template from a draft its owner approved (ADR 0053), the exception to "only from a live
 * room". The client sends no board: everything here comes from validated draft fields and the
 * library values at this moment. Applies the checks `token.create` makes, and reports every
 * problem at once, so the GM can fix them together. Owners and initiative are never set.
 */
export function draftEncounterToTemplate(source: DraftEncounterSource): DraftEncounterResult {
  const { map, grid, board } = source;
  const walls = board.walls.filter(blocksMovement);
  const problems: DraftEncounterProblem[] = [];
  const tokens: TemplateToken[] = [];

  for (const draft of source.tokens) {
    const creature = source.creatures.get(draft.creatureKey);
    const name = draft.name ?? creature?.name ?? draft.creatureKey;
    const refuse = (message: string) => void problems.push({ token: name, message });

    if (!creature) { refuse("This build has no creature with that key."); continue; }
    if (!draft.square) { refuse("It has no square yet. Place it or remove it."); continue; }
    const position = footprintCenter(draft.square, creature.size, grid, map);
    if (!position) { refuse("Its square is off the map."); continue; }
    if (footprintCrossesWall(position, creature.size, grid, walls)) { refuse("It would stand across a wall. Move it or remove it."); continue; }
    const hp = creature.hp ?? creature.maxHp;
    if (hp !== null && creature.maxHp !== null && hp > creature.maxHp) { refuse("Its HP is more than its Max HP."); continue; }

    tokens.push({
      name,
      position,
      size: creature.size,
      rotation: 0,
      color: creature.color,
      imageUrl: creature.imageUrl,
      ...(creature.assetId ? { assetId: creature.assetId } : {}),
      hidden: draft.hidden,
      stats: { hp, maxHp: creature.maxHp, ac: creature.ac },
      conditions: creature.conditions,
      ...(creature.attacks.length > 0 ? { attacks: creature.attacks } : {}),
    });
  }
  if (problems.length > 0) return { ok: false, problems };

  const parsed = EncounterTemplateData.safeParse({
    map, grid, tokens, fog: board.fog, walls: board.walls, ...(board.terrain ? { terrain: board.terrain } : {}),
  });
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => {
        const index = issue.path[0] === "tokens" && typeof issue.path[1] === "number" ? issue.path[1] : undefined;
        return { token: index === undefined ? "This encounter" : (tokens[index]?.name ?? "This encounter"), message: issue.message };
      }),
    };
  }
  return { ok: true, data: parsed.data };
}
