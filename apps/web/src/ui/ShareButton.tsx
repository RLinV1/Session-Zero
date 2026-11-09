import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowsClockwise, Check, Copy, QrCode } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../net/api";
import { loadCredentials, saveCredentials } from "../net/identity";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "./Modal";

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
      setError(err instanceof Error ? err.message : "Couldn't reset the link");
    } finally {
      generation.current++;
      setBusy(false);
    }
  }

  const status = result === "copied" ? "Copied" : result === "failed" ? "Copy failed" : result === "reset" ? "Link reset" : "";

  return (
    <div className="share-group" data-tour="share">
      {!hideTrigger && (
        <button type="button" className="tool-button share-button" onClick={() => setOpen(true)}>
          Share
        </button>
      )}
      <Modal open={open} title="Share this room" className="share-modal" onAfterClose={onAfterClose} onClose={() => !busy && setOpen(false)}>
        <div className="share-body" aria-busy={!link && !loadFailed}>
          {loadFailed && (
            <div role="alert" className="error">
              Couldn't load the link{" "}
              <button type="button" className="secondary" onClick={load}>
                Retry
              </button>
            </div>
          )}
          {!link && !loadFailed && <p className="muted">Loading…</p>}
          {link && (
            <>
              <div className="share-section">
                <label className="field-label" htmlFor={fieldId}>
                  Invite link
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
                    aria-label="Copy link"
                    title="Copy link"
                    onClick={(e) => void copy(e.currentTarget, link, "link")}
                    disabled={busy}
                  >
                    {result === "copied" && copiedWhat === "link" ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                  </button>
                </div>
                <p className="muted share-hint">
                  {joinsLocked ? "The room is locked, so this link can't admit anyone new." : "Anyone with this link can join as a player."}
                </p>
              </div>
            </>
          )}
          <div className="share-actions">
            <div className="share-action-buttons">
              {link && (
                <button type="button" className="secondary share-qr-toggle" onClick={() => setQrOpen(true)}>
                  <QrCode size={16} aria-hidden="true" /> Show QR code
                </button>
              )}
              <button
                type="button"
                className="secondary share-reset"
                onClick={() => setConfirming(true)}
                disabled={busy || !link}
              >
                <ArrowsClockwise size={16} aria-hidden="true" /> Reset link
              </button>
            </div>
            <p className="muted share-hint">Reset replaces the link and QR code. The old ones stop working.</p>
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
              Lock the room
            </label>
            <p id={lockHintId} className="muted share-hint">
              Stops anyone new joining, even with the link. Players already here can still come back.
            </p>
            {lockError && <p role="alert" className="error small">{lockError}</p>}
          </div>
          {link && (
            <section className="share-actions" aria-labelledby={`${connectorFieldId}-title`}>
              <h3 id={`${connectorFieldId}-title`} className="share-ai-title">Play with your AI</h3>
              <p className="muted share-hint">
                Add this address to your AI app as a connector, then send it one of the messages below. It joins as a player, and you tell it what to do.
              </p>
              <label className="field-label" htmlFor={connectorFieldId}>
                Connector address
              </label>
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
                  aria-label="Copy connector address"
                  title="Copy connector address"
                  onClick={(e) => void copy(e.currentTarget, connector, "connector")}
                >
                  {result === "copied" && copiedWhat === "connector" ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                </button>
              </div>
              <div className="share-action-buttons">
                <button type="button" className="secondary share-qr-toggle" onClick={(e) => void copy(e.currentTarget, oneCharacterMessage(link), "one")} disabled={busy}>
                  {result === "copied" && copiedWhat === "one" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} Copy message for one character
                </button>
                <button type="button" className="secondary share-qr-toggle" onClick={(e) => void copy(e.currentTarget, partyMessage(link), "party")} disabled={busy}>
                  {result === "copied" && copiedWhat === "party" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} Copy message for a party
                </button>
                <button type="button" className="secondary share-qr-toggle" onClick={(e) => void copy(e.currentTarget, stayAtTableMessage(link, yourName), "stay")} disabled={busy}>
                  {result === "copied" && copiedWhat === "stay" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} Copy message to stay at the table
                </button>
              </div>
              <p className="muted share-hint">
                An AI that stays at the table plays its own turns and takes your orders from chat: double-click the map, then write @ and its name. It needs an app that can keep running, such as Claude Code, and uses that app's plan while it waits.
              </p>
              <p className="muted share-hint">Give an AI a token with Controlled by in the token's editor, and remove one like any other player. It sees only what a player can see.</p>
            </section>
          )}
          <span className="sr-only" role="status">
            {status}
          </span>
        </div>
      </Modal>
      <Modal open={qrOpen && !!link} title="QR code" className="share-qr-modal" onClose={() => setQrOpen(false)}>
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
                aria-label="QR code for the invite link"
              />
            </div>
            <p className="muted share-hint">Scan to join as a player.</p>
            <div className="row modal-actions">
              <button type="button" className="secondary" onClick={() => setQrOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={confirming}
        title="Reset the invite link?"
        onClose={() => !busy && closeConfirm()}
        initialFocus={cancelRef}
      >
        <div className="leave-confirm">
          <p>The current link stops working straight away. Anyone who opens it sees "Invite not found".</p>
          <p className="muted">
            Everyone already in the room stays connected and can come back as usual. Share the new link with anyone
            who still needs to join.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row modal-actions">
            <button ref={cancelRef} type="button" className="secondary" onClick={closeConfirm} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="danger-fill" onClick={() => void reset()} disabled={busy}>
              {busy ? "Resetting…" : "Reset link"}
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
