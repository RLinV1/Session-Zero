import { sharedEn, type CatalogSource } from "@vtt/shared";
import { common } from "./common";
import { shell } from "./shell";
import { entry } from "./entry";
import { home } from "./home";
import { policy } from "./policy";
import { table } from "./table";
import { hub } from "./hub";
import { editor } from "./editor";
import { panels } from "./panels";
import { board } from "./board";
import { build } from "./build";

/**
 * Every English string the web app shows: shared text (rejections, conditions, activity
 * sentences) and the app's own, one id space. Area files keep their ids prefixed by area, so
 * they never collide.
 */
export const en = {
  ...sharedEn,
  ...common,
  ...shell,
  ...entry,
  ...home,
  ...policy,
  ...table,
  ...hub,
  ...editor,
  ...panels,
  ...board,
  ...build,
} as const satisfies CatalogSource;

export type WebEn = typeof en;
