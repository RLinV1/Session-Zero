import { useState, type ReactNode } from "react";
import { AreaColor, MAX_LINE_WIDTH_CELLS } from "@vtt/shared";
import { isBoolean, usePersistentState } from "./usePersistentState";
import { CaretDoubleLeft, CaretDoubleRight, Circle, CloudFog, Cursor, Eraser, Eye, Lightbulb, LineSegment, PaintBrush, PencilSimple, Polygon, Ruler, Square, Target, Trash, Triangle } from "@phosphor-icons/react";
import { AREA_SHADES, AREA_SIZES, DRAW_COLORS, type AreaShape, type BoardTool, type DrawShape, type FogMode } from "../board/tools";

/** The options each tool remembers while another tool is active. */
export interface ToolOptions {
  draw: { shape: DrawShape; color: number };
  area: { shape: AreaShape; size: number; lineCells: number; color: AreaColor; gmOnly: boolean };
  fog: { mode: FogMode };
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  draw: { shape: "brush", color: DRAW_COLORS[0].value },
  area: { shape: "circle", size: 20, lineCells: 1, color: "orange", gmOnly: false },
  fog: { mode: "rect" },
};

/** Tools the rail offers; Attack starts from a token instead (attack-targeting). */
type ToolKind = Exclude<BoardTool["kind"], "attack">;

const TOOLS: { kind: ToolKind; label: string; icon: ReactNode; gmOnly?: boolean }[] = [
  { kind: "select", label: "Select", icon: <Cursor size={18} aria-hidden="true" /> },
  { kind: "measure", label: "Measure", icon: <Ruler size={18} aria-hidden="true" /> },
  { kind: "draw", label: "Draw", icon: <PencilSimple size={18} aria-hidden="true" /> },
  { kind: "area", label: "AoE", icon: <Target size={18} aria-hidden="true" /> },
  { kind: "erase", label: "Eraser", icon: <Eraser size={18} aria-hidden="true" /> },
  // Players never see a fog control, not even a disabled one (FR-GM-17, INTERFACE.md).
  { kind: "fog", label: "Fog", icon: <CloudFog size={18} aria-hidden="true" />, gmOnly: true },
];

const FOG_MODES: { key: FogMode; label: string; icon: ReactNode }[] = [
  { key: "rect", label: "Fog rectangle", icon: <Square size={16} aria-hidden="true" /> },
  { key: "polygon", label: "Fog polygon", icon: <Polygon size={16} aria-hidden="true" /> },
  { key: "reveal", label: "Reveal (remove fog)", icon: <Eye size={16} aria-hidden="true" /> },
];

const DRAW_SHAPES: { shape: DrawShape; label: string; icon: ReactNode }[] = [
  { shape: "brush", label: "Brush", icon: <PaintBrush size={16} aria-hidden="true" /> },
  { shape: "line", label: "Line", icon: <LineSegment size={16} aria-hidden="true" /> },
  { shape: "rect", label: "Rectangle", icon: <Square size={16} aria-hidden="true" /> },
  { shape: "circle", label: "Circle", icon: <Circle size={16} aria-hidden="true" /> },
];

const AREA_SHAPES: { shape: AreaShape; label: string; icon: ReactNode }[] = [
  { shape: "circle", label: "Circle", icon: <Circle size={16} aria-hidden="true" /> },
  { shape: "cone", label: "Cone", icon: <Triangle size={16} aria-hidden="true" style={{ rotate: "90deg" }} /> },
  { shape: "box", label: "Box", icon: <Square size={16} aria-hidden="true" /> },
  { shape: "line", label: "Line", icon: <LineSegment size={16} aria-hidden="true" /> },
];

/** Build the board tool for a rail choice, using that tool's remembered options. */
export function toolFor(kind: ToolKind, options: ToolOptions): BoardTool {
  if (kind === "draw") return { kind, ...options.draw };
  if (kind === "area") return { kind, ...options.area };
  if (kind === "fog") return { kind, ...options.fog };
  return { kind };
}

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const colorName = (color: string) => color[0]!.toUpperCase() + color.slice(1);

