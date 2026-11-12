import { z } from "zod";
import { sharedMsg, validationMessage } from "./i18n";
import { ConditionId } from "./conditions";
import type { TableState } from "./state";

/**
 * Game presets (KAN-63, ADR 0027): which game a room is set up for, chosen when the room is
 * created and kept with it. Each preset is plain data. Everything else (the create-room form,
 * the server's checks, the panels) reads a preset's `features`, never its id, so adding a game is
 * adding one definition here. See docs/GAME_PRESETS.md.
 */

/** Rules features a preset can turn off. A new kind of feature is a code change; a new game is not. */
export interface PresetFeatures {
  /** Attack rolls with to-hit and damage, GM rulings, damage application, named attacks on tokens. */
  attacks: boolean;
  /** Status conditions on tokens. */
  conditions: boolean;
  /** Armor Class on tokens. */
  armorClass: boolean;
}

export interface GamePreset {
  /** Stable and persisted in the room's log: never rename one. */
  id: string;
  name: string;
  /** One line for the create-room form. */
  description: string;
  features: PresetFeatures;
  /** The conditions the token editor offers, in this order. Empty when `features.conditions` is off. */
  conditions: readonly ConditionId[];
  /** The new room's grid units: what one square is worth. */
  grid: { unitsPerCell: number; unitLabel: string };
}

/**
 * Free Mode: the tabletop as it is, with every tool on and no game-specific setup. The only preset
 * for now; game presets (Dungeons & Dragons and others) are added here later as their own entries.
 */
const FREE: GamePreset = {
  id: "free",
  name: "Free Mode",
  description: "The full tabletop: maps, tokens, conditions, attacks, dice, fog and turn order.",
  features: { attacks: true, conditions: true, armorClass: true },
  conditions: ConditionId.options,
  grid: { unitsPerCell: 5, unitLabel: "ft" },
};

/** Every preset, in the order the create-room form offers them. */
export const GAME_PRESETS: readonly GamePreset[] = [FREE];

/** What a room is when it says nothing: every room created before presets existed. */
export const DEFAULT_PRESET_ID = FREE.id;

const byId = (id: string) => GAME_PRESETS.find((p) => p.id === id);

/** A preset id the registry knows. A refined string, so adding a preset needs no schema edit. */
export const GamePresetId = z.string().refine((id) => byId(id) !== undefined, { message: validationMessage(sharedMsg("valid.unknownPreset")) });
export type GamePresetId = z.infer<typeof GamePresetId>;

/** The room's preset; an unknown or missing id reads as the default, so old rooms behave as before. */
export function presetOf(state: { preset?: string | null }): GamePreset {
  return byId(state.preset ?? DEFAULT_PRESET_ID) ?? FREE;
}

/**
 * A table with the data of features `preset` turns off removed: conditions, named attacks and AC.
 * Used when a saved encounter from another game's room is applied (KAN-63).
 */
export function tableForPreset(table: TableState, preset: GamePreset): TableState {
  const { attacks, conditions, armorClass } = preset.features;
  if (attacks && conditions && armorClass) return table;
  const tokens = Object.fromEntries(Object.entries(table.tokens).map(([id, token]) => {
    const { attacks: named, ...rest } = token;
    return [id, {
      ...rest,
      ...(attacks && named ? { attacks: named } : {}),
      conditions: conditions ? token.conditions : [],
      stats: armorClass ? token.stats : { ...token.stats, ac: null },
    }];
  }));
  return { ...table, tokens };
}

/** The preset recorded by a room's first event, for room lists that don't load the room (KAN-63). */
export function presetFromLog(first: { type: string; preset?: string } | undefined): string {
  return first?.type === "RoomCreated" && first.preset ? first.preset : DEFAULT_PRESET_ID;
}
