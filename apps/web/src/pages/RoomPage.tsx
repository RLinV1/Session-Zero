import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { House } from "@phosphor-icons/react";
import { areaEffectStage, can, diceRollsOf, filterStateForViewer, findDiceRoll, isActive, presetOf, type ReplayFrame, type DiceVisibility, type GridSpec, type Participant, type Point, type RoomState } from "@vtt/shared";
import { Board, type BoardHandle, type DiceBoard } from "../board/Board";
import { templateArea, tokensTouchingArea } from "../board/tools";
import { dropFor } from "../board/tokenDice";
import type { GroupSelection } from "../panels/GroupSelection";
import { NukeHealthContext, useNukeHealth } from "../board/nukeHealth";
import { PendingDrops, type DiceDrop } from "../board/diceDrops";
import type { TokenDraft } from "../board/placement";
import { Link } from "../Link";
import type { SessionEndReason } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { signInFor } from "../account/safeNext";
import { forgetCredentials, loadCredentials, rememberRoomName } from "../net/identity";
import type { DiceSkin } from "../ui/diceSkin";
import { useActiveDiceLook, useDiceLooks } from "../ui/diceSkinStore";
import { readySkin, tableSkin, usePreloadTableLooks, useShowOthersDice } from "../ui/tableLooks";
import { ensureSeat } from "../net/seats";
import { KeepSeatNotice } from "../ui/KeepSeatNotice";
import { RoomConnection, useRoomSnapshot, type ConnectionStatus } from "../net/roomConnection";
import { ChatPanel } from "../panels/ChatPanel";
import { PanelTabs, RoomPanel, isTabId, type TabBadges, type TabId } from "../panels/RoomPanel";
import { trayRoll, type RollThrow } from "../panels/DicePanel";
import { outcomeKey, pendingRulingCount } from "../panels/attackRoll";
import { ActivityLog } from "../panels/ActivityLog";
import type { AttackPick } from "../panels/AttackPanel";
import { useEncounterReset } from "../panels/attackSession";
import { clearLegacyAttackStorage } from "../panels/tokenAttacks";
import { gridsEqual, parseGridDraft, toGridDraft, type GridDraft } from "./gridDraft";
import { LeaveTable } from "../panels/LeaveTable";
import { ResolveDepartureModal } from "../panels/ResolveDeparture";
import { DepartureNotices } from "../ui/DepartureNotice";
import { TurnNotice } from "../ui/TurnNotice";
import { RollCard } from "../ui/RollCard";
import { SectionCollapseProvider } from "../ui/PanelSection";
import { ParticipantsButton } from "../ui/ParticipantsButton";
import { PreviewBanner } from "../ui/PreviewBanner";
import { previewConnection, replayConnection } from "../net/previewConnection";
import { ReplayBar } from "../ui/ReplayBar";
import { ShareButton } from "../ui/ShareButton";
import { GuideTour } from "../ui/GuideTour";
import { RoomMenu } from "../ui/RoomMenu";
import { motionReduced } from "../ui/motion";
import { BoardEmptyState } from "../ui/BoardEmptyState";
import { isBoolean, usePersistentState } from "../ui/usePersistentState";
import { PanelResizeHandle, clampPanelWidth, isPanelWidth } from "../ui/PanelResizeHandle";
import { EncounterEditBar } from "./encounterEdit/EncounterEditBar";
import { ENCOUNTER_EDITING, FULL_ROOM, shownTab, type RoomFeatures } from "./encounterEdit/roomFeatures";

/** The set without `id`; the same set when it wasn't there, so nothing re-renders. */
function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
}

/** How long the board says what was just rolled (attack-section-compact). */
const ROLL_POPUP_MS = 4000;

/** Below this the panel becomes tabs and sits under the board (FR-PL-03). */
const COMPACT_WIDTH = 720;

/**
 * Tracks the narrow-screen breakpoint.
 *
 * matchMedia rather than a resize listener: it fires once per crossing instead of on every
 * pixel, and it is correct on the very first render — a phone must not paint the desktop
 * layout and then reflow.
 */
function useCompactLayout() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(`(max-width: ${COMPACT_WIDTH}px)`);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(`(max-width: ${COMPACT_WIDTH}px)`).matches,
    () => false,
  );
}


const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  reconnecting: "Reconnecting…",
  unauthorized: "No access",
  ended: "Left the room",
};

/**
 * Route for `/r/:roomId`: loads this browser's credential for the room and runs its connection.
 * With none stored, a signed-in person's seat is resumed on this device (room-membership).
 */
