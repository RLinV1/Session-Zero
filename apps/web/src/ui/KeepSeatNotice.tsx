import { useState } from "react";
import { useAccount } from "../account/accountStore";
import { api } from "../net/api";
import { loadCredentials, saveCredentials } from "../net/identity";

/**
 * Offered inside the room to a signed-in person whose seat here is still a guest seat, for
 * example after signing in from the Dice tab mid-game (room-membership: Keep a guest seat). Only
 * this room's seat, only when they choose it, and the same participant afterwards. "Not now"
 * hides it for this visit.
 */
export function KeepSeatNotice({ roomId, token, name }: { roomId: string; token: string; name: string }) {
  const account = useAccount();
  const [kept, setKept] = useState(() => loadCredentials(roomId)?.viaAccount === true);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (account.status !== "signedIn" || kept || dismissed) return null;

  async function keep() {
    setBusy(true);
    setError(null);
    try {
      await api.rooms.keep(roomId, token);
      const stored = loadCredentials(roomId);
      if (stored) saveCredentials({ ...stored, viaAccount: true });
      setKept(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your seat could not be kept. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="board-notice keep-seat-notice">
      <p>
        <strong>Keep this seat on your account?</strong> Then you can come back as {name} from any device you sign in on.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="small primary" onClick={() => void keep()} disabled={busy}>
          {busy ? "Keeping…" : "Keep seat"}
        </button>
        <button type="button" className="secondary small" onClick={() => setDismissed(true)} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}
