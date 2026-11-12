import { useEffect, useRef } from "react";
import { Eye } from "@phosphor-icons/react";
import { t } from "../i18n/locale";

/**
 * Shown while the GM previews the room as a player (gm-view-as-player). It stays outside the
 * read-only region so the way back is always there, and it takes focus when it appears.
 */
export function PreviewBanner({ name, onExit }: { name: string; onExit: () => void }) {
  const exit = useRef<HTMLButtonElement>(null);
  useEffect(() => exit.current?.focus(), []);
  return (
    <div className="preview-banner" role="status">
      <Eye size={18} aria-hidden="true" />
      <span>
        {t("viewAs.viewing")} <strong>{name}</strong>{t("viewAs.after")}
      </span>
      <button className="primary" ref={exit} type="button" onClick={onExit}>
        {t("join.gm.back")}
      </button>
    </div>
  );
}
