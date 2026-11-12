import { useEffect, useRef, useState } from "react";
import { Funnel } from "@phosphor-icons/react";

import { t } from "../i18n/locale";
export interface BoardFilterState {
  fog: boolean;
  walls: boolean;
  portals: boolean;
  terrain: boolean;
  /** Only the map editor's menu has a Grid row. */
  grid?: boolean;
}

/**
 * The GM's one "Show" menu for what their own board draws: fog, walls, and doors and windows
 * (FR-GM-17, ADR 0029, ADR 0030). It changes only this browser's view; players see what the
 * room shows them. A row appears only when the room has that kind of thing.
 */
export function BoardFilters({ value, available, onChange, sight, inline = false }: {
  value: BoardFilterState;
  available: BoardFilterState;
  onChange: (next: BoardFilterState) => void;
  /** The board's Token view row (gm-token-sight-view): present only while line of sight is on. */
  sight?: { checked: boolean; onChange: (next: boolean) => void };
  /** Phone: the rows sit open inside the Board menu instead of behind their own Show button. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const rows: { key: keyof BoardFilterState; label: string }[] = [
    { key: "fog", label: t("filters.fog") },
    { key: "walls", label: t("filters.walls") },
    { key: "portals", label: t("filters.portals") },
    { key: "terrain", label: t("filters.terrain") },
    { key: "grid", label: t("filters.grid") },
  ];
  const shown = rows.filter((row) => available[row.key] === true);
  if (shown.length === 0 && !sight) return null;
  const menu = (
    <div className={inline ? "board-filters-inline" : "board-filters-menu"} role="group" aria-label={t("filters.showOn")}>
      {shown.map(({ key, label }) => (
        <label key={key} className="board-filters-row">
          <input type="checkbox" checked={value[key] === true} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />
          {label}
        </label>
      ))}
      {sight && (
        <div className="board-filters-sight">
          <label className="board-filters-row">
            <input type="checkbox" checked={sight.checked} onChange={(e) => sight.onChange(e.target.checked)} />
            {t("filters.tokenView")}
          </label>
        </div>
      )}
    </div>
  );
  if (inline) return menu;

  return (
    <div className="board-filters" ref={root}>
      <button type="button" className="tool-button" data-active={sight?.checked ? "true" : undefined} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((now) => !now)} title={t("filters.choose")}>
        <Funnel size={16} aria-hidden="true" />
        {t("common.show")}
      </button>
      {open && menu}
    </div>
  );
}
