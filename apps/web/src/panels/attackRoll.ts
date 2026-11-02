import { attackLabel, diceRollsOf, formatAttackParties, isInFog, MAX_ATTACK_LABEL, type AttackKind, type AttackPreset, type DiceRoll, type LoggedRoll, type Point, type RoomState, type Token } from "@vtt/shared";
import { measure } from "../board/tools";

/**
 * Pure helpers for the Attack section (attack-targeting). The server rolls whatever `NdX+M` it
 * is sent; the dice picked here are the client's choice, never a rule.
 */

/** The die types the picker offers. */
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export const MAX_ATTACK_DICE = 20;
export const MAX_ATTACK_MODIFIER = 99;

export interface AttackDice {
  count: number;
  sides: number;
  modifier: number;
}

/** What the section last rolled with a token, restored when it is chosen again. */
export interface AttackSettings extends AttackDice {
  label: string;
  /** To hit or damage (ADR 0011). Values stored before it existed have none and read as to hit. */
  kind?: AttackKind;
}

export const DEFAULT_ATTACK: AttackSettings = { count: 1, sides: 20, modifier: 0, label: "", kind: "toHit" };

/** The roll type a stored setting stands for; older ones without it are to hit. */
export const kindOf = (settings: AttackSettings): AttackKind => settings.kind ?? "toHit";

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : min < 0 ? 0 : min;

export const clampCount = (value: number) => clamp(value, 1, MAX_ATTACK_DICE);
export const clampModifier = (value: number) => clamp(value, -MAX_ATTACK_MODIFIER, MAX_ATTACK_MODIFIER);

