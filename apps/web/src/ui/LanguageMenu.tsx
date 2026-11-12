import { useId, useRef, useState } from "react";
import { CaretDown, Check, Globe } from "@phosphor-icons/react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@vtt/shared";
import { chooseLocale, useLocale, useT } from "../i18n/locale";
import { LANGUAGE_CHOICE_ENABLED } from "../i18n/rollout";
import { PopoverButton } from "./Popover";

/**
 * The header's language control (localization; design.md §11): a globe, the current language in
 * its own name, and a caret, opening one row per language, each named in itself. The globe and
 * the names let a reader find their language without reading the one on screen.
 *
 * Choosing a row switches at once, closes the menu and puts focus back on the trigger. Nothing is
 * sent to the server or the room; the choice is saved in this browser.
 */
export function LanguageMenu() {
  const t = useT();
  const locale = useLocale();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  if (!LANGUAGE_CHOICE_ENABLED) return null;
  const name = LOCALE_NAMES[locale];
  return (
    <PopoverButton
      label={t("language.trigger", { name })}
      title={t("language.label")}
      align="right"
      placement="fixed"
      className="language-trigger"
      buttonRef={buttonRef}
      buttonContent={
        <>
          <Globe aria-hidden="true" />
          <span lang={locale}>{name}</span>
          <CaretDown className="language-caret" aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <div className="language-menu">
          <div className="menu-list">
            {LOCALES.map((option) => (
              <button
                key={option}
                type="button"
                className="menu-item"
                lang={option}
                aria-current={option === locale ? "true" : undefined}
                onClick={() => {
                  chooseLocale(option).then(
                    () => {
                      setFailed(false);
                      close();
                      buttonRef.current?.focus();
                    },
                    () => setFailed(true),
                  );
                }}
              >
                {LOCALE_NAMES[option]}
                {option === locale && <Check className="language-check" aria-hidden="true" />}
              </button>
            ))}
          </div>
          {failed && <p role="alert" className="error small language-error">{t("language.loadFailed")}</p>}
        </div>
      )}
    </PopoverButton>
  );
}

/**
 * The Language section of Settings: the same choices as radio buttons, and a line saying the
 * change is this viewer's alone (at the table) or saved in this browser (elsewhere). Switching
 * keeps the dialog open on this section.
 */
export function LanguageSettings({ atTable }: { atTable: boolean }) {
  const t = useT();
  const locale = useLocale();
  const group = useId();
  const [failed, setFailed] = useState(false);
  const choose = (next: Locale) => {
    chooseLocale(next).then(() => setFailed(false), () => setFailed(true));
  };
  return (
    <div className="stack">
      <fieldset className="language-choices">
        <legend className="sr-only">{t("language.label")}</legend>
        {LOCALES.map((option) => (
          <label key={option} className="checkbox language-choice" lang={option}>
            <input type="radio" name={group} value={option} checked={option === locale} onChange={() => choose(option)} />
            {LOCALE_NAMES[option]}
          </label>
        ))}
      </fieldset>
      <p className="muted small-print">{atTable ? t("language.tableNote") : t("language.savedNote")}</p>
      {failed && <p role="alert" className="error small">{t("language.loadFailed")}</p>}
    </div>
  );
}
