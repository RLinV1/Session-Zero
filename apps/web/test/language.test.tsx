// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCALE_KEY,
  browserLocale,
  chooseLocale,
  getLocale,
  resetLocaleForTests,
  t,
  titleFor,
} from "../src/i18n/locale";
import { LanguageMenu, LanguageSettings } from "../src/ui/LanguageMenu";
import { SettingsMenu } from "../src/ui/SettingsMenu";

beforeEach(async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  localStorage.clear();
  await resetLocaleForTests();
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  await resetLocaleForTests();
});

describe("the starting language (localization)", () => {
  it("follows the browser's languages when nothing is saved", () => {
    expect(browserLocale(["zh-TW", "en-US"])).toBe("zh-TW");
    expect(browserLocale(["ja-JP", "zh-HK"])).toBe("zh-TW");
    expect(browserLocale(["zh-CN"])).toBe("en");
    expect(browserLocale([])).toBe("en");
    // jsdom's browser prefers en-US.
    expect(getLocale()).toBe("en");
  });

  it("lets a saved choice win over the browser's languages", async () => {
    localStorage.setItem(LOCALE_KEY, "zh-TW");
    await resetLocaleForTests();
    expect(getLocale()).toBe("zh-TW");
    expect(document.documentElement.lang).toBe("zh-TW");
    expect(t("settings.title")).toBe("設定");
  });

  it("ignores a saved value that isn't a language", async () => {
    localStorage.setItem(LOCALE_KEY, "klingon");
    await resetLocaleForTests();
    expect(getLocale()).toBe("en");
  });
});

describe("switching language (localization)", () => {
  it("saves the choice and updates the page's lang and description", async () => {
    await chooseLocale("zh-TW");
    expect(localStorage.getItem(LOCALE_KEY)).toBe("zh-TW");
    expect(document.documentElement.lang).toBe("zh-TW");
    await chooseLocale("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("still switches for this page when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("private mode"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("private mode"); });
    await chooseLocale("zh-TW");
    expect(getLocale()).toBe("zh-TW");
    // Next visit: nothing was saved, so the browser's language again.
    await resetLocaleForTests();
    expect(getLocale()).toBe("en");
  });

  it("titles the tab per page, in the current language", async () => {
    expect(titleFor({ page: "home" })).toBe("Session Zero");
    expect(titleFor({ page: "library" })).toBe("Library · Session Zero");
    await chooseLocale("zh-TW");
    expect(titleFor({ page: "library" })).toBe("素材庫 · Session Zero");
    expect(titleFor({ page: "home" })).toBe("Session Zero");
  });
});

describe("the header language control (localization)", () => {
  it("names the current language in itself and lists every language in its own name", () => {
    render(<LanguageMenu />);
    const trigger = screen.getByRole("button", { name: "Language: English" });
    fireEvent.click(trigger);
    const english = screen.getByRole("button", { name: "English" });
    const chinese = screen.getByRole("button", { name: "繁體中文" });
    expect(english.getAttribute("aria-current")).toBe("true");
    expect(chinese.getAttribute("aria-current")).toBeNull();
    expect(chinese.getAttribute("lang")).toBe("zh-TW");
    expect(english.getAttribute("lang")).toBe("en");
  });

  it("switches, closes the menu and puts focus back on the trigger", async () => {
    render(<LanguageMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Language: English" }));
    fireEvent.click(screen.getByRole("button", { name: "繁體中文" }));
    const trigger = await screen.findByRole("button", { name: "語言：繁體中文" });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.documentElement.lang).toBe("zh-TW");
    // The name on the trigger carries its own language.
    expect(trigger.querySelector('[lang="zh-TW"]')?.textContent).toBe("繁體中文");
  });

  it("offers the same names whatever the current language", async () => {
    await act(() => chooseLocale("zh-TW"));
    render(<LanguageMenu />);
    fireEvent.click(screen.getByRole("button", { name: "語言：繁體中文" }));
    expect(screen.getByRole("button", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "繁體中文" }).getAttribute("aria-current")).toBe("true");
  });
});

