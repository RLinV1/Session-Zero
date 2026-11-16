import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { GUEST_ROOM_IDLE_DAYS, type RoomState } from "@vtt/shared";
import { t, type TextId } from "../i18n/locale";
import { navigate } from "../router";
import type { RoomConnection } from "../net/roomConnection";
import { SAVE_ACCOUNT_HREF, useGuestRoom } from "./GuestRoom";
import { EXAMPLE_EVENT, EXAMPLE_STEPS } from "./tutorialExample";
import { ExampleCursor } from "./ExampleCursor";
import { useExampleRun } from "./useExampleRun";
import { TUTORIAL_MAP } from "./tutorialMap";
import { damageWaiting, demoTokenIds, ensureTutorialScene, restoreTutorialScene, removeDemoTokens, runDemoEncounter, runDemoRoll, type DemoResult } from "./tutorialDemo";
import { ScenePreparationContext } from "../panels/ScenePreparationContext";
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
const REVEALABLE: ReadonlySet<string> = new Set(["invite", "map", ...EDITOR_TUTORIAL_STEPS, "token", "move", "roll", ...COMBAT_TUTORIAL_STEPS]);
const MODAL_HOSTS = "dialog.map-editor[open], dialog.map-picker[open], dialog.share-modal[open], dialog.tutorial-token-dialog[open]";
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
export function GuestTutorial({ roomId, state, selfId, invites, restart, offer, reveal, connection }: {
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
  /** Bumped when a signed-in GM finishes the app guide: asks whether they also want the interactive demo. */
  offer?: number;
  /** Opens the tab or section that holds a step's control (RoomPage owns the tabs). */
  reveal: (step: (typeof TUTORIAL_STEPS)[number], demo?: boolean) => void;
}) {
  const guest = useGuestRoom();
  const scenePreparation = useContext(ScenePreparationContext);
  const { run, start, stop, clear } = useExampleRun();
  const [progress, setProgress] = useState<Progress>(() => loadProgress(roomId));
  const [moves, setMoves] = useState(0);
  const [demoBusy, setDemoBusy] = useState(false);
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
    if (next === "done" || next === "declined") {
      stop();
      void restoreTutorialScene(connection).then(() => {
        const current = connection.snapshot?.state;
        if (current) scenePreparation?.preview(current.activeSceneId ?? "initial");
      });
    }
    setProgress(next);
    saveProgress(roomId, next);
  };

  // Advance on what the GM does, skipping steps already done.
  const step = typeof progress === "number" ? progress : null;
  // Let the pointer finish its gesture and explanation before an automatic action advances the lesson.
  // A step the guest went back to stays put, even when its work is already done.
  const [pinned, setPinned] = useState<number | null>(null);
  const settled = !run.playing && !demoBusy && step !== null && step > 0 && step !== pinned ? settle(step, facts) : step;
  useEffect(() => {
    if (step !== null && settled !== null && settled !== step) set(settled);
  }, [step, settled]);

  const [offered, setOffered] = useState(false);
  const seenOffer = useRef(offer);
  useEffect(() => {
    if (offer === seenOffer.current) return;
    seenOffer.current = offer;
    setOffered(true);
    focusNext.current = true;
    setProgress(null);
  }, [offer]);

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

  const [place, setPlace] = useState<{ top: number; left: number; side: "above" | "below"; arrowX: number; follow?: boolean } | null>(null);
  const [spot, setSpot] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [dockTop, setDockTop] = useState(false);
  const [editorHost, setEditorHost] = useState<HTMLDialogElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const pointerRoute = useRef<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const shown = (guest || offered) && (progress === null || typeof progress === "number");
  const stepName = step === null ? null : TUTORIAL_STEPS[step]!;

  // Next to the step's control; a bottom sheet when it is hidden, huge (the board) or the screen is narrow.
  useLayoutEffect(() => {
    if (!shown) return;
    if (!run.cursor) pointerRoute.current = null;
    else if (!pointerRoute.current || pointerRoute.current.to.x !== run.cursor.x || pointerRoute.current.to.y !== run.cursor.y) {
      pointerRoute.current = { from: pointerRoute.current?.to ?? run.cursor, to: run.cursor };
    }
    let anchor: HTMLElement | null = null;
    const measure = () => {
      const card = cardRef.current;
      const editor = Array.from(document.querySelectorAll<HTMLDialogElement>(MODAL_HOSTS)).at(-1) ?? null;
      const candidate = stepName ? anchorFor(stepName) : null;
      const found = editor && candidate && !editor.contains(candidate) ? null : candidate;
      if (found !== anchor) {
        anchor?.removeAttribute("data-tutorial-active");
        anchor = found;
        anchor?.setAttribute("data-tutorial-active", "");
      }
      // Stay in the top layer of the dialog a lesson opens (map editor, map chooser, Share), or it would hide and disable the demo.
      setEditorHost(editor);
      const rect = found?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (card && run.playing && run.cursor) {
        const control = document.querySelector("[data-tutorial-ring]");
        if (!control || !card.contains(control)) {
          const { x, y } = run.cursor;
          const from = run.cursor.dragFrom ?? pointerRoute.current?.from ?? run.cursor;
          const w = card.offsetWidth, h = card.offsetHeight, gap = 32;
          const target = control?.getBoundingClientRect();
          const obstacles = [{ left: Math.min(x, from.x) - gap, right: Math.max(x, from.x) + gap, top: Math.min(y, from.y) - gap, bottom: Math.max(y, from.y) + gap }];
          if (target && target.width < vw / 2 && target.height < vh / 2) obstacles.push(target);
          const candidates = [
            { left: x + gap, top: y - h / 2 }, { left: x - w - gap, top: y - h / 2 },
            { left: x - w / 2, top: y + gap }, { left: x - w / 2, top: y - h - gap },
          ].map((p) => ({ left: Math.max(GUTTER, Math.min(p.left, vw - w - GUTTER)), top: Math.max(GUTTER, Math.min(p.top, vh - h - GUTTER)) }));
          const next = candidates.find((p) => obstacles.every((r) => p.left + w <= r.left || p.left >= r.right || p.top + h <= r.top || p.top >= r.bottom));
          if (next) {
            setPlace((old) => old?.follow && old.left === next.left && old.top === next.top ? old : { ...next, follow: true, side: "below", arrowX: 0 });
            return;
          }
        }
      }
      const onScreen = !!rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
      // Not the board, nor anything over half the screen: dimming around those would dim the room.
      // A phone's control is often full width (Start encounter, Roll to hit), so width only rules out the board there if it is huge too.
      const small = onScreen && rect.height < vh / 2 && (rect.width < vw / 2 || (vw < BESIDE_MIN_WIDTH && !found!.classList.contains("board")));
      const ring = small ? { top: rect.top - RING_PAD, left: rect.left - RING_PAD, width: rect.width + 2 * RING_PAD, height: rect.height + 2 * RING_PAD } : null;
      setSpot((old) => (old && ring && old.top === ring.top && old.left === ring.left && old.width === ring.width && old.height === ring.height ? old : ring));
      // Keep the phone card clear of both the current tool and the moving pointer, including Sight's top HUD.
      if (vw < BESIDE_MIN_WIDTH && card) {
        const ownControl = card.contains(document.querySelector("[data-tutorial-ring]"));
        const targets = [small ? rect : null, ...Array.from(document.querySelectorAll("[data-tutorial-ring], .example-cursor"))
          .filter((el) => !card.contains(el) && !(ownControl && el.classList.contains("example-cursor"))).map((el) => el.getBoundingClientRect())]
          .filter((target): target is DOMRect => !!target && target.height > 0 && target.height < vh / 2 && target.bottom > 0 && target.top < vh);
        const top = editor && !editor.classList.contains("tutorial-token-dialog") ? 80 : GUTTER;
        const bottom = vh - GUTTER - card.offsetHeight;
        const overlaps = (y: number) => targets.some((target) => y < target.bottom + 8 && y + card.offsetHeight > target.top - 8);
        setDockTop(editor ? !overlaps(top) || overlaps(bottom) : overlaps(bottom) && !overlaps(top));
      } else setDockTop(false);
      if (!card || !small || vw < BESIDE_MIN_WIDTH) return setPlace(null);
      const below = rect.bottom + 8 + card.offsetHeight <= vh - GUTTER;
      const top = below ? rect.bottom + 8 : Math.max(GUTTER, rect.top - 8 - card.offsetHeight);
      const left = Math.min(Math.max(GUTTER, rect.left), vw - card.offsetWidth - GUTTER);
      const side = below ? "below" : "above";
      const arrowX = Math.min(Math.max(GUTTER, rect.left + rect.width / 2 - left), card.offsetWidth - GUTTER);
      setPlace((old) => (old && !old.follow && old.top === top && old.left === left && old.side === side && old.arrowX === arrowX ? old : { top, left, side, arrowX }));
    };
    measure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (cardRef.current) resize?.observe(cardRef.current);
    const mutations = new MutationObserver(measure);
    mutations.observe(document.body, { childList: true, subtree: true });
    // Panels and menus open and close under the demo, so look again now and then.
    const timer = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    // Capture, so the sidebar's own scrolling moves the ring too.
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    return () => {
      window.clearInterval(timer);
      resize?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
      setSpot(null);
      anchor?.removeAttribute("data-tutorial-active");
    };
  }, [shown, stepName, editorHost, run.step, run.index, run.playing, run.cursor?.x, run.cursor?.y, run.cursor?.dragFrom]);
  // The editor tab opens, then asks for its lesson's animation.
  useEffect(() => {
    if (!shown) return;
    const on = (e: Event) => {
      const requested = (e as CustomEvent<string>).detail;
      if (requested === stepName) void start(requested);
    };
    window.addEventListener(EXAMPLE_EVENT, on);
    return () => window.removeEventListener(EXAMPLE_EVENT, on);
  }, [start, shown, stepName]);
  useEffect(() => stop, [stepName, stop]);

  // Focus follows the GM's own move through the card (question, Yes, Start, restart); a step reached by acting
  // elsewhere is only announced, so the board keeps focus and its Escape.
  useEffect(() => {
    if (shown && focusNext.current) headingRef.current?.focus();
    focusNext.current = false;
  }, [shown, step, restart]);

  if (!shown) return null;

  const runDemo = async (run: () => Promise<DemoResult>) => {
    if (stepName !== "done" && !await prepareExample()) return;
    setDemoBusy(true);
    const result = await run();
    setDemoBusy(false);
    setDemoError(result.ok ? null : result.message);
    // The panels hold the lesson: bring the control the next step points at into view.
    const next = ({ encounter: "attack", attack: "ruling", damage: "damage" } as Partial<Record<string, string>>)[stepName!];
    if (result.ok && next) window.setTimeout(() => reveal(next as (typeof TUTORIAL_STEPS)[number]), 300);
  };
  const waitingDamage = damageWaiting(state);

  const asking = step === null;
  // While an editor lesson plays, the card steps out of the board's way: the bottom right on a wide screen, a slim sheet on a phone.
  const following = run.playing && place?.follow;
  const docked = run.step === stepName && EDITOR_TUTORIAL_STEPS.has(stepName!) && !following;
  // Escape is No on the question and Skip on a step; only while focus is in the card, so a dialog's own Escape is left alone.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      set(asking ? "declined" : "done");
    }
  };

  const prepareExample = async () => {
    const changed = connection.snapshot?.state?.scene.map?.url !== TUTORIAL_MAP.url;
    setDemoBusy(true);
    const result = await ensureTutorialScene(connection);
    const current = connection.snapshot?.state;
    if (result.ok && current) scenePreparation?.preview(current.activeSceneId ?? "initial");
    if (result.ok && changed && current) {
      // Setting up the practice scene is not the guest completing the editor lessons.
      keys.current = { mapKey: JSON.stringify(current.scene.map), gridKey: JSON.stringify(current.scene.grid), wallKey: JSON.stringify(current.walls), sightKey: JSON.stringify([current.scene.lineOfSight, current.scene.sightRange]), terrainKey: JSON.stringify(current.terrain ?? null) };
      positions.current = positionsOf(current.tokens);
      baseMarks.current = rollMarks(current.rolls);
      setMoves(0); setMapEdits(0); setGridEdits(0); setWallEdits(0); setSightEdits(0); setTerrainEdits(0);
    }
    setDemoBusy(false);
    setDemoError(result.ok ? null : result.message);
    return result.ok;
  };
  const showMe = async () => {
    focusNext.current = false;
    if (stepName !== "invite" && connection.snapshot?.state && !await prepareExample()) return;
    reveal(stepName!, true);
    // An editor lesson is started by the editor tab opening (RoomPage); the others, once what they point at is on screen.
    if (!EDITOR_TUTORIAL_STEPS.has(stepName!)) void start(stepName!);
  };

  const content = (
    <>
    {spot && !asking && !run.playing && <div className="tutorial-spotlight" aria-hidden="true" style={spot} />}
    {run.cursor && <ExampleCursor cursor={run.cursor} />}
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      className={`guest-tutorial ${place && !docked && !asking ? "beside" : "sheet"}${(!place || docked) && dockTop ? " sheet-top" : ""}${run.step === stepName ? " has-example" : ""}${asking ? " is-intro" : ""}${following ? " is-following" : ""}`}
      data-side={place?.side}
      data-step={stepName}
      data-playing={run.playing}
      style={place && !docked && !asking ? ({ top: place.top, left: place.left, "--arrow-x": `${place.arrowX}px` } as CSSProperties) : undefined}
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
          <p className="muted small-print tutorial-progress">{t("tutorial.progress", { n: step + 1, total: TUTORIAL_STEPS.length })}</p>
          <h2 id={headingId} ref={headingRef} tabIndex={-1}>{t(TITLE[stepName!])}</h2>
          <p className="tutorial-body">
            {stepName === "done"
              ? t("tutorial.done.body", { days: GUEST_ROOM_IDLE_DAYS })
              : stepName === "damage" && waitingDamage ? t("tutorial.damage.bodyRolled")
              : t(`tutorial.${stepName!}.body` as TextId)}
          </p>
          {run.step === stepName && run.captions.length > 0 && (
            <ol className="tutorial-ex" aria-label={t("tutorial.showMe")}>
              {run.captions.map((caption, i) => (
                <li key={i} value={i + 1} data-state={i < run.index ? "done" : i === run.index ? "current" : "todo"} aria-current={i === run.index ? "step" : undefined}>{t(caption)}</li>
              ))}
            </ol>
          )}
          {run.step === stepName && run.index === run.captions.length && run.captions.length > 0 && EXAMPLE_STEPS.has(stepName!) && stepName !== "grid" && <p className="muted small-print" role="status">{t("tutorial.note")}</p>}
          {demoError && <p role="alert" className="error">{demoError}</p>}
          <div className="row">
            {REVEALABLE.has(stepName!) && (
              <button type="button" className="small primary" disabled={demoBusy} onClick={() => void showMe()}>{run.step === stepName ? t("tutorial.replay") : t("tutorial.showMe")}</button>
            )}
            {stepName === "encounter" && (
              <button type="button" className="small primary" data-demo="encounter" disabled={demoBusy} onClick={() => void runDemo(() => runDemoEncounter(connection))}>{t("tutorial.demo.run")}</button>
            )}
            {stepName === "attack" && (
              <button type="button" className="small primary" data-demo="attack" disabled={demoBusy} onClick={() => void runDemo(() => runDemoRoll(connection, "toHit"))}>{t("tutorial.demo.roll")}</button>
            )}
            {stepName === "damage" && !waitingDamage && (
              <button type="button" className="small primary" data-demo="damage" disabled={demoBusy} onClick={() => void runDemo(() => runDemoRoll(connection, "damage"))}>{t("tutorial.demo.damage")}</button>
            )}
            {stepName === "done" && demoTokenIds(state).length > 0 && (
              <button type="button" className="small secondary" disabled={demoBusy} onClick={() => void runDemo(() => removeDemoTokens(connection))}>{t("tutorial.demo.remove")}</button>
            )}
            {stepName === "table" && (
              <button type="button" className="small primary" disabled={demoBusy} onClick={() => void prepareExample().then((ok) => { if (ok) { focusNext.current = true; set(1); } })}>{t("tutorial.start")}</button>
            )}
            {stepName === "done" ? (
              <>
                {guest && <button type="button" className="small primary" onClick={() => { set("done"); navigate(SAVE_ACCOUNT_HREF); }}>{t("guest.save")}</button>}
                <button type="button" className="secondary small" onClick={() => set("done")}>{t("tutorial.finish")}</button>
              </>
            ) : (
              <button type="button" className="secondary small" onClick={() => set("done")}>{t("tutorial.skip")}</button>
            )}
          {step! > 1 && (
            <button type="button" className="small secondary icon-only" aria-label={t("tutorial.back")} title={t("tutorial.back")} onClick={() => {
              focusNext.current = true;
              setPinned(step! - 1);
              set(step! - 1);
              const openBack = () => reveal(TUTORIAL_STEPS[step! - 1]!);
              if (run.step === stepName && EXAMPLE_STEPS.has(stepName!)) void clear(stepName!).then(openBack);
              else openBack();
            }}><ArrowLeft aria-hidden="true" /></button>
          )}
          {stepName !== "table" && stepName !== "done" && (
            <button type="button" className="small secondary icon-only" aria-label={t("tutorial.next")} title={t("tutorial.next")} onClick={() => {
              focusNext.current = true;
              setPinned(null);
              const next = settle(step! + 1, facts);
              set(next);
              // Next from an editor or combat lesson opens what the next lesson uses; plain steps leave the screen alone.
              const openNext = () => { if (stepName === "map" || EDITOR_TUTORIAL_STEPS.has(stepName!) || COMBAT_TUTORIAL_STEPS.has(stepName!)) reveal(TUTORIAL_STEPS[next]!); };
              // The sample comes out first, so leaving its tab does not ask to save it.
              if (run.step === stepName && EXAMPLE_STEPS.has(stepName!)) {
                void clear(stepName!).then(openNext);
              } else openNext();
            }}><ArrowRight aria-hidden="true" /></button>
          )}
          </div>
        </>
      )}
    </div>
    </>
  );
  return editorHost ? createPortal(content, editorHost) : content;
}