export function RoomPage({ roomId, editing = false }: {
  roomId: string;
  /** A temporary room editing an encounter template (ADR 0033): only map, fog and token tools. */
  editing?: boolean;
}) {
  const account = useAccount();
  const [creds, setCreds] = useState(() => loadCredentials(roomId));
  const [resuming, setResuming] = useState<"idle" | "trying" | "failed">("idle");
  const connection = useMemo(() => (creds ? new RoomConnection(roomId, creds.guestToken) : null), [roomId, creds]);

  // Attacks used to be kept in this browser; they are the token's now, so drop the old copies (ADR 0034).
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* blocked: nothing to clear */ }
    clearLegacyAttackStorage(storage);
  }, []);

  useEffect(() => {
    if (creds || account.status !== "signedIn" || resuming !== "idle") return;
    setResuming("trying");
    ensureSeat(roomId).then(setCreds, () => setResuming("failed"));
  }, [creds, account.status, resuming, roomId]);

  useEffect(() => {
    if (!connection) return;
    connection.start();
    return () => connection.stop();
  }, [connection]);

  if (!creds || !connection) {
    const waiting = account.status === "loading" || (account.status === "signedIn" && resuming !== "failed");
    if (waiting) return <main className="centered" aria-busy="true">Opening…</main>;
    return (
      <main className="centered">
        <div className="card">
          <h1>No access to this room</h1>
          <p className="muted">Ask the GM for an invite link.</p>
          {account.status === "signedOut" && (
            <p className="muted">
              Already in this room on another device? <Link href={signInFor(`/r/${roomId}`)}>Sign in</Link> to open your seat
              here.
            </p>
          )}
        </div>
      </main>
    );
  }
  return <Room roomId={roomId} connection={connection} token={creds.guestToken} features={editing ? ENCOUNTER_EDITING : FULL_ROOM} />;
}

const ENDED_COPY: Record<SessionEndReason, { title: (room: string | null) => string; body: string }> = {
  left: {
    title: (room) => `You left ${room ?? "this room"}`,
    body: "Your seat at this table has ended. If the GM sends you the invite link again, you can join as a new player.",
  },
  revoked: {
    title: (room) => `You were removed from ${room ?? "this room"}`,
    body: "The GM removed you from this table. If they send you an invite link, you can join again as a new player.",
  },
  deleted: {
    title: (room) => `${room ?? "This room"} was deleted`,
    body: "The GM deleted this room and everything in it. It can't be reopened.",
  },
  signed_out: {
    title: () => "You signed out on this device",
    body: "Your seat is kept on your account. Sign in again to come back to it, here or on any other device.",
  },
};

/**
 * After Leave table (KAN-58), a removal, or the room being deleted (KAN-72). Deliberately
 * plain: no account prompt, per FRONTEND-CONTRACT §13.1. `roomName` is null when the page
 * loaded after the seat had already ended.
 */
function SessionEnded({ roomId, roomName, reason }: { roomId: string; roomName: string | null; reason: SessionEndReason | null }) {
  const copy = ENDED_COPY[reason ?? "left"];
  return (
    <main className="centered">
      <div className="card">
        <h1>{copy.title(roomName)}</h1>
        <p className="muted">{copy.body}</p>
        {reason === "signed_out" && <Link href={signInFor(`/r/${roomId}`)}>Sign in again</Link>}
        <Link href="/">Go to the home page</Link>
      </div>
    </main>
  );
}

