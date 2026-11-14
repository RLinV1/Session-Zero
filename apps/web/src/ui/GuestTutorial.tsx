import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { GUEST_ROOM_IDLE_DAYS, type RoomState } from "@vtt/shared";
import { t, type TextId } from "../i18n/locale";
import { navigate } from "../router";
import { SAVE_ACCOUNT_HREF, useGuestRoom } from "./GuestRoom";
import { TUTORIAL_STEPS, countKeyChange, countMoves, loadProgress, saveProgress, settle, type Progress, type TutorialFacts } from "./tutorialSteps";

const TITLE: Record<(typeof TUTORIAL_STEPS)[number], TextId> = {
  table: "tutorial.table.title",
  invite: "tutorial.invite.title",
  map: "tutorial.map.title",
  terrain: "tutorial.terrain.title",
  token: "tutorial.token.title",
  move: "tutorial.move.title",
  fog: "tutorial.fog.title",
  roll: "tutorial.roll.title",
  done: "tutorial.done.title",
};

/** Below this the card is always a bottom sheet: beside a control it would cover the board. */
const BESIDE_MIN_WIDTH = 640;
const GUTTER = 16;
/** Steps whose control can be out of sight (another tab, a folded section) and so offer Show me. */
const REVEALABLE: ReadonlySet<string> = new Set(["invite", "map", "terrain", "token", "fog", "roll"]);
/** The ring sits this far outside the control. */
const RING_PAD = 6;

const positionsOf = (tokens: RoomState["tokens"]) =>
  Object.fromEntries(Object.entries(tokens).map(([id, token]) => [id, `${token.position.x},${token.position.y}`]));

/**
 * The guest GM's interactive demo (guest-gm-hosting, D8a). It only watches the room the GM already
 * has: no command, no server call. Each step points at a `data-tutorial` control, or sits at the
 * bottom of the screen when that control is not on screen.
 */
