import { createRoot, type Root } from "react-dom/client";
import { StudioSnapshot } from "@vtt/shared";
import { SceneStudio, type SceneStudioProps } from "./SceneStudio";

/** The host-proven intake shell owns its bridge; both surfaces mount this exact renderer. */
let root: Root | null = null;
const surface = {
  validate(value: unknown) { return StudioSnapshot.parse(value); },
  render(props: SceneStudioProps) {
    const element = document.getElementById("preparation");
    if (!element) throw new Error("Missing Studio surface");
    root ??= createRoot(element);
    root.render(<SceneStudio {...props} />);
  },
  clear() { root?.render(null); },
};
(globalThis as unknown as { __sceneStudio: typeof surface }).__sceneStudio = surface;
