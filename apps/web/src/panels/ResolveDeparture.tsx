import { useId, useState } from "react";
import { isActive, MAX_DEPARTURE_ACTIONS, type DepartureAction, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { t } from "../i18n/locale";

/**
 * The GM decides, token by token, what happens to what a departed player owned (KAN-58,
 * ADR 0006). Rows come from live state, so a token deleted or re-owned elsewhere while this
 * is open simply drops out. Everything chosen is sent as one command and committed together.
 */

/** "" is "Decide later"; "reassign:<id>" names the new owner. */
type Choice = "" | "unassign" | "delete" | `reassign:${string}`;

/** Modal wrapper for one departed participant's review; closed while `participantId` is null. */
export function ResolveDepartureModal({
  connection,
  state,
  participantId,
  onClose,
}: {
  connection: RoomConnection;
  state: RoomState;
  /** The departed participant under review; null keeps the modal closed. */
  participantId: string | null;
  onClose: () => void;
}) {
  const departed = participantId ? state.participants[participantId] : undefined;
  return (
    <Modal open={!!departed} title={departed ? t("depart.tokensOf", { name: departed.displayName }) : t("panel.tokens")} onClose={onClose}>
      {departed && (
        <ResolveForm key={departed.id} connection={connection} state={state} departed={departed} onDone={onClose} />
      )}
    </Modal>
  );
}

/** One row per token the departed participant owns, each with its own choice, plus Apply to all. */
function ResolveForm({
  connection,
  state,
  departed,
  onDone,
}: {
  connection: RoomConnection;
  state: RoomState;
  departed: Participant;
  onDone: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allId = useId();

  const tokens = Object.values(state.tokens)
    .filter((t) => t.ownerIds.includes(departed.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const players = Object.values(state.participants).filter((p) => p.role === "player" && isActive(p));
  /** Display name for a participant id, for the co-owner line. */
  const name = (id: string) => state.participants[id]?.displayName ?? t("common.someone");

  /** The row's current choice; unset rows are "Decide later". */
  const choiceOf = (tokenId: string): Choice => choices[tokenId] ?? "";
  const actions: DepartureAction[] = tokens.flatMap((t): DepartureAction[] => {
    const c = choiceOf(t.id);
    if (c === "") return [];
    if (c === "unassign" || c === "delete") return [{ tokenId: t.id, action: c }];
    return [{ tokenId: t.id, action: "reassign", to: c.slice("reassign:".length) }];
  });
  // "Apply to all" shows a value only while every row agrees; otherwise it reads "Mixed".
  const shared = tokens.length > 0 && tokens.every((t) => choiceOf(t.id) === choiceOf(tokens[0]!.id))
    ? choiceOf(tokens[0]!.id)
    : "mixed";

  /** Sends every choice except "Decide later" as one `participant.resolveDeparture`. */
  async function apply() {
    // The command takes at most this many; past it the server would reject the whole batch
    // with a schema error. Say so in words, and keep every row's choice (ADR 0006).
    if (actions.length > MAX_DEPARTURE_ACTIONS) {
      setError(
        t("depart.tooMany", { max: MAX_DEPARTURE_ACTIONS }),
      );
      return;
    }
    setBusy(true);
    setError(null);
    const result = await connection.command({ type: "participant.resolveDeparture", participantId: departed.id, actions });
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.message);
  }

  const options = (
    <>
      <option value="">{t("gmMap.decideLater")}</option>
      {players.map((p) => (
        <option key={p.id} value={`reassign:${p.id}`}>
          {t("depart.giveTo", { name: p.displayName })}
        </option>
      ))}
      <option value="unassign">{t("depart.unassign")}</option>
      <option value="delete">{t("depart.deleteToken")}</option>
    </>
  );

  if (tokens.length === 0) {
    return (
      <div className="resolve-departure">
        <p>{t("depart.noneLeft", { name: departed.displayName })}</p>
        <div className="row modal-actions">
          <button className="primary" type="button" onClick={onDone}>
            {t("common.done")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="resolve-departure"
      onSubmit={(e) => {
        e.preventDefault();
        void apply();
      }}
    >
      <p>
        {t(departed.revoked ? "depart.introRemoved" : "depart.introLeft", { name: departed.displayName })}
      </p>

      <label className="resolve-all" htmlFor={allId}>
        {t("depart.applyAll")}
        <select
          id={allId}
          value={shared}
          onChange={(e) => {
            const value = e.target.value as Choice;
            setChoices(Object.fromEntries(tokens.map((t) => [t.id, value])));
          }}
        >
          {shared === "mixed" && (
            <option value="mixed" disabled>
              {t("depart.mixed")}
            </option>
          )}
          {options}
        </select>
      </label>

      <ul className="plain resolve-rows">
        {tokens.map((entry) => {
          const others = entry.ownerIds.filter((id) => id !== departed.id);
          return (
            <li key={entry.id} className="resolve-row">
              <span className="resolve-token">
                {entry.imageUrl ? (
                  <img className="swatch large round" src={entry.imageUrl} alt="" />
                ) : (
                  <span className="swatch large" style={{ background: entry.color }} aria-hidden />
                )}
                <span className="resolve-token-text">
                  <span className="resolve-token-name">
                    {entry.name}
                    {entry.hidden && <span className="badge">{t("group.hidden")}</span>}
                  </span>
                  {others.length > 0 && (
                    <span className="muted resolve-coowners">{t("depart.alsoControlled", { names: others.map(name).join(t("common.listSep")) })}</span>
                  )}
                </span>
              </span>
              <select
                aria-label={t("depart.whatHappens", { name: entry.name })}
                value={choiceOf(entry.id)}
                onChange={(e) => setChoices((c) => ({ ...c, [entry.id]: e.target.value as Choice }))}
              >
                {options}
              </select>
            </li>
          );
        })}
      </ul>

      <p className="muted small-print">
        {t("depart.keptEither", { name: departed.displayName })}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row modal-actions">
        <button type="button" className="secondary" onClick={onDone} disabled={busy}>
          {t("common.close")}
        </button>
        <button className="primary" type="submit" disabled={busy || actions.length === 0}>
          {busy ? t("grid.applying") : actions.length === 0 ? t("depart.apply") : t("depart.applyN", { n: actions.length })}
        </button>
      </div>
    </form>
  );
}
