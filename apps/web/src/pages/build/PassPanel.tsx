import { useState } from "react";
import { Modal } from "../../ui/Modal";
import { buildMessage, copyText } from "./buildCopy";

/** Shows a build pass, once, with the message to copy to the user's AI app (FR-GM-26). */
export function PassPanel({ pass, onClose, children }: { pass: string | null; onClose: () => void; children?: React.ReactNode }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const message = pass ? buildMessage(location.origin, pass) : "";
  return (
    <Modal open={pass !== null} title="Give this to your AI" onClose={() => { setCopied(null); onClose(); }} closeLabel="Close">
      <div className="build-pass">
        <p className="notice"><span><strong>This pass is shown only once.</strong> It lets an AI add to this one draft for 24 hours. It can't publish, or reach your library or rooms.</span></p>
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
