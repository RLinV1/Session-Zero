import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import type { MapImage } from "@vtt/shared";
import { THROW_MS, throwKeyframes, throwStagger } from "../ui/diceGeometry";
import { Die3D, dieParts, layoutDice, type TrayRoll } from "../ui/Die3D";
import { boardDiePaths, type BoardThrow, type BoardTransform } from "./diceThrow";
import { armSound, playDiceSound } from "./fxSound";

/** How long landed dice stay on the board, then how long they take to fade. */
const LINGER_MS = 3000;
const FADE_MS = 400;

/** A roll thrown on this viewer's board, until its dice have faded. */
export interface ActiveThrow {
  throw: BoardThrow;
  roll: TrayRoll;
  /** Die edge in board px, fixed when thrown. */
  size: number;
  /** The dice stay on it; null in a room without a map. */
  map: Pick<MapImage, "width" | "height"> | null;
  /** The dice are at rest. The board also calls it when it drops a throw early; it must be safe to call twice. */
  onLanded: () => void;
  /** The dice have left the board: faded, or dropped early. */
  onGone: () => void;
}

/**
 * Dice thrown on this viewer's board (throw-dice-on-board): a DOM layer over the Pixi canvas,
 * drawing the same 3D dice as the Dice panel. Its one inner element follows the board's world
 * transform, so the dice sit in board coordinates and pan and zoom with the map. It takes no
 * input: every pointer event reaches the board underneath.
 *
 * Each throw is on its own: several can be in the air at once, and each lands on its own clock.
 */
export function ThrownDice({
  throws,
  subscribe,
  onDone,
}: {
  throws: ActiveThrow[];
  /** Follow the board's world transform; returns the unsubscribe. */
  subscribe: (fn: (view: BoardTransform) => void) => () => void;
  /** The throw's dice have faded and it can go. */
  onDone: (rollId: string) => void;
}) {
  const world = useRef<HTMLDivElement>(null);

  useEffect(armSound, []);

  useLayoutEffect(
    () =>
      subscribe((view) => {
        if (world.current) world.current.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      }),
    [subscribe],
  );

  return (
    <div className="thrown-dice" aria-hidden="true">
      <div ref={world} className="thrown-dice-world">
        {throws.map((t) => (
          <ThrownRoll key={t.throw.rollId} active={t} onDone={onDone} />
        ))}
      </div>
    </div>
  );
}

function ThrownRoll({ active, onDone }: { active: ActiveThrow; onDone: (rollId: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const { throw: t, roll, size, map } = active;
  // Fixed for the life of the throw: nothing here changes once the dice are in the air.
  const dice = useMemo(() => layoutDice(roll, size), []);
  const paths = useMemo(() => boardDiePaths(t, roll.dice.length, size, map), []);
  const latest = useRef({ onLanded: active.onLanded, onDone });
  latest.current = { onLanded: active.onLanded, onDone };

  useEffect(() => {
    const el = root.current!;
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      latest.current.onLanded();
    };

    const stagger = throwStagger(dice.length);
    const animations: Animation[] = [];
    dieParts(el).forEach(({ spin, flight, shadow }, i) => {
      const die = dice[i];
      const path = paths[i];
      if (!die || !path || !spin || !flight || !shadow) return;
      const frames = throwKeyframes(die.rest, path.path);
      // `backwards` keeps each die in the hand until its turn to leave it.
      const timing: KeyframeAnimationOptions = { duration: THROW_MS, delay: i * stagger, fill: "backwards" };
      animations.push(spin.animate(frames.spin, timing), flight.animate(frames.flight, timing), shadow.animate(frames.shadow, timing));
    });
    // Scheduled on the same clock as the keyframes, so each die clacks as it bounces.
    const sound = animations.length ? playDiceSound({ count: dice.length, staggerMs: stagger }) : null;

    let fade: Animation | null = null;
    let linger: ReturnType<typeof setTimeout> | undefined;
    Promise.all(animations.map((a) => a.finished)).then(
      () => {
        land();
        linger = setTimeout(() => {
          fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: "forwards" });
          fade.finished.then(
            () => latest.current.onDone(t.rollId),
            () => {},
          );
        }, LINGER_MS);
      },
      // Cancelled: the throw was removed before its dice came to rest.
      () => {},
    );
    return () => {
      clearTimeout(linger);
      fade?.cancel();
      // Dropped before the dice came to rest: their clacks stop with them.
      if (!landed) sound?.stop();
      for (const a of animations) a.cancel();
    };
  }, []);

  return (
    <div ref={root} className={roll.gmOnly ? "thrown-dice-roll private" : "thrown-dice-roll"} style={{ "--die": `${size}px` } as CSSProperties}>
      {dice.map((die, i) => {
        const at = paths[i]!.landing;
        return <Die3D key={i} die={die} skin={roll.skin ?? null} style={{ left: at.x - size / 2, top: at.y - size / 2 }} />;
      })}
    </div>
  );
}
