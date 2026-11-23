import { useEffect, useRef, useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import type { FeedbackKind } from "@vtt/shared";

/**
 * What a room adds to a report (FR-PL-11, design D4 and D5): ids, never contents, and a way to
 * capture this viewer's own board. Read when the report is sent, so the event number is current.
 */
export interface FeedbackRoom {
  roomId: string;
  seq: number;
  role: "gm" | "player";
  captureBoard: () => Promise<Blob | null>;
}

interface FeedbackState {
  open: boolean;
  /** Once the dialog has been opened, it stays mounted, so a draft survives closing it. */
  wanted: boolean;
  /** The kind the dialog starts on: a room's "Report a problem" starts on Bug. */
  kind: FeedbackKind;
  /** Set while a room is mounted; read through its getter so it is never stale. */
  room: (() => FeedbackRoom) | null;
}

const feedbackStore = createStore<FeedbackState>(() => ({ open: false, wanted: false, kind: "bug", room: null }));

/** Opens the shared Feedback dialog from a launcher or contextual action. */
export function openFeedback(kind: FeedbackKind = "bug") {
  feedbackStore.setState({ open: true, wanted: true, kind });
}

export function closeFeedback() {
  feedbackStore.setState({ open: false });
}

/** Whether the dialog has been asked for yet, so the app loads its code only then. */
export function useFeedbackWanted(): boolean {
  return useSyncExternalStore(feedbackStore.subscribe, () => feedbackStore.getState().wanted, () => false);
}

export function useFeedbackState(): FeedbackState {
  return useSyncExternalStore(feedbackStore.subscribe, feedbackStore.getState, feedbackStore.getState);
}

/**
 * While the calling room is mounted, reports include its room details and can capture its board.
 * The latest values are read when needed, so a long-open dialog still sends the current event number.
 */
export function useFeedbackRoom(room: FeedbackRoom | null) {
  const latest = useRef(room);
  latest.current = room;
  const present = room !== null;
  useEffect(() => {
    if (!present) return;
    const get = () => latest.current!;
    feedbackStore.setState({ room: get });
    return () => {
      if (feedbackStore.getState().room === get) feedbackStore.setState({ room: null });
    };
  }, [present]);
}
