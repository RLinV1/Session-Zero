// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsMenu } from "../src/ui/SettingsMenu";
import { CLIENT_SETTINGS_KEY, DEFAULT_CLIENT_SETTINGS, LEGACY_ARROW_KEY_MOVE_KEY, getClientSettings, graphicsBudget, isClientSettings, setClientSettings, subscribeClientSettings, subscribeGraphicsSettings } from "../src/ui/clientSettings";
import { animationLevel } from "../src/ui/motion";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  setClientSettings(DEFAULT_CLIENT_SETTINGS);
});
afterEach(() => { cleanup(); setClientSettings(DEFAULT_CLIENT_SETTINGS); });

describe("browser settings (FR-TAC-06)", () => {
  it("applies graphics budgets and persists both audio preferences", () => {
    render(<SettingsMenu open onClose={() => {}} />);
    fireEvent.change(screen.getByRole("slider", { name: /Music volume/ }), { target: { value: "25" } });
    fireEvent.change(screen.getByRole("slider", { name: /Sound effects volume/ }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("tab", { name: "Graphics" }));
    fireEvent.change(screen.getByLabelText("Graphics quality"), { target: { value: "low" } });
    expect(graphicsBudget()).toMatchObject({ resolution: 1, emitters: 0, glow: false });
    expect(JSON.parse(localStorage.getItem(CLIENT_SETTINGS_KEY)!)).toMatchObject({ graphicsQuality: "low", musicVolume: 25, soundVolume: 0 });
  });
  it("chooses an Animations level in Graphics (animation-levels)", () => {
    render(<SettingsMenu open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Graphics" }));
    const select = screen.getByLabelText("Animations") as HTMLSelectElement;
    expect(select.value).toBe("full");
    fireEvent.change(select, { target: { value: "reduced" } });
    expect(getClientSettings().animationLevel).toBe("reduced");
    expect(animationLevel()).toBe("reduced");
    fireEvent.change(select, { target: { value: "none" } });
    expect(animationLevel()).toBe("none");
    expect(JSON.parse(localStorage.getItem(CLIENT_SETTINGS_KEY)!)).toMatchObject({ animationLevel: "none" });
    expect(screen.queryByRole("switch", { name: "Reduced animations" })).toBeNull();
  });
  it("carries the old Reduced animations switch forward as a level (animation-levels)", () => {
    const { animationLevel: _l, ...rest } = DEFAULT_CLIENT_SETTINGS;
    expect(reload({ ...rest, reducedAnimations: true }).animationLevel).toBe("reduced");
    expect(reload({ ...rest, reducedAnimations: false }).animationLevel).toBe("full");
    expect(reload({ ...rest }).animationLevel).toBe("full");
    // A saved level beats the old switch; a bad one falls back alone.
    expect(reload({ ...rest, reducedAnimations: true, animationLevel: "none" }).animationLevel).toBe("none");
    expect(reload({ ...rest, musicVolume: 12, animationLevel: "wild" })).toEqual({ ...DEFAULT_CLIENT_SETTINGS, musicVolume: 12 });
    expect(isClientSettings({ ...DEFAULT_CLIENT_SETTINGS, animationLevel: "some" })).toBe(false);
  });
  it("rejects malformed and out-of-range stored settings", () => {
    expect(isClientSettings({ ...DEFAULT_CLIENT_SETTINGS, soundVolume: 101 })).toBe(false);
    expect(isClientSettings({ ...DEFAULT_CLIENT_SETTINGS, musicVolume: null })).toBe(false);
    expect(isClientSettings({ ...DEFAULT_CLIENT_SETTINGS, graphicsQuality: "ultra" })).toBe(false);
    setClientSettings({ soundVolume: -1 });
    expect(getClientSettings()).toEqual(DEFAULT_CLIENT_SETTINGS);
  });
  it("follows changes from another tab", () => {
    render(<SettingsMenu open onClose={() => {}} />);
    localStorage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify({ ...DEFAULT_CLIENT_SETTINGS, musicVolume: 13 }));
    fireEvent(window, new StorageEvent("storage", { key: CLIENT_SETTINGS_KEY }));
    expect((screen.getByRole("slider", { name: /Music volume/ }) as HTMLInputElement).value).toBe("13");
  });
  /** Stores `saved` and has the settings re-read it, as on a fresh load. */
  const reload = (saved: unknown) => {
    localStorage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(saved));
    const stop = subscribeClientSettings(() => {});
    window.dispatchEvent(new StorageEvent("storage", { key: CLIENT_SETTINGS_KEY }));
    stop();
    return getClientSettings();
  };
  it("keeps saved settings when new ones are added (client-settings)", () => {
    const { arrowKeyMove: _a, attackAnimations: _b, ...older } = { ...DEFAULT_CLIENT_SETTINGS, musicVolume: 30 };
    expect(reload(older)).toEqual({ ...DEFAULT_CLIENT_SETTINGS, musicVolume: 30, attackAnimations: "all" });
  });
  it("falls back for one bad saved value without resetting the rest (client-settings)", () => {
    const read = reload({ ...DEFAULT_CLIENT_SETTINGS, soundVolume: 250, graphicsQuality: "low" });
    expect(read.soundVolume).toBe(DEFAULT_CLIENT_SETTINGS.soundVolume);
    expect(read.graphicsQuality).toBe("low");
    expect(reload("not settings")).toEqual(DEFAULT_CLIENT_SETTINGS);
  });
  it("carries the token card's arrow-key choice over once (client-settings)", () => {
    localStorage.setItem(LEGACY_ARROW_KEY_MOVE_KEY, "false");
    const { arrowKeyMove: _a, ...older } = DEFAULT_CLIENT_SETTINGS;
    expect(reload(older).arrowKeyMove).toBe(false);
    expect(localStorage.getItem(LEGACY_ARROW_KEY_MOVE_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(CLIENT_SETTINGS_KEY)!)).toMatchObject({ arrowKeyMove: false });
  });
  it("keeps audio changes from restarting graphical effects", () => {
    let changes = 0;
    const stop = subscribeGraphicsSettings(() => changes++);
    setClientSettings({ musicVolume: 20, soundVolume: 0 });
    expect(changes).toBe(0);
    setClientSettings({ graphicsQuality: "low" });
    expect(changes).toBe(1);
    stop();
    setClientSettings({ graphicsQuality: "high" });
    expect(changes).toBe(1);
  });
});

