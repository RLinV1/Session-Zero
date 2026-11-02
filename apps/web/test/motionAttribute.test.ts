// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setClientSettings } from "../src/ui/clientSettings";
import { motionReduced, syncMotionAttribute } from "../src/ui/motion";

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
  setClientSettings({ reducedAnimations: false });
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-motion");
});

describe("one reduced-motion switch for the stylesheet (design-language: Reduced motion everywhere)", () => {
  it("follows the in-app Reduced animations setting", () => {
    const stop = syncMotionAttribute();
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    setClientSettings({ reducedAnimations: true });
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduced");
    expect(motionReduced()).toBe(true);
    setClientSettings({ reducedAnimations: false });
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
    setClientSettings({ reducedAnimations: true });
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
  });
});
