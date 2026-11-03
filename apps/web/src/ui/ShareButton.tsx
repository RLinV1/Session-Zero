import { useEffect, useId, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { api } from "../net/api";
import { loadCredentials, saveCredentials } from "../net/identity";
import { Modal } from "./Modal";
import { PopoverButton } from "./Popover";

/**
 * The GM's Share control, last in the room's top bar. One click on Share copies the invite
 * link; there is no popover to open first. Rendered only for the GM, who is the only one
 * holding an invite code.
 *
 * The code is read from the server on each click, not from this browser's cache, so a reset
 * made in another tab or device is what gets copied (FR-GM-20). The chevron beside it opens a
 * small menu whose "Reset link" clears the current code and makes a new one, so a leaked link
 * stops admitting anyone new. One control, no tab of its own (isolate-room-load-failures).
 */
export function ShareButton({ roomId, token }: { roomId: string; token: string }) {
  const [result, setResult] = useState<"copied" | "failed" | "reset" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const shareHintId = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Shows a short-lived result on the Share button. */
  const flash = (value: typeof result) => {
    setResult(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 1500);
  };

  /** Keeps this browser's cached code current, so it still recognises the link as the GM's. */
  const remember = (inviteCode: string) => {
    const creds = loadCredentials(roomId);
    if (creds && creds.inviteCode !== inviteCode) saveCredentials({ ...creds, inviteCode });
  };

  /**
   * Bumped when a reset starts and again when it ends. A copy whose fetch began under an older
   * generation may hold the code the reset just killed, so it is dropped rather than copied or
   * cached over the new one.
   */
  const generation = useRef(0);
  /**
   * A copy whose link has arrived but whose clipboard write hasn't finished. Reset waits for it,
   * so a copy and a reset never interleave. A copy still fetching isn't tracked: the generation
   * check drops it, and waiting on its request would stall the reset behind a slow network.
   */
  const pendingCopy = useRef<Promise<void> | null>(null);

  /**
   * Copies the current invite link. The clipboard write starts inside the click itself, with the
   * text still being fetched: browsers that only allow clipboard writes during the user's gesture
   * (Safari) would refuse one made after awaiting the server. Where `ClipboardItem` can't take a
   * pending value, it falls back to fetching first and then writing.
   */
  const copy = () => {
    if (busy) return;
    const started = generation.current;
    const link = api.getInvite(roomId, token).then(({ inviteCode }) => {
      // A reset started after this fetch: this code may be dead, so neither copy nor cache it.
      if (generation.current !== started) throw new StaleInvite();
      remember(inviteCode);
      // From here the write is committed to this link; a reset must wait for it to land. This
      // callback runs after the fetch, so `done` below is always assigned by then.
      pendingCopy.current = done;
      return `${location.origin}/join/${inviteCode}`;
    });
    const done = finishCopy(link);
    void done.finally(() => {
      if (pendingCopy.current === done) pendingCopy.current = null;
    });
  };

  /** Writes the link once it resolves, reporting the outcome; a stale link is dropped quietly. */
  async function finishCopy(link: Promise<string>) {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        const blob = link.then((url) => new Blob([url], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
        return flash("copied");
      } catch {
        // Fall through: the fetch failed, the link went stale, or the browser refused a pending
        // ClipboardItem. The branches below tell those apart.
      }
    }
    let url: string;
    try {
      url = await link;
    } catch (err) {
      return err instanceof StaleInvite ? undefined : flash("failed");
    }
    let ok = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      ok = legacyCopy(url);
    }
    flash(ok ? "copied" : "failed");
  }

  const closeConfirm = () => {
    setConfirming(false);
    setError(null);
  };
  /**
   * The menu item that opened the confirmation is gone by the time it closes, so focus goes back
   * to Share rather than being lost to the page. An effect, not the click handler: the modal's
   * own effect (a child's, so it runs first) must close the dialog before focus can leave it.
   */
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirming) shareRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  /** Replaces the invite code after confirmation; the old link stops working. */
  async function reset() {
    // Invalidate fetches still in flight first, then let a copy whose link already arrived finish
    // writing, so it lands on the clipboard before the reset rather than after it.
    generation.current++;
    setBusy(true);
    setError(null);
    await pendingCopy.current;
    try {
      const { inviteCode } = await api.resetInvite(roomId, token);
      remember(inviteCode);
      closeConfirm();
      flash("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the link");
    } finally {
      generation.current++;
      setBusy(false);
    }
  }

  const label =
    result === "copied" ? "Copied" : result === "failed" ? "Copy failed" : result === "reset" ? "Link reset" : "Share";

  return (
    <div className="share-group" data-tour="share">
      <button
        ref={shareRef}
        type="button"
        className="tool-button share-button"
        title="Copy the invite link"
        // The visible word is the name (WCAG 2.5.3); what it does is the description.
        aria-describedby={shareHintId}
        disabled={busy}
        onClick={() => void copy()}
      >
        {label}
      </button>
      <span id={shareHintId} className="sr-only">Copies the invite link. Anyone with it can join as a player.</span>
      <PopoverButton
        label="Invite link options"
        title="Invite link options"
        align="right"
        className="tool-button share-button share-menu-button"
        buttonContent={<CaretDown size={12} aria-hidden="true" />}
      >
        {(close) => (
          <button
            type="button"
            className="share-menu-item share-reset"
            onClick={() => {
              close();
              setConfirming(true);
            }}
          >
            Reset link
          </button>
        )}
      </PopoverButton>
      <span className="sr-only" role="status">
        {result === "copied"
          ? "Invite link copied"
          : result === "failed"
            ? "Couldn't copy the invite link"
            : result === "reset"
              ? "Invite link reset. The old link no longer works."
              : ""}
      </span>
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

/** A fetched invite code that a reset has since replaced. */
class StaleInvite extends Error {}

/** Fallback for when the async clipboard API is unavailable (e.g. plain http on a LAN address). */
function legacyCopy(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
