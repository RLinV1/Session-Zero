import { createContext, useContext, useEffect, useState } from "react";
import { GUEST_ROOM_IDLE_DAYS, type GuestRoomStatus } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { Link } from "../Link";
import { api } from "../net/api";
import { navigate } from "../router";
import { t } from "../i18n/locale";

/** Where "Save to a free account" goes: sign-up, then the dashboard's offer to move this browser's rooms. */
export const SAVE_ACCOUNT_HREF = `/signup?next=${encodeURIComponent("/gm-dashboard?save=1")}`;

const NOT_GUEST: GuestRoomStatus = { guest: false, idleDays: GUEST_ROOM_IDLE_DAYS };
const GuestRoomContext = createContext<GuestRoomStatus>(NOT_GUEST);
export const GuestRoomProvider = GuestRoomContext.Provider;

/** True in a guest room (guest-gm-hosting): built-in art only, nothing stored for the GM. */
export const useGuestRoom = () => useContext(GuestRoomContext).guest;

/** True when this GM's account library can be used here: signed in, and the room is not a guest room. */
export function useAccountLibrary() {
  return useAccount().status === "signedIn" && !useGuestRoom();
}

/**
 * Asked once per visit, of the GM only: only the server knows who owns the room. A failed read
 * counts as "not a guest room", so the controls stay as they are and the server still decides.
 */
export function useGuestStatus(roomId: string, token: string | null, isGm: boolean): GuestRoomStatus {
  const [status, setStatus] = useState<GuestRoomStatus>(NOT_GUEST);
  useEffect(() => {
    if (!token || !isGm) return;
    let live = true;
    api.rooms.guestStatus(roomId, token).then(
      (next) => live && setStatus(next),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [roomId, token, isGm]);
  return status;
}

/** What a guest room shows in place of a control that needs a free account. */
export function FreeAccountNote() {
  return (
    <p className="muted small-print guest-note">
      {t("guest.freeAccount")} <Link href={SAVE_ACCOUNT_HREF}>{t("guest.createAccount")}</Link>
    </p>
  );
}

/** The GM's one-line explanation of a guest room, dismissed for this visit. */
export function GuestRoomNotice() {
  const { guest, idleDays } = useContext(GuestRoomContext);
  const [dismissed, setDismissed] = useState(false);
  if (!guest || dismissed) return null;
  return (
    <div className="board-notice guest-room-notice">
      <p>
        <strong>{t("guest.noticeTitle")}</strong> {t("guest.noticeBody", { days: idleDays })}
      </p>
      <div className="row">
        <button type="button" className="small primary" onClick={() => navigate(SAVE_ACCOUNT_HREF)}>{t("guest.save")}</button>
        <button type="button" className="secondary small" onClick={() => setDismissed(true)}>
          {t("common.notNow")}
        </button>
      </div>
    </div>
  );
}
