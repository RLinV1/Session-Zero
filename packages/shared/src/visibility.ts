import { movementRouteKnown, terrainForViewer } from "./terrainVisibility";
import { movementBlocked, movementObstacles } from "./movement";
import type { MovementPreviewFeedback, MovementPreviewRequest } from "./protocol";
import { reduce } from "./reducer";
import { isGroupRoll, type AttackSide, type DiceRoll, type GroupRoll, type LoggedRoll } from "./dice";
import type { AreaEffect } from "./areaEffects";
import type { CommittedEvent } from "./events";
import { inFogRegion, MAX_MOVE_VIA, type GridSpec, type Point } from "./geometry";
import { areaSamples, templateArea, type AreaGeometry } from "./areas";
import { blocksMovement } from "./portals";
import { inSight, viewerSight } from "./sight";
import type { TokenStats } from "./conditions";
import type { AreaTemplate, Initiative, Participant, RoomState, Token, Wall } from "./state";

/** Each fog region with its bounding box grown by the 1 px edge allowance, cached per fog object. */
type FogBox = { points: readonly Point[]; minX: number; minY: number; maxX: number; maxY: number };
const fogBoxes = new WeakMap<RoomState["fog"], FogBox[]>();
function fogIndex(fog: RoomState["fog"]): FogBox[] {
  let boxes = fogBoxes.get(fog);
  if (!boxes) {
    boxes = Object.values(fog).map(({ points }) => ({
      points,
      minX: Math.min(...points.map((q) => q.x)) - 1, maxX: Math.max(...points.map((q) => q.x)) + 1,
      minY: Math.min(...points.map((q) => q.y)) - 1, maxY: Math.max(...points.map((q) => q.y)) + 1,
    }));
    fogBoxes.set(fog, boxes);
  }
  return boxes;
}

/**
 * Whether a board point lies under any fog region (FR-GM-17, ADR 0016). A region's box rules out
 * most points before its edges are walked, which area sampling relies on (ADR 0059); the answer is
 * the same, since a point in a region or within 1 px of it is inside its grown box.
 */
export function isInFog(fog: RoomState["fog"], point: Point): boolean {
  for (const box of fogIndex(fog)) {
    if (point.x < box.minX || point.x > box.maxX || point.y < box.minY || point.y > box.maxY) continue;
    if (inFogRegion(box.points, point)) return true;
  }
  return false;
}

/**
 * What hides things from one viewer (ADR 0016, ADR 0044): fog regions, and the viewer's line of
 * sight (null = no limit). Build once per viewer with `concealmentFor`. `grid` lets an area's
 * outline be tested (ADR 0059); without it, an area is judged by its origin alone.
 */
export type Concealment = { fog: RoomState["fog"]; sight: Point[][] | null; grid?: GridSpec; map?: { width: number; height: number } | null };

