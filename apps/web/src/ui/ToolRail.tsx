import { useEffect, useRef, useState, type ReactNode } from "react";
import { AreaColor, MAX_LINE_WIDTH_CELLS, type TerrainKind } from "@vtt/shared";
import { isBoolean, usePersistentState } from "./usePersistentState";
import { usePhone } from "./usePhone";
import { CaretDoubleLeft, CaretDoubleRight, Circle, CaretUp, CloudFog, Cursor, Door, DoorOpen, Eraser, Eye, Lightbulb, LineSegment, LockSimple, Mountains, PaintBrush, PencilSimple, Polygon, Prohibit, Ruler, Square, Target, Trash, Triangle } from "@phosphor-icons/react";
import { AREA_SHADES, DRAW_COLORS, type AreaShape, isMeasureMode, type BoardTool, type DoorsMode, type DrawShape, type FogMode, type MeasureMode } from "../board/tools";
import type { StrokeShape } from "../board/terrainStroke";
import { t, type TextId } from "../i18n/locale";

/** The options each tool remembers while another tool is active. */
export interface ToolOptions {
  draw: { shape: DrawShape; color: number };
  area: { shape: AreaShape; lineCells: number; color: AreaColor; gmOnly: boolean };
  fog: { mode: FogMode };
  /** GM only (board-terrain-tool). `paint` null erases. Painting is always on Base. */
  terrain: { shape: StrokeShape; paint: TerrainKind | null };
  /** GM only (board-doors-tool). */
  doors: { mode: DoorsMode };
  /** The ruler's mode (ruler-modes); remembered in this browser by the board. */
  measure: { mode: MeasureMode };
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  draw: { shape: "brush", color: DRAW_COLORS[0].value },
  area: { shape: "circle", lineCells: 1, color: "orange", gmOnly: false },
  fog: { mode: "rect" },
  terrain: { shape: "brush", paint: "difficult" },
  doors: { mode: "toggle" },
  measure: { mode: "range" },
};

/** Tools the rail offers; Attack starts from a token instead (attack-targeting). */
type ToolKind = Exclude<BoardTool["kind"], "attack">;

/** Play tools first, then the GM's tools after a divider (board-tool-rail). */
const TOOLS: { kind: ToolKind; label: TextId; icon: ReactNode; gmOnly?: boolean }[] = [
  { kind: "select", label: "rail.select", icon: <Cursor size={18} aria-hidden="true" /> },
  { kind: "measure", label: "rail.measure", icon: <Ruler size={18} aria-hidden="true" /> },
  { kind: "draw", label: "rail.draw", icon: <PencilSimple size={18} aria-hidden="true" /> },
  { kind: "area", label: "rail.aoe", icon: <Target size={18} aria-hidden="true" /> },
  { kind: "erase", label: "rail.eraser", icon: <Eraser size={18} aria-hidden="true" /> },
  // Players never see a GM control, not even a disabled one (FR-GM-17, INTERFACE.md).
  { kind: "fog", label: "rail.fog", icon: <CloudFog size={18} aria-hidden="true" />, gmOnly: true },
  { kind: "terrain", label: "rail.terrain", icon: <Mountains size={18} aria-hidden="true" />, gmOnly: true },
  { kind: "doors", label: "rail.doors", icon: <Door size={18} aria-hidden="true" />, gmOnly: true },
];

const TERRAIN_SHAPES: { key: StrokeShape; label: TextId; icon: ReactNode }[] = [
  { key: "brush", label: "terrain.brush", icon: <PaintBrush size={16} aria-hidden="true" /> },
  { key: "rect", label: "common.rectangle", icon: <Square size={16} aria-hidden="true" /> },
];

/** Normal erases (its key stands in for null). */
const TERRAIN_PAINTS: { key: "normal" | TerrainKind; label: TextId; icon: ReactNode }[] = [
  { key: "normal", label: "terrain.normal", icon: <Eraser size={16} aria-hidden="true" /> },
  { key: "difficult", label: "terrain.difficult", icon: <Mountains size={16} aria-hidden="true" /> },
  { key: "blocked", label: "terrain.blocked", icon: <Prohibit size={16} aria-hidden="true" /> },
];

const DOORS_MODES: { key: DoorsMode; label: TextId; icon: ReactNode }[] = [
  { key: "toggle", label: "rail.doorsToggle", icon: <DoorOpen size={16} aria-hidden="true" /> },
  { key: "lock", label: "rail.doorsLock", icon: <LockSimple size={16} aria-hidden="true" /> },
];

