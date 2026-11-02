import { isGroupRoll, type AttackSide, type DiceRoll, type GroupRoll, type LoggedRoll } from "./dice";
import type { AreaEffect } from "./areaEffects";
import type { CommittedEvent } from "./events";
import { inFogRegion, type Point } from "./geometry";
import { wallMidpoint } from "./portals";
import { inSight, viewerSight } from "./sight";
import type { AreaTemplate, Initiative, Participant, RoomState, Token, Wall } from "./state";

/** Whether a board point lies under any fog region (FR-GM-17, ADR 0016). */
export function isInFog(fog: RoomState["fog"], point: Point): boolean {
  for (const region of Object.values(fog)) if (inFogRegion(region.points, point)) return true;
  return false;
}

/**
 * What hides things from one viewer (ADR 0016, ADR 0044): fog regions, and the viewer's line of
 * sight (null = no limit). Build once per viewer with `concealmentFor`.
 */
export type Concealment = { fog: RoomState["fog"]; sight: Point[][] | null };

export function concealmentFor(state: Pick<RoomState, "fog" | "scene" | "walls" | "tokens">, viewer: Participant): Concealment {
  return { fog: state.fog, sight: viewerSight(state, viewer) };
}

/** Whether a reference point lies outside the viewer's line of sight (always false with no limit). */
const outOfSight = (c: Concealment, point: Point): boolean => c.sight !== null && !inSight(c.sight, point);

/**
 * Whether `viewer` may not see `token` (FR-GM-16, FR-GM-17, FR-GM-23): it is hidden, or its
 * centre is under fog or outside their line of sight and the viewer doesn't own it. The GM sees everything. The one rule every
 * filter and the ephemeral relay use, so they can't disagree (ADR 0016).
 */
export function concealedFrom(
  c: Concealment,
  token: Pick<Token, "hidden" | "position" | "ownerIds">,
  viewer: Participant,
): boolean {
  if (viewer.role === "gm") return false;
  if (token.hidden) return true;
  return !token.ownerIds.includes(viewer.id) && (isInFog(c.fog, token.position) || outOfSight(c, token.position));
}

/**
 * Whether fog conceals a token's side on attack rolls for good (ADR 0016): an unowned token under
 * fog. Owned tokens are the party's; players saw their names already, so their sides follow the
 * token's current visibility instead.
 */
export function fogConcealsSide(state: Pick<RoomState, "fog">, token: Pick<Token, "ownerIds" | "position">): boolean {
  return token.ownerIds.length === 0 && isInFog(state.fog, token.position);
}

/** Whether `viewer` may not see a template: GM-only, or placed by someone else under fog (ADR 0007, ADR 0016). */
export function templateConcealedFrom(c: Concealment, template: AreaTemplate, viewer: Participant): boolean {
  if (viewer.role === "gm") return false;
  if (template.gmOnly) return true;
  return template.ownerId !== viewer.id && (isInFog(c.fog, template.origin) || outOfSight(c, template.origin));
}

/**
 * Whether `viewer` may not see `wall` (ADR 0030). Plain walls are GM-only (ADR 0029); a portal
 * is concealed when its midpoint is under fog or outside sight, as a token is by its centre.
 */
export function portalConcealedFrom(c: Concealment, wall: Pick<Wall, "a" | "b" | "portal">, viewer: Participant): boolean {
  if (viewer.role === "gm") return false;
  if (!wall.portal) return true;
  const mid = wallMidpoint(wall);
  return isInFog(c.fog, mid) || outOfSight(c, mid);
}

/**
 * Player-safe state filtering (FR-GM-23).
 *
 * EVERY payload that carries room data to a client must go through one of these
 * functions: snapshots, live events, REST responses, reconnect payloads.
 * When adding a new kind of hidden data (fog, GM-only rolls, ...), extend BOTH functions
 * and add a test in test/visibility.test.ts.
 */
