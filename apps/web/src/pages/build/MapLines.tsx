import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { Flag, Trash, X } from "@phosphor-icons/react";
import {
  EMPTY_MAP_SETUP,
  describeDraftLine,
  type DraftCorner,
  type DraftLine,
  type DraftMapSetup,
  type DraftMark,
  type OpeningView,
  type PortalState,
} from "@vtt/shared";
import { IconAction } from "../../ui/IconAction";

/**
 * The walls, doors and windows the AI drew on a map, reviewed as a set rather than a select on
 * every row (FR-GM-27, ADR 0053): the owner picks lines on the map or in the list, by number or by
 * kind, and changes or removes them all in one action. Each action is one save of the whole setup.
 */

export type LineKind = DraftLine["kind"];
export type LineFilter = "all" | LineKind | "flagged";

const KINDS: readonly LineKind[] = ["wall", "door", "window"];
const STATES: readonly PortalState[] = ["closed", "open", "locked"];
const KIND_PLURAL: Record<LineKind, string> = { wall: "walls", door: "doors", window: "windows" };
const KIND_TITLE: Record<LineKind, string> = { wall: "Wall", door: "Door", window: "Window" };
/** The colours the map preview draws each kind in, so the list's swatches are the map's key. */
export const LINE_COLOUR = { wall: "#ff3b30", door: "#ffd60a", window: "#64d2ff", opening: "#ff9f0a" } as const;

/** After the next paint, when a row the choice just showed is in the list. */
const afterPaint = (run: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : run());
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const andList = (parts: readonly string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);

/**
 * Reads "3, 7-12, 40" as zero-based line indices. Spaces or commas separate; a range takes a hyphen,
 * a dash or "to". Every number must be a line on this map.
 */
export function parseLineNumbers(text: string, count: number): { ok: true; indices: number[] } | { ok: false; error: string } {
  const outOfRange = count === 1 ? "This map has only line 1." : `Line numbers go from 1 to ${count}.`;
  const parts = text.replace(/\s*(?:-|–|—|\bto\b)\s*/gi, "-").split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Type line numbers, such as 3, 7-12." };
  const indices = new Set<number>();
  for (const part of parts) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!range) return { ok: false, error: `"${part}" isn't a line number. Type numbers, such as 3, 7-12.` };
    const a = Number(range[1]), b = Number(range[2] ?? range[1]);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (lo < 1 || hi > count) return { ok: false, error: outOfRange };
    for (let n = lo; n <= hi; n++) indices.add(n - 1);
  }
  return { ok: true, indices: [...indices].sort((x, y) => x - y) };
}

