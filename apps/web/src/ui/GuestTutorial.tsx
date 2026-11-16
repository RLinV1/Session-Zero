import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { GUEST_ROOM_IDLE_DAYS, type RoomState } from "@vtt/shared";
import { t, type TextId } from "../i18n/locale";
import { navigate } from "../router";
import type { RoomConnection } from "../net/roomConnection";
import { SAVE_ACCOUNT_HREF, useGuestRoom } from "./GuestRoom";
import { damageWaiting, demoTokenIds, removeDemoTokens, runDemoEncounter, runDemoRoll, type DemoResult } from "./tutorialDemo";
import { COMBAT_TUTORIAL_STEPS, EDITOR_TUTORIAL_STEPS, TUTORIAL_STEPS, countKeyChange, countMarks, countMoves, loadProgress, rollMarks, saveProgress, settle, type Progress, type TutorialFacts } from "./tutorialSteps";

const TITLE: Record<(typeof TUTORIAL_STEPS)[number], TextId> = {
  table: "tutorial.table.title",
  invite: "tutorial.invite.title",
  map: "tutorial.map.title",
  grid: "tutorial.grid.title",
  walls: "tutorial.walls.title",
  sight: "tutorial.sight.title",
  terrain: "tutorial.terrain.title",
  token: "tutorial.token.title",
  move: "tutorial.move.title",
  encounter: "tutorial.encounter.title",
  attack: "tutorial.attack.title",
  ruling: "tutorial.ruling.title",
  damage: "tutorial.damage.title",
  fog: "tutorial.fog.title",
  roll: "tutorial.roll.title",
  done: "tutorial.done.title",
};

/** Below this the card is always a bottom sheet: beside a control it would cover the board. */
const BESIDE_MIN_WIDTH = 640;
const GUTTER = 16;
/** Steps whose control can be out of sight (another tab, a folded section) and so offer Show me. */
const REVEALABLE: ReadonlySet<string> = new Set(["invite", "map", ...EDITOR_TUTORIAL_STEPS, "token", "roll", ...COMBAT_TUTORIAL_STEPS]);
const MODAL_HOSTS = "dialog.map-editor[open], dialog.map-picker[open], dialog.share-modal[open]";
/** Steps whose control lives in a dialog the lesson opens, so Show me is useful even with the opener in sight. */
const OPENS_DIALOG: ReadonlySet<string> = new Set(["map"]);
/** The ring sits this far outside the control. */
const RING_PAD = 6;
const anchorFor = (step: string) => document.querySelector<HTMLElement>(`dialog[open] [data-tutorial="${step}"]`)
  // Apply, not the Attack panel's Roll damage, once there is a damage roll to apply.
  ?? (step === "damage" ? document.querySelector<HTMLElement>('.ruling-buttons [data-tutorial="damage"]') : null)
  ?? (EDITOR_TUTORIAL_STEPS.has(step) ? document.querySelector<HTMLElement>("[data-tutorial-editor-open]") : null)
  ?? document.querySelector<HTMLElement>(`[data-tutorial="${step}"]`);

const positionsOf = (tokens: RoomState["tokens"]) =>
  Object.fromEntries(Object.entries(tokens).map(([id, token]) => [id, `${token.position.x},${token.position.y}`]));

/**
 * The guest GM's interactive demo (guest-gm-hosting, D8a). It only watches the room the GM already
 * has, except the demo fight (tutorialDemo.ts), whose buttons send the panels' own commands. Each step points at a `data-tutorial` control, or sits at the
 * bottom of the screen when that control is not on screen.
 */
