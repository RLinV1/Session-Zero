import { z } from "zod";
import { AttackDice, AttackPreset, MAX_TOKEN_ATTACKS } from "./attackPresets";
import { DEFAULT_TOKEN_COLOR } from "./commands";
import type { ConditionId } from "./conditions";
import { EncounterTemplateData, MAX_ENCOUNTER_NAME, type TemplateToken } from "./encounters";
import { GridSpec, footprintCrossesWall, snapTokenCenter, type Point } from "./geometry";
import type { LibraryMapBoard } from "./libraryBoard";
import { blocksMovement } from "./portals";
import { CreatureFields, LibraryUploadFields } from "./protocol";

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
} as const;

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

/** Where a draft map's grid stands. Only a person can make it `confirmed`, or a UVTT file, which is exact. */
export const BuildGridStatus = z.enum(["none", "proposed", "confirmed"]);
export type BuildGridStatus = z.infer<typeof BuildGridStatus>;

/** A map from one of this build's files. No walls, doors or fog: the AI doesn't draw on maps. */
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
  if (left < -EDGE_TOLERANCE || top < -EDGE_TOLERANCE) return null;
  if (left + span > map.width + EDGE_TOLERANCE || top + span > map.height + EDGE_TOLERANCE) return null;
  return snapTokenCenter({ x: left + span / 2, y: top + span / 2 }, size, grid as GridSpec);
}

/** A saved draft map: what the AI gave, and where its grid stands. Only the server sets the last two. */
export interface DraftMapState {
  name: string;
  fileId: string;
  proposedGrid: DraftProposedGrid | null;
  gridStatus: BuildGridStatus;
  /** The confirmed grid: a UVTT file's, or the one a person confirmed. */
  grid: GridSpec | null;
}

export type DraftCreatureState = Omit<DraftCreature, "key" | "flags" | "notCarriedOver">;
export type DraftEncounterState = Omit<DraftEncounter, "key" | "flags" | "notCarriedOver">;

export interface BuildCheckIssue {
  /** A `flag` is something the AI marked for the GM. A `problem` still needs work. */
  type: "problem" | "flag";
  /** What it is about, such as `creature goblin`. */
  item: string;
  message: string;
}

/** Whether a blank value is a problem: only on a player character, for a field the game uses, with no flag. */
export function creatureProblems(creature: Pick<DraftCreature, "isPlayerCharacter" | "hp" | "maxHp" | "ac">, flags: readonly BuildFlag[], features: GameProfile["features"]): string[] {
  if (!creature.isPlayerCharacter) return [];
  const flagged = new Set(flags.map((f) => f.field.toLowerCase()));
  const wanted: [boolean, "hp" | "maxHp" | "ac", string][] = [
    [features.hitPoints, "hp", "HP"], [features.hitPoints, "maxHp", "Max HP"], [features.armorClass, "ac", "AC"],
  ];
  return wanted
    .filter(([used, field]) => used && creature[field] === null && !flagged.has(field.toLowerCase()))
    .map(([, , label]) => `${label} is blank with no flag. Give a value, or flag it and say why.`);
}

export interface BuildCheckInput {
  profile: GameProfile | null;
  files: readonly { id: string; width: number; height: number }[];
  creatures: readonly { key: string; data: DraftCreatureState; flags: readonly BuildFlag[] }[];
  maps: readonly { key: string; data: DraftMapState; flags: readonly BuildFlag[] }[];
  encounters: readonly { key: string; data: DraftEncounterState; flags: readonly BuildFlag[] }[];
}

/** Every problem and flag in a draft, in plain words. Reads only: it changes and publishes nothing. */
export function checkBuild(input: BuildCheckInput): BuildCheckIssue[] {
  const issues: BuildCheckIssue[] = [];
  const add = (type: BuildCheckIssue["type"], item: string, message: string) => void issues.push({ type, item, message });
  const addFlags = (item: string, flags: readonly BuildFlag[]) => flags.forEach((f) => add("flag", item, `${f.field}: ${f.message}`));
  const features = input.profile?.features ?? ALL_FEATURES;

  if (input.profile) addFlags("game profile", input.profile.flags);
  else add("problem", "game profile", "No game profile yet. Save one so the GM knows which fields this game uses.");

  const creatures = new Map(input.creatures.map((c) => [c.key, c]));
  const maps = new Map(input.maps.map((m) => [m.key, m]));
  const files = new Map(input.files.map((f) => [f.id, f]));

  for (const { key, data, flags } of input.creatures) {
    const item = `creature ${key}`;
    addFlags(item, flags);
    for (const message of creatureProblems(data, flags, features)) add("problem", item, message);
    if (data.imageFileId !== null && !files.has(data.imageFileId)) add("problem", item, "Its art isn't in this build any more.");
  }

  for (const { key, data, flags } of input.maps) {
    const item = `map ${key}`;
    addFlags(item, flags);
    if (data.gridStatus === "none") add("problem", item, "It needs a grid. Propose one, or ask the user for the square size.");
    if (data.gridStatus === "proposed") add("problem", item, "Its grid is waiting for the user to confirm it on the build page.");
    if (!files.has(data.fileId)) add("problem", item, "Its file isn't in this build any more.");
  }

  for (const { key, data, flags } of input.encounters) {
    const item = `encounter ${key}`;
    addFlags(item, flags);
    const map = maps.get(data.mapKey);
    if (!map) add("problem", item, `It names map "${data.mapKey}", which isn't in this build.`);
    const file = map ? files.get(map.data.fileId) : undefined;
    const grid = map?.data.grid ?? map?.data.proposedGrid ?? null;
    data.tokens.forEach((token, index) => {
      const creature = creatures.get(token.creatureKey);
      const label = token.name ?? creature?.data.name ?? token.creatureKey;
      if (!creature) add("problem", item, `Token ${index + 1} names creature "${token.creatureKey}", which isn't in this build.`);
      if (!token.square) add("problem", item, `${label} has no square yet.`);
      else if (creature && grid && file && !footprintCenter(token.square, creature.data.size, grid, file)) add("problem", item, `${label} is off the map.`);
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