export function filterStateForViewer(state: RoomState, viewer: Participant): RoomState {
  if (viewer.role === "gm") return state;
  // One concealment for the whole snapshot, so tokens, templates and walls agree (ADR 0044).
  const c = concealmentFor(state, viewer);
  // Hidden tokens, and tokens under fog or out of sight the viewer doesn't own, are withheld (FR-GM-17).
  const tokens = Object.fromEntries(
    Object.entries(state.tokens).filter(([, t]) => !concealedFrom(c, t, viewer))
      .map(([id, token]) => [id, tokenForViewer(token, viewer)]),
  );
  // GM-only rolls never reach a player, not even as a redacted placeholder (FR-GM-22).
  const rolls = state.rolls.filter((r) => r.visibility === "public").flatMap((r): LoggedRoll[] => {
    if (!isGroupRoll(r)) return [hideAttackSides(r, state, tokens)];
    const visible = groupRollForViewer(r, state, c, viewer);
    return visible ? [visible] : [];
  });
  // A hidden token must not be inferable from a gap in the turn order (FR-GM-23).
  const initiative = state.initiative ? initiativeForPlayer(state.initiative, tokens) : null;
  // GM-only area templates are withheld entirely, like hidden tokens (ADR 0007), and so are
  // other people's templates under fog (ADR 0016).
  const templates = Object.fromEntries(
    Object.entries(state.templates).filter(([, t]) => !templateConcealedFrom(c, t, viewer)),
  );
  // Fog regions stay: they are the mask the player's board draws, and name nothing (ADR 0016).
  // Chat is public, so `chat` stays as it is in the spread below (ADR 0015). So are its mentions:
  // ids and public display names of participants every viewer already has in `participants`. If
  // `participants` is ever filtered for players, filter `chat[].mentions` with it (ADR 0035).
  // Undo is GM-only, and its entries name hidden tokens and their old values (ADR 0013).
  // Plain walls are GM-only: inside fog they would draw rooms the players haven't seen (ADR 0029).
  // Portals outside fog stay, so players can see and use them (ADR 0030).
  const walls = Object.fromEntries(Object.entries(state.walls).filter(([, w]) => !portalConcealedFrom(c, w, viewer)).map(([id, w]) => [id, { id: w.id, a: w.a, b: w.b, portal: w.portal }]));
  // Groups are the GM's organisation and would say which group a hidden token is in (KAN-82, ADR 0026).
  // An area effect's saves and concealed targets are the GM's (ADR 0046).
  const areaEffect = state.areaEffect && !effectWithheldFrom(state.areaEffect, state, c, viewer) ? areaEffectForViewer(state.areaEffect, state, c, viewer) : null;
  // The polygons are what the player's board masks with (ADR 0044); omitted entirely when sight is off.
  return { ...state, tokens, rolls, initiative, templates, walls, undo: [], checkpoints: [], groups: {}, tokenGroups: {}, areaEffect, ...(c.sight ? { sight: c.sight } : {}) };
}

export type FilteredEvent =
  /** Deliver as-is. */
  | { kind: "event"; committed: CommittedEvent }
  /** Viewer may not see this; deliver only the seq so their ordering stays gap-free. */
  | { kind: "redacted"; seq: number }
  /** The viewer's visible world changed shape; send a fresh filtered snapshot instead. */
  | { kind: "resync" };

