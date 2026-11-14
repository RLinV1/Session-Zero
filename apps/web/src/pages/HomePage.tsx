import { revealOnEnter } from "../ui/reveal";
import { SiteFooter } from "../ui/SiteFooter";
import { SiteHeader } from "../ui/SiteHeader";
import { AccountLinks } from "./home/AccountLinks";
import { ClosingBand } from "./home/ClosingBand";
import { DifferentiatorsSection } from "./home/DifferentiatorsSection";
import { FactsRow } from "./home/FactsRow";
import { FogDivider } from "./home/FogDivider";
import { Hero } from "./home/Hero";
import { LibraryStrip } from "./home/LibraryStrip";
import { PlayersSection } from "./home/PlayersSection";
import { PlaySection } from "./home/PlaySection";
import { PrepareSection } from "./home/PrepareSection";
import { RecoverSection } from "./home/RecoverSection";
import { t } from "../i18n/locale";

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
            <h2 id="running-a-game">{t("home.running.title")}</h2>
            <p>{t("home.running.body")}</p>
          </header>
          <DifferentiatorsSection />
          <PrepareSection />
          <PlaySection />
          <RecoverSection />
          <LibraryStrip />
        </section>

        <FogDivider flip />

        {/* Under this one, "you" is the player. */}
        <section className="home-part" aria-labelledby="joining-a-game">
          <header className="part-head" ref={revealOnEnter}>
            <h2 id="joining-a-game">{t("home.joining.title")}</h2>
            <p>{t("home.joining.body")}</p>
          </header>
          <PlayersSection />
        </section>

        <ClosingBand />
      </main>

      <p className="landing-shell home-footer"><a href="/demos/apartments">{t("home.isometricLink")}</a></p>
      <SiteFooter />
    </div>
  );
}