/** `1d20`, `1d20+5`, `2d6-1`: always a shape `parseDiceExpression` accepts. */
export function attackExpression({ count, sides, modifier }: AttackDice): string {
  const m = clampModifier(modifier);
  const mod = m === 0 ? "" : m > 0 ? `+${m}` : `${m}`;
  return `${clampCount(count)}d${sides}${mod}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isAttackSettings(v: unknown): v is AttackSettings {
  if (!isRecord(v)) return false;
  const { count, sides, modifier, label, kind } = v;
  return (
    Number.isInteger(count) && clampCount(count as number) === count &&
    (DIE_SIDES as readonly unknown[]).includes(sides) &&
    Number.isInteger(modifier) && clampModifier(modifier as number) === modifier &&
    typeof label === "string" &&
    (kind === undefined || kind === "toHit" || kind === "damage")
  );
}

/** Stored last settings by token id; anything malformed or from an older build is ignored. */
export const isSettingsRecord = (v: unknown): v is Record<string, AttackSettings> =>
  isRecord(v) && Object.values(v).every(isAttackSettings);


export interface TargetOption {
  token: Token;
  /** Distance in the grid's units, snapped cell to cell like Measure. */
  units: number;
  /** "15 ft". */
  distance: string;
}

/** Every token in the viewer's state other than the attacker, nearest first, then by name. */
export function targetsByDistance(state: RoomState, attackerId: string): TargetOption[] {
  const attacker = state.tokens[attackerId];
  if (!attacker) return [];
  const grid = state.scene.grid;
  return Object.values(state.tokens)
    .filter((t) => t.id !== attackerId)
    .map((token) => {
      const m = measure(attacker.position, token.position, grid, false);
      return { token, units: m.units, distance: m.label };
    })
    .sort((a, b) => a.units - b.units || a.token.name.localeCompare(b.token.name));
}

/**
 * Whether to ping the target once the roll is accepted. Only for a roll everyone sees, and never
 * on a hidden or fogged target: the ping would show players where it stands (FR-GM-23, ADR 0016).
 */
export const shouldPingTarget = (
  target: { hidden: boolean; position: Point } | undefined,
  visibility: "public" | "gm",
  fog: RoomState["fog"],
): boolean => visibility === "public" && !!target && !target.hidden && !isInFog(fog, target.position);

/** What applying a damage roll takes off: its total, and never less than nothing (ADR 0011). */
export const damageAmount = (roll: Pick<DiceRoll, "total">): number => Math.max(0, roll.total);

export type PendingRuling =
  | { kind: "toHit"; roll: DiceRoll; /** The target's AC now, or null if unset or the target is gone. */ ac: number | null }
  | { kind: "damage"; roll: DiceRoll; hp: number; maxHp: number | null; amount: number };

/**
 * What the GM still has to deal with, newest first (ADR 0011): to-hit rolls without a verdict,
 * and damage rolls not yet applied whose target is still there with HP. Only rolls in the state's
 * window, which are the only ones the server will take a ruling on.
 */
export function pendingRulings(state: RoomState): PendingRuling[] {
  const pending: PendingRuling[] = [];
  for (const roll of diceRollsOf(state.rolls).reverse()) {
    const attack = roll.attack;
    if (!attack) continue;
    const target = attack.target ? state.tokens[attack.target.tokenId] : undefined;
    if (attack.kind === "toHit") {
      if (!roll.verdict) pending.push({ kind: "toHit", roll, ac: target?.stats.ac ?? null });
    } else if (!roll.damageApplied && target && target.stats.hp !== null) {
      pending.push({ kind: "damage", roll, hp: target.stats.hp, maxHp: target.stats.maxHp, amount: damageAmount(roll) });
    }
  }
  return pending;
}

/**
 * How many things wait on the GM (attack-rulings, ADR 0046): the rolls above, plus an open area
 * effect, which counts as one at every stage, waiting on a player included.
 */
export function pendingRulingCount(state: RoomState): number {
  return pendingRulings(state).length + (state.areaEffect ? 1 : 0);
}

/**
 * Who a damage call goes to unless the GM picks someone else (ADR 0046): the first owner of the
 * token whose turn it is, if they are still at the table; otherwise the GM.
 */
export function defaultCaller(state: RoomState, gmId: string): string {
  const init = state.initiative;
  const activeId = init ? init.order[init.activeIndex] : undefined;
  const owner = activeId ? state.tokens[activeId]?.ownerIds[0] : undefined;
  const participant = owner ? state.participants[owner] : undefined;
  return participant && !participant.left && !participant.revoked ? participant.id : gmId;
}

// ---------- Named attacks (attack-ux-polish) ----------

/** Named attacks kept per token. */
export const MAX_PRESETS = 8;

/**
 * A named attack, e.g. "Longsword": a to-hit roll, a damage roll, or both, and optionally a library
 * animation copied in (ADR 0038). The name is only a label; the app never treats a weapon, a spell
 * or claws differently (README §7).
 */
export type { AttackPreset } from "@vtt/shared";

/** A token's named attacks: the room's copy, shared by the GM and its owners (ADR 0034). */
export function presetsForToken(token: Pick<Token, "attacks">): AttackPreset[] {
  return token.attacks ?? [];
}

/**
 * The named attack a to-hit roll was made with, so Roll damage can use its damage dice: the
 * roll's attacker's attack whose name is the roll's label. Null for custom rolls, and when the
 * attack has since been renamed or removed; Roll damage then falls back to Custom roll.
 */
export function presetForRoll(presets: Record<string, AttackPreset[]>, roll: DiceRoll): AttackPreset | null {
  const attack = roll.attack;
  if (!attack?.actor || attack.kind !== "toHit" || !attack.label) return null;
  return (presets[attack.actor.tokenId] ?? []).find((p) => p.name === attack.label && p.toHit) ?? null;
}

const DAMAGE_SUFFIX = " damage";

/** The label a named attack's roll carries: "Longsword", or "Longsword damage", within the 40-character limit. */
export function presetRollLabel(preset: AttackPreset, kind: AttackKind): string {
  if (kind === "toHit") return preset.name.slice(0, MAX_ATTACK_LABEL);
  return preset.name.slice(0, MAX_ATTACK_LABEL - DAMAGE_SUFFIX.length).trimEnd() + DAMAGE_SUFFIX;
}

/** "+5 · 1d8+3": to hit as a bonus when it is a plain d20, the full expression otherwise. */
export function presetSummary(preset: AttackPreset): string {
  const parts: string[] = [];
  if (preset.toHit) {
    const { count, sides, modifier } = preset.toHit;
    parts.push(count === 1 && sides === 20 ? (modifier < 0 ? `${modifier}` : `+${modifier}`) : attackExpression(preset.toHit));
  }
  if (preset.damage) parts.push(attackExpression(preset.damage));
  if (preset.maxTargets !== undefined) parts.push(`up to ${preset.maxTargets} targets`);
  return parts.join(" · ");
}

/**
 * Identifies what the GM has done with a roll, for the player's Play-tab indicator: changes when a
 * verdict is set, changed or cleared, or damage is applied. Null while there is nothing to report.
 */
export function outcomeKey(roll: Pick<DiceRoll, "id" | "verdict" | "damageApplied"> | undefined): string | null {
  if (!roll || (!roll.verdict && !roll.damageApplied)) return null;
  return `${roll.id}:${roll.verdict ?? ""}:${roll.damageApplied ? "applied" : ""}`;
}

/** What the Attack section reacts to (attack-ux-polish): whether a fight is on, and whether it's your go. */
export interface EncounterView {
  inEncounter: boolean;
  /** A token the viewer controls holds the active turn. Always true for the GM during an encounter. */
  yourTurn: boolean;
}

/**
 * Whether the Attack section should open or collapse on this change, or be left alone. It opens
 * when an encounter starts, collapses when it ends, and opens when your turn begins unless you
 * collapsed it yourself during this encounter. Never disabled: attacks outside an encounter
 * (surprise, traps, objects) stay one tap away.
 */
export function attackSectionChange(previous: EncounterView, next: EncounterView, toggledThisEncounter: boolean): "open" | "collapse" | null {
  if (!previous.inEncounter && next.inEncounter) return "open";
  if (previous.inEncounter && !next.inEncounter) return "collapse";
  if (next.inEncounter && !previous.yourTurn && next.yourTurn && !toggledThisEncounter) return "open";
  return null;
}

/** Where the custom roll settings last used per token are kept (attack-targeting). */
export const LAST_USED_KEY = "vtt.attack.last";

/**
 * The participant's latest attack roll, for the Attack section's outcome card. Nothing once an
 * encounter has ended on it: `clearedRollId` is the roll that was latest when the encounter
 * ended, so only a later roll brings the card back (attack-panel-encounter-reset).
 */
export function latestAttackRoll(rolls: readonly LoggedRoll[], participantId: string, clearedRollId: string | null): DiceRoll | undefined {
  const latest = diceRollsOf(rolls).reverse().find((r) => r.attack && r.byParticipantId === participantId);
  return latest && latest.id !== clearedRollId ? latest : undefined;
}

/**
 * The two lines that describe an attack roll in the result card and the board popup
 * (attack-section-compact, board-dice-rolls): "7 damage" or "17 to hit", then "Firebomb · 2d6 · Goblin → Aria".
 */
export function rollHeadline(roll: Pick<DiceRoll, "expression" | "total" | "attack">, rollerName: string): { title: string; meta: string } {
  return roll.attack ? attackHeadline(roll) : { title: String(roll.total), meta: `${rollerName} · ${roll.expression}` };
}

/** Attack rolls read as what they did; see `rollHeadline` for any roll. */
export function attackHeadline(roll: Pick<DiceRoll, "expression" | "total" | "attack">): { title: string; meta: string } {
  const attack = roll.attack;
  const title = `${roll.total} ${attack?.kind === "damage" ? "damage" : "to hit"}`;
  if (!attack) return { title, meta: roll.expression };
  const label = attackLabel(attack);
  return { title, meta: [label, roll.expression, formatAttackParties(attack)].filter(Boolean).join(" · ") };
}
