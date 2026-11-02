import { useEffect } from "react";
import type { MapImage } from "@vtt/shared";
import { parseGridDraft, withGridSuggestion, type GridDraft, type GridSuggestionSession, type GridPreparation } from "./gridDraft";
import { useGridDetection } from "./useGridDetection";

interface Setup {
  draft: GridDraft;
  preparation?: GridPreparation;
  suggestionSession?: GridSuggestionSession;
}

export type GridDetection = ReturnType<typeof useGridDetection>;

/** One poller for the whole editor, including when its grid tab is unmounted. */
export function useGridPreparation<T extends Setup>({ source, token, id, map, enabled, setup, update }: {
  source: "library" | "room";
  token: string;
  id: string;
  map: MapImage | null;
  enabled: boolean;
  setup: T | null;
  update: (change: (current: T) => T) => void;
}) {
  const detection = useGridDetection(source, token, id, map?.url ?? "", enabled);
  const waiting = enabled && !!setup?.preparation && setup.preparation.phase !== "editable";
  const session = setup?.suggestionSession;
  const { initialLoading, status, error, accessDenied } = detection;

  useEffect(() => {
    if (!waiting || !session) return;
    if (error || accessDenied) session.blocked = true;
    if (!error && !accessDenied && (initialLoading || status?.status === "queued" || status?.status === "running")) {
      if (!initialLoading && setup?.preparation?.phase === "checking") update((current) =>
        current.suggestionSession === session && current.preparation?.phase === "checking"
          ? { ...current, preparation: { phase: "waiting", notice: null } } : current);
      return;
    }
    update((current) => {
      if (current.suggestionSession !== session || current.preparation?.phase === "editable") return current;
      const candidate = !session.blocked && !error && status?.status === "suggested"
        ? withGridSuggestion(current.draft, status.candidate) : null;
      const draft = candidate && parseGridDraft(candidate, map) ? candidate : current.draft;
      const notice = accessDenied ? null : error || status?.status === "error"
        ? "Grid fitting could not finish. Set up the grid manually."
        : status?.status === "no_grid" ? "No grid estimate was found. Set up the grid manually." : null;
      return { ...current, draft, preparation: { phase: "editable", notice } };
    });
  }, [waiting, session, initialLoading, status, error, accessDenied, map, setup?.preparation?.phase, update]);

  const skip = () => {
    if (!waiting || !session) return;
    // Latch before scheduling React state: a completion in the same batch must see manual intent.
    session.blocked = true;
    update((current) => current.suggestionSession === session
      // A completion may have been computed eagerly before React commits it. Preserve
      // the draft from the waiting frame the user dismissed, even in that ordering.
      ? { ...current, draft: setup.draft, preparation: { phase: "editable", notice: null } } : current);
  };

  const label = initialLoading ? "Checking grid…" : status?.status === "queued" ? "Waiting to fit grid…"
    : status?.status === "running" ? "Fitting grid…" : "Checking grid…";
  return { detection, waiting, label, skip };
}
