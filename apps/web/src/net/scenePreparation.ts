import { createStore } from "zustand/vanilla";
import { INITIAL_SCENE_ID, isScenePreparationCommand, sceneNamesOf, sceneState, type CommandInput } from "@vtt/shared";
import type { CommandResult, RoomConnection, RoomSnapshot } from "./roomConnection";

/** A GM-local view of a persisted inactive board. Nothing switches the room until Activate. */
export function createScenePreparation(live: RoomConnection, onCreated?: (sceneId: string) => void) {
  let selected: string | null = null;
  const project = (): RoomSnapshot => {
    const snapshot = live.snapshot;
    const state = snapshot.state;
    if (snapshot.you?.role !== "gm" || !state) return snapshot;
    if (selected === (state.activeSceneId ?? INITIAL_SCENE_ID)) selected = null;
    const shown = selected ? sceneState(state, selected) : state;
    if (!shown) { selected = null; return snapshot; }
    return { ...snapshot, state: shown };
  };
  const store = createStore<RoomSnapshot>(() => project());
  const refresh = () => store.setState(project(), true);
  const start = () => { refresh(); return live.store.subscribe(refresh); };
  const preview = (sceneId: string) => { selected = sceneId === (live.snapshot.state?.activeSceneId ?? INITIAL_SCENE_ID) ? null : sceneId; refresh(); };
  const command = async (input: CommandInput, scope: string | null): Promise<CommandResult> => {
    if (input.type === "scene.create") {
      const result = await live.command({ ...input, activate: false });
      if (result.ok && live.snapshot.state) {
        const found = Object.entries(sceneNamesOf(live.snapshot.state)).find(([, name]) => name === input.name.trim());
        if (found) { preview(found[0]); onCreated?.(found[0]); }
      }
      return result;
    }
    if (scope) {
      if (isScenePreparationCommand(input)) return live.command({ type: "scene.prepare", sceneId: scope, command: input as Exclude<CommandInput, { type: "scene.prepare" }> });
      if (!["scene.rename", "scene.delete", "scene.switch", "scene.copyCurrent", "chat.send"].includes(input.type)) return { ok: false, code: "invalid", message: "Return to the live scene for that action." };
    }
    const result = await live.command(input);
    if (result.ok && input.type === "scene.switch") { selected = null; refresh(); }
    return result;
  };
  const connections = new Map<string | null, RoomConnection>();
  const scoped = (scope: string | null) => new Proxy(live, {
    get(target, prop) {
      if (prop === "store") return store;
      if (prop === "snapshot") return store.getState();
      if (prop === "command") return (input: CommandInput) => command(input, scope);
      if (prop === "preview" || prop === "ephemeral" || prop === "endPreview") return (...args: unknown[]) => {
        if (scope === null && selected === null) (Reflect.get(target, prop, target) as (...args: unknown[]) => void).apply(target, args);
      };
      if (prop === "onCommitted" || prop === "onEphemeral" || prop === "onRolled") return (listener: (...args: unknown[]) => void) =>
        (Reflect.get(target, prop, target) as (callback: (...args: unknown[]) => void) => unknown).call(target, (...args) => { if (scope === null && selected === null) listener(...args); });
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return {
    get connection() {
      let connection = connections.get(selected);
      if (!connection) {
        connection = scoped(selected);
        connections.set(selected, connection);
      }
      return connection;
    },
    preview,
    get preparing() { return selected !== null; },
    start,
  };
}
