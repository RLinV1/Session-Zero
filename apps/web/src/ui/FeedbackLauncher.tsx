import { ChatCircleDots } from "@phosphor-icons/react";
import { useT } from "../i18n/locale";
import { openFeedback } from "./feedback";

export function FeedbackLauncher() {
  const t = useT();
  const label = t("feedback.open");
  return (
    <button
      type="button"
      className="feedback-launcher"
      aria-label={label}
      aria-haspopup="dialog"
      title={label}
      onClick={() => openFeedback("bug")}
    >
      <ChatCircleDots size={26} weight="bold" aria-hidden="true" />
    </button>
  );
}
