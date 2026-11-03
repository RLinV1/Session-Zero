import { diceRollsOf, findDiceRoll, type AnimationDef, type ConditionId, type DiceRoll, type DomainEvent, type Participant, type Point, type RoomState } from "@vtt/shared";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET, SHAPE_DEFAULTS } from "./effectPresets";
import { getClientSettings } from "../ui/clientSettings";

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
  | { kind: "hit" | "miss"; tokenId: string }
  | { kind: "damage"; tokenId: string; amount: number }
  /** An area effect resolved (ADR 0046): each damaged target's number, all at once. */
  | { kind: "damages"; hits: { tokenId: string; amount: number }[] };

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
      return tokenId ? { kind: event.verdict, tokenId } : null;
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

/** A target this close (grid cells) is struck in melee when the roll names no style. */
export const MELEE_REACH_CELLS = 1.5;

export const RANGED_ATTACK_SHAPES = ["projectile", "volley", "dagger", "fireball", "bolt", "beam"] as const;

/** Unique roll ids vary the default while every viewer chooses the same travelling effect. */
export function rangedAnimationFor(rollId: string): AnimationDef {
  let hash = 2166136261;
  for (let i = 0; i < rollId.length; i++) hash = Math.imul(hash ^ rollId.charCodeAt(i), 16777619);
  return SHAPE_DEFAULTS[RANGED_ATTACK_SHAPES[(hash >>> 0) % RANGED_ATTACK_SHAPES.length]!];
}

/** The roll's own animation, else its style's built-in, else melee or ranged by distance (design Decision 14). */
export function strikeAnimation(roll: DiceRoll, state: RoomState): AnimationDef {
  const attack = roll.attack;
  if (attack?.animation) return attack.animation;
  if (attack?.style) return ATTACK_STYLE_PRESETS[attack.style];
  const from = attack?.actor ? state.tokens[attack.actor.tokenId] : undefined;
  const to = attack?.target ? state.tokens[attack.target.tokenId] : undefined;
  if (!from || !to) return ATTACK_STYLE_PRESETS.melee;
  const cells = Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y) / Math.max(1, state.scene.grid.cellSize);
  return cells <= MELEE_REACH_CELLS ? ATTACK_STYLE_PRESETS.melee : rangedAnimationFor(roll.id);
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

/** How a condition changes the token's art (the wrapper inside the token, never its position). */
export interface ArtStyle {
  alpha: number;
  /** Degrees, on top of the token's own rotation. */
  tilt: number;
  /** Vertical squash of the art; 1 is none. */
  squash: number;
  greyscale: boolean;
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
  unconscious: { art: { greyscale: true } },
  concentrating: { art: {} },
};

/** Conditions whose art moves over time, so the board must keep redrawing. */
export function loopingConditions(conditions: readonly ConditionId[]): ConditionId[] {
  return conditions.filter((id) => CONDITION_EFFECTS[id].art.tremble);
}

/** The combined art style for a token's conditions. Under reduced motion nothing trembles. */
export function artStyleFor(conditions: readonly ConditionId[], reducedMotion: boolean): ArtStyle {
  const style: ArtStyle = { alpha: 1, tilt: 0, squash: 1, greyscale: false, tremble: 0 };
  for (const id of conditions) {
    const art = CONDITION_EFFECTS[id].art;
    style.alpha = Math.min(style.alpha, art.alpha ?? 1);
    style.tilt = art.tilt ?? style.tilt;
    style.squash = Math.min(style.squash, art.squash ?? 1);
    style.greyscale ||= art.greyscale ?? false;
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
