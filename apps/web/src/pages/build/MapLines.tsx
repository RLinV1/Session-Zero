import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CaretLeft, CaretRight, Flag, Trash, X } from "@phosphor-icons/react";
import {
  EMPTY_MAP_SETUP,
  type DraftCorner,
  type DraftLine,
  type DraftMapSetup,
  type DraftMark,
  type OpeningView,
  type PortalState,
} from "@vtt/shared";

/**
 * The walls, doors and windows the AI drew on a map, edited from one place rather than a row per
 * line (FR-GM-27, ADR 0053). The owner types a line's number, steps through them, clicks one on the
 * map or picks a whole kind, and the editor changes or removes what is chosen in one save.
 */

export type LineKind = DraftLine["kind"];
type Group = LineKind | "flagged";

const KINDS: readonly LineKind[] = ["wall", "door", "window"];
const STATES: readonly PortalState[] = ["closed", "open", "locked"];
const KIND_TITLE: Record<LineKind, string> = { wall: "Wall", door: "Door", window: "Window" };
const GROUP_TITLE: Record<Group, string> = { wall: "Walls", door: "Doors", window: "Windows", flagged: "Flagged" };
/** The colours the map preview draws each kind in, so the editor's swatches are the map's key. */
export const LINE_COLOUR = { wall: "#ff3b30", door: "#ffd60a", window: "#64d2ff", opening: "#ff9f0a" } as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const andList = (parts: readonly string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);
const title = (word: string) => word[0]!.toUpperCase() + word.slice(1);

/**
 * Reads "3, 7-12, 40" as zero-based line indices. Spaces or commas separate; a range takes a hyphen,
 * a dash or "to". Every number must be a line on this map.
 */
export function parseLineNumbers(text: string, count: number): { ok: true; indices: number[] } | { ok: false; error: string } {
  const outOfRange = count === 1 ? "This map has only line 1." : `Line numbers go from 1 to ${count}.`;
  const parts = text.replace(/\s*(?:-|–|—|\bto\b)\s*/gi, "-").split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Type a line number, such as 1, or a range, such as 3-7." };
  const indices = new Set<number>();
  for (const part of parts) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!range) return { ok: false, error: `"${part}" isn't a line number. Type numbers, such as 1 or 3-7.` };
    const a = Number(range[1]), b = Number(range[2] ?? range[1]);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (lo < 1 || hi > count) return { ok: false, error: outOfRange };
    for (let n = lo; n <= hi; n++) indices.add(n - 1);
  }
  return { ok: true, indices: [...indices].sort((x, y) => x - y) };
}

/** Zero-based indices written back as line numbers, runs joined: [0, 1, 2, 6] is "1-3, 7". */
export function formatLineNumbers(indices: Iterable<number>): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    runs.push(j === i ? `${sorted[i]! + 1}` : `${sorted[i]! + 1}-${sorted[j]! + 1}`);
    i = j + 1;
  }
  return runs.join(", ");
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
  /** The line pointed at on the map, which shows its number. */
  lit: number | null;
  light: (index: number | null) => void;
  /** Chooses these lines, in place of the ones chosen, or beside them. */
  choose: (indices: readonly number[], add?: boolean) => void;
  /** Adds or takes away one line. */
  toggle: (index: number) => void;
  clear: () => void;
  /** The mark the editor shows, ringed on the map. */
  mark: number;
  setMark: (index: number) => void;
}

/**
 * Which lines are chosen and which one is pointed at, shared by the map preview and the editor.
 * A removal renumbers the lines, so the choice is cleared whenever the number of lines changes.
 */
export function useLinePicker(count: number, marks: number): LinePicker {
  const [raw, setRaw] = useState<ReadonlySet<number>>(() => new Set());
  const [lit, setLit] = useState<number | null>(null);
  const [mark, setMark] = useState(0);
  useEffect(() => { setRaw(new Set()); setLit(null); }, [count]);
  const chosen = useMemo(() => new Set([...raw].filter((i) => i < count)), [raw, count]);
  const toggle = (index: number) => {
    const next = new Set(chosen);
    if (next.has(index)) next.delete(index); else next.add(index);
    setRaw(next);
  };
  return {
    chosen, lit, light: setLit, toggle,
    choose: (indices, add = false) => setRaw(new Set([...(add ? chosen : []), ...indices])),
    clear: () => setRaw(new Set()),
    mark: Math.min(mark, Math.max(0, marks - 1)), setMark,
  };
}

