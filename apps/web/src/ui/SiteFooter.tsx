import { Link } from "../Link";

export type PolicyPageName = "privacy" | "terms";

const POLICY_LINKS: { page: PolicyPageName; href: string; label: string }[] = [
  { page: "privacy", href: "/privacy", label: "Privacy" },
  { page: "terms", href: "/terms", label: "Terms" },
];

/**
 * The one footer of the home and policy pages (site-policies): who built it at the left, the
 * policies at the right, on the header's width under a fading hairline. Quiet links, like the
 * header's Sign in: muted until hovered, the current page in the text colour.
 */
export function SiteFooter({ current }: { current?: PolicyPageName }) {
  return (
    <footer className="page-shell site-footer">
      <nav className="footer-links" aria-label="Policies">
        {POLICY_LINKS.map((l) => (
          <Link key={l.page} href={l.href} aria-current={current === l.page ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

/** The policy pages' header navigation: the other policy one step away, the current one marked. */
export function PolicyNav({ current }: { current: PolicyPageName }) {
  return (
    <>
      {POLICY_LINKS.map((l) => (
        <Link key={l.page} href={l.href} className="nav-link" aria-current={current === l.page ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
