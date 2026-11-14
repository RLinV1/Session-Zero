import { useEffect, useState, type FormEvent } from "react";
import {
  GUEST_ROOM_IDLE_DAYS, GUEST_ROOM_LIMIT, LEGACY_IDENTITY, SHIPPED_MAPS, SHIPPED_MAP_SLUGS, presetOf,
  type GmRoomSummary, type ShippedMapSlug,
} from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { signInFor } from "../account/safeNext";
import { Link } from "../Link";
import { api, ApiError } from "../net/api";
import { BUILTIN_ASSETS, SHIPPED_MAP_THUMBS } from "../net/builtinAssets";
import { ensureGmToken, forgetGmToken, loadGmToken, newGuestToken, saveCredentials } from "../net/identity";
import { navigate } from "../router";
import { presetName } from "../i18n/labels";
import { t } from "../i18n/locale";
import { DeleteRoomModal } from "../ui/DeleteRoomModal";
import { formatRelative } from "../ui/formatRelative";
import { SiteHeader } from "../ui/SiteHeader";
import { AccountLinks } from "./home/AccountLinks";
import { RoomDetailsFields, roomDetailsReady, useRoomDetails } from "./RoomDetailsFields";

/** Where a guest goes after signing in or up: the dashboard, which offers to move this browser's rooms. */
const DASHBOARD = "/gm-dashboard";
const SIGN_UP = `/signup?next=${encodeURIComponent(DASHBOARD)}`;

/** What this browser's GM token turned out to be: none or unknown, a guest's, or one from before accounts. */
type Identity = "loading" | "fresh" | "guest" | "preAccount";

/** The built-in map's name in the reader's language (the catalog's own, read when shown). */
const mapName = (slug: string) => BUILTIN_ASSETS.find((a) => a.id === `builtin:${slug}`)?.name ?? slug;

/**
 * Start a room with no account (guest-gm-hosting): pick a built-in map, name the room and go.
 * The GM is this browser's device token, so the rooms are listed here and nowhere else. A signed-in
 * visitor has the dashboard instead, and a browser holding a pre-account token is asked to sign in.
 */
export function StartPage() {
  const account = useAccount();
  useEffect(() => {
    if (account.status === "signedIn") navigate(DASHBOARD, { replace: true });
  }, [account.status]);
  if (account.status !== "signedOut") return null;
  return <GuestStart />;
}

