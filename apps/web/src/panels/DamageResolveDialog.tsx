import { useState } from "react";
import { attackLabel, MAX_AREA_AMOUNT, presetOf, type ConditionId, type DiceRoll, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { ResolveResults, ResolveTargetBody } from "./ResolveTarget";
import { parseAmount } from "./resolveDraft";
import { getLocale, t } from "../i18n/locale";

/**
 * What the GM has set for one damage roll so far (ADR 0060). Kept by the caller while the dialog
 * is closed, so reopening Resolve brings it back; dropped once the roll is applied. `amount` is
 * kept only once the GM touches it; until then the field shows the rolled damage.
 */
export interface DamageDraft {
  amount?: string;
  added: ConditionId[];
}

export const emptyDamageDraft: DamageDraft = { added: [] };

/** The rolled damage the field starts at: the roll's total, a negative total counting as 0. */
const rolledDamage = (roll: DiceRoll) => Math.max(0, roll.total);

/**
 * Resolving one attack damage roll (ADR 0060): the same body as the area effect's resolve dialog
 * (amount with Half / None, conditions to add), for a single target, with one Confirm. Closing
 * sends nothing; the caller closes it once the roll is applied, from this device or another.
 */
export function DamageResolveDialog({
  connection,
  state,
  roll,
  draft,
  onDraft,
  onClose,
}: {
  connection: RoomConnection;
  state: RoomState;
  roll: DiceRoll;
  draft: DamageDraft;
  onDraft: (next: DamageDraft) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attack = roll.attack;
  const token = attack?.target ? state.tokens[attack.target.tokenId] : undefined;
  if (!attack || !token) return null;
  const conditionsOn = presetOf(state).features.conditions;
  const rolled = rolledDamage(roll);
  const amount = draft.amount ?? String(rolled);
  const label = attackLabel(attack, getLocale());

  const confirm = async () => {
    const parsed = parseAmount(amount);
    if (parsed === null) return setError(t("resolve.amountInvalid", { name: token.name, max: MAX_AREA_AMOUNT }));
    setBusy(true);
    const result = await connection.command({
      type: "roll.applyDamage",
      rollId: roll.id,
      amount: parsed,
      addConditions: draft.added.filter((c) => !token.conditions.includes(c)),
    });
    setBusy(false);
    // A refused resolve keeps the dialog open with the server's message; an accepted one closes it
    // when the roll shows as applied.
    setError(result.ok ? null : result.message);
  };

  return (
    <Modal
      open
      title={token.name}
      className="resolve-dock"
      onClose={onClose}
      headerContent={
        <div className="resolve-head">
          <ResolveResults results={[{ label: t("resolve.damage"), value: String(roll.total), detail: roll.expression }]} token={token} />
          {label && <span className="resolve-position">{label}</span>}
        </div>
      }
    >
      <ResolveTargetBody
        name={token.name}
        token={token}
        fieldId={`resolve-damage-${roll.id}`}
        amount={amount}
        rolled={rolled}
        onAmount={(text) => { setError(null); onDraft({ ...draft, amount: text }); }}
        conditionsOn={conditionsOn}
        added={draft.added}
        onAdded={(added) => onDraft({ ...draft, added })}
      />
      {error && <p role="alert" className="error">{error}</p>}
      <div className="resolve-actions">
        <span className="resolve-actions-gap" />
        <button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>{t("resolve.confirm")}</button>
      </div>
    </Modal>
  );
}