/** Decides what one viewer receives for a committed event: as-is, a redacted seq, or a resync. */
export function filterEventForViewer(
  committed: CommittedEvent,
  before: RoomState,
  viewer: Participant,
): FilteredEvent {
  if (viewer.role === "gm") return { kind: "event", committed };

  const e = committed.event;
  const redacted: FilteredEvent = { kind: "redacted", seq: committed.seq };
  // No `commandId` for players: an id shared with a redacted event would say a hidden change
  // was part of the same action (ADR 0013).
  const { commandId: _commandId, ...withoutCommandId } = committed;
  const pass: FilteredEvent = { kind: "event", committed: withoutCommandId };
  // Built from `before` only when an arm needs it (ADR 0044). Every event that could change the
  // viewer's sight resyncs below, so the sight before the event is the one their copy reflects.
  let built: Concealment | undefined;
  const conc = () => (built ??= concealmentFor(before, viewer));
  /** Whether the viewer could not see this token before the event; unknown tokens count as hidden. */
  const hiddenBefore = (tokenId: string) => {
    const token = before.tokens[tokenId];
    return !token || concealedFrom(conc(), token, viewer);
  };
  /** Same before and after: as-is or redacted. Changed: the token appears or vanishes, so resync. */
  const byVisibility = (wasConcealed: boolean, isConcealed: boolean): FilteredEvent =>
    wasConcealed !== isConcealed ? { kind: "resync" } : isConcealed ? redacted : pass;

  // With line of sight on, anything that can move, add or remove a sight polygon resyncs the
  // player, since `sight` reaches them only in snapshots (ADR 0044).
  if (before.scene.lineOfSight) {
    switch (e.type) {
      // Walls, doors and the map shape every polygon.
      case "WallsAdded":
      case "WallsRemoved":
      case "WallUpdated":
      case "PortalChanged":
      case "MapSet":
        return { kind: "resync" };
      // A range is in grid units, so a new square size moves every polygon's edge.
      case "GridSet":
        if (before.scene.sightRange !== undefined) return { kind: "resync" };
        break;
      // A token the viewer owns before or after the event is a sight origin.
      case "TokenCreated":
      case "TokenDeleted":
        if (e.token.ownerIds.includes(viewer.id)) return { kind: "resync" };
        break;
      case "TokenMoved":
      case "TokenHiddenSet":
        if (before.tokens[e.tokenId]?.ownerIds.includes(viewer.id)) return { kind: "resync" };
        break;
      case "TokenOwnersSet":
        if (before.tokens[e.tokenId]?.ownerIds.includes(viewer.id) || e.ownerIds.includes(viewer.id)) return { kind: "resync" };
        break;
    }
  }

  switch (e.type) {
    // Plain walls are GM-only geometry (ADR 0029): players learn only that a seq happened. A
    // portal they can see appears or vanishes, which a snapshot does without the plain walls (ADR 0030).
    case "WallUpdated":
      return !portalConcealedFrom(conc(), e.previous, viewer) || !portalConcealedFrom(conc(), e.wall, viewer) ? { kind: "resync" } : redacted;
    case "WallsAdded":
    case "WallsRemoved":
      return e.walls.some((w) => !portalConcealedFrom(conc(), w, viewer)) ? { kind: "resync" } : redacted;
    case "PortalChanged": {
      // Seen before and after: a state change the player's copy can apply. Otherwise the wall's
      // geometry must arrive or leave with it, so resync (ADR 0030).
      const wall = before.walls[e.wallId];
      if (!wall) return redacted;
      return byVisibility(
        portalConcealedFrom(conc(), { ...wall, portal: e.from ?? undefined }, viewer),
        portalConcealedFrom(conc(), { ...wall, portal: e.to ?? undefined }, viewer),
      );
    }
    case "TokenCreated":
    case "TokenDeleted":
      return concealedFrom(conc(), e.token, viewer) ? redacted : {
        kind: "event", committed: { ...withoutCommandId, event: { ...e, token: tokenForViewer(e.token, viewer) } },
      };
    case "TokenMoved": {
      // Moving into or out of fog changes what the viewer may see (ADR 0016).
      const token = before.tokens[e.tokenId];
      if (!token) return redacted;
      return byVisibility(concealedFrom(conc(), token, viewer), concealedFrom(conc(), { ...token, position: e.to }, viewer));
    }
    case "TokenOwnersSet": {
      // Gaining or losing a token under fog reveals or withdraws it for that player (ADR 0016).
      const token = before.tokens[e.tokenId];
      if (!token) return redacted;
      // Ownership also determines whether the copied named attacks are available.
      if (token.attacks?.length && token.ownerIds.includes(viewer.id) !== e.ownerIds.includes(viewer.id)) return { kind: "resync" };
      return byVisibility(concealedFrom(conc(), token, viewer), concealedFrom(conc(), { ...token, ownerIds: e.ownerIds }, viewer));
    }
    case "TokenAppearanceSet":
    case "TokenStatsSet":
    case "TokenImageSet":
    case "TokenConditionsSet":
      return hiddenBefore(e.tokenId) ? redacted : pass;
    case "TokenAttacksSet": {
      // Named attacks are the GM's (who never reaches here) and the token's owners' alone, like in
      // snapshots (ADR 0034).
      const token = before.tokens[e.tokenId];
      if (!token || hiddenBefore(e.tokenId)) return redacted;
      return token.ownerIds.includes(viewer.id) ? pass : redacted;
    }
    case "DiceRolled":
      // FR-GM-22: a player learns that *something* happened at this seq, never what.
      if (e.roll.visibility === "gm") return redacted;
      // A public attack naming a hidden token reaches players only through a filtered snapshot,
      // which blanks that side (ADR 0010).
      return [e.roll.attack?.actor, e.roll.attack?.target].some((side) => side && (side.hidden || hiddenBefore(side.tokenId)))
        ? { kind: "resync" }
        : pass;
    case "MapNuked":
    case "MapNukeUndone":
    case "ReducedEffectsSet":
      // Names no token and has no GM-only content: the blast is for the whole table (ADR 0038).
      return pass;
    case "GroupRolled": {
      // FR-GM-22: a GM-only group roll is as secret as a GM-only roll. A public one loses the
      // entries for tokens the viewer can't see; with none left, nothing happened for them (ADR 0046).
      if (e.roll.visibility === "gm") return redacted;
      const roll = groupRollForViewer(e.roll, before, conc(), viewer);
      return roll ? { kind: "event", committed: { ...withoutCommandId, event: { ...e, roll } } } : redacted;
    }
    // One projection for live events and snapshots, so the two can't disagree (ADR 0046). An
    // effect with no target the viewer can see, and no call for them, is withheld entirely: its
    // empty target list would say a concealed token is being targeted.
    case "AreaEffectStarted":
      if (effectWithheldFrom(e.effect, before, conc(), viewer)) return redacted;
      return { kind: "event", committed: { ...withoutCommandId, event: { ...e, effect: areaEffectForViewer(e.effect, before, conc(), viewer) } } };
    case "AreaEffectClosed":
    case "AreaEffectResolved": {
      if (effectWithheldFrom(e.effect, before, conc(), viewer)) return redacted;
      const effect = areaEffectForViewer(e.effect, before, conc(), viewer);
      if (e.type === "AreaEffectClosed") return { kind: "event", committed: { ...withoutCommandId, event: { ...e, effect } } };
      // Only the amounts for targets the viewer can see, for their damage numbers: those targets'
      // HP changes already reached them. A concealed target's amount never does.
      const seen = new Set(effect.targets.map((t) => t.tokenId));
      const amounts = e.amounts.filter((a) => seen.has(a.tokenId));
      return { kind: "event", committed: { ...withoutCommandId, event: { ...e, effect, amounts } } };
    }
    case "AreaEffectDamageRolled": {
      const effect = before.areaEffect;
      if (!effect || effect.id !== e.effectId || effectWithheldFrom(effect, before, conc(), viewer)) return redacted;
      const damage = areaEffectForViewer({ ...effect, damage: e.damage }, before, conc(), viewer).damage ?? e.damage;
      return { kind: "event", committed: { ...withoutCommandId, event: { ...e, damage } } };
    }
    case "AreaEffectCalled": {
      // Names only participants, who are public. A call can show a withheld effect to its caller,
      // or hide it again from the one it moved away from: then a snapshot does both.
      const effect = before.areaEffect;
      if (!effect || effect.id !== e.effectId) return redacted;
      return byVisibility(effectWithheldFrom(effect, before, conc(), viewer), effectWithheldFrom({ ...effect, call: { participantId: e.participantId } }, before, conc(), viewer));
    }
    case "RollRuled":
    case "RollDamageApplied":
    case "RollDamageUnapplied": {
      // Neither names a token; they are as secret as the roll they concern (ADR 0011).
      const roll = before.rolls.find((r): r is DiceRoll => r.id === e.rollId && !isGroupRoll(r));
      if (!roll || roll.visibility === "gm") return redacted;
      // "Applied" on a roll whose target the player sees as Unknown would say that token still
      // exists and has HP, and line it up with the HP change just before it. Withhold it.
      const target = roll.attack?.target;
      if (e.type !== "RollRuled" && target && (target.hidden || hiddenBefore(target.tokenId))) return redacted;
      return pass;
    }
    case "InitiativeStarted":
    case "InitiativeAdvanced":
    case "InitiativeStartUndone":
      // The order may name hidden tokens, so the player gets a filtered snapshot instead
      // of the raw event — same reasoning as a reveal.
      return { kind: "resync" };
    case "InitiativeEnded": {
      // `previous` is the GM's whole order: strip concealed tokens from it, as a snapshot would.
      const visible = filterStateForViewer(before, viewer).tokens;
      return { kind: "event", committed: { ...withoutCommandId, event: { ...e, previous: initiativeForPlayer(e.previous, visible) } } };
    }
    case "TemplatePlaced":
    case "TemplateRemoved":
      // gmOnly never changes after placement, and fog changes only through FogAdded/FogRemoved,
      // which resync; so the fog before this event is the fog the player's state reflects.
      return templateConcealedFrom(conc(), e.template, viewer) ? redacted : pass;
    case "FogAdded":
    case "FogRemoved":
      // Fog can hide or reveal any number of tokens and templates; a snapshot does both (ADR 0016).
      return { kind: "resync" };
    case "TokenHiddenSet":
      // A reveal must deliver the whole token; a hide must remove it. A snapshot does both.
      return { kind: "resync" };
    case "GroupCreated":
    case "GroupRenamed":
    case "GroupDeleted":
    case "TokensGrouped":
      // GM-only: a player learns only that a seq passed (KAN-82, ADR 0026).
      return redacted;
    case "CheckpointCreated":
    case "CheckpointDeleted":
      // Checkpoints are the GM's; a player learns only that a seq passed (ADR 0019).
      return redacted;
    case "CheckpointRestored":
      // Both tables hold hidden tokens and GM-only areas; a filtered snapshot carries the rest.
      return { kind: "resync" };
    case "MapSet":
      // Nested changes contain hidden IDs and prior positions. Only the filtered result
      // reaches players, including inverse first-map removal and empty adjustments (ADR 0042).
      return e.tokenChanges !== undefined || e.wallChange !== undefined || e.fogChange !== undefined ? { kind: "resync" } : pass;
    case "EncounterApplied":
      // Both boards hold hidden tokens, fog and owners; a filtered snapshot carries the rest (ADR 0024).
      return { kind: "resync" };
    case "ActionUndone":
      // Players have no undo or activity log; the compensating events before it already
      // delivered whatever they may see (ADR 0013).
      return redacted;
    case "ChatMessageSent":
      // Chat is public to the whole room; it names no hidden token or roll (ADR 0015). Mentions
      // carry only the ids and public display names of participants every viewer already has (ADR 0035).
      return pass;
    case "LineOfSightSet":
    case "SightRangeSet":
      // Sight changes for every player (ADR 0044).
      return { kind: "resync" };
    case "RoomCreated":
    case "ParticipantJoined":
    case "ParticipantRenamed":
    case "ParticipantDiceLookSet":
    case "ParticipantLeft":
    case "ParticipantRevoked":
    case "GridSet":
      // The participant list is public; leaving or removal reveals nothing hidden (ADR 0006). A
      // dice look is pictures the whole table sees on that person's rolls, and names no account (ADR 0018).
      return pass;
  }
}

