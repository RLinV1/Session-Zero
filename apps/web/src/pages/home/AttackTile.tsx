import { lazy, Suspense, useState } from "react";
import { motionReduced } from "../../ui/motion";
import { useNearViewport } from "../../ui/nearViewport";

/** The animation preview needs the board's renderer, so it is fetched only near the viewport. */
const AttackStage = lazy(() => import("./AttackStage"));

/** A frame of the same preview, captured from the app, for visitors who asked for less motion. */
export const ATTACK_STILL = { src: "/img/home/attack-still.webp", width: 960, height: 602 };

/**
 * Attacks (gm-home: "A demo that needs the board's renderer SHALL load it only when the demo comes
 * near the viewport"): the animation editor's own preview stage, playing the built-in attacks.
 * Under reduced motion the tile shows a still of it and never loads the renderer.
 */
export function AttackTile() {
  const [near, ref] = useNearViewport<HTMLDivElement>();
  const [still] = useState(motionReduced);
  return (
    <>
      <h4>Attacks</h4>
      <p>Make an attack and its animation plays on the board for everyone at the table.</p>
      <div ref={ref} className="attack-slot">
        {still ? (
          <img
            className="attack-still"
            src={ATTACK_STILL.src}
            width={ATTACK_STILL.width}
            height={ATTACK_STILL.height}
            alt="A fireball flying from the attacker's token to the target's, as it plays on the board."
            loading="lazy"
            decoding="async"
          />
        ) : near ? (
          <Suspense fallback={<div className="attack-placeholder" aria-hidden="true" />}>
            <AttackStage />
          </Suspense>
        ) : (
          <div className="attack-placeholder" aria-hidden="true" />
        )}
      </div>
    </>
  );
}
