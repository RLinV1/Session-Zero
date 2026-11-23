import type { StudioOwnerIds } from "@vtt/shared";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CaretLeft, CaretRight, Flag, Trash, X } from "@phosphor-icons/react";
import { Modal } from "../../ui/Modal";
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
 * The file's openings and the walls, doors and windows the AI drew on a map, edited from one place
 * rather than a row per line (FR-GM-27, ADR 0053). The owner types a number, steps through them,
 * clicks one on the map or picks a whole kind, and the editor changes what is chosen in one save.
 */

export type LineKind = DraftLine["kind"];
type Group = LineKind | "opening" | "flagged";

const KINDS: readonly LineKind[] = ["wall", "door", "window"];
const STATES: readonly PortalState[] = ["closed", "open", "locked"];
const KIND_TITLE: Record<LineKind, string> = { wall: "Wall", door: "Door", window: "Window" };
const GROUP_TITLE: Record<Group, string> = { wall: "Walls", door: "Doors", window: "Windows", opening: "Openings", flagged: "Flagged" };
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

/**
 * Everything the editor can choose, numbered as the field and the map number them: the file's openings
 * first, so each keeps the number the picture and the AI's tools give it, then the lines the AI drew.
 */
export type PickEntry =
  | { source: "file"; opening: OpeningView; kind: OpeningView["now"]["kind"]; state?: PortalState }
  | { source: "ai"; index: number; line: DraftLine; kind: LineKind; state?: PortalState };

export function pickEntries(lines: readonly DraftLine[], openings: readonly OpeningView[]): PickEntry[] {
  return [
    ...openings.map((opening): PickEntry => ({ source: "file", opening, kind: opening.now.kind, ...(opening.now.kind !== "left" && { state: opening.now.state }) })),
    ...lines.map((line, index): PickEntry => ({ source: "ai", index, line, kind: line.kind, ...(line.state && { state: line.state }) })),
  ];
}

const colourOf = (kind: PickEntry["kind"]) => LINE_COLOUR[kind === "left" ? "opening" : kind];

/** Why each line needs a look: the marks beside it, a door or window a wall still blocks, and an opening left for the owner. */
export function lineFlags(setup: DraftMapSetup, blocked: readonly number[], openings: readonly OpeningView[] = []): Map<number, string[]> {
  const flags = new Map<number, string[]>();
  const offset = openings.length;
  const add = (i: number, reason: string) => flags.set(i, [...(flags.get(i) ?? []), reason]);
  openings.forEach((o, i) => { if (o.now.kind === "left") add(i, o.now.reason); });
  for (const mark of setup.marks) for (const i of linesNearMark(setup.lines, mark)) add(offset + i, mark.reason);
  for (const i of blocked) add(offset + i, "It sits on a wall it doesn't cut, so the wall still blocks it.");
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
  /** The place left for the owner that the editor shows: marks first (ringed on the map), then openings. */
  mark: number;
  setMark: (index: number) => void;
}

/**
 * Which lines are chosen and which one is pointed at, shared by the map preview and the editor.
 * A removal renumbers the lines, so the choice is cleared whenever the number of lines changes.
 */
export function useLinePicker(count: number, places: number): LinePicker {
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
    mark: Math.min(mark, Math.max(0, places - 1)), setMark,
  };
}

/**
 * The file's openings and the AI's lines drawn again over the map preview, to pick from: an invisible
 * wide stroke on each takes the click (shift-click adds), the chosen ones get a marching-ants edge, and
 * the one pointed at shows its number while the rest dim. The editor is the keyboard and screen-reader
 * way in; this layer is hidden from both.
 */
