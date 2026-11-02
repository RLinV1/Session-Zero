import { useState, type FormEvent } from "react";
import { attackLabel, formatAttackParties, formatAttackRoll, formatExpression, isGroupRoll, MAX_ATTACK_LABEL, parseDiceExpression, type DiceRoll, type DiceVisibility, type GroupRoll, type LoggedRoll, type Point, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { DiceTray, type TrayRoll } from "../ui/DiceTray";
import type { DiceBoard } from "../board/Board";
import type { DiceDrop } from "../board/diceDrops";
import { throwBlocker } from "../board/diceThrow";
import { DiceThrowHandle } from "./DiceThrowHandle";
import { DiceLookPicker } from "./DiceLookPicker";
import { GroupSelectionList, type GroupSelection } from "./GroupSelection";

const QUICK = ["1d20", "1d20+5", "2d6", "1d8+3", "4d6"];

/**
 * Which rolls are still being thrown on this viewer's screen (throw-dice-on-board), held by the
 * room page so the board and the panels agree on when each roll's dice have landed.
 */
export interface RollThrow {
  /** Rolls whose dice are still in the air: their totals wait. */
  airborne: ReadonlySet<string>;
  /** Your own dice are still showing (in the air, or on the board until they fade): rolling waits. */
  rolling: boolean;
  /** The roll whose dice landed last. */
  justLandedId: string | null;
  /** A panel tray's dice have landed. */
  onLanded: (rollId: string) => void;
  /**
   * Your die was let go over the map: your next roll of this expression lands there instead of
   * in the middle of the board. Returns a function that forgets it, for a roll that didn't go through.
   */
  expectDrop: (drop: DiceDrop) => () => void;
}

/**
 * Dice roller and shared roll log (FR-TAC-09, FR-GM-22).
 *
 * The panel shows only the latest roll; the full log opens in a modal, so a long session
 * does not push the rest of the sidebar off screen.
 *
 * The expression is parsed here purely to give immediate feedback in the input; the
 * server re-parses and rolls, and its result is the only one anyone sees. A GM-only roll
 * never reaches a player, so players have no "hidden roll" placeholder in their log.
 *
 * Your public roll is thrown as 3D dice in the middle of your board (throw-dice-on-board); a
 * private roll is thrown in this panel's tray instead, off the shared view. Its text row waits
 * until the dice land so the total is not read before the dice show it. Rolls already on the
 * table when the room loads have landed: joining, reconnecting or switching tabs does not
 * replay them.
 *
 * The die beside the form can be dragged onto the map. That rolls exactly as Roll does; the dice
 * land where the die was let go instead, on the thrower's board and, replayed from a dice drop
 * (ADR 0014), on everyone else's, then the result card says what was rolled.
 */
export function DicePanel({
  connection,
  state,
  isGm,
  rollThrow,
  board,
  selection,
}: {
  connection: RoomConnection;
  state: RoomState;
  isGm: boolean;
  rollThrow: RollThrow;
  /** The room's board, to throw dice onto; absent where there is none. */
  board?: DiceBoard;
  /** GM: the tokens chosen on the board for a group roll (ADR 0046). */
  selection?: GroupSelection;
}) {
  const [expression, setExpression] = useState("1d20");
  const [visibility, setVisibility] = useState<DiceVisibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [who, setWho] = useState("");

  const parsed = parseDiceExpression(expression);
  const invalid = expression.trim() !== "" && !parsed.ok;

  const roll = async (e: FormEvent) => {
    e.preventDefault();
    if (rollThrow.rolling) return;
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    const result = await connection.command(rollCommand(expression, visibility));
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  const rolls = [...state.rolls].reverse();
  const latest = rolls[0];
  // Group rolls are never thrown: they have no dice in the air (ADR 0046).
  const throwing = latest !== undefined && !isGroupRoll(latest) && rollThrow.airborne.has(latest.id);

  /** Roll for a die let go over the map; true once the roll is made, and its dice are on their way. */
  const throwOnBoard = async (aim: { from: Point; to: Point }): Promise<boolean> => {
    if (!parsed.ok) return false;
    setBusy(true);
    // Where the die was let go: kept here so the roll lands there when it arrives, and sent first
    // for everyone else to replay the throw there (ADR 0014). The roll is exactly what Roll sends.
    const drop = { expression: formatExpression(parsed.expression), from: aim.from, to: aim.to };
    const forget = rollThrow.expectDrop(drop);
    connection.ephemeral({ type: "diceDrop", ...drop });
    const result = await withTimeout(connection.command(rollCommand(expression, visibility)), THROW_ANSWER_MS);
    setBusy(false);
    if (!result?.ok) {
      forget();
      setError(result ? result.message : "The roll didn't go through. Try again.");
      return false;
    }
    setError(null);
    return true;
  };

  return (
    <PanelSection id="dice" title="Dice">
      <form onSubmit={roll} className="dice-form">
        <label htmlFor="dice-expression">Expression</label>
        <div className="dice-row">
          <input
            id="dice-expression"
            value={expression}
            onChange={(e) => {
              setExpression(e.target.value);
              setError(null);
            }}
            placeholder="1d20+5"
            aria-invalid={invalid}
            aria-describedby={invalid ? "dice-error" : undefined}
            autoComplete="off"
          />
          <button className="primary"
            type="submit"
            disabled={busy || rollThrow.rolling || !parsed.ok}
            title={rollThrow.rolling ? "Your dice are still on the board" : undefined}
          >
            Roll
          </button>
        </div>

        <div className="dice-quick">
          {QUICK.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => setExpression(q)}>
              {q}
            </button>
          ))}
        </div>

        {board && (
          <DiceThrowHandle
            sides={parsed.ok ? parsed.expression.sides : 20}
            gmOnly={visibility === "gm"}
            blocker={throwBlocker(expression, state.scene.map !== null, visibility === "gm")}
            busy={busy || rollThrow.rolling}
            board={board}
            onThrow={throwOnBoard}
          />
        )}
        {board && <DiceLookPicker roomId={state.roomId} />}

        {isGm && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={visibility === "gm"}
              onChange={(e) => setVisibility(e.target.checked ? "gm" : "public")}
            />
            Roll privately (players won't see it)
          </label>
        )}

        {(invalid || error) && (
          <p id="dice-error" role="alert" className="error">
            {error ?? (parsed.ok ? "" : parsed.message)}
          </p>
        )}
      </form>

      {isGm && selection && <GroupRollForm connection={connection} state={state} selection={selection} visibility={visibility} />}

      <h3 className="sr-only">Latest roll</h3>
      {!latest ? (
        <p className="muted">No rolls yet.</p>
      ) : (
        <>
          {latest.visibility === "gm" && !isGroupRoll(latest) && (
            <DiceTray key={latest.id} roll={trayRoll(latest)} throwing={throwing} onLanded={() => rollThrow.onLanded(latest.id)} />
          )}
          <ul className="plain roll-log" aria-live="polite">
            {/* A new key when the dice land, so the live region announces the result once,
                as it appears, and not the placeholder before it. */}
            <RollRow
              key={throwing || rollThrow.airborne.has(latest.id) ? `${latest.id}:rolling` : latest.id}
              roll={latest}
              state={state}
              rolling={throwing || (isGroupRoll(latest) && rollThrow.airborne.has(latest.id))}
              fresh={!throwing && rollThrow.justLandedId === latest.id}
            />
          </ul>
          <button type="button" className="secondary small history-button" onClick={() => setHistoryOpen(true)}>
            Roll history ({rolls.length})
          </button>
        </>
      )}
      <Modal
        open={historyOpen}
        title="Roll history"
        onClose={() => {
          setHistoryOpen(false);
          setWho("");
        }}
      >
        <RollHistory rolls={rolls} state={state} query={who} onQuery={setWho} />
      </Modal>
    </PanelSection>
  );
}

