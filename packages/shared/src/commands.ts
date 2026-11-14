import { z } from "zod";
import { SceneName } from "./scenes";
import { PaintRun, TerrainContext, MAX_TERRAIN_CELLS } from "./terrain";
import { AttackStyle, MAX_NUKE_DAMAGE, NukeAnimationDef } from "./animation";
import { TokenAttacks } from "./attackPresets";
import { ConditionId, EMPTY_STATS, TokenStats } from "./conditions";
import { AttackKind, DiceVisibility, MAX_ATTACK_LABEL, MAX_EXPRESSION_LENGTH, MAX_GROUP_ROLL_TOKENS, Verdict } from "./dice";
import { DamageMode, MAX_AREA_AMOUNT } from "./areaEffects";
import { GridSpec, MAX_MOVE_VIA, Point } from "./geometry";
import { MAP_TOKEN_POLICIES } from "./mapTokenAdjustment";
import { AreaColor, AreaShape, DEFEAT_REMOVALS, DIAGONAL_RULES, DIFFICULT_TERRAIN_MODES, DrawingShape, Id, InitiativeScore, MapImage, MAX_CHAT_LENGTH, MAX_FOG_POINTS, MAX_FOG_REGIONS, MAX_PLAYERS_PER_ROOM, MAX_WALLS, Portal, PortalState, ROLL_LOG_LIMIT, TemplateGeometry, Wall } from "./state";

/** Most walls one `wall.remove` names (ADR 0029), keeping the command under the socket limit. */
export const MAX_WALLS_PER_REMOVE = 500;
/** Most walls one `wall.add` draws (wall-editing). The Walls tool sends one per segment. */
export const MAX_WALLS_PER_ADD = 50;

/**
 * Commands are REQUESTS from a client. The server validates and authorizes them,
 * then turns each accepted command into one or more committed events.
 * Naming: `noun.verb`, imperative.
 */
/** Colour of a new token when none is given; the Add token preview draws the same disc. */
export const DEFAULT_TOKEN_COLOR = "#c0392b";
/** Most copies one `token.create` may place (KAN-70). */
export const MAX_TOKENS_PER_CREATE = 20;

/** Upper bound on tokens resolved in one `participant.resolveDeparture`. */
export const MAX_DEPARTURE_ACTIONS = 200;

/** One token's fate after its owner left. "Decide later" is simply not sending an action. */
export const DepartureAction = z.discriminatedUnion("action", [
  /** Replace the departed player with `to` in the owners; other co-owners stay. */
  z.object({ tokenId: Id, action: z.literal("reassign"), to: Id }),
  /** Drop the departed player from the owners. */
  z.object({ tokenId: Id, action: z.literal("unassign") }),
  z.object({ tokenId: Id, action: z.literal("delete") }),
]);
export type DepartureAction = z.infer<typeof DepartureAction>;

/**
 * Chat text (KAN-75, ADR 0015): trimmed, 1 to MAX_CHAT_LENGTH characters, and no control
 * characters (\p{Cc}, so no line breaks), invisible formatting characters (\p{Cf}, so no
 * right-to-left overrides or zero-width spoofing) or lone surrogates (\p{Cs}, which Postgres
 * `jsonb` refuses). The zero-width joiner and non-joiner are allowed: emoji sequences and
 * Persian and Indic scripts need them. A message must show at least one visible character.
 */
export const ChatText = z
  .string()
  .trim()
  .min(1)
  .max(MAX_CHAT_LENGTH)
  .refine(
    (text) => !/[\p{Cc}\p{Cs}]|(?!\u200c|\u200d)\p{Cf}/u.test(text),
    "Messages can't contain control or invisible formatting characters.",
  )
  .refine(
    // Spaces, characters that render as nothing (joiners, Hangul fillers, U+034F) and the Braille
    // blank, which is a symbol, not a space: a message of only these looks empty.
    (text) => text.replace(/[\p{Z}\p{Default_Ignorable_Code_Point}\u2800]/gu, "").length > 0,
    "Messages need at least one visible character.",
  );

