import { formatDateTime } from "@vtt/shared";
import { getLocale, useT } from "../i18n/locale";
import { Link } from "../Link";
import { NEWS, type NewsEntry, type NewsKind, type NewsLocale, type NewsMedia } from "../news/entries";
import { SiteFooter, PolicyNav } from "../ui/SiteFooter";
import { SiteHeader } from "../ui/SiteHeader";
import { openFeedback } from "../ui/feedback";
import { AccountLinks } from "./home/AccountLinks";

const KIND_LABEL = { feature: "news.kind.feature", fix: "news.kind.fix", notice: "news.kind.notice" } as const satisfies Record<NewsKind, string>;

/** The posts carry English and Traditional Chinese; any other locale (the pseudo-locale) reads English. */
function newsLocale(): NewsLocale {
  return getLocale() === "zh-TW" ? "zh-TW" : "en";
}

function postDate(iso: string): string {
  return formatDateTime(getLocale(), new Date(`${iso}T12:00:00Z`), { dateStyle: "long" });
}

/**
 * What's new (site-news-and-feedback): a reading page beside Privacy and Terms, on the same
 * header, column and hairlines (site-policies), not a popup. Newest first; each post has its own
 * section with an id, so a post can be linked to and the index on the right jumps to it.
 */
export function NewsPage() {
  const t = useT();
  const lang = newsLocale();
  const latest = NEWS[0];
  return (
    <div className="policy-page news-page">
      <div className="page-shell page-bar">
        <SiteHeader nav={<PolicyNav current="news" />} account={<AccountLinks />} />
      </div>
      <main className="page-shell news-layout">
        <nav className="news-index" aria-label={t("news.allUpdates")}>
          <h2 className="news-index-title">{t("news.allUpdates")}</h2>
          <ol>
            {NEWS.map((entry) => (
              <li key={entry.id}>
                <a href={`#${entry.id}`}>
                  <time dateTime={entry.date}>{postDate(entry.date)}</time>
                  <span>{entry.title[lang]}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="policy news" aria-labelledby="news-title">
          <header className="policy-head">
            <h1 id="news-title">{t("news.title")}</h1>
            <p className="policy-lead">{t("news.lead")}</p>
            <p className="policy-meta">
              {latest && <span>{t("policy.lastUpdated")} <time dateTime={latest.date}>{postDate(latest.date)}</time></span>}
              <button type="button" className="link-button news-feedback-link" onClick={() => openFeedback("bug")}>{t("feedback.newsLink")}</button>
            </p>
          </header>
          {NEWS.map((entry, i) => (
            <NewsPost key={entry.id} entry={entry} lang={lang} eager={i === 0} />
          ))}
        </article>
      </main>
      <SiteFooter current="news" />
    </div>
  );
}

function NewsPost({ entry, lang, eager }: { entry: NewsEntry; lang: NewsLocale; eager: boolean }) {
  const t = useT();
  const titleId = `${entry.id}-title`;
  return (
    <section className="policy-part news-post" id={entry.id} aria-labelledby={titleId}>
      <p className="news-meta">
        <time dateTime={entry.date}>{postDate(entry.date)}</time>
        <span className={`news-kind news-kind-${entry.kind}`}>{t(KIND_LABEL[entry.kind])}</span>
      </p>
      <h2 id={titleId}>{entry.title[lang]}</h2>
      {entry.media && <NewsFigure media={entry.media} lang={lang} eager={eager} />}
      {entry.body[lang].map((block, i) =>
        "p" in block ? (
          <p key={i}>{block.p}</p>
        ) : "h" in block ? (
          <h3 key={i}>{block.h}</h3>
        ) : (
          <ul key={i}>
            {block.ul.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      )}
      {entry.link && (
        <p>
          <Link href={entry.link.href} className="news-link">
            {entry.link.label[lang]} <span aria-hidden="true">→</span>
          </Link>
        </p>
      )}
    </section>
  );
}

/** A post's picture or clip. A clip never autoplays, shows the browser's controls, and loads only when played. */
function NewsFigure({ media, lang, eager }: { media: NewsMedia; lang: NewsLocale; eager: boolean }) {
  const t = useT();
  return (
    <figure className="news-figure">
      {media.type === "image" ? (
        <img src={media.src} width={media.width} height={media.height} alt={media.alt[lang]} loading={eager ? "eager" : "lazy"} decoding="async" />
      ) : (
        <video controls preload="none" poster={media.poster} width={media.width} height={media.height} aria-label={media.alt[lang]}>
          <source src={media.src} type="video/mp4" />
          {media.captionsSrc && <track kind="captions" src={media.captionsSrc} srcLang="en" label={t("news.captions")} />}
        </video>
      )}
      {media.caption && <figcaption>{media.caption[lang]}</figcaption>}
    </figure>
  );
}
