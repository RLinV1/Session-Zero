import {
  DEFEAT_REMOVAL_IDS, DEFEAT_REMOVALS, DIAGONAL_RULE_IDS, DIAGONAL_RULES, DIFFICULT_TERRAIN_IDS, DIFFICULT_TERRAIN_MODES,
  defeatRemovalOf, diagonalRuleOf, difficultTerrainOf,
  type DefeatRemoval, type DiagonalRule, type DifficultTerrainMode, type RoomDefaults, type RoomState,
} from "@vtt/shared";
import { useT, type TextId } from "../i18n/locale";

/** The rules on the Table tab, and in the GM's room defaults (table-rules, gm-room-defaults). */
export type TableRules = Pick<RoomDefaults, "defeatRemoval" | "hideMapWithoutToken" | "hideHp" | "hideAc" | "diagonalRule" | "difficultTerrain">;

/** A room's rules, with absent ones read as their defaults. */
export const tableRulesOf = (state: RoomState): TableRules => ({
  defeatRemoval: defeatRemovalOf(state),
  hideMapWithoutToken: state.hideMapWithoutToken ?? false,
  hideHp: state.hideHp ?? false,
  hideAc: state.hideAc ?? false,
  diagonalRule: diagonalRuleOf(state),
  difficultTerrain: difficultTerrainOf(state),
});

type Switch = "hideMapWithoutToken" | "hideHp" | "hideAc";
const SWITCHES: { key: Switch; label: TextId }[] = [
  { key: "hideMapWithoutToken", label: "settings.hideMap" },
  { key: "hideHp", label: "settings.hideHp" },
  { key: "hideAc", label: "settings.hideAc" },
];

/**
 * The Table tab's controls, the same wherever they are shown: in a room, where each change is
 * sent as a command, and in Room settings on the dashboard, where they edit a draft. Each change
 * reports only the rule it changed.
 */
export function TableRuleControls({ value, disabled = false, onChange }: {
  value: TableRules;
  disabled?: boolean;
  onChange: (change: Partial<TableRules>) => void;
}) {
  const t = useT();
  return (
    <>
      <label>{t("settings.removeAtZero")}
        <select value={value.defeatRemoval} disabled={disabled} onChange={(e) => onChange({ defeatRemoval: e.target.value as DefeatRemoval })}>
          {DEFEAT_REMOVALS.map((mode) => <option key={mode} value={mode}>{t(DEFEAT_REMOVAL_IDS[mode])}</option>)}
        </select>
      </label>
      {SWITCHES.map(({ key, label }) => (
        <label key={key} className="checkbox">
          <input type="checkbox" role="switch" checked={value[key]} disabled={disabled} onChange={(e) => onChange({ [key]: e.target.checked })} />
          {t(label)}
        </label>
      ))}
      <label>{t("settings.diagonals")}
        <select value={value.diagonalRule} disabled={disabled} onChange={(e) => onChange({ diagonalRule: e.target.value as DiagonalRule })}>
          {DIAGONAL_RULES.map((rule) => <option key={rule} value={rule}>{t(DIAGONAL_RULE_IDS[rule])}</option>)}
        </select>
      </label>
      <label>{t("settings.difficultTerrain")}
        <select value={value.difficultTerrain} disabled={disabled} onChange={(e) => onChange({ difficultTerrain: e.target.value as DifficultTerrainMode })}>
          {DIFFICULT_TERRAIN_MODES.map((mode) => <option key={mode} value={mode}>{t(DIFFICULT_TERRAIN_IDS[mode])}</option>)}
        </select>
      </label>
    </>
  );
}
