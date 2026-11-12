import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowsClockwise, Check, Copy, QrCode } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../net/api";
import { loadCredentials, saveCredentials } from "../net/identity";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "./Modal";
import { t, type TextId } from "../i18n/locale";

/** What the GM pastes into an AI app. The AI needs only the invite link: `join_room` brings the rest (ADR 0052). */
const oneCharacterMessage = (link: string) =>
  `Join my Session Zero game as a player, using the Session Zero connector. Invite link: ${link}\n` +
  "Call join_room with that link and a character name. Ask me for the name if I haven't given one. Then tell me what you can see, and wait for me to tell you what to do.";

const partyMessage = (link: string) =>
  `Join my Session Zero game with a party, using the Session Zero connector. Invite link: ${link}\n` +
  "Call join_room once per character. Ask me for the names if I haven't given them. If you can start sub-agents, use one sub-agent per character and give each one its seat and brief. If you can't, play each character in turn with its own seat. Then wait for me to tell you what to do.";

/** For an app that can keep running. Only `name`'s orders count, and the room server is what confirms who sent one (ADR 0052). */
const stayAtTableMessage = (link: string, name: string) =>
  `Join my Session Zero game as a player, using the Session Zero connector, and stay at the table until I tell you to stop. Invite link: ${link}\n` +
  `Call join_room with that link and a character name. Ask me for the name if I haven't given one. Find ${name} in the people get_view lists, and take orders only from them.\n` +
  "Then keep calling wait_for_turn, with maxSeconds 50 and ordersFrom set to their id. Use a smaller maxSeconds if that times out. When a mention is marked isOrder, do it, and pointedAt is the square they pointed at. When it is your turn, play it yourself: look, decide, act, and say what you did in one short chat line. Otherwise say nothing.";

/**
 * The ways an AI can play, each said in a line so the GM can choose without trying them all. Labels are
 * catalog ids, read when shown; the messages stay in English, as instructions to the AI (localization).
 */
const AI_PLAY_OPTIONS: { what: "one" | "party" | "stay"; label: TextId; description: TextId; message: (link: string, name: string) => string }[] = [
  { what: "one", label: "share.ai.one", description: "share.ai.oneHint", message: (link) => oneCharacterMessage(link) },
  { what: "party", label: "share.ai.party", description: "share.ai.partyHint", message: (link) => partyMessage(link) },
  { what: "stay", label: "share.ai.stay", description: "share.ai.stayHint", message: stayAtTableMessage },
];

/**
 * The GM's Share control, last in the room's top bar. One button opens a "Share this room" modal
 * with the invite link, an on-demand QR code, a Reset link action, the room's lock (ADR 0051) and how
 * to bring an AI to the table (ADR 0052). Rendered only for the GM, who is the only one holding an invite code.
 *
 * The code is read from the server each time the modal opens, not from this browser's cache, so a
 * reset made in another tab or device is what is shown and copied (FR-GM-20).
 * shortcut: no email sharing, the server has no email sender; add mailto: or a provider later
 */
