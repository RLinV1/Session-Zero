import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ALREADY_MEMBER, type InviteSeatResponse } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { api, ApiError } from "../net/api";
import { gmRoomForInvite, guestRoomForInvite, newGuestToken, rememberInvite, saveCredentials } from "../net/identity";
import { ensureSeat } from "../net/seats";
import { navigate } from "../router";
import { joinFailure } from "./joinFailure";
import { t } from "../i18n/locale";
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
      setError(err instanceof Error ? err.message : t("join.openSeatFailed"));
      setBusy(false);
    }
  }

  if (seat) {
    return (
      <EntryPage>
        <div className="card">
          <h1>{t("join.alreadyHere.title")}</h1>
          <p className="muted">{t("join.alreadyHere.body")}</p>
          {error && <p role="alert" className="error">{error}</p>}
          <button type="button" className="primary" onClick={() => void resume(seat.roomId)} disabled={busy}>
            {busy ? t("join.opening") : t("join.resumeAs", { name: seat.displayName })}
          </button>
        </div>
      </EntryPage>
    );
  }

  if (gmRoomId) {
    return (
      <EntryPage>
        <div className="card">
          <h1>{t("join.gm.title")}</h1>
          <p className="muted">{t("join.gm.body")}</p>
          <button type="button" className="primary" onClick={() => navigate(`/r/${gmRoomId}`, { replace: true })}>
            {t("join.gm.back")}
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
        <h1>{t("join.title")}</h1>
        <label>
          {t("join.name")}
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
          {busy ? t("join.joining") : t("join.submit")}
        </button>
      </form>
    </EntryPage>
  );
}
