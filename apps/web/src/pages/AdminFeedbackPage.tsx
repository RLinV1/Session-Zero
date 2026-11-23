import { useEffect, useState } from "react";
import { AdminFeedbackResponse, type AdminFeedbackReport, type FeedbackCursor } from "@vtt/shared";
import { getLocale, useT } from "../i18n/locale";
import { AdminNav, AdminNotFound } from "./AdminNav";
import "./adminStats.css";

type Load = { kind: "loading" | "failed" | "notFound" } | { kind: "ready"; data: AdminFeedbackResponse };

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
        {reports.length === 0 && <p>{t("adminFeedback.empty")}</p>}
        {reports.map((report) => <ReportCard key={report.reference} report={report} dateFormat={dateFormat} />)}
        {(cursor || next) && (
          <div className="row">
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
  return (
    <article className="admin-stats-card admin-feedback-report">
      <p className="muted"><strong>{report.reference}</strong> · {t(`feedback.kind.${report.kind}`)} · <time dateTime={report.createdAt}>{dateFormat.format(new Date(report.createdAt))}</time></p>
      <h2>{report.summary}</h2>
      <p className="admin-feedback-details">{report.details}</p>
      <p>{report.reporter ? <>{report.reporter.displayName} · <a href={`mailto:${encodeURIComponent(report.reporter.email)}`}>{report.reporter.email}</a></> : t("adminFeedback.guest")}</p>
      {report.technical && (
        <details>
          <summary>{t("adminFeedback.technical")}</summary>
          <pre className="admin-feedback-details">{JSON.stringify(report.technical, null, 2)}</pre>
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
