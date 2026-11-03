import { createContext } from "react";

export const ScenePreparationContext = createContext<{
  activeId: string;
  preparing: boolean;
  preview: (sceneId: string) => void;
} | null>(null);
