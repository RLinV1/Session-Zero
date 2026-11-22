import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { t } from "../i18n/locale";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * A password field with a button that shows or hides what was typed. The field goes back to
 * hidden after each change of page or dialog, since the state lives with this component.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(props, ref) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeSlash : Eye;
  return (
    <span className="password-field">
      <input {...props} ref={ref} type={shown ? "text" : "password"} autoCapitalize="off" spellCheck={false} />
      <button
        type="button"
        className="password-toggle"
        aria-pressed={shown}
        aria-label={shown ? t("account.hidePassword") : t("account.showPassword")}
        title={shown ? t("account.hidePassword") : t("account.showPassword")}
        onClick={() => setShown((s) => !s)}
      >
        <Icon aria-hidden="true" />
      </button>
    </span>
  );
});