export function LinePickLayer({ entries, marks, grid, picker, labelSize }: {
  entries: readonly PickEntry[];
  marks: readonly DraftMark[];
  /** The grid the AI's lines and marks are placed on; openings carry their own pixels. */
  grid: { cellSize: number; offsetX: number; offsetY: number } | null;
  picker: LinePicker;
  labelSize: number;
}) {
  const at = (c: DraftCorner) => grid && { x: grid.offsetX + c.column * grid.cellSize, y: grid.offsetY + c.row * grid.cellSize };
  const ends = (e: PickEntry) => (e.source === "file" ? { a: e.opening.a, b: e.opening.b } : (() => { const a = at(e.line.from), b = at(e.line.to); return a && b ? { a, b } : null; })());
  const segments = entries.map(ends);
  const d = (i: number) => { const s = segments[i]!; return `M ${s.a.x} ${s.a.y} L ${s.b.x} ${s.b.y}`; };
  const placed = (i: number) => entries[i] !== undefined && segments[i] !== null;
  const label = (i: number, className: string) => {
    const s = segments[i]!;
    return <text key={`n${i}`} x={(s.a.x + s.b.x) / 2} y={(s.a.y + s.b.y) / 2 - labelSize * 0.9} fontSize={labelSize} strokeWidth={labelSize / 5} textAnchor="middle" dominantBaseline="central" className={className}>{i + 1}</text>;
  };
  const lit = picker.lit !== null && placed(picker.lit) ? picker.lit : null;
  const chosen = [...picker.chosen].filter(placed);
  const ring = grid ? marks[picker.mark] : undefined;
  return (
    <g className={lit !== null ? "build-line-picks has-lit" : "build-line-picks"}>
      {ring && grid && (
        <circle className="build-mark-current" cx={grid.offsetX + (ring.square.column + 0.5) * grid.cellSize} cy={grid.offsetY + (ring.square.row + 0.5) * grid.cellSize}
          r={grid.cellSize * 0.75} vectorEffect="non-scaling-stroke" />
      )}
      {chosen.map((i) => (
        <g key={i} className="build-line-chosen" data-line={i}>
          <path d={d(i)} className="build-line-rim" vectorEffect="non-scaling-stroke" />
          <path d={d(i)} className="build-line-ants" vectorEffect="non-scaling-stroke" />
          <path d={d(i)} stroke={colourOf(entries[i]!.kind)} strokeWidth={3} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {/* Numbers for a few chosen lines, so a typed number is found on the map at once. */}
      {chosen.length <= 12 && chosen.filter((i) => i !== lit).map((i) => label(i, "build-wall-label build-line-number"))}
      {lit !== null && (
        <g className="build-line-lit">
          <path d={d(lit)} className="build-line-glow" vectorEffect="non-scaling-stroke" />
          <path d={d(lit)} stroke={colourOf(entries[lit]!.kind)} strokeWidth={5} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
          {label(lit, "build-wall-label build-line-number is-lit")}
        </g>
      )}
      {entries.map((_, i) => placed(i) && (
        <path key={i} d={d(i)} className="build-line-hit" data-hit={i} vectorEffect="non-scaling-stroke"
          onClick={(e) => (e.shiftKey ? picker.toggle(i) : picker.choose([i]))} onMouseEnter={() => picker.light(i)} onMouseLeave={() => picker.light(null)} />
      ))}
    </g>
  );
}

const where = (o: Pick<OpeningView, "square">) => (o.square ? ` at column ${o.square.column}, row ${o.square.row}` : "");
const corner = (c: DraftCorner) => `column ${c.column}, row ${c.row}`;
const OPENING_KIND: Record<"opening" | "left", string> = { opening: "As the file has it", left: "Left for you" };
/** How a choice is counted: an opening keeps one word whether it is as the file has it or left. */
const countKind = (kind: PickEntry["kind"]) => (kind === "left" ? "opening" : kind);
const COUNT_KINDS = ["wall", "door", "window", "opening"] as const;

/** What is chosen, said once: the line or opening itself, or how many of each kind. */
function Chosen({ entries, chosen, flags, editedByUser }: { entries: readonly PickEntry[]; chosen: readonly number[]; flags: Map<number, string[]>; editedByUser: boolean }) {
  if (chosen.length === 1) {
    const i = chosen[0]!, entry = entries[i]!, why = flags.get(i);
    const portal = entry.kind === "door" || entry.kind === "window";
    return (
      <div className="build-line-focus">
        <p className="build-line-name">
          <span className="build-line-swatch" data-kind={entry.kind === "left" ? "opening" : entry.kind} aria-hidden="true" />
          <b>{entry.source === "file" ? `Opening ${i + 1}` : `Line ${i + 1}`}</b>
          <span>{entry.kind === "opening" || entry.kind === "left" ? OPENING_KIND[entry.kind] : title(entry.kind)}{portal && <span className="muted"> · {entry.state ?? "closed"}</span>}</span>
          {/* Once the owner has edited the map, who set what can't be told apart. */}
          {entry.source === "file" && entry.opening.set && entry.kind !== "left" && <span className="chip">{editedByUser ? "Set" : "Set by your AI"}</span>}
        </p>
        <p className="build-line-where">
          {entry.source === "file" ? `From the file${where(entry.opening)}` : `From ${corner(entry.line.from)} to ${corner(entry.line.to)}`}
        </p>
        {why && <p className="build-flag-reason"><Flag size={13} weight="fill" aria-hidden="true" /> {why.join(" ")}</p>}
      </div>
    );
  }
  const of = (kind: (typeof COUNT_KINDS)[number]) => chosen.filter((i) => countKind(entries[i]!.kind) === kind).length;
  const flagged = chosen.filter((i) => flags.has(i)).length;
  return (
    <div className="build-line-focus">
      <p className="build-line-name"><b>{plural(chosen.length, "line")}</b></p>
      <p className="build-line-where">{andList(COUNT_KINDS.filter((k) => of(k) > 0).map((k) => plural(of(k), k)))}{flagged > 0 && `, ${flagged} flagged`}</p>
    </div>
  );
}

/** A place the owner should finish: a mark the AI left, or an opening it left with a reason. Marks come first. */
type Place = { kind: "mark"; mark: DraftMark; index: number } | { kind: "opening"; entry: number; opening: OpeningView; reason: string };

export function placesLeft(marks: readonly DraftMark[], openings: readonly OpeningView[]): Place[] {
  return [
    ...marks.map((mark, index): Place => ({ kind: "mark", mark, index })),
    ...openings.flatMap((opening, entry): Place[] => (opening.now.kind === "left" ? [{ kind: "opening", entry, opening, reason: opening.now.reason }] : [])),
  ];
}

/**
 * A map's walls, doors and windows, as the AI and the file left them (ADR 0053). The owner chooses the
 * file's openings and the AI's lines in one editor, changes any of them, and removes what the AI drew.
 * The map card also offers drawing tools.
 */
export function MapWalls({ setup, openings, blocked, editable, editedByUser, busy, picker, ids, onSave }: {
  setup: DraftMapSetup;
  openings: readonly OpeningView[];
  /** Drawn doors and windows a wall still blocks. */
  blocked: readonly number[];
  editable: boolean;
  editedByUser: boolean;
  busy: boolean;
  picker: LinePicker;
  ids?: StudioOwnerIds;
  onSave: (setup: DraftMapSetup, ids?: StudioOwnerIds) => Promise<void>;
}) {
  const headId = useId();
  const [resetting, setResetting] = useState(false);
  const lines = setup.lines;
  const offset = openings.length;
  const entries = useMemo(() => pickEntries(lines, openings), [lines, openings]);
  const count = entries.length;
  const flags = useMemo(() => lineFlags(setup, blocked, openings), [setup, blocked, openings]);
  const chosen = [...picker.chosen].sort((a, b) => a - b);
  const chosenKey = chosen.join(",");
  // The field shows the choice, however it was made; what is typed chooses as it is typed.
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [kindUnselectedFor, setKindUnselectedFor] = useState<string | null>(null);
  const typed = useRef(false);
  useEffect(() => {
    if (typed.current) { typed.current = false; return; }
    setDraft(formatLineNumbers(chosen));
    setError(null);
  }, [chosenKey]); // `chosen` is rebuilt every render; its contents are in `chosenKey`

  const groups: Record<Group, number[]> = {
    wall: [], door: [], window: [], opening: [],
    flagged: entries.flatMap((_, i) => (flags.has(i) ? [i] : [])),
  };
  entries.forEach((e, i) => groups[countKind(e.kind)].push(i));
  const chosenEntries = chosen.map((i) => entries[i]!);
  const fileChosen = chosenEntries.some((e) => e.source === "file");
  const aiChosen = chosenEntries.filter((e) => e.source === "ai").length;
  const chosenKinds = new Set(chosenEntries.map((e) => e.kind));
  const chosenStates = new Set(chosenEntries.map((e) => e.state));
  const allPortals = chosenEntries.length > 0 && chosenEntries.every((e) => e.kind === "door" || e.kind === "window");
  const by = editedByUser ? "your AI or you" : "your AI";
  const aiSetSomething = setup.openings.length + lines.length + setup.marks.length > 0;

  const type = (value: string) => {
    setDraft(value);
    setError(null);
    if (value.trim() === "") { typed.current = chosen.length > 0; picker.clear(); return; }
    const parsed = parseLineNumbers(value, count);
    if (parsed.ok && parsed.indices.join(",") !== chosenKey) { typed.current = true; picker.choose(parsed.indices); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLineNumbers(draft, count);
    if (!parsed.ok) return setError(parsed.error);
    picker.choose(parsed.indices);
  };
  /** One line before the first chosen, or after the last, wrapping round. */
  const step = (by: -1 | 1) => {
    const from = chosen.length === 0 ? (by > 0 ? -1 : count) : by > 0 ? chosen.at(-1)! : chosen[0]!;
    picker.choose([(from + by + count) % count]);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); step(e.key === "ArrowUp" ? -1 : 1); }
    if (e.key === "Escape" && chosen.length > 0) { e.preventDefault(); picker.clear(); }
  };

  /**
   * One save for every chosen line and opening. An opening's change gives its new setting, or null to
   * put it back as the file has it.
   */
  const changeChosen = (line: (l: DraftLine) => DraftLine, opening: (e: Extract<PickEntry, { source: "file" }>) => DraftMapSetup["openings"][number] | null) => {
    const settings = new Map(setup.openings.map((o) => [o.number, o]));
    for (const e of chosenEntries) {
      if (e.source !== "file") continue;
      const next = opening(e);
      if (next) settings.set(e.opening.number, next); else settings.delete(e.opening.number);
    }
    void onSave({
      ...setup,
      lines: lines.map((l, i) => (picker.chosen.has(offset + i) ? line(l) : l)),
      openings: [...settings.values()].sort((a, b) => a.number - b.number),
    }, ids);
  };
  const makeKind = (kind: LineKind) => {
    if (kindUnselectedFor !== chosenKey && chosenKinds.size === 1 && chosenKinds.has(kind)) {
      setKindUnselectedFor(chosenKey);
      return;
    }
    setKindUnselectedFor(null);
    if (chosenKinds.size === 1 && chosenKinds.has(kind)) return;
    changeChosen((l) => withKind(l, kind), (e) => (kind === "wall" ? null : { number: e.opening.number, kind, state: e.state ?? "closed" }));
  };
  const asInFile = () => { if (!(chosenKinds.size === 1 && chosenKinds.has("opening"))) changeChosen((l) => l, () => null); };
  const makeState = (state: PortalState) => {
    if (chosenStates.size === 1 && chosenStates.has(state)) return;
    changeChosen((l) => withKind(l, l.kind, state), (e) => (e.kind === "door" || e.kind === "window" ? { number: e.opening.number, kind: e.kind, state } : null));
  };
  const removeChosen = () => void onSave({ ...setup, lines: lines.filter((_, i) => !picker.chosen.has(offset + i)) }, { lines: ids?.lines?.filter((_, i) => !picker.chosen.has(offset + i)) });
  const removeMark = (index: number) => void onSave({ ...setup, marks: setup.marks.filter((_, i) => i !== index) }, { marks: ids?.marks?.filter((_, i) => i !== index) });

  const drawn = KINDS.map((k) => [k, lines.filter((l) => l.kind === k).length] as const).filter(([, n]) => n > 0).map(([k, n]) => plural(n, k));
  const places = placesLeft(setup.marks, openings);
  const summary = [
    lines.length > 0 ? `${andList(drawn)} drawn by ${by}` : null,
    openings.length > 0 ? `${plural(openings.length, "opening")} in the file` : null,
    places.length > 0 ? `${plural(places.length, "place")} left for you` : null,
  ].filter(Boolean).join(" · ");
  const place = places[picker.mark];
  const markLines = place?.kind === "mark" ? linesNearMark(lines, place.mark).map((i) => offset + i) : [];

  return (
    <section className="build-walls" aria-labelledby={headId}>
      <div className="build-walls-head">
        <h4 id={headId}>Review existing lines</h4>
        <p className="build-walls-sum">{summary}</p>
      </div>
      <ul className="plain build-walls-key" aria-label="Key to the map">
        <li><span className="build-line-swatch" data-kind="wall" aria-hidden="true" />Wall</li>
        <li><span className="build-line-swatch" data-kind="door" aria-hidden="true" />Door</li>
        <li><span className="build-line-swatch" data-kind="window" aria-hidden="true" />Window</li>
        {openings.length > 0 && <li><span className="build-line-swatch" data-kind="opening" aria-hidden="true" />Opening as the file has it</li>}
        {aiSetSomething && <li><span className="build-line-swatch is-set" aria-hidden="true" />White edge: set here</li>}
      </ul>

      {count > 0 && (
        <div className="build-line-editor">
          <form className="build-line-pick" onSubmit={submit}>
            <label htmlFor={`${headId}-line`}>Line</label>
            <div className="build-line-field">
              <button type="button" className="icon-button" aria-label="Previous line" title="Previous line" onClick={() => step(-1)}><CaretLeft size={16} aria-hidden="true" /></button>
              <input id={`${headId}-line`} value={draft} placeholder="1, or 3-7" autoComplete="off" spellCheck={false} inputMode="text"
                aria-invalid={error ? true : undefined} aria-describedby={`${headId}-line-help`} onChange={(e) => type(e.target.value)} onKeyDown={keys} />
              <button type="button" className="icon-button" aria-label="Next line" title="Next line" onClick={() => step(1)}><CaretRight size={16} aria-hidden="true" /></button>
              <span className="build-line-of">of {count}</span>
            </div>
            {error
              ? <p className="error small-print" id={`${headId}-line-help`}>{error}</p>
              : <p className="muted small-print" id={`${headId}-line-help`}>Type a number, use the arrows, or click a line on the map. Point at a line to see its number.{offset > 0 && lines.length > 0 && ` The file's openings are 1 to ${offset}; your AI's lines follow.`}</p>}
          </form>

          <div className="build-line-groups" role="group" aria-label="Choose every">
            {(["wall", "door", "window", "opening", "flagged"] as const).filter((g) => g !== "opening" || offset > 0).map((g) => (
              <button key={g} type="button" className="small" disabled={groups[g].length === 0}
                aria-pressed={groups[g].length > 0 && groups[g].join(",") === chosenKey} onClick={() => groups[g].join(",") === chosenKey ? picker.clear() : picker.choose(groups[g])}>
                {g === "flagged" && <Flag size={12} weight="fill" aria-hidden="true" />}{GROUP_TITLE[g]}<span className="build-seg-count">{groups[g].length}</span>
              </button>
            ))}
          </div>

          <div className="build-line-card" aria-live="polite">
            {chosen.length === 0
              ? <p className="muted build-line-empty">No line chosen.</p>
              : <Chosen key={chosenKey} entries={entries} chosen={chosen} flags={flags} editedByUser={editedByUser} />}
            {editable && chosen.length > 0 && (
              <div className="build-line-actions" role="group" aria-label={`Change ${chosen.length === 1 ? `${entries[chosen[0]!]!.source === "file" ? "opening" : "line"} ${chosen[0]! + 1}` : `the ${chosen.length} chosen lines`}`}>
                <div className="build-lines-set">
                  <span className="build-lines-set-label" id={`${headId}-make`}>Make</span>
                  <div className="seg seg-small" role="group" aria-labelledby={`${headId}-make`}>
                    {/* A file's opening can be a door or a window, or go back to what the file has; never a wall. */}
                    {KINDS.filter((k) => k !== "wall" || !fileChosen).map((k) => (
                      <button key={k} type="button" aria-pressed={kindUnselectedFor !== chosenKey && chosenKinds.size === 1 && chosenKinds.has(k)} disabled={busy} onClick={() => makeKind(k)}>
                        <span className="build-line-swatch" data-kind={k} aria-hidden="true" />{KIND_TITLE[k]}
                      </button>
                    ))}
                    {fileChosen && aiChosen === 0 && (
                      <button type="button" aria-pressed={chosenKinds.size === 1 && chosenKinds.has("opening")} disabled={busy} onClick={asInFile} title="As the file has it" aria-label="As the file has it">
                        <span className="build-line-swatch" data-kind="opening" aria-hidden="true" />Original
                      </button>
                    )}
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
                <div className="build-line-end build-editor-actions">
                  {/* Only what the AI drew can go: the file's openings stay, as a door, a window or as the file has them. */}
                  {!fileChosen && (
                    <button type="button" className="small danger build-text-action" disabled={busy} onClick={removeChosen}>
                      <Trash size={15} aria-hidden="true" />{chosen.length === 1 ? "Remove line" : `Remove ${chosen.length} lines`}
                    </button>
                  )}
                  {!editedByUser && <span className="build-walls-warn small-print">Any change you make here stops your AI changing this map.</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {editable && !editedByUser && count === 0 && <p className="build-walls-warn small-print">Any change you make here stops your AI changing this map.</p>}

      {place && (
        <section className="build-mark-pager" aria-labelledby={`${headId}-marks`}>
          <div className="build-mark-pager-head">
            <h5 id={`${headId}-marks`} className="build-walls-sub"><Flag size={13} weight="fill" aria-hidden="true" />Left for you</h5>
            {places.length > 1 && (
              <div className="build-mark-steps">
                <button type="button" className="icon-button" aria-label="Previous place" title="Previous place" onClick={() => picker.setMark((picker.mark - 1 + places.length) % places.length)}><CaretLeft size={16} aria-hidden="true" /></button>
                <span className="build-line-of">{picker.mark + 1} of {places.length}</span>
                <button type="button" className="icon-button" aria-label="Next place" title="Next place" onClick={() => picker.setMark((picker.mark + 1) % places.length)}><CaretRight size={16} aria-hidden="true" /></button>
              </div>
            )}
          </div>
          <p className="build-mark-reason">{place.kind === "mark" ? place.mark.reason : place.reason}</p>
          {place.kind === "mark" ? (
            <>
              <p className="build-mark-where">Column {place.mark.square.column}, row {place.mark.square.row}{markLines.length > 0 && ` · near ${markLines.length === 1 ? "line" : "lines"} ${formatLineNumbers(markLines)}`}</p>
              <div className="build-mark-tools">
                {markLines.length > 0 && <button type="button" className="small" onClick={() => picker.choose(markLines)}>{editable ? "Edit these lines" : "Show these lines"}</button>}
                {editable && (
                  <button type="button" className="small build-text-action" disabled={busy} onClick={() => removeMark(place.index)} aria-label={`Clear the mark at column ${place.mark.square.column}, row ${place.mark.square.row}`}>
                    <X size={14} aria-hidden="true" />Clear this mark
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="build-mark-where">Opening {place.opening.number}{where(place.opening)}</p>
              <div className="build-mark-tools">
                <button type="button" className="small" onClick={() => picker.choose([place.entry])}>{editable ? "Edit this opening" : "Show this opening"}</button>
              </div>
            </>
          )}
        </section>
      )}

      {editable && aiSetSomething && <div className="build-reset-setup build-editor-actions"><button type="button" className="small build-text-action" disabled={busy} onClick={() => setResetting(true)}><Trash size={15} aria-hidden="true" />Reset map setup</button></div>}
      <Modal open={resetting} title="Reset map setup?" onClose={() => setResetting(false)}>
        <p>This removes the draft's added walls, doors, windows, terrain and review marks. The map image and grid stay.</p>
        <div className="row"><button type="button" onClick={() => setResetting(false)}>Cancel</button><button type="button" className="danger" disabled={busy} onClick={() => { setResetting(false); void onSave({ ...EMPTY_MAP_SETUP, terrain: [] }); }}>Reset setup</button></div>
      </Modal>
    </section>
  );
}