export function concealmentFor(state: Pick<RoomState, "fog" | "scene" | "walls" | "tokens" | "hideMapWithoutToken">, viewer: Participant): Concealment {
  return { fog: state.fog, sight: viewerSight(state, viewer), grid: state.scene.grid, map: state.scene.map };
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

/**
 * Whether any part of an area on the map lies outside every fog region and inside sight
 * (ADR 0059), by sampling it. Off the map there is nothing to see, so fogging a map to its edges
 * hides an area that pokes past them.
 */
export function areaVisibleTo(c: Concealment, area: AreaGeometry, grid: GridSpec): boolean {
  const onMap = (p: Point) => !c.map || (p.x >= 0 && p.y >= 0 && p.x <= c.map.width && p.y <= c.map.height);
  return areaSamples(area, grid).some((p) => onMap(p) && !isInFog(c.fog, p) && !outOfSight(c, p));
}

/**
 * Whether `viewer` may not see a template (ADR 0007, ADR 0016, ADR 0059): GM-only, or someone
 * else's with no part of it outside fog and in sight. A partly visible area is sent whole; the
 * board clips it.
 */
export function templateConcealedFrom(c: Concealment, template: Pick<AreaTemplate, "shape" | "origin" | "toward" | "size" | "width" | "ownerId" | "gmOnly">, viewer: Participant): boolean {
  if (viewer.role === "gm") return false;
  if (template.gmOnly) return true;
  if (template.ownerId === viewer.id) return false;
  if (!c.grid) return isInFog(c.fog, template.origin) || outOfSight(c, template.origin);
  return !areaVisibleTo(c, templateArea(template, c.grid), c.grid);
}

/**
 * Whether `viewer` may not see the portal `wall` (ADR 0030, ADR 0056). A portal is sent whole as
 * soon as any part of it lies outside fog and, with line of sight on, inside sight; it is concealed
 * only when all of it is hidden. Plain walls are never portals: they reach players as pieces.
 */
export function portalConcealedFrom(c: Concealment, wall: Pick<Wall, "a" | "b" | "portal">, viewer: Participant): boolean {
  if (viewer.role === "gm") return false;
  if (!wall.portal) return true;
  return visibleParts(c, wall).length === 0;
}

/** The stretches of segment a-b the viewer can see: cut at fog and sight edges, hidden parts dropped. */
function visibleParts(c: Concealment, wall: Pick<Wall, "a" | "b">): [Point, Point][] {
  const { points, gaps } = visibleStretches([wall.a, wall.b], c);
  const out: [Point, Point][] = [];
  for (let i = 0; i + 1 < points.length; i++) if (!gaps.includes(i)) out.push([points[i]!, points[i + 1]!]);
  return out;
}

/**
 * The stretches of a plain blocking wall the viewer can see (ADR 0056): the wall cut at fog and,
 * with line of sight on, sight edges, keeping only the visible parts. Empty for portals and for
 * walls that don't block movement (an open imported portal).
 */
function plainWallStretches(c: Concealment, wall: Pick<Wall, "a" | "b" | "portal" | "uvttPortal">): [Point, Point][] {
  if (wall.portal || !blocksMovement(wall)) return [];
  return visibleParts(c, wall);
}

/**
 * The plain-wall pieces a player receives (ADR 0056): only the visible stretches, each with an
 * opaque per-snapshot id (`seen:n`) that names no source wall and links no two pieces. Numbered in
 * geometric order, not storage order, so re-splitting a wall out of view changes nothing they hold.
 * The GM gets no pieces; they hold the walls themselves.
 */
export function wallPiecesForViewer(state: Pick<RoomState, "walls">, viewer: Participant, c: Concealment): Wall[] {
  if (viewer.role === "gm") return [];
  const stretches = Object.values(state.walls).flatMap((wall) => plainWallStretches(c, wall));
  stretches.sort(([a1, b1], [a2, b2]) => a1.x - a2.x || a1.y - a2.y || b1.x - b2.x || b1.y - b2.y);
  return stretches.map(([a, b], i) => ({ id: `seen:${i}`, a, b }));
}

/** A player's `walls`: the portals they can see under their real ids, then the plain-wall pieces (ADR 0030, ADR 0056). */
function wallsForViewer(state: Pick<RoomState, "walls">, viewer: Participant, c: Concealment): RoomState["walls"] {
  const portals = Object.entries(state.walls).filter(([, w]) => w.portal && !portalConcealedFrom(c, w, viewer)).map(([id, w]): [string, Wall] => [id, { id: w.id, a: w.a, b: w.b, portal: w.portal }]);
  return Object.fromEntries([...portals, ...wallPiecesForViewer(state, viewer, c).map((w): [string, Wall] => [w.id, w])]);
}

/**
 * Whether any part of `wall` reaches the viewer (ADR 0056): a plain blocking wall or a portal with
 * a visible stretch. The GM sees every wall.
 */
export function wallSeen(c: Concealment, wall: Pick<Wall, "a" | "b" | "portal" | "uvttPortal">, viewer: Participant): boolean {
  if (viewer.role === "gm") return true;
  return wall.portal ? !portalConcealedFrom(c, wall, viewer) : plainWallStretches(c, wall).length > 0;
}

/** Private, geometry-free advisory feedback. Concealed routes never become an obstacle oracle. */
export function movementFeedbackForViewer(state: RoomState, viewer: Participant, request: MovementPreviewRequest, c = concealmentFor(state, viewer)): MovementPreviewFeedback["status"] | null {
  const token = state.tokens[request.tokenId];
  if (!token || (viewer.role !== "gm" && !token.ownerIds.includes(viewer.id)) || concealedFrom(c, token, viewer)) return null;
  if (token.position.x !== request.from.x || token.position.y !== request.from.y || (state.boardEpoch ?? 0) !== request.boardEpoch || (request.reposition && viewer.role !== "gm")) return "unknown";
  const map = state.scene.map;
  // A path is judged as a whole: one status, never which leg or why (ADR 0055).
  const points = [request.from, ...(request.via ?? []), request.to];
  if (!map || points.some((p) => p.x < 0 || p.y < 0 || p.x > map.width || p.y > map.height)) return "unknown";
  if (request.via?.length && request.reposition) return "unknown";
  const legs = points.slice(1).map((to, i) => ({ from: points[i]!, to }));
  if (viewer.role !== "gm" && !legs.every((leg) => movementRouteKnown(state, leg.from, leg.to, token.size, c))) return "unknown";
  const obstacles = movementObstacles(state);
  return legs.some((leg) => movementBlocked(state, { ...token, position: leg.from }, leg.to, request.reposition, obstacles)) ? "blocked" : "clear";
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
      .map(([id, token]) => [id, tokenForViewer(token, viewer, state)]),
  );
  // GM-only rolls never reach a player, not even as a redacted placeholder (FR-GM-22).
  const rolls = state.rolls.filter((r) => r.visibility === "public").flatMap((r): LoggedRoll[] => {
    if (!isGroupRoll(r)) return [hideAttackSides(withoutDismissed(r), state, tokens)];
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
  // Portals outside fog stay, so players can see and use them (ADR 0030). Plain walls arrive only
  // as the pieces the player can already see, clipped at fog and sight edges, with opaque ids:
  // whole walls inside fog would outline rooms the players haven't seen (ADR 0029, ADR 0056).
  const walls = wallsForViewer(state, viewer, c);
  // Groups are the GM's organisation and would say which group a hidden token is in (KAN-82, ADR 0026).
  // An area effect's saves and concealed targets are the GM's (ADR 0046).
  const areaEffect = state.areaEffect && !effectWithheldFrom(state.areaEffect, state, c, viewer) ? areaEffectForViewer(state.areaEffect, state, c, viewer) : null;
  // The polygons are what the player's board masks with (ADR 0044); omitted entirely when sight is off.
  const { terrain: _terrain, terrainRevision: _terrainRevision, terrainView: _terrainView, sight: _sight, ...publicState } = state;
  return { ...publicState, terrainView: terrainForViewer(state, c), tokens, rolls, initiative, templates, walls, undo: [], checkpoints: [], groups: {}, tokenGroups: {}, areaEffect, ...((state.sceneNames || state.savedScenes) && { sceneNames: {}, savedScenes: {} }), ...(c.sight ? { sight: c.sight } : {}) };
}

export type FilteredEvent =
  /** Deliver as-is. */
  | { kind: "event"; committed: CommittedEvent; thenResync?: true }
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

  /** Resync when the event changes the walls the viewer holds, otherwise a redacted step (ADR 0056). */
  const wallsChanged = (): FilteredEvent =>
    JSON.stringify(wallsForViewer(before, viewer, conc())) === JSON.stringify(wallsForViewer(reduce(before, e), viewer, conc())) ? redacted : { kind: "resync" };

  /** Set when the event is delivered and the viewer's sight must then be resynced. */
  let thenResync = false;
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
        if (e.token.ownerIds.includes(viewer.id)) return { kind: "resync" };
        break;
      case "TokenDeleted":
        // A defeat is delivered first so the board can play the death animation, then resynced
        // for the lost sight origin (ADR 0049).
        if (e.token.ownerIds.includes(viewer.id)) {
          if (e.reason !== "defeated") return { kind: "resync" };
          thenResync = true;
        }
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

  // "Hide map from players without a token" without line of sight: sight is all or nothing, so
  // only owning a visible token can change it, never a move (ADR 0057).
  if (before.hideMapWithoutToken && !before.scene.lineOfSight) {
    switch (e.type) {
      case "TokenCreated":
        if (e.token.ownerIds.includes(viewer.id)) return { kind: "resync" };
        break;
      case "TokenDeleted":
        if (e.token.ownerIds.includes(viewer.id)) {
          if (e.reason !== "defeated") return { kind: "resync" };
          thenResync = true;
        }
        break;
      case "TokenOwnersSet":
        if (before.tokens[e.tokenId]?.ownerIds.includes(viewer.id) || e.ownerIds.includes(viewer.id)) return { kind: "resync" };
        break;
    }
  }

  switch (e.type) {
    case "TerrainPainted":
    case "TerrainEffectCreated":
    case "TerrainEffectRemoved":
    case "TerrainEffectRenamed": {
      const after = reduce(before, e);
      return JSON.stringify(terrainForViewer(before, conc())) === JSON.stringify(terrainForViewer(after, conc())) ? redacted : { kind: "resync" };
    }
    case "GridSet": return e.terrainChange || before.terrain ? { kind: "resync" } : pass;
    // A wall change that alters what the player holds resyncs them with freshly clipped pieces; one
    // they can't see, or that leaves their walls exactly as they were (a wall re-split out of view),
    // is a redacted step (ADR 0029, ADR 0030, ADR 0056). Line of sight is off here (resynced above),
    // so the concealment before the event holds after it too.
    case "WallUpdated":
      return wallSeen(conc(), e.previous, viewer) || wallSeen(conc(), e.wall, viewer) ? wallsChanged() : redacted;
    case "WallsAdded":
    case "WallsRemoved":
      return e.walls.some((w) => wallSeen(conc(), w, viewer)) ? wallsChanged() : redacted;
    case "PortalChanged": {
      // Seen as a portal before and after: a state change the player's copy can apply. Otherwise
      // the wall's geometry must arrive or leave with it, so resync if any part was or becomes seen.
      const wall = before.walls[e.wallId];
      if (!wall) return redacted;
      const from = { ...wall, portal: e.from ?? undefined }, to = { ...wall, portal: e.to ?? undefined };
      if (from.portal && to.portal && !portalConcealedFrom(conc(), from, viewer) && !portalConcealedFrom(conc(), to, viewer)) return pass;
      return wallSeen(conc(), from, viewer) || wallSeen(conc(), to, viewer) ? wallsChanged() : redacted;
    }
    case "TokenCreated":
    case "TokenDeleted":
      return concealedFrom(conc(), e.token, viewer) ? redacted : {
        kind: "event", committed: { ...withoutCommandId, event: { ...e, token: tokenForViewer(e.token, viewer, before) } },
        ...(thenResync && { thenResync: true }),
      };
    case "TokenMoved": {
      // Moving into or out of fog changes what the viewer may see (ADR 0016).
      const token = before.tokens[e.tokenId];
      if (!token) return redacted;
      const shown = byVisibility(concealedFrom(conc(), token, viewer), concealedFrom(conc(), { ...token, position: e.to }, viewer));
      // A path reaches a player only where they can see it: hidden stretches become gaps their
      // board jumps across, and no point inside fog or out of sight is sent (ADR 0055).
      if (shown.kind !== "event" || !e.via?.length) return shown;
      const seen = visibleStretches([e.from, ...e.via, e.to], conc());
      if (!seen.gaps.length && seen.points.length === e.via.length + 2) return shown;
      const { via: _via, gaps: _gaps, ...plain } = e;
      const via = seen.points.slice(1, -1);
      // Nothing but a jump, or more points than a move may carry: start and end alone.
      if (!via.length || via.length > MAX_MOVE_VIA) return { kind: "event", committed: { ...withoutCommandId, event: plain } };
      return { kind: "event", committed: { ...withoutCommandId, event: { ...plain, via, ...(seen.gaps.length ? { gaps: seen.gaps } : {}) } } };
    }
    case "TokenOwnersSet": {
      // Gaining or losing a token under fog reveals or withdraws it for that player (ADR 0016).
      const token = before.tokens[e.tokenId];
      if (!token) return redacted;
      // Ownership also determines whether the copied named attacks are available, and whether
      // hidden HP and AC are (ADR 0057).
      const ownershipChanged = token.ownerIds.includes(viewer.id) !== e.ownerIds.includes(viewer.id);
      if (ownershipChanged && (token.attacks?.length || before.hideHp || before.hideAc)) return { kind: "resync" };
      return byVisibility(concealedFrom(conc(), token, viewer), concealedFrom(conc(), { ...token, ownerIds: e.ownerIds }, viewer));
    }
    case "TokenStatsSet": {
      if (hiddenBefore(e.tokenId)) return redacted;
      // Hidden HP and AC never leave the server, not even as the value a change replaced (ADR 0057).
      const token = before.tokens[e.tokenId]!;
      const stats = statsForViewer(e.stats, token, viewer, before);
      const previous = statsForViewer(e.previous, token, viewer, before);
      if (stats === e.stats) return pass;
      // Only hidden fields changed: the player's copy is already right.
      if (stats.hp === previous.hp && stats.maxHp === previous.maxHp && stats.ac === previous.ac) return redacted;
      return { kind: "event", committed: { ...withoutCommandId, event: { ...e, stats, previous } } };
    }
    case "TokenAppearanceSet":
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
    case "AutoRemoveDefeatedSet":
    case "DefeatRemovalSet":
    case "DiagonalRuleSet":
    case "DifficultTerrainSet":
    case "JoinsLockSet":
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
    case "RollsDismissed":
    case "RollsRestored":
      // The GM's Rulings bookkeeping; a player learns only that something happened (ADR 0060).
      return redacted;
    case "InitiativeStarted":
    case "InitiativeAdvanced":
    case "InitiativeRewound":
    case "InitiativeStartUndone":
      // The order may name hidden tokens, so the player gets a filtered snapshot instead
      // of the raw event — same reasoning as a reveal.
      return { kind: "resync" };
    case "InitiativeEnded": {
      // `previous` is the GM's whole order: strip concealed tokens from it, as a snapshot would.
      const visible = filterStateForViewer(before, viewer).tokens;
      return { kind: "event", committed: { ...withoutCommandId, event: { ...e, previous: initiativeForPlayer(e.previous, visible) } } };
    }
    case "TemplateChanged": {
      // Moving an area into or out of fog changes what the viewer may see, as a token's move does (ADR 0058).
      const template = before.templates[e.templateId];
      if (!template) return redacted;
      const { width: _width, ...rest } = template;
      return byVisibility(templateConcealedFrom(conc(), template, viewer), templateConcealedFrom(conc(), { ...rest, ...e.to }, viewer));
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
    case "SceneDraftCreated":
    case "ScenePrepared":
    case "SceneRenamed":
    case "SceneDeleted":
      return redacted;
    case "SceneCreated":
    case "SceneSwitched":
      return { kind: "resync" };
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
      return e.terrainChange !== undefined || e.tokenChanges !== undefined || e.wallChange !== undefined || e.fogChange !== undefined ? { kind: "resync" } : pass;
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
    case "IsometricSet":
      return pass; // a public scene flag, no hidden data (ADR 0048)
    case "LineOfSightSet":
    case "SightRangeSet":
      // Sight changes for every player (ADR 0044).
      return { kind: "resync" };
    case "HideMapWithoutTokenSet":
    case "HideHpSet":
    case "HideAcSet":
      // What every player may see changes; a filtered snapshot carries it (ADR 0057).
      return { kind: "resync" };
    case "RoomCreated":
    case "ParticipantJoined":
    case "ParticipantRenamed":
    case "ParticipantDiceLookSet":
    case "ParticipantLeft":
    case "ParticipantRevoked":
      // The participant list is public; leaving or removal reveals nothing hidden (ADR 0006). A
      // dice look is pictures the whole table sees on that person's rolls, and names no account (ADR 0018).
      return pass;
  }
}

/** Where segment a-b crosses the polygon's edges, as fractions of the way from a to b. */
function crossings(a: Point, b: Point, polygon: readonly Point[], out: number[]) {
  const dx = b.x - a.x, dy = b.y - a.y;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p = polygon[j]!, q = polygon[i]!;
    const ex = q.x - p.x, ey = q.y - p.y, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den, u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
  }
}

/**
 * The parts of a path a viewer can see (ADR 0055): each leg cut at fog edges and, with line of sight
 * on, sight edges. `points` starts and ends with the path's own ends; `gaps` lists the indices i
 * where the stretch from points[i] to points[i + 1] is hidden. No returned point but the two ends
 * lies where the viewer can't see.
 */
export function visibleStretches(path: readonly Point[], c: Concealment): { points: Point[]; gaps: number[] } {
  const visible = (p: Point) => !isInFog(c.fog, p) && !outOfSight(c, p);
  const same = (p: Point, q: Point) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
  const edges = [...Object.values(c.fog).map((f) => f.points), ...(c.sight ?? [])];
  const points: Point[] = [path[0]!], gaps: number[] = [];
  let hidden = false;
  for (let leg = 1; leg < path.length; leg++) {
    const a = path[leg - 1]!, b = path[leg]!;
    const ts = [0, 1];
    for (const polygon of edges) crossings(a, b, polygon, ts);
    ts.sort((x, y) => x - y);
    const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i]!, t1 = ts[i + 1]!;
      if (t1 - t0 < 1e-9) continue;
      if (!visible(at((t0 + t1) / 2))) { hidden = true; continue; }
      const start = at(t0), end = at(t1);
      if (!same(points.at(-1)!, start)) {
        if (hidden) gaps.push(points.length - 1);
        points.push(start);
      }
      hidden = false;
      if (!same(points.at(-1)!, end)) points.push(end);
    }
  }
  const last = path.at(-1)!;
  if (!same(points.at(-1)!, last)) {
    if (hidden) gaps.push(points.length - 1);
    points.push(last);
  }
  points[points.length - 1] = last;
  return { points, gaps };
}

