import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus } from "@phosphor-icons/react";
import { presetOf } from "@vtt/shared";
import type { EncounterSummary, GmRoomSummary, LegacySummary, MyRoomsResponse } from "@vtt/shared";
import { AccountMenu } from "../account/AccountPages";
import { RequireAccount } from "../account/RequireAccount";
import { api, ApiError } from "../net/api";
import { forgetGmToken } from "../net/identity";
import { legacyOffer } from "../net/legacy";
import { ensureSeat } from "../net/seats";
import { navigate } from "../router";
import { Modal } from "../ui/Modal";
import { DeleteRoomModal } from "../ui/DeleteRoomModal";
import { formatRelative } from "../ui/formatRelative";
import { EmptyState } from "../ui/EmptyState";
import { RoomBoardPreview } from "../ui/RoomBoardPreview";
import { HubNav, SiteHeader } from "../ui/SiteHeader";
import { createRoomWith, RoomDetailsFields, useRoomDetails } from "./RoomDetailsFields";
import { RoomSettingsButton } from "./RoomSettings";
import { t } from "../i18n/locale";

import { presetName } from "../i18n/labels";
/**
 * The signed-in person's place outside a room (gm-dashboard, room-membership): create a room,
 * reopen any room they host or play in from any device, reach the library. Every way in is a
 * plain link, and `RequireAccount` applies the one entry rule.
 */
export function GmDashboardPage() {
  return (
    <RequireAccount>
      <Dashboard />
    </RequireAccount>
  );
}

type RoomsState = { status: "loading" } | { status: "loaded"; rooms: MyRoomsResponse } | { status: "failed" };

