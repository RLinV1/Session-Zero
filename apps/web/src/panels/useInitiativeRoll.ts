import { useEffect, useRef, useState } from "react";
import type { LoggedRoll } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { diceBreakdown, poolExpression, poolOf, type DicePool } from "../ui/dicePool";
import { t } from "../i18n/locale";
import { rollChunks, rollFor, type PendingRoll } from "./initiativeFields";

/** A token's last initiative roll, kept beside its score so the GM can refer back to it. */
export interface RolledScore {
  total: number;
  /** The dice that made it, as the roll log shows them: "1d20 (14) + 2". */
  detail: string;
}

/** How long a sent roll may take to show up in the roll log before the dialog gives up on it. */
export const ROLL_ANSWER_MS = 10_000;

/**
 * Rolls the GM's dice pool once per token through the GM-only group roll (ADR 0046, ADR 0065).
 * The dice are thrown on the GM's board only; players receive nothing. A command's reply carries
 * only a sequence number, so results are picked up from the roll log when they arrive, and
 * `onRolled` gets each token's total.
 */
export function useInitiativeRoll(
  connection: RoomConnection,
  rolls: readonly LoggedRoll[],
  youId: string,
  onRolled: (totals: Record<string, number>) => void,
) {
  // Built in the app's dice builder, never typed (ADR 0061).
  const [pool, setPool] = useState<DicePool>(poolOf(20));
  const [rolled, setRolled] = useState<Record<string, RolledScore>>({});
  const [pending, setPending] = useState<PendingRoll[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onRolledRef = useRef(onRolled);
  onRolledRef.current = onRolled;

  useEffect(() => {
    if (pending.length === 0) return;
    const answered = pending.map((p) => ({ p, roll: rollFor(rolls, p, youId) }));
    const found = answered.flatMap(({ roll }) => (roll ? [roll] : []));
    if (found.length === 0) return;
    const results: Record<string, RolledScore> = {};
    for (const roll of found) {
      for (const e of roll.entries) {
        results[e.tokenId] = { total: e.total, detail: diceBreakdown({ expression: roll.expression, dice: e.dice, total: e.total }) };
      }
    }
    setRolled((current) => ({ ...current, ...results }));
    setPending(answered.filter(({ roll }) => !roll).map(({ p }) => p));
    onRolledRef.current(Object.fromEntries(Object.entries(results).map(([id, r]) => [id, r.total])));
  }, [rolls, pending, youId]);

  // A roll that never shows up (a dropped resync, say) mustn't leave Roll disabled for good.
  useEffect(() => {
    if (pending.length === 0) return;
    const timer = setTimeout(() => {
      setPending([]);
      setError(t("init.rollTimeout"));
    }, ROLL_ANSWER_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const roll = async (tokenIds: readonly string[]) => {
    const expression = poolExpression(pool);
    if (tokenIds.length === 0) return;
    setSending(true);
    setError(null);
    const known = rolls.map((r) => r.id);
    // One after another, so each reply's roll is in the log before the next is sent.
    for (const chunk of rollChunks(tokenIds)) {
      const p: PendingRoll = { tokenIds: chunk, known };
      setPending((list) => [...list, p]);
      const result = await connection.command({
        type: "dice.rollGroup",
        tokenIds: chunk,
        expression,
        visibility: "gm",
        label: t("init.rollLabel"),
      });
      if (!result.ok) {
        setPending((list) => list.filter((x) => x !== p));
        setError(result.message);
        break;
      }
    }
    setSending(false);
  };

  const reset = () => {
    setRolled({});
    setPending([]);
    setError(null);
  };

  return { pool, setPool, rolled, roll, busy: sending || pending.length > 0, error, reset };
}
