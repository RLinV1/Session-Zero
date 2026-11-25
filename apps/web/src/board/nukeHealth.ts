import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MIN_HP, type RoomState, type TokenStats } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { NUKE_PRESET } from "./effectPresets";
import { motionReduced } from "../ui/motion";
import { subscribeGraphicsSettings } from "../ui/clientSettings";
import { NUKE_DROP_SHARE } from "./fxBudget";

interface HeldHealth {
  hp: number;
  previous: number;
  expected: number;
  received: boolean;
}
export const NukeHealthContext = createContext<Readonly<Record<string, HeldHealth>>>({});

/** Presentation only: commands and the connection always retain authoritative HP. */
export function useNukeHealth(connection: RoomConnection, enabled: boolean) {
  const [held, setHeld] = useState<Record<string, HeldHealth>>({});
  const current = useRef(held);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const impact = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (Object.keys(current.current).length === 0) return;
    current.current = {};
    setHeld({});
  }, []);

  useEffect(() => {
    impact();
    if (!enabled) return;
    const stop = connection.onCommitted(({ event }, before) => {
      if (event.type === "MapNuked") {
        if (document.visibilityState === "hidden" || motionReduced()) return impact();
        const next: Record<string, HeldHealth> = {};
        for (const token of Object.values(before.tokens)) {
          const hp = token.stats.hp;
          if (hp === null) continue;
          next[token.id] = {
            hp: current.current[token.id]?.hp ?? hp,
            previous: hp,
            expected: Math.max(MIN_HP, hp - event.amount),
            received: false,
          };
        }
        current.current = next;
        setHeld(next);
        clearTimeout(timer.current);
        // The renderer releases on its actual impact frame. This also settles HP without WebGL.
        timer.current = setTimeout(impact, (event.animation ?? NUKE_PRESET).duration * NUKE_DROP_SHARE * 1000 + 100);
      } else if (event.type === "TokenStatsSet") {
        const entry = current.current[event.tokenId];
        if (!entry) return;
        if (!entry.received && event.previous.hp === entry.previous && event.stats.hp === entry.expected) {
          entry.received = true;
          return;
        }
        // A newer heal, edit or other damage wins; never hide it behind an earlier nuke.
        const { [event.tokenId]: _removed, ...next } = current.current;
        current.current = next;
        setHeld(next);
      } else if (event.type === "MapNukeUndone" || event.type === "CheckpointRestored" || event.type === "EncounterApplied") {
        impact();
      }
    });
    let snapshots = connection.snapshot.snapshots;
    const stopSnapshots = connection.store.subscribe((snapshot) => {
      if (snapshot.snapshots !== snapshots || snapshot.status !== "open") impact();
      snapshots = snapshot.snapshots;
    });
    const onVisibility = () => { if (document.visibilityState === "hidden") impact(); };
    document.addEventListener("visibilitychange", onVisibility);
    // Local graphics changes dispose the running Pixi effects, so their held HP must settle too.
    const stopSettings = subscribeGraphicsSettings(impact);
    return () => {
      stop();
      stopSnapshots();
      stopSettings();
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [connection, enabled, impact]);

  return { held: enabled ? held : {}, impact };
}

export function useDisplayedStats(token: { id: string; stats: TokenStats }): TokenStats {
  const held = useContext(NukeHealthContext)[token.id];
  return held && token.stats.hp !== null ? { ...token.stats, hp: held.hp } : token.stats;
}

/** Used only to draw the canvas, never as the source of a command. */
export function useDisplayedHealth(state: RoomState): RoomState {
  const held = useContext(NukeHealthContext);
  return useMemo(() => {
    if (Object.keys(held).length === 0) return state;
    const tokens = { ...state.tokens };
    for (const [id, entry] of Object.entries(held)) {
      const token = tokens[id];
      if (token && token.stats.hp !== null) tokens[id] = { ...token, stats: { ...token.stats, hp: entry.hp } };
    }
    return { ...state, tokens };
  }, [state, held]);
}