const FOG_MODES: { key: FogMode; label: TextId; icon: ReactNode }[] = [
  { key: "rect", label: "rail.fogRect", icon: <Square size={16} aria-hidden="true" /> },
  { key: "polygon", label: "rail.fogPolygon", icon: <Polygon size={16} aria-hidden="true" /> },
  { key: "reveal", label: "rail.reveal", icon: <Eye size={16} aria-hidden="true" /> },
];

const DRAW_SHAPES: { shape: DrawShape; label: TextId; icon: ReactNode }[] = [
  { shape: "brush", label: "rail.brush", icon: <PaintBrush size={16} aria-hidden="true" /> },
  { shape: "line", label: "rail.line", icon: <LineSegment size={16} aria-hidden="true" /> },
  { shape: "rect", label: "rail.rectangle", icon: <Square size={16} aria-hidden="true" /> },
  { shape: "circle", label: "rail.circle", icon: <Circle size={16} aria-hidden="true" /> },
];

const AREA_SHAPES: { shape: AreaShape; label: TextId; icon: ReactNode }[] = [
  { shape: "circle", label: "rail.circle", icon: <Circle size={16} aria-hidden="true" /> },
  { shape: "cone", label: "rail.cone", icon: <Triangle size={16} aria-hidden="true" style={{ rotate: "90deg" }} /> },
  { shape: "box", label: "rail.box", icon: <Square size={16} aria-hidden="true" /> },
  { shape: "line", label: "rail.line", icon: <LineSegment size={16} aria-hidden="true" /> },
];

/** Build the board tool for a rail choice, using that tool's remembered options. */
export function toolFor(kind: ToolKind, options: ToolOptions): BoardTool {
  if (kind === "draw") return { kind, ...options.draw };
  if (kind === "area") return { kind, ...options.area };
  if (kind === "fog") return { kind, ...options.fog };
  // Options from before a tool existed fall back to its defaults.
  if (kind === "terrain") {
    const { shape, paint } = options.terrain ?? DEFAULT_TOOL_OPTIONS.terrain;
    return { kind, shape, paint };
  }
  if (kind === "doors") return { kind, ...(options.doors ?? DEFAULT_TOOL_OPTIONS.doors) };
  // Options saved before the ruler had modes have no `measure`: Range.
  if (kind === "measure") return { kind, mode: isMeasureMode(options.measure?.mode) ? options.measure.mode : "range" };
  return { kind };
}

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const AREA_COLOUR_NAMES: Record<AreaColor, TextId> = {
  red: "colour.red", orange: "colour.orange", yellow: "colour.yellow", green: "colour.green", blue: "colour.blue", purple: "colour.purple", grey: "colour.grey",
};

/**
 * The board's tool rail (KAN-69): Select, Measure, Draw, Area, Eraser, the GM's Fog and Clear all,
 * plus the active tool's options. Marks the tools make stay on this viewer's screen; fog is room state.
 */
