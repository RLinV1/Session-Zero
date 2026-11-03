import { useRef, useState } from "react";
import { MAX_PLAYERS_PER_ROOM, isActive, pendingDepartures, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { inkOn } from "./color";
import { Modal } from "./Modal";
import { PopoverButton } from "./Popover";

/**
 * Who is in the room, on demand (room-sidebar-layout: Participants on demand).
 *
 * The list is reference information, not something anyone acts on mid-encounter, so it no
 * longer takes a permanent slot in the sidebar. `participants` comes from the server's
 * filtered snapshot; nothing here is persisted. Active participants are listed first, then players
 * who left on their own, marked AFK (KAN-73). Only active ones are counted.
 *
 * The GM also gets Remove on each player (FR-GM-20), and how many of the room's player seats are
 * taken (room-player-cap): the GM is the one who can free a seat. The confirmation is a sibling of the
 * popover, not inside it: the popover closes on any press outside itself, and that would
 * unmount a modal living in it.
 */
export function ParticipantsButton({
  state,
  you,
  connection,
  onReviewDeparture,
  onViewAs,
  viewingAs,
  readOnly = false,
}: {
  state: RoomState;
  you: Participant;
  connection: RoomConnection;
  /** Opens the token review for a participant who is no longer in the room. */
  onReviewDeparture: (participantId: string) => void;
  /** GM only: preview the room as this player (gm-view-as-player). */
  onViewAs?: (participantId: string) => void;
  viewingAs?: string | null;
  /** The GM is previewing as a player (gm-view-as-player): nothing here may change the room. */
  readOnly?: boolean;
}) {
  // Someone who left or was removed stays in state for history, but is no longer here (ADR 0006).
  const participants = Object.values(state.participants).filter(isActive);
  const away = awayParticipants(state);
  const count = participants.length;
  const [removing, setRemoving] = useState<Participant | null>(null);
  const isGm = you.role === "gm";
  // A Remove dialog that was open when the preview started closes with it.
  if (readOnly && removing) setRemoving(null);

  return (
    <>
      <PopoverButton
        label={`Participants, ${count}`}
        title="Participants"
        tourId="participants"
        buttonContent={<AvatarStack participants={participants} />}
      >
        {/* Above the list: in a full room the list scrolls, and the count must not scroll away. */}
        {isGm && <p className="muted small-print participant-seats">{playerSeats(participants)}</p>}
        <ul className="plain participant-list">
          {participants.map((p) => (
            <li key={p.id}>
              <span className="participant-name">{p.displayName}</span>
              {p.role === "gm" && <span className="badge">GM</span>}
              {isGm && p.role === "player" && onViewAs && (
                <button
                  type="button"
                  className="link participant-view-as"
                  aria-label={`View the room as ${p.displayName}`}
                  aria-pressed={viewingAs === p.id}
                  onClick={() => onViewAs(p.id)}
                >
                  View as
                </button>
              )}
              {isGm && !readOnly && p.role === "player" && p.diceLook && (
                <button
                  type="button"
                  className="link participant-reset-dice"
                  aria-label={`Put ${p.displayName}'s dice back to classic`}
                  title="Their dice look stays in their library; this room shows classic dice for them."
                  onClick={() => void connection.command({ type: "participant.clearDiceLook", participantId: p.id })}
                >
                  Reset dice
                </button>
              )}
              {isGm && !readOnly && p.role === "player" && (
                <button
                  type="button"
                  className="link danger participant-remove"
                  aria-label={`Remove ${p.displayName} from the room`}
                  onClick={() => setRemoving(p)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
          {away.map((p) => (
            <li key={p.id} className="participant-away">
              <span className="participant-name">{p.displayName}</span>
              <span className="badge">AFK</span>
            </li>
          ))}
        </ul>
      </PopoverButton>
      {isGm && !readOnly && (
        <RemoveParticipant
          connection={connection}
          state={state}
          target={removing}
          onClose={() => setRemoving(null)}
          onRemoved={(id) => {
            setRemoving(null);
            onReviewDeparture(id);
          }}
        />
      )}
    </>
  );
}

/** Players who left on their own, in join order. A removed (revoked) player is not away (KAN-73). */
export function awayParticipants(state: RoomState): Participant[] {
  return Object.values(state.participants).filter((p) => p.left === true && !p.revoked);
}

/** "Remove Sam from this room?" Names the player and says what happens to their tokens and the link. */
function RemoveParticipant({
  connection,
  state,
  target,
  onClose,
  onRemoved,
}: {
  connection: RoomConnection;
  state: RoomState;
  target: Participant | null;
  onClose: () => void;
  /** Called after a successful remove when the player still owns tokens, to open their review. */
  onRemoved: (participantId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const owned = target ? Object.values(state.tokens).filter((t) => t.ownerIds.includes(target.id)).length : 0;

  /** Closes the confirmation unless a removal is in flight. */
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  /** Sends `participant.revoke`, then opens the token review if the player still owns tokens. */
  async function remove() {
    if (!target) return;
    setBusy(true);
    setError(null);
    const result = await connection.command({ type: "participant.revoke", participantId: target.id });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    // Read the pending list from the connection, not this render: it's already reduced there.
    const latest = connection.snapshot.state;
    const pending = latest ? pendingDepartures(latest).some((d) => d.participant.id === target.id) : false;
    if (pending) onRemoved(target.id);
    else onClose();
  }

  return (
    <Modal open={!!target} title={target ? `Remove ${target.displayName} from this room?` : "Remove"} onClose={close} initialFocus={cancelRef}>
      {target && (
        <div className="leave-confirm">
          <p>
            <strong>{target.displayName}</strong> is disconnected straight away, on every device, and can't come back
            with this seat.
          </p>
          <p>
            {owned === 0
              ? "They don't control any tokens."
              : `Their ${owned === 1 ? "token stays" : `${owned} tokens stay`} on the board under your control, and you choose what happens to ${owned === 1 ? "it" : "them"} next.`}
          </p>
          <p className="muted">
            They can still join again as a new player with the current invite link. To stop that, reset the link from
            Share.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row modal-actions">
            <button ref={cancelRef} type="button" className="secondary" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="danger-fill" onClick={() => void remove()} disabled={busy}>
              {busy ? "Removing…" : `Remove ${target.displayName}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Player colours for avatars; the GM always gets the accent. Picked by join order, which every
 * viewer shares, so a player is the same colour on every screen and neighbours never match.
 */
const AVATAR_COLORS = ["#3b82c4", "#3f9d5b", "#c9892b", "#b0487a", "#2f9aa0", "#7a64c8"];
const MAX_AVATARS = 5;

/** The initials take whichever ink reads at 4.5:1 on the fill; the GM's accent keeps the CSS white. */
function avatarStyle(p: Participant, playerIndex: number) {
  // "GM" says who it is; rust is kept for the one main action and the active turn (design-language).
  if (p.role === "gm") return { background: "var(--raised)", color: "var(--text)", boxShadow: "0 0 0 2px var(--panel), inset 0 0 0 1px var(--border-strong)" };
  const fill = AVATAR_COLORS[playerIndex % AVATAR_COLORS.length]!;
  return { background: fill, color: inkOn(fill) };
}

function initials(p: Participant) {
  if (p.role === "gm") return "GM";
  const words = p.displayName.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Who is here at a glance, as the top bar's participants button (the list opens on click). */
function AvatarStack({ participants }: { participants: Participant[] }) {
  const players = participants.filter((p) => p.role !== "gm");
  const shown = participants.slice(0, MAX_AVATARS);
  const extra = participants.length - shown.length;
  return (
    <span className="avatar-stack" aria-hidden>
      {shown.map((p) => (
        <span key={p.id} className="avatar" style={avatarStyle(p, players.indexOf(p))} title={p.displayName}>
          {initials(p)}
        </span>
      ))}
      {extra > 0 && <span className="avatar avatar-more">+{extra}</span>}
    </span>
  );
}

/** "12 of 32 player seats taken", from the active participants; the GM's seat is not counted (room-player-cap). */
export function playerSeats(active: readonly Participant[]) {
  const taken = active.filter((p) => p.role === "player").length;
  return `${taken} of ${MAX_PLAYERS_PER_ROOM} player seats taken`;
}
