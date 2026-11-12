import { useState } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { pendingRulingCount } from "./attackRoll";
import { encounterIncludes, includedInEncounter } from "./tokenGroups";
import { initiativeEntries, initiativeFieldValue, invalidInitiative, invalidMessage } from "./initiativeFields";
import { t } from "../i18n/locale";

/**
 * Turn order (FR-GM-21).
 *
 * The GM rolls or types a score per token and starts the encounter; everyone then sees the
 * same order and the same active turn. Ordering is decided on the server — two clients
 * sorting a tie differently would diverge — so this only ever submits scores.
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
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  /** Tokens whose typed score the last Start refused, so their fields can say so. */
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  /** Groups the encounter starts from (KAN-82); none means every token is included. */
  const [fromGroups, setFromGroups] = useState<string[]>([]);
  /** Tokens the GM left out by hand, on top of what the chosen groups include. */
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const groups = Object.values(state.groups);
  const groupIncluded = fromGroups.length > 0 ? encounterIncludes(state, fromGroups) : null;
  const isIncluded = (id: string) => includedInEncounter(id, groupIncluded, excluded, added);
  const setIncluded = (id: string, include: boolean) => {
    const without = (set: ReadonlySet<string>) => new Set([...set].filter((x) => x !== id));
    setExcluded((set) => (include ? without(set) : new Set([...set, id])));
    setAdded((set) => (include ? new Set([...set, id]) : without(set)));
  };
  const openSetup = (groupIds: string[] = []) => {
    setFromGroups(groupIds);
    setExcluded(new Set());
    setAdded(new Set());
    setSetupOpen(true);
  };

  const start = async () => {
    const chosen = tokens.filter((t) => isIncluded(t.id));
    const invalid = invalidInitiative(scores, chosen);
    setInvalidIds(invalid.map((t) => t.id));
    if (invalid.length > 0) {
      return setError(invalidMessage(invalid.map((entry) => tokens.find((x) => x.id === entry.id)?.name ?? t("common.aToken"))));
    }
    const entries = initiativeEntries(scores, chosen);
    if (entries.length === 0) return setError(t("init.needScore"));
    const result = await connection.command({ type: "initiative.start", entries });
    setError(result.ok ? null : result.message);
    if (result.ok) {
      setSetupOpen(false);
      setScores({});
    }
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
                <button className="primary" type="button" data-tour="start-encounter" onClick={() => openSetup()}>
                  {t("init.start")}
                </button>
              </>
            )}
          </>
        )}
        <Modal open={setupOpen} title={t("init.start")} onClose={() => setSetupOpen(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <p className="muted init-hint">
              {t("init.intro")}
            </p>
            {groups.length > 0 && (
              <fieldset className="init-groups">
                <legend>{t("init.fromGroups")}</legend>
                <p className="muted small-print">{t("init.groupsHint")}</p>
                {groups.map((g) => (
                  <label key={g.id} className="inline">
                    <input
                      type="checkbox"
                      checked={fromGroups.includes(g.id)}
                      onChange={(e) => {
                        setFromGroups((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((x) => x !== g.id)));
                        setExcluded(new Set());
                        setAdded(new Set());
                      }}
                    />
                    {g.name}
                  </label>
                ))}
              </fieldset>
            )}
            <ul className="plain init-setup">
              {tokens.map((entry, i) => (
                <li key={entry.id} className={isIncluded(entry.id) ? undefined : "init-left-out"}>
                  <input
                    type="checkbox"
                    checked={isIncluded(entry.id)}
                    onChange={(e) => setIncluded(entry.id, e.target.checked)}
                    aria-label={t("init.include", { name: entry.name })}
                  />
                  <span className="swatch" style={{ background: entry.color }} aria-hidden />
                  <label className="init-name" htmlFor={`init-${entry.id}`}>
                    {entry.name}
                  </label>
                  <input
                    id={`init-${entry.id}`}
                    aria-invalid={invalidIds.includes(entry.id) || undefined}
                    aria-describedby={invalidIds.includes(entry.id) ? "init-error" : undefined}
                    type="number"
                    inputMode="numeric"
                    placeholder={t("init.placeholder")}
                    autoFocus={i === 0}
                    disabled={!isIncluded(entry.id)}
                    value={initiativeFieldValue(scores, entry)}
                    onChange={(e) => {
                      const next = { ...scores, [entry.id]: e.target.value };
                      setScores(next);
                      // Once a score was refused, keep the flagged fields and the message in step with the edits.
                      if (invalidIds.length > 0) {
                        const stillInvalid = invalidInitiative(next, tokens);
                        setInvalidIds(stillInvalid.map((x) => x.id));
                        setError(stillInvalid.length > 0 ? invalidMessage(stillInvalid.map((x) => tokens.find((y) => y.id === x.id)?.name ?? t("common.aToken"))) : null);
                      }
                    }}
                    aria-label={t("init.forNamed", { name: entry.name })}
                  />
                </li>
              ))}
            </ul>
            {error && <p id="init-error" role="alert" className="error">{error}</p>}
            <button className="primary" type="submit">{t("init.start")}</button>
          </form>
        </Modal>
      </PanelSection>
    );
  }

  const activeId = init.order[init.activeIndex];
  const pending = isGm ? pendingRulingCount(state) : 0;

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
          <button className="primary" onClick={() => send({ type: "initiative.advance" })}>{t("init.next")}</button>
          {/* A reminder, not a gate: the GM may move on with rulings open (attack-ux-polish). */}
          {pending > 0 && (
            <span className="muted init-pending" role="status">
              {t("init.pending", { n: pending })}
            </span>
          )}
          <button className="secondary" onClick={() => send({ type: "initiative.end" })}>
            {t("init.end")}
          </button>
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </PanelSection>
  );
}
