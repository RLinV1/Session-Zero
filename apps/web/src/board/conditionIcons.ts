import { Assets, type Texture } from "pixi.js";
import { CONDITIONS, type ConditionId } from "@vtt/shared";
import { conditionIconUrl } from "../ui/conditionIcon";

/**
 * The condition icons as board textures. A token draws its condition's shape and abbreviation
 * until the icon has loaded, or instead of one that failed (`drawConditions` in boardView).
 */

const loaded = new Map<ConditionId, Texture>();
let loading: Promise<void> | null = null;

/**
 * Loads every icon once for every board. Resolves when each has loaded or failed; if any failed,
 * the next call tries those again.
 */
export function loadConditionIcons(): Promise<void> {
  loading ??= Promise.all(
    CONDITIONS.map(({ id }) =>
      Assets.load<Texture>({ src: conditionIconUrl(id), data: { autoGenerateMipmaps: true } }).then(
        (texture) => {
          loaded.set(id, texture);
          return true;
        },
        () => false,
      ),
    ),
  ).then((ok) => {
    if (ok.includes(false)) loading = null;
  });
  return loading;
}

/** The icon once it has loaded; null before then or if it failed. */
export function conditionIcon(id: ConditionId): Texture | null {
  return loaded.get(id) ?? null;
}
