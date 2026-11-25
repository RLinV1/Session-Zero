// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsMenu } from "../src/ui/SettingsMenu";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  setClientSettings({ ...DEFAULT_CLIENT_SETTINGS, animationLevel: "full" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setClientSettings(DEFAULT_CLIENT_SETTINGS);
});

describe("device reduced motion locks Animations at None (animation-levels)", () => {
  it("shows None, cannot be changed, and says why", () => {
    render(<SettingsMenu open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Graphics" }));
    const select = screen.getByLabelText("Animations") as HTMLSelectElement;
    expect(select.value).toBe("none");
    expect(select.disabled).toBe(true);
    expect(screen.getByText(/device asks for reduced motion/)).toBeTruthy();
  });
});
