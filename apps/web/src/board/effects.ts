import { diceRollsOf, findDiceRoll, isAdjacent, type AnimationDef, type ConditionId, type DiceRoll, type DomainEvent, type Participant, type Point, type RoomState } from "@vtt/shared";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET, SHAPE_DEFAULTS } from "./effectPresets";
import { getClientSettings, QUALITY, type AttackAnimations, type GraphicsQuality } from "../ui/clientSettings";

/**
 * What the board draws for attacks and conditions (KAN-76). Pure: no Pixi, no DOM beyond
 * `matchMedia`, so which events animate, and for whom, is unit-testable. `BoardView` turns
 * these descriptions into graphics.
 */

// ---------- attacks ----------

/** An attack animation, naming tokens by id so it follows them while it plays. */
export type AttackEffect =
  | { kind: "strike"; fromId: string; toId: string; animation: AnimationDef }
  | { kind: "nuke"; animation: AnimationDef; origin: Point; amount: number; tokenIds: string[] }
  /** `fromId`: the attacker, when the viewer can see it, so "Current turn" can tell whose ruling it is. */
  | { kind: "hit" | "miss"; tokenId: string; fromId?: string }
  | { kind: "damage"; tokenId: string; amount: number }
  /** An area effect resolved (ADR 0046): each damaged target's number, all at once. */
  | { kind: "damages"; hits: { tokenId: string; amount: number }[] }
  /** The auto-remove option took a token at 0 HP (ADR 0049); the board keeps it drawn while it falls. */
  | { kind: "defeat"; tokenId: string };

/**
 * The animation a live event should trigger for this viewer, or null. Only reads the viewer's own
 * copy of the room: a side that is null, a token that is absent, or a hidden token (for a player)
 * means nothing plays, so an animation can never point at something the viewer may not see (FR-GM-23).
 * `after` is the viewer's state with the event applied.
 */
export function attackEffectFor(event: DomainEvent, after: RoomState, viewer: Participant): AttackEffect | null {
  const visible = (tokenId: string) => {
    const token = after.tokens[tokenId];
    return token !== undefined && (viewer.role === "gm" || !token.hidden);
  };
  switch (event.type) {
    case "DiceRolled": {
      // The server never sends a player a GM-only roll; refuse one anyway if it ever did.
      if (viewer.role !== "gm" && event.roll.visibility === "gm") return null;
      const { actor, target } = event.roll.attack ?? {};
      if (!actor || !target || !visible(actor.tokenId) || !visible(target.tokenId)) return null;
      // Damage after a to-hit is the same swing: it already struck (no-repeat-strike-on-damage).
      if (event.roll.attack?.kind === "damage" && followsToHit(after, event.roll.id, actor.tokenId, target.tokenId)) return null;
      return { kind: "strike", fromId: actor.tokenId, toId: target.tokenId, animation: strikeAnimation(event.roll, after) };
    }
    case "RollRuled": {
      if (!event.verdict) return null;
      const tokenId = targetOf(after, event.rollId, visible);
      const fromId = findDiceRoll(after.rolls, event.rollId)?.attack?.actor?.tokenId;
      return tokenId ? { kind: event.verdict, tokenId, ...(fromId && { fromId }) } : null;
    }
    case "RollDamageApplied": {
      const tokenId = targetOf(after, event.rollId, visible);
      // "−0" says nothing.
      return tokenId && event.amount > 0 ? { kind: "damage", tokenId, amount: event.amount } : null;
    }
    case "AreaEffectResolved": {
      // The viewer's copy carries amounts only for targets they can see; heals and 0 show nothing.
      const hits = event.amounts.filter((a) => a.amount > 0 && visible(a.tokenId));
      return hits.length > 0 ? { kind: "damages", hits } : null;
    }
    case "TokenDeleted": {
      // The token is gone from `after`, so visibility comes from the event's copy of it (FR-GM-23).
      if (event.reason !== "defeated") return null;
      return viewer.role === "gm" || !event.token.hidden ? { kind: "defeat", tokenId: event.token.id } : null;
    }
    case "MapNuked": {
      // Names no token: the blast hits the viewer's own copy, so a hidden token gets no number (FR-GM-23).
      const tokenIds = Object.values(after.tokens)
        .filter((token) => visible(token.id) && token.stats.hp !== null)
        .map((token) => token.id);
      return { kind: "nuke", animation: event.animation ?? NUKE_PRESET, origin: event.origin, amount: event.amount, tokenIds };
    }
    default:
      return null;
  }
}

/** What Automatic plays (attack-range, ADR 0067): the slash up close, one arrow at range. */
export const AUTOMATIC_MELEE: AnimationDef = SHAPE_DEFAULTS.slash;
export const AUTOMATIC_RANGED: AnimationDef = SHAPE_DEFAULTS.arrow;

/**
 * The roll's own animation, else its style's built-in, else Automatic: the named attack's kind of
 * range when it has one (melee: slash, ranged: arrow), otherwise the slash when the two tokens
 * touch and the arrow when they don't. Only what every viewer has decides it, so all see the same.
 */
