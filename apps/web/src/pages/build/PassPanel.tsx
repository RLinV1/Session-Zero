import { useState } from "react";
import { useT } from "../../i18n/locale";
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
  const t = useT();
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const message = pass ? buildMessage(location.origin, pass) : "";
  return (
    <Modal open={pass !== null} title={t("build.pass.title")} onClose={() => { setCopied(null); onClose(); }} onAfterClose={onAfterClose} closeLabel={t("common.close")}>
      <div className="build-pass">
        {replaced && <p className="notice"><span><strong>{t("build.pass.replacedStrong")}</strong>{t("build.sentenceGap")}{t("build.pass.replaced")}</span></p>}
        <p className="notice"><span><strong>{t("build.pass.onceStrong")}</strong>{t("build.sentenceGap")}{t("build.pass.once")}</span></p>
        <label>
          {t("build.pass.messageLabel")}
          <textarea readOnly rows={9} value={message} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <div className="row">
          <button type="button" className="primary" onClick={() => void copyText(message).then((ok) => setCopied(ok ? "done" : "failed"))}>{t("build.pass.copy")}</button>
          <span role="status" className="muted">{copied === "done" ? t("build.pass.copied") : copied === "failed" ? t("build.pass.copyFailed") : ""}</span>
        </div>
        {children}
      </div>
    </Modal>
  );
}
