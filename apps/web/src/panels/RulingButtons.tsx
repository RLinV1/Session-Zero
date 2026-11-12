import type { Verdict } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * The GM's controls on one attack roll (attack-rulings, attack-ux-polish): Hit and Miss on a
 * to-hit roll; on a damage roll, Apply −N, which takes the full damage off at once, and Resolve,
 * which opens its resolve dialog to choose the amount and conditions (ADR 0060). Full-size
 * buttons: these are the GM's most frequent taps.
 *
 * `suggested` marks the verdict the target's AC points to, in the main button colour. It is only a hint: the GM
 * still makes the call, and nothing is ruled until they tap (README §7, ADR 0011).
 */
export function RulingButtons({
  item,
  description,
  busy,
  suggested = null,
  onRule,
  onApply,
  onResolve,
}: {
  item: { kind: "toHit" } | { kind: "damage"; amount: number };
  /** "Aria → Goblin · Longsword, 17", for the buttons' accessible names. */
  description: string;
  busy: boolean;
  /** The verdict the roll against the target's AC points to; null when the target has no AC. */
  suggested?: Verdict | null;
  onRule: (verdict: Verdict) => void;
  onApply: () => void;
  onResolve: () => void;
}) {
  if (item.kind === "damage") {
    return (
      <span className="ruling-buttons">
        <button type="button" disabled={busy} onClick={onApply} aria-label={t("ruling.applyDamage", { n: item.amount, what: description })}>
          {t("ruling.applyMinus", { n: item.amount })}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onResolve} aria-label={t("ruling.resolveNamed", { what: description })}>
          {t("ruling.resolve")}
        </button>
      </span>
    );
  }
  // Without an AC to go by, Hit keeps the main look and Miss the quiet one, as before.
  const look = (verdict: Verdict) =>
    suggested === null ? (verdict === "hit" ? undefined : "secondary") : suggested === verdict ? "primary ruling-suggested" : "secondary";
  return (
    <span className="ruling-buttons">
      <button type="button" className={look("hit")} disabled={busy} onClick={() => onRule("hit")} aria-label={t("ruling.hitNamed", { what: description })}>
        {t("ruling.hit")}
      </button>
      <button type="button" className={look("miss")} disabled={busy} onClick={() => onRule("miss")} aria-label={t("ruling.missNamed", { what: description })}>
        {t("ruling.miss")}
      </button>
    </span>
  );
}
