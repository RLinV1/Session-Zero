// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseLocale, resetLocaleForTests } from "../src/i18n/locale";
import { PrivacyPage, TermsPage } from "../src/pages/PolicyPages";

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
  window.history.replaceState({}, "", "/terms");
  await resetLocaleForTests();
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  await resetLocaleForTests();
});

describe("policy pages in the chosen language (localization)", () => {
  it("shows no translation note in English", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of use" })).toBeTruthy();
    expect(screen.queryByText(/English version governs/)).toBeNull();
  });

  it("translates the terms, says the English governs and links to it", async () => {
    await act(() => chooseLocale("zh-TW"));
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "服務條款" })).toBeTruthy();
    expect(screen.getByText(/如與英文版本有歧異，以英文版本為準/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "顯示英文版本" }).getAttribute("href")).toBe("/terms?lang=en");
    expect(screen.getByRole("time").textContent).toBe("2026年11月10日");
  });

  it("shows the English text in place, marked as English, with the way back in the reader's language", async () => {
    await act(() => chooseLocale("zh-TW"));
    window.history.replaceState({}, "", "/privacy?lang=en");
    render(<PrivacyPage />);
    const article = document.querySelector("article")!;
    expect(article.getAttribute("lang")).toBe("en");
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    expect(screen.getByText(/There is one cookie/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "顯示中文版本" }).getAttribute("href")).toBe("/privacy");
  });

  it("states that the language choice is kept in local storage", () => {
    window.history.replaceState({}, "", "/privacy");
    render(<PrivacyPage />);
    expect(screen.getByText(/such as the theme, language, dice look and panel layout/)).toBeTruthy();
  });
});
