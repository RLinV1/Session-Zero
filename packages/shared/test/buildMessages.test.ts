import { describe, expect, it } from "vitest";
import {
  DraftCreature,
  DraftLine,
  buildFieldLabel,
  buildFieldLabelRef,
  checkBuild,
  creatureProblemRefs,
  creatureProblems,
  draftEncounterToTemplate,
  draftLineRef,
  draftMapBoard,
  englishText,
  formatRef,
  libraryBoardIssue,
  libraryBoardProblem,
  sharedEn,
  type BuildCheckInput,
  type BuildCreatureValues,
  type DraftMapSetup,
  type DraftMapState,
  type Entry,
  type GridSpec,
  type LibraryMapBoard,
  type MessageRef,
} from "../src";
import { sharedZhTW } from "../src/i18n/zh-TW";

const zh = sharedZhTW as Readonly<Record<string, Entry>>;
const en = sharedEn as Readonly<Record<string, Entry>>;
const chinese = (ref: MessageRef) => formatRef(zh, en, ref);
const anyParams = new Proxy({}, { get: () => "P" }) as Record<string, string>;
const render = (entry: Entry) => (typeof entry === "function" ? (entry as (p: unknown) => string)(anyParams) : entry);

const segment = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
// Two openings as a UVTT import leaves them, and a solid wall at y = 425, off the grid line.
const board: LibraryMapBoard = {
  walls: [
    segment(0, 140, 140, 140), { ...segment(140, 140, 210, 140), uvttPortal: { closed: true } }, segment(210, 140, 350, 140),
    { ...segment(280, 0, 280, 70), uvttPortal: { closed: false } },
    segment(0, 425, 700, 425),
  ],
  fog: [],
};
const grid70 = { cellSize: 70, offsetX: 0, offsetY: 0 };
const units = { unitsPerCell: 5, unitLabel: "ft" };
const mapSize = { width: 700, height: 700 };
const setup = (over: Partial<DraftMapSetup> = {}): DraftMapSetup => ({ openings: [], lines: [], marks: [], ...over });
const line = (from: [number, number], to: [number, number], kind: "wall" | "door" | "window" = "wall", state?: "open" | "closed" | "locked") =>
  DraftLine.parse({ from: { column: from[0], row: from[1] }, to: { column: to[0], row: to[1] }, kind, ...(state ? { state } : {}) });
const mapState = (over: Partial<DraftMapState> = {}): DraftMapState =>
  ({ name: "Chandlery", fileId: "f", proposedGrid: null, gridStatus: "confirmed", grid: { ...grid70, ...units }, ...over });
const { key: _key, flags: _flags, notCarriedOver: _notes, ...hero } = DraftCreature.parse({ key: "hero", name: "Aria", isPlayerCharacter: true, hp: null, maxHp: 9, ac: null });

/** One draft that raises a bit of everything the check can say. */
const draft = (audience: "ai" | "owner"): BuildCheckInput => ({
  profile: null,
  audience,
  aiWalls: true,
  files: [{ id: "f", width: 700, height: 700, board }],
  creatures: [{ key: "hero", data: hero, flags: [{ field: "maxHp", message: "two numbers on the sheet" }] }],
  maps: [
    { key: "shop", data: mapState({ setup: setup({ openings: [{ number: 2, kind: "leave", reason: "Could be an archway." }], marks: [{ square: { column: 3, row: 4 }, reason: "Curved wall." }], lines: [line([3, 6], [4, 6], "door", "open")] }) }), flags: [] },
    { key: "cave", data: mapState({ gridStatus: "proposed", grid: null, proposedGrid: { cellSize: 72.5, offsetX: 3, offsetY: 0.5 }, gridDiffers: grid70 }), flags: [] },
  ],
  encounters: [{ key: "amb", data: { name: "Ambush", mapKey: "shop", tokens: [{ creatureKey: "hero", name: "Aria 2", square: null, hidden: false }, { creatureKey: "dragon", square: { column: 1, row: 1 }, hidden: false }] }, flags: [] }],
});

