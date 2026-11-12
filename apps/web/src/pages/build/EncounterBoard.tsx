import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Eye, EyeSlash, PencilSimple } from "@phosphor-icons/react";
import type { BuildFileView, BuildItemView, DraftCreatureState } from "@vtt/shared";
import { encounterOf, mapOf } from "./buildProgress";
import { roleOf, tokenOrder, type Role } from "./buildOrder";
import { useHashKey } from "./buildHooks";

/**
 * The encounters as a board (FR-GM-27, build page layout 2026-11-12): one encounter at a time, its
 * tokens drawn where they stand on its own map, and the list beside it. Pointing at a token in the
 * list lights it on the map. Player characters are filled, pieces are square, and a hidden token
 * is drawn dashed, so the map says the same as the list.
 */

interface Grid { cellSize: number; offsetX: number; offsetY: number }

/** Arrow keys move along a row of tabs, as a tab list does. */
export function moveAlongTabs(e: KeyboardEvent<HTMLElement>, keys: readonly string[], current: string, pick: (key: string) => void) {
  const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  const to = e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : step === 0 ? -1 : (keys.indexOf(current) + step + keys.length) % keys.length;
  if (to < 0) return;
  e.preventDefault();
  pick(keys[to]!);
  const tabs = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role=tab]");
  tabs?.[to]?.focus();
}

/** The shape a token is drawn with, also shown beside its name so the list is the map's key. */
function Glyph({ role, hidden }: { role: Role; hidden: boolean }) {
  return (
    <svg className={`build-glyph build-mark-${role}${hidden ? " build-mark-hidden" : ""}`} viewBox="0 0 16 16" aria-hidden="true">
      {role === "piece" ? <rect x="3" y="3" width="10" height="10" rx="2" /> : <circle cx="8" cy="8" r="5.5" />}
    </svg>
  );
}

