import type { Catalog } from "@vtt/shared";
import type { shell } from "../en/shell";

/** Traditional Chinese for `en/shell.ts`. */
export const shellZhTW = {
  "common.close": "關閉",
  "notFound.title": "找不到頁面",
  "notFound.body": "這個網址找不到頁面，可能是連結已失效，或網址輸入有誤。",
  "notFound.home": "回到首頁",
  "theme.auto": "目前跟隨系統主題，切換為淺色模式",
  "theme.light": "目前使用淺色模式，切換為深色模式",
  "theme.dark": "目前使用深色模式，切換為跟隨系統",
  "nav.main": "主要導覽",
  "nav.rooms": "你的房間",
  "nav.library": "素材庫",
  "nav.policies": "法律資訊",
  "nav.privacy": "隱私權政策",
  "nav.terms": "服務條款",
  "animationPicker.choose": "選擇動畫",
  "animationPicker.title": "選擇攻擊動畫",
  "animationPicker.search": "搜尋動畫",
  "animationPicker.list": "動畫",
  "animationPicker.none": "找不到符合條件的動畫，試試其他關鍵字。",
} satisfies Catalog<typeof shell>;
