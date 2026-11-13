import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_GRID } from "@vtt/shared";
import { api } from "../net/api";

/**
 * Where the attack editor is being used (attack-range): the units a range is typed in, and whether
 * animations are turned down for the table. In a room, the room's grid and setting; in the library,
 * the GM's room defaults (gm-room-defaults); otherwise 5 ft.
 */
export interface AttackEditorEnv {
  unitsPerCell: number;
  unitLabel: string;
  /** The GM turned animations down for the room: the preview shows the still version. */
  reducedEffects: boolean;
}

export const DEFAULT_ATTACK_EDITOR_ENV: AttackEditorEnv = { unitsPerCell: DEFAULT_GRID.unitsPerCell, unitLabel: DEFAULT_GRID.unitLabel, reducedEffects: false };

export const AttackEditorContext = createContext<AttackEditorEnv>(DEFAULT_ATTACK_EDITOR_ENV);

export const useAttackEditorEnv = () => useContext(AttackEditorContext);

/** The signed-in GM's own units, for attack editors outside a room; 5 ft until (or unless) they load. */
export function useGmAttackEditorEnv(): AttackEditorEnv {
  const [env, setEnv] = useState(DEFAULT_ATTACK_EDITOR_ENV);
  useEffect(() => {
    let live = true;
    api.roomDefaults.get().then(
      (defaults) => live && setEnv({ unitsPerCell: defaults.unitsPerCell, unitLabel: defaults.unitLabel, reducedEffects: false }),
      () => {},
    );
    return () => { live = false; };
  }, []);
  return env;
}
