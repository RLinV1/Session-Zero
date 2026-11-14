import { useCallback, useMemo, useState } from "react";
import type { RoomState, Token } from "@vtt/shared";
import { t } from "../i18n/locale";

/**
 * Ticks over a list that can change under them (ADR 0068): each id starts as `defaultOn` says,
 * keeps the GM's own choice once they change it, and an id that leaves the list is forgotten.
 */
export function useTicks(ids: readonly string[], defaultOn: (id: string) => boolean) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const ticked = useMemo(() => ids.filter((id) => overrides[id] ?? defaultOn(id)), [ids, overrides, defaultOn]);
  const toggle = useCallback((id: string, on: boolean) => setOverrides((all) => ({ ...all, [id]: on })), []);
  const reset = useCallback(() => setOverrides({}), []);
  return { ticked, toggle, reset };
}

/** Tokens the GM can carry from this board (ADR 0068): those on the map, then those still waiting. */
export function carryCandidates(state: RoomState): Token[] {
  return [...Object.values(state.tokens), ...Object.values(state.staged ?? {})];
}

/** Ticked by default: tokens a player owns, and every token still waiting to be placed. */
export function carriedByDefault(state: RoomState): (id: string) => boolean {
  return (id) => Object.hasOwn(state.staged ?? {}, id) || (state.tokens[id]?.ownerIds.length ?? 0) > 0;
}

/** "Alice, Bob" or "no owner", for a token's row. */
export function ownerNames(state: RoomState, token: Token): string {
  const names = token.ownerIds.flatMap((id) => (state.participants[id] ? [state.participants[id]!.displayName] : []));
  return names.length > 0 ? names.join(t("common.listSep")) : t("carry.noOwner");
}

/** The "Carry to the new board" checklist in the apply and activate confirmations (ADR 0068). */
export function CarryChecklist({ state, tokens: only, legend, ticked, onToggle, disabled }: {
  state: RoomState;
  /** The tokens to list; the carry candidates when absent. */
  tokens?: readonly Token[];
  legend?: string;
  ticked: readonly string[];
  onToggle: (id: string, on: boolean) => void;
  disabled?: boolean;
}) {
  const tokens = only ? [...only] : carryCandidates(state);
  if (tokens.length === 0) return null;
  // Player tokens first, always shown; the rest folded away, since the GM rarely carries them.
  const players = tokens.filter((token) => token.ownerIds.length > 0);
  const others = tokens.filter((token) => token.ownerIds.length === 0);
  const row = (token: Token) => (
    <li key={token.id}>
      <label className="checkbox">
        <input type="checkbox" checked={ticked.includes(token.id)} disabled={disabled} onChange={(e) => onToggle(token.id, e.target.checked)} />
        <span>{token.name}</span>
        <span className="muted">{ownerNames(state, token)}</span>
        {Object.hasOwn(state.staged ?? {}, token.id) && <span className="muted">{t("carry.waiting")}</span>}
      </label>
    </li>
  );
  return (
    <fieldset className="carry-checklist">
      <legend>{legend ?? t("carry.legend")}</legend>
      <p className="small-print">{t("carry.hint")}</p>
      {players.length > 0 ? <ul className="plain">{players.map(row)}</ul> : <p className="small-print">{t("carry.noPlayerTokens")}</p>}
      {others.length > 0 && (
        // Opens by itself when one of them is ticked (a waiting token), so no tick is out of sight.
        <details className="carry-others" open={others.some((token) => ticked.includes(token.id)) || undefined}>
          <summary>{t("carry.others", { n: others.length })}</summary>
          <ul className="plain">{others.map(row)}</ul>
        </details>
      )}
    </fieldset>
  );
}