/**
 * The board's tool rail (KAN-69): Select, Measure, Draw, Area, Eraser, the GM's Fog and Clear all,
 * plus the active tool's options. Marks the tools make stay on this viewer's screen; fog is room state.
 */
export function ToolRail({
  active,
  options,
  unitLabel,
  isGm,
  onSelect,
  onOptions,
  onClear,
  movementControls,
  selectOnly = false,
  lineOfSight,
  onToggleLineOfSight,
}: {
  active: BoardTool["kind"];
  options: ToolOptions;
  /** The room grid's unit label, for the area sizes. */
  unitLabel: string;
  /** The GM can place areas only they can see (ADR 0007), and gets the Fog tool (FR-GM-17). */
  isGm: boolean;
  onSelect: (kind: ToolKind) => void;
  onOptions: (options: ToolOptions) => void;
  onClear: () => void;
  movementControls?: ReactNode;
  /** Only Select, with no marks to clear: a template being edited (ADR 0033). */
  selectOnly?: boolean;
  /** GM only: whether the scene's line of sight is on (ADR 0044). */
  lineOfSight?: boolean;
  onToggleLineOfSight?: () => void;
}) {
  const [collapsed, setCollapsed] = usePersistentState("vtt.ui.toolRail", false, isBoolean);
  const toggle = (
    <button
      type="button"
      className="tool-button rail-button rail-toggle"
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show board tools" : "Hide board tools"}
      title={collapsed ? "Show board tools" : "Hide board tools"}
      onClick={() => {
        // Hiding the rail goes back to Select, so a hidden Draw or Fog tool can't keep catching clicks.
        if (!collapsed) onSelect("select");
        setCollapsed((c) => !c);
      }}
    >
      {collapsed ? <CaretDoubleRight size={14} aria-hidden="true" /> : <CaretDoubleLeft size={14} aria-hidden="true" />}
    </button>
  );
  // Hidden, the rail is just its toggle; the active tool keeps working on the board.
  // Untagged while hidden, so the guide skips its Board tools step rather than spotlight the toggle.
  if (collapsed) return <div className="tool-rail-wrap"><div className="tool-rail">{toggle}</div></div>;
  return (
    <div className="tool-rail-wrap" data-tour="tools">
      <div className="tool-rail" role="toolbar" aria-label="Board tools" aria-orientation="vertical">
        {toggle}
        {TOOLS.filter((t) => (isGm || !t.gmOnly) && (!selectOnly || t.kind === "select")).map((t) => (
          <button
            key={t.kind}
            type="button"
            className="tool-button rail-button labelled"
            aria-pressed={active === t.kind}
            title={t.label}
            onClick={() => onSelect(t.kind)}
          >
            {t.icon}
            <span className="rail-label">{t.label}</span>
          </button>
        ))}
        {isGm && !selectOnly && onToggleLineOfSight && (
          <button
            type="button"
            className="tool-button rail-button labelled"
            aria-pressed={!!lineOfSight}
            aria-label="Line of sight"
            title={`Line of sight: ${lineOfSight ? "on" : "off"}`}
            onClick={onToggleLineOfSight}
          >
            <Lightbulb size={18} aria-hidden="true" />
            <span className="rail-label">Sight</span>
          </button>
        )}
        {!selectOnly && (
          <>
            <span className="rail-divider" aria-hidden="true" />
            <button type="button" className="tool-button rail-button labelled" aria-label="Clear all my marks" title="Clear all my marks" onClick={onClear}>
              <Trash size={18} aria-hidden="true" />
              <span className="rail-label">Clear</span>
            </button>
          </>
        )}
      </div>

      {active === "measure" && movementControls}

      {active === "draw" && (
        <div className="tool-options" role="group" aria-label="Draw options">
          <Segmented
            label="Shape"
            items={DRAW_SHAPES.map((s) => ({ key: s.shape, label: s.label, icon: s.icon }))}
            value={options.draw.shape}
            onChange={(shape) => onOptions({ ...options, draw: { ...options.draw, shape } })}
          />
          <div className="tool-swatches" role="group" aria-label="Colour">
            {DRAW_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="tool-swatch"
                aria-label={c.name}
                aria-pressed={options.draw.color === c.value}
                title={c.name}
                style={{ background: hex(c.value) }}
                onClick={() => onOptions({ ...options, draw: { ...options.draw, color: c.value } })}
              />
            ))}
          </div>
        </div>
      )}

      {active === "area" && (
        <div className="tool-options" role="group" aria-label="Area options">
          <Segmented
            label="Shape"
            items={AREA_SHAPES.map((s) => ({ key: s.shape, label: s.label, icon: s.icon }))}
            value={options.area.shape}
            onChange={(shape) => onOptions({ ...options, area: { ...options.area, shape } })}
          />
          <label className="tool-size">
            <span className="sr-only">Size when placed with a click</span>
            <select title="Size when placed with a click; drag to size it instead"
              value={options.area.size}
              onChange={(e) => onOptions({ ...options, area: { ...options.area, size: Number(e.target.value) } })}
            >
              {AREA_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} {unitLabel}
                </option>
              ))}
            </select>
          </label>
          {options.area.shape === "line" && (
            <LineWidthField value={options.area.lineCells} onChange={(lineCells) => onOptions({ ...options, area: { ...options.area, lineCells } })} />
          )}
          <div className="tool-swatches" role="group" aria-label="Area colour">
            {AreaColor.options.map((color) => (
              <button
                key={color}
                type="button"
                className="tool-swatch"
                aria-label={colorName(color)}
                aria-pressed={options.area.color === color}
                title={colorName(color)}
                style={{ background: hex(AREA_SHADES[color]) }}
                onClick={() => onOptions({ ...options, area: { ...options.area, color } })}
              />
            ))}
          </div>
          {isGm && (
            <label className="tool-check" title="Players won't see areas placed while this is on">
              <input
                type="checkbox"
                checked={options.area.gmOnly}
                onChange={(e) => onOptions({ ...options, area: { ...options.area, gmOnly: e.target.checked } })}
              />
              GM only
            </label>
          )}
        </div>
      )}

      {active === "fog" && isGm && (
        <div className="tool-options" role="group" aria-label="Fog options">
          <Segmented
            label="Fog mode"
            items={FOG_MODES}
            value={options.fog.mode}
            onChange={(mode) => onOptions({ ...options, fog: { mode } })}
          />
        </div>
      )}
    </div>
  );
}

