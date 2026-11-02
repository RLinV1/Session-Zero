import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import type { MapImage } from "@vtt/shared";
import { Die3D, dieParts, layoutDice } from "../ui/Die3D";
import { THROW_MS, throwKeyframes, throwStagger } from "../ui/diceGeometry";
import type { DiceSkin } from "../ui/diceSkin";
import { boardDiePaths, throwStart, type BoardTransform } from "./diceThrow";
import { DROP_FADE_MS, DROP_LINGER_MS, DROP_MS, type BoardDrop, type DropGroup } from "./tokenDice";

/** A roll dropping onto this viewer's board, until its dice have faded. */
export interface ActiveDrop {
  drop: BoardDrop;
  /** Die edge in board px, fixed when dropped. */
  size: number;
  skin: DiceSkin | null;
  /** The dice stay on it; null in a room without a map. */
  map: Pick<MapImage, "width" | "height"> | null;
  /** Every group is at rest. Also called when the board clears the drop early; safe to call twice. */
  onLanded: () => void;
  /** The dice have left the board: faded, or cleared early. */
  onGone: () => void;
}

/**
 * Dice for group and area-effect rolls (ADR 0046): each token's dice are thrown onto it with the
 * usual throw, every token at once, so the whole roll lands as soon as one throw does however many
 * tokens it has. A roll with too many dice drops one total die on each token instead. A DOM layer
 * over the canvas that follows the board's world transform and takes no input, like `ThrownDice`.
 */
export function DroppedDice({
  drops,
  subscribe,
  onDone,
}: {
  drops: ActiveDrop[];
  subscribe: (fn: (view: BoardTransform) => void) => () => void;
  onDone: (rollId: string) => void;
}) {
  const world = useRef<HTMLDivElement>(null);
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
        {drops.map((d) => (
          <DroppedRoll key={d.drop.rollId} active={d} onDone={onDone} />
        ))}
      </div>
    </div>
  );
}

function DroppedRoll({ active, onDone }: { active: ActiveDrop; onDone: (rollId: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const { drop, size, map } = active;
  // Fixed for the life of the roll. Each token's dice fly in from the usual throwing side and
  // come to rest around it, exactly as a Roll-button throw lands around its target.
  const thrown = useMemo(
    () =>
      drop.totalsOnly
        ? []
        : drop.groups.map((group) => {
            const id = `${drop.rollId}:${group.key}`;
            const dice = layoutDice({ id, sides: drop.sides, dice: group.dice }, size);
            const paths = boardDiePaths({ rollId: id, from: throwStart(group.at, 2 * size), to: group.at }, dice.length, size, map);
            return { group, dice, paths };
          }),
    [],
  );
  const latest = useRef({ onLanded: active.onLanded, onDone });
  latest.current = { onLanded: active.onLanded, onDone };

  useEffect(() => {
    const el = root.current!;
    const animations: Animation[] = [];
    if (drop.totalsOnly) {
      // Too many dice to throw: each token's total drops straight down, all at once.
      for (const group of el.querySelectorAll<HTMLElement>(".dropped-group")) {
        animations.push(group.animate(
          [
            { transform: `translateY(${-size * 1.6}px) scale(1.25)`, opacity: 0 },
            { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.7 },
            { transform: `translateY(${-size * 0.12}px) scale(1)`, offset: 0.85 },
            { transform: "translateY(0) scale(1)", opacity: 1 },
          ],
          { duration: DROP_MS, easing: "ease-in", fill: "backwards" },
        ));
      }
    } else {
      // Every token's throw leaves the hand together; within a token, dice stagger as usual.
      const parts = dieParts(el);
      let n = 0;
      for (const { dice, paths } of thrown) {
        const stagger = throwStagger(dice.length);
        dice.forEach((die, i) => {
          const part = parts[n++];
          const path = paths[i];
          if (!part?.spin || !part.flight || !part.shadow || !path) return;
          const frames = throwKeyframes(die.rest, path.path);
          const timing: KeyframeAnimationOptions = { duration: THROW_MS, delay: i * stagger, fill: "backwards" };
          animations.push(part.spin.animate(frames.spin, timing), part.flight.animate(frames.flight, timing), part.shadow.animate(frames.shadow, timing));
        });
      }
    }
    let landed = false;
    let fade: Animation | null = null;
    let linger: ReturnType<typeof setTimeout> | undefined;
    Promise.all(animations.map((a) => a.finished)).then(
      () => {
        if (!landed) {
          landed = true;
          latest.current.onLanded();
        }
        linger = setTimeout(() => {
          fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DROP_FADE_MS, fill: "forwards" });
          fade.finished.then(() => latest.current.onDone(drop.rollId), () => {});
        }, DROP_LINGER_MS);
      },
      // Cancelled: the roll was cleared before its dice came to rest.
      () => {},
    );
    return () => {
      clearTimeout(linger);
      fade?.cancel();
      for (const a of animations) a.cancel();
    };
  }, []);

  return (
    <div ref={root} className={drop.gmOnly ? "thrown-dice-roll private" : "thrown-dice-roll"} style={{ "--die": `${size}px` } as CSSProperties}>
      {drop.totalsOnly
        ? drop.groups.map((group) => <TotalDie key={group.key} group={group} size={size} />)
        : thrown.flatMap(({ group, dice, paths }) =>
            dice.map((die, i) => {
              const at = paths[i]!.landing;
              return <Die3D key={`${group.key}:${i}`} die={die} skin={active.skin} style={{ left: at.x - size / 2, top: at.y - size / 2 }} />;
            }),
          )}
    </div>
  );
}

/** One die showing a token's total, for a roll with too many dice to throw. */
function TotalDie({ group, size }: { group: DropGroup; size: number }) {
  return (
    <div className="dropped-group" style={{ left: group.at.x, top: group.at.y }}>
      <span className="dropped-total" style={{ width: size, height: size, left: -size / 2, top: -size / 2, fontSize: size * 0.45 }}>
        {group.total}
      </span>
    </div>
  );
}
