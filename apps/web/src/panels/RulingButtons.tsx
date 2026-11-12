import type { Verdict } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * The GM's controls on one attack roll (attack-rulings, attack-ux-polish): Hit and Miss on a
 * to-hit roll, Apply −N on a damage roll. Shared by the Rulings list and the GM's own outcome card
 * so the two always act alike. Full-size buttons: these are the GM's most frequent taps.
 */
export function RulingButtons({
  item,
  description,
  busy,
  onRule,
  onApply,
}: {
  item: { kind: "toHit" } | { kind: "damage"; amount: number };
  /** "Aria → Goblin · Longsword, 17", for the buttons' accessible names. */
  description: string;
  busy: boolean;
  onRule: (verdict: Verdict) => void;
  onApply: () => void;
}) {
  if (item.kind === "damage") {
    return (
      <span className="ruling-buttons">
        <button type="button" disabled={busy} onClick={onApply} aria-label={t("ruling.applyDamage", { n: item.amount, what: description })}>
          {t("ruling.applyMinus", { n: item.amount })}
        </button>
      </span>
    );
  }
  return (
    <span className="ruling-buttons">
      <button type="button" disabled={busy} onClick={() => onRule("hit")} aria-label={t("ruling.hitNamed", { what: description })}>
        {t("ruling.hit")}
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => onRule("miss")} aria-label={t("ruling.missNamed", { what: description })}>
        {t("ruling.miss")}
      </button>
    </span>
  );
}
