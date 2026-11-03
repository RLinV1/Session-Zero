import { MAX_AREA_AMOUNT, rolledDamageFor, type AreaEffect, type ConditionId, type RoomState } from "@vtt/shared";

/**
 * What the GM has set in the resolve dialog so far (ADR 0046): kept when the dialog closes, so
 * reopening it brings everything back, and dropped once the effect is resolved or closed.
 * Amounts are kept only once the GM touches them; until then a target shows its rolled damage,
 * so a damage roll that arrives later still fills them in.
 */
export interface ResolveDraft {
  effectId: string;
  /** Which target the dialog shows, as an index into the targets still on the board. */
  step: number;
  /** Amounts as typed, by token id. */
  amounts: Record<string, string>;
  /** Conditions to add, by token id; never one the token already has. */
  added: Record<string, ConditionId[]>;
}

export const emptyDraft = (effectId: string): ResolveDraft => ({ effectId, step: 0, amounts: {}, added: {} });

/** The draft for the open effect: the kept one if it is for this effect, a fresh one otherwise, none without an effect. */
export function draftFor(draft: ResolveDraft | null, effect: Pick<AreaEffect, "id"> | null): ResolveDraft | null {
  if (!effect) return null;
  return draft?.effectId === effect.id ? draft : emptyDraft(effect.id);
}

/** The targets the dialog steps through: the effect's targets still on the board, in order. */
export function resolveTargets(effect: AreaEffect, state: Pick<RoomState, "tokens">): AreaEffect["targets"] {
  return effect.targets.filter((t) => state.tokens[t.tokenId]);
}

/** A target's amount as the field shows it: as typed, else its rolled damage, else 0. */
export function amountText(draft: ResolveDraft, effect: Pick<AreaEffect, "damage">, tokenId: string): string {
  return draft.amounts[tokenId] ?? String(rolledDamageFor(effect, tokenId) ?? 0);
}

/** A typed amount: a whole number within the server's bounds, or null. */
export function parseAmount(text: string): number | null {
  if (!/^\s*-?\d+\s*$/.test(text)) return null;
  const n = Number(text);
  return Math.abs(n) <= MAX_AREA_AMOUNT ? n : null;
}

/** "Apply these conditions to every target": the shown target's additions, added to everyone's. */
export function applyToAll(draft: ResolveDraft, tokenIds: readonly string[], fromTokenId: string, existing: (tokenId: string) => readonly ConditionId[]): ResolveDraft {
  const chosen = draft.added[fromTokenId] ?? [];
  const added = { ...draft.added };
  for (const id of tokenIds) {
    const has = existing(id);
    added[id] = [...new Set([...(added[id] ?? []), ...chosen])].filter((c) => !has.includes(c));
  }
  return { ...draft, added };
}

export type ResolveRow = { tokenId: string; amount: number | null; addConditions: ConditionId[] };

/** The `areaEffect.resolve` rows for every target, or the first target whose amount isn't a number. */
export function resolveRows(draft: ResolveDraft, effect: AreaEffect, state: Pick<RoomState, "tokens">): { ok: true; rows: ResolveRow[] } | { ok: false; message: string; step: number } {
  const targets = resolveTargets(effect, state);
  const rows: ResolveRow[] = [];
  for (const [step, t] of targets.entries()) {
    const token = state.tokens[t.tokenId]!;
    let amount: number | null = null;
    if (token.stats.hp !== null) {
      amount = parseAmount(amountText(draft, effect, t.tokenId));
      if (amount === null) return { ok: false, step, message: `${t.name}'s amount must be a whole number from -${MAX_AREA_AMOUNT} to ${MAX_AREA_AMOUNT}` };
    }
    const addConditions = (draft.added[t.tokenId] ?? []).filter((c) => !token.conditions.includes(c));
    rows.push({ tokenId: t.tokenId, amount, addConditions });
  }
  return { ok: true, rows };
}
