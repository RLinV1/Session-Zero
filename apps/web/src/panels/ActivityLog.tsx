import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowCounterClockwise } from "@phosphor-icons/react";
import { describeUndo, undoableAction, type HistoryResponse, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";

interface Props {
  roomId: string;
  token: string;
  seq: number;
  /** The GM's live state: its undo history says which entries can still be undone (ADR 0013). */
  state: RoomState;
  connection: RoomConnection;
}

/**
 * Mounted only for the GM. The endpoint independently enforces room membership/role.
 * Undo lives here, on the entry it reverses, so the GM always sees what they are undoing.
 */
export function ActivityLog({ open, onClose, ...props }: Props & { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Activity log" onClose={onClose}>
      {open && <History key={props.roomId} {...props} />}
    </Modal>
  );
}

/** The log itself: search, paging, and an Undo button on each action that can still be undone. */
function History({ roomId, token, seq, state, connection }: Props) {
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<HistoryResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedSeq, setLoadedSeq] = useState(seq);
  const latestSeq = useRef(seq);
  latestSeq.current = seq;
  const request = useRef<AbortController | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<{ commandId: string; message: string } | null>(null);

  /** Undoes one action, then refreshes so the undo's own entry and the Undone mark appear. */
  const undo = async (commandId: string) => {
    if (undoing) return;
    setUndoing(commandId);
    setUndoError(null);
    const result = await connection.command({ type: "history.undo", commandId });
    setUndoing(null);
    if (!result.ok) return setUndoError({ commandId, message: result.message });
    // Show the undo's own entry, and the original marked Undone.
    setRefresh((n) => n + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setPage(null);
    setError(null);
    const timer = window.setTimeout(() => {
      const atSeq = latestSeq.current;
      void api.history(roomId, token, search.trim(), undefined, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setPage(result);
        setLoadedSeq(atSeq);
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load activity.");
      }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      request.current?.abort();
    };
  }, [roomId, token, search, refresh]);

  const loadOlder = async () => {
    if (!page?.nextBefore || busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const older = await api.history(roomId, token, search.trim(), page.nextBefore, controller.signal);
      if (!controller.signal.aborted) setPage({ entries: [...page.entries, ...older.entries], nextBefore: older.nextBefore });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load activity.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  /** Newest entry of each action on this page (entries are newest first). */
  const firstSeq = new Map<string, number>();
  /** Actions this page shows as undone. */
  const undone = new Set<string>();
  for (const { committed } of page?.entries ?? []) {
    if (committed.commandId && !firstSeq.has(committed.commandId)) firstSeq.set(committed.commandId, committed.seq);
    if (committed.event.type === "ActionUndone") undone.add(committed.event.commandId);
  }

  return <div className="activity-log">
    <label htmlFor="activity-player">Search by player</label>
    <div className="activity-search">
      <input id="activity-player" type="search" maxLength={40} value={search}
        placeholder="Player or GM name" onChange={(e) => {
          request.current?.abort();
          setBusy(true);
          setSearch(e.target.value);
        }} />
      <button type="button" className="activity-refresh" aria-label="Refresh" title="Refresh"
        onClick={() => setRefresh((n) => n + 1)} disabled={busy}>
        <ArrowClockwise size={16} aria-hidden="true" />
      </button>
    </div>
    <p className="muted">Committed actions, newest first. Search uses names at the time of each action.</p>
    {seq > loadedSeq && <p role="status">New activity is available. Refresh to see it.</p>}
    {error && <p role="alert" className="error">{error} Try refreshing or loading older entries again.</p>}
    {busy && <p role="status">Loading activity…</p>}
    {page && page.entries.length === 0 && <p>No {search.trim() ? "matching " : ""}activity.</p>}
    <ol className="plain activity-entries" aria-busy={busy}>
      {page?.entries.map(({ committed, sentence }) => {
        const commandId = committed.commandId;
        // One action can span several entries (an editor save); its controls go on the newest.
        const newestOfAction = commandId !== undefined && firstSeq.get(commandId) === committed.seq;
        const action = newestOfAction ? undoableAction(state.undo, commandId) : undefined;
        const label = action ? `Undo ${describeUndo(action, state.tokens).verb}` : "";
        return <li key={committed.seq}>
          <div className="activity-entry-head">
            <p>{sentence}</p>
            {action && commandId && (
              <button type="button" className="secondary small activity-undo" aria-label={label} title={label}
                disabled={undoing !== null} onClick={() => void undo(commandId)}>
                <ArrowCounterClockwise size={14} aria-hidden="true" />
                {undoing === commandId ? "Undoing…" : "Undo"}
              </button>
            )}
            {newestOfAction && undone.has(commandId) && <span className="activity-undone">Undone</span>}
          </div>
          {undoError && undoError.commandId === commandId && newestOfAction && (
            <p role="alert" className="error">{undoError.message}</p>
          )}
          <small className="muted activity-meta"><time dateTime={committed.at}>{new Date(committed.at).toLocaleString()}</time> · #{committed.seq}</small>
        </li>;
      })}
    </ol>
    {page?.nextBefore && <button type="button" disabled={busy} onClick={() => void loadOlder()}>Load older</button>}
  </div>;
}
