import { Link } from "../Link";
import { useT } from "../i18n/locale";

export type PolicyPageName = "privacy" | "terms";

const POLICY_LINKS = [
  { page: "privacy", href: "/privacy", label: "nav.privacy" },
  { page: "terms", href: "/terms", label: "nav.terms" },
] as const satisfies readonly { page: PolicyPageName; href: string; label: string }[];

/**
 * The one footer of the home and policy pages (site-policies): who built it at the left, the
 * policies at the right, on the header's width under a fading hairline. Quiet links, like the
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
      </nav>
    </footer>
  );
}

/** The policy pages' header navigation: the other policy one step away, the current one marked. */
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
