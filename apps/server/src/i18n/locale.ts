import type { NextFunction, Request, Response } from "express";
import { DEFAULT_LOCALE, isLocale, localeFromAcceptLanguage, type Locale } from "@vtt/shared";
import { localizeBody } from "./localize";

/**
 * The language an API request asks for (localization; ADR 0054): the first tag of its
 * `Accept-Language` that maps, by q order, with the same mapping the browser default uses; English
 * when none does. The web client sends its chosen language here on every request.
 *
 * Responses say which language their messages are in (`Content-Language`) and that they differ by
 * the header (`Vary`), so no cache hands a Chinese error to an English request. JSON bodies pass
 * through `localizeBody`, which writes their `error` and `issues` in that language.
 */
export function attachLocale(req: Request, res: Response, next: NextFunction) {
  const locale = localeFromAcceptLanguage(req.get("accept-language"));
  res.locals.locale = locale;
  res.vary("Accept-Language");
  res.setHeader("Content-Language", locale);
  if (locale !== DEFAULT_LOCALE) {
    const json = res.json.bind(res);
    res.json = (body?: unknown) => json(localizeBody(locale, body));
  }
  next();
}

/** The language `attachLocale` resolved for this request; English outside `/api`. */
export function requestLocale(res: Response): Locale {
  const locale: unknown = res.locals.locale;
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}
