import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "../../Link";

/**
 * The page's last word, for someone running a game: the hero's own primary action, worded the
 * same, over the closing photograph (public/img/ambient/CREDITS.md). Until that picture exists the
 * band keeps its lamp-lit ground.
 */
export function ClosingBand() {
  return (
    <section className="closing-band" aria-labelledby="closing-heading">
      <div className="closing-plate" aria-hidden="true" />
      <div className="closing-copy">
        <h2 id="closing-heading">Ready to run a game?</h2>
        <p>Start a room and send your players the link.</p>
        <Link href="/gm-dashboard" className="cta">
          Start a room
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
