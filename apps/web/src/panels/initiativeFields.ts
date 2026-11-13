import { isGroupRoll, MAX_GROUP_ROLL_TOKENS, type GroupRoll, type LoggedRoll, type Token } from "@vtt/shared";

import { t } from "../i18n/locale";
type Field = Pick<Token, "id" | "initiative"> & { name?: string };

/** What a token's Start encounter field shows: what the GM typed, else the score saved on the token last time (ADR 0022). */
export function initiativeFieldValue(typed: Record<string, string>, token: Pick<Token, "id" | "initiative">): string {
  return typed[token.id] ?? (token.initiative == null ? "" : String(token.initiative));
}

/** Whether `text` is a score the server accepts: a whole number from -99 to 999. */
export const isValidScore = (text: string) => {
  const n = Number(text);
  return Number.isInteger(n) && n >= -99 && n <= 999;
};

/** Tokens whose field holds something that is not a valid score, so the GM can be told rather than the entry silently dropped. */
export function invalidInitiative(typed: Record<string, string>, tokens: readonly Field[]): Field[] {
  return tokens.filter((t) => {
    const text = initiativeFieldValue(typed, t);
    return text !== "" && !isValidScore(text);
  });
}

/** The entries to send: every token whose field holds a valid score. A cleared field gets no turn and keeps its saved score. */
export function initiativeEntries(typed: Record<string, string>, tokens: readonly Field[]) {
  return tokens
    .map((t) => ({ tokenId: t.id, text: initiativeFieldValue(typed, t) }))
    .filter((e) => e.text !== "" && isValidScore(e.text))
    .map((e) => ({ tokenId: e.tokenId, score: Number(e.text) }));
}

/** The error shown when typed scores are refused, naming the tokens so the GM knows which fields to fix. */
export function invalidMessage(names: readonly string[]): string {
  return t("init.invalid", { names: names.join(t("common.listSep")) });
}

/** The checked tokens split into group rolls the server accepts: at most 30 tokens each (ADR 0046, ADR 0065). */
export function rollChunks(tokenIds: readonly string[], size = MAX_GROUP_ROLL_TOKENS): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += size) chunks.push(tokenIds.slice(i, i + size));
  return chunks;
}

/** An initiative roll sent and not yet seen in the roll log: its tokens, and the log's roll ids when it was sent. */
export interface PendingRoll {
  tokenIds: readonly string[];
  known: readonly string[];
}

/**
 * The group roll that answers `pending`: the newest one by `byParticipantId` that wasn't in the log
 * when it was sent and covers exactly its tokens. A command's reply carries only a sequence number,
 * so the dialog finds its results in the log (ADR 0065).
 */
export function rollFor(rolls: readonly LoggedRoll[], pending: PendingRoll, byParticipantId: string): GroupRoll | undefined {
  const wanted = new Set(pending.tokenIds);
  const known = new Set(pending.known);
  for (let i = rolls.length - 1; i >= 0; i--) {
    const roll = rolls[i]!;
    if (!isGroupRoll(roll) || known.has(roll.id) || roll.byParticipantId !== byParticipantId) continue;
    if (roll.entries.length === wanted.size && roll.entries.every((e) => wanted.has(e.tokenId))) return roll;
  }
  return undefined;
}
