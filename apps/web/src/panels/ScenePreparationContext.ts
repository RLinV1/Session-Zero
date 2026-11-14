import { createContext } from "react";
import type { RoomState } from "@vtt/shared";

export const ScenePreparationContext = createContext<{
  activeId: string;
  preparing: boolean;
  preview: (sceneId: string) => void;
  /** The live board's room state, while the GM looks at a private scene: what Activate can carry (ADR 0068). */
  live?: RoomState | null;
} | null>(null);
