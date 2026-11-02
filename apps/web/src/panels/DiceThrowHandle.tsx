import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Point } from "@vtt/shared";
import type { DiceBoard } from "../board/Board";
import { holdEvent, releaseVelocity, type PointerSample } from "../board/diceThrow";
import { startDiceShake, type DiceShake } from "../board/fxSound";
import { Die3D, layoutDice } from "../ui/Die3D";
import { useActiveDiceLook } from "../ui/diceSkinStore";

/** How long a die that didn't make it onto the board takes to fade where it was let go. */
const FADE_MS = 400;
/** Pointer history kept while the die is held; the release velocity reads the last 80 ms. */
const SAMPLE_MS = 200;

/** Where the held die is drawn: centred on a page point, moved on the compositor only. */
const ghostTransform = (p: Point) => `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;

/**
 * The Dice panel's die to pick up and throw onto the map (throw-dice-on-board). While held, a
 * die follows the pointer; let go over the map and `onThrow` rolls, with where it was let go
 * and where the flick sends it. The die stays spinning where it was let go until the roll's
 * dice take over on the board, and fades there if they don't.
 *
 * Pointer events with capture, not HTML drag and drop, which has no touch support and no
 * velocity. Keyboard users roll with the Roll button; the die is decorative to them.
 *
 * While held, the dice rattle in the hand: harder as it is shaken, softly as it is dragged, now
 * and then while it is held still (`startDiceShake`), until the hold ends.
 *
 * A hold ends on its own pointer's release, and also whenever that release can no longer
 * arrive: capture lost, the pointer moving with no button down, a context menu, the window
 * losing focus. Otherwise a missed release would leave the die stuck to the pointer.
 */
export function DiceThrowHandle({
  sides,
  gmOnly,
  blocker,
  busy,
  board,
  onThrow,
}: {
  sides: number;
  gmOnly: boolean;
  /** Why the die can't be thrown now, shown as its hint; null when it can. */
  blocker: string | null;
  busy: boolean;
  board: DiceBoard;
  /** Roll, for dice aimed from `from` to `to`. True once the roll is made: its dice have taken over. */
  onThrow: (aim: { from: Point; to: Point }) => Promise<boolean>;
}) {
  /** Only whether the held die is over the map re-renders; its position is written directly. */
  const [held, setHeld] = useState<{ over: boolean } | null>(null);
  const [flying, setFlying] = useState<{ x: number; y: number; fading: boolean } | null>(null);
  /** The pointer holding the die, or null. */
  const hold = useRef<number | null>(null);
  const pointer = useRef<Point>({ x: 0, y: 0 });
  const samples = useRef<PointerSample[]>([]);
  const ghostRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  /** The rattle of the dice in the hand while the die is held. */
  const shake = useRef<DiceShake | null>(null);
  // Your die, in your skin; a GM-only roll keeps the private look.
  const skin = useActiveDiceLook();
  const dieSkin = gmOnly ? null : skin;
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(fadeTimer.current);
      cancelAnimationFrame(frame.current);
      shake.current?.stop();
    },
    [],
  );

  const handleDie = useMemo(() => layoutDice({ id: "handle", sides, dice: [sides] }, 34)[0]!, [sides]);
  const ghostDie = useMemo(() => layoutDice({ id: "ghost", sides, dice: [sides] }, 44)[0]!, [sides]);
  const disabled = blocker !== null || busy || flying !== null;

  /** Put the die back: nothing is rolled. */
  const cancel = () => {
    hold.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    shake.current?.stop();
    shake.current = null;
    setHeld(null);
  };

  // While held: Escape puts the die back, and so does anything that would swallow the release.
  useLayoutEffect(() => {
    if (!held) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cancel();
    };
    const onMenu = (e: MouseEvent) => {
      // A menu opened mid-drag takes the mouse-up for itself.
      e.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onMenu);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onMenu);
      window.removeEventListener("blur", cancel);
    };
  }, [held !== null]);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary || disabled || hold.current !== null) return;
    // No text selection, no scroll, and the board underneath never starts a pan.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    hold.current = e.pointerId;
    pointer.current = { x: e.clientX, y: e.clientY };
    samples.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    shake.current?.stop();
    shake.current = startDiceShake();
    shake.current?.move(samples.current[0]!);
    setHeld({ over: false });
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const step = holdEvent(hold.current, e);
    // No button down: the release happened somewhere this never heard about.
    if (step === "end") return cancel();
    if (step !== "move") return;
    const now = e.timeStamp;
    samples.current = [...samples.current.filter((s) => now - s.t <= SAMPLE_MS), { x: e.clientX, y: e.clientY, t: now }];
    pointer.current = { x: e.clientX, y: e.clientY };
    // Every sample, not once a frame: the rattle reads how fast the die turns.
    shake.current?.move({ x: e.clientX, y: e.clientY, t: now });
    // At most once a frame, however fast the pointer reports: move the die, and ask the board
    // (which measures the canvas) whether it is over the map.
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (hold.current === null) return;
      if (ghostRef.current) ghostRef.current.style.transform = ghostTransform(pointer.current);
      const over = board.aimThrow(pointer.current, { x: 0, y: 0 }) !== null;
      setHeld((h) => (h && h.over !== over ? { over } : h));
    });
  };

  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (holdEvent(hold.current, e) !== "release") return;
    cancel();
    const at = { x: e.clientX, y: e.clientY };
    const aim = board.aimThrow(at, releaseVelocity(samples.current, e.timeStamp));
    // Let go off the map: the die goes back, and nothing is rolled.
    if (!aim) return;
    setFlying({ ...at, fading: false });
    void onThrow(aim)
      // Whatever went wrong, the die must not stay spinning where it was let go.
      .catch(() => false)
      .then((onBoard) => {
        if (onBoard) return setFlying(null);
        setFlying((f) => f && { ...f, fading: true });
        fadeTimer.current = setTimeout(() => setFlying(null), FADE_MS);
      });
  };

  // Capture ends right after a release too; by then the hold is already over.
  const lost = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (holdEvent(hold.current, e) === "end") cancel();
  };

  const ghostAt = held ? pointer.current : flying;
  const ghostClass = ["dice-ghost", gmOnly && "private", held && !held.over && "off-map", flying?.fading && "fading"].filter(Boolean).join(" ");

  return (
    <div className="dice-throw">
      <div
        className={disabled ? "dice-throw-handle disabled" : "dice-throw-handle"}
        data-private={gmOnly || undefined}
        aria-hidden="true"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={lost}
        onLostPointerCapture={lost}
        // A ctrl-click on a Mac: no menu over the die it would leave stuck to the pointer.
        onContextMenu={(e) => e.preventDefault()}
        style={{ "--die": "34px" } as CSSProperties}
      >
        <Die3D die={handleDie} skin={dieSkin} />
      </div>
      <p className="muted small-print" id="dice-throw-hint">
        {blocker ?? "Or drag the die onto the map to throw it"}
      </p>
      {ghostAt &&
        createPortal(
          <div ref={ghostRef} className={ghostClass} aria-hidden="true" style={{ transform: ghostTransform(ghostAt), "--die": "44px" } as CSSProperties}>
            <Die3D die={ghostDie} skin={dieSkin} />
          </div>,
          document.body,
        )}
    </div>
  );
}