/** Named attacks are private to the GM and the token's owners, including on deletion/undo. */
function tokenForViewer(token: Token, viewer: Participant): Token {
  if (viewer.role === "gm" || token.ownerIds.includes(viewer.id)) return token;
  const { attacks: _attacks, ...visible } = token;
  return visible;
}

/**
 * A player's copy of an attack roll: a side naming a token hidden from them becomes `null` (ADR 0010).
 * `side.hidden` is set when rolled against a hidden token and again whenever it is hidden later
 * (see `reduce`), so it stays null after a reveal, rename or delete. A token only ever visible,
 * even once deleted, keeps its name, which the player already saw.
 */
function hideAttackSides(roll: DiceRoll, state: RoomState, visible: RoomState["tokens"]): DiceRoll {
  if (!roll.attack) return roll;
  // A side whose token still exists but is not in the viewer's tokens is hidden or under fog.
  const conceal = (side: AttackSide | null) =>
    !side || side.hidden || (state.tokens[side.tokenId] && !visible[side.tokenId]) ? null : side;
  const actor = conceal(roll.attack.actor);
  const target = conceal(roll.attack.target);
  if (actor === roll.attack.actor && target === roll.attack.target) return roll;
  // With the target blanked, "Applied" would still say the hidden token exists with HP (ADR 0011).
  const { damageApplied: _applied, ...withoutApplied } = roll;
  const base = target === null && roll.attack.target !== null ? withoutApplied : roll;
  // The attacker's saved animation could identify a concealed side, so it goes with the name.
  const { animation: _animation, ...attack } = roll.attack;
  return { ...base, attack: { ...attack, actor, target } };
}

