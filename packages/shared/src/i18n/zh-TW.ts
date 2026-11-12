import type { Catalog } from "./core";
import type { SharedEn } from "./en";
import { buildZhTW } from "./messages/zh-TW/build";
import { rejectionsZhTW } from "./messages/zh-TW/rejections";
import { validationZhTW } from "./messages/zh-TW/validation";

/**
 * Traditional Chinese for `sharedEn`. Follows docs/GLOSSARY-zh-TW.md. Imported on its own path
 * (`@vtt/shared/i18n/zh-TW`) so the web can load it lazily; English viewers never download it.
 */
export const sharedZhTW = {
  "common.unknownError": "發生錯誤",
  ...rejectionsZhTW,
  ...validationZhTW,
  ...buildZhTW,
} satisfies Catalog<SharedEn>;
