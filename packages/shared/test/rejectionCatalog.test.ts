import { describe, expect, it } from "vitest";
import { englishText, formatRef, parseDiceExpression, sharedEn, sharedMsg, SignUpRequest, validationConflicts, validationRef, type Entry, type MessageRef } from "../src";
import { presetLabel } from "../src/i18n/labels";
import { sharedZhTW } from "../src/i18n/zh-TW";

const zh = sharedZhTW as Readonly<Record<string, Entry>>;
const en = sharedEn as Readonly<Record<string, Entry>>;
const chinese = (ref: MessageRef) => formatRef(zh, en, ref);

/** Any param an entry reads comes back as "P", so every entry can be formatted without knowing its params. */
const anyParams = new Proxy({}, { get: () => "P" }) as Record<string, string>;
const render = (entry: Entry) => (typeof entry === "function" ? (entry as (p: unknown) => string)(anyParams) : entry);

describe("rejection messages in both languages (localization)", () => {
  const ids = Object.keys(sharedEn).filter((id) => /^(reject|undo|noun|preset)\./.test(id));

  it("covers every rejection, undo refusal and noun", () => {
    expect(ids.length).toBeGreaterThan(190);
  });

  it.each(ids)("%s has non-empty text in English and Traditional Chinese", (id) => {
    const english = render(en[id]!);
    const translated = render(zh[id]!);
    expect(english.trim()).not.toBe("");
    expect(translated.trim()).not.toBe("");
    // A parameterised message keeps its params in both languages.
    if (typeof en[id] === "function" && english.includes("P")) expect(translated).toContain("P");
  });

  it("writes the same English as before for interpolated messages", () => {
    expect(englishText(sharedMsg("reject.tokenFootprint", { token: "Secret giant", footprint: 700, width: 600, height: 400 }))).toBe(
      "Secret giant's 700 px footprint cannot fit this 600 × 400 px map. Use a larger map, reduce the grid cell size, or reduce the token's size.",
    );
    expect(englishText(sharedMsg("reject.portalAlready", { kind: sharedMsg("noun.door"), state: sharedMsg("noun.open") }))).toBe("That door is already open.");
    expect(englishText(sharedMsg("reject.presetNoAttacks", { preset: presetLabel({ id: "free", name: "Free Mode" }) }))).toBe("Attack rolls are off in Free Mode.");
    expect(englishText(sharedMsg("reject.displayNameTaken", { name: "Sam" }))).toBe('The name "Sam" is already taken in this room. Choose another name.');
    expect(englishText(sharedMsg("undo.groupRenamed", { group: sharedMsg("noun.thatGroup") }))).toBe('Can\'t undo: "that group" has been renamed since.');
    expect(englishText(sharedMsg("undo.gone", { name: sharedMsg("noun.thatToken") }))).toBe("Can't undo: That token no longer exists.");
    expect(englishText(sharedMsg("reject.lineTooWide", { width: 15, unit: "ft" }))).toBe("A line is at most 15 ft wide.");
  });

  it("translates the nouns inside a message too, and leaves typed names alone", () => {
    expect(chinese(sharedMsg("reject.portalAlready", { kind: sharedMsg("noun.door"), state: sharedMsg("noun.open") }))).toBe("這扇門已經開啟。");
    expect(chinese(sharedMsg("reject.portalLocked", { kind: sharedMsg("noun.window") }))).toBe("那扇窗已上鎖。");
    expect(chinese(sharedMsg("reject.presetNoAc", { preset: presetLabel({ id: "free", name: "Free Mode" }) }))).toBe("自由模式目前未啟用 AC。");
    expect(chinese(sharedMsg("reject.displayNameTaken", { name: "Goblin Archer" }))).toBe("房間內已有人使用「Goblin Archer」，請換個名稱。");
    expect(chinese(sharedMsg("undo.gone", { name: sharedMsg("noun.thatToken") }))).toBe("無法復原：這枚棋子已被移除。");
    expect(chinese(sharedMsg("undo.gone", { name: "Goblin" }))).toBe("無法復原：Goblin 已被移除。");
    expect(chinese(sharedMsg("reject.diceCount", { max: 20 }))).toBe("每次請擲 1～20 顆骰子。");
  });

  it("keeps the dice parser's English message and adds its message as data", () => {
    const parsed = parseDiceExpression("lots of dice");
    expect(parsed).toMatchObject({ ok: false, message: "Use NdX, NdX+M or NdX-M, for example 1d20+5", text: { id: "reject.diceSyntax" } });
    if (!parsed.ok) expect(chinese(parsed.text)).toBe("請輸入 NdX、NdX+M 或 NdX-M 格式的擲骰公式，例如 1d20+5。");
  });
});

describe("validation messages map back to their ids (localization)", () => {
  it("has no English text registered under two ids, which would make the index ambiguous", () => {
    expect(validationConflicts()).toEqual([]);
  });

  it("turns a schema issue back into its message, for any language", () => {
    const parsed = SignUpRequest.safeParse({ email: "not-an-email", password: "short", displayName: " " });
    expect(parsed.success).toBe(false);
    const messages = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
    expect(messages).toEqual(["Enter an email address like name@example.com", "Password must be at least 8 characters", "Display name can't be blank"]);
    expect(messages.map((m) => chinese(validationRef(m)!))).toEqual(["請輸入有效的電子郵件地址，例如 name@example.com。", "密碼至少須有 8 個字元。", "顯示名稱不能空白"]);
  });

  it("leaves a message that isn't ours to the caller", () => {
    expect(validationRef("Too small: expected string to have >=1 characters")).toBeUndefined();
  });
});
