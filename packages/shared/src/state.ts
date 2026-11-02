import { z } from "zod";
import { DEFAULT_PRESET_ID } from "./gamePresets";
import { TokenAttacks } from "./attackPresets";
import { DICE_SHEET, DieName } from "./diceLooks";
import type { UndoEntry } from "./undo";
import { ConditionId, TokenStats } from "./conditions";
import type { LoggedRoll } from "./dice";
import type { AreaEffect } from "./areaEffects";
import { DEFAULT_GRID, GridSpec, Point } from "./geometry";

export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

export const Role = z.enum(["gm", "player"]);
export type Role = z.infer<typeof Role>;

/**
 * One die's picture in a dice look on the table (shared-dice-looks, ADR 0018). The address is
 * always one the server stored, never a client's: only `/uploads/…` parses.
 */
export const DiceFaceOnTable = z.object({
  url: z.string().max(2048).regex(/^\/uploads\/[A-Za-z0-9._-]+$/),
  width: z.number().int().positive().max(DICE_SHEET.width),
  height: z.number().int().positive().max(DICE_SHEET.height),
});

/**
 * A participant's dice look as the whole room draws it (shared-dice-looks, ADR 0018): which look
 * it is and which version, so the owner's browser can tell it is current, and its pictures. No
 * name, owner or account: the table needs only what it draws.
 */
export const DiceLookOnTable = z.object({
  lookId: Id,
  /** The look's last change, in ms, as the server stored it. */
  version: z.number().int().nonnegative(),
  faces: z.partialRecord(DieName, DiceFaceOnTable),
});
export type DiceLookOnTable = z.infer<typeof DiceLookOnTable>;

export const Participant = z.object({
  id: Id,
  role: Role,
  displayName: z.string().min(1).max(40),
  /**
   * Set once the participant leaves the table (ADR 0006). They stay in state because tokens,
   * rolls and history still name them. Optional so older events and snapshots parse unchanged.
   */
  left: z.boolean().optional(),
  /** Set when the GM removed them (FR-GM-20, ADR 0006). Same rules as `left`; optional for old data. */
  revoked: z.boolean().optional(),
  /** Their dice look, drawn on their public rolls for everyone (ADR 0018). Nullish so older logs replay. */
  diceLook: DiceLookOnTable.nullish(),
});
export type Participant = z.infer<typeof Participant>;

export const MapImage = z.object({
  /** Server-relative URL of the uploaded image. */
  url: z.string().min(1).max(2048),
  /** Natural image size in pixels = board size in board coordinates. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /**
   * Library asset this map was placed from, if any (ADR 0004). Opaque — it names nothing,
   * and no player-reachable endpoint resolves it. Nullish so older events still parse.
   */
  assetId: Id.nullish(),
});
export type MapImage = z.infer<typeof MapImage>;

export const Scene = z.object({
  map: MapImage.nullable(),
  grid: GridSpec,
  /** Player line of sight; absent = off (ADR 0044). */
  lineOfSight: z.boolean().optional(),
  /** How far a token sees, in grid units; absent = unlimited (ADR 0044). */
  sightRange: z.number().positive().optional(),
});
export type Scene = z.infer<typeof Scene>;

/** An initiative score, as the Start encounter command accepts it (ADR 0022). */
export const InitiativeScore = z.number().int().min(-99).max(999);

export const Token = z.object({
  id: Id,
  name: z.string().min(1).max(60),
  /** Center of the token in board coordinates. */
  position: Point,
  /** Footprint edge length in grid cells (1 = medium, 2 = large, ...). */
  size: z.number().positive().max(10),
  /** Degrees clockwise. */
  rotation: z.number().finite(),
  /** Hex color used when there is no token image. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  imageUrl: z.string().max(2048).nullable(),
  /** Library asset the image came from, if any (ADR 0004). */
  assetId: Id.nullish(),
  /** Player participants allowed to move this token (FR-GM-10, FR-PL-04). The GM can always move it. */
  ownerIds: z.array(Id),
  /** Hidden tokens are never sent to player clients (FR-GM-16, FR-GM-23). */
  hidden: z.boolean(),
  /** Numeric resources shown on the token and in the roster (FR-TAC-07). */
  stats: TokenStats,
  /** Status conditions, rendered by shape and abbreviation, never colour alone (FR-TAC-08). */
  conditions: z.array(ConditionId).max(12),
  /** Copied named attacks, available to the GM and this token's owners. Older tokens omit them. */
  attacks: TokenAttacks.optional(),
  /**
   * The score the GM last gave this token when starting an encounter. It outlives the encounter
   * so the next Start encounter dialog can pre-fill it. Absent or null means none yet.
   */
  initiative: InitiativeScore.nullish(),
});
export type Token = z.infer<typeof Token>;