function GuestStart() {
  const [identity, setIdentity] = useState<Identity>("loading");
  const [rooms, setRooms] = useState<GmRoomSummary[]>([]);
  const [roomsFailed, setRoomsFailed] = useState(false);

  useEffect(() => {
    const token = loadGmToken();
    if (!token) {
      setIdentity("fresh");
      return;
    }
    let live = true;
    api.legacy.summary(token).then(
      async (summary) => {
        if (!live) return;
        if (!summary.guest) return setIdentity("preAccount");
        setIdentity("guest");
        try {
          const list = await api.legacy.rooms(token);
          if (live) setRooms(list);
        } catch {
          if (live) setRoomsFailed(true);
        }
      },
      (err: unknown) => {
        if (!live) return;
        // A token the server doesn't know is forgotten and the visitor starts fresh (gm-identity-recovery).
        if (err instanceof ApiError && err.status === 401) forgetGmToken();
        setIdentity("fresh");
      },
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <div className="page-shell page-bar">
        <SiteHeader account={<AccountLinks />} />
      </div>
      <main className="page-shell home gm-page start-page">
        <h1>{t("start.title")}</h1>
        {identity === "loading" ? (
          <p role="status" className="muted">{t("common.loading")}</p>
        ) : identity === "preAccount" ? (
          <PreAccount />
        ) : (
          <>
            <p className="muted start-lede">{t("start.lede")}</p>
            <StartForm onPreAccount={() => setIdentity("preAccount")} />
            <p className="muted small-print start-note">{t("start.keptNote", { days: GUEST_ROOM_IDLE_DAYS })}</p>
            <p className="start-account">
              {t("start.account")} <Link href={signInFor(DASHBOARD)}>{t("home.signIn")}</Link> <span aria-hidden="true">/</span> <Link href={SIGN_UP}>{t("guest.createAccount")}</Link>
            </p>
            <GuestRooms rooms={rooms} failed={roomsFailed} onDeleted={(id) => setRooms((all) => all.filter((r) => r.id !== id))} />
          </>
        )}
      </main>
    </>
  );
}

/** A browser from before accounts owns real rooms and uploads: signing in is how they open, not a guest start. */
function PreAccount() {
  return (
    <section className="notice" aria-labelledby="pre-account-heading">
      <h2 id="pre-account-heading">{t("start.preAccount.title")}</h2>
      <p>{t("start.preAccount.body")}</p>
      <div className="row">
        <Link href={signInFor(DASHBOARD)} className="nav-cta">{t("home.signIn")}</Link>
        <Link href={SIGN_UP} className="nav-link">{t("guest.createAccount")}</Link>
      </div>
    </section>
  );
}

/** Why a start failed, in words, from the server's code and wait. */
function failureText(err: unknown): string {
  if (!(err instanceof ApiError)) return t("start.err.failed");
  if (err.detail.code === GUEST_ROOM_LIMIT) return t("start.err.limit");
  if (err.status === 429) {
    const wait = err.detail.retryAfterSec;
    return wait ? t("start.err.rate", { minutes: Math.max(1, Math.ceil(wait / 60)) }) : t("start.err.rateSoon");
  }
  return err.message;
}

function StartForm({ onPreAccount }: { onPreAccount: () => void }) {
  const [slug, setSlug] = useState<ShippedMapSlug>(SHIPPED_MAP_SLUGS[0]);
  const [details, setDetails] = useRoomDetails();
  /** The room name follows the chosen map until the GM types their own. */
  const [nameTyped, setNameTyped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = nameTyped ? details : { ...details, roomName: mapName(slug) };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !roomDetailsReady(shown)) return;
    setBusy(true);
    setError(null);
    try {
      const guestToken = newGuestToken();
      const created = await api.createGuestRoom(ensureGmToken(), { ...shown, guestToken, shippedMap: slug });
      saveCredentials({ ...created, guestToken });
      navigate(`/r/${created.roomId}`);
    } catch (err) {
      if (err instanceof ApiError && err.detail.code === LEGACY_IDENTITY) return onPreAccount();
      setError(failureText(err));
      setBusy(false);
    }
  }

  return (
    <form className="start-form" onSubmit={onSubmit}>
      <fieldset className="start-maps" disabled={busy}>
        <legend>{t("start.map")}</legend>
        <ul className="plain start-map-grid">
          {SHIPPED_MAPS.map((map) => (
            <li key={map.slug}>
              <label className="start-map">
                <input type="radio" name="shippedMap" className="sr-only" value={map.slug} checked={slug === map.slug} onChange={() => setSlug(map.slug as ShippedMapSlug)} />
                <img src={SHIPPED_MAP_THUMBS[map.slug]?.src ?? map.url} alt="" width={640} height={457} loading="lazy" decoding="async" />
                <span>{mapName(map.slug)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="start-fields">
        <RoomDetailsFields
          value={shown}
          disabled={busy}
          onChange={(next) => {
            if (next.roomName !== shown.roomName) setNameTyped(true);
            setDetails(next);
          }}
        />
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="row">
        <button className="primary" type="submit" disabled={busy || !roomDetailsReady(shown)}>
          {busy ? t("common.creating") : t("start.submit")}
        </button>
      </div>
    </form>
  );
}

/** The guest rooms this browser holds: open one, or delete it (the dashboard's confirmation). */
function GuestRooms({ rooms, failed, onDeleted }: { rooms: GmRoomSummary[]; failed: boolean; onDeleted: (id: string) => void }) {
  const [confirming, setConfirming] = useState<GmRoomSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(room: GmRoomSummary) {
    const token = loadGmToken();
    setDeleting(true);
    try {
      if (!token) throw new Error("no token");
      await api.legacy.removeRoom(token, room.id);
      onDeleted(room.id);
      setError(null);
    } catch {
      setError(t("dashboard.deleteFailed", { name: room.name || t("common.untitledRoom") }));
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
  }

  if (rooms.length === 0 && !failed) return null;
  return (
    <section className="room-section" aria-labelledby="guest-rooms-heading">
      <h2 id="guest-rooms-heading">{t("start.rooms.title")}</h2>
      {failed && <p role="alert" className="error">{t("start.rooms.loadFailed")}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <ul className="plain room-grid">
        {rooms.map((room) => {
          const name = room.name || t("common.untitledRoom");
          return (
            <li key={room.id} className="room-card">
              <div className="room-card-body">
                <strong className="room-card-name">{name}</strong>
                <span className="muted room-card-meta">
                  {t("dashboard.roomMeta", { preset: presetName(presetOf(room)), when: formatRelative(room.lastActiveAt) })}
                </span>
                <div className="row room-card-actions">
                  <button type="button" className="secondary small" onClick={() => navigate(`/r/${room.id}`)}>{t("common.open")}</button>
                  <button type="button" className="secondary small danger" onClick={() => setConfirming(room)} aria-label={t("common.deleteNamed", { name })}>
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <DeleteRoomModal room={confirming} deleting={deleting} onCancel={() => setConfirming(null)} onConfirm={(room) => void remove(room)} />
    </section>
  );
}
