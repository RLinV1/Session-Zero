import type { Catalog } from "@vtt/shared";
import { sharedZhTW } from "@vtt/shared/i18n/zh-TW";
import type { WebEn } from "../en";
import { commonZhTW } from "./common";
import { shellZhTW } from "./shell";
import { entryZhTW } from "./entry";
import { homeZhTW } from "./home";
import { policyZhTW } from "./policy";
import { tableZhTW } from "./table";
import { hubZhTW } from "./hub";
import { editorZhTW } from "./editor";
import { panelsZhTW } from "./panels";
import { boardZhTW } from "./board";

/**
 * Traditional Chinese for the whole web app. Loaded lazily (i18n/locale.ts), so English viewers
 * never download it. `satisfies` makes a missing id a type error that names it.
 */
export const zhTW = {
  ...sharedZhTW,
  ...commonZhTW,
  ...shellZhTW,
  ...entryZhTW,
  ...homeZhTW,
  ...policyZhTW,
  ...tableZhTW,
  ...hubZhTW,
  ...editorZhTW,
  ...panelsZhTW,
  ...boardZhTW,
} satisfies Catalog<WebEn>;