/**
 * Whether a token named by a roll or an effect is concealed from the viewer: marked hidden when
 * rolled or since, or still on the board but not among the tokens they can see. A token only ever
 * visible keeps its name after deletion, which the player already saw (ADR 0010, ADR 0046).
 */
function namedTokenConcealed(
  named: { tokenId: string; hidden: boolean },
  state: Pick<RoomState, "tokens">,
  c: Concealment,
  viewer: Participant,
): boolean {
  if (viewer.role === "gm") return false;
  if (named.hidden) return true;
  const token = state.tokens[named.tokenId];
  return token !== undefined && concealedFrom(c, token, viewer);
}

/**
 * A player's copy of a public group roll: only the entries for tokens they can see, or null when
 * there are none (ADR 0046). Dropped rather than blanked, so the count gives nothing away.
 */
export function groupRollForViewer(roll: GroupRoll, state: Pick<RoomState, "tokens">, c: Concealment, viewer: Participant): GroupRoll | null {
  if (viewer.role === "gm") return roll;
  const entries = roll.entries.filter((entry) => !namedTokenConcealed(entry, state, c, viewer));
  if (entries.length === 0) return null;
  return entries.length === roll.entries.length ? roll : { ...roll, entries };
}

/**
 * Whether a player gets no copy of an area effect at all (ADR 0046): none of its targets is one
 * they can see, and they don't hold its call. The one who holds it learns that it exists.
 */
