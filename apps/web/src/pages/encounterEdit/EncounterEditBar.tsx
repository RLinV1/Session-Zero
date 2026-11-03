import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_ENCOUNTER_NAME, type EncounterEditSession } from "@vtt/shared";
import { api } from "../../net/api";
import { forgetCredentials } from "../../net/identity";
import { navigate } from "../../router";
import { Modal } from "../../ui/Modal";
import { createRoomWith, RoomDetailsFields, roomDetailsReady, useRoomDetails } from "../RoomDetailsFields";

type Prompt = null | "name" | "close" | "discard" | "openUnsaved" | "openRoom";

/**
 * The top bar of a temporary room editing an encounter template (ADR 0033): which template,
 * whether it has unsaved changes, and Save, Open in a room, Discard and Close. Unsaved means the
 * room has committed events since the last save; leaving deletes the temporary room.
 */
export function EncounterEditBar({ roomId, seq, onLeaving }: {
  roomId: string;
  /** The room's latest seq; an edit moves it past the seq of the last save. */
  seq: number;
  /** Called before the room is deleted, so the page shows "Closing…" rather than "Room deleted". */
  onLeaving: () => void;
}) {
  const [session, setSession] = useState<EncounterEditSession | null>(null);
  /** The seq the template matches: when the room opened, then at each save. */
  const [savedSeq, setSavedSeq] = useState<number | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  /** Set synchronously, so a second click before `busy` re-renders the button sends no second save. */
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the name prompt was opened by Close's "Save", so naming then leaves. */
  const [pendingClose, setPendingClose] = useState(false);
  /** Open in a room's details: the new room's name starts as the template's, the GM's as the account's. */
  const [details, setDetails] = useRoomDetails();

  useEffect(() => {
    let live = true;
    api.library.encounterEdits.get(roomId).then(
      (found) => live && setSession(found),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Couldn't load this encounter"),
    );
    return () => {
      live = false;
    };
  }, [roomId]);
  useEffect(() => {
    if (savedSeq === null && seq > 0) setSavedSeq(seq);
  }, [seq, savedSeq]);

  const dirty = savedSeq !== null && seq > savedSeq;
  const isNew = session !== null && session.templateId === null;

  /** Saves the room to its template; a new template needs `withName`. True when saved. */
  async function save(withName?: string): Promise<boolean> {
    if (isNew && !withName) {
      setPrompt("name");
      return false;
    }
    if (saving.current) return false;
    saving.current = true;
    const at = seq;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.library.encounterEdits.save(roomId, withName ? { name: withName } : {});
      setSession((s) => (s ? { ...s, templateId: saved.id, templateName: saved.name } : s));
      setSavedSeq(at);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  /** Deletes the temporary room and goes to `to`: the library, or a room opened from the template. */
  async function leave(to = "/library") {
    setBusy(true);
    onLeaving();
    forgetCredentials(roomId);
    try {
      await api.rooms.remove(roomId);
    } catch {
      // The sweep deletes a temporary room left behind (ADR 0033); leaving still goes ahead.
    }
    navigate(to);
  }

  /** Open in a room: unsaved changes are saved or dropped first, so the room is the stored template. */
  function startOpen() {
    if (dirty) return setPrompt("openUnsaved");
    askRoomDetails();
  }
  function askRoomDetails() {
    setDetails((d) => ({ ...d, roomName: session?.templateName ?? d.roomName }));
    setError(null);
    setPrompt("openRoom");
  }
  async function openRoom(e: FormEvent) {
    e.preventDefault();
    const templateId = session?.templateId;
    if (!templateId || !roomDetailsReady(details)) return;
    setBusy(true);
    setError(null);
    try {
      const opened = await createRoomWith(details, templateId);
      await leave(`/r/${opened}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the room");
      setBusy(false);
    }
  }

  async function submitName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await save(trimmed)) {
      setPrompt(null);
      if (pendingClose) void leave();
    }
  }

  async function saveThenLeave() {
    if (isNew) {
      setPendingClose(true);
      setPrompt("name");
      return;
    }
    if (await save()) void leave();
  }

  const title = session?.templateName ?? (isNew ? "New encounter" : "Encounter template");

  return (
    <div className="encounter-edit-bar">
      <span className="encounter-edit-label">Editing template</span>
      <h1 className="room-title">{title}</h1>
      <span className={dirty ? "encounter-edit-state unsaved" : "encounter-edit-state"} role="status">
        {dirty ? "Unsaved changes" : "Saved"}
      </span>
      <button type="button" className="small primary" disabled={busy || !session} onClick={() => void save()}>
        {busy ? "Saving…" : "Save"}
      </button>
      {/* Only a saved template can start a room: the room is made from what is stored. */}
      {session && !isNew && (
        <button type="button" className="secondary small" disabled={busy} onClick={startOpen}>
          Open in a room
        </button>
      )}
      <button type="button" className="secondary small" disabled={busy} onClick={() => (dirty ? setPrompt("discard") : void leave())}>
        Discard
      </button>
      <button type="button" className="secondary small" disabled={busy} onClick={() => (dirty ? setPrompt("close") : void leave())}>
        Close
      </button>
      {error && <span role="alert" className="error">{error}</span>}

      <Modal open={prompt === "name"} title="Name this encounter" onClose={() => { setPrompt(null); setPendingClose(false); }}>
        <form className="stack" onSubmit={(e) => void submitName(e)}>
          <label>
            Template name
            <input value={name} maxLength={MAX_ENCOUNTER_NAME} autoFocus onChange={(e) => setName(e.target.value)} disabled={busy} />
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row button-row">
            <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => { setPrompt(null); setPendingClose(false); }}>Cancel</button>
          </div>
        </form>
      </Modal>
      <Modal open={prompt === "close"} title="Save changes?" onClose={() => setPrompt(null)}>
        <div className="stack">
          <p>This encounter has changes you haven't saved. Save them to the template, or discard them?</p>
          <div className="row button-row">
            <button type="button" className="primary" disabled={busy} onClick={() => { setPrompt(null); void saveThenLeave(); }}>Save</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void leave()}>Discard</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPrompt(null)}>Keep editing</button>
          </div>
        </div>
      </Modal>
      <Modal open={prompt === "openUnsaved"} title="Save before opening?" onClose={() => setPrompt(null)}>
        <div className="stack">
          <p>The room is made from the saved template. Save your changes first, or open it without them?</p>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row button-row">
            <button type="button" className="primary" disabled={busy} onClick={async () => { if (await save()) askRoomDetails(); }}>Save</button>
            <button type="button" className="secondary" disabled={busy} onClick={askRoomDetails}>Discard</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPrompt(null)}>Cancel</button>
          </div>
        </div>
      </Modal>
      <Modal open={prompt === "openRoom"} title="Open in a room" onClose={() => setPrompt(null)}>
        <form className="stack" onSubmit={(e) => void openRoom(e)}>
          <p className="muted">A new room starts from this template. The template stays as it is.</p>
          <RoomDetailsFields value={details} onChange={setDetails} disabled={busy} />
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row button-row">
            <button type="submit" className="primary" disabled={busy || !roomDetailsReady(details)}>{busy ? "Opening…" : "Open room"}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPrompt(null)}>Cancel</button>
          </div>
        </form>
      </Modal>
      <Modal open={prompt === "discard"} title="Discard changes?" onClose={() => setPrompt(null)}>
        <div className="stack">
          <p>Leave without saving? The template stays as it was last saved.</p>
          <div className="row button-row">
            <button type="button" className="primary" disabled={busy} onClick={() => void leave()}>Discard</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPrompt(null)}>Keep editing</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

