import { lazy, Suspense } from "react";
import { useNearViewport } from "../../ui/nearViewport";

/** The demo runs the table's `decide`, so its code is fetched only near the viewport. */
const RecoverDemo = lazy(() => import("./RecoverDemo"));

/** Recovering from a mistake (gm-home: "Undo runs the table's undo"). */
export function RecoverSection() {
  const [near, ref] = useNearViewport<HTMLDivElement>();
  return (
    <section className="home-section recover-section" aria-labelledby="recover-heading">
      <div className="section-copy">
        <h3 id="recover-heading">Take back a mistake.</h3>
        <p>
          Every change goes in the activity log. Undo a move, fog, walls or hit points from its entry, and the log keeps
          both lines: what happened, and that you undid it. Move a token, then try it.
        </p>
      </div>
      <div ref={ref} className="recover-slot">
        {near && (
          <Suspense fallback={null}>
            <RecoverDemo />
          </Suspense>
        )}
      </div>
    </section>
  );
}