export function effectWithheldFrom(effect: AreaEffect, state: Pick<RoomState, "tokens">, c: Concealment, viewer: Participant): boolean {
  if (viewer.role === "gm" || effect.call?.participantId === viewer.id) return false;
  return effect.targets.every((t) => namedTokenConcealed(t, state, c, viewer));
}

/**
 * A player's copy of an area effect (ADR 0046): no target's save, no concealed target, and no
 * per-target damage for one. The call, label and a single damage total are public.
 */
export function areaEffectForViewer(effect: AreaEffect, state: Pick<RoomState, "tokens">, c: Concealment, viewer: Participant): AreaEffect {
  if (viewer.role === "gm") return effect;
  const targets = effect.targets.filter((t) => !namedTokenConcealed(t, state, c, viewer)).map((t) => ({ ...t, roll: null }));
  const visible = new Set(targets.map((t) => t.tokenId));
  const damage = effect.damage?.mode === "perTarget"
    ? { ...effect.damage, results: effect.damage.results.filter((r) => visible.has(r.tokenId)) }
    : effect.damage;
  return { ...effect, targets, damage };
}

/**
 * A player's turn order: hidden tokens left out, and `activeIndex` pointing into what is left
 * (FR-GM-21, FR-GM-23). The GM's index would point at the wrong token, or past the end, and so
 * give away that hidden combatants are in the order. On a hidden token's turn the index is one
 * past the end, so no token shows as active; it stays within the schema (a non-negative integer).
 */
function initiativeForPlayer(initiative: Initiative, visible: RoomState["tokens"]): Initiative {
  const order = initiative.order.filter((id) => visible[id]);
  const activeId = initiative.order[initiative.activeIndex];
  const index = activeId === undefined ? -1 : order.indexOf(activeId);
  return { ...initiative, order, activeIndex: index === -1 ? order.length : index };
}
