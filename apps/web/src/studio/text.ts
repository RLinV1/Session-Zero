import { studioPreparation } from "../i18n/en/studioPreparation";
import { studioPreparationZhTW } from "../i18n/zh-TW/studioPreparation";

export type StudioLocale = "en" | "zh-TW";
export type StudioTextKey = keyof typeof studioPreparation;
/** Explicit locale keeps the shared renderer independent of website or host providers. */
export function studioT(locale: StudioLocale, key: StudioTextKey, params: Record<string, string | number> = {}): string {
  const text: string = (locale === "zh-TW" ? studioPreparationZhTW : studioPreparation)[key];
  return text.replace(/\{([A-Za-z]+)\}/g, (match, name: string) => params[name] === undefined ? match : String(params[name]));
}