export function EncounterBoard({ encounters, maps, files, creature, idFor, checkbox, blockedText, busy, onEdit, extras }: {
  encounters: readonly BuildItemView[];
  maps: readonly BuildItemView[];
  files: readonly BuildFileView[];
  creature: (key: string) => DraftCreatureState | undefined;
  idFor: (item: BuildItemView) => string;
  checkbox: (item: BuildItemView) => ReactNode;
  blockedText: (item: BuildItemView) => string | null;
  busy: boolean;
  onEdit: (item: BuildItemView) => void;
  /** Flags and what wasn't carried over, below the board. */
  extras: (item: BuildItemView) => ReactNode;
}) {
  const keys = encounters.map((e) => e.key);
  const [selectedKey, pick] = useHashKey("build-encounter-", keys);
  const [lit, setLit] = useState<number | null>(null);
  const item = encounters.find((e) => e.key === selectedKey) ?? encounters[0];
  if (!item) return null;

  const data = encounterOf(item);
  const map = maps.find((m) => m.key === data.mapKey);
  const mapData = map ? mapOf(map) : null;
  const file = mapData ? files.find((f) => f.id === mapData.fileId) : undefined;
  const grid: Grid | null = mapData?.grid ?? mapData?.proposedGrid ?? (file?.grid ? { cellSize: file.grid.cellSize, offsetX: file.grid.offsetX, offsetY: file.grid.offsetY } : null);
  const order = tokenOrder(data.tokens, creature);
  const tokens = order.map((i) => ({ index: i, token: data.tokens[i]!, of: creature(data.tokens[i]!.creatureKey) }));
  const placed = tokens.filter((t) => t.token.square);
  const unplaced = tokens.filter((t) => !t.token.square);
  const nameOf = (t: (typeof tokens)[number]) => t.token.name ?? t.of?.name ?? t.token.creatureKey;
  const blocked = blockedText(item);

  const row = (t: (typeof tokens)[number]) => {
    const role = roleOf(t.of);
    return (
      <li key={t.index} className={lit === t.index ? "build-board-token is-lit" : "build-board-token"}
        onMouseEnter={() => setLit(t.index)} onMouseLeave={() => setLit(null)}>
        <Glyph role={role} hidden={t.token.hidden} />
        <span className="build-token-name">{nameOf(t)}</span>
        {t.token.square && <span className="build-board-square">{t.token.square.column}, {t.token.square.row}</span>}
        <span className={t.token.hidden ? "build-board-seen" : "build-board-seen is-visible"} title={t.token.hidden ? "Hidden from players" : "Players see this name"}>
          {t.token.hidden ? <EyeSlash size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          <span className="sr-only">{t.token.hidden ? "Hidden" : "Visible"}</span>
        </span>
      </li>
    );
  };

  return (
    <section className="build-section build-board" aria-labelledby="build-encounters">
      <div className="build-section-head">
        <h2 id="build-encounters">Encounters</h2>
        <span className="build-section-sum">{encounters.length} {encounters.length === 1 ? "encounter" : "encounters"}</span>
      </div>
      <div className="build-tabs" role="tablist" aria-label="Encounters">
        {encounters.map((e) => {
          const missing = encounterOf(e).tokens.filter((t) => !t.square).length;
          return (
            <button key={e.key} type="button" role="tab" id={idFor(e)} aria-selected={e.key === item.key} aria-controls="build-encounter-panel"
              tabIndex={e.key === item.key ? 0 : -1} onClick={() => pick(e.key)} onKeyDown={(k) => moveAlongTabs(k, keys, item.key, pick)}>
              <span>{encounterOf(e).name}</span>
              {missing > 0 && <span className="build-tab-note">{missing} not placed</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="build-encounter-panel" aria-labelledby={idFor(item)} className="build-board-panel build-swap" key={item.key}>
        <div className="build-board-head">
          <div>
            <h3>{data.name}</h3>
            <p className="muted small-print">On {mapData?.name ?? data.mapKey}. Players see the name of every visible token.</p>
          </div>
          <div className="build-board-actions">
            {!blocked && checkbox(item)}
            {!item.published && (
              <button type="button" className="small build-text-action" disabled={busy} onClick={() => onEdit(item)}>
                <PencilSimple size={16} aria-hidden="true" />Edit tokens
              </button>
            )}
          </div>
        </div>
        {blocked && !item.published && <p className="build-blocked">Can't be published yet. {blocked}</p>}

        <div className="build-board-body">
          {file ? (
            <div className="build-plot">
              <img src={file.url} alt="" loading="lazy" />
              {grid && (
                <svg viewBox={`0 0 ${file.width} ${file.height}`} preserveAspectRatio="none" aria-hidden="true">
                  {placed.map((t) => {
                    const size = Math.max(1, t.of?.size ?? 1);
                    const cx = grid.offsetX + (t.token.square!.column + size / 2) * grid.cellSize;
                    const cy = grid.offsetY + (t.token.square!.row + size / 2) * grid.cellSize;
                    const r = size * grid.cellSize * 0.44;
                    const role = roleOf(t.of);
                    const className = `build-mark build-mark-${role}${t.token.hidden ? " build-mark-hidden" : ""}${lit === t.index ? " is-lit" : ""}`;
                    return (
                      <g key={t.index} className={className} style={{ strokeWidth: grid.cellSize * 0.12, ...(t.token.hidden ? { strokeDasharray: `${grid.cellSize * 0.16} ${grid.cellSize * 0.1}` } : {}) }}>
                        {lit === t.index && <circle className="build-mark-ring" cx={cx} cy={cy} r={r + grid.cellSize * 0.22} />}
                        {role === "piece"
                          ? <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.3} />
                          : <circle cx={cx} cy={cy} r={r} />}
                      </g>
                    );
                  })}
                </svg>
              )}
              {!grid && <p className="build-plot-note small-print">Tokens are drawn here once this map has a grid.</p>}
            </div>
          ) : <p className="muted small-print">This encounter's map isn't in the build.</p>}

          <div className="build-board-list">
            <h4>On the map <span className="build-group-count">{placed.length}</span></h4>
            {placed.length > 0 ? <ul className="plain">{placed.map(row)}</ul> : <p className="muted small-print">No token has a square yet.</p>}
            {unplaced.length > 0 && (
              <>
                <h4 className="build-board-bench">Not placed yet <span className="build-group-count">{unplaced.length}</span></h4>
                <ul className="plain">{unplaced.map(row)}</ul>
              </>
            )}
          </div>
        </div>
        {extras(item)}
      </div>
    </section>
  );
}