/** Fields a token editor may change in one validated, atomic room command. */
export const TokenUpdate = z.object({
  name: z.string().min(1).max(60).optional(),
  position: Point.optional(),
  size: z.number().positive().max(10).optional(),
  rotation: z.number().finite().optional(),
  imageUrl: z.string().min(1).max(2048).nullable().optional(),
  assetId: Id.nullable().optional(),
  stats: TokenStats.optional(),
  conditions: z.array(ConditionId).max(12).optional(),
  ownerIds: z.array(Id).optional(),
  hidden: z.boolean().optional(),
  /** The token's named attacks, replacing the list; the GM or an owner may set them (ADR 0034). */
  attacks: TokenAttacks.optional(),
}).strict();
export type TokenUpdate = z.infer<typeof TokenUpdate>;

/** A preparation can contain only these board edits: no nesting, identity, map or token commands. */
export const PreparationEdit = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scene.setLineOfSight"), expectedSceneId: Id.optional(), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("scene.setIsometric"), expectedSceneId: Id.optional(), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("scene.setSightRange"), expectedSceneId: Id.optional(), range: z.number().positive().finite().nullable() }).strict(),
  z.object({ type: z.literal("terrain.paint"), expectedSceneId: Id.optional(), layerId: z.string().min(1).max(64), paint: z.array(PaintRun).min(1).max(MAX_TERRAIN_CELLS), context: TerrainContext }).strict(),
  z.object({ type: z.literal("terrain.effect.create"), expectedSceneId: Id.optional(), name: z.string().trim().min(1).max(60), effectId: Id.optional(), context: TerrainContext }).strict(),
  z.object({ type: z.literal("terrain.effect.rename"), expectedSceneId: Id.optional(), effectId: Id, name: z.string().trim().min(1).max(60), context: TerrainContext }).strict(),
  z.object({ type: z.literal("terrain.effect.remove"), expectedSceneId: Id.optional(), effectId: Id, context: TerrainContext }).strict(),
  z.object({
    type: z.literal("fog.replace"), expectedSceneId: Id.optional(),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    removeIds: z.array(Id).max(MAX_FOG_REGIONS),
    add: z.array(z.discriminatedUnion("shape", [
      z.object({ shape: z.literal("rect"), from: Point, to: Point }).strict(),
      z.object({ shape: z.literal("polygon"), points: z.array(Point).min(3).max(MAX_FOG_POINTS) }).strict(),
    ])).max(MAX_FOG_REGIONS),
  }).strict(),
  z.object({
    type: z.literal("wall.add"), expectedSceneId: Id.optional(),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    /** `portal` lets the map editor's Save keep a door drawn in its draft (ADR 0030). */
    walls: z.array(z.object({ a: Point, b: Point, portal: Portal.optional(), uvttPortal: Wall.shape.uvttPortal, source: Wall.shape.source }).strict()).min(1).max(MAX_WALLS_PER_ADD),
  }).strict(),
  z.object({ type: z.literal("wall.update"), expectedSceneId: Id.optional(), expectedMapUrl: z.string().min(1).max(2048).optional(), wall: Wall }).strict(),
  z.object({
    type: z.literal("wall.remove"), expectedSceneId: Id.optional(),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    wallIds: z.array(Id).min(1).max(MAX_WALLS_PER_REMOVE),
  }).strict(),
  z.object({
    type: z.literal("wall.clear"), expectedSceneId: Id.optional(),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
  }).strict(),
  z.object({
    type: z.literal("portal.set"), expectedSceneId: Id.optional(),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    wallId: Id,
    portal: Portal.nullable(),
  }).strict(),
]);
export type PreparationEdit = z.infer<typeof PreparationEdit>;
/** Enough for 1,500 wall edits, bounded terrain chunks, fog and sight, with no recursion. */
export const MAX_PREPARATION_EDITS = 1600;
/** Below the socket transport limit; accommodates a fragmented 10,000-cell preparation. */
export const MAX_PREPARATION_BYTES = 768 * 1024;
export const PreparationSaved = z.object({ seq: z.number().int().nonnegative().nullable() }).strict();
export const PreparationSave = z.object({
  type: z.literal("scene.savePreparation"), expectedSceneId: Id.optional(),
  expectedMapUrl: z.string().min(1).max(2048),
  context: TerrainContext,
  edits: z.array(PreparationEdit).min(1).max(MAX_PREPARATION_EDITS),
}).strict().refine((command) => new TextEncoder().encode(JSON.stringify(command)).length < MAX_PREPARATION_BYTES, "Preparation is too large.");

