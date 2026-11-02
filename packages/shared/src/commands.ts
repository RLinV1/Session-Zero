import { z } from "zod";
import { AttackStyle, MAX_NUKE_DAMAGE, NukeAnimationDef } from "./animation";
import { TokenAttacks } from "./attackPresets";
import { ConditionId, EMPTY_STATS, TokenStats } from "./conditions";
import { AttackKind, DiceVisibility, MAX_ATTACK_LABEL, MAX_GROUP_ROLL_TOKENS, Verdict } from "./dice";
import { DamageMode, MAX_AREA_AMOUNT } from "./areaEffects";
import { GridSpec, Point } from "./geometry";
import { MAP_TOKEN_POLICIES } from "./mapTokenAdjustment";
import { AreaColor, AreaShape, Id, MapImage, MAX_CHAT_LENGTH, MAX_FOG_POINTS, MAX_FOG_REGIONS, MAX_WALLS, Portal, PortalState, Wall } from "./state";

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

export const Command = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scene.setMap"),
    tokenPolicy: z.enum(MAP_TOKEN_POLICIES).optional(),
    map: MapImage,
    /** A library map's saved grid, copied into the room in the same event (ADR 0004). */
    grid: GridSpec.optional(),
    /** Resolve the owned map's saved geometry on the server and apply it in the same MapSet. */
    includeLibraryBoard: z.boolean().optional(),
  }),
  z.object({ type: z.literal("scene.importUVTT"), importId: Id, revision: z.number().int().positive(), tokenPolicy: z.enum(MAP_TOKEN_POLICIES).optional() }).strict(),
  z.object({
    type: z.literal("scene.setGrid"),
    grid: GridSpec,
  }),
  z.object({ type: z.literal("scene.setLineOfSight"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("scene.setSightRange"), range: z.number().positive().finite().nullable() }).strict(),
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
    type: z.literal("token.move"),
    tokenId: Id,
    to: Point,
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
  /** Roll dice (FR-TAC-09). `gm` visibility is GM-only and never reaches players (FR-GM-22). */
  z.object({
    type: z.literal("dice.roll"),
    expression: z.string().min(1).max(32),
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
    expression: z.string().min(1).max(32),
    label: z.string().trim().max(MAX_ATTACK_LABEL).optional(),
    visibility: DiceVisibility.default("public"),
  }).strict(),
  /** GM only: open an area effect, rolling `expression` for each token it caught (ADR 0046). */
  z.object({
    type: z.literal("areaEffect.start"),
    tokenIds: z.array(Id).min(1).max(MAX_GROUP_ROLL_TOKENS),
    expression: z.string().min(1).max(32),
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
    expression: z.string().min(1).max(32),
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
  /** GM only: lower a damage roll's target's HP by the roll's total, once (ADR 0011). */
  z.object({
    type: z.literal("roll.applyDamage"),
    rollId: Id,
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
  /** Remove a placed template. Its owner or the GM. */
  z.object({
    type: z.literal("template.remove"),
    templateId: Id,
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
    type: z.literal("fog.add"),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    region: z.discriminatedUnion("shape", [
      z.object({ shape: z.literal("rect"), from: Point, to: Point }).strict(),
      z.object({ shape: z.literal("polygon"), points: z.array(Point).min(3).max(MAX_FOG_POINTS) }).strict(),
    ]),
  }).strict(),
  /**
   * GM swaps fog in one action (FR-GM-17, ADR 0032): removes the listed regions and adds the new
   * ones together, so a full room can still take a replacement and a refusal changes nothing.
   */
  z.object({
    type: z.literal("fog.replace"),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    removeIds: z.array(Id).max(MAX_FOG_REGIONS),
    add: z.array(z.discriminatedUnion("shape", [
      z.object({ shape: z.literal("rect"), from: Point, to: Point }).strict(),
      z.object({ shape: z.literal("polygon"), points: z.array(Point).min(3).max(MAX_FOG_POINTS) }).strict(),
    ])).max(MAX_FOG_REGIONS),
  }).strict(),
  /** GM removes one fog region, revealing what it covered (FR-GM-17). */
  z.object({
    type: z.literal("fog.remove"),
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
  /** GM draws walls by hand (wall-editing, ADR 0029). Board coordinates (invariant 8). */
  z.object({
    type: z.literal("wall.add"),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    /** `portal` lets the map editor's Save keep a door drawn in its draft (ADR 0030). */
    walls: z.array(z.object({ a: Point, b: Point, portal: Portal.optional(), uvttPortal: Wall.shape.uvttPortal, source: Wall.shape.source }).strict()).min(1).max(MAX_WALLS_PER_ADD),
  }).strict(),
  z.object({ type: z.literal("wall.update"), expectedMapUrl: z.string().min(1).max(2048).optional(), wall: Wall }).strict(),
  /** GM removes chosen walls (ADR 0029). */
  z.object({
    type: z.literal("wall.remove"),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    wallIds: z.array(Id).min(1).max(MAX_WALLS_PER_REMOVE),
  }).strict(),
  /** GM removes every wall (ADR 0029). */
  z.object({
    type: z.literal("wall.clear"),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
  }).strict(),
  /** GM makes a wall a door or window, edits it, or (`null`) turns it back into a plain wall (FR-GM-09, ADR 0030). */
  z.object({
    type: z.literal("portal.set"),
    expectedMapUrl: z.string().min(1).max(2048).optional(),
    wallId: Id,
    portal: Portal.nullable(),
  }).strict(),
  /** Opens, closes or locks a portal (FR-GM-18, ADR 0030). Players may only open or close one they can see. */
  z.object({
    type: z.literal("portal.setState"),
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
  }).strict(),
  /** GM reverses one recent action, picked from the activity log by its `commandId` (FR-REC-02, ADR 0013). */
  z.object({
    type: z.literal("history.undo"),
    commandId: Id,
  }).strict(),
]);
export type Command = z.infer<typeof Command>;
/** Command as a client writes it (defaults not yet applied). */
export type CommandInput = z.input<typeof Command>;
export type CommandType = Command["type"];
