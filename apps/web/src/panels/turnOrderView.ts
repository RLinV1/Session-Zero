/** How many turn order rows show before the rest fold into one "+N more" row (gm-bulk-select). */
export const TURN_ORDER_SHOWN = 3;

/** One row of the turn order as shown: whose it is, and where it sits in the order. */
export interface TurnOrderRow {
  tokenId: string;
  /** Position in `order`, so the row can show the token's place (index + 1). */
  index: number;
  /** The first row past the end of the order, where the list wraps into the next round. */
  startsNextRound: boolean;
}

/**
 * The turn order from the active turn on, wrapping into the next round, split into the rows
 * always shown and the rest the GM can unfold. The active turn is always the first row, so it is
 * never folded away. Folds only when at least two rows would be hidden: "+1 more" takes the
 * same room as the row it hides.
 */
export function compactTurnOrder(
  order: readonly string[],
  activeIndex: number,
  shown: number = TURN_ORDER_SHOWN,
): { shown: TurnOrderRow[]; rest: TurnOrderRow[] } {
  const start = order.length > 0 ? Math.min(Math.max(activeIndex, 0), order.length - 1) : 0;
  const rows = order.map((_, k): TurnOrderRow => {
    const index = (start + k) % order.length;
    return { tokenId: order[index]!, index, startsNextRound: k > 0 && index === 0 };
  });
  if (rows.length <= shown + 1) return { shown: rows, rest: [] };
  return { shown: rows.slice(0, shown), rest: rows.slice(shown) };
}
