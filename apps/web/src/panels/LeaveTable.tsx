import { useRef, useState } from "react";
import { SignOut } from "@phosphor-icons/react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";

/**
 * Leave table (KAN-58, ADR 0006): a player gives up their seat for good.
 *
 * A small unfilled button beside "You are …": easy to find at rest, never the panel's primary
 * control. The confirmation says exactly what is lost before anything reaches the server,
 * and its safe choice has focus. On success the server ends every tab of this seat with
 * `sessionEnded`, so there is nothing to do here but wait for the room page to swap screens.
 */
export function LeaveTable({ connection, state, you }: { connection: RoomConnection; state: RoomState; you: Participant }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  // The player's filtered state: hidden tokens they own aren't here, and they can't lose
  // what they were never shown.
  const owned = Object.values(state.tokens)
    .filter((t) => t.ownerIds.includes(you.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  /** Closes the confirmation unless a leave is already in flight. */
  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
  };

  /** Sends `participant.leave`; success arrives as `sessionEnded`, so only a rejection is handled here. */
  async function leave() {
    setBusy(true);
    setError(null);
    const result = await connection.command({ type: "participant.leave" });
    // Success never resolves here as an ack: the socket is closed first and the page moves to
    // the session-ended screen. A rejection (or a dropped connection) keeps the player in.
    if (!result.ok && connection.snapshot.status !== "ended") {
      setError(result.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary small leave-table" onClick={() => setOpen(true)}>
        <SignOut size={14} aria-hidden="true" /> Leave table
      </button>
      <Modal open={open} title={`Leave ${state.name}?`} onClose={close} initialFocus={stayRef}>
        <div className="leave-confirm">
          <p>
            Leaving is permanent for <strong>{you.displayName}</strong> in this room. You lose:
          </p>
          <ul className="leave-losses">
            <li>Your seat and the name “{you.displayName}” here.</li>
            <li>
              {owned.length === 0 ? (
                "Nothing else: you don't control any tokens."
              ) : (
                <>
                  Control of {owned.length === 1 ? "your token" : `your ${owned.length} tokens`}:{" "}
                  {owned.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && ", "}
                      <strong>{t.name}</strong>
                    </span>
                  ))}
                  . The GM decides what happens to {owned.length === 1 ? "it" : "them"}.
                </>
              )}
            </li>
          </ul>
          <p className="muted">
            Every tab you have open on this room closes too. If you come back through the invite link, you join as a new
            player and the GM has to give you tokens again.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row modal-actions">
            <button ref={stayRef} type="button" className="secondary" onClick={close} disabled={busy}>
              Stay
            </button>
            <button type="button" className="danger-fill" onClick={() => void leave()} disabled={busy}>
              {busy ? "Leaving…" : "Leave table"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
