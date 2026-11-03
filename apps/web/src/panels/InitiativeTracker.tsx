import { useState } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { pendingRulingCount } from "./attackRoll";
import { encounterIncludes, includedInEncounter } from "./tokenGroups";
import { initiativeEntries, initiativeFieldValue, invalidInitiative, invalidMessage } from "./initiativeFields";

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
      return setError(invalidMessage(invalid.map((t) => tokens.find((x) => x.id === t.id)?.name ?? "token")));
    }
    const entries = initiativeEntries(scores, chosen);
    if (entries.length === 0) return setError("Give at least one included token an initiative score");
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
      <PanelSection id="initiative" title="Initiative">
        {!isGm && <p className="muted">No encounter running.</p>}
        {isGm && (
          <>
            {tokens.length === 0 ? (
              <p className="muted">Add tokens before starting an encounter.</p>
            ) : (
              <>
                <p className="muted">No encounter running.</p>
                <button className="primary" type="button" data-tour="start-encounter" onClick={() => openSetup()}>
                  Start encounter
                </button>
              </>
            )}
          </>
        )}
        <Modal open={setupOpen} title="Start encounter" onClose={() => setSetupOpen(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <p className="muted init-hint">
              Type each token's initiative. Highest goes first. Scores are saved on the tokens and filled in next time. Tokens left empty or not included won't get a turn.
            </p>
            {groups.length > 0 && (
              <fieldset className="init-groups">
                <legend>Start from groups</legend>
                <p className="muted small-print">Includes the chosen groups and every player's token. Leave all unticked to include everyone.</p>
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
              {tokens.map((t, i) => (
                <li key={t.id} className={isIncluded(t.id) ? undefined : "init-left-out"}>
                  <input
                    type="checkbox"
                    checked={isIncluded(t.id)}
                    onChange={(e) => setIncluded(t.id, e.target.checked)}
                    aria-label={`Include ${t.name}`}
                  />
                  <span className="swatch" style={{ background: t.color }} aria-hidden />
                  <label className="init-name" htmlFor={`init-${t.id}`}>
                    {t.name}
                  </label>
                  <input
                    id={`init-${t.id}`}
                    aria-invalid={invalidIds.includes(t.id) || undefined}
                    aria-describedby={invalidIds.includes(t.id) ? "init-error" : undefined}
                    type="number"
                    inputMode="numeric"
                    placeholder="Init"
                    autoFocus={i === 0}
                    disabled={!isIncluded(t.id)}
                    value={initiativeFieldValue(scores, t)}
                    onChange={(e) => {
                      const next = { ...scores, [t.id]: e.target.value };
                      setScores(next);
                      // Once a score was refused, keep the flagged fields and the message in step with the edits.
                      if (invalidIds.length > 0) {
                        const stillInvalid = invalidInitiative(next, tokens);
                        setInvalidIds(stillInvalid.map((x) => x.id));
                        setError(stillInvalid.length > 0 ? invalidMessage(stillInvalid.map((x) => tokens.find((y) => y.id === x.id)?.name ?? "token")) : null);
                      }
                    }}
                    aria-label={`Initiative for ${t.name}`}
                  />
                </li>
              ))}
            </ul>
            {error && <p id="init-error" role="alert" className="error">{error}</p>}
            <button className="primary" type="submit">Start encounter</button>
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
          Initiative <span className="muted">· round {init.round}</span>
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
                <span className="init-name">{token?.name ?? "(removed)"}</span>
                {isActive && <span className="sr-only">, active turn</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="sr-only">
        {/* No active token means a hidden one has the turn; say nothing about it (FR-GM-23). */}
        {activeId && state.tokens[activeId] ? `${state.tokens[activeId].name} is taking their turn, round ${init.round}.` : `Round ${init.round}.`}
      </p>

      {isGm && (
        <div className="init-controls">
          <button className="primary" onClick={() => send({ type: "initiative.advance" })}>Next turn</button>
          {/* A reminder, not a gate: the GM may move on with rulings open (attack-ux-polish). */}
          {pending > 0 && (
            <span className="muted init-pending" role="status">
              {pending} {pending === 1 ? "ruling" : "rulings"} pending
            </span>
          )}
          <button className="secondary" onClick={() => send({ type: "initiative.end" })}>
            End encounter
          </button>
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </PanelSection>
  );
}
