import { useRef } from "react";
import type { GmRoomSummary } from "@vtt/shared";
import { t } from "../i18n/locale";
import { Modal } from "./Modal";

/**
 * The confirmation before a room is deleted for good (KAN-72, ADR 0009): the dashboard's, and the
 * start page's for a guest's rooms. The safe choice has focus. `room` null keeps it closed.
 */
export function DeleteRoomModal({ room, deleting, onCancel, onConfirm }: {
  room: GmRoomSummary | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: (room: GmRoomSummary) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const name = room?.name || t("common.untitledRoom");
  return (
    <Modal open={room !== null} title={t("common.deleteNamedQ", { name })} onClose={() => !deleting && onCancel()} initialFocus={cancelRef}>
      <p>
        <strong>{name}</strong> {t("dashboard.deleteBody")}
      </p>
      <p className="muted">{t("dashboard.deleteNote")}</p>
      <div className="row modal-actions">
        <button ref={cancelRef} type="button" className="secondary" onClick={onCancel} disabled={deleting}>
          {t("common.cancel")}
        </button>
        <button type="button" className="danger-fill" onClick={() => room && onConfirm(room)} disabled={deleting}>
          {deleting ? t("common.deleting") : t("dashboard.deleteRoom")}
        </button>
      </div>
    </Modal>
  );
}