export function strikeAnimation(roll: DiceRoll, state: RoomState): AnimationDef {
  const attack = roll.attack;
  if (attack?.animation) return attack.animation;
  if (attack?.style) return ATTACK_STYLE_PRESETS[attack.style];
  if (attack?.range) return attack.range === "melee" ? AUTOMATIC_MELEE : AUTOMATIC_RANGED;
  const from = attack?.actor ? state.tokens[attack.actor.tokenId] : undefined;
  const to = attack?.target ? state.tokens[attack.target.tokenId] : undefined;
  if (!from || !to) return AUTOMATIC_MELEE;
  return isAdjacent(from, to, state.scene.grid) ? AUTOMATIC_MELEE : AUTOMATIC_RANGED;
}

/**
 * Whether the latest attack roll before `rollId` from `actorId` at `targetId`, in this viewer's
 * copy of the room, is a to-hit roll. Only the viewer's rolls count, so a GM-only to-hit or one
 * whose sides were hidden from a player leaves the damage roll to strike for them.
 */
function followsToHit(state: RoomState, rollId: string, actorId: string, targetId: string): boolean {
  const rolls = diceRollsOf(state.rolls);
  const at = rolls.findIndex((roll) => roll.id === rollId);
  for (let i = (at === -1 ? rolls.length : at) - 1; i >= 0; i--) {
    const attack = rolls[i]!.attack;
    if (attack?.actor?.tokenId === actorId && attack.target?.tokenId === targetId) return attack.kind === "toHit";
  }
  return false;
}

/**
 * The target of an attack roll whose both sides this viewer can see, or null. A ruling on
 * "Unknown → Aria" plays nothing: the spec allows no attack animation once either side is hidden.
 */
function targetOf(state: RoomState, rollId: string, visible: (tokenId: string) => boolean): string | null {
  const attack = findDiceRoll(state.rolls, rollId)?.attack;
  if (!attack?.actor || !attack.target || !visible(attack.actor.tokenId)) return null;
  return visible(attack.target.tokenId) ? attack.target.tokenId : null;
}

/**
 * What of an effect this viewer's Attack animations choice lets play (board-attack-effects), or
 * null for nothing. Never adds anything: only drops, or keeps a nuke's numbers without its blast.
 * "Current turn" plays a strike or ruling only from the active token, and a nuke only on an NPC's
 * turn (or one the viewer can't see); damage numbers always play, and with no encounter it is "All".
 * A defeat always plays, so a removed token never just vanishes.
 */
export function effectToPlay(effect: AttackEffect, mode: AttackAnimations, state: Pick<RoomState, "initiative" | "tokens">): AttackEffect | null {
  if (mode === "all" || effect.kind === "defeat") return effect;
  if (mode === "none") return null;
  const initiative = state.initiative;
  if (!initiative) return effect;
  const activeId: string | undefined = initiative.order[initiative.activeIndex];
  switch (effect.kind) {
    case "strike": return effect.fromId === activeId ? effect : null;
    case "hit":
    case "miss": return effect.fromId !== undefined && effect.fromId === activeId ? effect : null;
    case "nuke": {
      const active = activeId === undefined ? undefined : state.tokens[activeId];
      if (!active || active.ownerIds.length === 0) return effect;
      const hits = effect.amount > 0 ? effect.tokenIds.map((tokenId) => ({ tokenId, amount: effect.amount })) : [];
      return hits.length > 0 ? { kind: "damages", hits } : null;
    }
    default: return effect;
  }
}

/** Attack effects playing at once; past this the oldest is dropped. */
export const MAX_ATTACK_EFFECTS = 8;

export interface AttackPlan {
  /** False: a static marker on the target, nothing travels (reduced motion). */
  motion: boolean;
  durationMs: number;
}

/**
 * How long an effect lasts and whether it moves. Strikes and nukes last as long as their
 * animation says; the rest are over in 1.5 s or less.
 */
/** The nuke's damage numbers start 0.25 s in and play for 1.4 s, so the effect must outlast them. */
const NUKE_NUMBERS_MS = 1650;

/** Death animations playing at once; past this, further defeats just fade. */
export const MAX_DEFEAT_EFFECTS = 6;
/** Full death effect length, and the plain fade used for reduced motion, low quality or a crowd. */
export const DEFEAT_MS = 700;
export const DEFEAT_FADE_MS = 200;

export interface DefeatPlan {
  /** False: the token only fades; no shake, shrink, grey or particles. */
  motion: boolean;
  durationMs: number;
  particles: number;
}

/** How a defeated token leaves: the full effect, or a plain 200 ms fade (FR-TAC-07). */
export function defeatPlan(input: { reducedMotion: boolean; quality: GraphicsQuality; active: number }): DefeatPlan {
  if (input.reducedMotion || input.quality === "low" || input.active >= MAX_DEFEAT_EFFECTS) {
    return { motion: false, durationMs: DEFEAT_FADE_MS, particles: 0 };
  }
  return { motion: true, durationMs: DEFEAT_MS, particles: Math.round(QUALITY[input.quality].particles / 5) };
}

