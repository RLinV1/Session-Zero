import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ALREADY_MEMBER, type InviteSeatResponse } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { api, ApiError } from "../net/api";
import { gmRoomForInvite, guestRoomForInvite, newGuestToken, rememberInvite, saveCredentials } from "../net/identity";
import { ensureSeat } from "../net/seats";
import { navigate } from "../router";
import { joinFailure } from "./joinFailure";
import { EntryPage } from "../ui/SiteHeader";

/**
 * Join from a shareable link (FR-PL-01). No account needed, and none is asked for or promoted
 * here (§13.1). Returning guests skip straight to the room (FR-PL-02). A signed-in person who
 * already has a seat in this room is offered "Resume as …" instead of a second seat
 * (room-membership).
 */
export function JoinPage({ inviteCode }: { inviteCode: string }) {
  const account = useAccount();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** False for a full room: the message is not about the name (room-player-cap). */
  const [nameIsCause, setNameIsCause] = useState(true);
  const [busy, setBusy] = useState(false);
  const [seat, setSeat] = useState<InviteSeatResponse | null>(null);
  const gmRoomId = useMemo(() => gmRoomForInvite(inviteCode), [inviteCode]);

  useEffect(() => {
    const existing = guestRoomForInvite(inviteCode);
    if (existing) navigate(`/r/${existing}`, { replace: true });
  }, [inviteCode]);

  useEffect(() => {
    if (account.status !== "signedIn") return;
    let live = true;
    api.inviteSeat(inviteCode).then(
      (found) => live && setSeat(found),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [account.status, inviteCode]);

  async function resume(roomId: string) {
    setBusy(true);
    try {
      await ensureSeat(roomId);
      navigate(`/r/${roomId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open your seat");
      setBusy(false);
    }
  }

  if (seat) {
    return (
      <EntryPage>
        <div className="card">
          <h1>You're already at this table</h1>
          <p className="muted">Your seat is kept on your account, so you can pick up where you left off.</p>
          {error && <p role="alert" className="error">{error}</p>}
          <button type="button" className="primary" onClick={() => void resume(seat.roomId)} disabled={busy}>
            {busy ? "Opening…" : `Resume as ${seat.displayName}`}
          </button>
        </div>
      </EntryPage>
    );
  }

  if (gmRoomId) {
    return (
      <EntryPage>
        <div className="card">
          <h1>You're the GM of this room</h1>
          <p className="muted">
            This browser is signed in as the room's GM, so it can't also join as a player. Share this
            link with your players. To test as a player yourself, open it in a private window, another
            browser, or another device.
          </p>
          <button type="button" className="primary" onClick={() => navigate(`/r/${gmRoomId}`, { replace: true })}>
            Back to GM view
          </button>
        </div>
      </EntryPage>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const guestToken = newGuestToken();
      const joined = await api.joinRoom(inviteCode, { displayName, guestToken });
      // Signed in, the seat is kept on the account and bound to this device's sign-in (ADR 0017 M4).
      saveCredentials({ ...joined, guestToken, ...(account.status === "signedIn" && { viaAccount: true }) });
      rememberInvite(inviteCode, joined.roomId);
      navigate(`/r/${joined.roomId}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.detail.code === ALREADY_MEMBER) {
        // Joined from another tab or device meanwhile: offer that seat instead.
        const found = await api.inviteSeat(inviteCode).catch(() => null);
        if (found) {
          setSeat(found);
          setBusy(false);
          return;
        }
      }
      const failure = joinFailure(err);
      setError(failure.message);
      setNameIsCause(failure.nameIsCause);
      setBusy(false);
    }
  }

  return (
    <EntryPage>
      <form className="card" onSubmit={onSubmit}>
        <h1>Join the table</h1>
        <label>
          Your name
          <input
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setError(null);
            }}
            aria-invalid={error && nameIsCause ? true : undefined}
            aria-describedby={error && nameIsCause ? "join-error" : undefined}
            required
            maxLength={40}
            autoFocus
            autoComplete="nickname"
          />
        </label>
        {error && <p id="join-error" role="alert" className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
    </EntryPage>
  );
}
