// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { AnimationDef } from "@vtt/shared";
import { shakeScreen } from "../src/board/screenShake";

const nuke: AnimationDef = { shape: "nuke", duration: 2, primary: "#ff7a1a", secondary: "#fff1c4", size: 3, particles: 120, glow: 1, shake: 1, flash: 1 };

describe("whole-screen nuke shake (FR-TAC-06, ADR 0038)", () => {
  it("shakes the page and ends exactly at rest", () => {
    const cancel = vi.fn();
    const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel }));
    const el = { animate } as unknown as HTMLElement;
    const stop = shakeScreen(nuke, el);
    const [frames, options] = animate.mock.calls[0]!;
    expect(options.duration).toBeCloseTo(831.6);
    expect(options.delay).toBe(920);
    expect(frames.at(-1)?.transform).toBe("translate(0.0px, 0.0px) rotate(0.00deg)");
    expect(frames.some((f) => f.transform !== frames.at(-1)?.transform)).toBe(true);
    stop();
    expect(cancel).toHaveBeenCalled();
  });

  it("does nothing when the animation asks for no shake", () => {
    const animate = vi.fn();
    shakeScreen({ ...nuke, shake: 0 }, { animate } as unknown as HTMLElement);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("shaking an open modal with the page (FR-TAC-09)", () => {
  it("shakes every open dialog along with the page root, on top of its own placement", () => {
    document.body.innerHTML = `<div id="root"></div><dialog open></dialog>`;
    const root = document.getElementById("root")!;
    const dialog = document.querySelector("dialog")!;
    const rootAnimate = vi.fn(() => ({ cancel: vi.fn() }));
    const dialogCancel = vi.fn();
    const dialogAnimate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel: dialogCancel }));
    root.animate = rootAnimate as unknown as HTMLElement["animate"];
    dialog.animate = dialogAnimate as unknown as HTMLElement["animate"];
    const stop = shakeScreen(nuke);
    expect(rootAnimate).toHaveBeenCalledTimes(1);
    expect(dialogAnimate).toHaveBeenCalledTimes(1);
    expect(dialogAnimate.mock.calls[0]![1].composite).toBe("add");
    stop();
    expect(dialogCancel).toHaveBeenCalled();
    document.body.innerHTML = "";
  });
});