/**
 * The AI's lines drawn again over the map preview, to pick from: an invisible wide stroke on each
 * takes the click (shift-click adds), the chosen ones get a marching-ants edge, and the one pointed
 * at shows its number while the rest dim. The editor is the keyboard and screen-reader way in; this
 * layer is hidden from both.
 */
export function LinePickLayer({ lines, marks, grid, picker, labelSize }: {
  lines: readonly DraftLine[];
  marks: readonly DraftMark[];
  grid: { cellSize: number; offsetX: number; offsetY: number };
  picker: LinePicker;
  labelSize: number;
}) {
  const at = (c: DraftCorner) => ({ x: grid.offsetX + c.column * grid.cellSize, y: grid.offsetY + c.row * grid.cellSize });
  const d = (line: DraftLine) => { const a = at(line.from), b = at(line.to); return `M ${a.x} ${a.y} L ${b.x} ${b.y}`; };
  const middle = (line: DraftLine) => { const a = at(line.from), b = at(line.to); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const label = (i: number, className: string) => {
    const m = middle(lines[i]!);
    return <text key={`n${i}`} x={m.x} y={m.y - labelSize * 0.9} fontSize={labelSize} strokeWidth={labelSize / 5} textAnchor="middle" dominantBaseline="central" className={className}>{i + 1}</text>;
  };
  const lit = picker.lit !== null ? lines[picker.lit] : undefined;
  const chosen = [...picker.chosen].filter((i) => lines[i]);
  const ring = marks[picker.mark];
  return (
    <g className={lit ? "build-line-picks has-lit" : "build-line-picks"}>
      {ring && (
        <circle className="build-mark-current" cx={grid.offsetX + (ring.square.column + 0.5) * grid.cellSize} cy={grid.offsetY + (ring.square.row + 0.5) * grid.cellSize}
          r={grid.cellSize * 0.75} vectorEffect="non-scaling-stroke" />
      )}
      {chosen.map((i) => (
        <g key={i} className="build-line-chosen" data-line={i}>
          <path d={d(lines[i]!)} className="build-line-rim" vectorEffect="non-scaling-stroke" />
          <path d={d(lines[i]!)} className="build-line-ants" vectorEffect="non-scaling-stroke" />
          <path d={d(lines[i]!)} stroke={LINE_COLOUR[lines[i]!.kind]} strokeWidth={3} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {/* Numbers for a few chosen lines, so a typed number is found on the map at once. */}
      {chosen.length <= 12 && chosen.filter((i) => i !== picker.lit).map((i) => label(i, "build-wall-label build-line-number"))}
      {lit && (
        <g className="build-line-lit">
          <path d={d(lit)} className="build-line-glow" vectorEffect="non-scaling-stroke" />
          <path d={d(lit)} stroke={LINE_COLOUR[lit.kind]} strokeWidth={5} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
          {label(picker.lit!, "build-wall-label build-line-number is-lit")}
        </g>
      )}
      {lines.map((line, i) => (
        <path key={i} d={d(line)} className="build-line-hit" data-hit={i} vectorEffect="non-scaling-stroke"
          onClick={(e) => (e.shiftKey ? picker.toggle(i) : picker.choose([i]))} onMouseEnter={() => picker.light(i)} onMouseLeave={() => picker.light(null)} />
      ))}
    </g>
  );
}

const where = (o: Pick<OpeningView, "square">) => (o.square ? ` at column ${o.square.column}, row ${o.square.row}` : "");
const corner = (c: DraftCorner) => `column ${c.column}, row ${c.row}`;

/** What is chosen, said once: the line itself, or how many of each kind. */
function Chosen({ lines, chosen, flags }: { lines: readonly DraftLine[]; chosen: readonly number[]; flags: Map<number, string[]> }) {
  if (chosen.length === 1) {
    const i = chosen[0]!, line = lines[i]!, why = flags.get(i);
    return (
      <div className="build-line-focus">
        <p className="build-line-name">
          <span className="build-line-swatch" data-kind={line.kind} aria-hidden="true" />
          <b>Line {i + 1}</b>
          <span>{title(line.kind)}{line.kind !== "wall" && <span className="muted"> · {line.state ?? "closed"}</span>}</span>
        </p>
        <p className="build-line-where">From {corner(line.from)} to {corner(line.to)}</p>
        {why && <p className="build-flag-reason"><Flag size={13} weight="fill" aria-hidden="true" /> {why.join(" ")}</p>}
      </div>
    );
  }
  const of = (kind: LineKind) => chosen.filter((i) => lines[i]!.kind === kind).length;
  const flagged = chosen.filter((i) => flags.has(i)).length;
  return (
    <div className="build-line-focus">
      <p className="build-line-name"><b>{plural(chosen.length, "line")}</b></p>
      <p className="build-line-where">{andList(KINDS.filter((k) => of(k) > 0).map((k) => plural(of(k), k)))}{flagged > 0 && `, ${flagged} flagged`}</p>
    </div>
  );
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
  const lines = setup.lines;
  const flags = useMemo(() => lineFlags(setup, blocked), [setup, blocked]);
  const chosen = [...picker.chosen].sort((a, b) => a - b);
  const chosenKey = chosen.join(",");
  // The field shows the choice, however it was made; what is typed chooses as it is typed.
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const typed = useRef(false);
  useEffect(() => {
    if (typed.current) { typed.current = false; return; }
    setDraft(formatLineNumbers(chosen));
    setError(null);
  }, [chosenKey]); // `chosen` is rebuilt every render; its contents are in `chosenKey`

  const groups: Record<Group, number[]> = {
    wall: [], door: [], window: [],
    flagged: lines.flatMap((_, i) => (flags.has(i) ? [i] : [])),
  };
  lines.forEach((l, i) => groups[l.kind].push(i));
  const chosenLines = chosen.map((i) => lines[i]!);
  const chosenKinds = new Set(chosenLines.map((l) => l.kind));
  const chosenStates = new Set(chosenLines.map((l) => l.state));
  const allPortals = chosenLines.length > 0 && !chosenKinds.has("wall");
  const by = editedByUser ? "your AI or you" : "your AI";
  const aiSetSomething = setup.openings.length + lines.length + setup.marks.length > 0;

  const type = (value: string) => {
    setDraft(value);
    setError(null);
    if (value.trim() === "") { typed.current = chosen.length > 0; picker.clear(); return; }
    const parsed = parseLineNumbers(value, lines.length);
    if (parsed.ok && parsed.indices.join(",") !== chosenKey) { typed.current = true; picker.choose(parsed.indices); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLineNumbers(draft, lines.length);
    if (!parsed.ok) return setError(parsed.error);
    picker.choose(parsed.indices);
  };
  /** One line before the first chosen, or after the last, wrapping round. */
  const step = (by: -1 | 1) => {
    const from = chosen.length === 0 ? (by > 0 ? -1 : lines.length) : by > 0 ? chosen.at(-1)! : chosen[0]!;
    picker.choose([(from + by + lines.length) % lines.length]);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); step(e.key === "ArrowUp" ? -1 : 1); }
    if (e.key === "Escape" && chosen.length > 0) { e.preventDefault(); picker.clear(); }
  };

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

  const drawn = KINDS.filter((k) => groups[k].length > 0).map((k) => plural(groups[k].length, k));
  const summary = [
    lines.length > 0 ? `${andList(drawn)} drawn by ${by}` : null,
    openings.length > 0 ? `${plural(openings.length, "opening")} in the file` : null,
    setup.marks.length > 0 ? `${plural(setup.marks.length, "place")} left for you` : null,
  ].filter(Boolean).join(" · ");
  const mark = setup.marks[picker.mark];
  const markLines = mark ? linesNearMark(lines, mark) : [];

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

      {lines.length > 0 && (
        <div className="build-line-editor">
          <form className="build-line-pick" onSubmit={submit}>
            <label htmlFor={`${headId}-line`}>Line</label>
            <div className="build-line-field">
              <button type="button" className="icon-button" aria-label="Previous line" title="Previous line" onClick={() => step(-1)}><CaretLeft size={16} aria-hidden="true" /></button>
              <input id={`${headId}-line`} value={draft} placeholder="1, or 3-7" autoComplete="off" spellCheck={false} inputMode="text"
                aria-invalid={error ? true : undefined} aria-describedby={`${headId}-line-help`} onChange={(e) => type(e.target.value)} onKeyDown={keys} />
              <button type="button" className="icon-button" aria-label="Next line" title="Next line" onClick={() => step(1)}><CaretRight size={16} aria-hidden="true" /></button>
              <span className="build-line-of">of {lines.length}</span>
            </div>
            {error
              ? <p className="error small-print" id={`${headId}-line-help`}>{error}</p>
              : <p className="muted small-print" id={`${headId}-line-help`}>Type a number, use the arrows, or click a line on the map. Point at a line to see its number.</p>}
          </form>

          <div className="build-line-groups" role="group" aria-label="Choose every">
            {(["wall", "door", "window", "flagged"] as const).map((g) => (
              <button key={g} type="button" className="small" disabled={groups[g].length === 0}
                aria-pressed={groups[g].length > 0 && groups[g].join(",") === chosenKey} onClick={() => picker.choose(groups[g])}>
                {g === "flagged" && <Flag size={12} weight="fill" aria-hidden="true" />}{GROUP_TITLE[g]}<span className="build-seg-count">{groups[g].length}</span>
              </button>
            ))}
          </div>

          <div className="build-line-card" aria-live="polite">
            {chosen.length === 0
              ? <p className="muted build-line-empty">No line chosen.</p>
              : <Chosen key={chosenKey} lines={lines} chosen={chosen} flags={flags} />}
            {editable && chosen.length > 0 && (
              <div className="build-line-actions" role="group" aria-label={`Change ${chosen.length === 1 ? `line ${chosen[0]! + 1}` : `the ${chosen.length} chosen lines`}`}>
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
                        <button key={s} type="button" aria-pressed={chosenStates.size === 1 && chosenStates.has(s)} disabled={busy} onClick={() => makeState(s)}>{title(s)}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="build-line-end">
                  <button type="button" className="small danger build-text-action" disabled={busy} onClick={removeChosen}>
                    <Trash size={15} aria-hidden="true" />{chosen.length === 1 ? "Remove line" : `Remove ${chosen.length} lines`}
                  </button>
                  {!editedByUser && <span className="build-walls-warn small-print">Any change you make here stops your AI changing this map.</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {editable && !editedByUser && lines.length === 0 && <p className="build-walls-warn small-print">Any change you make here stops your AI changing this map.</p>}

      {mark && (
        <section className="build-mark-pager" aria-labelledby={`${headId}-marks`}>
          <div className="build-mark-pager-head">
            <h5 id={`${headId}-marks`} className="build-walls-sub"><Flag size={13} weight="fill" aria-hidden="true" />Left for you</h5>
            {setup.marks.length > 1 && (
              <div className="build-mark-steps">
                <button type="button" className="icon-button" aria-label="Previous place" title="Previous place" onClick={() => picker.setMark((picker.mark - 1 + setup.marks.length) % setup.marks.length)}><CaretLeft size={16} aria-hidden="true" /></button>
                <span className="build-line-of">{picker.mark + 1} of {setup.marks.length}</span>
                <button type="button" className="icon-button" aria-label="Next place" title="Next place" onClick={() => picker.setMark((picker.mark + 1) % setup.marks.length)}><CaretRight size={16} aria-hidden="true" /></button>
              </div>
            )}
          </div>
          <p className="build-mark-reason">{mark.reason}</p>
          <p className="build-mark-where">Column {mark.square.column}, row {mark.square.row}{markLines.length > 0 && ` · near ${markLines.length === 1 ? "line" : "lines"} ${formatLineNumbers(markLines)}`}</p>
          <div className="build-mark-tools">
            {markLines.length > 0 && <button type="button" className="small" onClick={() => picker.choose(markLines)}>{editable ? "Edit these lines" : "Show these lines"}</button>}
            {editable && (
              <button type="button" className="small build-text-action" disabled={busy} onClick={() => removeMark(picker.mark)} aria-label={`Clear the mark at column ${mark.square.column}, row ${mark.square.row}`}>
                <X size={14} aria-hidden="true" />Clear this mark
              </button>
            )}
          </div>
        </section>
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
      {editable && aiSetSomething && <button type="button" className="link danger build-text-action" disabled={busy} onClick={() => void onSave(EMPTY_MAP_SETUP)}>Remove everything your AI set on this map</button>}
    </section>
  );
}
