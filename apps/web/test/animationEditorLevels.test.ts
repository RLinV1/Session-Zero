// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnimationDef } from "@vtt/shared";

const fx = vi.hoisted(() => ({ shake: vi.fn(() => () => {}), nuke: vi.fn(), strike: vi.fn() }));
vi.mock("../src/board/screenShake", () => ({ shakeScreen: fx.shake }));
vi.mock("../src/board/fx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/board/fx")>()),
  playNuke: fx.nuke,
  playStrike: fx.strike,
}));
vi.mock("../src/board/fxSound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/board/fxSound")>()),
  withSound: (run: unknown) => run,
}));

import { AnimationPreview } from "../src/board/animationPreview";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET } from "../src/board/effectPresets";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";

/** A preview whose Pixi stage is stood in for: only `play` runs for real. */
function preview() {
  const p = new AnimationPreview(document.createElement("div"));
  Object.assign(p, {
    ready: true, size: { width: 400, height: 300 }, world: { scale: { x: 1 } }, fxLayer: {}, screenFxLayer: {}, screenLayer: {},
    app: { render: vi.fn() },
  });
  return p;
}
const running = { animated: true, duration: 1, update: () => true, destroy: () => {} };

afterEach(() => { vi.clearAllMocks(); setClientSettings(DEFAULT_CLIENT_SETTINGS); });

describe("the Animation Editor plays in full at every level (library-animations, animation-levels)", () => {
  it.each(["full", "reduced", "none"] as const)("plays a nuke's blast and shake at %s", (level) => {
    setClientSettings({ animationLevel: level });
    fx.nuke.mockReturnValue(running);
    preview().play(NUKE_PRESET as AnimationDef);
    expect(fx.shake).toHaveBeenCalledTimes(1);
    expect(fx.nuke.mock.calls[0]![0]).toMatchObject({ reducedMotion: false });
  });

  it("plays a strike unreduced at None", () => {
    setClientSettings({ animationLevel: "none" });
    fx.strike.mockReturnValue(running);
    preview().play(ATTACK_STYLE_PRESETS.melee);
    expect(fx.strike.mock.calls[0]![0]).toMatchObject({ reducedMotion: false });
  });
});
