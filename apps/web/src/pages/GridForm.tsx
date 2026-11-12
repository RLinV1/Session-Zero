import { createPortal } from "react-dom";
import { useContext } from "react";
import { GridActionsContext } from "./GridActionsContext";
import { CaretDown } from "@phosphor-icons/react";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { GRID_LINE_WIDTHS, gridLineStyle, type GridDetectionStatus, type GridSpec, type MapImage } from "@vtt/shared";
import { gridLines } from "../board/gridLines";
import { DEFAULT_BOARD_SIZE, minimumGridCellSize, minimumGridCellSizeForDisplay } from "../board/gridRenderLimit";
import { ColorWheel } from "../ui/ColorWheel";
import { MapGridPreview } from "./MapGridPreview";
import { gridsEqual, newGridSuggestionSession, parseGridDraft, withGridSuggestion, type GridDraft, type GridSuggestionSession } from "./gridDraft";
import { t } from "../i18n/locale";

const DEFAULT_PREVIEW_MAP = { ...DEFAULT_BOARD_SIZE, url: null };

/**
 * Manual grid correction (FR-GM-04), shared by a room's Adjust grid and the library's
 * Edit grid. Estimates (FR-GM-03) can prefill untouched, unconfigured drafts.
 */
export function GridForm({
  grid,
  map,
  draft,
  hasDraft,
  onChange,
  onCancel,
  onApply,
  applying,
  error,
  detection,
  detectionError,
  detectionDenied = false,
  detectionNotice,
  focusCanvas = false,
  onUseSuggestion,
  autoSuggest = false,
  suggestionSession,
  submitLabel,
  busyLabel,
  cancelLabel,
  allowUnchanged = false,
  advancedOpen = false,
  children,
  hideActions = false,
}: {
  grid: GridSpec;
  /** Backdrop for the line-style preview. */
  map: MapImage | null;
  draft: GridDraft;
  hasDraft: boolean;
  onChange: (draft: GridDraft) => void;
  onCancel: () => void;
  onApply: (grid: GridSpec) => Promise<void>;
  applying: boolean;
  error: string | null;
  detection?: GridDetectionStatus | null;
  /** Hide analysis UI after a request error so manual editing can continue quietly. */
  detectionError?: string | null;
  detectionDenied?: boolean;
  detectionNotice?: string | null;
  focusCanvas?: boolean;
  onUseSuggestion?: (candidate: Extract<GridDetectionStatus, { status: "suggested" }>["candidate"]) => void;
  autoSuggest?: boolean;
  suggestionSession?: GridSuggestionSession;
  submitLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  /** An unconfigured map must be able to save an explicit grid equal to the defaults. */
  allowUnchanged?: boolean;
  /** Shows the line and geometry fields always, under a plain heading, instead of behind "Advanced". */
  advancedOpen?: boolean;
  /** Extra actions below the form, e.g. the room's "Save grid to library". */
  children?: ReactNode;
  hideActions?: boolean;
}) {
  const actionSlot = useContext(GridActionsContext);
  const formId = useId();
  const validDraft = useMemo(() => parseGridDraft(draft, map), [draft, map]);
  const [lastValid, setLastValid] = useState(grid);
  const [advanced, setAdvanced] = useState(false);
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [geometryPreview, setGeometryPreview] = useState<GridSpec | null>(null);
  const [editingGeometry, setEditingGeometry] = useState(false);
  const advancedId = useId();
  const previewHelpId = useId();
  const liveGeometry = editingGeometry || applying ? null : geometryPreview;
  const submitting = useRef(false);
  const localSession = useRef(newGridSuggestionSession());
  const session = suggestionSession ?? localSession.current;
  const interact = () => { session.blocked = true; };
  useEffect(() => {
    if (applying || detectionDenied) session.blocked = true;
    if (!autoSuggest || detectionError || session.blocked || session.applied || detection?.status !== "suggested") return;
    const next = withGridSuggestion(draft, detection.candidate);
    if (!parseGridDraft(next, map)) return;
    session.applied = true;
    setGeometryRevision((current) => current + 1);
    onChange(next);
  }, [autoSuggest, session, applying, detection, detectionError, detectionDenied, draft, map, onChange]);
  useEffect(() => { if (validDraft) setLastValid(validDraft); }, [validDraft]);
  const shown = validDraft ?? lastValid;
  const dirty = allowUnchanged || hasDraft && (!validDraft || !gridsEqual(validDraft, grid));
  const canSave = !!validDraft && (allowUnchanged || !gridsEqual(validDraft, grid));
  const cellSize = Number(draft.cellSize);
  const tooManyLines = draft.cellSize.trim() !== "" && Number.isFinite(cellSize)
    && cellSize > 0 && cellSize < minimumGridCellSize(map);
  const minimumCellSize = minimumGridCellSizeForDisplay(map);
  const styleDraft = validDraft ?? {
    ...shown,
    lineColor: draft.lineColor,
    lineWidth: draft.lineWidth,
    lineOpacity: draft.lineOpacity,
  };

  const field = (key: "cellSize" | "offsetX" | "offsetY", label: string) => (
    <div className="grid-field" key={key}>
      <label>
        {label}
        <input
          type="number"
          step="any"
          min={0}
          max={key === "cellSize" ? 2000 : undefined}
          required
          disabled={applying}
          value={liveGeometry ? String(liveGeometry[key]) : draft[key]}
          aria-describedby={liveGeometry ? previewHelpId : undefined}
          onChange={(e) => {
            interact();
            setGeometryRevision((current) => current + 1);
            onChange({ ...draft, [key]: e.target.value });
          }}
        />
      </label>
    </div>
  );

  return (
    <form
      id={formId}
      className="grid-editor"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!validDraft || !canSave || applying || submitting.current) return;
        interact();
        submitting.current = true;
        void onApply(validDraft).finally(() => { submitting.current = false; });
      }}
    >
      <MapGridPreview
        autoFocus={focusCanvas}
        map={map ?? DEFAULT_PREVIEW_MAP}
        grid={shown}
        geometryRevision={geometryRevision}
        onPreviewChange={setGeometryPreview}
        previewEnabled={!editingGeometry}
        disabled={applying}
        onInteraction={interact}
        onChange={(next) => onChange({ ...draft,
          cellSize: String(next.cellSize), offsetX: String(next.offsetX), offsetY: String(next.offsetY),
        })}
      />
      <div className="grid-advanced">
        {advancedOpen ? <h3 className="map-editor-heading">{t("common.advanced")}</h3> : (
          <button type="button" className="grid-advanced-toggle" aria-expanded={advanced}
            aria-controls={advancedId} onClick={() => setAdvanced((open) => !open)}>
            <span className="grid-advanced-title">{t("common.advanced")}</span>
            <CaretDown size={14} className="grid-advanced-caret" aria-hidden="true" />
          </button>
        )}
        <div id={advancedId} className="grid-advanced-body" hidden={!advancedOpen && !advanced}>
          <p id={previewHelpId} className="muted small-print" role="status" hidden={!liveGeometry}>
            {t("grid.tempValues")}
          </p>
          <div className="grid-form" onFocus={() => { setEditingGeometry(true); setGeometryPreview(null); }}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEditingGeometry(false); }}>
            {field("cellSize", t("grid.cellSize"))}
            {field("offsetX", t("grid.offsetX"))}
            {field("offsetY", t("grid.offsetY"))}
          </div>
          <p className="muted small-print">{t("grid.pixelsNote")}</p>
          <GridLineFields draft={styleDraft} map={map} disabled={applying}
            onChange={(next) => { interact(); onChange({ ...draft, lineColor: next.lineColor,
              lineWidth: next.lineWidth, lineOpacity: next.lineOpacity }); }}
          />
        </div>
      </div>
      <div className="grid-editor-footer">
        {detectionNotice && detection?.status !== "suggested" && <p role="status" className="muted grid-message">{detectionNotice}</p>}
        <div className="grid-scale">
          <span>{t("grid.eachSquare")}</span>
          <input type="number" aria-label={t("grid.distancePerSquare")} step="any" min="0" required
            disabled={applying} value={draft.unitsPerCell}
            onChange={(e) => { interact(); onChange({ ...draft, unitsPerCell: e.target.value }); }} />
          <input type="text" aria-label={t("grid.distanceUnit")} maxLength={12} required
            disabled={applying} value={draft.unitLabel}
            onChange={(e) => { interact(); onChange({ ...draft, unitLabel: e.target.value }); }} />
        </div>
        {detection && !detectionError && detection.status !== "no_grid" && detection.status !== "error" && (
          <div className="grid-suggestion" role="status">
            {detection.status === "queued" && <p>{t("grid.checking")}</p>}
            {detection.status === "running" && <p>{t("grid.analyzing")}</p>}
            {detection.status === "suggested" && (
              <>
                <p>{t("grid.estimate", { cell: Number(detection.candidate.cellSize.toFixed(2)), x: Number(detection.candidate.offsetX.toFixed(2)), y: Number(detection.candidate.offsetY.toFixed(2)) })}</p>
                {onUseSuggestion && (
                  <button type="button" className="secondary small" disabled={applying} onClick={() => {
                    interact();
                    setGeometryRevision((current) => current + 1);
                    onUseSuggestion(detection.candidate);
                  }}>
                    {t("grid.useSuggestion")}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {hasDraft && !validDraft && (
          <p className="error grid-message" role="alert">
            {tooManyLines
              ? t("grid.pausedMinCell", { min: minimumCellSize })
              : t("grid.pausedNote")}
          </p>
        )}
        {error && <p className="error grid-message" role="alert">{error}</p>}
        {!hideActions && (actionSlot ? (dirty ? createPortal(<span className="map-editor-unsaved">
          {dirty && <span className="map-editor-draft">{t("grid.unsaved")}</span>}
          <button type="button" className="secondary small" disabled={applying} onClick={() => { interact(); onCancel(); }}>{cancelLabel ?? t("common.discard")}</button>
          <button type="submit" form={formId} className="small primary" disabled={!canSave || applying}>{applying ? busyLabel ?? t("grid.applying") : submitLabel ?? t("common.saveChanges")}</button>
        </span>, actionSlot) : null) : (
          <div className="grid-actions">
            <button type="button" className="secondary" disabled={applying} onClick={() => { interact(); onCancel(); }}>{cancelLabel ?? t("common.cancel")}</button>
            <button className="primary" type="submit" disabled={!canSave || applying}>{applying ? busyLabel ?? t("grid.applying") : submitLabel ?? t("grid.apply")}</button>
          </div>
        ))}
        {children}
      </div>
    </form>
  );
}

const WIDTH_NAMES = ["grid.width.0", "grid.width.1", "grid.width.2", "grid.width.3", "grid.width.4", "grid.width.5"] as const;

/**
 * Line colour, thickness and opacity (grid-line-style, ADR 0005), behind an "Advanced"
 * disclosure that starts closed: most GMs only ever need cell size and offset. Everything
 * here is a draft until "Apply grid", so players see nothing change while the GM tries
 * things. The preview shows the precise line style over the map inside the modal;
 * the board shows the GM's calibration overlay.
 */
function GridLineFields({ draft, map, disabled, onChange }: {
  draft: GridSpec;
  map: MapImage | null;
  disabled: boolean;
  onChange: (grid: GridSpec) => void;
}) {
  const style = gridLineStyle(draft);
  const widthIndex = Math.max(0, GRID_LINE_WIDTHS.findIndex((w) => w >= style.width));
  const opacityPct = Math.round(style.opacity * 100);
  return (
    <div className="grid-line-fields">
      <GridLinePreview grid={draft} map={map} />
      <ColorWheel label={t("grid.lineColour")} value={style.color} disabled={disabled} onChange={(lineColor) => onChange({ ...draft, lineColor })} />
      <label className="range-field">
        <span className="range-label">
          {t("grid.thickness")} <span className="range-value">{t("common.px", { n: GRID_LINE_WIDTHS[widthIndex]! })}</span>
        </span>
        <input
          type="range"
          className="range"
          min={0}
          max={GRID_LINE_WIDTHS.length - 1}
          step={1}
          value={widthIndex}
          disabled={disabled}
          aria-valuetext={t("grid.widthValue", { name: t(WIDTH_NAMES[widthIndex]!), px: GRID_LINE_WIDTHS[widthIndex]! })}
          onChange={(e) => onChange({ ...draft, lineWidth: GRID_LINE_WIDTHS[Number(e.target.value)] })}
        />
      </label>
      <label className="range-field">
        <span className="range-label">
          {t("grid.opacity")} <span className="range-value">{opacityPct}%</span>
        </span>
        <input
          type="range"
          className="range range-opacity"
          min={5}
          max={100}
          step={5}
          value={opacityPct}
          disabled={disabled}
          style={{ "--range-to": style.color } as CSSProperties}
          aria-valuetext={t("grid.percent", { n: opacityPct })}
          onChange={(e) => onChange({ ...draft, lineOpacity: Number(e.target.value) / 100 })}
        />
      </label>
    </div>
  );
}

/** Cells shown across the preview; enough to read line weight against the map. */
const PREVIEW_CELLS = 5;

/**
 * The draft lines over the middle of the current map, drawn in board pixels (invariant 8)
 * so thickness reads at true proportion to the cells and the art, as on the board.
 */
function GridLinePreview({ grid, map }: { grid: GridSpec; map: MapImage | null }) {
  const style = gridLineStyle(grid);
  const width = grid.cellSize * PREVIEW_CELLS;
  const height = width * 0.4;
  const board = map ?? { url: null, width: 2100, height: 1400 };
  const x0 = Math.max(0, board.width / 2 - width / 2);
  const y0 = Math.max(0, board.height / 2 - height / 2);
  const { xs, ys } = gridLines(grid, { x: x0, y: y0, width, height });
  const lines = [...xs.map((x) => `M${x} ${y0}V${y0 + height}`), ...ys.map((y) => `M${x0} ${y}H${x0 + width}`)];
  return (
    <svg
      className="grid-line-preview"
      viewBox={`${x0} ${y0} ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={t("grid.previewStyle", { color: style.color, width: style.width, opacity: Math.round(style.opacity * 100) })}
    >
      <rect x={x0} y={y0} width={width} height={height} fill="#2b2e35" />
      {board.url && <image href={board.url} x={0} y={0} width={board.width} height={board.height} />}
      <path d={lines.join("")} fill="none" stroke={style.color} strokeOpacity={style.opacity} strokeWidth={style.width} />
    </svg>
  );
}