describe("the build check's owner messages are ids, the AI's stay English (FR-GM-26, ADR 0055)", () => {
  it("gives the owner each message as a ref whose English is the message, and the AI none", () => {
    const owner = checkBuild(draft("owner"));
    expect(owner.length).toBeGreaterThan(8);
    for (const issue of owner) {
      expect(issue.text).toBeDefined();
      expect(englishText(issue.text!)).toBe(issue.message);
    }
    expect(owner[0]).toMatchObject({ label: "Game profile", labelText: { id: "buildCheck.gameProfile" } });
    // What `check_build` returns to the AI is unchanged: the same keys, in English.
    for (const issue of checkBuild(draft("ai"))) expect(Object.keys(issue)).toEqual(["type", "item", "label", "target", "message"]);
  });

  it("says every owner message in Traditional Chinese, typed names left as typed", () => {
    const owner = checkBuild(draft("owner"));
    expect(owner.map((i) => [i.labelText ? chinese(i.labelText) : i.label, chinese(i.text!)])).toEqual([
      ["遊戲設定檔", "你的 AI 還沒儲存遊戲設定檔，所以每個欄位都視為使用中。如果不對，請 AI 儲存一份。"],
      ["Aria", "最大 HP：two numbers on the sheet"],
      ["Aria", "HP 是空白的，AI 也沒說明原因。請填入數值，或保留空白直接發布。"],
      ["Aria", "AC 是空白的，AI 也沒說明原因。請填入數值，或保留空白直接發布。"],
      ["Chandlery", "開口 2 留給你處理：Could be an archway."],
      ["Chandlery", "第 3 欄、第 4 列留給你處理：Curved wall."],
      ["Chandlery", "這些開口仍維持檔案原本的設定：1。請在下方地圖設定，或保留原樣，讓玩家看不到。"],
      ["Chandlery", "線段 1（從第 3 欄、第 6 列到第 4 欄、第 6 列的門）位在一面沒有被切開的牆上，所以仍會被牆擋住。請在下方移除這條線段，或在發布後到地圖編輯器修正。"],
      ["Chandlery", "你的 AI 提議的網格（每格 72.5 px，偏移 (3, 0.5)）與網格偵測的結果（每格 70 px，偏移 (0, 0)）不同。請在下方地圖確認正確的網格。"],
      ["Chandlery", "這些開口仍維持檔案原本的設定：1、2。請在下方地圖設定，或保留原樣，讓玩家看不到。"],
      ["Ambush", "Aria 2 還沒有位置。請在遭遇編輯器中放置，或將它移除。"],
      ["Ambush", "第 2 枚棋子指定的生物「dragon」不在這個建置中。"],
    ]);
  });

  it("keeps the English the page showed before, word for word", () => {
    const owner = checkBuild(draft("owner"));
    expect(owner.map((i) => i.message)).toEqual([
      "Your AI hasn't saved a game profile, so every field counts as in use. Ask it to save one if that's wrong.",
      "Max HP: two numbers on the sheet",
      "HP is blank, and your AI didn't say why. Fill it in, or publish it blank.",
      "AC is blank, and your AI didn't say why. Fill it in, or publish it blank.",
      "Opening 2 is left for you: Could be an archway.",
      "Left for you at column 3, row 4: Curved wall.",
      "Openings still as the file has them: 1. Set them on the map below, or leave them hidden from players.",
      "Line 1 (a door from column 3, row 6 to column 4, row 6) sits on a wall it doesn't cut, so the wall still blocks it. Remove the line below, or fix it in the map editor after publishing.",
      "Your AI's grid (72.5-pixel squares at offset (3, 0.5)) differs from grid detection's (70-pixel squares at offset (0, 0)). Check the map below and confirm the right one.",
      "Openings still as the file has them: 1, 2. Set them on the map below, or leave them hidden from players.",
      "Aria 2 has no square yet. Place it in the encounter's editor, or remove it.",
      'Token 2 names creature "dragon", which isn\'t in this build.',
    ]);
    expect(checkBuild(draft("ai")).map((i) => i.message)).toContain("Aria 2 has no square yet.");
  });

  it("names fields, lines and blanks in either language", () => {
    expect(buildFieldLabel("MaxHP")).toBe("Max HP");
    expect(buildFieldLabel("imageFileId")).toBe("Art");
    expect(chinese(buildFieldLabelRef("unitsPerCell") as MessageRef)).toBe("方格大小");
    // A field the page doesn't know, even one named like an object's built-in property, stays as the AI wrote it.
    expect(buildFieldLabelRef("toString")).toBe("toString");
    expect(buildFieldLabelRef("homebrew")).toBe("homebrew");
    expect(chinese(draftLineRef(line([0, 2.5], [1.5, 2], "window", "locked"), 2))).toBe("線段 3（從第 0 欄、第 2.5 列到第 1.5 欄、第 2 列的窗）");
    const blank = { isPlayerCharacter: true, hp: null, maxHp: 4, ac: 12 };
    const features = { hitPoints: true, armorClass: true, attacks: true, conditions: true };
    expect(creatureProblemRefs(blank, [], features).map(chinese)).toEqual(["HP 是空白的，AI 也沒說明原因。請填入數值，或保留空白直接發布。"]);
    expect(creatureProblems(blank, [], features, "owner")).toEqual(["HP is blank, and your AI didn't say why. Fill it in, or publish it blank."]);
    expect(creatureProblems(blank, [], features)).toEqual(["HP is blank with no flag. Give a value, or flag it and say why."]);
  });

  it("says a map's setup problems to the owner without the AI's tools, in either language", () => {
    const result = draftMapBoard(null, setup({ lines: [line([1, 1], [2, 1])] }), null, mapSize);
    expect(result).toMatchObject({ ok: false, problems: ["Drawing lines needs a grid first. Propose one with save_map."] });
    if (result.ok) return;
    expect(result.ownerProblems.map(englishText)).toEqual(["Drawing lines needs a grid first. Set the map's grid first."]);
    expect(result.ownerProblems.map(chinese)).toEqual(["要畫線段，必須先有網格。請先設定地圖的網格。"]);
    const opening = draftMapBoard(board, setup({ openings: [{ number: 3, kind: "door", state: "open" }] }), grid70, mapSize);
    expect(opening.ok ? [] : opening.ownerProblems.map(chinese)).toEqual(["這張地圖沒有開口 3，它只有 2 個開口。"]);
  });

  it("names a library board's problem by id, with the English it always had", () => {
    const fog = { walls: [], fog: [{ points: [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 10 }] }] } as unknown as LibraryMapBoard;
    expect(libraryBoardProblem(fog, mapSize)).toBe("Fog must lie on the map.");
    expect(chinese(libraryBoardIssue(fog, mapSize)!)).toBe("戰爭迷霧必須位於地圖範圍內。");
    expect(libraryBoardIssue(board, mapSize)).toBeNull();
  });
});

