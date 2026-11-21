import { useEffect, useState, type FormEvent } from "react";
import { formatNumber, LaunchStatsResponse, type LaunchStatsCounts, type LaunchStatsDayRow } from "@vtt/shared";
import { getLocale, useT } from "../i18n/locale";
import { EntryPage } from "../ui/SiteHeader";
import "./adminStats.css";

/**
 * Site admins' launch stats (ADR 0079): aggregate counts per UTC day, for the weekly launch report.
 * Linked from nowhere. The server answers anyone else with the same 404 as an address that
 * doesn't exist, and this page then shows the same "Page not found" card as the router does.
 */

type Metric = keyof LaunchStatsCounts;

/** The order of the tiles, the chart's choices and the table's columns: the launch's main number first. */
const METRICS: readonly Metric[] = [
  "playedRooms", "activeRooms", "returningRooms", "roomsCreated", "roomsCreatedByGuests", "roomsCreatedByAccounts", "accountsCreated", "aiSeatsJoined",
];

type Load =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "badRange" }
  | { kind: "failed" }
  | { kind: "ready"; stats: LaunchStatsResponse };

interface Range { from?: string; to?: string }

function rangeFromAddress(): Range {
  const params = new URLSearchParams(location.search);
  return { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined };
}

function query(range: Range): string {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** The last `days` UTC days, today included. */
function lastDays(days: number): Range {
  const now = Date.now();
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: day(now - (days - 1) * 86_400_000), to: day(now) };
}

export function AdminStatsPage() {
  const t = useT();
  const [range, setRange] = useState<Range>(rangeFromAddress);
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let current = true;
    setLoad((was) => (was.kind === "ready" ? was : { kind: "loading" }));
    void (async () => {
      try {
        const res = await fetch(`/api/admin/stats${query(range)}`, { headers: { accept: "application/json" } });
        if (!current) return;
        if (res.status === 404) return setLoad({ kind: "notFound" });
        if (res.status === 400) return setLoad({ kind: "badRange" });
        if (!res.ok) return setLoad({ kind: "failed" });
        const stats = LaunchStatsResponse.parse(await res.json());
        if (current) setLoad({ kind: "ready", stats });
      } catch {
        if (current) setLoad({ kind: "failed" });
      }
    })();
    return () => {
      current = false;
    };
  }, [range]);

  const ready = load.kind === "ready";
  useEffect(() => {
    // The router titles this address "Page not found" (ADR 0079); only an admin's page says what it is.
    if (ready) document.title = t("title.page", { page: t("title.adminStats") });
  }, [ready, t]);

  const pick = (next: Range) => {
    history.replaceState(null, "", `/admin/stats${query(next)}`);
    setRange(next);
  };

  if (load.kind === "loading") return <main className="centered"><p role="status">{t("common.loading")}</p></main>;
  if (load.kind === "notFound") {
    return (
      <EntryPage>
        <div className="card">
          <h1>{t("notFound.title")}</h1>
          <p className="muted">{t("notFound.body")}</p>
          <a href="/">{t("notFound.home")}</a>
        </div>
      </EntryPage>
    );
  }

  const stats = load.kind === "ready" ? load.stats : null;
  return (
    <div className="admin-stats">
      <main className="page-shell admin-stats-main">
        <header className="admin-stats-head">
          <h1>{t("adminStats.heading")}</h1>
          <p className="muted">{t("adminStats.lead")}</p>
        </header>
        <RangeForm key={`${stats?.range.from}/${stats?.range.to}`} initial={stats?.range ?? range} onPick={pick} />
        {load.kind === "badRange" && <p className="notice" role="alert">{t("adminStats.badRange")}</p>}
        {load.kind === "failed" && <p className="notice" role="alert">{t("adminStats.failed")}</p>}
        {stats && <StatsBody stats={stats} />}
      </main>
    </div>
  );
}

