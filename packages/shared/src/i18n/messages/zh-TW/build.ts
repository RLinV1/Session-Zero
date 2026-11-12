import { cjk, type Catalog } from "../../core";
import type { buildEn } from "../en/build";

/** Traditional Chinese for `en/build.ts`. Terms follow docs/GLOSSARY-zh-TW.md (建置, 草稿, 發布). */
export const buildZhTW = {
  "buildCheck.field.hp": "HP",
  "buildCheck.field.maxHp": "最大 HP",
  "buildCheck.field.ac": "AC",
  "buildCheck.field.attacks": "攻擊",
  "buildCheck.field.conditions": "狀態",
  "buildCheck.field.size": "大小",
  "buildCheck.field.name": "名稱",
  "buildCheck.field.colour": "顏色",
  "buildCheck.field.art": "圖片",
  "buildCheck.field.grid": "網格",
  "buildCheck.field.square": "方格",
  "buildCheck.field.tokens": "棋子",
  "buildCheck.field.squareSize": "方格大小",
  "buildCheck.field.features": "使用的欄位",
  "buildCheck.field.notes": "備註",

  "buildCheck.kind.creature": "生物",
  "buildCheck.kind.map": "地圖",
  "buildCheck.kind.encounter": "遭遇",
  "buildCheck.line.wall": "牆",
  "buildCheck.line.door": "門",
  "buildCheck.line.window": "窗",

  "buildCheck.gameProfile": "遊戲設定檔",
  "buildCheck.flag": ({ field, message }) => `${field}：${message}`,
  "buildCheck.noProfile": "你的 AI 還沒儲存遊戲設定檔，所以每個欄位都視為使用中。如果不對，請 AI 儲存一份。",
  "buildCheck.blankNoReason": ({ field }) => cjk`${field}是空白的，AI 也沒說明原因。請填入數值，或保留空白直接發布。`,
  "buildCheck.artGone": "它的圖片已不在這個建置中。",

  "buildCheck.noGrid": "這張地圖還沒有網格。請在下方地圖設定方格大小，再確認網格。",
  "buildCheck.gridWords": ({ cellSize, offsetX, offsetY }) => `每格 ${cellSize} px，偏移 (${offsetX}, ${offsetY})`,
  "buildCheck.gridDiffers": ({ ai, detected }) => `你的 AI 提議的網格（${ai}）與網格偵測的結果（${detected}）不同。請在下方地圖確認正確的網格。`,
  "buildCheck.gridWaiting": "這張地圖的網格正等你確認。請在下方地圖檢查後確認。",
  "buildCheck.fileGone": "它的檔案已不在這個建置中。",

  "buildCheck.openingLeft": ({ number, reason }) => cjk`開口${number}留給你處理：${reason}`,
  "buildCheck.markLeft": ({ column, row, reason }) => cjk`第${column}欄、第${row}列留給你處理：${reason}`,
  // The numbers arrive joined with ", "; a Chinese list joins with 、.
  "buildCheck.openingsAsFile": ({ numbers }) =>
    `這些開口仍維持檔案原本的設定：${numbers.split(", ").join("、")}。請在下方地圖設定，或保留原樣，讓玩家看不到。`,
  "buildCheck.line": ({ number, kind, fromColumn, fromRow, toColumn, toRow }) =>
    cjk`線段${number}（從第${fromColumn}欄、第${fromRow}列到第${toColumn}欄、第${toRow}列的${kind}）`,
  "buildCheck.blockedLine": ({ line }) => `${line}位在一面沒有被切開的牆上，所以仍會被牆擋住。請在下方移除這條線段，或在發布後到地圖編輯器修正。`,
  "buildCheck.noSuchOpening": ({ number, count }) => cjk`這張地圖沒有開口${number}，它只有${count}個開口。`,
  "buildCheck.linesNeedGrid": "要畫線段，必須先有網格。請先設定地圖的網格。",
  "buildCheck.marksNeedGrid": "要標記位置，必須先有網格。請先設定地圖的網格。",
  "buildCheck.cornerOff": ({ line }) => `${line}有一端超出地圖範圍。`,
  "buildCheck.markOff": ({ number, column, row }) => cjk`標記${number}（第${column}欄、第${row}列）超出地圖範圍。`,
  "buildCheck.tooManyWalls": ({ count, max }) => cjk`這張地圖會有${count}面牆，但每張地圖最多只能有${max}面牆。`,
  "libraryBoard.fogOffMap": "戰爭迷霧必須位於地圖範圍內。",

  "buildCheck.unknownMap": ({ map }) => `它指定的地圖「${map}」不在這個建置中。`,
  "buildCheck.unknownCreature": ({ number, creature }) => cjk`第${number}枚棋子指定的生物「${creature}」不在這個建置中。`,
  "buildCheck.noSquare": ({ token }) => cjk`${token}還沒有位置。請在遭遇編輯器中放置，或將它移除。`,
  "buildCheck.offMap": ({ token }) => cjk`${token}超出地圖範圍。`,

  "buildCheck.tokenProblem": ({ token, problem }) => `${token}：${problem}`,
  "buildCheck.thisEncounter": "這個遭遇",
  "buildCheck.noCreatureWithKey": "這個建置中沒有這個代號的生物。",
  "buildCheck.tokenNoSquare": "它還沒有位置。請放置它，或將它移除。",
  "buildCheck.squareOffMap": "它的位置超出地圖範圍。",
  "buildCheck.acrossWall": "它會跨在牆上。請移動或移除它。",
  "buildCheck.hpOverMax": "它的 HP 高於最大 HP。",

  "buildCheck.publishProblem": ({ kind, key, problem }) => `${kind} ${key}：${problem}`,
  "buildCheck.notInBuild": "它不在這個建置中。",
  "buildCheck.fileDeleted": "它的檔案發布後，已從素材庫刪除。",
  "buildCheck.publishedThenDeleted": "它發布後，已從素材庫刪除。",
  "buildCheck.drawnWallsNeedGrid": "它畫上的牆需要先確認網格。",
  "buildCheck.mapNeedsGrid": ({ map }) => `它的地圖「${map}」需要先確認網格。`,
} satisfies Catalog<typeof buildEn>;