/** How far, in squares, from the middle of a square to a line. */
function squaresFrom(p: { x: number; y: number }, a: DraftCorner, b: DraftCorner) {
  const dx = b.column - a.column, dy = b.row - a.row;
  const t = Math.max(0, Math.min(1, ((p.x - a.column) * dx + (p.y - a.row) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.column + t * dx), p.y - (a.row + t * dy));
}

/** The lines that pass by a mark's square: the ones the AI's note is about. */
export function linesNearMark(lines: readonly DraftLine[], mark: DraftMark, reach = 1.25): number[] {
  const middle = { x: mark.square.column + 0.5, y: mark.square.row + 0.5 };
  return lines.flatMap((line, i) => (squaresFrom(middle, line.from, line.to) <= reach ? [i] : []));
}

/** Why each line needs a look: the marks beside it, and a door or window a wall still blocks. */
export function lineFlags(setup: DraftMapSetup, blocked: readonly number[]): Map<number, string[]> {
  const flags = new Map<number, string[]>();
  const add = (i: number, reason: string) => flags.set(i, [...(flags.get(i) ?? []), reason]);
  for (const mark of setup.marks) for (const i of linesNearMark(setup.lines, mark)) add(i, mark.reason);
  for (const i of blocked) add(i, "It sits on a wall it doesn't cut, so the wall still blocks it.");
  return flags;
}

const withKind = (line: DraftLine, kind: LineKind, state?: PortalState): DraftLine =>
  kind === "wall" ? { from: line.from, to: line.to, kind } : { from: line.from, to: line.to, kind, state: state ?? line.state ?? "closed" };

export interface LinePicker {
  chosen: ReadonlySet<number>;
  lit: number | null;
  filter: LineFilter;
  setFilter: (filter: LineFilter) => void;
  light: (index: number | null) => void;
  /** Adds or takes away one line; with `range`, adds every line from the last one picked. */
  toggle: (index: number, range?: boolean) => void;
  /** Chooses these lines, beside the ones chosen already or in their place. */
  choose: (indices: readonly number[], add?: boolean) => void;
  clear: () => void;
  /** Scrolls the list, and only the list, to a line's row. */
  reveal: (index: number) => void;
  listRef: RefObject<HTMLUListElement | null>;
}

/**
 * Which lines are chosen and which one is pointed at, shared by the map preview and the list.
 * A removal renumbers the lines, so the choice is cleared whenever the number of lines changes.
 */
export function useLinePicker(count: number): LinePicker {
  const [raw, setRaw] = useState<ReadonlySet<number>>(() => new Set());
  const [lit, setLit] = useState<number | null>(null);
  const [filter, setFilter] = useState<LineFilter>("all");
  const anchor = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => { setRaw(new Set()); setLit(null); anchor.current = null; }, [count]);
  const chosen = useMemo(() => new Set([...raw].filter((i) => i < count)), [raw, count]);

  const toggle = (index: number, range = false) => {
    const next = new Set(chosen);
    if (range && anchor.current !== null && anchor.current !== index) {
      const [lo, hi] = anchor.current < index ? [anchor.current, index] : [index, anchor.current];
      for (let i = lo; i <= hi; i++) next.add(i);
    } else if (next.has(index)) next.delete(index);
    else next.add(index);
    anchor.current = index;
    setRaw(next);
  };
  const choose = (indices: readonly number[], add = true) => {
    setRaw(new Set([...(add ? chosen : []), ...indices]));
    anchor.current = indices.at(-1) ?? anchor.current;
  };
  const reveal = (index: number) => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-line="${index}"]`);
    if (!list || !row || list.scrollHeight <= list.clientHeight) return;
    const top = row.offsetTop, bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  };
  return { chosen, lit, filter, setFilter, light: setLit, toggle, choose, clear: () => setRaw(new Set()), reveal, listRef };
}

const matches = (filter: LineFilter, line: DraftLine, flagged: boolean) =>
  filter === "all" || (filter === "flagged" ? flagged : line.kind === filter);

/**
 * The AI's lines drawn again over the map preview, to pick from: an invisible wide stroke on each
 * takes the click, the chosen ones get a marching-ants edge, and the one pointed at stands out
 * while the rest dim. The list stays the keyboard and screen-reader way in; this layer is hidden from both.
 */
export function LinePickLayer({ lines, grid, picker, editable, flagged }: {
  lines: readonly DraftLine[];
  grid: { cellSize: number; offsetX: number; offsetY: number };
  picker: LinePicker;
  editable: boolean;
  flagged: ReadonlySet<number>;
}) {
  const d = (line: DraftLine) =>
    `M ${grid.offsetX + line.from.column * grid.cellSize} ${grid.offsetY + line.from.row * grid.cellSize} L ${grid.offsetX + line.to.column * grid.cellSize} ${grid.offsetY + line.to.row * grid.cellSize}`;
  const pick = (index: number, range: boolean) => {
    const line = lines[index]!;
    if (!matches(picker.filter, line, flagged.has(index))) picker.setFilter("all");
    if (editable) picker.toggle(index, range);
    picker.light(index);
    afterPaint(() => picker.reveal(index));
  };
  const lit = picker.lit !== null ? lines[picker.lit] : undefined;
  return (
    <g className={lit ? "build-line-picks has-lit" : "build-line-picks"}>
      {[...picker.chosen].map((i) => lines[i] && (
        <g key={i} className="build-line-chosen" data-line={i}>
          <path d={d(lines[i]!)} className="build-line-rim" vectorEffect="non-scaling-stroke" />
          <path d={d(lines[i]!)} className="build-line-ants" vectorEffect="non-scaling-stroke" />
          <path d={d(lines[i]!)} stroke={LINE_COLOUR[lines[i]!.kind]} strokeWidth={3} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {lit && (
        <g className="build-line-lit">
          <path d={d(lit)} className="build-line-glow" vectorEffect="non-scaling-stroke" />
          <path d={d(lit)} stroke={LINE_COLOUR[lit.kind]} strokeWidth={5} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {lines.map((line, i) => (
        <path key={i} d={d(line)} className="build-line-hit" data-hit={i} vectorEffect="non-scaling-stroke"
          onClick={(e) => pick(i, e.shiftKey)} onMouseEnter={() => picker.light(i)} onMouseLeave={() => picker.light(null)} />
      ))}
    </g>
  );
}

const where = (o: Pick<OpeningView, "square">) => (o.square ? ` at column ${o.square.column}, row ${o.square.row}` : "");
const corner = (c: DraftCorner) => `${c.column},${c.row}`;

/** A tick box that shows "some" when part of the list is chosen. */
function AllBox({ all, some, label, onChange }: { all: boolean; some: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = some && !all; }, [some, all]);
  return <input ref={ref} type="checkbox" checked={all} aria-label={label} onChange={onChange} />;
}

/**
 * A map's walls, doors and windows, as the AI and the file left them (ADR 0053). The owner can change
 * any opening and change or remove anything the AI drew. Drawing and moving walls stays in the map editor.
 */
export function MapWalls({ setup, openings, blocked, editable, editedByUser, busy, picker, onSave }: {
  setup: DraftMapSetup;
  openings: readonly OpeningView[];
  /** Drawn doors and windows a wall still blocks. */
  blocked: readonly number[];
  editable: boolean;
  editedByUser: boolean;
  busy: boolean;
  picker: LinePicker;
  onSave: (setup: DraftMapSetup) => Promise<void>;
}) {
  const headId = useId();
  const [numbers, setNumbers] = useState("");
  const [numbersError, setNumbersError] = useState<string | null>(null);
  const shift = useRef(false);
  const lines = setup.lines;
  const flags = useMemo(() => lineFlags(setup, blocked), [setup, blocked]);
  const near = useMemo(() => setup.marks.map((m) => linesNearMark(lines, m)), [setup.marks, lines]);
  const count = (kind: LineKind) => lines.filter((l) => l.kind === kind).length;
  const counts: Record<LineFilter, number> = { all: lines.length, wall: count("wall"), door: count("door"), window: count("window"), flagged: flags.size };
  const shown = lines.flatMap((line, i) => (matches(picker.filter, line, flags.has(i)) ? [i] : []));
  const chosenShown = shown.filter((i) => picker.chosen.has(i)).length;
  const chosenLines = [...picker.chosen].map((i) => lines[i]!).filter(Boolean);
  const chosenKinds = new Set(chosenLines.map((l) => l.kind));
  const chosenStates = new Set(chosenLines.map((l) => l.state));
  const allPortals = chosenLines.length > 0 && !chosenKinds.has("wall");
  const by = editedByUser ? "your AI or you" : "your AI";
  const aiSetSomething = setup.openings.length + lines.length + setup.marks.length > 0;

  const setOpening = (number: number, kind: string, state: PortalState) => {
    const others = setup.openings.filter((o) => o.number !== number);
    const opening = kind === "door" || kind === "window" ? [{ number, kind, state } as const] : [];
    void onSave({ ...setup, openings: [...others, ...opening].sort((a, b) => a.number - b.number) });
  };
  const changeChosen = (change: (line: DraftLine) => DraftLine) =>
    void onSave({ ...setup, lines: lines.map((l, i) => (picker.chosen.has(i) ? change(l) : l)) });
  const makeKind = (kind: LineKind) => { if (chosenKinds.size !== 1 || !chosenKinds.has(kind)) changeChosen((l) => withKind(l, kind)); };
  const makeState = (state: PortalState) => { if (chosenStates.size !== 1 || !chosenStates.has(state)) changeChosen((l) => withKind(l, l.kind, state)); };
  const removeChosen = () => void onSave({ ...setup, lines: lines.filter((_, i) => !picker.chosen.has(i)) });
  const removeMark = (index: number) => void onSave({ ...setup, marks: setup.marks.filter((_, i) => i !== index) });
  const chooseNumbers = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLineNumbers(numbers, lines.length);
    if (!parsed.ok) return setNumbersError(parsed.error);
    setNumbersError(null);
    setNumbers("");
    if (parsed.indices.some((i) => !shown.includes(i))) picker.setFilter("all");
    picker.choose(parsed.indices);
    afterPaint(() => picker.reveal(parsed.indices[0]!));
  };
  const chooseNear = (indices: readonly number[]) => {
    picker.setFilter("all");
    picker.choose(indices, false);
    afterPaint(() => picker.reveal(indices[0]!));
  };
  const toggleShown = () => (chosenShown === shown.length
    ? picker.choose([...picker.chosen].filter((i) => !shown.includes(i)), false)
    : picker.choose(shown));

  const drawn = KINDS.filter((k) => counts[k] > 0).map((k) => plural(counts[k], k));
  const summary = [
    lines.length > 0 ? `${andList(drawn)} drawn by ${by}` : null,
    openings.length > 0 ? `${plural(openings.length, "opening")} in the file` : null,
    setup.marks.length > 0 ? `${plural(setup.marks.length, "place")} left for you` : null,
  ].filter(Boolean).join(" · ");
  const filterLabel: Record<LineFilter, string> = { all: "All", wall: "Walls", door: "Doors", window: "Windows", flagged: "Flagged" };
  const shownWord = picker.filter === "all" ? plural(shown.length, "line") : picker.filter === "flagged" ? `${shown.length} flagged` : plural(shown.length, picker.filter, KIND_PLURAL[picker.filter]);

  return (
    <section className="build-walls" aria-labelledby={headId}>
      <div className="build-walls-head">
        <h4 id={headId}>Walls, doors and windows</h4>
        <p className="build-walls-sum">{summary}</p>
      </div>
      <ul className="plain build-walls-key" aria-label="Key to the map">
        <li><span className="build-line-swatch" data-kind="wall" aria-hidden="true" />Wall</li>
        <li><span className="build-line-swatch" data-kind="door" aria-hidden="true" />Door</li>
        <li><span className="build-line-swatch" data-kind="window" aria-hidden="true" />Window</li>
        {openings.length > 0 && <li><span className="build-line-swatch" data-kind="opening" aria-hidden="true" />Opening as the file has it</li>}
        {aiSetSomething && <li><span className="build-line-swatch is-set" aria-hidden="true" />White edge: set here</li>}
      </ul>
      {editable && lines.length > 0 && <p className="muted small-print">Click lines on the map or tick them below, then change them all at once. To draw or move walls, publish and use the map editor.</p>}
      {editable && !editedByUser && <p className="build-walls-warn small-print">Any change you make here stops your AI changing this map.</p>}

      {lines.length > 0 && (
        <div className="build-lines">
          <div className="build-lines-tools">
            <div className="seg seg-small build-lines-filter" role="group" aria-label="Show">
              {(["all", "wall", "door", "window", "flagged"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={picker.filter === f} disabled={f !== "all" && counts[f] === 0 && picker.filter !== f} onClick={() => picker.setFilter(f)}>
                  <span>{f === "flagged" && <Flag size={12} weight="fill" aria-hidden="true" />}{filterLabel[f]}</span>
                  <span className="build-seg-count">{counts[f]}</span>
                </button>
              ))}
            </div>
            {editable && (
              <form className="build-lines-numbers" onSubmit={chooseNumbers}>
                <label>
                  <span className="sr-only">Choose lines by number</span>
                  <input value={numbers} inputMode="text" placeholder="Lines, e.g. 3, 7-12" aria-invalid={numbersError ? true : undefined}
                    aria-describedby={numbersError ? `${headId}-numbers` : undefined} onChange={(e) => { setNumbers(e.target.value); setNumbersError(null); }} />
                </label>
                <button type="submit" className="small">Choose</button>
              </form>
            )}
          </div>
          {numbersError && <p className="error small-print" id={`${headId}-numbers`}>{numbersError}</p>}

          <div className="build-lines-frame">
            <div className="build-lines-listhead">
              {editable && shown.length > 0
                ? <label className="build-lines-all"><AllBox all={chosenShown === shown.length} some={chosenShown > 0} label={`Choose all ${shownWord} shown`} onChange={toggleShown} /><span>{shownWord}</span></label>
                : <span>{shownWord}</span>}
            </div>
            {shown.length === 0
              ? <p className="muted small-print build-lines-empty">No {picker.filter === "flagged" ? "flagged lines" : (picker.filter === "all" ? "lines" : KIND_PLURAL[picker.filter])} on this map. <button type="button" className="link" onClick={() => picker.setFilter("all")}>Show all lines</button></p>
              : (
                <ul ref={picker.listRef} className="plain build-lines-list" aria-label={`Lines drawn by ${by}`}>
                  {shown.map((i) => {
                    const line = lines[i]!;
                    const why = flags.get(i);
                    const state = line.kind === "wall" ? "" : `, ${line.state ?? "closed"}`;
                    const content = (
                      <>
                        <span className="build-line-swatch" data-kind={line.kind} aria-hidden="true" />
                        <span className="build-line-no">{i + 1}</span>
                        <span className="build-line-kind">{line.kind}{line.kind !== "wall" && <span className="muted"> · {line.state ?? "closed"}</span>}</span>
                        <span className="build-line-at" title={`${corner(line.from)} → ${corner(line.to)}`}>{corner(line.from)} → {corner(line.to)}</span>
                        {why ? <span className="build-line-flag" title={why.join(" ")}><Flag size={14} weight="fill" aria-hidden="true" /><span className="sr-only">Flagged: {why.join(" ")}</span></span> : <span aria-hidden="true" />}
                      </>
                    );
                    const className = ["build-line", picker.chosen.has(i) && "is-chosen", picker.lit === i && "is-lit"].filter(Boolean).join(" ");
                    return (
                      <li key={i} data-line={i} className={className} onMouseEnter={() => picker.light(i)} onMouseLeave={() => picker.light(null)}>
                        {editable ? (
                          <label onPointerDown={(e) => { shift.current = e.shiftKey; }}>
                            <input type="checkbox" checked={picker.chosen.has(i)} aria-label={`${describeDraftLine(line, i)}${state}`}
                              onKeyDown={(e) => { shift.current = e.shiftKey; }} onFocus={() => picker.light(i)} onBlur={() => picker.light(null)}
                              onChange={() => { picker.toggle(i, shift.current); shift.current = false; }} />
                            {content}
                          </label>
                        ) : <div className="build-line-row">{content}</div>}
                        {why && picker.filter === "flagged" && <p className="build-flag-reason">{why.join(" ")}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>

          <p className="sr-only" role="status">{picker.chosen.size > 0 ? `${plural(picker.chosen.size, "line")} chosen` : ""}</p>
          {editable && picker.chosen.size > 0 && (
            <div className="build-lines-bar" role="group" aria-label="Change the chosen lines">
              <p className="build-lines-count"><b>{picker.chosen.size}</b> chosen</p>
              <div className="build-lines-set">
                <span className="build-lines-set-label" id={`${headId}-make`}>Make</span>
                <div className="seg seg-small" role="group" aria-labelledby={`${headId}-make`}>
                  {KINDS.map((k) => (
                    <button key={k} type="button" aria-pressed={chosenKinds.size === 1 && chosenKinds.has(k)} disabled={busy} onClick={() => makeKind(k)}>
                      <span className="build-line-swatch" data-kind={k} aria-hidden="true" />{KIND_TITLE[k]}
                    </button>
                  ))}
                </div>
              </div>
              {allPortals && (
                <div className="build-lines-set">
                  <span className="build-lines-set-label" id={`${headId}-state`}>State</span>
                  <div className="seg seg-small" role="group" aria-labelledby={`${headId}-state`}>
                    {STATES.map((s) => (
                      <button key={s} type="button" aria-pressed={chosenStates.size === 1 && chosenStates.has(s)} disabled={busy} onClick={() => makeState(s)}>{s[0]!.toUpperCase() + s.slice(1)}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="build-lines-end">
                <button type="button" className="small danger build-text-action" disabled={busy} onClick={removeChosen}>
                  <Trash size={15} aria-hidden="true" />Remove {picker.chosen.size === 1 ? "it" : `all ${picker.chosen.size}`}
                </button>
                <button type="button" className="small" onClick={picker.clear}>Done</button>
              </div>
            </div>
          )}
        </div>
      )}

      {openings.length > 0 && (
        <>
          <h5 className="build-walls-sub">Openings in the file <span className="build-group-count">{openings.length}</span></h5>
          <ul className="plain build-wall-list">
            {openings.map((o) => {
              const kind = o.now.kind === "left" || o.now.kind === "opening" ? "opening" : o.now.kind;
              const state = o.now.kind === "left" ? "closed" : o.now.state;
              return (
                <li key={o.number}>
                  <span>Opening {o.number}{where(o)}</span>
                  <select aria-label={`Opening ${o.number}`} value={kind} disabled={!editable} onChange={(e) => setOpening(o.number, e.target.value, state === "open" || state === "locked" ? state : "closed")}>
                    <option value="opening">{o.now.kind === "left" ? "left for you" : "as the file has it"}</option>
                    <option value="door">door</option>
                    <option value="window">window</option>
                  </select>
                  {kind !== "opening" && (
                    <select aria-label={`Opening ${o.number} state`} value={state} disabled={!editable} onChange={(e) => setOpening(o.number, kind, e.target.value as PortalState)}>
                      <option value="closed">closed</option><option value="open">open</option><option value="locked">locked</option>
                    </select>
                  )}
                  {o.now.kind === "left" && <span className="build-flag-reason">{o.now.reason}</span>}
                  {/* Once the owner has edited the map, who set what can't be told apart. */}
                  {o.set && o.now.kind !== "left" && <span className="chip">{editedByUser ? "Set" : "Set by your AI"}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {setup.marks.length > 0 && (
        <>
          <h5 className="build-walls-sub"><Flag size={13} weight="fill" aria-hidden="true" />Left for you <span className="build-group-count">{setup.marks.length}</span></h5>
          <ul className="plain build-marks">
            {setup.marks.map((mark, i) => {
              const lineNumbers = near[i] ?? [];
              return (
                <li key={i} className="build-mark-row">
                  <span className="build-mark-reason">{mark.reason}</span>
                  <span className="build-mark-where">
                    Column {mark.square.column}, row {mark.square.row}
                    {lineNumbers.length > 0 && <> · near {lineNumbers.length === 1 ? "line" : "lines"} {lineNumbers.map((n) => n + 1).join(", ")}</>}
                  </span>
                  <span className="build-mark-tools">
                    {editable && lineNumbers.length > 0 && <button type="button" className="small" onClick={() => chooseNear(lineNumbers)}>Choose {lineNumbers.length === 1 ? "it" : "them"}</button>}
                    {editable && <IconAction icon={<X size={16} aria-hidden="true" />} label={`Clear the mark at column ${mark.square.column}, row ${mark.square.row}`} onClick={() => removeMark(i)} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {editable && aiSetSomething && <button type="button" className="link danger build-text-action" disabled={busy} onClick={() => void onSave(EMPTY_MAP_SETUP)}>Remove everything your AI set on this map</button>}
    </section>
  );
}
