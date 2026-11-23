import { Link } from "../Link";
import { ChartBar, ChatCircleDots } from "@phosphor-icons/react";
import { useT } from "../i18n/locale";
import { Brand, EntryPage } from "../ui/SiteHeader";

export function AdminNav({ current }: { current: "stats" | "feedback" }) {
  const t = useT();
  return (
    <header className="admin-panel-header">
      <Brand />
      <nav className="admin-panel-nav" aria-label={t("adminStats.navigation")}>
        <Link href="/admin/stats" aria-current={current === "stats" ? "page" : undefined}>
          <ChartBar size={17} aria-hidden="true" />
          {t("adminStats.menu")}
        </Link>
        <Link href="/admin/feedback" aria-current={current === "feedback" ? "page" : undefined}>
          <ChatCircleDots size={17} aria-hidden="true" />
          {t("adminFeedback.title")}
        </Link>
      </nav>
    </header>
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
