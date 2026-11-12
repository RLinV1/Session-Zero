import type { ReactNode } from "react";
import { halfDamage, type ConditionId, type Token } from "@vtt/shared";
import { ConditionPicker } from "./ConditionMarker";
import { parseAmount } from "./resolveDraft";
import { t } from "../i18n/locale";

/** One large result in a resolve dialog's header: "Damage 8 · 1d8+3". */
export interface ResolveResult {
  label: string;
  value: string;
  detail?: string | undefined;
}

/**
 * The results a resolve dialog shows beside the target's name (ADR 0046, ADR 0062): the rolls,
 * then the token's HP and Max HP, so they never scroll out of view. Shared by the area effect and
 * attack damage dialogs so the two read alike.
 */
export function ResolveResults({ results, token }: { results: readonly ResolveResult[]; token: Token }) {
  return (
    <dl className="resolve-results">
      {results.map((r) => (
        <div key={r.label} className="resolve-result">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
          {r.detail && <dd className="resolve-result-detail">{r.detail}</dd>}
        </div>
      ))}
      {token.stats.hp !== null && (
        <div className="resolve-result">
          <dt>{t("creature.stat.hp")}</dt>
          <dd>{token.stats.hp}</dd>
          {token.stats.maxHp !== null && <dd className="resolve-result-detail">{t("resolve.ofMax", { n: token.stats.maxHp })}</dd>}
        </div>
      )}
    </dl>
  );
}

/**
 * One target's choices in a resolve dialog: the amount with Half and None, and the conditions to
 * add (never removing one the token has). Shared by the area effect and attack damage dialogs.
 */
export function ResolveTargetBody({
  name,
  token,
  fieldId,
  amount,
  rolled,
  onAmount,
  conditionsOn,
  added,
  onAdded,
  children,
}: {
  name: string;
  token: Token;
  fieldId: string;
  /** The amount as the field shows it. */
  amount: string;
  /** The rolled damage Half halves, rounded down. */
  rolled: number;
  onAmount: (text: string) => void;
  conditionsOn: boolean;
  added: readonly ConditionId[];
  onAdded: (next: ConditionId[]) => void;
  /** Extra controls under the conditions, such as the area dialog's "apply to every target". */
  children?: ReactNode;
}) {
  const hintId = `${fieldId}-hint`;
  return (
    <div className="resolve-target">
      {token.stats.hp === null ? (
        <p className="muted">{t("resolve.noHp", { name })}</p>
      ) : (
        <div className="resolve-amount">
          <label htmlFor={fieldId}>{t("resolve.amount")}</label>
          <input id={fieldId} inputMode="numeric" value={amount} onChange={(e) => onAmount(e.target.value)} aria-invalid={parseAmount(amount) === null} aria-describedby={hintId} />
          <button type="button" className="secondary small" onClick={() => onAmount(String(halfDamage(rolled)))}>{t("resolve.half")}</button>
          <button type="button" className="secondary small" onClick={() => onAmount("0")}>{t("resolve.none")}</button>
          <span id={hintId} className="muted small-print">{t("resolve.negativeHeals")}</span>
        </div>
      )}
      {conditionsOn && (
        <>
          <ConditionPicker
            value={[...added]}
            locked={token.conditions}
            onChange={(next) => onAdded(next.filter((c) => !token.conditions.includes(c)))}
          />
          {children}
        </>
      )}
    </div>
  );
}
