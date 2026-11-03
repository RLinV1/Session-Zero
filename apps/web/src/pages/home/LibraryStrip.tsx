import { MapGrid } from "../../ui/MapGrid";
import { HOME_MAPS } from "./crops";

/**
 * The asset library, described rather than linked: the rooms page is its way in (gm-dashboard).
 * It is kept on the GM's account, so the text says it is there wherever they sign in (gm-home:
 * "The library is presented honestly"). The strip shows this page's own maps whole, the way a
 * library card shows a map, with their real size and squares; the caption says they are this
 * page's maps, not maps every account gets. The maps drift past; under reduced motion the strip
 * is a still row that scrolls sideways a map at a time.
 */
export function LibraryStrip() {
  return (
    <section className="home-section library-strip" aria-labelledby="library-heading">
      <div className="section-copy">
        <h3 id="library-heading">Your library comes to every room.</h3>
        <p>
          Maps, token art, creatures and encounters are kept on your account, so they're there on any device you sign in
          on. You'll find the library on your rooms page.
        </p>
      </div>
      <div className="marquee">
        <ul className="plain marquee-track">
          {/* Twice over, so the strip can loop without a seam; the copy is hidden from assistive technology. */}
          {[...HOME_MAPS, ...HOME_MAPS].map((m, i) => {
            const copy = i >= HOME_MAPS.length;
            return (
              <li key={i} className={copy ? "marquee-copy" : undefined} aria-hidden={copy || undefined}>
                <div className="shelf-map">
                  <img src={m.thumb} width={m.width} height={m.height} alt={copy ? "" : `${m.name}, the whole map.`} loading="lazy" decoding="async" />
                  <MapGrid
                    width={m.width}
                    height={m.height}
                    cell={m.grid.cell}
                    cellY={m.grid.cellY}
                    offsetX={m.grid.offX}
                    offsetY={m.grid.offY}
                    variant="light"
                  />
                </div>
                <strong>{m.name}</strong>
                <span className="readout">
                  {m.width} × {m.height} px · {m.squares.across} × {m.squares.down} squares
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="figure-note">The maps on this page, as a library keeps them.</p>
    </section>
  );
}
