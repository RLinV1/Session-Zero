import { useId, type CSSProperties } from "react";
import { getClientSettings } from "./clientSettings";
import { apply, dot, faceLayout, labelDie, mul, rotateX, rotateY, rotateZ, rotationCss, seed, type BodyName, type Vec3 } from "./diceGeometry";
import { faceArt, faceImageTransform, type DiceSkin } from "./diceSkin";
import { sidesOfDice } from "@vtt/shared";

/** What the dice need to know about a roll that has already been made. */
export interface TrayRoll {
  /** Stable for the roll: it seeds the resting angles and the throw path. */
  id: string;
  /**
   * Each die's number of sides, in roll order, for a roll that mixes die types (ADR 0061); one
   * number when every die is the same type.
   */
  sides: number | readonly number[];
  /** Each die's result, in roll order. */
  dice: number[];
  /** Thrown in the GM's private colours. */
  gmOnly?: boolean;
  /**
   * The look to draw it in: the roller's look on the table, or the viewer's own browser look for
   * their own roll (shared-dice-looks). Absent or null draws classic dice.
   */
  skin?: DiceSkin | null;
}

/** One die's sides from a roll's `sides`; a list too short for the dice repeats its last. */
export function dieSidesAt(sides: TrayRoll["sides"], index: number): number {
  if (typeof sides === "number") return sides;
  return sides[index] ?? sides[sides.length - 1] ?? 20;
}

/** Each die's sides for a roll's formula and dice; a formula that doesn't fit falls back to one type. */
export function traySides(expression: string, dice: readonly number[], fallback = Math.max(20, ...dice)): TrayRoll["sides"] {
  return sidesOfDice(expression, dice) ?? fallback;
}

/** Light from over the viewer's left shoulder, so the face turned to them is the brightest. */
const LIGHT = ((l: Vec3) => {
  const len = Math.hypot(...l);
  return [l[0] / len, l[1] / len, l[2] / len] as Vec3;
})([-0.3, -0.5, 1]);

export interface DieLayout {
  /** The body it is drawn as, which picks its picture in a dice look. */
  body: BodyName;
  /** Half the die's size in px, the unit its faces are laid out in. */
  radius: number;
  /** CSS transform of the die at rest: tilted toward the viewer, result face forward. */
  rest: string;
  faces: {
    width: number;
    height: number;
    transform: string;
    points: string;
    /** The face's centre in its own pixels. */
    labelX: number;
    labelY: number;
    /** Reads the result head-on. */
    front: boolean;
    numerals: { x: number; y: number; angle: number; value: number; fontSize: number; underline: boolean }[];
    shade: string;
  }[];
}

/**
 * Every die of a roll, laid out at `size` px and at rest on its result. The resting angles are
 * seeded by the roll's id, so the tray and the board show the same dice the same way.
 */
