import { GUEST_ROOM_IDLE_DAYS } from "@vtt/shared";
import { Link } from "../../Link";
import { t } from "../../i18n/locale";

/** The first-session path and account choices, with product facts rather than invented testimonials. */
export function SessionGuide() {
  return (
    <section className="home-section session-guide" aria-labelledby="session-guide-heading">
      <div className="section-copy">
        <h3 id="session-guide-heading">{t("home.session.title")}</h3>
        <p>{t("home.session.body")}</p>
      </div>
      <ol className="session-walkthrough" aria-label={t("home.session.steps")}>
        {(["map", "invite", "play"] as const).map((step) => (
          <li key={step}>
            <h4>{t(`home.session.${step}.title`)}</h4>
            <p>{t(`home.session.${step}.body`)}</p>
          </li>
        ))}
      </ol>

      <div className="session-account-options" aria-label={t("home.session.options")}>
        <div>
          <h4>{t("home.session.guest.title")}</h4>
          <p>{t("home.session.guest.body")}</p>
          <p className="small-print muted">{t("home.session.guest.keep", { days: GUEST_ROOM_IDLE_DAYS })}</p>
          <Link href="/start" className="ui-button">{t("home.hero.start")}</Link>
        </div>
        <div>
          <h4>{t("home.session.account.title")}</h4>
          <p>{t("home.session.account.body")}</p>
          <p className="small-print muted">{t("home.session.account.players")}</p>
          <Link href="/signup?next=%2Fgm-dashboard" className="ui-button">{t("home.session.account.create")}</Link>
        </div>
      </div>

      <div className="session-table-notes">
        <h4>{t("home.session.table.title")}</h4>
        <dl>
          <div><dt>{t("home.session.table.join")}</dt><dd>{t("home.session.table.joinBody")}</dd></div>
          <div><dt>{t("home.session.table.together")}</dt><dd>{t("home.session.table.togetherBody")}</dd></div>
        </dl>
      </div>
    </section>
  );
}
