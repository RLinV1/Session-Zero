import { useEffect, useState } from "react";
import { AdminFeedbackResponse, type AdminFeedbackReport, type FeedbackCursor, type FeedbackTechnical } from "@vtt/shared";
import { getLocale, useT } from "../i18n/locale";
import { AdminNav, AdminNotFound } from "./AdminNav";
import "./adminStats.css";

type Load = { kind: "loading" | "failed" | "notFound" } | { kind: "ready"; data: AdminFeedbackResponse };

const TECHNICAL_FIELDS = ["pagePath", "appVersion", "userAgent", "screen", "viewport", "pixelRatio", "locale", "roomId", "seq", "role"] as const satisfies readonly (keyof FeedbackTechnical)[];

export function AdminFeedbackPage() {
  const t = useT();
  const [cursor, setCursor] = useState<FeedbackCursor | null>(null);
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    const request = new AbortController();
    const query = cursor ? `?${new URLSearchParams({ at: cursor.createdAt, id: cursor.id })}` : "";
    void (async () => {
      const response = await fetch(`/api/admin/feedback${query}`, { signal: request.signal });
      if (request.signal.aborted) return;
      if (response.status === 404) {
        setLoad({ kind: "notFound" });
        return;
      }
      if (!response.ok) throw new Error("Feedback request failed");
      const data = AdminFeedbackResponse.parse(await response.json());
      if (!request.signal.aborted) setLoad({ kind: "ready", data });
    })().catch(() => {
      if (!request.signal.aborted) setLoad({ kind: "failed" });
    });
    return () => request.abort();
  }, [cursor]);

  const ready = load.kind === "ready";
  useEffect(() => {
    if (ready) document.title = t("title.page", { page: t("adminFeedback.title") });
  }, [ready, t]);

  if (load.kind === "notFound") return <AdminNotFound />;
  if (load.kind === "loading") return <main className="centered"><p role="status">{t("common.loading")}</p></main>;
  if (load.kind !== "ready") return <main className="centered"><p role="alert">{t("adminFeedback.failed")}</p></main>;

  const showPage = (next: FeedbackCursor | null) => {
    setLoad({ kind: "loading" });
    setCursor(next);
  };
  const { reports, next } = load.data;
  const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="admin-stats">
      <main className="page-shell admin-stats-main">
        <AdminNav current="feedback" />
        <h1>{t("adminFeedback.title")}</h1>
        {reports.length === 0 ? (
          <p className="muted">{t("adminFeedback.empty")}</p>
        ) : (
          <div>{reports.map((report) => <ReportCard key={report.reference} report={report} dateFormat={dateFormat} />)}</div>
        )}
        {(cursor || next) && (
          <div className="admin-feedback-pagination">
            {cursor && <button type="button" onClick={() => showPage(null)}>{t("adminFeedback.newest")}</button>}
            {next && <button type="button" onClick={() => showPage(next)}>{t("adminFeedback.older")}</button>}
          </div>
        )}
      </main>
    </div>
  );
}

function ReportCard({ report, dateFormat }: { report: AdminFeedbackReport; dateFormat: Intl.DateTimeFormat }) {
  const t = useT();
  const { technical } = report;
  return (
    <article className="admin-feedback-report">
      <div className="admin-feedback-meta">
        <p><strong>{report.reference}</strong> · {t(`feedback.kind.${report.kind}`)}</p>
        <time dateTime={report.createdAt}>{dateFormat.format(new Date(report.createdAt))}</time>
      </div>
      <h2>{report.summary}</h2>
      {report.details && <p className="admin-feedback-details">{report.details}</p>}
      <p className="admin-feedback-reporter muted">{report.reporter ? <>{report.reporter.displayName} · <a href={`mailto:${encodeURIComponent(report.reporter.email)}`}>{report.reporter.email}</a></> : t("adminFeedback.guest")}</p>
      {technical && (
        <details className="admin-feedback-technical">
          <summary>{t("adminFeedback.technical")}</summary>
          <dl>
            {TECHNICAL_FIELDS.map((field) => {
              const value = technical[field];
              if (value === undefined) return null;
              return (
                <div key={field}>
                  <dt>{t(`adminFeedback.field.${field}`)}</dt>
                  <dd>{typeof value === "object" ? `${value.width} × ${value.height}` : value}</dd>
                </div>
              );
            })}
          </dl>
        </details>
      )}
      {report.screenshots.length > 0 && (
        <div className="admin-feedback-screenshots">
          {report.screenshots.map(({ position, width, height }) => {
            const href = `/api/admin/feedback/${encodeURIComponent(report.reference)}/screenshots/${position}`;
            return (
              <a key={position} href={href} target="_blank" rel="noreferrer">
                <img src={href} loading="lazy" width={width} height={height} alt={t("adminFeedback.screenshot", { number: position + 1 })} />
              </a>
            );
          })}
        </div>
      )}
    </article>
  );
}
