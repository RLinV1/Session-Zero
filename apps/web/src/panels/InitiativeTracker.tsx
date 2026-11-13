import { useRef, useState, type ReactNode } from "react";
import type { Participant, RoomState, Token } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { DicePoolInput } from "../ui/DicePoolInput";
import { pendingRulingCount } from "./attackRoll";
import { encounterIncludes, includedInEncounter, isPlayerToken } from "./tokenGroups";
import { initiativeEntries, initiativeFieldValue, invalidInitiative, invalidMessage } from "./initiativeFields";
import { useInitiativeRoll, type RolledScore } from "./useInitiativeRoll";
import { t } from "../i18n/locale";

/**
 * Turn order (FR-GM-21).
 *
 * The GM rolls or types a score per token and starts the encounter; everyone then sees the
 * same order and the same active turn. Ordering is decided on the server — two clients
 * sorting a tie differently would diverge — so this only ever submits scores. While the
 * encounter runs, the GM can add and remove tokens; the server places them (ADR 0065).
 */
export function InitiativeTracker({
  connection,
  state,
  you,
  onFocusToken,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  onFocusToken: (tokenId: string) => void;
}) {
  const isGm = you.role === "gm";
  const init = state.initiative;
  const tokens = Object.values(state.tokens);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  // End encounter can't be undone, so it asks first (ADR 0060).
  const [confirmEnd, setConfirmEnd] = useState(false);
  const cancelEndRef = useRef<HTMLButtonElement>(null);
  /** The last token in the order, while the GM confirms that removing it ends the encounter (ADR 0065). */
  const [confirmRemoveLast, setConfirmRemoveLast] = useState<string | null>(null);
  const cancelRemoveRef = useRef<HTMLButtonElement>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Start encounter lists every token, all included until a filter is ticked; Add to encounter
  // lists the tokens outside the order, none checked at first (ADR 0065).
  const outsideOrder = init ? tokens.filter((x) => !init.order.includes(x.id)) : [];
  const start = useEncounterChecklist(state, tokens, "all");
  const add = useEncounterChecklist(state, outsideOrder, "none");
  const open = addOpen ? add : start;

  const roller = useInitiativeRoll(connection, state.rolls, you.id, (totals) => open.applyRolled(totals));

  const openSetup = () => {
    start.reset();
    roller.reset();
    setSetupOpen(true);
  };
  const closeSetup = () => {
    setSetupOpen(false);
    roller.reset();
  };
  const submitStart = async () => {
    const entries = start.entries();
    if (!entries) return;
    const result = await connection.command({ type: "initiative.start", entries });
    start.setError(result.ok ? null : result.message);
    if (result.ok) {
      closeSetup();
      start.clearScores();
    }
  };

  const openAdd = () => {
    add.reset();
    add.clearScores();
    roller.reset();
    setAddOpen(true);
  };
  const closeAdd = () => {
    setAddOpen(false);
    roller.reset();
  };
  const submitAdd = async () => {
    const entries = add.entries();
    if (!entries) return;
    const result = await connection.command({ type: "initiative.add", entries });
    if (!result.ok) return add.setError(result.message);
    closeAdd();
  };

  const send = async (command: Parameters<RoomConnection["command"]>[0]) => {
    const result = await connection.command(command);
    setError(result.ok ? null : result.message);
  };

  if (!init) {
    return (
      <PanelSection id="initiative" title={t("appGuide.initiative.title")}>
        {!isGm && <p className="muted">{t("init.none")}</p>}
        {isGm && (
          <>
            {tokens.length === 0 ? (
              <p className="muted">{t("init.addTokens")}</p>
            ) : (
              <>
                <p className="muted">{t("init.none")}</p>
                <button className="primary" type="button" data-tour="start-encounter" onClick={openSetup}>
                  {t("init.start")}
                </button>
              </>
            )}
          </>
        )}
        <Modal open={setupOpen} title={t("init.start")} onClose={closeSetup}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submitStart();
            }}
          >
            <p className="muted init-hint">{t("init.intro")}</p>
            <EncounterChecklist
              state={state}
              checklist={start}
              rolled={roller.rolled}
              legend={t("init.fromGroups")}
              hint={t("init.groupsHint")}
              idPrefix="init"
              focusFirst
            >
              <FormulaRow roller={roller} tokenIds={start.checkedIds} />
            </EncounterChecklist>
            {start.error && <p id="init-error" role="alert" className="error">{start.error}</p>}
            <button className="primary" type="submit">{t("init.start")}</button>
          </form>
        </Modal>
      </PanelSection>
    );
  }

  const activeId = init.order[init.activeIndex];
  const pending = isGm ? pendingRulingCount(state) : 0;
  const nameOf = (tokenId: string) => state.tokens[tokenId]?.name ?? t("init.removed");

  const remove = (tokenId: string) => {
    // The last one out ends the encounter, so that asks first, like End encounter (ADR 0065).
    if (init.order.length === 1) return setConfirmRemoveLast(tokenId);
    void send({ type: "initiative.remove", tokenId });
  };

  return (
    <PanelSection
      id="initiative"
      title={
        <>
          {t("appGuide.initiative.title")} <span className="muted">{t("init.roundSuffix", { n: init.round })}</span>
        </>
      }
    >
      <ol className="plain init-order">
        {init.order.map((tokenId, i) => {
          const token = state.tokens[tokenId];
          const isActive = i === init.activeIndex;
          return (
            <li key={tokenId} className={isActive ? "init-entry active" : "init-entry"}>
              <button
                type="button"
                className="init-focus"
                onClick={() => onFocusToken(tokenId)}
                aria-current={isActive ? "true" : undefined}
              >
                {/* Marked by text and position, not colour alone. */}
                <span className="init-turn" aria-hidden>
                  {isActive ? "▶" : i + 1}
                </span>
                <span className="swatch" style={{ background: token?.color ?? "#555" }} aria-hidden />
                <span className="init-name">{token?.name ?? t("init.removed")}</span>
                {isActive && <span className="sr-only">{t("init.activeTurn")}</span>}
              </button>
              {isGm && (
                <button
                  type="button"
                  className="secondary small init-remove"
                  aria-label={t("init.removeNamed", { name: nameOf(tokenId) })}
                  onClick={() => remove(tokenId)}
                >
                  {t("init.remove")}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="sr-only">
        {/* No active token means a hidden one has the turn; say nothing about it (FR-GM-23). */}
        {activeId && state.tokens[activeId] ? t("init.takingTurn", { name: state.tokens[activeId].name, n: init.round }) : t("init.round", { n: init.round })}
      </p>

      {isGm && (
        <div className="init-controls">
          <div className="init-turn-buttons">
            {/* Takes back an accidental end turn; the server refuses it on round 1's first turn (ADR 0060). */}
            <button
              type="button"
              className="secondary"
              disabled={init.round <= 1 && init.activeIndex === 0}
              onClick={() => send({ type: "initiative.previous" })}
            >
              {t("init.previous")}
            </button>
            <button type="button" className="primary" onClick={() => send({ type: "initiative.advance" })}>{t("init.next")}</button>
          </div>
          {/* A reminder, not a gate: the GM may move on with rulings open (attack-ux-polish). */}
          {pending > 0 && (
            <span className="muted init-pending" role="status">
              {t("init.pending", { n: pending })}
            </span>
          )}
          <div className="init-end-row">
            <button type="button" className="secondary" onClick={openAdd}>
              {t("init.add")}
            </button>
            <button type="button" className="secondary danger" onClick={() => setConfirmEnd(true)}>
              {t("init.end")}
            </button>
          </div>
          <Modal open={confirmEnd} title={t("init.endConfirmTitle")} onClose={() => setConfirmEnd(false)} initialFocus={cancelEndRef}>
            <p>{t("init.endConfirmBody")}</p>
            <div className="row modal-actions">
              <button ref={cancelEndRef} type="button" className="secondary" onClick={() => setConfirmEnd(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => {
                  setConfirmEnd(false);
                  void send({ type: "initiative.end" });
                }}
              >
                {t("init.end")}
              </button>
            </div>
          </Modal>
          <Modal
            open={confirmRemoveLast !== null}
            title={t("init.removeLastTitle")}
            onClose={() => setConfirmRemoveLast(null)}
            initialFocus={cancelRemoveRef}
          >
            <p>{t("init.removeLastBody", { name: confirmRemoveLast ? nameOf(confirmRemoveLast) : "" })}</p>
            <div className="row modal-actions">
              <button ref={cancelRemoveRef} type="button" className="secondary" onClick={() => setConfirmRemoveLast(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => {
                  const tokenId = confirmRemoveLast;
                  setConfirmRemoveLast(null);
                  if (tokenId) void send({ type: "initiative.remove", tokenId });
                }}
              >
                {t("init.remove")}
              </button>
            </div>
          </Modal>
          <Modal open={addOpen} title={t("init.add")} onClose={closeAdd}>
            {outsideOrder.length === 0 ? (
              <p className="muted">{t("init.addNone")}</p>
            ) : (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitAdd();
                }}
              >
                <p className="muted init-hint">{t("init.addIntro")}</p>
                <EncounterChecklist
                  state={state}
                  checklist={add}
                  rolled={roller.rolled}
                  legend={t("init.addFromGroups")}
                  hint={t("init.addGroupsHint")}
                  idPrefix="init-add"
                >
                  <FormulaRow roller={roller} tokenIds={add.checkedIds} />
                </EncounterChecklist>
                {add.error && <p id="init-add-error" role="alert" className="error">{add.error}</p>}
                <button className="primary" type="submit">{t("init.addSubmit")}</button>
              </form>
            )}
          </Modal>
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </PanelSection>
  );
}

type Checklist = ReturnType<typeof useEncounterChecklist>;

/**
 * What the Start encounter and Add to encounter dialogs share (ADR 0065): which listed tokens are
 * checked (filters, then hand-picked changes on top), the typed scores, and their validation.
 * `unfiltered` is what an untouched dialog includes: every listed token, or none.
 */
function useEncounterChecklist(state: RoomState, listed: readonly Token[], unfiltered: "all" | "none") {
  /** Groups the dialog picks from (KAN-82). */
  const [groupIds, setGroupIds] = useState<string[]>([]);
  /** The Players' tokens box: every token an active player owns. */
  const [players, setPlayers] = useState(false);
  /** Tokens the GM left out or added by hand, on top of what the filters pick. */
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [scores, setScores] = useState<Record<string, string>>({});
  /** Tokens whose typed score the last submit refused, so their fields can say so. */
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const filtered = groupIds.length > 0 || players ? encounterIncludes(state, groupIds, players) : unfiltered === "all" ? null : new Set<string>();
  const isIncluded = (id: string) => includedInEncounter(id, filtered, excluded, added);
  const checked = listed.filter((x) => isIncluded(x.id));
  const nameOf = (id: string) => state.tokens[id]?.name ?? t("common.aToken");

  /** A filter change starts the hand-picked changes over, as the groups always have. */
  const refilter = (nextGroups: string[], nextPlayers: boolean) => {
    setGroupIds(nextGroups);
    setPlayers(nextPlayers);
    setExcluded(new Set());
    setAdded(new Set());
  };
  /** Keeps flagged fields and the message in step once a score was refused. */
  const recheck = (next: Record<string, string>) => {
    if (invalidIds.length === 0) return;
    const stillInvalid = invalidInitiative(next, listed);
    setInvalidIds(stillInvalid.map((x) => x.id));
    setError(stillInvalid.length > 0 ? invalidMessage(stillInvalid.map((x) => nameOf(x.id))) : null);
  };

  return {
    listed,
    groupIds,
    players,
    checkedIds: checked.map((x) => x.id),
    isIncluded,
    scores,
    invalidIds,
    error,
    setError,
    toggleGroup: (groupId: string, on: boolean) => {
      // Players' tokens is its own box: ticking a group never ticks it (token-groups).
      refilter(on ? [...groupIds, groupId] : groupIds.filter((x) => x !== groupId), players);
    },
    togglePlayers: (on: boolean) => refilter(groupIds, on),
    setIncluded: (id: string, include: boolean) => {
      const without = (set: ReadonlySet<string>) => new Set([...set].filter((x) => x !== id));
      setExcluded((set) => (include ? without(set) : new Set([...set, id])));
      setAdded((set) => (include ? new Set([...set, id]) : without(set)));
    },
    setScore: (id: string, text: string) => {
      const next = { ...scores, [id]: text };
      setScores(next);
      recheck(next);
    },
    /** Rolled totals fill their fields; a rolled score is valid, so its field no longer needs flagging. */
    applyRolled: (totals: Record<string, number>) => {
      const next = { ...scores, ...Object.fromEntries(Object.entries(totals).map(([id, n]) => [id, String(n)])) };
      setScores(next);
      recheck(next);
    },
    /** The entries to send, or null after showing why not. */
    entries: () => {
      const invalid = invalidInitiative(scores, checked);
      setInvalidIds(invalid.map((x) => x.id));
      if (invalid.length > 0) {
        setError(invalidMessage(invalid.map((x) => nameOf(x.id))));
        return null;
      }
      const entries = initiativeEntries(scores, checked);
      if (entries.length === 0) {
        setError(t("init.needScore"));
        return null;
      }
      return entries;
    },
    reset: () => {
      refilter([], false);
      setInvalidIds([]);
      setError(null);
    },
    clearScores: () => setScores({}),
  };
}

/**
 * The filters, then `children` (the dice builder and Roll), then one row per listed token; the
 * same in both dialogs (ADR 0065).
 */
function EncounterChecklist({
  state,
  checklist,
  rolled,
  legend,
  hint,
  idPrefix,
  focusFirst,
  children,
}: {
  state: RoomState;
  checklist: Checklist;
  rolled: Record<string, RolledScore>;
  legend: string;
  hint: string;
  idPrefix: string;
  focusFirst?: boolean;
  children: ReactNode;
}) {
  const groups = Object.values(state.groups);
  const hasPlayerTokens = checklist.listed.some((x) => isPlayerToken(state, x));
  const errorId = `${idPrefix}-error`;
  return (
    <>
      {(groups.length > 0 || hasPlayerTokens) && (
        <fieldset className="init-groups">
          <legend>{legend}</legend>
          <p className="muted small-print">{hint}</p>
          {groups.map((g) => (
            <label key={g.id} className="inline">
              <input type="checkbox" checked={checklist.groupIds.includes(g.id)} onChange={(e) => checklist.toggleGroup(g.id, e.target.checked)} />
              {g.name}
            </label>
          ))}
          {hasPlayerTokens && (
            <label className="inline">
              <input type="checkbox" checked={checklist.players} onChange={(e) => checklist.togglePlayers(e.target.checked)} />
              {t("init.playerTokens")}
            </label>
          )}
        </fieldset>
      )}
      {children}
      <ul className="plain init-setup">
        {checklist.listed.map((entry, i) => {
          const included = checklist.isIncluded(entry.id);
          const invalid = checklist.invalidIds.includes(entry.id);
          const fieldId = `${idPrefix}-${entry.id}`;
          return (
            <li key={entry.id} className={included ? undefined : "init-left-out"}>
              <input
                type="checkbox"
                checked={included}
                onChange={(e) => checklist.setIncluded(entry.id, e.target.checked)}
                aria-label={t("init.include", { name: entry.name })}
              />
              <span className="swatch" style={{ background: entry.color }} aria-hidden />
              <label className="init-name" htmlFor={fieldId}>
                {entry.name}
              </label>
              <RolledResult name={entry.name} rolled={rolled[entry.id]} />
              <input
                id={fieldId}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                type="number"
                inputMode="numeric"
                placeholder={t("init.placeholder")}
                autoFocus={focusFirst && i === 0}
                disabled={!included}
                value={initiativeFieldValue(checklist.scores, entry)}
                onChange={(e) => checklist.setScore(entry.id, e.target.value)}
                aria-label={t("init.forNamed", { name: entry.name })}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The dice builder and Roll, for the checked tokens (ADR 0061, ADR 0065). */
function FormulaRow({ roller, tokenIds }: { roller: ReturnType<typeof useInitiativeRoll>; tokenIds: readonly string[] }) {
  const disabled = tokenIds.length === 0 || roller.busy;
  return (
    <div className="stack init-roll">
      <DicePoolInput value={roller.pool} onChange={roller.setPool} label={t("init.formula")} />
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        onClick={() => {
          if (!disabled) void roller.roll(tokenIds);
        }}
        aria-label={t("init.rollFor", { n: tokenIds.length })}
      >
        {t("init.roll")}
      </button>
      {roller.error && <p role="alert" className="error">{roller.error}</p>}
    </div>
  );
}

/** A token's rolled total, left of its score field, unchanged when the score is edited (ADR 0065). */
function RolledResult({ name, rolled }: { name: string; rolled: RolledScore | undefined }) {
  if (!rolled) return <span className="init-rolled" aria-hidden />;
  const label = t("init.rolledResult", { name, total: rolled.total, detail: rolled.detail });
  return (
    <span className="init-rolled" title={label}>
      <span aria-hidden>{rolled.total}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