/** Tokens carried to a new board, or placed from staging (ADR 0068). Max 60, matching an initiative order. */
export const MAX_CARRIED_TOKENS = 60;
const CarryTokenIds = z.array(Id).min(1).max(MAX_CARRIED_TOKENS).refine((ids) => new Set(ids).size === ids.length, "Duplicate token");

/**
 * Select and place on a new map (ADR 0068): the tokens on the map to keep, waiting off it until
 * the GM places them; every other token on the map is removed. Empty removes them all.
 */
const PlaceTokenIds = z.array(Id).max(1000).refine((ids) => new Set(ids).size === ids.length, "Duplicate token");

/** Atomic preparation for either the live board or one GM-only inactive scene. */

export const PreparationRequest = z.union([PreparationSave, z.object({
  type: z.literal("scene.prepare"), sceneId: Id, command: PreparationSave,
}).strict()]).refine((command) => new TextEncoder().encode(JSON.stringify(command)).length < MAX_PREPARATION_BYTES, "Preparation is too large.");
export type PreparationRequest = z.infer<typeof PreparationRequest>;

const BoardCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scene.create"), name: SceneName, activate: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("scene.copyCurrent"), sceneId: Id }).strict(),
  z.object({ type: z.literal("scene.rename"), sceneId: Id, name: SceneName }).strict(),
  z.object({ type: z.literal("scene.switch"), sceneId: Id, carryTokenIds: CarryTokenIds.optional() }).strict(),
  z.object({ type: z.literal("scene.delete"), sceneId: Id }).strict(),
  ...PreparationEdit.options,
  PreparationSave,
  z.object({
    type: z.literal("scene.setMap"), expectedSceneId: Id.optional(),
    resetTerrain: z.boolean().optional(),
    terrainContext: TerrainContext.optional(),
    tokenPolicy: z.enum(MAP_TOKEN_POLICIES).optional(),
    /** Select and place instead of a `tokenPolicy` (ADR 0068). */
    placeTokenIds: PlaceTokenIds.optional(),
    map: MapImage,
    /** A library map's saved grid, copied into the room in the same event (ADR 0004). */
    grid: GridSpec.optional(),
    /** Resolve the owned map's saved geometry on the server and apply it in the same MapSet. */
    includeLibraryBoard: z.boolean().optional(),
  }),
  z.object({ type: z.literal("scene.importUVTT"), expectedSceneId: Id.optional(), importId: Id, revision: z.number().int().positive(), tokenPolicy: z.enum(MAP_TOKEN_POLICIES).optional(), placeTokenIds: PlaceTokenIds.optional() }).strict(),
  /**
   * Links the board's map to the GM's library map it was just saved as (ADR 0070). Sent by the
   * server's Save to library route; a saved scene is linked inside `scene.prepare`.
   */
  z.object({
    type: z.literal("scene.linkMap"), expectedSceneId: Id.optional(), expectedMapUrl: z.string().min(1).max(2048),
    /** The link the server saw when it read the board: refused if it changed since (no double copies). */
    expectedAssetId: Id.nullable(),
    assetId: Id,
  }).strict(),
  z.object({
    type: z.literal("scene.setGrid"), expectedSceneId: Id.optional(),
    resetTerrain: z.boolean().optional(),
    terrainContext: TerrainContext.optional(),
    grid: GridSpec,
  }),
  z.object({
    type: z.literal("token.create"),
    name: z.string().min(1).max(60),
    position: Point,
    size: z.number().positive().max(10).default(1),
    rotation: z.number().finite().default(0),
    stats: TokenStats.default(EMPTY_STATS),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(DEFAULT_TOKEN_COLOR),
    imageUrl: z.string().max(2048).nullable().default(null),
    assetId: Id.nullable().default(null),
    ownerIds: z.array(Id).default([]),
    hidden: z.boolean().default(false),
    /** Conditions the token starts with, e.g. from a creature (KAN-70). */
    conditions: z.array(ConditionId).max(12).default([]),
    attacks: TokenAttacks.default([]),
    /** Place this many copies in one action, numbered and spread over free squares (KAN-70). */
    count: z.number().int().min(1).max(MAX_TOKENS_PER_CREATE).default(1),
    /** Put the new tokens in this existing group, in the same action. */
    groupId: Id.optional(),
  }),
  /**
   * GM copies a token, 1–20 times, onto the nearest free squares beside it (KAN-82), or starting
   * at `position` when the GM chose the square (ADR 0033).
   */
  /**
   * GM places staged tokens with one click (ADR 0068): the first on `origin`, the rest spread
   * around it. `tokenIds` picks some of them; absent places every staged token.
   */
  z.object({
    type: z.literal("token.placeStaged"),
    origin: Point,
    tokenIds: CarryTokenIds.optional(),
    expectedSceneId: Id.optional(),
  }).strict(),
  z.object({
    type: z.literal("token.duplicate"),
    tokenId: Id,
    count: z.number().int().min(1).max(MAX_TOKENS_PER_CREATE).default(1),
    position: Point.optional(),
  }).strict(),
  /** GM-only token groups (KAN-82, ADR 0026). */
  z.object({
    type: z.literal("group.create"),
    name: z.string().max(200),
  }).strict(),
  z.object({
    type: z.literal("group.rename"),
    groupId: Id,
    name: z.string().max(200),
  }).strict(),
  z.object({
    type: z.literal("group.delete"),
    groupId: Id,
  }).strict(),
  /** Puts tokens into a group, or takes them out of any group with `groupId: null`. */
  z.object({
    type: z.literal("group.assign"),
    groupId: Id.nullable(),
    tokenIds: z.array(Id).min(1).max(100),
  }).strict(),
  z.object({
    type: z.literal("token.move"), expectedSceneId: Id.optional(),
    tokenId: Id,
    to: Point,
    /** Where the path turns, start and end excluded; each leg is checked like a straight move (ADR 0055). */
    via: z.array(Point).max(MAX_MOVE_VIA).optional(),
    expectedOrigin: Point.optional(),
    boardEpoch: z.number().int().nonnegative().optional(),
    reposition: z.boolean().optional(),
  }),
  /** GM edits the identity and footprint of a placed token in one event. */
  z.object({
    type: z.literal("token.setAppearance"),
    tokenId: Id,
    name: z.string().min(1).max(60),
    size: z.number().positive().max(10),
    rotation: z.number().finite(),
  }),
  z.object({
    type: z.literal("token.configure"),
    tokenId: Id,
    changes: TokenUpdate,
  }),
  z.object({
    type: z.literal("token.delete"),
    tokenId: Id,
  }),
  z.object({
    type: z.literal("token.setOwners"),
    tokenId: Id,
    ownerIds: z.array(Id),
  }),
  z.object({
    type: z.literal("token.setHidden"),
    tokenId: Id,
    hidden: z.boolean(),
  }),
  z.object({
    type: z.literal("token.setStats"),
    tokenId: Id,
    stats: TokenStats,
  }),
  /** Replace or remove a token's art (ADR 0008). GM only, like choosing it at creation. */
  z.object({
    type: z.literal("token.setImage"),
    tokenId: Id,
    imageUrl: z.string().min(1).max(2048).nullable(),
    /** Library asset the image came from, if any (ADR 0004). */
    assetId: Id.nullable().default(null),
  }),
  z.object({
    type: z.literal("token.setConditions"),
    tokenId: Id,
    conditions: z.array(ConditionId).max(12),
  }),
  /** Start or replace the turn order (FR-GM-21). Entries are sorted by score, descending. */
  z.object({
    type: z.literal("initiative.start"),
    entries: z
      .array(z.object({ tokenId: Id, score: z.number().int().min(-99).max(999) }))
      .min(1)
      .max(60),
  }),
  z.object({
    type: z.literal("initiative.advance"),
  }),
  z.object({
    type: z.literal("initiative.end"),
  }),
  /**
   * End `tokenId`'s turn (FR-GM-21, ADR 0060). Any owner of the token, or the GM. Refused unless
   * `tokenId` is the active token, so an end turn that crosses Next turn can't skip anyone.
   */
  z.object({
    type: z.literal("initiative.endTurn"),
    tokenId: Id,
  }),
  /** GM only: step the turn back one, into the previous round from its first token (ADR 0060). */
  z.object({
    type: z.literal("initiative.previous"),
  }),
  /**
   * GM only: put tokens into the running encounter, each placed by its score; the active turn stays.
   * All or nothing: one refused entry refuses the whole command (ADR 0065).
   */
  z.object({
    type: z.literal("initiative.add"),
    entries: z.array(z.object({ tokenId: Id, score: InitiativeScore })).min(1).max(60),
  }),
  /** GM only: take a token out of the running encounter; the last one out ends it (ADR 0065). */
  z.object({
    type: z.literal("initiative.remove"),
    tokenId: Id,
  }),
  /** Roll dice (FR-TAC-09). `gm` visibility is GM-only and never reaches players (FR-GM-22). */
  z.object({
    type: z.literal("dice.roll"),
    expression: z.string().min(1).max(MAX_EXPRESSION_LENGTH),
    visibility: DiceVisibility.default("public"),
    /** Makes this an attack roll: who attacks whom, and with what (ADR 0010). */
    attack: z
      .object({
        actorTokenId: Id,
        targetTokenId: Id,
        label: z.string().trim().max(MAX_ATTACK_LABEL).optional(),
        /** To hit (the GM rules on it) or damage (the GM applies it) (ADR 0011). */
        kind: AttackKind.default("toHit"),
        /** How the strike is drawn; changes nothing about the roll (ADR 0038). */
        style: AttackStyle.optional(),
      })
      .optional(),
  }),
  /** GM only: roll one expression once for each of several tokens, logged as one entry (ADR 0046). */
  z.object({
    type: z.literal("dice.rollGroup"),
    tokenIds: z.array(Id).min(1).max(MAX_GROUP_ROLL_TOKENS),
    expression: z.string().min(1).max(MAX_EXPRESSION_LENGTH),
    label: z.string().trim().max(MAX_ATTACK_LABEL).optional(),
    visibility: DiceVisibility.default("public"),
  }).strict(),
  /** GM only: open an area effect, rolling `expression` for each token it caught (ADR 0046). */
  z.object({
    type: z.literal("areaEffect.start"),
    tokenIds: z.array(Id).min(1).max(MAX_GROUP_ROLL_TOKENS),
    expression: z.string().min(1).max(MAX_EXPRESSION_LENGTH),
    label: z.string().trim().max(MAX_ATTACK_LABEL).optional(),
  }).strict(),
  /** GM only: call a participant (themselves included) to roll the damage, or move a pending call (ADR 0046). */
  z.object({
    type: z.literal("areaEffect.call"),
    effectId: Id,
    participantId: Id,
  }).strict(),
  /** Whoever holds the call: roll the damage once for all targets or once per target (ADR 0046). */
  z.object({
    type: z.literal("areaEffect.rollDamage"),
    effectId: Id,
    expression: z.string().min(1).max(MAX_EXPRESSION_LENGTH),
    mode: DamageMode,
  }).strict(),
  /**
   * GM only: apply each target's amount (negative heals) and add conditions, closing the effect
   * (ADR 0046). `amount` is null for a target that takes no HP change.
   */
  z.object({
    type: z.literal("areaEffect.resolve"),
    effectId: Id,
    rows: z.array(z.object({
      tokenId: Id,
      amount: z.number().int().min(-MAX_AREA_AMOUNT).max(MAX_AREA_AMOUNT).nullable(),
      addConditions: z.array(ConditionId).max(12).default([]),
    }).strict()).max(MAX_GROUP_ROLL_TOKENS),
  }).strict(),
  /** GM only: close the effect without changing any token (ADR 0046). */
  z.object({
    type: z.literal("areaEffect.close"),
    effectId: Id,
  }).strict(),
  /** GM only: play every board animation in its reduced-motion form for the whole table (ADR 0038). */
  z.object({
    type: z.literal("room.setReducedEffects"),
    enabled: z.boolean(),
  }),
  /** GM only: which tokens leave the board at 0 HP or below (ADR 0049, ADR 0057). */
  z.object({
    type: z.literal("room.setDefeatRemoval"),
    mode: z.enum(DEFEAT_REMOVALS),
  }),
  /** GM only: players who own no visible token see nothing on the board (ADR 0057). */
  z.object({
    type: z.literal("room.setHideMapWithoutToken"),
    enabled: z.boolean(),
  }),
  /** GM only: players get no HP for tokens they don't own (ADR 0057). */
  z.object({
    type: z.literal("room.setHideHp"),
    enabled: z.boolean(),
  }),
  /** GM only: players get no AC for tokens they don't own (ADR 0057). */
  z.object({
    type: z.literal("room.setHideAc"),
    enabled: z.boolean(),
  }),
  /** GM only: how diagonal steps cost for everyone (ADR 0055). */
  z.object({
    type: z.literal("room.setDiagonalRule"),
    rule: z.enum(DIAGONAL_RULES),
  }),
  /** GM only: when Difficult terrain doubles a step (ADR 0055). */
  z.object({
    type: z.literal("room.setDifficultTerrain"),
    mode: z.enum(DIFFICULT_TERRAIN_MODES),
  }),
  /** GM only: stop or allow new players joining by invite, whoever holds the link (ADR 0051). */
  z.object({
    type: z.literal("room.setJoinsLocked"),
    locked: z.boolean(),
  }),
  /** GM only: damage every token with HP and play a map-wide blast (ADR 0038). */
  z.object({
    type: z.literal("nuke.detonate"),
    amount: z.number().int().min(1).max(MAX_NUKE_DAMAGE),
    origin: Point,
    animation: NukeAnimationDef.optional(),
  }),
  /** GM only: mark a to-hit attack roll Hit or Miss, or clear the ruling with null (ADR 0011). */
  z.object({
    type: z.literal("roll.rule"),
    rollId: Id,
    verdict: Verdict.nullable(),
  }),
  /**
   * GM only: resolve a damage roll against its target, once (ADR 0011, ADR 0062): apply `amount`
   * (negative heals; absent means the roll's total, floored at 0) and add `addConditions`.
   */
  z.object({
    type: z.literal("roll.applyDamage"),
    rollId: Id,
    amount: z.number().int().min(-MAX_AREA_AMOUNT).max(MAX_AREA_AMOUNT).optional(),
    addConditions: z.array(ConditionId).max(12).default([]),
  }).strict(),
  /**
   * GM only: take attack rolls off the Rulings list without ruling on them (ADR 0060). Names the
   * rolls the GM saw, so a roll made since isn't swept away with them.
   */
  z.object({
    type: z.literal("roll.dismiss"),
    rollIds: z.array(Id).min(1).max(ROLL_LOG_LIMIT),
  }),
  z.object({
    type: z.literal("participant.rename"),
    displayName: z.string().min(1).max(40),
  }),
  /** Place an area template for the table to see (FR-TAC-06, ADR 0007). Only the GM may make it GM-only. */
  z.object({
    type: z.literal("template.place"),
    shape: AreaShape,
    origin: Point,
    toward: Point,
    size: z.number().positive().max(1000),
    /** A line's width in grid units; one cell when left out (KAN-35). */
    width: z.number().positive().max(1000).optional(),
    /** One of the fixed area colours (ADR 0040); anything else fails to parse. */
    color: AreaColor.optional(),
    gmOnly: z.boolean().default(false),
  }),
  /**
   * Move, resize, turn or widen a placed template (ADR 0058). Its owner or the GM. Always the full
   * new geometry; `expected` is the geometry the edit was made from, so a stale edit is refused.
   */
  z.object({
    type: z.literal("template.update"),
    /** The scene the edit was made on; a different active scene refuses it, as for token moves. */
    expectedSceneId: Id.optional(),
    templateId: Id,
    origin: Point,
    toward: Point,
    size: z.number().positive().max(1000),
    /** A line's width in grid units; ignored for other shapes. */
    width: z.number().positive().max(1000).optional(),
    expected: TemplateGeometry,
  }),
  /** Remove a placed template. Its owner or the GM. */
  z.object({
    type: z.literal("template.remove"),
    templateId: Id,
  }),
  /**
   * Draw a line, box, circle or freehand stroke for the whole table (FR-TAC-04, ADR 0064). Any
   * active participant. Whole map pixels, inside the map; a stroke has at most `MAX_STROKE_POINTS`.
   */
  z.object({
    type: z.literal("drawing.add"),
    drawing: DrawingShape,
  }),
  /** Erase a drawing. Its drawer or the GM (ADR 0064). */
  z.object({
    type: z.literal("drawing.remove"),
    drawingId: Id,
  }),
  /** A player permanently gives up their seat (KAN-58, ADR 0006). The GM cannot leave. */
  z.object({
    type: z.literal("participant.leave"),
  }),
  /** GM removes a player from the room for good (FR-GM-20, ADR 0006). Tokens are left for the review. */
  z.object({
    type: z.literal("participant.revoke"),
    participantId: Id,
  }),
  /** GM removes several players in one step, all or none (ADR 0051). */
  z.object({
    type: z.literal("participant.revokeMany"),
    participantIds: z.array(Id).min(1).max(MAX_PLAYERS_PER_ROOM),
  }),
  /** GM decides, token by token, what happens to what a departed player owned (ADR 0006). */
  z.object({
    type: z.literal("participant.resolveDeparture"),
    participantId: Id,
    actions: z.array(DepartureAction).min(1).max(MAX_DEPARTURE_ACTIONS),
  }),
  /**
   * Put your own dice look on the table, or take it off with `null` (shared-dice-looks, ADR 0018).
   * Strict: the look's pictures are never the client's to name; the server reads them from the
   * look your account owns, and refuses any other.
   */
  z.object({
    type: z.literal("participant.setDiceLook"),
    lookId: Id.nullable(),
  }).strict(),
  /** GM puts a player's dice back to classic in this room (shared-dice-looks). */
  z.object({
    type: z.literal("participant.clearDiceLook"),
    participantId: Id,
  }).strict(),
  /** Send a chat message to the room (KAN-75, ADR 0015). Strict: a client can't name the sender. */
  z.object({
    type: z.literal("chat.send"),
    text: ChatText,
  }).strict(),
  /**
   * GM conceals part of the map (FR-GM-17, ADR 0016): a rectangle between two corners, or a
   * polygon. `decide` stores a rectangle as its four corners.
   */
  z.object({
    type: z.literal("fog.add"), expectedSceneId: Id.optional(),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    region: z.discriminatedUnion("shape", [
      z.object({ shape: z.literal("rect"), from: Point, to: Point }).strict(),
      z.object({ shape: z.literal("polygon"), points: z.array(Point).min(3).max(MAX_FOG_POINTS) }).strict(),
    ]),
  }).strict(),
  /** GM removes one fog region, revealing what it covered (FR-GM-17). */
  z.object({
    type: z.literal("fog.remove"), expectedSceneId: Id.optional(),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    regionId: Id,
  }).strict(),
  /**
   * GM applies the walls detected for the room's current map (FR-GM-11, ADR 0029), replacing any
   * walls already there. The segments come from the server's validated result, never the client.
   */
  z.object({
    type: z.literal("wall.applyDetected"),
    mapUrl: z.string().min(1).max(2048),
    exclude: z.object({
      resultId: z.string().min(1).max(128),
      indices: z.array(z.number().int().min(0).max(MAX_WALLS - 1)).max(MAX_WALLS),
    }).strict().optional(),
  }).strict(),
  /** Opens, closes or locks a portal (FR-GM-18, ADR 0030). Players may only open or close one they can see. */
  z.object({
    type: z.literal("portal.setState"), expectedSceneId: Id.optional(),
    wallId: Id,
    state: PortalState,
  }).strict(),
  /** GM saves the board as a named restore point (FR-REC-02, ADR 0019). */
  z.object({
    type: z.literal("checkpoint.create"),
    name: z.string().max(200),
  }).strict(),
  /** GM puts the board back as it was at a checkpoint (FR-REC-02, ADR 0019). */
  z.object({
    type: z.literal("checkpoint.restore"),
    checkpointId: Id,
  }).strict(),
  /** GM removes a checkpoint from the list; the board and history are untouched (FR-REC-02, ADR 0036). */
  z.object({
    type: z.literal("checkpoint.delete"),
    checkpointId: Id,
  }).strict(),
  /** GM replaces the board with one of their saved encounter templates (FR-GM-13, ADR 0024). */
  z.object({
    type: z.literal("encounter.apply"),
    templateId: Id,
    /** Keep the room's walls, fog, terrain and lighting; only valid on the template's own map and grid (ADR 0050). */
    keepMapSetup: z.boolean().optional(),
    /** Tokens to move onto the applied board, staged until the GM places them (ADR 0068). */
    carryTokenIds: CarryTokenIds.optional(),
  }).strict(),
  /** GM reverses one recent action, picked from the activity log by its `commandId` (FR-REC-02, ADR 0013). */
  z.object({
    type: z.literal("history.undo"),
    commandId: Id,
  }).strict(),
]);
/** No recursive scene preparation envelopes. */
export const Command = z.union([BoardCommand, z.object({
  type: z.literal("scene.prepare"), sceneId: Id, command: BoardCommand,
}).strict()]);
export type Command = z.infer<typeof Command>;
/** Command as a client writes it (defaults not yet applied). */
export type CommandInput = z.input<typeof Command>;
export type CommandType = Command["type"];
