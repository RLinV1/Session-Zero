import { cjk, type Catalog } from "../../core";
import type { validationEn } from "../en/validation";

/** Traditional Chinese for `en/validation.ts`. */
export const validationZhTW = {
  "valid.offsetsWithinCell": "偏移量必須在一格的範圍內。",
  "valid.gridOffset": "網格偏移量必須小於每格尺寸。",
  "valid.unknownPreset": "無法辨識這個遊戲預設。",
  "valid.nukeNotAttack": "核彈效果不能用於一般攻擊。",
  "valid.nukeOnly": "核彈效果只能搭配核彈動畫使用。",
  "valid.nothingToChange": "沒有需要修改的內容。",
  "valid.nameBlank": "名稱不能空白",
  "valid.nameTooLong": ({ max }) => cjk`名稱最多${max}個字元`,
  "valid.supportedDie": "請選擇系統支援的骰型。",
  "valid.attackNeedsRoll": "每個攻擊至少需要攻擊檢定或傷害擲骰其中一項。",
  "valid.attackNamesUnique": "每個攻擊都必須有不同的名稱。",
  "valid.mapUploadSize": "上傳地圖時，必須提供圖片的寬度與高度。",
  "valid.conditionTwice": "同一種狀態不能重複加入。",
  "valid.emailTooLong": ({ max }) => cjk`電子郵件最多${max}個字元`,
  "valid.email": "請輸入有效的電子郵件地址，例如 name@example.com。",
  "valid.passwordTooShort": ({ min }) => cjk`密碼至少須有${min}個字元。`,
  "valid.passwordTooLong": ({ max }) => cjk`密碼不可超過${max}個字元。`,
  "valid.displayNameBlank": "顯示名稱不能空白",
  "valid.displayNameTooLong": ({ max }) => cjk`顯示名稱最多${max}個字元`,
  "valid.passwordIsEmail": "請勿將電子郵件地址設為密碼。",
  "valid.hexColour": "請輸入 6 位數十六進位色碼，例如 #ff8800。",
  "valid.diceLookPicture": ({ width, height, max }) => cjk`請使用已繪製的骰子範本（${width} × ${height} 以內，比例為 3:2），或尺寸不超過${max} × ${max}的正方形圖片。`,
  "auth.signInFailed": "電子郵件或密碼不正確。",
} satisfies Catalog<typeof validationEn>;