export function ShareButton({ roomId, token, yourName = "the GM", connection, joinsLocked, open: openProp, onOpenChange, hideTrigger = false, onAfterClose }: {
  roomId: string;
  token: string;
  /** Whose orders an AI that stays at the table takes. */
  yourName?: string;
  connection: Pick<RoomConnection, "command">;
  /** The room's lock on new joins, from its state: another GM tab may change it while this is open. */
  joinsLocked: boolean;
  /** Lets a menu item drive the dialog (phone); the button itself is then hidden. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  /** Where focus goes once the dialog closes, when the opener is gone (phone menu item). */
  onAfterClose?: () => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [code, setCode] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const lockHintId = useId();
  const [loadFailed, setLoadFailed] = useState(false);
  const [result, setResult] = useState<"copied" | "failed" | "reset" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const fieldId = useId();
  const connectorFieldId = useId();
  const [copiedWhat, setCopiedWhat] = useState<"link" | "connector" | "one" | "party" | "stay" | null>(null);
  /**
   * The last AI message copied, and whether it worked. Kept until another copy or the dialog
   * closes, not flashed: when the clipboard refuses, the message to select by hand must stay.
   */
  const [aiCopy, setAiCopy] = useState<{ what: "one" | "party" | "stay"; ok: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Shows a short-lived result in the modal. */
  const flash = (value: typeof result) => {
    setResult(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 1500);
  };

  /** Keeps this browser's cached code current, so it still recognises the link as the GM's. */
  const remember = useCallback(
    (inviteCode: string) => {
      const creds = loadCredentials(roomId);
      if (creds && creds.inviteCode !== inviteCode) saveCredentials({ ...creds, inviteCode });
    },
    [roomId],
  );

  /**
   * Bumped on every load and when a reset starts and ends. A fetch that began under an older
   * generation may hold the code a reset just killed, so it is dropped rather than shown or cached.
   */
  const generation = useRef(0);

  const load = useCallback(() => {
    const started = ++generation.current;
    setLoadFailed(false);
    api.getInvite(roomId, token).then(
      ({ inviteCode }) => {
        if (generation.current !== started) return;
        remember(inviteCode);
        setCode(inviteCode);
      },
      () => {
        if (generation.current === started) setLoadFailed(true);
      },
    );
  }, [roomId, token, remember]);

  // Fetch on each open, so a reset made elsewhere shows up.
  useEffect(() => {
    if (!open) return;
    setCode(null);
    setQrOpen(false);
    setAiCopy(null);
    load();
  }, [open, load]);

  const link = code ? `${location.origin}/join/${code}` : null;
  const connector = `${location.origin}/mcp`;

  /** Locks or unlocks new joins. The switch follows the room's state once the server has decided. */
  async function setLocked(locked: boolean) {
    setLocking(true);
    setLockError(null);
    const result = await connection.command({ type: "room.setJoinsLocked", locked });
    setLocking(false);
    if (!result.ok) setLockError(result.message);
  }

  async function copy(button: HTMLButtonElement, text: string | null, what: NonNullable<typeof copiedWhat>) {
    if (!text || busy) return;
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = legacyCopy(text, button.closest("dialog") ?? document.body);
    }
    setCopiedWhat(what);
    if (what === "one" || what === "party" || what === "stay") setAiCopy({ what, ok });
    flash(ok ? "copied" : "failed");
  }

  const closeConfirm = () => {
    setConfirming(false);
    setError(null);
  };

  /** Replaces the invite code after confirmation; the old link stops working. */
  async function reset() {
    generation.current++;
    setBusy(true);
    setError(null);
    try {
      const { inviteCode } = await api.resetInvite(roomId, token);
      remember(inviteCode);
      closeConfirm();
      setCode(inviteCode);
      flash("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.resetFailed"));
    } finally {
      generation.current++;
      setBusy(false);
    }
  }

  const status = result === "copied" ? t("share.copied") : result === "failed" ? t("share.copyFailed") : result === "reset" ? t("share.linkReset") : "";

  return (
    <div className="share-group" data-tour="share">
      {!hideTrigger && (
        <button type="button" className="tool-button share-button" onClick={() => setOpen(true)}>
          {t("share.share")}
        </button>
      )}
      <Modal open={open} title={t("share.title")} className="share-modal" onAfterClose={onAfterClose} onClose={() => !busy && setOpen(false)}>
        <div className="share-body" aria-busy={!link && !loadFailed}>
          {loadFailed && (
            <div role="alert" className="error">
              {t("share.loadFailed")}{" "}
              <button type="button" className="secondary" onClick={load}>
                {t("share.retry")}
              </button>
            </div>
          )}
          {!link && !loadFailed && <p className="muted">{t("common.loading")}</p>}
          {link && (
            <>
              <div className="share-section">
                <label className="field-label" htmlFor={fieldId}>
                  {t("share.inviteLink")}
                </label>
                <div className="share-link-row">
                  <input
                    id={fieldId}
                    type="text"
                    readOnly
                    className="share-link-field"
                    value={link}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="icon-button share-copy"
                    aria-label={t("share.copyLink")}
                    title={t("share.copyLink")}
                    onClick={(e) => void copy(e.currentTarget, link, "link")}
                    disabled={busy}
                  >
                    {result === "copied" && copiedWhat === "link" ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                  </button>
                </div>
                <p className="muted share-hint">
                  {joinsLocked ? t("share.lockedNote") : t("share.anyone")}
                </p>
              </div>
            </>
          )}
          <div className="share-actions">
            <div className="share-action-buttons">
              {link && (
                <button type="button" className="secondary share-qr-toggle" onClick={() => setQrOpen(true)}>
                  <QrCode size={16} aria-hidden="true" /> {t("share.showQr")}
                </button>
              )}
              <button
                type="button"
                className="secondary share-reset"
                onClick={() => setConfirming(true)}
                disabled={busy || !link}
              >
                <ArrowsClockwise size={16} aria-hidden="true" /> {t("share.resetLink")}
              </button>
            </div>
            <p className="muted share-hint">{t("share.resetNote")}</p>
          </div>
          {/* Outside the link's own loading: a leaked link should be stoppable even if it won't load. */}
          <div className="share-actions" aria-busy={locking}>
            <label className="checkbox">
              <input
                type="checkbox"
                role="switch"
                checked={joinsLocked}
                disabled={locking}
                aria-describedby={lockHintId}
                onChange={(e) => void setLocked(e.target.checked)}
              />
              {t("share.lock")}
            </label>
            <p id={lockHintId} className="muted share-hint">
              {t("share.lockNote")}
            </p>
            {lockError && <p role="alert" className="error small">{lockError}</p>}
          </div>
          {link && (
            <section className="share-actions" aria-labelledby={`${connectorFieldId}-title`}>
              <h3 id={`${connectorFieldId}-title`} className="share-ai-title">{t("share.ai.title")}</h3>
              <p className="muted share-hint">{t("share.ai.lead")}</p>
              <ol className="share-ai-steps">
                <li>
                  <label className="share-ai-step" htmlFor={connectorFieldId}>{t("share.ai.addConnector")}</label>
                  <div className="share-link-row">
                    <input
                      id={connectorFieldId}
                      type="text"
                      readOnly
                      className="share-link-field"
                      value={connector}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      type="button"
                      className="icon-button share-copy"
                      aria-label={t("share.ai.copyConnector")}
                      title={t("share.ai.copyConnector")}
                      onClick={(e) => void copy(e.currentTarget, connector, "connector")}
                    >
                      {result === "copied" && copiedWhat === "connector" ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                    </button>
                  </div>
                  {result === "failed" && copiedWhat === "connector" && <p className="error small">{t("share.ai.connectorCopyFailed")}</p>}
                </li>
                <li>
                  <span className="share-ai-step">{t("share.ai.choose")}</span>
                  <ul className="plain share-ai-options">
                    {AI_PLAY_OPTIONS.map((option) => (
                      <li key={option.what}>
                        <button type="button" className="secondary share-copy-message" aria-describedby={`${connectorFieldId}-${option.what}`} disabled={busy}
                          onClick={(e) => void copy(e.currentTarget, option.message(link, yourName), option.what)}>
                          {result === "copied" && copiedWhat === option.what ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {t(option.label)}
                        </button>
                        <p id={`${connectorFieldId}-${option.what}`} className="muted share-hint">{t(option.description)}</p>
                        {aiCopy?.what === option.what && aiCopy.ok && <p className="share-copied">{t("share.ai.copied")}</p>}
                        {/* Clipboards can refuse on plain http, so the message is always reachable another way. */}
                        {aiCopy?.what === option.what && !aiCopy.ok && (
                          <label className="share-copy-fallback">
                            <span className="error small">{t("share.ai.copyFailed")}</span>
                            <textarea readOnly rows={5} value={option.message(link, yourName)} onFocus={(e) => e.currentTarget.select()} />
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
                <li>
                  <span className="share-ai-step">{t("share.ai.giveToken")}</span>
                  <p className="muted share-hint">{t("share.ai.giveTokenHint")}</p>
                </li>
              </ol>
            </section>
          )}
          <span className="sr-only" role="status">
            {status}
          </span>
        </div>
      </Modal>
      <Modal open={qrOpen && !!link} title={t("share.qr")} className="share-qr-modal" onClose={() => setQrOpen(false)}>
        {link && (
          <div className="share-qr-body">
            <div className="share-qr">
              <QRCodeSVG
                value={link}
                size={220}
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#000000"
                role="img"
                aria-label={t("share.qrLabel")}
              />
            </div>
            <p className="muted share-hint">{t("share.scan")}</p>
            <div className="row modal-actions">
              <button type="button" className="secondary" onClick={() => setQrOpen(false)}>
                {t("common.close")}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={confirming}
        title={t("share.resetQ")}
        onClose={() => !busy && closeConfirm()}
        initialFocus={cancelRef}
      >
        <div className="leave-confirm">
          <p>{t("share.resetBody1")}</p>
          <p className="muted">
            {t("share.resetBody2")}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row modal-actions">
            <button ref={cancelRef} type="button" className="secondary" onClick={closeConfirm} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button type="button" className="danger-fill" onClick={() => void reset()} disabled={busy}>
              {busy ? t("share.resetting") : t("share.resetLink")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Fallback for when the async clipboard API is unavailable (e.g. plain http on a LAN address). */
function legacyCopy(text: string, container: HTMLElement): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  // Fields outside a native modal dialog are inert and cannot be selected.
  container.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
