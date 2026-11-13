import { isActive, type RoomState, type Token, type TokenGroup } from "@vtt/shared";

/** One roster section: a group's tokens, or the ungrouped ones when `group` is null (KAN-82). */
export interface TokenSection {
  group: TokenGroup | null;
  tokens: Token[];
}

/**
 * The roster's sections: every group in creation order (empty ones too), then "Ungrouped".
 * `tokens` is the list to place, already filtered and sorted by the caller; membership entries for
 * tokens no longer in the room are skipped (they stay in state so an undo can restore them).
 */
export function groupedTokens(state: Pick<RoomState, "groups" | "tokenGroups">, tokens: readonly Token[]): TokenSection[] {
  const sections = new Map<string | null, TokenSection>(
    Object.values(state.groups).map((group) => [group.id, { group, tokens: [] }]),
  );
  const ungrouped: TokenSection = { group: null, tokens: [] };
  for (const token of tokens) {
    const groupId = state.tokenGroups[token.id];
    const section = (groupId !== undefined && sections.get(groupId)) || ungrouped;
    section.tokens.push(token);
  }
  return [...sections.values(), ungrouped];
}

/** Whether an active player owns `token`: what the encounter dialogs' Players' tokens box picks. */
export function isPlayerToken(state: Pick<RoomState, "participants">, token: Pick<Token, "ownerIds">): boolean {
  return token.ownerIds.some((id) => {
    const owner = state.participants[id];
    return owner?.role === "player" && isActive(owner);
  });
}

/**
 * Which tokens the encounter dialogs' filters pick (KAN-82, ADR 0065): the chosen groups' tokens,
 * plus every token an active player owns when `players` is ticked. Unknown groups contribute nothing.
 */
export function encounterIncludes(
  state: Pick<RoomState, "tokens" | "tokenGroups" | "participants">,
  groupIds: readonly string[],
  players: boolean,
): Set<string> {
  const chosen = new Set(groupIds);
  const included = new Set<string>();
  for (const token of Object.values(state.tokens)) {
    if (chosen.has(state.tokenGroups[token.id] ?? "") || (players && isPlayerToken(state, token))) included.add(token.id);
  }
  return included;
}

/**
 * Whether the Start encounter dialog includes a token (KAN-82): left out by hand beats everything,
 * added by hand beats the groups, and with no groups chosen every token is included.
 */
export function includedInEncounter(
  tokenId: string,
  fromGroups: ReadonlySet<string> | null,
  excluded: ReadonlySet<string>,
  added: ReadonlySet<string>,
): boolean {
  return !excluded.has(tokenId) && (added.has(tokenId) || !fromGroups || fromGroups.has(tokenId));
}