describe("settings tabs (FR-TAC-06)", () => {
  it("shows Audio, Graphics, Controls and Language to everyone, Audio first, and switches panels", () => {
    render(<SettingsMenu open onClose={() => {}} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Audio", "Graphics", "Preferences", "Language"]);
    expect(screen.getByRole("tab", { name: "Audio" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: "Audio" }).id);
    expect(screen.queryByLabelText("Graphics quality")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Graphics" }));
    expect(screen.getByLabelText("Graphics quality")).toBeTruthy();
    expect(screen.queryByRole("slider", { name: /Music volume/ })).toBeNull();
  });
  it("moves between tabs with the arrow, Home and End keys", () => {
    render(<SettingsMenu open onClose={() => {}} />);
    const audio = screen.getByRole("tab", { name: "Audio" });
    fireEvent.keyDown(audio, { key: "ArrowRight" });
    const graphics = screen.getByRole("tab", { name: "Graphics" });
    expect(graphics.getAttribute("aria-selected")).toBe("true");
    expect(graphics.tabIndex).toBe(0);
    expect(audio.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(graphics);
    fireEvent.keyDown(graphics, { key: "ArrowRight" });
    const preferences = screen.getByRole("tab", { name: "Preferences" });
    expect(preferences.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(preferences, { key: "ArrowRight" });
    const language = screen.getByRole("tab", { name: "Language" });
    expect(language.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(language, { key: "ArrowRight" });
    expect(audio.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(audio, { key: "ArrowLeft" });
    expect(language.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(language, { key: "Home" });
    expect(audio.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(audio, { key: "End" });
    expect(language.getAttribute("aria-selected")).toBe("true");
  });
  it("saves the arrow-key switch from the Controls tab (client-settings)", () => {
    render(<SettingsMenu open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Preferences" }));
    const toggle = screen.getByRole("switch", { name: "Arrow keys move selected token" }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(getClientSettings().arrowKeyMove).toBe(false);
  });
  it("saves the attack animations choice from the Graphics tab (board-attack-effects)", () => {
    render(<SettingsMenu open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Graphics" }));
    const select = screen.getByLabelText("Attack animations") as HTMLSelectElement;
    expect(select.value).toBe("all");
    fireEvent.change(select, { target: { value: "none" } });
    expect(JSON.parse(localStorage.getItem(CLIENT_SETTINGS_KEY)!)).toMatchObject({ attackAnimations: "none" });
  });
});