describe("Settings › Language (localization)", () => {
  it("switches without closing Settings, staying on the Language section", async () => {
    render(<SettingsMenu open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Language" }));
    const chinese = screen.getByRole("radio", { name: "繁體中文" });
    expect(screen.getByRole("radio", { name: "English" })).toHaveProperty("checked", true);
    fireEvent.click(chinese);
    await waitFor(() => expect(screen.getByRole("tab", { name: "語言" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("radio", { name: "繁體中文" })).toHaveProperty("checked", true);
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();
    expect(screen.getByText("語言偏好會儲存在這個瀏覽器，切換後立即生效。")).toBeTruthy();
  });

  it("tells a player at the table the change is theirs alone", () => {
    render(<LanguageSettings atTable />);
    expect(screen.getByText("Only you see this change. Everyone else at the table keeps their own language.")).toBeTruthy();
  });
});

describe("the development pseudo-locale (localization)", () => {
  it("accents and brackets catalog text so untranslated text stands out", async () => {
    const { pseudoize, pseudoRequested } = await import("../src/i18n/pseudo");
    expect(pseudoize("Settings")).toBe("⟦Šéţţîñĝš⟧");
    expect(pseudoize("")).toBe("");
    expect(pseudoRequested("?locale=pseudo")).toBe(true);
    expect(pseudoRequested("?locale=zh-TW")).toBe(false);
  });

  it("is never offered as a language", () => {
    render(<LanguageMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Language: English" }));
    expect(screen.getAllByRole("button").map((b) => b.textContent)).not.toContain("pseudo");
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});

describe("built-in content in the placer's language (localization)", () => {
  it("names built-in creatures and their attacks in the current language, and places them that way", async () => {
    const { BUILTIN_CREATURES } = await import("../src/net/builtinCreatures");
    const { savedCreatureDraft } = await import("../src/panels/AddToken");
    const guard = BUILTIN_CREATURES[0]!;
    expect(guard.name).toBe("Goblin Guard");
    await chooseLocale("zh-TW");
    expect(guard.name).toBe("哥布林守衛");
    const draft = savedCreatureDraft(guard, false, { attacks: true, conditions: true, armorClass: true });
    expect(draft.name).toBe("哥布林守衛");
    expect(draft.attacks?.map((a) => a.name)).toEqual(["彎刀", "短弓"]);
    // Copied into the room: switching back doesn't rename what was placed.
    await chooseLocale("en");
    expect(draft.name).toBe("哥布林守衛");
    expect(guard.name).toBe("Goblin Guard");
  });

  it("shows a seeded shipped map under its translated name until the GM renames it", async () => {
    const { assetDisplayName, BUILTIN_ASSETS } = await import("../src/net/builtinAssets");
    const crypt = BUILTIN_ASSETS.find((a) => a.kind === "map" && a.name === "Sunken Crypt")!;
    await chooseLocale("zh-TW");
    expect(assetDisplayName({ name: "Sunken Crypt", url: crypt.url })).toBe("沉陷墓穴");
    expect(assetDisplayName({ name: "Our crypt", url: crypt.url })).toBe("Our crypt");
  });
});

describe("the map, grid, encounter and animation editors (localization)", () => {
  it("builds the editor guide in the current language, matching the translated control names", async () => {
    const { editorGuide } = await import("../src/pages/mapEditor/mapEditorGuides");
    const tools = () => editorGuide("walls")!.find((s) => s.target === "walls-tools")!;
    expect(tools().selector).toContain('[aria-label="Wall tool"]');
    await chooseLocale("zh-TW");
    expect(tools().title).toBe("工具");
    expect(tools().selector).toContain(`[aria-label="${t("walls.tool")}"]`);
    expect(t("walls.tool")).not.toBe("Wall tool");
    expect(editorGuide("nope")).toBeUndefined();
  });

  it("names fog regions by column and row in the current language", async () => {
    const { DEFAULT_GRID } = await import("@vtt/shared");
    const { describeCells } = await import("../src/panels/fogCells");
    const map = { url: "/uploads/map.png", width: 700, height: 700 };
    const size = DEFAULT_GRID.cellSize;
    const region = { points: [{ x: 2 * size, y: size }, { x: 6 * size, y: size }, { x: 6 * size, y: 2 * size }, { x: 2 * size, y: 2 * size }] };
    const grid = { ...DEFAULT_GRID, offsetX: 0, offsetY: 0 };
    expect(describeCells(region, map, grid)).toBe("columns 3–6, row 2");
    await chooseLocale("zh-TW");
    expect(describeCells(region, map, grid)).toBe("第 3～6 欄、第 2 列");
  });

  it("reads module-level choices (map-prep token policy) when shown, not when loaded", async () => {
    const { TOKEN_POLICY_CHOICES } = await import("../src/pages/mapPrep");
    expect(TOKEN_POLICY_CHOICES.map((c) => t(c.label))).toEqual(["Scale to fit", "Keep positions", "Recenter"]);
    await chooseLocale("zh-TW");
    expect(TOKEN_POLICY_CHOICES.map((c) => t(c.label))).toEqual(["依比例調整", "保持位置", "置中"]);
  });

  it("labels the grid form in Chinese, including its default buttons", async () => {
    const { DEFAULT_GRID } = await import("@vtt/shared");
    const { GridForm } = await import("../src/pages/GridForm");
    const { toGridDraft } = await import("../src/pages/gridDraft");
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    await chooseLocale("zh-TW");
    render(<GridForm grid={DEFAULT_GRID} map={{ url: "/uploads/map.png", width: 768, height: 648 }} draft={toGridDraft(DEFAULT_GRID)} hasDraft
      onChange={() => {}} onApply={async () => {}} onCancel={() => {}} applying={false} error={null} />);
    expect(screen.getByRole("button", { name: "套用網格" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByLabelText("每格距離")).toBeTruthy();
  });
});

describe("the table's panels (localization)", () => {
  it("refetches the open activity log in the new language and shows its entries that way", async () => {
    const { api } = await import("../src/net/api");
    const { ActivityLog } = await import("../src/panels/ActivityLog");
    const sentence = () => (getLocale() === "zh-TW" ? "Sam 將 Aria 從 (35, 35) 移至 (105, 35)" : "Sam moved Aria from (35, 35) to (105, 35)");
    const history = vi.spyOn(api, "history").mockImplementation(async () => ({
      entries: [{ committed: { seq: 3, at: "2026-11-10T12:00:00.000Z", event: { type: "TokenMoved" } }, sentence: sentence() }],
      nextBefore: null,
    }) as never);
    const state = { undo: { entries: [] }, tokens: {} } as never;
    const { useT } = await import("../src/i18n/locale");
    // As in the app, the root re-renders on a language change (App calls useT()).
    function Root() {
      useT();
      return <ActivityLog open onClose={() => {}} roomId="r1" token="tk" seq={3} state={state} connection={{} as never} />;
    }
    render(<Root />);
    expect(await screen.findByText("Sam moved Aria from (35, 35) to (105, 35)")).toBeTruthy();
    await act(async () => { await chooseLocale("zh-TW"); });
    expect(await screen.findByText("Sam 將 Aria 從 (35, 35) 移至 (105, 35)")).toBeTruthy();
    expect(history).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog", { name: "活動紀錄" })).toBeTruthy();
  });

  it("keeps the leave-table dialog's promises in Traditional Chinese", async () => {
    const { LeaveTable } = await import("../src/panels/LeaveTable");
    await chooseLocale("zh-TW");
    const command = vi.fn().mockResolvedValue({ ok: true });
    const you = { id: "p1", role: "player", displayName: "Sam" };
    const state = { name: "The Keep", tokens: { a: { id: "a", name: "Aria", ownerIds: ["p1"] } } };
    render(<LeaveTable connection={{ command, snapshot: { status: "connected" } } as never} state={state as never} you={you as never} />);
    fireEvent.click(screen.getByRole("button", { name: "離開遊戲桌" }));
    const dialog = screen.getByRole("dialog", { name: "要離開 The Keep 嗎？" });
    // The safe choice is focused, and nothing is sent until the GM-free confirm.
    await waitFor(() => expect(document.activeElement?.textContent).toBe("留在遊戲桌"));
    expect(dialog.textContent).toContain("你在這個房間的座位與「Sam」名稱。");
    expect(dialog.textContent).toContain("你控制的 1 枚棋子：");
    expect(dialog.textContent).toContain("Aria");
    expect(command).not.toHaveBeenCalled();
  });
});

describe("the board's own words (localization)", () => {
  it("captions the ruler, names placement squares and labels damage rolls in the current language", async () => {
    const { DEFAULT_GRID } = await import("@vtt/shared");
    const { budgetLabel } = await import("../src/board/movementRuler");
    const { cursorSquare } = await import("../src/board/placement");
    const { presetRollLabel } = await import("../src/panels/attackRoll");
    const grid = { ...DEFAULT_GRID, offsetX: 0, offsetY: 0 };
    const size = grid.cellSize;
    const preset = { name: "Longsword", toHit: null, damage: null } as never;
    expect(budgetLabel(10, 30, grid)).toBe(`10 / 30 ${grid.unitLabel} · 20 ${grid.unitLabel} remaining`);
    expect(cursorSquare({ x: 2.5 * size, y: 1.5 * size }, 1, grid)).toBe("column 3, row 2");
    expect(presetRollLabel(preset, "damage")).toBe("Longsword damage");
    await chooseLocale("zh-TW");
    expect(budgetLabel(40, 30, grid)).toBe(`40 / 30 ${grid.unitLabel} · 超出 10 ${grid.unitLabel}`);
    expect(cursorSquare({ x: 2.5 * size, y: 1.5 * size }, 1, grid)).toBe("第 3 欄、第 2 列");
    expect(presetRollLabel(preset, "damage")).toBe("Longsword 傷害");
    expect(presetRollLabel({ name: "x".repeat(60) } as never, "damage").length).toBeLessThanOrEqual(40);
  });
});
