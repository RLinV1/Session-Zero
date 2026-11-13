import { useEffect, useId, useState, type FormEvent } from "react";
import { GearSix } from "@phosphor-icons/react";
import { BUILTIN_ROOM_DEFAULTS, RoomDefaults } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { api } from "../net/api";
import { Modal } from "../ui/Modal";
import { TableRuleControls } from "../ui/TableRuleControls";
import { t } from "../i18n/locale";

type Loaded = { status: "loading" } | { status: "failed" } | { status: "ready" };

/**
 * Room settings on the dashboard (gm-room-defaults, ADR 0066): the GM's defaults for the rooms
 * they create from now on. The same rule controls as a room's Table tab, plus the grid's distance
 * per square and unit label. Edits are a draft until Save; Cancel leaves what was saved.
 */
export function RoomSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const account = useAccount();
  const signedIn = account.status === "signedIn";
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [draft, setDraft] = useState<RoomDefaults>(BUILTIN_ROOM_DEFAULTS);
  /** The distance as typed, so a half-typed "1." or an empty box isn't rewritten under the cursor. */
  const [distanceText, setDistanceText] = useState(String(BUILTIN_ROOM_DEFAULTS.unitsPerCell));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const distanceId = useId();

  useEffect(() => {
    if (!open || !signedIn) return;
    let live = true;
    setLoaded({ status: "loading" });
    setError(null);
    api.roomDefaults.get().then(
      (saved) => {
        if (!live) return;
        setDraft(saved);
        setDistanceText(String(saved.unitsPerCell));
        setLoaded({ status: "ready" });
      },
      () => live && setLoaded({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [open, signedIn]);

  function close() {
    if (busy) return;
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const candidate = RoomDefaults.safeParse({ ...draft, unitsPerCell: distanceText.trim() === "" ? NaN : Number(distanceText) });
    if (!candidate.success) {
      const field = candidate.error.issues[0]?.path[0];
      return setError(field === "unitLabel" ? t("roomSettings.invalidLabel") : t("roomSettings.invalidDistance"));
    }
    setBusy(true);
    setError(null);
    try {
      await api.roomDefaults.save(candidate.data);
      setBusy(false);
      onClose();
    } catch {
      // The form stays as it was, so nothing typed is lost.
      setError(t("roomSettings.saveFailed"));
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={t("roomSettings.title")} onClose={close} className="room-settings-modal">
      {!signedIn ? (
        <p>{t("roomSettings.signIn")}</p>
      ) : loaded.status === "failed" ? (
        <p role="alert" className="error">{t("roomSettings.loadFailed")}</p>
      ) : (
        <form className="stack room-settings" onSubmit={onSubmit} aria-busy={loaded.status === "loading" || busy}>
          <p className="muted small-print">{t("roomSettings.note")}</p>
          <TableRuleControls value={draft} disabled={loaded.status !== "ready" || busy} onChange={(change) => setDraft((d) => ({ ...d, ...change }))} />
          <div className="room-settings-distance">
            <label htmlFor={distanceId}>{t("roomSettings.distancePerSquare")}</label>
            <input id={distanceId} type="number" inputMode="decimal" step="any" min="0" value={distanceText}
              disabled={loaded.status !== "ready" || busy} onChange={(e) => setDistanceText(e.target.value)} />
            <span aria-hidden="true">{draft.unitLabel}</span>
          </div>
          <label>{t("roomSettings.unitLabel")}
            <input type="text" maxLength={12} value={draft.unitLabel} disabled={loaded.status !== "ready" || busy}
              onChange={(e) => setDraft((d) => ({ ...d, unitLabel: e.target.value }))} />
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={close} disabled={busy}>{t("common.cancel")}</button>
            <button type="submit" className="primary" disabled={loaded.status !== "ready" || busy}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** The gear in the hub header's row of settings (dashboard and library) that opens Room settings. */
export function RoomSettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-button" onClick={() => setOpen(true)} aria-label={t("roomSettings.title")} title={t("roomSettings.title")}>
        <GearSix aria-hidden="true" />
      </button>
      <RoomSettings open={open} onClose={() => setOpen(false)} />
    </>
  );
}