/** The command both Roll and a throw onto the board send (throw-dice-on-board). */
export function rollCommand(expression: string, visibility: DiceVisibility) {
  return { type: "dice.roll", expression, visibility } as const;
}

/** How long a thrown die waits for the server before it gives up. */
const THROW_ANSWER_MS = 5000;

/** The promise's value, or null if it takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)));
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/**
 * GM only: one expression rolled once for each selected token, logged as one entry (ADR 0046).
 * Uses the panel's GM-only choice, like any other roll.
 */
function GroupRollForm({ connection, state, selection, visibility }: { connection: RoomConnection; state: RoomState; selection: GroupSelection; visibility: DiceVisibility }) {
  const [expression, setExpression] = useState("1d20");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseDiceExpression(expression);
  const tokenIds = selection.tokenIds.filter((id) => state.tokens[id]);

  const roll = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    const result = await connection.command({ type: "dice.rollGroup", tokenIds, expression, label: label.trim() || undefined, visibility });
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  return (
    <form onSubmit={roll} className="stack group-roll-form" aria-labelledby="group-roll-heading">
      <h3 id="group-roll-heading" className="group-roll-heading">Group roll</h3>
      <GroupSelectionList selection={selection} state={state} idPrefix="group-roll" />
      <div className="dice-row">
        <label htmlFor="group-roll-expression" className="sr-only">Group roll expression</label>
        <input id="group-roll-expression" value={expression} onChange={(e) => { setExpression(e.target.value); setError(null); }} placeholder="1d20+2" autoComplete="off" aria-invalid={expression.trim() !== "" && !parsed.ok} />
        <label htmlFor="group-roll-label" className="sr-only">Label</label>
        <input id="group-roll-label" value={label} maxLength={MAX_ATTACK_LABEL} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" autoComplete="off" />
        <button type="submit" disabled={busy || tokenIds.length === 0 || !parsed.ok} title={tokenIds.length === 0 ? "Select tokens first" : undefined}>
          Roll
        </button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

export function trayRoll(r: DiceRoll): TrayRoll {
  const parsed = parseDiceExpression(r.expression);
  // The server parsed this expression before rolling it; the fallback only guards a log
  // entry written by some older build.
  const sides = parsed.ok ? parsed.expression.sides : Math.max(20, ...r.dice);
  return { id: r.id, sides, dice: r.dice, gmOnly: r.visibility === "gm" };
}

function RollRow({
  roll: r,
  state,
  rolling = false,
  fresh = false,
}: {
  roll: LoggedRoll;
  state: RoomState;
  /** The dice are still in the air: say who is rolling what, not the result. */
  rolling?: boolean;
  /** Just landed from a throw: the total arrives with the dice. */
  fresh?: boolean;
}) {
  const who = state.participants[r.byParticipantId]?.displayName ?? "Someone";
  const className = ["roll", r.visibility === "gm" && "private", fresh && "fresh"].filter(Boolean).join(" ");
  if (isGroupRoll(r)) return <GroupRollRow roll={r} who={who} className={className} rolling={rolling} />;
  // A card like a dice tray receipt: the total big in a box with the dice under it, then
  // what was rolled and by whom.
  if (rolling) {
    return (
      <li className={`${className} rolling`} aria-hidden="true">
        <span className="roll-box">
          <span className="roll-total">…</span>
        </span>
        <span className="roll-detail">
          <span className="roll-title">{rollTitle(r, false)}</span>
          <span className="roll-meta">
            {who} is rolling{r.visibility === "gm" && <em className="badge">GM only</em>}
          </span>
        </span>
      </li>
    );
  }
  return (
    <li className={className}>
      <span className="roll-box">
        <span className="roll-total">{r.total}</span>
        <span className="roll-breakdown">({breakdown(r)})</span>
      </span>
      <span className="roll-detail">
        <span className="roll-title">
          <span className="sr-only">{who} rolled </span>
          {rollTitle(r, true)}
        </span>
        <span className="roll-meta" aria-hidden="true">
          {who}{r.visibility === "gm" && <em className="badge">GM only</em>}
        </span>
        {r.visibility === "gm" && <span className="sr-only">, GM only</span>}
      </span>
    </li>
  );
}

/**
 * What was rolled. An attack names who attacked whom (attack-targeting) and, once the dice
 * have landed, the total and the GM's ruling so far: "Aria → Goblin 2 · Longsword · 1d20+5 = 17 · Hit".
 * The ruling is only ever the GM's, made in the Play tab; nothing here compares the roll to
 * anything (ADR 0011).
 */
/** A group roll: what was rolled, then each token's total (ADR 0046). A player's copy lists only the tokens they can see. */
function GroupRollRow({ roll: r, who, className, rolling }: { roll: GroupRoll; who: string; className: string; rolling: boolean }) {
  return (
    <li className={`${className} group-roll`}>
      <span className="roll-detail">
        <span className="roll-title">
          <span className="sr-only">{who} rolled </span>
          {r.label ? `${r.label} · ${r.expression}` : r.expression}
        </span>
        <ul className="plain group-roll-entries">
          {r.entries.map((entry) => (
            <li key={entry.tokenId}>
              <span>{entry.name}</span>{" "}
              {/* The totals wait for the dice dropping onto the tokens (ADR 0046). */}
              {rolling ? <span className="muted">…</span> : <><strong>{entry.total}</strong> <span className="muted">({entry.dice.join(" + ")})</span></>}
            </li>
          ))}
        </ul>
        <span className="roll-meta" aria-hidden="true">
          {who}{r.visibility === "gm" && <em className="badge">GM only</em>}
        </span>
        {r.visibility === "gm" && <span className="sr-only">, GM only</span>}
      </span>
    </li>
  );
}

function rollTitle(r: DiceRoll, landed: boolean) {
  if (!r.attack) return r.expression;
  if (landed) return formatAttackRoll(r);
  return [formatAttackParties(r.attack), attackLabel(r.attack), r.expression].filter(Boolean).join(" · ");
}

/** "12 + 5", "3 + 4 + 1 - 2": each die, then the modifier. */
function breakdown(r: DiceRoll) {
  const dice = r.dice.join(" + ");
  if (r.modifier === 0) return dice;
  return `${dice} ${r.modifier > 0 ? "+" : "-"} ${Math.abs(r.modifier)}`;
}

/** Every roll, newest first, filterable by who rolled it. */
function RollHistory({
  rolls,
  state,
  query,
  onQuery,
}: {
  rolls: RoomState["rolls"];
  state: RoomState;
  query: string;
  onQuery: (q: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const shown = q
    ? rolls.filter((r) => (state.participants[r.byParticipantId]?.displayName ?? "").toLowerCase().includes(q))
    : rolls;
  return (
    <div className="stack">
      <label htmlFor="roll-history-search" className="sr-only">
        Search rolls by player
      </label>
      <input
        id="roll-history-search"
        type="search"
        placeholder="Search by player"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoComplete="off"
        autoFocus
      />
      <p className="muted small-print" role="status">
        {q ? `${shown.length} of ${rolls.length} rolls` : `${rolls.length} ${rolls.length === 1 ? "roll" : "rolls"}`}
      </p>
      {shown.length === 0 ? (
        <p className="muted">No rolls by that player.</p>
      ) : (
        <ul className="plain roll-log roll-history">
          {shown.map((r) => (
            <RollRow key={r.id} roll={r} state={state} />
          ))}
        </ul>
      )}
    </div>
  );
}