export function layoutDice(roll: TrayRoll, size: number): DieLayout[] {
  const radius = size / 2;
  const rng = seed(roll.id);

  return roll.dice.map((value, i) => {
    const sides = dieSidesAt(roll.sides, i);
    const die = labelDie(sides, value, i);
    // Each die rests at its own slight angle, so a handful of them reads as thrown, not
    // printed. The tilt shows two side faces; the twist is small enough to read the number.
    const tilt = { x: 14 + rng() * 8, y: (rng() < 0.5 ? -1 : 1) * (12 + rng() * 10), z: (rng() - 0.5) * 18 };
    const rest = mul(mul(mul(rotateX(tilt.x), rotateY(tilt.y)), rotateZ(tilt.z)), die.rest);

    return {
      body: die.body.name,
      radius,
      rest: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotateZ(${tilt.z}deg) ${rotationCss(die.rest)}`,
      faces: die.body.faces.map((face, j) => {
        const layout = faceLayout(face, radius);
        // Lambert shading, fixed at the resting pose: the faces are painted once and
        // turn with the die, which a one-second tumble does not give away.
        const lit = Math.max(0, dot(apply(rest, face.n), LIGHT));
        return {
          ...layout,
          front: j === die.front,
          numerals: die.numerals[j]!.map((m) => {
            const digits = String(m.value).length;
            return {
              x: layout.labelX + m.u * radius,
              y: layout.labelY + m.v * radius,
              angle: m.angle,
              value: m.value,
              fontSize: Math.min(m.room * radius * (digits <= 2 ? 1.15 : digits === 3 ? 0.85 : 0.66), radius * 0.62),
              // A 6 and a 9 are the same numeral upside down; real dice underline them.
              underline: sides >= 9 && (m.value === 6 || m.value === 9),
            };
          }),
          shade: `${Math.round((1 - lit) * 62)}%`,
        };
      }),
    };
  });
}

/**
 * One die: its shadow, the element that carries it through the air (`data-part="flight"`)
 * and the element that tumbles (`data-part="spin"`), resting on its result until animated.
 * Sized by the `--die` custom property of an ancestor.
 */
export function Die3D({ die, style, skin }: { die: DieLayout; style?: CSSProperties; skin?: DiceSkin | null }) {
  // Clip paths are looked up by id across the whole page, so each die needs its own.
  const clipId = `die-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // The look's picture for this die type covers each face; the painted shading and the
  // numerals go over it. A look without one leaves this die classic.
  const art = skin?.images[die.body] ?? null;
  return (
    <div className="die3d-slot" data-die style={style}>
      <div className="die3d-shadow" data-part="shadow" />
      <div className="die3d-flight" data-part="flight">
        <div className={art ? "die3d skinned" : "die3d"} data-part="spin" style={{ transform: die.rest }}>
          {die.faces.map((f, j) => (
            <div
              key={j}
              className={f.front ? "die3d-face front" : "die3d-face"}
              style={{ width: f.width, height: f.height, transform: f.transform, "--shade": f.shade } as CSSProperties}
            >
              <svg width={f.width} height={f.height}>
                {art && (
                  <>
                    <clipPath id={`${clipId}-${j}`}>
                      <polygon points={f.points} />
                    </clipPath>
                    {/* Clipped as a group: a clip path on the image itself would move with its transform. */}
                    <g clipPath={`url(#${clipId}-${j})`}>
                      <image
                        href={art.href}
                        width={art.width}
                        height={art.height}
                        preserveAspectRatio="none"
                        transform={faceImageTransform(faceArt(art, die.body, j), {
                          cx: f.labelX,
                          cy: f.labelY,
                          radius: die.radius,
                        })}
                      />
                    </g>
                  </>
                )}
                <polygon points={f.points} />
                {f.numerals.map((m, k) => (
                  <g key={k} transform={`translate(${m.x} ${m.y}) rotate(${m.angle})`}>
                    <text style={{ fontSize: m.fontSize }}>{m.value}</text>
                    {m.underline && (
                      <line
                        x1={-m.fontSize * 0.3}
                        x2={m.fontSize * 0.3}
                        y1={m.fontSize * 0.55}
                        y2={m.fontSize * 0.55}
                        style={{ strokeWidth: Math.max(1, m.fontSize * 0.09) }}
                      />
                    )}
                  </g>
                ))}
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The flight, spin and shadow elements of each die under `root`, in roll order. */
export function dieParts(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("[data-die]")].map((slot) => ({
    slot,
    spin: slot.querySelector<HTMLElement>('[data-part="spin"]'),
    flight: slot.querySelector<HTMLElement>('[data-part="flight"]'),
    shadow: slot.querySelector<HTMLElement>('[data-part="shadow"]'),
  }));
}

/** Whether this browser, for this viewer, should animate dice at all. */
export function canAnimateDice(el: Element | null): boolean {
  return !!el && typeof el.animate === "function" && !getClientSettings().reducedAnimations && !matchMedia("(prefers-reduced-motion: reduce)").matches;
}
