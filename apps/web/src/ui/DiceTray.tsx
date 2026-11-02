import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { armSound, playDiceSound } from "../board/fxSound";
import { seed, THROW_MS, throwKeyframes, throwStagger, throwTurns } from "./diceGeometry";
import { canAnimateDice, Die3D, dieParts, layoutDice, type TrayRoll } from "./Die3D";

export type { TrayRoll } from "./Die3D";

/**
 * A roll thrown as 3D dice (FR-TAC-09, FR-GM-22), in the room's Dice panel and in the home
 * page's dice demo.
 *
 * The roll has already been made when this renders, by the server at the table or by the
 * shared roller on the home page: every die comes to rest on the face that roll chose, and
 * the throw is only how the result is shown arriving. At the table a GM-only roll never
 * reaches a player's state, so it never reaches a player's tray either.
 *
 * Decorative: the text beside it carries the result, so the tray is hidden from assistive
 * technology.
 */
export function DiceTray({
  roll,
  throwing,
  onLanded,
  scale = 1,
}: {
  roll: TrayRoll;
  /** Throw the dice in; otherwise they are drawn at rest. */
  throwing: boolean;
  /** Called once the dice are at rest (at once under reduced motion). */
  onLanded: () => void;
  /** Multiplies the die size, for roomier surfaces than the side panel. */
  scale?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;

  const size = Math.round(dieSize(roll.dice.length) * scale);
  const faces = roll.dice.join(",");
  // Keyed on values, not identity: the room re-renders on every state change, and a roll
  // rebuilt from the same data must not re-lay out twenty dice.
  const dice = useMemo(() => layoutDice(roll, size), [roll.id, roll.sides, faces, size]);

  useEffect(armSound, []);

  useLayoutEffect(() => {
    if (!throwing) return;
    const el = root.current;
    if (!el || !canAnimateDice(el)) {
      // Drawn at rest: one soft clack as they appear.
      if (el) playDiceSound({ count: dice.length, staggerMs: 0, reduced: true });
      landed.current();
      return;
    }

    const animations = throwDice(el, dice.map((d) => d.rest), size, seed(`${roll.id}:throw`));
    // Scheduled on the same clock as the keyframes, so each die clacks as it bounces.
    const sound = playDiceSound({ count: dice.length, staggerMs: throwStagger(dice.length) });
    let live = true;
    let rested = false;
    Promise.all(animations.map((a) => a.finished)).then(
      () => {
        rested = true;
        if (live) landed.current();
      },
      // Cancelled: a newer roll replaced this one, or the panel went away.
      () => {},
    );
    return () => {
      live = false;
      if (!rested) sound?.stop();
      for (const a of animations) a.cancel();
    };
    // The tray is keyed by roll, so a throw starts at most once per roll.
  }, [throwing]);

  const className = roll.gmOnly ? "dice-tray private" : "dice-tray";
  return (
    <div ref={root} className={className} aria-hidden="true" style={{ "--die": `${size}px` } as CSSProperties}>
      {dice.map((die, i) => (
        <Die3D key={i} die={die} skin={roll.skin ?? null} />
      ))}
    </div>
  );
}

/** Fewer dice are drawn bigger; twenty still fit a phone-width panel in three rows. */
function dieSize(count: number): number {
  if (count <= 2) return 60;
  if (count <= 4) return 52;
  if (count <= 8) return 44;
  if (count <= 12) return 38;
  return 32;
}

/**
 * Throws every die in the tray from one side: a drop, three shrinking bounces, a slide
 * that bleeds off speed, and a tumble that unwinds onto the resting pose.
 */
function throwDice(tray: HTMLElement, rests: string[], size: number, rng: () => number): Animation[] {
  const from = rng() < 0.5 ? -1 : 1;
  const stagger = throwStagger(rests.length);
  const out: Animation[] = [];

  dieParts(tray).forEach(({ spin, flight, shadow }, i) => {
    const rest = rests[i];
    if (rest === undefined || !spin || !flight || !shadow) return;
    const drop = size * (1.1 + rng() * 0.5);
    const slide = from * size * (1.8 + rng() * 1.4);
    const frames = throwKeyframes(rest, { offset: { x: slide, y: 0 }, drop, turns: throwTurns(rng) });
    // `backwards` holds each die at its starting point, out of view, until its turn.
    const timing: KeyframeAnimationOptions = { duration: THROW_MS, delay: i * stagger, fill: "backwards" };
    out.push(spin.animate(frames.spin, timing), flight.animate(frames.flight, timing), shadow.animate(frames.shadow, timing));
  });

  return out;
}
