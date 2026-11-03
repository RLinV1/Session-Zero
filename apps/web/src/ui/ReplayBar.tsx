import { useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft, CaretRight, Pause, Play, Rewind } from "@phosphor-icons/react";
import { replayStates, type ReplayFrame, type ReplayPoint, type ReplayResponse, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { playFrom, playTick, REPLAY_STEP_MS, stepLabel, stepTo } from "./replaySteps";

/** Keys typed into a field belong to that field, not to the replay. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Replay of the room's history for whoever opens it (FR-PL-07, ADR 0025). The server filters
 * every step for this participant; this only folds the steps and hands the replayed state up
 * through `onShow`, where the room shows it read-only. Nothing is ever sent to the room.
 */
export function ReplayBar({ roomId, token, onShow, onExit }: {
  roomId: string;
  token: string;
  /** The replayed state to show, or null while nothing is loaded yet. */
  onShow: (state: RoomState | null, frame?: ReplayFrame | null) => void;
  onExit: () => void;
}) {
  const [points, setPoints] = useState<ReplayPoint[] | null>(null);
  const [pointId, setPointId] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => exitRef.current?.focus(), []);

  useEffect(() => {
    const controller = new AbortController();
    api.replayPoints(roomId, token, controller.signal).then((list) => {
      setPoints(list);
      // The latest encounter is usually what a late joiner wants; otherwise the room's start.
      setPointId(([...list].reverse().find((p) => p.kind === "encounter") ?? list[0])?.id ?? null);
    }, (err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't load the replay");
    });
    return () => controller.abort();
  }, [roomId, token]);

  useEffect(() => {
    if (!pointId) return;
    const controller = new AbortController();
    setReplay(null);
    setPlaying(false);
    setError(null);
    api.replay(roomId, token, pointId, controller.signal).then((r) => {
      setReplay(r);
      setIndex(0);
    }, (err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't load the replay");
    });
    return () => controller.abort();
  }, [roomId, token, pointId]);

  // Folded once per replay, so stepping back is a lookup rather than a refold.
  const states = useMemo(() => (replay ? replayStates(replay) : null), [replay]);
  const count = replay?.frames.length ?? 0;
  const shown = states?.[index] ?? null;
  const previousStep = useRef({ replay, index });
  useEffect(() => {
    const previous = previousStep.current;
    const frame = previous.replay === replay && index === previous.index + 1 ? replay?.frames[index - 1] : null;
    previousStep.current = { replay, index };
    onShow(shown, frame);
  }, [shown, onShow, replay, index]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = playTick(index, count);
      setIndex(next.index);
      setPlaying(next.playing);
    }, REPLAY_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, count]);

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    setIndex((i) => playFrom(i, count));
    setPlaying(count > 0);
  };
  const step = (delta: number) => {
    setPlaying(false);
    setIndex((i) => stepTo(i, delta, count));
  };

  // Keyboard: arrows step, Space plays, Escape leaves (not while typing in a field).
  const keys = useRef({ step, togglePlay, onExit });
  keys.current = { step, togglePlay, onExit };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") keys.current.step(-1);
      else if (e.key === "ArrowRight") keys.current.step(1);
      else if (e.key === " " && !(e.target instanceof HTMLButtonElement)) keys.current.togglePlay();
      else if (e.key === "Escape") keys.current.onExit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const point = replay?.point ?? points?.find((p) => p.id === pointId);
  const sentence = index === 0 ? (point ? `${point.label} (${formatTime(point.at)})` : "") : replay?.frames[index - 1]?.sentence ?? "";

  return (
    <section className="replay-bar" aria-label="Replay">
      <div className="replay-row">
        <Rewind size={18} aria-hidden="true" />
        <label className="replay-point">
          <span>Replay from</span>
          <select
            value={pointId ?? ""}
            disabled={!points || points.length === 0}
            onChange={(e) => setPointId(e.target.value)}
          >
            {points?.map((p) => <option key={p.id} value={p.id}>{p.label} · {formatTime(p.at)}</option>)}
          </select>
        </label>
        <button ref={exitRef} type="button" className="replay-exit primary" onClick={onExit}>
          Back to the live table
        </button>
      </div>
      <div className="replay-row">
        <button type="button" className="tool-button" onClick={() => step(-1)} disabled={!replay || index === 0} aria-label="Back one step">
          <CaretLeft size={16} aria-hidden="true" /> Back
        </button>
        <button type="button" className="tool-button" onClick={togglePlay} disabled={!replay || count === 0}>
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="tool-button" onClick={() => step(1)} disabled={!replay || index === count} aria-label="Forward one step">
          Forward <CaretRight size={16} aria-hidden="true" />
        </button>
        <input
          type="range"
          className="replay-slider"
          min={0}
          max={count}
          value={index}
          disabled={!replay || count === 0}
          aria-label="Replay position"
          aria-valuetext={stepLabel(index, count)}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
        <span className="replay-count muted">{replay ? stepLabel(index, count) : "Loading…"}</span>
      </div>
      <p className="replay-sentence" role="status" aria-live="polite">
        {error ?? sentence}
      </p>
      {replay?.truncated && (
        <p className="muted small-print">This replay stops after {count} changes. Pick a later point to see what came next.</p>
      )}
      <p className="muted small-print">You are watching a replay. Nothing you do here reaches the table.</p>
    </section>
  );
}

/** "14:02", in the viewer's own clock. */
function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