export function attackPlan(effect: AttackEffect, reducedMotion: boolean): AttackPlan {
  if (reducedMotion) return { motion: false, durationMs: effect.kind === "damage" || effect.kind === "damages" || effect.kind === "nuke" ? 1000 : 600 };
  switch (effect.kind) {
    case "strike":
      return { motion: true, durationMs: Math.round(effect.animation.duration * 1000) };
    case "nuke":
      return { motion: true, durationMs: Math.max(NUKE_NUMBERS_MS, Math.round(effect.animation.duration * 1000)) };
    case "damage":
    case "damages": return { motion: true, durationMs: 1500 };
    default: return { motion: true, durationMs: 900 };
  }
}

/** Share of a strike spent travelling; the rest is the impact on the target. */
export const STRIKE_TRAVEL = 0.6;

// ---------- reduced motion ----------

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const mediaQuery = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null);

export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

/**
 * Whether animations are reduced for this viewer: the device preference, or the GM turning
 * reduced animations on for the whole table (`RoomState.reducedEffects`).
 */
export function effectiveReducedMotion(state: Pick<RoomState, "reducedEffects">, osPrefers: boolean = prefersReducedMotion()): boolean {
  return osPrefers || getClientSettings().reducedAnimations || (state.reducedEffects ?? false);
}

/** Calls `listener` whenever the preference changes; returns the unsubscribe. */
export function watchReducedMotion(listener: (reduced: boolean) => void): () => void {
  const query = mediaQuery();
  if (!query) return () => {};
  const onChange = (e: MediaQueryListEvent) => listener(e.matches);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// ---------- conditions ----------

/** The greyscale strengths of the Unconscious look and of a downed token (downed-token-marker). */
export const UNCONSCIOUS_GREY = 0.6;
export const DOWNED_GREY = 0.75;

/** How a condition changes the token's art (the wrapper inside the token, never its position). */
export interface ArtStyle {
  alpha: number;
  /** Degrees, on top of the token's own rotation. */
  tilt: number;
  /** Vertical squash of the art; 1 is none. */
  squash: number;
  /** How grey the art is drawn: 0 none, 0.6 Unconscious, 0.75 downed (downed-token-marker). */
  grey: number;
  /** Jitter amplitude as a share of the radius; 0 is none. */
  tremble: number;
}

export interface ConditionEffectSpec {
  /** The change to the token's own art, drawn on the board canvas. */
  art: Partial<ArtStyle>;
}

/**
 * The art change of each condition (FR-TAC-08 badges are separate and unchanged). Typed as a total
 * record: a new ConditionId without an entry fails typecheck. The particles and motion that go with
 * a condition are drawn by the React overlay from `effectPresets.ts`.
 */
export const CONDITION_EFFECTS: Record<ConditionId, ConditionEffectSpec> = {
  blinded: { art: {} },
  charmed: { art: {} },
  frightened: { art: { tremble: 0.03 } },
  grappled: { art: {} },
  invisible: { art: { alpha: 0.35 } },
  paralyzed: { art: {} },
  poisoned: { art: {} },
  // Knocked over: the art lies tilted and flattened.
  prone: { art: { tilt: 70, squash: 0.8 } },
  restrained: { art: {} },
  stunned: { art: {} },
  unconscious: { art: { grey: UNCONSCIOUS_GREY } },
  concentrating: { art: {} },
};

/** Conditions whose art moves over time, so the board must keep redrawing. */
export function loopingConditions(conditions: readonly ConditionId[]): ConditionId[] {
  return conditions.filter((id) => CONDITION_EFFECTS[id].art.tremble);
}

/** The combined art style for a token's conditions. Under reduced motion nothing trembles. */
export function artStyleFor(conditions: readonly ConditionId[], reducedMotion: boolean, downed = false): ArtStyle {
  // A downed token (HP 0 or below) is greyer than Unconscious, though not fully (downed-token-marker).
  const style: ArtStyle = { alpha: 1, tilt: 0, squash: 1, grey: downed ? DOWNED_GREY : 0, tremble: 0 };
  for (const id of conditions) {
    const art = CONDITION_EFFECTS[id].art;
    style.alpha = Math.min(style.alpha, art.alpha ?? 1);
    style.tilt = art.tilt ?? style.tilt;
    style.squash = Math.min(style.squash, art.squash ?? 1);
    style.grey = Math.max(style.grey, art.grey ?? 0);
    style.tremble = Math.max(style.tremble, art.tremble ?? 0);
  }
  if (reducedMotion) style.tremble = 0;
  return style;
}

// ---------- render budget ----------

/** Condition loops draw at most this often: 30 frames a second, whatever the display's rate. */
export const LOOP_INTERVAL_MS = 1000 / 30;

/** Whether the condition loop should be running at all (design Decision 6). */
export function conditionLoopWanted(input: { loopingTokens: number; pageVisible: boolean; reducedMotion: boolean }): boolean {
  return input.loopingTokens > 0 && input.pageVisible && !input.reducedMotion;
}

/** True when enough time has passed since `last` for the next loop frame. */
export function loopFrameDue(now: number, last: number): boolean {
  return now - last >= LOOP_INTERVAL_MS;
}
