import { openHeroJoin } from "./Hero";
import { t } from "../../i18n/locale";

/** The player's board on a phone, captured from the app (public/img/home/CREDITS.md). */
export const PLAYER_CAPTURE = { src: "/img/home/player-phone.webp", width: 600, height: 1298 };

/**
 * Joining a game (gm-home: "The players section addresses the player"). Its action goes back to
 * the hero's join form, the page's only one, and opens it there.
 */
export function PlayersSection() {
  return (
    <section className="home-section players-section" aria-labelledby="players-heading">
      <div className="section-copy">
        <h3 id="players-heading">{t("home.players.title")}</h3>
        <p>
          {t("home.players.body")}
        </p>
        <button type="button" className="ui-button players-join" onClick={openHeroJoin}>
          {t("home.players.join")}
        </button>
      </div>
      <figure className="phone-frame">
        <img
          src={PLAYER_CAPTURE.src}
          width={PLAYER_CAPTURE.width}
          height={PLAYER_CAPTURE.height}
          alt={t("home.players.alt")}
          loading="lazy"
          decoding="async"
        />
      </figure>
    </section>
  );
}
