import { openHeroJoin } from "./Hero";

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
        <h3 id="players-heading">Play from your phone or your laptop.</h3>
        <p>
          Open the link your GM sent, pick a name and you're at the table. No account and nothing to install. You see
          the map, your own tokens, and only what they can see.
        </p>
        <button type="button" className="ui-button players-join" onClick={openHeroJoin}>
          Join a game
        </button>
      </div>
      <figure className="phone-frame">
        <img
          src={PLAYER_CAPTURE.src}
          width={PLAYER_CAPTURE.width}
          height={PLAYER_CAPTURE.height}
          alt="A player's phone at the table: the tomb is dark except what their token Nalani can see, with Nalani's hit points below."
          loading="lazy"
          decoding="async"
        />
      </figure>
    </section>
  );
}
