import { useState } from "react";
import { Modal } from "../../ui/Modal";
import { BUILD_PASS_PLACEHOLDER, buildMessage, connectorAddress, copyText } from "./buildCopy";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"done" | "failed" | null>(null);
  return (
    <div className="build-copy-row">
      <button type="button" onClick={() => void copyText(text).then((ok) => setState(ok ? "done" : "failed"))}>{label}</button>
      <span role="status" className="build-copy-status">{state === "done" ? "Copied" : state === "failed" ? "Couldn't copy. Select the text and copy it yourself." : ""}</span>
    </div>
  );
}

/**
 * How to connect an AI app to this build, and the message to paste, shown again at any time
 * (FR-GM-26). The pass itself is shown only once, so the message here carries a placeholder to
 * swap for it, or for a new pass.
 */
export function BuildAiHelp() {
  const address = connectorAddress(location.origin);
  const message = buildMessage(location.origin, BUILD_PASS_PLACEHOLDER);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>How to connect your AI app</button>
      <Modal open={open} title="Connect your AI app" onClose={() => setOpen(false)} closeLabel="Close" className="build-ai-modal">
      <ol className="share-ai-steps build-ai-steps">
        <li>
          <span className="share-ai-step">Add a custom connector</span>
          <p>In your AI app, open its connector settings and add a custom connector (MCP server), with no sign-in. Names differ between apps.</p>
          <ul className="build-ai-paths">
            <li><strong>Claude</strong><span>Settings › Connectors › Add custom connector</span></li>
            <li><strong>ChatGPT</strong><span>Settings › Connectors › Advanced › Developer mode, then Create</span></li>
          </ul>
          <input className="build-ai-address" readOnly aria-label="Connector address" value={address} onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={address} label="Copy connector address" />
        </li>
        <li>
          <span className="share-ai-step">Paste this message into a chat</span>
          <p>Start a chat with the connector turned on, then paste the message below.</p>
          <label className="build-ai-message">
            <span className="build-ai-label">Message to paste into your AI app</span>
            <textarea readOnly rows={9} value={message} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <CopyButton text={message} label="Copy message" />
          <p className="build-ai-note">Replace <code>{BUILD_PASS_PLACEHOLDER}</code> with your pass. The pass is shown only when you make it, so make a new pass if you no longer have it.</p>
        </li>
        <li>
          <span className="share-ai-step">Send big files here</span>
          <p>Your AI can upload small files itself. Large maps are too big for it to send, so drop them in Files on this page.</p>
        </li>
      </ol>
      </Modal>
    </>
  );
}