/** The room rules that withhold stats from players (ADR 0057). */
type StatRules = Pick<RoomState, "hideHp" | "hideAc">;

/**
 * A token's stats as `viewer` may have them: with "Hide HP from Players" a player gets no HP or
 * max HP, and with "Hide AC from Players" no AC, for any token they don't own (ADR 0057). The
 * same object when nothing is withheld.
 */
export function statsForViewer(stats: TokenStats, token: Pick<Token, "ownerIds">, viewer: Participant, rules: StatRules): TokenStats {
  if (viewer.role === "gm" || token.ownerIds.includes(viewer.id) || (!rules.hideHp && !rules.hideAc)) return stats;
  return { ...stats, ...(rules.hideHp && { hp: null, maxHp: null }), ...(rules.hideAc && { ac: null }) };
}

/**
 * Named attacks are private to the GM and the token's owners, including on deletion/undo; so are
 * HP and AC when the room's rules say so (ADR 0057).
 */
function tokenForViewer(token: Token, viewer: Participant, rules: StatRules): Token {
  if (viewer.role === "gm" || token.ownerIds.includes(viewer.id)) return token;
  const { attacks: _attacks, ...visible } = token;
  const stats = statsForViewer(token.stats, token, viewer, rules);
  return stats === token.stats ? visible : { ...visible, stats };
}

/**
 * A player's copy of an attack roll: a side naming a token hidden from them becomes `null` (ADR 0010).
 * `side.hidden` is set when rolled against a hidden token and again whenever it is hidden later
 * (see `reduce`), so it stays null after a reveal, rename or delete. A token only ever visible,
 * even once deleted, keeps its name, which the player already saw.
 */
/** Whether the GM took a roll off the Rulings list is the GM's bookkeeping (ADR 0060). */
function withoutDismissed(roll: DiceRoll): DiceRoll {
  if (!roll.dismissed) return roll;
  const { dismissed: _dismissed, ...rest } = roll;
  return rest;
}

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