export function ToolRail({
  active,
  options,
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
  const phone = usePhone();
  // Phone: the other tools sit in a flyout above the rail until one is picked.
  const [flyout, setFlyout] = useState(false);
  const currentRef = useRef<HTMLButtonElement>(null);
  // A tool picked on the phone must not stay active once the desktop rail is hidden.
  useEffect(() => {
    if (!phone && collapsed && active !== "select") onSelect("select");
  }, [phone, collapsed, active, onSelect]);
  const toggle = (
    <button
      type="button"
      className="tool-button rail-button rail-toggle"
      aria-expanded={!collapsed}
      aria-label={collapsed ? t("rail.showTools") : t("rail.hideTools")}
      title={collapsed ? t("rail.showTools") : t("rail.hideTools")}
      onClick={() => {
        // Hiding the rail goes back to Select, so a hidden Draw or Fog tool can't keep catching clicks.
        if (!collapsed) onSelect("select");
        setCollapsed((c) => !c);
      }}
    >
      {collapsed ? <CaretDoubleRight size={14} aria-hidden="true" /> : <CaretDoubleLeft size={14} aria-hidden="true" />}
    </button>
  );
  const terrain = options.terrain ?? DEFAULT_TOOL_OPTIONS.terrain;
  const doors = options.doors ?? DEFAULT_TOOL_OPTIONS.doors;
  const extras = (
    <>
      {active === "measure" && movementControls}

      {active === "draw" && (
        <div className="tool-options" role="group" aria-label={t("rail.drawOptions")}>
          <Segmented
            label={t("rail.shape")}
            items={DRAW_SHAPES.map((s) => ({ key: s.shape, label: t(s.label), icon: s.icon }))}
            value={options.draw.shape}
            onChange={(shape) => onOptions({ ...options, draw: { ...options.draw, shape } })}
          />
          <div className="tool-swatches" role="group" aria-label={t("rail.colour")}>
            {DRAW_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="tool-swatch"
                aria-label={t(c.name)}
                aria-pressed={options.draw.color === c.value}
                title={t(c.name)}
                style={{ background: hex(c.value) }}
                onClick={() => onOptions({ ...options, draw: { ...options.draw, color: c.value } })}
              />
            ))}
          </div>
        </div>
      )}

      {active === "area" && (
        <div className="tool-options" role="group" aria-label={t("rail.areaOptions")}>
          <Segmented
            label={t("rail.shape")}
            items={AREA_SHAPES.map((s) => ({ key: s.shape, label: t(s.label), icon: s.icon }))}
            value={options.area.shape}
            onChange={(shape) => onOptions({ ...options, area: { ...options.area, shape } })}
          />
          {options.area.shape === "line" && (
            <LineWidthField value={options.area.lineCells} onChange={(lineCells) => onOptions({ ...options, area: { ...options.area, lineCells } })} />
          )}
          <div className="tool-swatches" role="group" aria-label={t("rail.areaColour")}>
            {AreaColor.options.map((color) => (
              <button
                key={color}
                type="button"
                className="tool-swatch"
                aria-label={t(AREA_COLOUR_NAMES[color])}
                aria-pressed={options.area.color === color}
                title={t(AREA_COLOUR_NAMES[color])}
                style={{ background: hex(AREA_SHADES[color]) }}
                onClick={() => onOptions({ ...options, area: { ...options.area, color } })}
              />
            ))}
          </div>
          {isGm && (
            <label className="tool-check" title={t("rail.gmOnlyHint")}>
              <input
                type="checkbox"
                checked={options.area.gmOnly}
                onChange={(e) => onOptions({ ...options, area: { ...options.area, gmOnly: e.target.checked } })}
              />
              {t("rail.gmOnly")}
            </label>
          )}
        </div>
      )}

      {active === "fog" && isGm && (
        <div className="tool-options" role="group" aria-label={t("rail.fogOptions")}>
          <Segmented
            label={t("rail.fogMode")}
            items={FOG_MODES.map((mode) => ({ ...mode, label: t(mode.label) }))}
            value={options.fog.mode}
            onChange={(mode) => onOptions({ ...options, fog: { mode } })}
          />
        </div>
      )}

      {active === "terrain" && isGm && (
        <div className="tool-options" role="group" aria-label={t("rail.terrainOptions")}>
          <Segmented
            label={t("rail.shape")}
            items={TERRAIN_SHAPES.map((item) => ({ ...item, label: t(item.label) }))}
            value={terrain.shape}
            onChange={(shape) => onOptions({ ...options, terrain: { ...terrain, shape } })}
          />
          <Segmented
            label={t("terrain.kind")}
            items={TERRAIN_PAINTS.map((item) => ({ ...item, label: t(item.label) }))}
            value={terrain.paint ?? "normal"}
            onChange={(key) => onOptions({ ...options, terrain: { ...terrain, paint: key === "normal" ? null : key } })}
          />
        </div>
      )}

      {active === "doors" && isGm && (
        <div className="tool-options" role="group" aria-label={t("rail.doorsOptions")}>
          <Segmented
            label={t("rail.doorsMode")}
            items={DOORS_MODES.map((item) => ({ ...item, label: t(item.label) }))}
            value={doors.mode}
            onChange={(mode) => onOptions({ ...options, doors: { mode } })}
            wide
          />
        </div>
      )}
    </>
  );
  const visibleTools = TOOLS.filter((tool) => (isGm || !tool.gmOnly) && (!selectOnly || tool.kind === "select"));
  const playTools = visibleTools.filter((tool) => !tool.gmOnly);
  const gmTools = visibleTools.filter((tool) => tool.gmOnly);
  const showSight = isGm && !selectOnly && !!onToggleLineOfSight;
  // The divider before the GM's tools shows only when there are some (board-tool-rail).
  const gmGroup = gmTools.length > 0 || showSight;
  if (phone) {
    const current = TOOLS.find((tool) => tool.kind === active) ?? TOOLS[0]!;
    const pick = (run: () => void) => () => { setFlyout(false); run(); currentRef.current?.focus(); };
    return (
      <div className="tool-rail-wrap" data-tour="tools">
        <div className="tool-rail" role="toolbar" aria-label={t("rail.boardTools")}>
          {selectOnly ? (
            <button type="button" className="tool-button rail-button" aria-pressed="false" aria-label={t("rail.toolNamed", { tool: t(current.label) })} title={t(current.label)}>
              {current.icon}
            </button>
          ) : (
            <button ref={currentRef} type="button" className="tool-button rail-button rail-current" aria-expanded={flyout} aria-haspopup="true" aria-label={t("rail.boardToolsSelected", { tool: t(current.label) })} title={t("rail.boardToolsCurrent", { tool: t(current.label) })} onClick={() => setFlyout((o) => !o)}>
              {current.icon}
              <CaretUp size={9} weight="bold" className="rail-caret" aria-hidden="true" />
            </button>
          )}
        </div>
        {flyout && (
          <div className="tool-flyout" role="group" aria-label={t("rail.boardTools")}>
            {playTools.map((tool) => (
              <button key={tool.kind} type="button" className="tool-button rail-button" aria-pressed={active === tool.kind} aria-label={t(tool.label)} title={t(tool.label)} onClick={pick(() => onSelect(tool.kind))}>
                {tool.icon}
              </button>
            ))}
            {gmGroup && <span className="rail-divider" aria-hidden="true" />}
            {gmTools.map((tool) => (
              <button key={tool.kind} type="button" className="tool-button rail-button" aria-pressed={active === tool.kind} aria-label={t(tool.label)} title={t(tool.label)} onClick={pick(() => onSelect(tool.kind))}>
                {tool.icon}
              </button>
            ))}
            {showSight && onToggleLineOfSight && (
              <button type="button" className="tool-button rail-button" aria-pressed={!!lineOfSight} aria-label={t("walls.lineOfSight")} title={t(lineOfSight ? "rail.losOn" : "rail.losOff")} onClick={pick(onToggleLineOfSight)}>
                <Lightbulb size={18} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="tool-button rail-button" aria-label={t("rail.clearMarks")} title={t("rail.clearMarks")} onClick={pick(onClear)}>
              <Trash size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        {extras}
      </div>
    );
  }
  const railButton = (tool: (typeof TOOLS)[number]) => (
    <button
      key={tool.kind}
      type="button"
      className="tool-button rail-button labelled"
      data-tutorial={tool.kind === "fog" || tool.kind === "terrain" ? tool.kind : undefined}
      aria-pressed={active === tool.kind}
      title={t(tool.label)}
      onClick={() => onSelect(tool.kind)}
    >
      {tool.icon}
      <span className="rail-label">{t(tool.label)}</span>
    </button>
  );
  // Hidden, the rail is just its toggle; the active tool keeps working on the board.
  // Untagged while hidden, so the guide skips its Board tools step rather than spotlight the toggle.
  if (collapsed) return <div className="tool-rail-wrap"><div className="tool-rail">{toggle}</div></div>;
  return (
    <div className="tool-rail-wrap" data-tour="tools">
      <div className="tool-rail" role="toolbar" aria-label={t("rail.boardTools")} aria-orientation="vertical">
        {toggle}
        {playTools.map(railButton)}
        {gmGroup && <span className="rail-divider" aria-hidden="true" />}
        {gmTools.map(railButton)}
        {showSight && onToggleLineOfSight && (
          <button
            type="button"
            className="tool-button rail-button labelled"
            aria-pressed={!!lineOfSight}
            aria-label={t("walls.lineOfSight")}
            title={t(lineOfSight ? "rail.losOn" : "rail.losOff")}
            onClick={onToggleLineOfSight}
          >
            <Lightbulb size={18} aria-hidden="true" />
            <span className="rail-label">{t("rail.sight")}</span>
          </button>
        )}
        {!selectOnly && (
          <>
            <span className="rail-divider" aria-hidden="true" />
            <button type="button" className="tool-button rail-button labelled" aria-label={t("rail.clearMarks")} title={t("rail.clearMarks")} onClick={onClear}>
              <Trash size={18} aria-hidden="true" />
              <span className="rail-label">{t("rail.clear")}</span>
            </button>
          </>
        )}
      </div>

      {extras}
    </div>
  );
}

function Segmented<K extends string>({
  label,
  items,
  value,
  onChange,
  wide = false,
}: {
  label: string;
  items: { key: K; label: string; icon: ReactNode }[];
  value: K;
  onChange: (key: K) => void;
  /** Show each item's name beside its icon. */
  wide?: boolean;
}) {
  return (
    <div className={wide ? "tool-segmented wide" : "tool-segmented"} role="group" aria-label={label}>
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
          {wide && <span>{item.label}</span>}
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
    <div className="tool-stepper" role="group" aria-label={t("rail.lineWidthSquares")}>
      <button type="button" className="secondary" aria-label={t("rail.narrower")} disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={t("rail.lineWidth")}
        title={t("rail.lineWidthSquares")}
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
      <button type="button" className="secondary" aria-label={t("rail.wider")} disabled={value >= MAX_LINE_WIDTH_CELLS} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