/** Shapes an area template can take (FR-TAC-06). */
export const AreaShape = z.enum(["circle", "cone", "box", "line"]);
export type AreaShape = z.infer<typeof AreaShape>;

/**
 * The colours an area template can be (ADR 0040). Names, not hex: the client owns the shades, so a
 * theme can change them without touching history. White is left out; its fill vanishes on light maps.
 */
export const AreaColor = z.enum(["red", "orange", "yellow", "green", "blue", "purple", "grey"]);
export type AreaColor = z.infer<typeof AreaColor>;
/** What a template with no colour, such as one placed before colours existed, is drawn as. */
export const DEFAULT_AREA_COLOR: AreaColor = "orange";

/** Most area templates a room holds at once, so one client can't grow state without bound. */
export const MAX_AREA_TEMPLATES = 200;
/** Widest a line template may be, in cells of the room's grid (KAN-35). */
export const MAX_LINE_WIDTH_CELLS = 10;

/**
 * Most active players a room holds; the GM is not counted (room-player-cap). Four times the
 * README's 8-player target. Joins past it are refused, so an invite link can't add seats without end.
 */
export const MAX_PLAYERS_PER_ROOM = 32;

/**
 * A placed area-of-effect template (FR-TAC-06, ADR 0007). Positions are board coordinates
 * (invariant 8); `size` is in grid units so a grid change rescales it the same way for
 * everyone. The outline is derived from these fields, never stored.
 */
export const AreaTemplate = z.object({
  id: Id,
  shape: AreaShape,
  /** Where it was placed: a circle's or a box's centre (ADR 0040), a cone's apex, a line's start. */
  origin: Point,
  /** The point it was aimed at; equal to `origin` for an unaimed placement (points right). */
  toward: Point,
  /** Circle radius, cone length, box side or line length, in grid units (e.g. 20 for 20 ft). */
  size: z.number().positive().max(1000),
  /**
   * A line's width in grid units (KAN-35, ADR 0021); one cell when absent. Ignored by the other
   * shapes. Optional so events from before lines still parse.
   */
  width: z.number().positive().max(1000).optional(),
  /** Its colour (ADR 0040); drawn as `DEFAULT_AREA_COLOR` when absent. Optional so older events still parse. */
  color: AreaColor.optional(),
  /** Who placed it. They and the GM may remove it. */
  ownerId: Id,
  /** GM-only templates are never sent to players (FR-GM-23), like hidden tokens. */
  gmOnly: z.boolean(),
});
export type AreaTemplate = z.infer<typeof AreaTemplate>;

/** How a fog region was drawn (FR-GM-17, ADR 0016). Both are stored as polygons. */
export const FogShape = z.enum(["rect", "polygon"]);
export type FogShape = z.infer<typeof FogShape>;

/** Most fog regions a room holds at once, so one GM can't grow state without bound. */
export const MAX_FOG_REGIONS = 100;
/** Most corners one fog polygon may have. */
export const MAX_FOG_POINTS = 64;

/**
 * A fogged region of the map (FR-GM-17, ADR 0016). `points` are board coordinates (invariant 8);
 * a rectangle is stored as its four corners, so every reader handles one geometry. Tokens and
 * templates under it are withheld from players (`concealedFrom` in visibility.ts).
 */
export const FogRegion = z.object({
  id: Id,
  shape: FogShape,
  points: z.array(Point).min(3).max(MAX_FOG_POINTS),
});
export type FogRegion = z.infer<typeof FogRegion>;

/** Most walls a room holds at once (ADR 0029), so one detection can't grow state without bound. */
export const MAX_WALLS = 1500;

/** What a portal is (FR-GM-18, ADR 0030). Windows block movement like doors; `kind` is for drawing and line of sight. */
export const PortalKind = z.enum(["door", "window"]);
export type PortalKind = z.infer<typeof PortalKind>;
/** Closed and locked portals block movement like walls; open ones don't (ADR 0030). */
export const PortalState = z.enum(["open", "closed", "locked"]);
export type PortalState = z.infer<typeof PortalState>;
export const Portal = z.object({ kind: PortalKind, state: PortalState }).strict();
export type Portal = z.infer<typeof Portal>;