export function GuestTutorial({ roomId, state, selfId, invites, restart, reveal, connection }: {
  roomId: string;
  /** The GM seat's connection: the demo fight sends the same commands the Initiative and Attack panels do. */
  connection: RoomConnection;
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
  const [gridEdits, setGridEdits] = useState(0);
  const [wallEdits, setWallEdits] = useState(0);
  const [sightEdits, setSightEdits] = useState(0);
  const [terrainEdits, setTerrainEdits] = useState(0);
  const baseInvites = useRef(invites);
  // The roll log outlives the demo, so only attacks made after it began (or restarted) count.
  const baseMarks = useRef(rollMarks(state.rolls));
  const positions = useRef(positionsOf(state.tokens));

  const nextPositions = useMemo(() => positionsOf(state.tokens), [state.tokens]);
  useEffect(() => {
    const moved = countMoves(positions.current, nextPositions);
    positions.current = nextPositions;
    if (moved > 0) setMoves((n) => n + moved);
  }, [nextPositions]);

  // Saving one editor section must not complete the lessons for the other sections.
  const mapKey = useMemo(() => JSON.stringify(state.scene.map), [state.scene.map]);
  const gridKey = useMemo(() => JSON.stringify(state.scene.grid), [state.scene.grid]);
  const wallKey = useMemo(() => JSON.stringify(state.walls), [state.walls]);
  const sightKey = useMemo(() => JSON.stringify([state.scene.lineOfSight, state.scene.sightRange]), [state.scene.lineOfSight, state.scene.sightRange]);
  const terrainKey = useMemo(() => JSON.stringify(state.terrain ?? null), [state.terrain]);
  const keys = useRef({ mapKey, gridKey, wallKey, sightKey, terrainKey });
  useEffect(() => {
    const map = countKeyChange(keys.current.mapKey, mapKey);
    const grid = countKeyChange(keys.current.gridKey, gridKey);
    const walls = countKeyChange(keys.current.wallKey, wallKey);
    const sight = countKeyChange(keys.current.sightKey, sightKey);
    const terrain = countKeyChange(keys.current.terrainKey, terrainKey);
    keys.current = { mapKey, gridKey, wallKey, sightKey, terrainKey };
    if (map) setMapEdits((n) => n + map);
    if (grid) setGridEdits((n) => n + grid);
    if (walls) setWallEdits((n) => n + walls);
    if (sight) setSightEdits((n) => n + sight);
    if (terrain) setTerrainEdits((n) => n + terrain);
  }, [mapKey, gridKey, wallKey, sightKey, terrainKey]);

  const marks = useMemo(() => rollMarks(state.rolls), [state.rolls]);
  const facts: TutorialFacts = {
    tokens: Object.keys(state.tokens).length,
    fog: Object.keys(state.fog).length,
    gmRolls: state.rolls.filter((roll) => roll.byParticipantId === selfId).length,
    moves,
    mapEdits,
    gridEdits,
    wallEdits,
    sightEdits,
    terrainEdits,
    invites: invites - baseInvites.current,
    encounters: state.initiative ? 1 : 0,
    attackRolls: countMarks(marks, baseMarks.current, "attack"),
    rulings: countMarks(marks, baseMarks.current, "ruling"),
    damageApplied: countMarks(marks, baseMarks.current, "damage"),
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
    baseMarks.current = marks;
    setMoves(0);
    setMapEdits(0);
    setGridEdits(0);
    setWallEdits(0);
    setSightEdits(0);
    setTerrainEdits(0);
    focusNext.current = true;
    set(0);
  }, [restart]);

  const [place, setPlace] = useState<{ top: number; left: number; side: "above" | "below"; arrowX: number } | null>(null);
  const [spot, setSpot] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [dockTop, setDockTop] = useState(false);
  const [editorHost, setEditorHost] = useState<HTMLDialogElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const shown = guest && (progress === null || typeof progress === "number");
  const stepName = step === null ? null : TUTORIAL_STEPS[step]!;

  // Next to the step's control; a bottom sheet when it is hidden, huge (the board) or the screen is narrow.
  useLayoutEffect(() => {
    if (!shown) return;
    let anchor: HTMLElement | null = null;
    const measure = () => {
      const card = cardRef.current;
      const found = stepName ? anchorFor(stepName) : null;
      if (found !== anchor) {
        anchor?.removeAttribute("data-tutorial-active");
        anchor = found;
        anchor?.setAttribute("data-tutorial-active", "");
      }
      // Stay in the top layer of the dialog a lesson opens (map editor, map chooser, Share), or it would hide and disable the demo.
      const editor = document.querySelector<HTMLDialogElement>(MODAL_HOSTS);
      setEditorHost(editor);
      const rect = found?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const onScreen = !!rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
      setHidden(!onScreen);
      // Not the board, nor anything over half the screen: dimming around those would dim the room.
      // A phone's control is often full width (Start encounter, Roll to hit), so width only rules out the board there if it is huge too.
      const small = onScreen && rect.height < vh / 2 && (rect.width < vw / 2 || (vw < BESIDE_MIN_WIDTH && !found!.classList.contains("board")));
      const ring = small ? { top: rect.top - RING_PAD, left: rect.left - RING_PAD, width: rect.width + 2 * RING_PAD, height: rect.height + 2 * RING_PAD } : null;
      setSpot((old) => (old && ring && old.top === ring.top && old.left === ring.left && old.width === ring.width && old.height === ring.height ? old : ring));
      // A bottom sheet that would cover the spotlit control moves to the top instead.
      setDockTop(vw < BESIDE_MIN_WIDTH && (!!editor || !!card && !!rect && small && rect.bottom > vh - GUTTER - card.offsetHeight));
      if (!card || !small || vw < BESIDE_MIN_WIDTH) return setPlace(null);
      const below = rect.bottom + 8 + card.offsetHeight <= vh - GUTTER;
      const top = below ? rect.bottom + 8 : Math.max(GUTTER, rect.top - 8 - card.offsetHeight);
      const left = Math.min(Math.max(GUTTER, rect.left), vw - card.offsetWidth - GUTTER);
      const side = below ? "below" : "above";
      const arrowX = Math.min(Math.max(GUTTER, rect.left + rect.width / 2 - left), card.offsetWidth - GUTTER);
      setPlace((old) => (old && old.top === top && old.left === left && old.side === side && old.arrowX === arrowX ? old : { top, left, side, arrowX }));
    };
    measure();
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

  const runDemo = async (run: () => Promise<DemoResult>) => {
    setDemoBusy(true);
    const result = await run();
    setDemoBusy(false);
    setDemoError(result.ok ? null : result.message);
    // The panels hold the lesson: bring the control the next step points at into view.
    const next = { encounter: "attack", attack: "ruling", damage: "damage" }[stepName!];
    if (result.ok && next) window.setTimeout(() => reveal(next as (typeof TUTORIAL_STEPS)[number]), 300);
  };
  const waitingDamage = damageWaiting(state);

  const asking = step === null;
  // Escape is No on the question and Skip on a step; only while focus is in the card, so a dialog's own Escape is left alone.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      set(asking ? "declined" : "done");
    }
  };

  const showMe = () => {
    focusNext.current = false;
    reveal(stepName!);
    // Tabs and the sidebar open on their own timing; look for the control once they have.
    window.setTimeout(() => anchorFor(stepName!)?.scrollIntoView({ block: "center" }), 500);
  };

  const content = (
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
              : stepName === "damage" && waitingDamage ? t("tutorial.damage.bodyRolled")
              : t(`tutorial.${stepName!}.body` as TextId)}
          </p>
          {demoError && <p role="alert" className="error">{demoError}</p>}
          <div className="row">
            {(hidden || EDITOR_TUTORIAL_STEPS.has(stepName!) || OPENS_DIALOG.has(stepName!)) && REVEALABLE.has(stepName!) && (
              <button type="button" className="small primary" onClick={showMe}>{t("tutorial.showMe")}</button>
            )}
            {stepName === "encounter" && (
              <button type="button" className="small primary" disabled={demoBusy} onClick={() => void runDemo(() => runDemoEncounter(connection))}>{t("tutorial.demo.run")}</button>
            )}
            {stepName === "attack" && (
              <button type="button" className="small primary" disabled={demoBusy} onClick={() => void runDemo(() => runDemoRoll(connection, "toHit"))}>{t("tutorial.demo.roll")}</button>
            )}
            {stepName === "damage" && !waitingDamage && (
              <button type="button" className="small primary" disabled={demoBusy} onClick={() => void runDemo(() => runDemoRoll(connection, "damage"))}>{t("tutorial.demo.damage")}</button>
            )}
            {stepName === "done" && demoTokenIds(state).length > 0 && (
              <button type="button" className="small secondary" disabled={demoBusy} onClick={() => void runDemo(() => removeDemoTokens(connection))}>{t("tutorial.demo.remove")}</button>
            )}
            {stepName === "table" && (
              <button type="button" className="small primary" onClick={() => { focusNext.current = true; set(settle(1, facts)); }}>{t("tutorial.start")}</button>
            )}
            {(stepName === "map" || EDITOR_TUTORIAL_STEPS.has(stepName!) || COMBAT_TUTORIAL_STEPS.has(stepName!)) && (
              <button type="button" className="small secondary" onClick={() => {
                focusNext.current = true;
                const next = settle(step + 1, facts);
                set(next);
                reveal(TUTORIAL_STEPS[next]!);
              }}>{t("tutorial.next")}</button>
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
  return editorHost ? createPortal(content, editorHost) : content;
}
