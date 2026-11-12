import type { Verdict } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * The GM's controls on one attack roll (attack-rulings, attack-ux-polish): Hit and Miss on a
 * to-hit roll, Resolve on a damage roll, which opens its resolve dialog (ADR 0060). Full-size
 * buttons: these are the GM's most frequent taps.
 */
export function RulingButtons({
  item,
  description,
  busy,
  onRule,
  onResolve,
}: {
  item: { kind: "toHit" } | { kind: "damage" };
  /** "Aria → Goblin · Longsword, 17", for the buttons' accessible names. */
  description: string;
  busy: boolean;
  onRule: (verdict: Verdict) => void;
  onResolve: () => void;
}) {
  if (item.kind === "damage") {
    return (
      <span className="ruling-buttons">
        <button type="button" disabled={busy} onClick={onResolve} aria-label={t("ruling.resolveNamed", { what: description })}>
          {t("ruling.resolve")}
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