/**
 * A wall: a straight segment the GM applied from detection (FR-GM-11, ADR 0029). Board
 * coordinates (invariant 8). Tokens can't stand across one; players can't move through one.
 * Plain walls are GM-only; players receive the portals they can see (ADR 0030).
 */
export const UvttPortal = z.object({
  position: Point.optional(), rotation: z.number().finite().optional(),
  closed: z.boolean().optional(), freestanding: z.boolean().optional(),
}).strict();
export type UvttPortal = z.infer<typeof UvttPortal>;

export const Wall = z.object({
  id: Id,
  a: Point,
  b: Point,
  /** Set when the wall is a door or window (FR-GM-18, ADR 0030). Absent: a plain wall. */
  portal: Portal.optional(),
  /** Imported generic portal metadata; never part of a player projection (ADR 0041). */
  uvttPortal: UvttPortal.optional(),
  source: z.enum(["line_of_sight", "objects_line_of_sight"]).optional(),
});
export type Wall = z.infer<typeof Wall>;

/**
 * The authoritative state of one room. Produced only by folding committed events
 * through `reduce` — never mutated directly.
 */
/**
 * Encounter turn order (FR-GM-21). Null when no encounter is running.
 *
 * `order` holds token ids so a renamed or re-owned token keeps its slot. Entries whose
 * token has since been deleted are skipped when advancing rather than rewritten, because
 * the log is append-only and rewriting history is not allowed.
 */
export const Initiative = z.object({
  /** Token ids, highest initiative first. The server sorts; clients never reorder locally. */
  order: z.array(Id).max(60),
  /** Index into `order` whose turn it is. */
  activeIndex: z.number().int().min(0),
  /** Increments each time the turn wraps past the end of the order. */
  round: z.number().int().min(1),
});
export type Initiative = z.infer<typeof Initiative>;

/**
 * What is on the board: the part of the state a checkpoint restores (FR-REC-02, ADR 0019).
 * Participants, rolls, chat and history record the session and are never part of it.
 */
export const TableState = z.object({
  scene: Scene,
  tokens: z.record(Id, Token),
  templates: z.record(Id, AreaTemplate),
  fog: z.record(Id, FogRegion),
  initiative: Initiative.nullable(),
  /** Optional: tables in events from before walls existed have none (ADR 0029). */
  walls: z.record(Id, Wall).optional(),
});
export type TableState = z.infer<typeof TableState>;

/** The table part of a room state. */
export function tableOf(state: Pick<RoomState, keyof TableState>): TableState {
  return { scene: state.scene, tokens: state.tokens, templates: state.templates, fog: state.fog, initiative: state.initiative, walls: state.walls };
}

/** Most checkpoints a room keeps; the oldest drops off past this (ADR 0019). */
export const MAX_CHECKPOINTS = 50;
export const MAX_CHECKPOINT_NAME = 60;

/** A named restore point: the board as it was after event `seq` (FR-REC-02, ADR 0019). GM-only. */
export const Checkpoint = z.object({
  id: Id,
  name: z.string().min(1).max(MAX_CHECKPOINT_NAME),
  /** The last committed seq before the checkpoint was saved. */
  seq: z.number().int().min(0),
});
export type Checkpoint = z.infer<typeof Checkpoint>;

/** How many rolls the log keeps. Older ones stay in the event log, just not in state. */
export const ROLL_LOG_LIMIT = 30;

/** How many chat messages the state keeps. Older ones stay in the event log (ADR 0015). */
export const CHAT_LOG_LIMIT = 200;

/** Longest chat message, in characters after trimming (KAN-75). */
export const MAX_CHAT_LENGTH = 500;

/** Most participants one chat message can mention: every active participant (ADR 0035). */
export const MAX_CHAT_MENTIONS = MAX_PLAYERS_PER_ROOM + 1;

/**
 * A participant mentioned in a chat message (ADR 0035). `displayName` is their name at send time,
 * like `senderName`: it is what the text says after the `@`, so the client can find it to
 * highlight even after a rename. The id is what keeps pointing at the right person.
 */
export const ChatMention = z.object({
  participantId: Id,
  displayName: z.string().min(1).max(40),
});
export type ChatMention = z.infer<typeof ChatMention>;

