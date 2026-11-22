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

/**
 * The one footer of the site's pages (home, hub and policy) (site-policies): who built it at the left, the
 * policies and Feedback at the right, on the header's width under a fading hairline. Quiet links, like the
 * header's Sign in: muted until hovered, the current page in the text colour.
 */
export function SiteFooter({ current }: { current?: PolicyPageName }) {
  const t = useT();
  return (
    <footer className="page-shell site-footer">
      <nav className="footer-links" aria-label={t("nav.policies")}>
        {POLICY_LINKS.map((l) => (
          <Link key={l.page} href={l.href} aria-current={current === l.page ? "page" : undefined}>
            {t(l.label)}
          </Link>
        ))}
        {/* Not a page: it opens the Feedback dialog over this one (FR-PL-11). */}
        <button type="button" className="footer-feedback" onClick={() => openFeedback("bug")}>{t("feedback.open")}</button>
      </nav>
    </footer>
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
