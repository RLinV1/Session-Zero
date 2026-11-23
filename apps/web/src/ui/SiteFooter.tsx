import { ChatCircleDots } from "@phosphor-icons/react";
import { Link } from "../Link";
import { useT } from "../i18n/locale";
import { openFeedback } from "./feedback";

/** The site's reading pages: what changed, and the two policies. */
export type PolicyPageName = "news" | "privacy" | "terms";

/** What's new is in the header (SiteHeader's WhatsNewLink), so the footer lists the policies. */
const POLICY_LINKS = [
  { page: "privacy", href: "/privacy", label: "nav.privacy" },
  { page: "terms", href: "/terms", label: "nav.terms" },
] as const satisfies readonly { page: PolicyPageName; href: string; label: string }[];

/** Shared site policies and the viewport-anchored Feedback launcher (FR-PL-11). */
export function SiteFooter({ current }: { current?: PolicyPageName }) {
  const t = useT();
  const feedbackLabel = t("feedback.open");
  return (
    <>
      <footer className="page-shell site-footer">
        <nav className="footer-links" aria-label={t("nav.policies")}>
          {POLICY_LINKS.map((l) => (
            <Link key={l.page} href={l.href} aria-current={current === l.page ? "page" : undefined}>
              {t(l.label)}
            </Link>
          ))}
        </nav>
      </footer>
      <button
        type="button"
        className="feedback-launcher"
        aria-label={feedbackLabel}
        aria-haspopup="dialog"
        title={feedbackLabel}
        onClick={() => openFeedback("bug")}
      >
        <ChatCircleDots size={26} weight="bold" aria-hidden="true" />
      </button>
    </>
  );
}

/** The reading pages' header navigation: the policies one step away, the current one marked. */
export function PolicyNav({ current }: { current: PolicyPageName }) {
  const t = useT();
  return (
    <>
      {POLICY_LINKS.map((l) => (
        <Link key={l.page} href={l.href} className="nav-link" aria-current={current === l.page ? "page" : undefined}>
          {t(l.label)}
        </Link>
      ))}
    </>
  );
}