/** The room once a credential exists: board, side panel, and the connection's terminal screens. */
function Room({ roomId, connection, token, features }: {
  roomId: string; connection: RoomConnection; token: string; features: RoomFeatures;
}) {
  const { status, state, you, seq, endReason, refusal } = useRoomSnapshot(connection);
  const editing = !features.tableChrome;
  /** Leaving a temporary editing room deletes it; this page must not then say "Room deleted". */
  const [leaving, setLeaving] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  // The GM previewing the room as one player (gm-view-as-player): the same filter the server
  // applies, run here on the GM's full state. Read-only: its connection refuses every command.
  const [viewAs, setViewAs] = useState<string | null>(null);
  const viewed = viewAs ? state?.participants[viewAs] : undefined;
  const preview = useMemo(
    () => (state && you?.role === "gm" && viewed && viewed.role === "player" && isActive(viewed) ? { you: viewed, state: filterStateForViewer(state, viewed) } : null),
    [state, you?.role, viewed],
  );
  useEffect(() => {
    if (viewAs && !preview && state) setViewAs(null);
  }, [viewAs, preview, state]);
  // Replaying the room's history (FR-PL-07): the server-filtered past, shown read-only. Never at
  // the same time as a preview; each hides the other's way in.
  const [replaying, setReplaying] = useState(false);
  const [replayFrame, setReplayFrame] = useState<ReplayFrame | null>(null);
  const [replayState, setReplayState] = useState<RoomState | null>(null);
  const showReplay = useCallback((shown: RoomState | null, frame?: ReplayFrame | null) => {
    setReplayState(shown);
    setReplayFrame(frame ?? null);
  }, []);
  const exitReplay = useCallback(() => {
    setReplayFrame(null);
    setReplaying(false);
    setReplayState(null);
  }, []);
  const shownConnection = useMemo(
    () => (replaying ? replayConnection(connection) : preview ? previewConnection(connection, preview.you.displayName) : connection),
    [connection, replaying, preview?.you.id, preview?.you.displayName],
  );
  const nukeHealth = useNukeHealth(connection, !replaying && !preview);

  // The seat is gone for good, on every tab that shared it: forget it, so the invite link
  // offers the join form rather than bouncing back to a room that refuses us (ADR 0006).
  // Also when the server no longer knows the credential (room deleted, seat gone), so the
  // home page's joined list drops it (KAN-64). Not on `not_found`: a room that failed to load
  // may come back, and forgetting the seat would lose it for good.
  useEffect(() => {
    if (status === "ended" || refusal === "unauthorized") forgetCredentials(roomId);
  }, [status, refusal, roomId]);
  // So the home page's joined list names this room (KAN-64).
  const roomName = state?.name;
  useEffect(() => {
    if (roomName) rememberRoomName(roomId, roomName);
  }, [roomId, roomName]);
  const boardRef = useRef<BoardHandle>(null);
  const compact = useCompactLayout();
  const focusToken = useCallback((tokenId: string) => boardRef.current?.focusToken(tokenId), []);
  // Who attacks whom (attack-targeting): chosen in the Play tab's Attack section or on the board.
  const [attackPick, setAttackPick] = useState<AttackPick>({ attackerId: null, targetId: null });
  const pickOnBoard = useCallback((attackerId: string) => boardRef.current?.startAttack(attackerId), []);
  const pickTarget = useCallback((attackerId: string, targetId: string) => setAttackPick({ attackerId, targetId }), []);
  // Ending the encounter clears the target and the last roll, but keeps the attacker and named attacks (attack-panel-encounter-reset).
  const attackReset = useEncounterReset(roomId, state, you?.id ?? null, () => setAttackPick((p) => ({ ...p, targetId: null })));
  const showPing = useCallback((at: Point) => boardRef.current?.showPing(at), []);
  // The GM's group selection for a group roll or an area effect (ADR 0046). Local to this screen.
  const [groupTokenIds, setGroupTokenIds] = useState<string[]>([]);
  const toggleGroupToken = useCallback((tokenId: string) => setGroupTokenIds((ids) => (ids.includes(tokenId) ? ids.filter((id) => id !== tokenId) : [...ids, tokenId])), []);
  const latestState = useRef(state);
  latestState.current = state;
  /** Every token the picked template touches, hidden ones included: the GM sees them all. */
  const pickTemplate = useCallback((templateId: string) => {
    const room = latestState.current;
    const template = room?.templates[templateId];
    if (!room || !template) return;
    const grid = room.scene.grid;
    setGroupTokenIds(tokensTouchingArea(templateArea(template, grid), Object.values(room.tokens), grid).map((t) => t.id));
  }, []);
  const groupSelection = useMemo<GroupSelection>(() => ({
    // Tokens deleted since they were chosen drop out.
    tokenIds: groupTokenIds.filter((id) => state?.tokens[id]),
    remove: (tokenId) => setGroupTokenIds((ids) => ids.filter((id) => id !== tokenId)),
    clear: () => setGroupTokenIds([]),
    fromTemplate: () => boardRef.current?.startTemplatePick(),
  }), [groupTokenIds, state?.tokens]);
  const diceBoard = useMemo<DiceBoard>(
    () => ({
      aimThrow: (client, velocity) => boardRef.current?.aimThrow(client, velocity) ?? null,
    }),
    [],
  );
  // The GM's "Roll privately" for attacks: here, so leaving the Play tab doesn't reset it.
  const [attackVisibility, setAttackVisibility] = useState<DiceVisibility>("public");
  const [gridDraft, setGridDraft] = useState<GridDraft | null>(null);
  const [gridPreview, setGridPreview] = useState<GridSpec | null>(null);
  const [gridApplying, setGridApplying] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const gridApplyGeneration = useRef(0);
  const gridApplyInFlight = useRef(false);
  const committedGrid = state?.scene.grid;
  const sceneKey = state && JSON.stringify([
    state.scene.map?.url, state.scene.map?.assetId, state.scene.map?.width, state.scene.map?.height,
    state.scene.grid.cellSize, state.scene.grid.offsetX, state.scene.grid.offsetY,
    state.scene.grid.unitsPerCell, state.scene.grid.unitLabel,
    state.scene.grid.lineColor, state.scene.grid.lineWidth, state.scene.grid.lineOpacity,
  ]);

  // A new map, committed grid, or role invalidates a draft tied to the previous scene.
  useEffect(() => {
    setGridDraft(null);
    setGridPreview(null);
    setGridError(null);
  }, [sceneKey, you?.role]);

  const changeGridDraft = useCallback((draft: GridDraft) => {
    setGridDraft(draft);
    const parsed = parseGridDraft(draft, state?.scene.map);
    // An incomplete field leaves the last valid preview visible while the GM edits it.
    if (parsed && committedGrid) setGridPreview(gridsEqual(parsed, committedGrid) ? null : parsed);
    setGridError(null);
  }, [committedGrid, state?.scene.map]);

  const cancelGridDraft = useCallback(() => {
    // A sent command may still finish, but its response no longer belongs to this editor.
    gridApplyGeneration.current += 1;
    setGridDraft(null);
    setGridPreview(null);
    setGridError(null);
  }, []);

  const applyGrid = useCallback(async (grid: GridSpec): Promise<boolean> => {
    if (gridApplyInFlight.current) return false;
    gridApplyInFlight.current = true;
    const generation = gridApplyGeneration.current;
    const mapKey = JSON.stringify(connection.snapshot.state?.scene.map);
    const accepted = connection.snapshot.state?.scene.grid;
    const stillCurrent = (ok: boolean) => {
      const snapshot = connection.snapshot;
      return generation === gridApplyGeneration.current && snapshot.you?.role === "gm"
        && mapKey === JSON.stringify(snapshot.state?.scene.map)
        && !!snapshot.state && !!accepted
        && gridsEqual(snapshot.state.scene.grid, ok ? grid : accepted);
    };
    setGridApplying(true);
    setGridError(null);
    try {
      const result = await connection.command({ type: "scene.setGrid", grid });
      if (!stillCurrent(result.ok)) return false;
      if (!result.ok) setGridError(result.message);
      return result.ok;
    } catch (error) {
      if (!stillCurrent(false)) return false;
      setGridError(error instanceof Error ? error.message : "Could not apply grid");
      return false;
    } finally {
      gridApplyInFlight.current = false;
      setGridApplying(false);
    }
  }, [connection]);
  const placeToken = useCallback((draft: TokenDraft) => boardRef.current?.placeToken(draft), []);
  const duplicateToken = useCallback((tokenId: string) => boardRef.current?.duplicateToken(tokenId), []);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState("vtt.ui.sidebar", false, isBoolean);
  // A width the viewer dragged the sidebar to, in px; null keeps the stylesheet's responsive default.
  const [panelWidth, setPanelWidth] = usePersistentState<number | null>("vtt.ui.panelWidth", null, isPanelWidth);
  const [chosenTab, setTab] = usePersistentState<TabId>("vtt.ui.tab", "play", isTabId);
  // A template being edited offers fewer tabs; a remembered tab it lacks shows its first (ADR 0033).
  const tab = shownTab(chosenTab, features);
  const [guideOpen, setGuideOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  /** The token whose editor is open in the Tokens tab: here, so the board's token card can open it too (token-card-actions). */
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  // Forget a token that's gone, or undoing its deletion would bring it back with its editor open.
  const editingGone = !!editingTokenId && !!state && !state.tokens[editingTokenId];
  useEffect(() => {
    if (editingGone) setEditingTokenId(null);
  }, [editingGone]);
  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    guideButtonRef.current?.focus();
  }, []);

  // The attacker follows the turn onto a token the viewer controls, even after they picked
  // another; a pick made after that sticks until the next turn change (attack-ux-polish). Kept
  // here, not in the Attack section, so a turn that passes while Play isn't showing still counts.
  const activeTurnId = state?.initiative?.order[state.initiative.activeIndex] ?? null;
  const activeToken = activeTurnId ? state?.tokens[activeTurnId] : undefined;
  const controlsActive = !!(activeToken && you && can.attackWith(you, activeToken));
  useEffect(() => {
    if (!controlsActive || !activeTurnId) return;
    setAttackPick((p) => (p.attackerId === activeTurnId ? p : { attackerId: activeTurnId, targetId: p.targetId === activeTurnId ? null : p.targetId }));
  }, [activeTurnId, controlsActive]);

  // Play-tab indicator (attack-ux-polish): the GM's pending rulings, or a dot when the GM has
  // ruled on a player's latest roll since they last had Play in view.
  const playVisible = tab === "play" && !(sidebarCollapsed && !compact);
  const pendingCount = state && you?.role === "gm" ? pendingRulingCount(state) : 0;
  const myLatest = state && you ? diceRollsOf(state.rolls).reverse().find((r) => r.attack && r.byParticipantId === you.id) : undefined;
  const outcome = outcomeKey(myLatest);
  /** The outcome last seen with Play in view; undefined until the room has loaded. */
  const [seenOutcome, setSeenOutcome] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (state && (playVisible || seenOutcome === undefined)) setSeenOutcome(outcome);
  }, [state, playVisible, outcome, seenOutcome]);
  // A player holding a damage call is told from any tab (ADR 0046).
  const effect = state?.areaEffect ?? null;
  const damageCalled = you?.role !== "gm" && !!effect && effect.call?.participantId === you?.id && areaEffectStage(effect) === "called";
  const tabBadges: TabBadges = pendingCount > 0
    ? { play: { count: pendingCount, label: `${pendingCount} ${pendingCount === 1 ? "ruling" : "rulings"} pending` } }
    : damageCalled && !playVisible
      ? { play: { label: "damage roll called" } }
    : you?.role !== "gm" && !playVisible && outcome && seenOutcome !== undefined && outcome !== seenOutcome
      ? { play: { label: "new ruling" } }
      : {};

  // Rolls on this viewer's screen (throw-dice-on-board). Each roll is on its own, so any number
  // can be made in a row without one cutting into another:
  // - yours lands on your board where you let the die go, or for Roll, in the middle of it;
  // - someone else's lands where they let theirs go, replayed from their dice drop (ADR 0014);
  //   one rolled with Roll only gets the result card;
  // - a private (GM-only) roll is thrown in the GM's panel tray, off the board (board-dice-rolls).
  // A roll is `airborne` until its dice land; then the card in the board's corner says what it
  // was. Rolls that come in a snapshot (load, reconnect) are already on the table: never thrown.
  // Your own dice on the board stay `onBoard` until they've faded, and you can't roll again until
  // then, so a throw is never covered by the next one.
  const [airborne, setAirborne] = useState<ReadonlySet<string>>(() => new Set());
  const [onBoard, setOnBoard] = useState<ReadonlySet<string>>(() => new Set());
  const [landedId, setLandedId] = useState<string | null>(null);
  const [cardRollId, setCardRollId] = useState<string | null>(null);
  const land = useCallback((rollId: string) => {
    setAirborne((s) => without(s, rollId));
    setLandedId(rollId);
    setCardRollId(rollId);
  }, []);
  const drops = useRef(new PendingDrops());
  useEffect(() => {
    const stop = connection.onEphemeral((from, payload) => {
      if (payload.type === "diceDrop") drops.current.add(from, { expression: payload.expression, from: payload.from, to: payload.to }, performance.now());
    });
    return () => {
      stop();
    };
  }, [connection]);
  const expectDrop = useCallback(
    (drop: DiceDrop) => drops.current.add(connection.snapshot.you?.id ?? "", drop, performance.now()),
    [connection],
  );
  // A private roll lands in a panel tray: the Attack section's for your own attack, else the Dice
  // section's. With that tray out of view there is nothing to watch, so it lands at once.
  const diceVisible = tab === "dice" && !(sidebarCollapsed && !compact);
  const trays = useRef({ diceVisible, playVisible });
  trays.current = { diceVisible, playVisible };
  // Which look each public roll is drawn in (shared-dice-looks, ADR 0018): the roller's look on the
  // table; for your own roll with none on the table (a guest seat), your browser's look, which only
  // you see; for other people's, classic if you turned their looks off.
  const ownLook = useActiveDiceLook();
  const [showOthersDice] = useShowOthersDice();
  usePreloadTableLooks(state);
  const diceFor = useRef((_rollerId: string, _mine: boolean): DiceSkin | null => null);
  diceFor.current = (rollerId, mine) => {
    const onTable = connection.snapshot.state?.participants[rollerId]?.diceLook;
    if (mine) return readySkin(onTable ? tableSkin(onTable) : ownLook);
    return showOthersDice && onTable ? readySkin(tableSkin(onTable)) : null;
  };
  useSyncOwnDiceLook(connection, roomId, status === "open" ? (you ?? null) : null);
  useEffect(() => {
    const stop = connection.onRolled((roll) => {
      const mine = roll.byParticipantId === connection.snapshot.you?.id;
      if (roll.visibility === "gm") {
        const { diceVisible } = trays.current;
        if (diceVisible) setAirborne((s) => new Set(s).add(roll.id));
        else land(roll.id);
        return;
      }
      const board = boardRef.current;
      const aim = drops.current.take(roll, performance.now()) ?? (mine ? board?.centreAim() : null);
      // Every public roll wears its roller's dice look, for everyone (shared-dice-looks).
      const look = { ...trayRoll(roll), skin: diceFor.current(roll.byParticipantId, mine) };
      // Not where it can't be animated (reduced motion, say): then it lands at once.
      const gone = () => setOnBoard((s) => without(s, roll.id));
      const thrown = !!aim && !!board?.throwDice({ rollId: roll.id, from: aim.from, to: aim.to }, look, () => land(roll.id), gone);
      if (!thrown) return land(roll.id);
      setAirborne((s) => new Set(s).add(roll.id));
      if (mine) setOnBoard((s) => new Set(s).add(roll.id));
    });
    return () => {
      stop();
    };
  }, [connection, land]);
  // Group and area-effect rolls drop onto their tokens (ADR 0046), each viewer drawing only what
  // its filtered events carry. Their totals wait for the drop, like any roll's.
  const dropping = useRef(new Set<string>());
  useEffect(() => {
    const stop = connection.onCommitted((committed, _before, after) => {
      const viewer = connection.snapshot.you;
      if (!viewer) return;
      const drop = dropFor(committed.event, after, viewer);
      if (!drop) return;
      const roller = committed.actorId ?? "";
      const done = () => {
        dropping.current.delete(drop.rollId);
        land(drop.rollId);
      };
      dropping.current.add(drop.rollId);
      setAirborne((s) => new Set(s).add(drop.rollId));
      if (!boardRef.current?.dropDice(drop, diceFor.current(roller, roller === viewer.id), done)) done();
    });
    return () => {
      stop();
    };
  }, [connection, land]);
  // A private roll whose tray has gone (another tab, or a newer roll in its place) lands now.
  const latestRollId = state?.rolls.at(-1)?.id;
  useEffect(() => {
    for (const id of airborne) {
      if (dropping.current.has(id)) continue;
      const roll = state?.rolls.find((r) => r.id === id);
      const inTray = diceVisible && id === latestRollId;
      if (!roll || (roll.visibility === "gm" && !inTray)) land(id);
    }
  }, [airborne, state, diceVisible, latestRollId, land]);
  useEffect(() => {
    if (!cardRollId) return;
    const timer = window.setTimeout(() => setCardRollId(null), ROLL_POPUP_MS);
    return () => window.clearTimeout(timer);
  }, [cardRollId]);
  // The card shows only rolls the viewed player could see, so a GM-only roll vanishes when a preview starts.
  const cardRoll = cardRollId ? findDiceRoll((preview?.state ?? state)?.rolls ?? [], cardRollId) : undefined;
  // Your dice are still showing: on the board until they fade, or in a private tray until they land.
  const rolling = onBoard.size > 0 || !!state?.rolls.some((r) => airborne.has(r.id) && r.byParticipantId === you?.id);
  const rollThrow: RollThrow = { airborne, rolling, justLandedId: landedId, onLanded: land, expectDrop };

  if (leaving) return <main className="centered" aria-busy="true">Closing…</main>;

  if (status === "ended") return <SessionEnded roomId={roomId} roomName={state?.name ?? null} reason={endReason} />;

  if (status === "unauthorized") {
    return (
      <main className="centered">
        <div className="card">
          <h1>No access to this room</h1>
          <p className="muted">
            Your invite may have been revoked, or the room may have been deleted. Ask the GM for a new link.
          </p>
        </div>
      </main>
    );
  }

  if (!state || !you) {
    return <main className="centered" aria-busy="true">{STATUS_LABEL[status]}</main>;
  }

  // The rail is a desktop affordance. On a phone the panel is already below the board, so
  // the remembered preference is ignored there and applies again once the window widens.
  const collapsed = sidebarCollapsed && !compact;
  // While a replay loads, the live board stays visible but is already read-only.
  const shownState = replayState ?? preview?.state ?? state;
  const readOnly = !!preview || replaying;
  const shownYou = preview?.you ?? you;
  /**
   * Opens a hidden sidebar, then runs `then`. It animates open, and its sections have no width
   * until it has, so wait out the transition before showing anything in it.
   */
  const openSidebar = (then: () => void) => {
    // No transition runs under reduced motion (data-motion), so there is nothing to wait out.
    const wait = collapsed && !motionReduced() ? 220 : 0;
    setSidebarCollapsed(false);
    window.setTimeout(then, wait);
  };
  /**
   * The empty board's one action: the Battle map section of the Manage tab, opened if it was
   * folded, brought into view, and its first control focused.
   */
  const chooseMap = () => {
    setTab("gm");
    openSidebar(() =>
      requestAnimationFrame(() => {
        const section = document.querySelector<HTMLElement>('[data-tour="gm-map"]');
        const toggle = section?.querySelector<HTMLButtonElement>('.section-toggle[aria-expanded="false"]');
        toggle?.click();
        requestAnimationFrame(() => {
          section?.scrollIntoView({ block: "start" });
          section?.querySelector<HTMLElement>(".panel-section-body button, .panel-section-body input, .panel-section-body label")?.focus();
        });
      }),
    );
  };
  /** The editor lives in the Tokens tab, so editing from the board goes there (token-card-actions). */
  const editToken = (tokenId: string | null) => {
    if (tokenId === null) return setEditingTokenId(null);
    setTab("tokens");
    openSidebar(() => setEditingTokenId(tokenId));
  };

  return (
    <NukeHealthContext.Provider value={nukeHealth.held}><div
      className={["room", compact && "compact", collapsed && "sidebar-collapsed"].filter(Boolean).join(" ")}
      style={panelWidth !== null && !compact ? ({ "--panel-width": `${clampPanelWidth(panelWidth, window.innerWidth)}px` } as CSSProperties) : undefined}
    >
      {/* Keyboard and screen-reader users should not have to tab through the canvas,
          which is a single non-navigable element, to reach the controls. */}
      <a
        className="skip-link"
        href="#room-panel"
        onClick={(e) => {
          e.preventDefault();
          setSidebarCollapsed(false);
          // After the expand renders, so focus does not land on a hidden body.
          requestAnimationFrame(() => document.getElementById("room-panel")?.focus());
        }}
      >
        Skip to room controls
      </a>
      {/* Who is here and what the sidebar shows, above the board and the panel alike. */}
      <header className="room-topbar">
        <div className="topbar-start">
          {editing && <EncounterEditBar roomId={roomId} seq={seq} onLeaving={() => setLeaving(true)} />}
          {/* The GM has rooms, a library and "Create room" to get back to, all on the GM
              dashboard; a player came from an invite and just closes the tab (room-navigation). */}
          {!editing && you.role === "gm" && !readOnly && (
            <Link href="/gm-dashboard" className="tool-button" title="Back to your GM dashboard">
              <House size={16} aria-hidden="true" />
              Home
            </Link>
          )}
          {!editing && (
            <>
              <h1 className="room-title">{state.name}</h1>
              {/* Which game the room is set up for (KAN-63), as text. */}
              <span className="preset-badge" title="Game preset">{presetOf(state).name}</span>
            </>
          )}
        </div>
        <div className="topbar-center">
          {features.tableChrome && (
            <ParticipantsButton state={state} you={you} connection={shownConnection} onReviewDeparture={setReviewing} onViewAs={replaying ? undefined : setViewAs} viewingAs={viewAs} readOnly={readOnly} />
          )}
        </div>
        <div className="topbar-end">
          {!compact && (
            <PanelTabs
              className="tabbar topbar-tabs"
              isGm={you.role === "gm"}
              offered={features.tabs}
              badges={tabBadges}
              tab={tab}
              onTab={(next, reselected) => {
                // A hidden sidebar opens on the tab pressed; pressing the open tab hides it.
                if (collapsed) {
                  setTab(next);
                  setSidebarCollapsed(false);
                } else if (reselected) setSidebarCollapsed(true);
                else setTab(next);
              }}
            />
          )}
          {features.tableChrome && <RoomMenu
            buttonRef={guideButtonRef}
            onActivityLog={you.role === "gm" && !readOnly ? () => setLogOpen(true) : undefined}
            // Everyone may replay what they could see (FR-PL-07); not while previewing as a player.
            onReplay={preview ? undefined : () => (replaying ? exitReplay() : setReplaying(true))}
            replaying={replaying}
            // The sidebar's steps need it open.
            onGuide={() => openSidebar(() => setGuideOpen(true))}
          />}
          {features.tableChrome && you.role === "gm" && !readOnly && (
            <ActivityLog open={logOpen} onClose={() => setLogOpen(false)} roomId={state.roomId} token={token} seq={seq} state={state} connection={connection} />
          )}
          {/* Last, in the top-right corner: visible with the sidebar shown or hidden. */}
          {features.tableChrome && you.role === "gm" && !readOnly && <ShareButton roomId={roomId} token={token} />}
        </div>
      </header>
      {/* Same element, same position in both states: collapsing must never remount the
          canvas or reset the viewer's zoom and pan. */}
      <Board
        ref={boardRef}
        onNukeImpact={nukeHealth.impact}
        connection={connection}
        state={shownState!}
        you={shownYou!}
        readOnly={readOnly}
        suppressLiveEffects={replaying}
        gridPreview={you.role === "gm" && !readOnly ? gridPreview : null}
        onPickTarget={pickTarget}
        onEditToken={editToken}
        groupSelection={you.role === "gm" && !readOnly ? groupSelection.tokenIds : undefined}
        onToggleGroupToken={you.role === "gm" && !readOnly ? toggleGroupToken : undefined}
        onPickTemplate={pickTemplate}
        landedRollId={landedId}
        selectOnly={features.selectOnly}
        replayFrame={replaying ? replayFrame : null}
        notices={features.notices && (
          // Always mounted, so screen readers register the live region before a notice lands in it.
          <div className="board-notices" role="status" aria-live="polite">
            {!readOnly && <DepartureNotices state={state} onReview={you.role === "gm" ? setReviewing : undefined} />}
            <TurnNotice state={shownState!} you={shownYou!} onFocusToken={focusToken} />
            <KeepSeatNotice roomId={roomId} token={token} name={you.displayName} />
          </div>
        )}
        overlay={
          <>
            {!shownState!.scene.map && !replaying && (
              <BoardEmptyState isGm={you.role === "gm" && !readOnly} onChooseMap={chooseMap} />
            )}
            {features.notices && <RollCard roll={cardRoll} rollerName={(roll) => shownState!.participants[roll.byParticipantId]?.displayName ?? "Someone"} />}
          </>
        }
      />
      <aside className="panel" id="room-panel" tabIndex={-1} aria-label="Room controls">
        {!compact && !collapsed && <PanelResizeHandle width={panelWidth} onWidth={setPanelWidth} />}
        {!compact && (
          // A tab on the panel's inner edge, vertically centred. With the panel collapsed to
          // zero width it sits on the right edge of the screen. It stays mounted in both
          // states, so collapsing from it keeps focus on it.
          <button
            type="button"
            className="sidebar-handle"
            data-tour="sidebar-handle"
            aria-expanded={!collapsed}
            aria-controls="room-panel-body"
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            title={collapsed ? "Show sidebar" : "Hide sidebar"}
            onClick={() => setSidebarCollapsed((c) => !c)}
          >
            <Chevron pointsLeft={collapsed} />
          </button>
        )}
        <div className="panel-body" id="room-panel-body" hidden={collapsed}>
          {/*
            On a phone this header competes with the board for a screen that has neither to
            spare, so it collapses to one line: room name, who you are, and connection state.
          */}
          <header className="panel-header">
            <span className={`status status-${status}`} role="status">
              {STATUS_LABEL[status]} · seq {seq}
            </span>
            {/* A div, not a p: Leave table renders its confirmation <dialog> in here. */}
            <div className="whoami">
              You are <strong>{shownYou!.displayName}</strong> ({shownYou!.role === "gm" ? "GM" : "player"})
              {/* Players only: the GM can't leave their own room; Home is their way out. */}
              {shownYou!.role === "player" && !readOnly && (
                <>
                  {" · "}
                  <LeaveTable connection={connection} state={state} you={you} />
                </>
              )}
            </div>
          </header>
          {/*
            One panel for both roles. A player needs the turn order, their own token's
            resources and the shared dice log as much as the GM does; what differs is the
            administration section, and the server enforces that regardless.
          */}
          <SectionCollapseProvider>
            <RoomPanel
              connection={shownConnection}
              state={shownState!}
              you={shownYou!}
              readOnly={readOnly}
              token={token}
              onFocusToken={focusToken}
              attackPick={attackPick}
              onAttackPick={setAttackPick}
              attackReset={attackReset}
              rollThrow={rollThrow}
              onPickOnBoard={pickOnBoard}
              onShowPing={showPing}
              diceBoard={diceBoard}
              attackVisibility={attackVisibility}
              onAttackVisibility={setAttackVisibility}
              gridDraft={gridDraft ?? toGridDraft(state.scene.grid)}
              hasGridDraft={gridDraft !== null}
              onGridDraftChange={changeGridDraft}
              onGridDraftCancel={cancelGridDraft}
              onGridApply={applyGrid}
              gridApplying={gridApplying}
              gridError={gridError}
              onPlaceToken={placeToken}
              onDuplicateToken={duplicateToken}
              editingTokenId={editingTokenId}
              onEditToken={editToken}
              groupSelection={groupSelection}
              compact={compact}
              tab={tab}
              onTab={setTab}
              tabBadges={tabBadges}
              onReviewDeparture={setReviewing}
              features={features}
            />
          </SectionCollapseProvider>
        </div>
      </aside>
      {/* Read-only while previewing: the same refusing connection and the viewed player's state. */}
      {features.chat && <ChatPanel connection={shownConnection} state={shownState!} you={shownYou!} readOnly={readOnly} />}
      {preview && <PreviewBanner name={preview.you.displayName} onExit={() => setViewAs(null)} />}
      {replaying && <ReplayBar roomId={roomId} token={token} onShow={showReplay} onExit={exitReplay} />}
      {guideOpen && <GuideTour role={you.role} onClose={closeGuide} />}
      {you.role === "gm" && (
        <ResolveDepartureModal
          connection={connection}
          state={state}
          participantId={reviewing}
          onClose={() => setReviewing(null)}
        />
      )}
    </div></NukeHealthContext.Provider>
  );
}