describe("why an approved encounter can't become a template, in the owner's language (FR-GM-27, ADR 0055)", () => {
  const grid: GridSpec = { ...grid70, ...units };
  const goblin: BuildCreatureValues = { name: "Goblin", size: 1, hp: 7, maxHp: 7, ac: 13, color: "#336699", conditions: [], attacks: [], imageUrl: null, assetId: null };

  it("names each token and its problem, as `token: problem` in English", () => {
    const result = draftEncounterToTemplate({
      map: { assetId: "33333333-3333-4333-8333-333333333333", width: 700, height: 700 },
      grid,
      board: { walls: [], fog: [] },
      creatures: new Map([["goblin", goblin], ["ogre", { ...goblin, name: "Ogre", hp: 9, maxHp: 7 }]]),
      tokens: [
        { creatureKey: "goblin", name: "Goblin 2", square: null, hidden: false },
        { creatureKey: "goblin", square: { column: 20, row: 0 }, hidden: false },
        { creatureKey: "ogre", square: { column: 1, row: 1 }, hidden: false },
        { creatureKey: "nobody", square: { column: 1, row: 1 }, hidden: false },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => [p.token, p.message, englishText(p.text)])).toEqual([
      ["Goblin 2", "It has no square yet. Place it or remove it.", "Goblin 2: It has no square yet. Place it or remove it."],
      ["Goblin", "Its square is off the map.", "Goblin: Its square is off the map."],
      ["Ogre", "Its HP is more than its Max HP.", "Ogre: Its HP is more than its Max HP."],
      ["nobody", "This build has no creature with that key.", "nobody: This build has no creature with that key."],
    ]);
    expect(result.problems.map((p) => chinese(p.text))).toEqual([
      "Goblin 2：它還沒有位置。請放置它，或將它移除。",
      "Goblin：它的位置超出地圖範圍。",
      "Ogre：它的 HP 高於最大 HP。",
      "nobody：這個建置中沒有這個代號的生物。",
    ]);
  });
});

describe("the builder's shared catalog (localization)", () => {
  const ids = Object.keys(sharedEn).filter((id) => /^(buildCheck|libraryBoard)\./.test(id));

  it("covers the check, the board and publishing", () => {
    expect(ids.length).toBeGreaterThan(55);
  });

  it.each(ids)("%s has text in both languages, with the same params", (id) => {
    const english = render(en[id]!);
    const translated = render(zh[id]!);
    expect(english.trim()).not.toBe("");
    expect(translated.trim()).not.toBe("");
    if (typeof en[id] === "function" && english.includes("P")) expect(translated).toContain("P");
    // Full-width punctuation in Chinese sentences (docs/GLOSSARY-zh-TW.md), coordinates aside.
    expect(translated.replace(/\(P, P\)/g, "")).not.toMatch(/[A-Za-z0-9一-鿿][,:;!?](?! )|[一-鿿][.]/);
  });
});

