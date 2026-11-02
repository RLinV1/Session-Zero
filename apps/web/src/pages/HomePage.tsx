import { revealOnEnter } from "../ui/reveal";
import { SiteHeader } from "../ui/SiteHeader";
import { AccountLinks } from "./home/AccountLinks";
import { ClosingBand } from "./home/ClosingBand";
import { FactsRow } from "./home/FactsRow";
import { FogDivider } from "./home/FogDivider";
import { Hero } from "./home/Hero";
import { LibraryStrip } from "./home/LibraryStrip";
import { PlayersSection } from "./home/PlayersSection";
import { PlaySection } from "./home/PlaySection";
import { PrepareSection } from "./home/PrepareSection";
import { RecoverSection } from "./home/RecoverSection";

/**
 * The home page. One page for everyone (KAN-56): it used to branch on whether this browser
 * held a GM token and render a different page entirely, which meant opening the asset
 * library (which mints an identity on mount) silently replaced `/` for the rest of the
 * session. Rooms you own are on the rooms page, not here. Each section lives in pages/home/.
 */
export function HomePage() {
  return (
    <div className="home-page">
      <div className="page-shell page-bar">
        <SiteHeader account={<AccountLinks />} />
      </div>

      <main className="landing-shell">
        <Hero />
        <FactsRow />

        <FogDivider />

        {/* Everything under this heading is about running a game, so "you" below is the GM
            and players are "your players" (gm-home: "You" is unambiguous). */}
        <section className="home-part" aria-labelledby="running-a-game">
          <header className="part-head" ref={revealOnEnter}>
            <h2 id="running-a-game">Running a game</h2>
            <p>What you get as the GM. Your players only need the link.</p>
          </header>
          <PrepareSection />
          <PlaySection />
          <RecoverSection />
          <LibraryStrip />
        </section>

        <FogDivider flip />

        {/* Under this one, "you" is the player. */}
        <section className="home-part" aria-labelledby="joining-a-game">
          <header className="part-head" ref={revealOnEnter}>
            <h2 id="joining-a-game">Joining a game</h2>
            <p>For players. Your GM sends a link, and you play in any browser.</p>
          </header>
          <PlayersSection />
        </section>

        <ClosingBand />
      </main>

      <footer className="landing-shell home-footer">
        <p>Built for CSE 416 at Stony Brook.</p>
      </footer>
    </div>
  );
}