function Chevron({ pointsLeft }: { pointsLeft: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={pointsLeft ? "M7.5 2.5 4 6l3.5 3.5" : "M4.5 2.5 8 6l-3.5 3.5"} />
    </svg>
  );
}

/**
 * Keeps your look on the table in step with the look you chose (shared-dice-looks, ADR 0018): when
 * you enter the room, and whenever you choose another look, choose Classic, or edit the one in
 * use. Only then: if the GM puts your dice back to classic, they stay classic until you choose
 * again or come back into the room. Only for a signed-in seat kept on the account; a guest's look
 * stays on their own screen. The server checks the look is yours; this only asks.
 */
function useSyncOwnDiceLook(connection: RoomConnection, roomId: string, you: Participant | null) {
  const { looks, activeId, ready, kept } = useDiceLooks();
  const active = looks.find((l) => l.id === activeId) ?? null;
  const wantId = active?.id ?? null;
  const wantVersion = active?.updatedAt ?? null;
  // Read when needed, not a reason to sync: a change made by someone else (a GM reset) is respected.
  const onTable = useRef(you?.diceLook ?? null);
  onTable.current = you?.diceLook ?? null;
  // Read as it renders: keeping the seat on the account (KeepSeatNotice) re-renders the room.
  const seatKept = loadCredentials(roomId)?.viaAccount === true;
  useEffect(() => {
    if (!you || !ready || kept !== "account" || !seatKept) return;
    const table = onTable.current;
    const same = wantId === (table?.lookId ?? null) && (wantId === null || wantVersion === table?.version);
    if (!same) void connection.command({ type: "participant.setDiceLook", lookId: wantId });
    // Not on `onTable`: see above.
  }, [connection, you?.id, ready, kept, seatKept, wantId, wantVersion]);
}
