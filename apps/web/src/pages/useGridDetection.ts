import { useEffect, useRef, useState } from "react";
import type { GridDetectionStatus } from "@vtt/shared";
import { api, ApiError } from "../net/api";

interface DetectionActivation {
  key: string;
}
interface DetectionView {
  activation: DetectionActivation;
  status: GridDetectionStatus | null;
  error: string | null;
  accessDenied: boolean;
}

/** Enabled only by an open editor session. Old polls are discarded on disable, unmount or target change. */
export function useGridDetection(source: "library" | "room", token: string, id: string, mapUrl = "", enabled = true) {
  const key = JSON.stringify([source, token, id, mapUrl, enabled]);
  const [activation, setActivation] = useState<DetectionActivation>(() => ({ key }));
  // Record every activation before preparation effects can consume an old result,
  // including A -> B -> A while B's initial lookup is still pending.
  if (activation.key !== key) setActivation({ key });
  const [view, setView] = useState<DetectionView | null>(null);
  const currentView = enabled && activation.key === key && view?.activation === activation ? view : null;
  const status = currentView?.status ?? null;
  const error = currentView?.error ?? null;
  const accessDenied = currentView?.accessDenied ?? false;
  const initialLoading = enabled && currentView === null;
  const [revision, setRevision] = useState(0);
  const retrying = useRef<DetectionActivation | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const current = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: AbortController | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (!live || generation.current !== current) return;
      abort = new AbortController();
      const signal = abort.signal;
      try {
        // Bound each lookup, not the queue/processing lifetime. Race explicitly so even a
        // transport that ignores abort cannot hold setup open or adopt a timed-out result.
        const next = await Promise.race([
          source === "library" ? api.detection.library(id, signal) : api.detection.room(id, token, mapUrl, signal),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => {
              reject(new Error("Could not check grid fitting"));
              abort?.abort();
            }, 10_000);
          }),
        ]);
        if (!live || generation.current !== current) return;
        setView((previous) => generation.current === current
          ? { activation, status: next, error: null, accessDenied: false } : previous);
        if (next?.status === "queued" || next?.status === "running") timer = setTimeout(() => { void poll(); }, 1500);
      } catch (err) {
        if (!live || generation.current !== current) return;
        const denied = err instanceof ApiError && (err.status === 401 || err.status === 403);
        setView((previous) => generation.current === current ? {
          activation, status: !denied && previous?.activation === activation ? previous.status : null, accessDenied: denied,
          error: err instanceof Error ? err.message : "Could not check analysis",
        } : previous);
        if (!denied) timer = setTimeout(() => { void poll(); }, 3000);
      } finally {
        if (deadline) clearTimeout(deadline);
      }
    };
    void poll();
    return () => { live = false; generation.current++; abort?.abort(); if (timer) clearTimeout(timer); if (deadline) clearTimeout(deadline); };
  }, [source, token, id, mapUrl, key, revision, enabled, activation]);

  const retry = async () => {
    if (!enabled || retrying.current === activation || status?.status !== "error") return;
    retrying.current = activation;
    const current = ++generation.current;
    try {
      const next = source === "library"
        ? await api.detection.retryLibrary(id)
        : await api.detection.retryRoom(id, token, mapUrl);
      if (generation.current === current) {
        setView((previous) => generation.current === current
          ? { activation, status: next, error: null, accessDenied: false } : previous);
        setRevision((n) => n + 1);
      }
    } catch (err) {
      if (generation.current === current) setView((previous) => generation.current === current ? {
        activation, status, error: err instanceof Error ? err.message : "Could not retry analysis",
        accessDenied: err instanceof ApiError && (err.status === 401 || err.status === 403),
      } : previous);
    } finally {
      if (retrying.current === activation) retrying.current = null;
    }
  };

  return { status, error, accessDenied, initialLoading, retry };
}
