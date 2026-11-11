import { useState } from "react";
import { Modal } from "../../ui/Modal";
import { buildMessage, copyText } from "./buildCopy";

/**
 * Shows a build pass, once, with the message to copy to the user's AI app (FR-GM-26). `replaced`
 * says the pass an AI may still hold has just stopped working, so the person knows to send this one.
 */
export function PassPanel({ pass, onClose, onAfterClose, children, replaced = false }: {
  pass: string | null;
  onClose: () => void;
  /** Runs once the dialog has closed and handed focus back. */
  onAfterClose?: () => void;
  children?: React.ReactNode;
  replaced?: boolean;
}) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const message = pass ? buildMessage(location.origin, pass) : "";
  return (
    <Modal open={pass !== null} title="Give this to your AI" onClose={() => { setCopied(null); onClose(); }} onAfterClose={onAfterClose} closeLabel="Close">
      <div className="build-pass">
        {replaced && <p className="notice"><span><strong>Your earlier pass has stopped working.</strong> If your AI was building, paste this new message into it to carry on.</span></p>}
        <p className="notice"><span><strong>This pass is shown only once, so copy it before you close this.</strong> It lets an AI add to this one draft for 24 hours. It can't publish, or reach your library or rooms.</span></p>
        <label>
          Message to paste into your AI app
          <textarea readOnly rows={9} value={message} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <div className="row">
          <button type="button" className="primary" onClick={() => void copyText(message).then((ok) => setCopied(ok ? "done" : "failed"))}>Copy message</button>
          <span role="status" className="muted">{copied === "done" ? "Copied" : copied === "failed" ? "Couldn't copy. Select the text and copy it yourself." : ""}</span>
        </div>
        {children}
      </div>
    </Modal>
  );
}
