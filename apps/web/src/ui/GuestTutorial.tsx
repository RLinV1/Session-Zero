import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { GUEST_ROOM_IDLE_DAYS, type RoomState } from "@vtt/shared";
import { t, type TextId } from "../i18n/locale";
import { navigate } from "../router";
import { SAVE_ACCOUNT_HREF, useGuestRoom } from "./GuestRoom";
import { TUTORIAL_STEPS, countMoves, loadProgress, saveProgress, settle, type Progress, type TutorialFacts } from "./tutorialSteps";

const TITLE: Record<(typeof TUTORIAL_STEPS)[number], TextId> = {
  table: "tutorial.table.title",
  invite: "tutorial.invite.title",
  token: "tutorial.token.title",
  move: "tutorial.move.title",
  fog: "tutorial.fog.title",
  roll: "tutorial.roll.title",
  done: "tutorial.done.title",
};

/** Below this the card is always a bottom sheet: beside a control it would cover the board. */
const BESIDE_MIN_WIDTH = 640;
const GUTTER = 16;

const positionsOf = (tokens: RoomState["tokens"]) =>
  Object.fromEntries(Object.entries(tokens).map(([id, token]) => [id, `${token.position.x},${token.position.y}`]));

/**
 * The guest GM's interactive demo (guest-gm-hosting, D8a). It only watches the room the GM already
 * has: no command, no server call. Each step points at a `data-tutorial` control, or sits at the
 * bottom of the screen when that control is not on screen.
 */
export function GuestTutorial({ roomId, state, selfId, invites, restart }: {
  roomId: string;
  state: RoomState;
  /** The GM's own participant id, whose rolls count. */
  selfId: string;
  /** Invite links copied since the room opened. */
  invites: number;
  /** Bumped by the room menu's "Interactive demo" to start again from the first step. */
  restart: number;
}) {
  const guest = useGuestRoom();
  const [progress, setProgress] = useState<Progress>(() => loadProgress(roomId));
  const [moves, setMoves] = useState(0);
  const baseInvites = useRef(invites);
  const positions = useRef(positionsOf(state.tokens));

  const nextPositions = useMemo(() => positionsOf(state.tokens), [state.tokens]);
  useEffect(() => {
    const moved = countMoves(positions.current, nextPositions);
    positions.current = nextPositions;
    if (moved > 0) setMoves((n) => n + moved);
  }, [nextPositions]);

  const facts: TutorialFacts = {
    tokens: Object.keys(state.tokens).length,
    fog: Object.keys(state.fog).length,
    gmRolls: state.rolls.filter((roll) => roll.byParticipantId === selfId).length,
    moves,
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
    focusNext.current = true;
    set(0);
  }, [restart]);

  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
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
      const beside = !!card && !!rect && vw >= BESIDE_MIN_WIDTH && rect.width > 0 && rect.height > 0 &&
        rect.bottom > 0 && rect.top < vh && rect.height < vh / 2 && rect.width < vw / 2;
      if (!beside) return setPlace(null);
      const below = rect.bottom + 8 + card.offsetHeight <= vh - GUTTER;
      const top = below ? rect.bottom + 8 : Math.max(GUTTER, rect.top - 8 - card.offsetHeight);
      const left = Math.min(Math.max(GUTTER, rect.left), vw - card.offsetWidth - GUTTER);
      setPlace((old) => (old && old.top === top && old.left === left ? old : { top, left }));
    };
    measure();
    anchor?.setAttribute("data-tutorial-active", "");
    // Panels and menus open and close under the demo, so look again now and then.
    const timer = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
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

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      className={`guest-tutorial ${place ? "beside" : "sheet"}`}
      style={place ?? undefined}
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
  );
}