export function GuestTutorial({ roomId, state, selfId, invites, restart, reveal }: {
  roomId: string;
  state: RoomState;
  /** The GM's own participant id, whose rolls count. */
  selfId: string;
  /** Invite links copied since the room opened. */
  invites: number;
  /** Bumped by the room menu's "Interactive demo" to start again from the first step. */
  restart: number;
  /** Opens the tab or section that holds a step's control (RoomPage owns the tabs). */
  reveal: (step: (typeof TUTORIAL_STEPS)[number]) => void;
}) {
  const guest = useGuestRoom();
  const [progress, setProgress] = useState<Progress>(() => loadProgress(roomId));
  const [moves, setMoves] = useState(0);
  const [mapEdits, setMapEdits] = useState(0);
  const [terrainEdits, setTerrainEdits] = useState(0);
  const baseInvites = useRef(invites);
  const positions = useRef(positionsOf(state.tokens));

  const nextPositions = useMemo(() => positionsOf(state.tokens), [state.tokens]);
  useEffect(() => {
    const moved = countMoves(positions.current, nextPositions);
    positions.current = nextPositions;
    if (moved > 0) setMoves((n) => n + moved);
  }, [nextPositions]);

  // The map setup (grid, map image, walls) and the terrain, as one string each: a different string is one edit.
  const mapKey = useMemo(() => JSON.stringify([state.scene.grid, state.scene.map, state.walls]), [state.scene.grid, state.scene.map, state.walls]);
  const terrainKey = useMemo(() => JSON.stringify(state.terrain ?? null), [state.terrain]);
  const keys = useRef({ mapKey, terrainKey });
  useEffect(() => {
    const map = countKeyChange(keys.current.mapKey, mapKey);
    const terrain = countKeyChange(keys.current.terrainKey, terrainKey);
    keys.current = { mapKey, terrainKey };
    if (map) setMapEdits((n) => n + map);
    if (terrain) setTerrainEdits((n) => n + terrain);
  }, [mapKey, terrainKey]);

  const facts: TutorialFacts = {
    tokens: Object.keys(state.tokens).length,
    fog: Object.keys(state.fog).length,
    gmRolls: state.rolls.filter((roll) => roll.byParticipantId === selfId).length,
    moves,
    mapEdits,
    terrainEdits,
    invites: invites - baseInvites.current,
  };

  const focusNext = useRef(progress === null);
  const set = (next: Exclude<Progress, null>) => {
    setProgress(next);
    saveProgress(roomId, next);
  };

  // Advance on what the GM does, skipping steps already done.
  const step = typeof progress === "number" ? progress : null;
  const settled = step !== null && step > 0 ? settle(step, facts) : step;
  useEffect(() => {
    if (step !== null && settled !== null && settled !== step) set(settled);
  }, [step, settled]);

  const seenRestart = useRef(restart);
  useEffect(() => {
    if (restart === seenRestart.current) return;
    seenRestart.current = restart;
    baseInvites.current = invites;
    setMoves(0);
    setMapEdits(0);
    setTerrainEdits(0);
    focusNext.current = true;
    set(0);
  }, [restart]);

  const [place, setPlace] = useState<{ top: number; left: number; side: "above" | "below"; arrowX: number } | null>(null);
  const [spot, setSpot] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [dockTop, setDockTop] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const shown = guest && (progress === null || typeof progress === "number");
  const stepName = step === null ? null : TUTORIAL_STEPS[step]!;

  // Next to the step's control; a bottom sheet when it is hidden, huge (the board) or the screen is narrow.
  useLayoutEffect(() => {
    if (!shown) return;
    const anchor = stepName ? document.querySelector<HTMLElement>(`[data-tutorial="${stepName}"]`) : null;
    const measure = () => {
      const card = cardRef.current;
      const found = stepName ? document.querySelector<HTMLElement>(`[data-tutorial="${stepName}"]`) : null;
      const rect = found?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const onScreen = !!rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
      setHidden(!onScreen);
      // Not the board, nor anything over half the screen: dimming around those would dim the room.
      const small = onScreen && rect.height < vh / 2 && rect.width < vw / 2;
      const ring = small ? { top: rect.top - RING_PAD, left: rect.left - RING_PAD, width: rect.width + 2 * RING_PAD, height: rect.height + 2 * RING_PAD } : null;
      setSpot((old) => (old && ring && old.top === ring.top && old.left === ring.left && old.width === ring.width && old.height === ring.height ? old : ring));
      // A bottom sheet that would cover the spotlit control moves to the top instead.
      setDockTop(!!card && !!rect && small && vw < BESIDE_MIN_WIDTH && rect.bottom > vh - GUTTER - card.offsetHeight);
      if (!card || !small || vw < BESIDE_MIN_WIDTH) return setPlace(null);
      const below = rect.bottom + 8 + card.offsetHeight <= vh - GUTTER;
      const top = below ? rect.bottom + 8 : Math.max(GUTTER, rect.top - 8 - card.offsetHeight);
      const left = Math.min(Math.max(GUTTER, rect.left), vw - card.offsetWidth - GUTTER);
      const side = below ? "below" : "above";
      const arrowX = Math.min(Math.max(GUTTER, rect.left + rect.width / 2 - left), card.offsetWidth - GUTTER);
      setPlace((old) => (old && old.top === top && old.left === left && old.side === side && old.arrowX === arrowX ? old : { top, left, side, arrowX }));
    };
    measure();
    anchor?.setAttribute("data-tutorial-active", "");
    // Panels and menus open and close under the demo, so look again now and then.
    const timer = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    // Capture, so the sidebar's own scrolling moves the ring too.
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
      setSpot(null);
      anchor?.removeAttribute("data-tutorial-active");
    };
  }, [shown, stepName]);

  // Focus follows the GM's own move through the card (question, Yes, Start, restart); a step reached by acting
  // elsewhere is only announced, so the board keeps focus and its Escape.
  useEffect(() => {
    if (shown && focusNext.current) headingRef.current?.focus();
    focusNext.current = false;
  }, [shown, step, restart]);

  if (!shown) return null;

  const asking = step === null;
  // Escape is No on the question and Skip on a step; only while focus is in the card, so a dialog's own Escape is left alone.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      set(asking ? "declined" : "done");
    }
  };

  const showMe = () => {
    focusNext.current = false;
    reveal(stepName!);
    // Tabs and the sidebar open on their own timing; look for the control once they have.
    window.setTimeout(() => document.querySelector(`[data-tutorial="${stepName}"]`)?.scrollIntoView({ block: "center" }), 500);
  };

  return (
    <>
    {spot && !asking && <div className="tutorial-spotlight" aria-hidden="true" style={spot} />}
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      className={`guest-tutorial ${place ? "beside" : "sheet"}${!place && dockTop ? " sheet-top" : ""}`}
      data-side={place?.side}
      style={place ? ({ top: place.top, left: place.left, "--arrow-x": `${place.arrowX}px` } as CSSProperties) : undefined}
      onKeyDown={onKeyDown}
    >
      <span className="sr-only" role="status" aria-live="polite">{stepName ? t(TITLE[stepName]) : ""}</span>
      {asking ? (
        <>
          <h2 id={headingId} ref={headingRef} tabIndex={-1}>{t("tutorial.ask.title")}</h2>
          <p>{t("tutorial.ask.body")}</p>
          <div className="row">
            <button type="button" className="small primary" onClick={() => { focusNext.current = true; set(0); }}>{t("tutorial.yes")}</button>
            <button type="button" className="secondary small" onClick={() => set("declined")}>{t("tutorial.no")}</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small-print">{t("tutorial.progress", { n: step + 1, total: TUTORIAL_STEPS.length })}</p>
          <h2 id={headingId} ref={headingRef} tabIndex={-1}>{t(TITLE[stepName!])}</h2>
          <p>
            {stepName === "done"
              ? t("tutorial.done.body", { days: GUEST_ROOM_IDLE_DAYS })
              : t(`tutorial.${stepName!}.body` as TextId)}
          </p>
          <div className="row">
            {hidden && REVEALABLE.has(stepName!) && (
              <button type="button" className="small primary" onClick={showMe}>{t("tutorial.showMe")}</button>
            )}
            {stepName === "table" && (
              <button type="button" className="small primary" onClick={() => { focusNext.current = true; set(settle(1, facts)); }}>{t("tutorial.start")}</button>
            )}
            {stepName === "done" ? (
              <>
                <button type="button" className="small primary" onClick={() => { set("done"); navigate(SAVE_ACCOUNT_HREF); }}>{t("guest.save")}</button>
                <button type="button" className="secondary small" onClick={() => set("done")}>{t("tutorial.finish")}</button>
              </>
            ) : (
              <button type="button" className="secondary small" onClick={() => set("done")}>{t("tutorial.skip")}</button>
            )}
          </div>
        </>
      )}
    </div>
    </>
  );
}