function RangeForm({ initial, onPick }: { initial: Range; onPick: (range: Range) => void }) {
  const t = useT();
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onPick({ from: from || undefined, to: to || undefined });
  };
  return (
    <form className="admin-stats-range" onSubmit={submit}>
      <label>
        {t("adminStats.from")}
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        {t("adminStats.to")}
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <button type="submit" className="primary">{t("adminStats.show")}</button>
      <span className="admin-stats-presets">
        {([7, 30, 90] as const).map((days) => (
          <button key={days} type="button" onClick={() => onPick(lastDays(days))}>{t(`adminStats.preset.${days}`)}</button>
        ))}
      </span>
    </form>
  );
}

function StatsBody({ stats }: { stats: LaunchStatsResponse }) {
  const t = useT();
  const locale = getLocale();
  const n = (value: number) => formatNumber(locale, value);
  const [metric, setMetric] = useState<Metric>("playedRooms");
  return (
    <>
      <p className="muted">{t("adminStats.range", { from: stats.range.from, to: stats.range.to })}</p>

      <section aria-labelledby="admin-stats-totals">
        <h2 id="admin-stats-totals">{t("adminStats.totals")}</h2>
        <dl className="admin-stats-tiles">
          {METRICS.map((m) => (
            <div key={m} className={m === "playedRooms" ? "admin-stats-tile lead" : "admin-stats-tile"}>
              <dt>{metricLabel(t, m)}</dt>
              <dd>{n(stats.totals[m])}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="admin-stats-chart">
        <div className="admin-stats-chart-head">
          <h2 id="admin-stats-chart">{t("adminStats.chart")}</h2>
          <label>
            {t("adminStats.chartMetric")}{" "}
            <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
              {METRICS.map((m) => <option key={m} value={m}>{metricLabel(t, m)}</option>)}
            </select>
          </label>
        </div>
        <DayChart days={stats.days} metric={metric} label={t("adminStats.chartLabel", { metric: metricLabel(t, metric) })} format={n} />
      </section>

      <section aria-labelledby="admin-stats-table">
        <h2 id="admin-stats-table">{t("adminStats.table")}</h2>
        <div className="admin-stats-scroll">
          <table className="admin-stats-grid">
            <thead>
              <tr>
                <th scope="col">{t("adminStats.date")}</th>
                {METRICS.map((m) => <th key={m} scope="col">{metricLabel(t, m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...stats.days].reverse().map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  {METRICS.map((m) => <td key={m}>{n(day[m])}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t("adminStats.total")}</th>
                {METRICS.map((m) => <td key={m}>{n(stats.totals[m])}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="admin-stats-notes" className="admin-stats-notes">
        <h2 id="admin-stats-notes">{t("adminStats.notes")}</h2>
        <ul>
          <li>{t("adminStats.note.played")}</li>
          <li>{t("adminStats.note.active")}</li>
          <li>{t("adminStats.note.rooms")}</li>
          <li>{t("adminStats.note.ai")}</li>
          <li>{t("adminStats.note.deleted")}</li>
          <li>{t("adminStats.note.totals")}</li>
        </ul>
      </section>
    </>
  );
}

function metricLabel(t: ReturnType<typeof useT>, metric: Metric): string {
  return t(`adminStats.metric.${metric}`);
}

/**
 * One bar per day for one count, on a zero baseline. A single series, so no legend: the label
 * names it. Each bar shows its day and value on hover or focus; the table below holds every number.
 */
function DayChart({ days, metric, label, format }: { days: LaunchStatsDayRow[]; metric: Metric; label: string; format: (value: number) => string }) {
  const t = useT();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d[metric]));
  const shown = active === null ? null : days[active];
  return (
    <figure className="admin-stats-chart" aria-label={label}>
      <div className="admin-stats-chart-meta">
        <span className="muted">{t("adminStats.chartMax", { value: format(max) })}</span>
        <span aria-live="polite">{shown ? `${shown.date}: ${format(shown[metric])}` : ""}</span>
      </div>
      <div className="admin-stats-bars" onMouseLeave={() => setActive(null)}>
        {days.map((day, i) => (
          <button
            key={day.date}
            type="button"
            className={i === active ? "admin-stats-bar active" : "admin-stats-bar"}
            aria-label={`${day.date}: ${format(day[metric])}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            <span style={{ height: `${(day[metric] / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="admin-stats-axis muted">
        <span>{days[0]?.date}</span>
        <span>{days.at(-1)?.date}</span>
      </div>
    </figure>
  );
}