/**
 * One chat message (KAN-75, ADR 0015). `senderName` is the name at send time, so the line reads
 * correctly after a rename. `at` is the committed time, stamped by `reduce` from event metadata
 * (it cannot read a clock); null when the event was reduced without it. `mentions` is set by
 * `decide` from the text, each participant once, and is absent when nobody is mentioned, so
 * older messages and events parse unchanged (ADR 0035).
 */
export const ChatMessage = z.object({
  id: Id,
  senderId: Id,
  senderName: z.string().min(1).max(40),
  text: z.string().min(1).max(MAX_CHAT_LENGTH),
  at: z.string().nullable(),
  mentions: z.array(ChatMention).min(1).max(MAX_CHAT_MENTIONS).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** Most token groups a room holds (KAN-82). */
export const MAX_GROUPS = 30;
/** Longest group name, in characters after trimming (KAN-82). */
export const MAX_GROUP_NAME = 40;

/** A GM-only named set of tokens in one room, e.g. "Gate guards" (KAN-82, ADR 0026). */
export const TokenGroup = z.object({
  id: Id,
  name: z.string().min(1).max(MAX_GROUP_NAME),
});
export type TokenGroup = z.infer<typeof TokenGroup>;

export interface RoomState {
  roomId: Id;
  name: string;
  /** The game preset chosen when the room was created (KAN-63, ADR 0027). Never changes. Public. */
  preset: string;
  scene: Scene;
  tokens: Record<Id, Token>;
  participants: Record<Id, Participant>;
  /** Null until the GM starts an encounter (FR-GM-21). */
  initiative: Initiative | null;
  /** Most recent rolls, newest last (FR-GM-22, FR-TAC-09). Capped at ROLL_LOG_LIMIT. Group rolls take one slot each (ADR 0046). */
  rolls: LoggedRoll[];
  /** Placed area templates everyone at the table can see, bar GM-only ones (FR-TAC-06, ADR 0007). */
  templates: Record<Id, AreaTemplate>;
  /** Most recent chat messages, oldest first, public to the whole room (KAN-75, ADR 0015). Capped at CHAT_LOG_LIMIT. */
  chat: ChatMessage[];
  /** Fog regions, in the order they were added (FR-GM-17, ADR 0016). Sent to players: they are the mask. */
  fog: Record<Id, FogRegion>;
  /** Walls and portals (FR-GM-11, FR-GM-18). Players get only the portals they can see (ADR 0030). */
  walls: Record<Id, Wall>;
  /** Named restore points, oldest first, capped at MAX_CHECKPOINTS (ADR 0019). GM-only. */
  checkpoints: Checkpoint[];
  /**
   * Recent undoable actions, oldest first (FR-REC-02, ADR 0013). Derived by `reduce` from
   * committed events and their `commandId`s; GM-only (players always get an empty list).
   */
  undo: UndoEntry[];
  /** Token groups, in creation order (KAN-82, ADR 0026). GM-only: players always get none. */
  groups: Record<Id, TokenGroup>;
  /**
   * Which group each token is in, by token id (KAN-82). A token is in at most one group. Entries
   * outlive a deleted token, so undoing the deletion puts it back in its group. GM-only.
   */
  tokenGroups: Record<Id, Id>;
  /**
   * The GM turned board animations down for the whole table (ADR 0038): every viewer plays the
   * reduced-motion version, as if each had asked for it. Public. Older rooms read as false.
   */
  reducedEffects: boolean;
  /**
   * The open area effect, if any (ADR 0046). At most one per room. Rooms from before it read as
   * null. Players get a projection: no saves, no concealed targets.
   */
  areaEffect: AreaEffect | null;
  /**
   * The viewer's line of sight as polygons in board coordinates (FR-GM-19, ADR 0044). Derived per
   * viewer by `filterStateForViewer`, never set by `reduce` and never persisted. Present only for
   * a player with line of sight on.
   */
  sight?: Point[][];
}

export function emptyRoomState(roomId: Id): RoomState {
  return {
    roomId,
    name: "",
    preset: DEFAULT_PRESET_ID,
    scene: { map: null, grid: DEFAULT_GRID },
    tokens: {},
    participants: {},
    initiative: null,
    rolls: [],
    templates: {},
    chat: [],
    fog: {},
    walls: {},
    checkpoints: [],
    undo: [],
    groups: {},
    tokenGroups: {},
    reducedEffects: false,
    areaEffect: null,
  };
}
