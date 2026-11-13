import type { CommandInput, DetectedWallsResponse } from "@vtt/shared";
import { createStore } from "zustand/vanilla";
import type { CommandResult, EditorConnection, RoomConnection, RoomSnapshot } from "../../net/roomConnection";
import { applyToDraft, draftCommandProblem, DRAFT_ID, withDetectedWalls, type MapDraft } from "./mapDraft";
import { t } from "../../i18n/locale";

/** The commands the draft holds; `applyToDraft` handles each. */
const DRAFT_COMMANDS = new Set<CommandInput["type"]>(["terrain.paint", "terrain.effect.create", "terrain.effect.rename", "terrain.effect.remove", "wall.update", "wall.add", "wall.remove", "wall.clear", "portal.set", "fog.add", "fog.remove", "fog.replace", "scene.setLineOfSight", "scene.setIsometric", "scene.setBuildings", "scene.setSightRange"]);

/**
 * The room connection as the map editor's Walls and Fog steps see it (map-editor-drafts): wall and
 * fog commands change the draft instead of the room, and everything else, such as wall-detection
 * notices, goes to the real connection. The steps don't need to know they are editing a draft.
 */
export function draftConnection(
  connection: RoomConnection,
  update: (change: (draft: MapDraft) => MapDraft) => void,
  /** The finished detection's walls for a map, fetched with the GM's credential. */
  detectedWalls: (mapUrl: string) => Promise<DetectedWallsResponse>,
  mapUrl: string,
  map: { width: number; height: number },
  isCurrent: () => boolean,
): RoomConnection {
  let next = 0;
  const newId = () => `${DRAFT_ID}${Date.now().toString(36)}-${++next}`;
  const ok: CommandResult = { ok: true, seq: null };

  const command = async (input: CommandInput): Promise<CommandResult> => {
    if (!isCurrent()) return { ok: false, code: "invalid", message: t("editor.mapChangedTryAgain") };
    if (input.type === "wall.applyDetected") {
      try {
        if (input.mapUrl !== mapUrl) return { ok: false, code: "invalid", message: t("editor.detectedOtherMap") };
        const result = await detectedWalls(input.mapUrl);
        if (!isCurrent()) return { ok: false, code: "invalid", message: t("editor.mapChangedTryAgain") };
        const walls = result.walls;
        const { exclude } = input;
        if (exclude && (exclude.resultId !== result.resultId || exclude.indices.some((i) => i < 0 || i >= walls.length))) {
          return { ok: false, code: "invalid", message: t("editor.detectedChanged") };
        }
        const erased = new Set(exclude?.indices);
        const kept = walls.filter((_, i) => !erased.has(i));
        if (kept.length === 0) return { ok: false, code: "invalid", message: t("editor.noDetectedLeft") };
        update((draft) => draft.mapUrl === mapUrl ? withDetectedWalls(draft, kept, newId) : draft);
        return ok;
      } catch (err) {
        return { ok: false, code: "invalid", message: err instanceof Error ? err.message : t("editor.detectedLoadFailed") };
      }
    }
    if (!DRAFT_COMMANDS.has(input.type)) return connection.command(input);
    const problem = draftCommandProblem(input, map);
    if (problem) return { ok: false, code: "invalid", message: problem };
    update((draft) => draft.mapUrl === mapUrl ? applyToDraft(draft, input, newId) ?? draft : draft);
    return ok;
  };

  return new Proxy(connection, {
    get(target, prop) {
      if (prop === "command") return command;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/**
 * A connection with no room behind it, for editing a library map's walls and fog (ADR 0037): wall
 * and fog commands change the draft, and anything else is refused. Wall-detection notices never come.
 */
export function createDraftConnection(
  update: (change: (draft: MapDraft) => MapDraft) => void,
  mapSize: () => { width: number; height: number } | null,
): EditorConnection {
  let next = 0;
  const newId = () => `${DRAFT_ID}${Date.now().toString(36)}-${++next}`;
  const store = createStore<RoomSnapshot>(() => ({
    status: "open", state: null, you: null, seq: 0, snapshots: 0, endReason: null, refusal: null,
  }));
  return {
    store,
    onWallDetection: () => () => true,
    command: async (input) => {
      if (!DRAFT_COMMANDS.has(input.type)) return { ok: false, code: "invalid", message: t("editor.notAvailable") };
      const size = mapSize();
      const problem = size ? draftCommandProblem(input, size) : null;
      if (problem) return { ok: false, code: "invalid", message: problem };
      update((draft) => applyToDraft(draft, input, newId) ?? draft);
      return { ok: true, seq: null };
    },
  };
}
