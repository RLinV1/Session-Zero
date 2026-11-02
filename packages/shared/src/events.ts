import { z } from "zod";
import { MAX_NUKE_DAMAGE, NukeAnimationDef } from "./animation";
import { TokenAttacks } from "./attackPresets";
import { ConditionId, TokenStats } from "./conditions";
import { DiceRoll, GroupRoll, Verdict } from "./dice";
import { AreaEffect, AreaEffectDamage } from "./areaEffects";
import { GridSpec, Point } from "./geometry";
import { AreaTemplate, ChatMessage, Checkpoint, DiceLookOnTable, FogRegion, Id, Initiative, InitiativeScore, MapImage, MAX_WALLS, MAX_FOG_REGIONS, Participant, Portal, TableState, Token, TokenGroup, Wall } from "./state";

/**
 * Events are FACTS the server has committed. They are append-only and never edited.
 * Naming: PastTense.
 *
 * Rule: every event that changes existing data carries the value it replaced
 * (`previous`, `from`, the full deleted entity, ...). That makes the log
 * human-readable (FR-REC-01) and lets undo be a compensating event (FR-REC-02/03)
 * without re-reading older history.
 */
export const DomainEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RoomCreated"),
    name: z.string(),
    /** The game preset (KAN-63, ADR 0027). Absent on rooms created before presets: Dungeons & Dragons. */
    preset: z.string().optional(),
  }),
  z.object({
    type: z.literal("ParticipantJoined"),
    participant: Participant,
  }),
  z.object({
    type: z.literal("ParticipantRenamed"),
    participantId: Id,
    displayName: z.string(),
    previous: z.string(),
  }),
  /** A participant's dice look on the table changed; `previous` is what it replaced (invariant 6, ADR 0018). */
  z.object({
    type: z.literal("ParticipantDiceLookSet"),
    participantId: Id,
    look: DiceLookOnTable.nullable(),
    previous: DiceLookOnTable.nullable(),
  }),
  /** Carries the whole participant as it was before leaving (invariant 6, ADR 0006). */
  z.object({
    type: z.literal("ParticipantLeft"),
    participant: Participant,
  }),
  /** The GM removed this participant. Whole pre-revoke participant (invariant 6, ADR 0006). */
  z.object({
    type: z.literal("ParticipantRevoked"),
    participant: Participant,
  }),
  z.object({
    type: z.literal("MapSet"),
    /** Null only in an inverse restoring the state before first-map placement (ADR 0042). */
    map: MapImage.nullable(),
    previous: MapImage.nullable(),
    /**
     * Always present on new map actions (ADR 0042); optional for historical events. One object,
     * not two optional fields, so the contract cannot express a grid change without the
     * grid it replaced (invariant 6).
     */
    gridChange: z.object({ grid: GridSpec, previous: GridSpec }).optional(),
    /** Explicit adjusted positions, including an empty array. Absent on legacy map events. */
    tokenChanges: z.array(z.object({ tokenId: Id, from: Point, to: Point })).optional(),
    wallChange: z.object({ walls: z.array(Wall).max(MAX_WALLS), previous: z.array(Wall).max(MAX_WALLS) }).optional(),
    fogChange: z.object({ fog: z.array(FogRegion).max(MAX_FOG_REGIONS), previous: z.array(FogRegion).max(MAX_FOG_REGIONS) }).optional(),
  }),
  z.object({
    type: z.literal("GridSet"),
    grid: GridSpec,
    previous: GridSpec,
  }),
  z.object({ type: z.literal("LineOfSightSet"), from: z.boolean(), to: z.boolean() }),
  z.object({ type: z.literal("SightRangeSet"), from: z.number().nullable(), to: z.number().nullable() }),
  z.object({
    type: z.literal("TokenCreated"),
    token: Token,
  }),
  z.object({
    type: z.literal("TokenMoved"),
    tokenId: Id,
    from: Point,
    to: Point,
  }),
  z.object({
    type: z.literal("TokenAppearanceSet"),
    tokenId: Id,
    name: z.string().min(1).max(60),
    size: z.number().positive().max(10),
    rotation: z.number().finite(),
    previous: z.object({ name: z.string(), size: z.number(), rotation: z.number() }),
  }),
  z.object({
    type: z.literal("TokenDeleted"),
    token: Token,
  }),
  z.object({
    type: z.literal("TokenOwnersSet"),
    tokenId: Id,
    ownerIds: z.array(Id),
    previous: z.array(Id),
  }),
  z.object({
    type: z.literal("TokenHiddenSet"),
    tokenId: Id,
    hidden: z.boolean(),
    previous: z.boolean(),
  }),
  z.object({
    type: z.literal("TokenStatsSet"),
    tokenId: Id,
    stats: TokenStats,
    previous: TokenStats,
  }),
  /** A token's art changed. Carries the art it replaced, so undo can restore it (invariant 6). */
  z.object({
    type: z.literal("TokenImageSet"),
    tokenId: Id,
    imageUrl: z.string().nullable(),
    assetId: Id.nullish(),
    previous: z.object({ imageUrl: z.string().nullable(), assetId: Id.nullish() }),
  }),
  z.object({
    type: z.literal("TokenConditionsSet"),
    tokenId: Id,
    conditions: z.array(ConditionId),
    previous: z.array(ConditionId),
  }),
  /** A token's named attacks were replaced (ADR 0034). Private to the GM and the token's owners. */
  z.object({
    type: z.literal("TokenAttacksSet"),
    tokenId: Id,
    attacks: TokenAttacks,
    previous: TokenAttacks,
  }),
  z.object({
    type: z.literal("InitiativeStarted"),
    initiative: Initiative,
    previous: Initiative.nullable(),
    /**
     * The scores the GM entered, saved on their tokens, each with the value it replaced.
     * Absent on events from before scores were saved.
     */
    scores: z
      .array(z.object({ tokenId: Id, score: InitiativeScore, previous: InitiativeScore.nullable() }))
      .optional(),
  }),
  /**
   * Undo of an `InitiativeStarted` (KAN-82, ADR 0026): the turn order and each token's saved
   * score go back to what the start replaced. `previous` is the order the start had made.
   */
  z.object({
    type: z.literal("InitiativeStartUndone"),
    initiative: Initiative.nullable(),
    previous: Initiative,
    scores: z.array(z.object({ tokenId: Id, score: InitiativeScore.nullable(), previous: InitiativeScore.nullable() })),
  }),
  /** GM-only token groups (KAN-82, ADR 0026). Players receive only the seq. */
  z.object({
    type: z.literal("GroupCreated"),
    group: TokenGroup,
  }),
  z.object({
    type: z.literal("GroupRenamed"),
    groupId: Id,
    name: z.string(),
    previous: z.string(),
  }),
  /** Carries the group and the tokens that were in it, so undo can restore both. */
  z.object({
    type: z.literal("GroupDeleted"),
    group: TokenGroup,
    members: z.array(Id),
  }),
  /** Tokens moved into `groupId`, or out of any group when null, each with the group it left. */
  z.object({
    type: z.literal("TokensGrouped"),
    groupId: Id.nullable(),
    changes: z.array(z.object({ tokenId: Id, previous: Id.nullable() })),
  }),
  z.object({
    type: z.literal("InitiativeAdvanced"),
    initiative: Initiative,
    previous: Initiative,
  }),
  z.object({
    type: z.literal("InitiativeEnded"),
    previous: Initiative,
  }),
  z.object({
    type: z.literal("DiceRolled"),
    roll: DiceRoll,
  }),
  /** The GM rolled one expression for several tokens (ADR 0046). */
  z.object({
    type: z.literal("GroupRolled"),
    roll: GroupRoll,
  }),
  /** The GM opened an area effect; each target's save is in it (ADR 0046). */
  z.object({
    type: z.literal("AreaEffectStarted"),
    effect: AreaEffect,
  }),
  /** The damage call went to `participantId`; `previous` is who held it, null for the first call (ADR 0046). */
  z.object({
    type: z.literal("AreaEffectCalled"),
    effectId: Id,
    participantId: Id,
    previous: Id.nullable(),
  }),
  /** The participant holding the call rolled the damage, ending the call (ADR 0046). */
  z.object({
    type: z.literal("AreaEffectDamageRolled"),
    effectId: Id,
    damage: AreaEffectDamage,
  }),
  /**
   * The GM resolved the effect, closing it. Follows the `TokenStatsSet` and `TokenConditionsSet`
   * events that changed the targets, which carry the values they replaced. Carries the whole
   * effect it closed (invariant 6) and each target's amount (ADR 0046).
   */
  z.object({
    type: z.literal("AreaEffectResolved"),
    effect: AreaEffect,
    amounts: z.array(z.object({ tokenId: Id, amount: z.number().int() })),
  }),
  /** The GM closed the effect without applying anything. Carries the whole effect (ADR 0046). */
  z.object({
    type: z.literal("AreaEffectClosed"),
    effect: AreaEffect,
  }),
  /** The GM ruled on a to-hit roll; `null` clears it. Carries the verdict it replaced (ADR 0011). */
  z.object({
    type: z.literal("RollRuled"),
    rollId: Id,
    verdict: Verdict.nullable(),
    previous: Verdict.nullable(),
  }),
  /**
   * The GM applied a damage roll. Follows the `TokenStatsSet` that changed the target's HP, which
   * carries the stats it replaced. No token id here, so it can pass to players (ADR 0011).
   */
  z.object({
    type: z.literal("RollDamageApplied"),
    rollId: Id,
    amount: z.number().int().min(0),
  }),
  /**
   * The GM detonated a map-wide nuke (ADR 0038). Follows the `TokenStatsSet` for every token it
   * damaged. Names no token, so it can pass to players: each board draws the blast from here and
   * the numbers from the HP changes it can see.
   */
  z.object({
    type: z.literal("MapNuked"),
    amount: z.number().int().min(1).max(MAX_NUKE_DAMAGE),
    origin: Point,
    animation: NukeAnimationDef.optional(),
  }),
  /** The GM turned the table's reduced animations on or off (ADR 0038). */
  z.object({
    type: z.literal("ReducedEffectsSet"),
    enabled: z.boolean(),
    previous: z.boolean(),
  }),
  /** Undo of a nuke: the damage was taken back by the `TokenStatsSet`s before it. Plays nothing. */
  z.object({
    type: z.literal("MapNukeUndone"),
    amount: z.number().int().min(1).max(MAX_NUKE_DAMAGE),
    origin: Point,
    animation: NukeAnimationDef.optional(),
  }),
  /**
   * Undo of a damage apply (ADR 0013): the roll no longer reads Applied. Only undo emits it,
   * just before the `TokenStatsSet` that puts the HP back. The inverse of `RollDamageApplied`,
   * which carries no `previous` because it always replaces `false` (ADR 0011).
   */
  z.object({
    type: z.literal("RollDamageUnapplied"),
    rollId: Id,
    amount: z.number().int().min(0),
  }),
  /**
   * Someone sent a chat message (KAN-75, ADR 0015). The sender is the acting participant, set by
   * `decide`. Replaces nothing, so there is no `previous`; the time is the commit's `at`.
   */
  z.object({
    type: z.literal("ChatMessageSent"),
    message: ChatMessage.omit({ at: true }),
  }),
  z.object({
    type: z.literal("TemplatePlaced"),
    template: AreaTemplate,
  }),
  /** Carries the whole template as it was, so undo can restore it (invariant 6). */
  z.object({
    type: z.literal("TemplateRemoved"),
    template: AreaTemplate,
  }),
  /** The GM fogged a region of the map (FR-GM-17, ADR 0016). */
  z.object({
    type: z.literal("FogAdded"),
    region: FogRegion,
  }),
  /** Carries the whole region as it was, so undo can restore it (invariant 6). */
  z.object({
    type: z.literal("FogRemoved"),
    region: FogRegion,
  }),
  /** The GM applied walls (FR-GM-11, ADR 0029). The inverse of `WallsRemoved`. */
  z.object({
    type: z.literal("WallsAdded"),
    walls: z.array(Wall).min(1),
  }),
  /** Walls were removed. Carries each one whole, so undo can restore them (invariant 6). */
  z.object({
    type: z.literal("WallsRemoved"),
    walls: z.array(Wall).min(1),
  }),
  z.object({ type: z.literal("WallUpdated"), wall: Wall, previous: Wall }),
  /** A wall's portal changed (FR-GM-18, ADR 0030). `from` is the replaced value; null is a plain wall. */
  z.object({
    type: z.literal("PortalChanged"),
    wallId: Id,
    from: Portal.nullable(),
    to: Portal.nullable(),
  }),
  /** The GM saved a named restore point (FR-REC-02, ADR 0019). */
  z.object({
    type: z.literal("CheckpointCreated"),
    checkpoint: Checkpoint,
  }),
  /** The GM removed a checkpoint from the list (ADR 0036). Carries the whole entity (invariant 6). Not undoable. */
  z.object({
    type: z.literal("CheckpointDeleted"),
    checkpoint: Checkpoint,
  }),
  /**
   * The GM put the board back as it was at a checkpoint (ADR 0019). Carries the board it
   * replaced (invariant 6), so the restore itself can be undone. GM-only: players resync.
   */
  z.object({
    type: z.literal("CheckpointRestored"),
    checkpointId: Id,
    name: z.string(),
    restored: TableState,
    previous: TableState,
  }),
  /**
   * The GM replaced the board with a saved encounter template (FR-GM-13, ADR 0024). `applied` is
   * the new board, with fresh token ids; `previous` is the board it replaced (invariant 6), so
   * the apply can be undone. GM-only: players resync.
   */
  z.object({
    type: z.literal("EncounterApplied"),
    templateId: Id,
    name: z.string(),
    applied: TableState,
    previous: TableState,
  }),
  /**
   * The GM undid one earlier action (FR-REC-02, ADR 0013). Comes last in its batch, after the
   * compensating events that restored the old values. `commandId` names the undone action; its
   * details are in the undo history of the state just before this event.
   */
  z.object({
    type: z.literal("ActionUndone"),
    commandId: Id,
  }),
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
export type DomainEventType = DomainEvent["type"];

/** An event after the server has ordered and persisted it. */
export const CommittedEvent = z.object({
  /** Per-room, gap-free, strictly increasing, starting at 1 (FR-SYNC-04). */
  seq: z.number().int().positive(),
  /** ISO-8601 server timestamp. */
  at: z.string(),
  /** Participant who caused it; null for system events. */
  actorId: Id.nullable(),
  /**
   * The server's id for the command (or system batch) that produced this event, shared by every
   * event of that batch, so undo reverses a command as one unit (ADR 0013). Absent on events
   * committed before undo existed, and on events sent to players.
   */
  commandId: Id.optional(),
  event: DomainEvent,
});
export type CommittedEvent = z.infer<typeof CommittedEvent>;
