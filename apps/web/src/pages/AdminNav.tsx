import { Link } from "../Link";
import { useT } from "../i18n/locale";
import { EntryPage } from "../ui/SiteHeader";

export function AdminNav({ current }: { current: "stats" | "feedback" }) {
  const t = useT();
  return (
    <nav className="site-nav admin-panel-nav" aria-label={t("adminStats.menu")}>
      <Link href="/admin/stats" className="nav-link" aria-current={current === "stats" ? "page" : undefined}>{t("adminStats.menu")}</Link>
      <Link href="/admin/feedback" className="nav-link" aria-current={current === "feedback" ? "page" : undefined}>{t("adminFeedback.title")}</Link>
    </nav>
  );
}

export function AdminNotFound() {
  const t = useT();
  return (
    <EntryPage>
      <div className="card">
        <h1>{t("notFound.title")}</h1>
        <p className="muted">{t("notFound.body")}</p>
        <Link href="/">{t("notFound.home")}</Link>
      </div>
    </EntryPage>
  );
}
