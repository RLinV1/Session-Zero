import { useEffect, useRef } from "react";
import { Eye } from "@phosphor-icons/react";

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
        Viewing as <strong>{name}</strong>. This is what they see; you can't make changes here.
      </span>
      <button className="primary" ref={exit} type="button" onClick={onExit}>
        Back to GM view
      </button>
    </div>
  );
}