function Segmented<K extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { key: K; label: string; icon: ReactNode }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="tool-segmented" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="tool-button rail-button"
          aria-pressed={value === item.key}
          aria-label={item.label}
          title={item.label}
          onClick={() => onChange(item.key)}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}

/**
 * A line's width in whole squares, 1 to MAX_LINE_WIDTH_CELLS (aoe-tool-refinements): type it, or
 * step it with the buttons. What's typed is a draft until Enter or leaving the field, when it is
 * rounded and kept in range; an empty or invalid entry goes back to the last width.
 */
export function LineWidthField({ value, onChange }: { value: number; onChange: (cells: number) => void }) {
  // Only while typing; otherwise the field shows `value`, so the buttons never show a stale width.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const typed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(typed)) return;
    const cells = Math.min(MAX_LINE_WIDTH_CELLS, Math.max(1, Math.round(typed)));
    if (cells !== value) onChange(cells);
  };
  return (
    <div className="tool-stepper" role="group" aria-label="Line width in squares">
      <button type="button" className="secondary" aria-label="Narrower" disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <input
        type="number"
        inputMode="numeric"
        aria-label="Line width"
        title="Line width in squares"
        min={1}
        max={MAX_LINE_WIDTH_CELLS}
        step={1}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <button type="button" className="secondary" aria-label="Wider" disabled={value >= MAX_LINE_WIDTH_CELLS} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
