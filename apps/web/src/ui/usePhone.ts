import { useSyncExternalStore } from "react";

/** The room's phone layout breakpoint; keep in step with COMPACT_WIDTH in RoomPage and the 720px CSS queries. */
const QUERY = "(max-width: 720px)";

const query = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);

/** Whether the window is phone-width. False where there is no matchMedia (jsdom), so tests see the desktop UI. */
export function usePhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = query();
      mq?.addEventListener("change", onChange);
      return () => mq?.removeEventListener("change", onChange);
    },
    () => query()?.matches ?? false,
    () => false,
  );
}
