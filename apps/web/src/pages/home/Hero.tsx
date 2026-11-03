import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react";
import { ArrowRight, DoorOpen } from "@phosphor-icons/react";
import { Link } from "../../Link";
import { listJoinedRooms } from "../../net/identity";
import { navigate } from "../../router";
import { MapGrid } from "../../ui/MapGrid";
import { CROP, MAPS, PORTRAITS, cropWalls } from "./crops";
import { litArea, squareCenter } from "./sightDemo";
import { SightFog } from "./SightStage";
import { TokenChip } from "./TokenChip";

/** The hero's table: Brenna and Toma hold the light on the quay. */
const HERO_WALLS = cropWalls("canal-market");
const LIT = [litArea(HERO_WALLS, squareCenter(5, 5)), litArea(HERO_WALLS, squareCenter(10, 7))];

/** Other parts of the page open the hero's join form with this (gm-home: one join form). */
const OPEN_JOIN = "vtt:open-join";
export function openHeroJoin() {
  window.dispatchEvent(new Event(OPEN_JOIN));
}

/** Accepts a full invite link or a bare code. */
export function inviteCodeFrom(input: string): string | null {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/\/join\/([^/?#\s]+)/);
  if (fromLink) return decodeURIComponent(fromLink[1]!);
  return /^[a-z0-9]{4,32}$/i.test(trimmed) ? trimmed : null;
}

/**
 * The first screen (gm-home: "Both paths in the first screen", "The hero shows a table in
 * play"). Running a game is the primary action; joining one opens the page's only join form in
 * place. A browser that has joined rooms before opens with that form showing, its rooms first.
 */
export function Hero() {
  return (
    <section className="landing-hero" aria-labelledby="hero-heading">
      <div className="hero-plate" aria-hidden="true" />
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-copy">
        <h1 id="hero-heading" className="enter">
          Your battle map, ready to play tonight.
        </h1>
        <p className="landing-sub enter enter-2">
          Upload a map, set the fog and walls, send a link. Players join from any browser without an account.
        </p>
        <HeroActions />
      </div>
      <HeroScene />
    </section>
  );
}

function HeroActions() {
  const [rooms] = useState(() => listJoinedRooms());
  const [open, setOpen] = useState(rooms.length > 0);
  /** Bumped by each request to join, so focus goes to the field once the form is on screen. */
  const [focusRequest, setFocusRequest] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const requestJoin = () => {
    setOpen(true);
    setFocusRequest((n) => n + 1);
  };

  useEffect(() => {
    if (focusRequest === 0) return;
    panel.current?.scrollIntoView?.({ block: "nearest" });
    field.current?.focus();
  }, [focusRequest]);

  // The page's other way in to joining brings the visitor here, to the same form.
  useEffect(() => {
    window.addEventListener(OPEN_JOIN, requestJoin);
    return () => window.removeEventListener(OPEN_JOIN, requestJoin);
  }, []);

  return (
    <div className="hero-actions enter enter-3">
      <div className="hero-buttons">
        <Link href="/gm-dashboard" className="cta">
          Start a room
          <ArrowRight aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="ui-button"
          aria-expanded={open}
          aria-controls="join-panel"
          onClick={requestJoin}
        >
          Join a game
        </button>
      </div>
      {open && (
        <div id="join-panel" ref={panel} className="join-panel">
          {rooms.length > 0 && <JoinedRooms rooms={rooms} />}
          <JoinForm field={field} />
        </div>
      )}
    </div>
  );
}

/**
 * Rooms this browser joined as a guest (KAN-64), so a player who closed the tab can get back
 * without the invite link. Seats the server refuses are forgotten by the room page, so every row
 * here is one to open.
 */
function JoinedRooms({ rooms }: { rooms: ReturnType<typeof listJoinedRooms> }) {
  return (
    <section className="joined-rooms" aria-labelledby="joined-rooms-label">
      <p id="joined-rooms-label" className="path-label">
        <DoorOpen aria-hidden="true" />
        Rooms you've joined
      </p>
      <p className="path-hint">Pick up where you left off. Saved in this browser only.</p>
      <ul className="plain joined-list">
        {rooms.map((room) => (
          <li key={room.roomId} className="joined-row">
            <Link href={`/r/${encodeURIComponent(room.roomId)}`} className="joined-name">
              {room.roomName ?? "A room you joined"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The player's way in. "You" here is someone their GM invited. */
function JoinForm({ field }: { field: RefObject<HTMLInputElement | null> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const code = inviteCodeFrom(value);
    if (!code) return setError("That doesn't look like an invite link or code.");
    navigate(`/join/${encodeURIComponent(code)}`);
  }

  return (
    <form className="join-form" aria-label="Join a game" onSubmit={onSubmit}>
      <label htmlFor="join-invite">Paste the link your GM sent you</label>
      {/* The label sits outside the row so the field and Join share one height. */}
      <div className="join-row">
        <input
          ref={field}
          id="join-invite"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          required
          placeholder="https://…/join/abc123"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "join-error" : undefined}
        />
        <button type="submit" className="ui-button">
          Join
        </button>
      </div>
      {error && (
        <p id="join-error" role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * A table in play, from the board's own pieces: a map crop and its squares, tokens drawn as the
 * board draws them, and a thin fog around what the party can see (the table's line of sight over
 * the map's walls).
 */
function HeroScene() {
  return (
    <div className="hero-art enter enter-art" style={{ "--map": `url(${MAPS.hero.src})` } as CSSProperties}>
      <div className="hero-frame">
        <img src={MAPS.hero.src} width={CROP.width} height={CROP.height} alt={MAPS.hero.alt} fetchPriority="high" />
        <MapGrid width={CROP.width} height={CROP.height} cell={CROP.cell} variant="faint" />
        <SightFog lit={LIT} view="player" look="fog" />
        <TokenChip name="Brenna" color="#5b8def" hp={84} image={PORTRAITS.hero.brenna} at={{ col: 5, row: 5 }} delay={560} />
        <TokenChip name="Toma" color="#3fb950" hp={61} image={PORTRAITS.hero.toma} at={{ col: 10, row: 7 }} delay={680} />
        <TokenChip name="Ash" color="#d29922" hp={38} image={PORTRAITS.hero.ash} at={{ col: 3, row: 8 }} delay={800} />
      </div>
    </div>
  );
}