function Dashboard() {
  const [rooms, setRooms] = useState<RoomsState>({ status: "loading" });
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let live = true;
    api.me.rooms().then(
      (loaded) => live && setRooms({ status: "loaded", rooms: loaded }),
      () => live && setRooms({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [refresh]);

  return (
    <>
    <div className="page-shell page-bar">
      <SiteHeader
        nav={<HubNav current="rooms" />}
        account={<AccountMenu />}
        settings={<RoomSettingsButton />}
      />
    </div>
    <main className="page-shell home gm-page">
      <h1>{t("dashboard.title")}</h1>
      <LegacyMoveBanner onMoved={() => setRefresh((n) => n + 1)} />
      <div className="dashboard-grid">
        <div className="room-sections">
          <HostingCard state={rooms} onDeleted={(id) => setRooms((s) => withoutRoom(s, id))} onCreate={() => setCreating(true)} />
          <PlayingCard state={rooms} />
        </div>
      </div>
      <CreateRoom open={creating} onClose={() => setCreating(false)} />
      <p className="muted small-print">{t("dashboard.savedNote")}</p>
    </main>
    </>
  );
}

function withoutRoom(state: RoomsState, id: string): RoomsState {
  if (state.status !== "loaded") return state;
  return { status: "loaded", rooms: { ...state.rooms, hosting: state.rooms.hosting.filter((r) => r.id !== id) } };
}

/** Hosting needs the account, which the session cookie carries; the GM seat is kept on it too. */
function CreateRoom({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [details, setDetails] = useRoomDetails();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The GM's saved encounters, offered as a starting board (encounter-templates, FR-GM-13). */
  const [templates, setTemplates] = useState<EncounterSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  /** The Room name input, so the modal opens with the cursor where typing starts. */
  const focusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let live = true;
    // Best effort: with no templates, or a failed load, the form is just the plain one.
    api.library.encounters.list().then((list) => live && setTemplates(list.filter((t) => t.mapName !== null)), () => {});
    return () => {
      live = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      navigate(`/r/${await createRoomWith(details, templateId || undefined)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.createFailed"));
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} title={t("dashboard.createTitle")} onClose={close} initialFocus={focusRef} className="create-room-modal">
      <form className="create-room" onSubmit={onSubmit}>
        <div className="create-room-fields" ref={(el) => { focusRef.current = el?.querySelector("input") ?? null; }}>
          <RoomDetailsFields value={details} onChange={setDetails} />
        </div>
        {templates.length > 0 && (
          <label>
            {t("dashboard.fromTemplate")}
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">{t("dashboard.emptyRoom")}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="row modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? t("common.creating") : t("dashboard.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Opens a room on this device: the seat it already has, or the account's seat resumed here
 * (room-membership). A refusal is shown on the card instead of opening a room that won't let us in.
 */
function useOpenRoom() {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function open(room: GmRoomSummary) {
    setOpening(room.id);
    setError(null);
    try {
      await ensureSeat(room.id);
      navigate(`/r/${room.id}`);
    } catch (err) {
      setError(t("dashboard.openFailed", { name: room.name || t("common.untitledRoom"), detail: err instanceof Error ? err.message : "" }).trim());
      setOpening(null);
    }
  }
  return { open, opening, error };
}

/**
 * One room, as a card: its name in full, its game and when it was last active, and the way in.
 * Open stays neutral because a list of rooms has no single main action (design-language). A
 * hosted room's card leads with a picture of its board, which also opens it; keyboard and screen
 * reader users have the Open button, so the picture is left out of the tab order.
 */
function RoomCard(props: { room: GmRoomSummary; opening: boolean; preview?: boolean; onOpen: () => void; onDelete?: () => void }) {
  const name = props.room.name || t("common.untitledRoom");
  return (
    <li className={props.preview ? "room-card has-preview" : "room-card"}>
      {props.preview && (
        <button type="button" className="room-card-preview" onClick={props.onOpen} disabled={props.opening} tabIndex={-1} aria-hidden="true">
          <RoomBoardPreview roomId={props.room.id} />
        </button>
      )}
      <div className="room-card-body">
        <strong className="room-card-name">{name}</strong>
        <span className="muted room-card-meta">
          {t("dashboard.roomMeta", { preset: presetName(presetOf(props.room)), when: formatRelative(props.room.lastActiveAt) })}
        </span>
        <div className="row room-card-actions">
          <button type="button" className="secondary small" onClick={props.onOpen} disabled={props.opening}>
            {props.opening ? t("common.opening") : t("common.open")}
          </button>
          {props.onDelete && (
            <button type="button" className="secondary small danger" onClick={props.onDelete} aria-label={t("common.deleteNamed", { name })}>
              {t("common.delete")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Rooms the account owns. */
function HostingCard({ state, onDeleted, onCreate }: { state: RoomsState; onDeleted: (id: string) => void; onCreate: () => void }) {
  const { open, opening, error } = useOpenRoom();
  /** The room awaiting delete confirmation. */
  const [confirming, setConfirming] = useState<GmRoomSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteRoom(room: GmRoomSummary) {
    setDeleting(true);
    try {
      await api.rooms.remove(room.id);
      // Only after the server confirms: a failed delete must leave the row where it was.
      onDeleted(room.id);
      setDeleteError(null);
    } catch {
      setDeleteError(t("dashboard.deleteFailed", { name: room.name || t("common.untitledRoom") }));
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
  }

  const hosting = state.status === "loaded" ? state.rooms.hosting : [];
  return (
    <section className="room-section" aria-labelledby="hosting-heading" aria-busy={state.status === "loading"}>
      {/* Creating a room sits with the rooms it adds to. */}
      <div className="room-section-head">
        <h2 id="hosting-heading">{t("dashboard.hosting")}</h2>
        <button type="button" className="primary" onClick={onCreate}>
          <Plus size={16} aria-hidden /> {t("dashboard.create")}
        </button>
      </div>
      {state.status === "loading" && (
        // Cards shaped like the rooms that will replace them, not a spinner.
        <ul className="plain room-grid" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="room-card has-preview skeleton" />
          ))}
        </ul>
      )}
      {state.status === "failed" && (
        <p role="alert" className="error">
          {t("dashboard.loadFailed")}
        </p>
      )}
      {(error || deleteError) && (
        <p role="alert" className="error">
          {error ?? deleteError}
        </p>
      )}
      {state.status === "loaded" && hosting.length === 0 && (
        <EmptyState
          picture="empty-rooms"
          action={
            <button type="button" onClick={onCreate}>
              {t("dashboard.createTitle")}
            </button>
          }
        >
          {t("dashboard.none")}
        </EmptyState>
      )}
      {hosting.length > 0 && (
        <ul className="plain room-grid">
          {hosting.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              opening={opening === room.id}
              preview
              onOpen={() => void open(room)}
              onDelete={() => setConfirming(room)}
            />
          ))}
        </ul>
      )}
      <DeleteRoomModal room={confirming} deleting={deleting} onCancel={() => setConfirming(null)} onConfirm={(room) => void deleteRoom(room)} />
    </section>
  );
}

/** Rooms where the account holds an active player seat. Left out entirely when there are none. */
function PlayingCard({ state }: { state: RoomsState }) {
  const { open, opening, error } = useOpenRoom();
  if (state.status !== "loaded" || state.rooms.playing.length === 0) return null;
  return (
    <section className="room-section" aria-labelledby="playing-heading">
      <h2 id="playing-heading">{t("dashboard.playing")}</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="plain room-grid">
        {state.rooms.playing.map((room) => (
          <RoomCard key={room.id} room={room} opening={opening === room.id} onOpen={() => void open(room)} />
        ))}
      </ul>
    </section>
  );
}

type LegacyState =
  | { status: "none" }
  | { status: "offer"; summary: LegacySummary }
  | { status: "moving"; summary: LegacySummary }
  | { status: "moved"; summary: LegacySummary }
  | { status: "failed"; summary: LegacySummary; message: string };

/**
 * A browser that still holds a GM token from before accounts is offered, here and only when the
 * person chooses, to move what that token owns into the account (gm-dashboard, ADR 0017 O2).
 * A token the server no longer knows is forgotten without asking (gm-identity-recovery).
 */
function LegacyMoveBanner({ onMoved }: { onMoved: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<LegacyState>({ status: "none" });
  const [dismissed, setDismissed] = useState(false);
  // Read during render, before any effect strips it, so StrictMode's second effect run still sees it.
  const [save] = useState(() => new URLSearchParams(location.search).get("save") === "1");

  useEffect(() => {
    let live = true;
    // "Save to a free account" lands here with ?save=1: move at once, then drop the flag.
    const params = new URLSearchParams(location.search);
    if (params.has("save")) {
      params.delete("save");
      const rest = params.toString();
      history.replaceState(history.state, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
    }
    void legacyOffer().then((offer) => {
      // Under StrictMode the first run's `live` is false by now, so only one run ever claims.
      if (!live || !offer) return;
      setToken(offer.token);
      setState({ status: "offer", summary: offer.summary });
      if (save) void move(offer.token, offer.summary);
    });
    return () => {
      live = false;
    };
  }, []);

  async function move(claimToken: string, summary: LegacySummary) {
    setState({ status: "moving", summary });
    try {
      const moved = await api.legacy.claim(claimToken);
      forgetGmToken();
      setState({ status: "moved", summary: moved });
      onMoved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        forgetGmToken();
        setState({ status: "none" });
        return;
      }
      setState({ status: "failed", summary, message: err instanceof Error ? err.message : t("common.tryAgain") });
    }
  }

  if (state.status === "none" || dismissed) return null;
  if (state.status === "moved") {
    return (
      <p role="status" className="notice">
        {t("dashboard.legacy.moved", { what: describeCounts(state.summary) })}
      </p>
    );
  }
  return (
    <section className="notice legacy-move" aria-labelledby="legacy-move-heading">
      <h2 id="legacy-move-heading">{t("dashboard.legacy.title")}</h2>
      <p>
        {t("dashboard.legacy.body", { what: describeCounts(state.summary) })}
      </p>
      {state.status === "failed" && (
        <p role="alert" className="error">
          {t("dashboard.legacy.failed", { message: state.message })}
        </p>
      )}
      <div className="row">
        <button type="button" className="primary" onClick={() => token && void move(token, state.summary)} disabled={state.status === "moving"}>
          {state.status === "moving" ? t("common.moving") : t("dashboard.legacy.move")}
        </button>
        <button type="button" className="secondary" onClick={() => setDismissed(true)} disabled={state.status === "moving"}>
          {t("common.notNow")}
        </button>
      </div>
    </section>
  );
}

function describeCounts(s: LegacySummary): string {
  const parts = [
    [s.rooms, "dashboard.legacy.room"],
    [s.assets, "dashboard.legacy.asset"],
    [s.creatures, "dashboard.legacy.creature"],
    [s.diceLooks, "dashboard.legacy.diceLook"],
  ] as const;
  return t("dashboard.legacy.list", { items: parts.filter(([n]) => n > 0).map(([n, key]) => t(key, { n })) });
}

