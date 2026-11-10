import type { ReactNode } from "react";
import { formatDateTime } from "@vtt/shared";
import { getLocale, t, tFor } from "../i18n/locale";
import { Link } from "../Link";
import { SiteFooter, PolicyNav, type PolicyPageName } from "../ui/SiteFooter";
import { PRODUCT_NAME, SiteHeader } from "../ui/SiteHeader";
import { AccountLinks } from "./home/AccountLinks";

/**
 * The privacy notice and terms of use (site-policies). Each statement here is checked against the
 * code, not copied from a template: change the page when what the app stores or sets changes.
 *
 * A document, not a decision, so it is a reading page rather than an entry card: the shared
 * header with the two policies as its navigation, one column at reading width on the hub's
 * ground, sections grouped by hairline and space (design-language: "Space and materiality").
 *
 * In another language the page is translated, says the English version governs, and links to it:
 * `?lang=en` shows the English text in the same page (localization).
 */
export const POLICIES_UPDATED = { iso: "2026-11-10", label: "10 November 2026" };

/** Where a person reaches the project: the repository's issue tracker. */
const CONTACT_URL = "https://github.com/RLinV1/Session-Zero/issues";

type Tr = typeof t;

function PolicyPage({ page, title, lead, children }: { page: PolicyPageName; title: (tr: Tr) => string; lead: (tr: Tr) => ReactNode; children: (tr: Tr) => ReactNode }) {
  const translated = getLocale() !== "en";
  const english = translated && new URLSearchParams(location.search).get("lang") === "en";
  const tr = english ? tFor("en") : t;
  const updated = english || !translated ? POLICIES_UPDATED.label : formatDateTime(getLocale(), new Date(`${POLICIES_UPDATED.iso}T12:00:00Z`), { dateStyle: "long" });
  return (
    <div className="policy-page">
      <div className="page-shell page-bar">
        <SiteHeader nav={<PolicyNav current={page} />} account={<AccountLinks />} />
      </div>
      <main className="page-shell">
        {translated && (
          <p className="policy-note notice">
            {t("policy.englishGoverns")}{" "}
            <Link href={english ? `/${page}` : `/${page}?lang=en`}>{english ? t("policy.showTranslation") : t("policy.showEnglish")}</Link>
          </p>
        )}
        <article className="policy" aria-labelledby="policy-title" lang={english ? "en" : undefined}>
          <header className="policy-head">
            <h1 id="policy-title">{title(tr)}</h1>
            <p className="policy-lead">{lead(tr)}</p>
            <p className="policy-meta">
              {tr("policy.lastUpdated")} <time dateTime={POLICIES_UPDATED.iso}>{updated}</time>
            </p>
          </header>
          {children(tr)}
        </article>
      </main>
      <SiteFooter current={page} />
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="policy-part">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPage() {
  return (
    <PolicyPage page="privacy" title={(tr) => tr("privacy.title")} lead={(tr) => tr("privacy.lead", { product: PRODUCT_NAME })}>
      {(tr) => (
        <>
          <Part title={tr("privacy.keep.title")}>
            <dl className="policy-terms">
              <dt>{tr("privacy.keep.account.term")}</dt>
              <dd>{tr("privacy.keep.account.body")}</dd>
              <dt>{tr("privacy.keep.gm.term")}</dt>
              <dd>{tr("privacy.keep.gm.body")}</dd>
              <dt>{tr("privacy.keep.room.term")}</dt>
              <dd>{tr("privacy.keep.room.body")}</dd>
              <dt>{tr("privacy.keep.guest.term")}</dt>
              <dd>{tr("privacy.keep.guest.body")}</dd>
            </dl>
          </Part>

          <Part title={tr("privacy.dont.title")}>
            <ul>
              <li>{tr("privacy.dont.tracking")}</li>
              <li>{tr("privacy.dont.sell")}</li>
              <li>{tr("privacy.dont.ip")}</li>
            </ul>
          </Part>

          <Part title={tr("privacy.long.title")}>
            <ul>
              <li>{tr("privacy.long.account")}</li>
              <li>{tr("privacy.long.room")}</li>
              <li>{tr("privacy.long.session")}</li>
            </ul>
          </Part>

          <Part title={tr("privacy.where.title")}>
            <p>{tr("privacy.where.body")}</p>
          </Part>

          <Part title={tr("privacy.cookies.title")}>
            <p>{tr("privacy.cookies.one")}</p>
            <p>{tr("privacy.cookies.local")}</p>
          </Part>

          <Part title={tr("privacy.who.title")}>
            <p>{tr("privacy.who.body")}</p>
          </Part>

          <Part title={tr("privacy.delete.title")}>
            <ul>
              <li>
                {tr("privacy.delete.account.before")}
                <strong>{tr("privacy.delete.account.strong")}</strong>
                {tr("privacy.delete.account.after")}
              </li>
              <li>{tr("privacy.delete.joined")}</li>
              <li>{tr("privacy.delete.room")}</li>
              <li>{tr("privacy.delete.library")}</li>
            </ul>
          </Part>

          <Part title={tr("privacy.contact.title")}>
            <p>
              {tr("privacy.contact.before")}
              <a href={CONTACT_URL}>{tr("privacy.contact.link")}</a>
              {tr("privacy.contact.after")}
            </p>
          </Part>
        </>
      )}
    </PolicyPage>
  );
}

export function TermsPage() {
  return (
    <PolicyPage
      page="terms"
      title={(tr) => tr("terms.title")}
      lead={(tr) => (
        <>
          {tr("terms.lead.before", { product: PRODUCT_NAME })}
          <Link href="/privacy">{tr("terms.lead.link")}</Link>
          {tr("terms.lead.after")}
        </>
      )}
    >
      {(tr) => (
        <>
          <Part title={tr("terms.asIs.title")}>
            <p>{tr("terms.asIs.body")}</p>
          </Part>

          <Part title={tr("terms.upload.title")}>
            <ul>
              <li>{tr("terms.upload.rights")}</li>
              <li>{tr("terms.upload.only")}</li>
              <li>{tr("terms.upload.license")}</li>
            </ul>
          </Part>

          <Part title={tr("terms.use.title")}>
            <ul>
              <li>{tr("terms.use.harassment")}</li>
              <li>{tr("terms.use.break")}</li>
              <li>{tr("terms.use.gm")}</li>
              <li>{tr("terms.use.password")}</li>
            </ul>
          </Part>

          <Part title={tr("terms.remove.title")}>
            <p>{tr("terms.remove.body")}</p>
          </Part>

          <Part title={tr("terms.software.title")}>
            <p>{tr("terms.software.body")}</p>
          </Part>

          <Part title={tr("terms.changes.title")}>
            <p>{tr("terms.changes.body")}</p>
          </Part>
        </>
      )}
    </PolicyPage>
  );
}
