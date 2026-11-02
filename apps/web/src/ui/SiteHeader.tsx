import type { ReactNode } from "react";
import { CircleHalfTilt, Moon, Sun } from "@phosphor-icons/react";
import { Link } from "../Link";
import { useGroundTheme, type ThemeChoice } from "../theme";

/**
 * The product's name, in one place (design-language: "One header"). The group has not picked
 * the name yet; when it does, this line and public/brand-mark.svg are all that change.
 */
export const PRODUCT_NAME = "Virtual Tabletop";

/** The mark and the name, linking home. */
export function Brand() {
  return (
    <Link href="/" className="brand">
      <img className="brand-mark" src="/brand-mark.svg" alt="" width={28} height={28} />
      {PRODUCT_NAME}
    </Link>
  );
}

const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: "light", light: "dark", dark: "auto" };
const THEME_LABEL: Record<ThemeChoice, string> = {
  auto: "Theme: follows your system. Switch to light",
  light: "Theme: light. Switch to dark",
  dark: "Theme: dark. Switch to system",
};

/**
 * Auto follows the system. The explicit choices exist because a GM running a session in a dark
 * room and one reading on a bright train want opposite grounds. The choice holds on every page
 * outside the table (theme.ts).
 */
export function ThemeToggle() {
  const { choice, choose } = useGroundTheme();
  const Icon = { auto: CircleHalfTilt, light: Sun, dark: Moon }[choice];
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={() => choose(NEXT[choice])}
      aria-label={THEME_LABEL[choice]}
      title={THEME_LABEL[choice]}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

/**
 * The one header of the home and hub pages: the mark and name, the page's navigation, the
 * account control and the theme toggle, always in the same places.
 */
export function SiteHeader({ nav, account }: { nav?: ReactNode; account?: ReactNode }) {
  return (
    <header className="site-header">
      <Brand />
      {nav && (
        <nav className="site-nav" aria-label="Main">
          {nav}
        </nav>
      )}
      <div className="site-actions">
        {account}
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Entry pages ask one thing at a time, so their header is the mark and name only. */
export function EntryHeader() {
  return (
    <header className="site-header entry-header">
      <Brand />
    </header>
  );
}

/**
 * An entry page (sign in, sign up, join, not found): the mark and name, then one card centred on
 * the lit table (design-language: "Background by layer").
 */
export function EntryPage({ children }: { children: ReactNode }) {
  return (
    <div className="entry">
      <div className="page-shell page-bar">
        <EntryHeader />
      </div>
      <main className="entry-main">{children}</main>
    </div>
  );
}

/** The hub pages' navigation: the GM's rooms and the library, the current one marked. */
export function HubNav({ current }: { current: "rooms" | "library" }) {
  return (
    <>
      <Link href="/gm-dashboard" className="nav-link" aria-current={current === "rooms" ? "page" : undefined}>
        Your rooms
      </Link>
      <Link href="/library" className="nav-link" aria-current={current === "library" ? "page" : undefined}>
        Library
      </Link>
    </>
  );
}
