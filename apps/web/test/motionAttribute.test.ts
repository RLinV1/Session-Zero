// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setClientSettings } from "../src/ui/clientSettings";
import { animationLevel, motionReduced, syncMotionAttribute, watchAnimationLevel } from "../src/ui/motion";

let systemReduces = false;
let fire: (() => void) | null = null;

beforeEach(() => {
  systemReduces = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("reduce") && systemReduces;
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => {
      fire = fn;
    },
    removeEventListener: () => {
      fire = null;
    },
  }));
  setClientSettings({ animationLevel: "full" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-motion");
});

describe("one reduced-motion switch for the stylesheet (design-language: Reduced motion everywhere)", () => {
  it("follows the in-app Animations level", () => {
    const stop = syncMotionAttribute();
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    setClientSettings({ animationLevel: "reduced" });
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduced");
    expect(motionReduced()).toBe(true);
    setClientSettings({ animationLevel: "full" });
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    stop();
  });

  it("follows the system preference as it changes", () => {
    const stop = syncMotionAttribute();
    systemReduces = true;
    fire?.();
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduced");
    systemReduces = false;
    fire?.();
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    stop();
  });

  it("stops following once stopped", () => {
    const stop = syncMotionAttribute();
    stop();
    setClientSettings({ animationLevel: "reduced" });
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
  });
});

describe("the effective Animations level (animation-levels)", () => {
  it("is the saved choice unless the device asks for reduced motion, which forces None", () => {
    for (const level of ["full", "reduced", "none"] as const) {
      setClientSettings({ animationLevel: level });
      systemReduces = false;
      expect(animationLevel()).toBe(level);
      expect(motionReduced()).toBe(level !== "full");
      systemReduces = true;
      expect(animationLevel()).toBe("none");
      expect(motionReduced()).toBe(true);
    }
  });

  it("tells watchers about both device and saved-choice changes", () => {
    const seen: string[] = [];
    const stop = watchAnimationLevel(() => seen.push(animationLevel()));
    setClientSettings({ animationLevel: "reduced" });
    systemReduces = true;
    fire?.();
    systemReduces = false;
    fire?.();
    stop();
    setClientSettings({ animationLevel: "none" });
    expect(seen).toEqual(["reduced", "none", "reduced"]);
  });
});
