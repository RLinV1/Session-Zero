import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatNumber, LaunchStatsResponse, type LaunchStatsCounts, type LaunchStatsDayRow } from "@vtt/shared";
import { getLocale, useT } from "../i18n/locale";
import { EntryPage } from "../ui/SiteHeader";
import "./adminStats.css";

/**
 * Site admins' launch stats (ADR 0080): aggregate counts per UTC day, for the weekly launch report.
 * Linked from nowhere. The server answers anyone else with the same 404 as an address that
 * doesn't exist, and this page then shows the same "Page not found" card as the router does.
 */

type Metric = keyof LaunchStatsCounts;

/** The order of the tiles, the chart's choices and the table's columns: the launch's main number first. */
const METRICS: readonly Metric[] = [
  "playedRooms", "peopleActive", "activeRooms", "returningRooms", "roomsCreated", "roomsCreatedByGuests", "roomsCreatedByAccounts", "accountsCreated", "aiSeatsJoined",
  "accountsToDate", "roomsToDate",
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
    // The router titles this address "Page not found" (ADR 0080); only an admin's page says what it is.
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
          <div>
            <h1>{t("adminStats.heading")}</h1>
            {stats && <p className="muted">{t("adminStats.range", { from: stats.range.from, to: stats.range.to })}</p>}
          </div>
          <RangeForm key={`${stats?.range.from}/${stats?.range.to}`} initial={stats?.range ?? range} onPick={pick} />
        </header>
        {load.kind === "badRange" && <p className="notice" role="alert">{t("adminStats.badRange")}</p>}
        {load.kind === "failed" && <p className="notice" role="alert">{t("adminStats.failed")}</p>}
        {stats && <StatsBody stats={stats} />}
      </main>
    </div>
  );
}

const PRESETS = [7, 30, 90] as const;

function RangeForm({ initial, onPick }: { initial: Range; onPick: (range: Range) => void }) {
  const t = useT();
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onPick({ from: from || undefined, to: to || undefined });
  };
  const current = PRESETS.find((days) => {
    const preset = lastDays(days);
    return preset.from === initial.from && preset.to === initial.to;
  });
  return (
    <form className="admin-stats-range" onSubmit={submit}>
      <span className="admin-stats-presets" role="group">
        {PRESETS.map((days) => (
          <button key={days} type="button" aria-pressed={days === current} onClick={() => onPick(lastDays(days))}>
            {t(`adminStats.preset.${days}`)}
          </button>
        ))}
      </span>
      <span className="admin-stats-dates">
        <input type="date" aria-label={t("adminStats.from")} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span aria-hidden="true">–</span>
        <input type="date" aria-label={t("adminStats.to")} value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="submit">{t("adminStats.show")}</button>
      </span>
    </form>
  );
}

/** The smaller charts under the main one, in reading order. */
const SMALL: readonly Metric[] = ["peopleActive", "activeRooms", "returningRooms", "roomsCreated", "accountsCreated", "aiSeatsJoined"];

/** Running totals: how the site has grown, to the end of each day. */
const GROWTH: readonly Metric[] = ["accountsToDate", "roomsToDate"];

function StatsBody({ stats }: { stats: LaunchStatsResponse }) {
  const t = useT();
  const locale = getLocale();
  const n = (value: number) => formatNumber(locale, value);
  return (
    <>
      <section className="admin-stats-card kpi" aria-labelledby="admin-stats-playedRooms">
        <div className="admin-stats-card-head">
          <div>
            <h2 id="admin-stats-playedRooms">{metricLabel(t, "playedRooms")}</h2>
            <p className="muted">{t("adminStats.kpi")}</p>
          </div>
          <p className="admin-stats-total">{n(stats.totals.playedRooms)}</p>
        </div>
        <LineChart days={stats.days} metric="playedRooms" label={t("adminStats.chartLabel", { metric: metricLabel(t, "playedRooms") })} format={n} height={200} />
      </section>

      <section className="admin-stats-growth" aria-labelledby="admin-stats-growth">
        <div>
          <h2 id="admin-stats-growth">{t("adminStats.growth")}</h2>
          <p className="muted">{t("adminStats.growthLead")}</p>
        </div>
        <div className="admin-stats-multiples">
          {GROWTH.map((metric) => (
            <section key={metric} className="admin-stats-card" aria-labelledby={`admin-stats-${metric}`}>
              <div className="admin-stats-card-head">
                <h3 id={`admin-stats-${metric}`}>{metricLabel(t, metric)}</h3>
                <p className="admin-stats-total">{n(stats.totals[metric])}</p>
              </div>
              <LineChart days={stats.days} metric={metric} label={t("adminStats.chartLabel", { metric: metricLabel(t, metric) })} format={n} height={140} />
            </section>
          ))}
        </div>
      </section>

      <h2>{t("adminStats.daily")}</h2>
      <div className="admin-stats-multiples">
        {SMALL.map((metric) => (
          <section key={metric} className="admin-stats-card" aria-labelledby={`admin-stats-${metric}`}>
            <div className="admin-stats-card-head">
              <div>
                <h2 id={`admin-stats-${metric}`}>{metricLabel(t, metric)}</h2>
                {metric === "roomsCreated" && (
                  <p className="muted">{t("adminStats.roomsSplit", { guests: n(stats.totals.roomsCreatedByGuests), accounts: n(stats.totals.roomsCreatedByAccounts) })}</p>
                )}
              </div>
              <p className="admin-stats-total">{n(stats.totals[metric])}</p>
            </div>
            <LineChart days={stats.days} metric={metric} label={t("adminStats.chartLabel", { metric: metricLabel(t, metric) })} format={n} height={96} />
          </section>
        ))}
      </div>

      <details className="admin-stats-details">
        <summary>{t("adminStats.table")}</summary>
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
      </details>

      <details className="admin-stats-details">
        <summary>{t("adminStats.notes")}</summary>
        <ul className="admin-stats-notes">
          <li>{t("adminStats.note.played")}</li>
          <li>{t("adminStats.note.people")}</li>
          <li>{t("adminStats.note.growth")}</li>
          <li>{t("adminStats.note.active")}</li>
          <li>{t("adminStats.note.rooms")}</li>
          <li>{t("adminStats.note.ai")}</li>
          <li>{t("adminStats.note.deleted")}</li>
          <li>{t("adminStats.note.totals")}</li>
        </ul>
      </details>
    </>
  );
}

function metricLabel(t: ReturnType<typeof useT>, metric: Metric): string {
  return t(`adminStats.metric.${metric}`);
}

const PAD = { top: 10, right: 8, bottom: 22, left: 8 };

/**
 * One count per day as a line on a zero baseline, drawn at the element's own width so the line
 * and its dots keep their size. A single series, so no legend: the card's heading names it.
 * Pointing at the chart marks the nearest day and shows its number above the chart; the table
 * holds every number.
 */
function LineChart({ days, metric, label, format, height }: {
  days: LaunchStatsDayRow[];
  metric: Metric;
  label: string;
  format: (value: number) => string;
  height: number;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const max = Math.max(1, ...days.map((d) => d[metric]));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (days.length > 1 ? (i / (days.length - 1)) * plotW : plotW / 2);
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const points = days.map((d, i) => `${x(i)},${y(d[metric])}`).join(" ");
  const shown = active === null ? null : days[active];

  const pointAt = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || days.length === 0) return;
    const ratio = (clientX - rect.left - PAD.left) / Math.max(1, plotW);
    setActive(Math.min(days.length - 1, Math.max(0, Math.round(ratio * (days.length - 1)))));
  };

  return (
    <figure className="admin-stats-chart">
      <div className="admin-stats-chart-meta">
        <span className="muted">{t("adminStats.chartMax", { value: format(max) })}</span>
        <span aria-live="polite">{shown ? t("adminStats.point", { date: shown.date, value: format(shown[metric]) }) : ""}</span>
      </div>
      <div
        ref={box}
        className="admin-stats-plot"
        style={{ height }}
        onPointerMove={(e) => pointAt(e.clientX)}
        onPointerDown={(e) => pointAt(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label}>
            <line className="admin-stats-grid-line" x1={PAD.left} x2={PAD.left + plotW} y1={y(max)} y2={y(max)} />
            <line className="admin-stats-baseline" x1={PAD.left} x2={PAD.left + plotW} y1={y(0)} y2={y(0)} />
            {shown && active !== null && <line className="admin-stats-guide" x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} />}
            <polygon className="admin-stats-area" points={`${x(0)},${y(0)} ${points} ${x(days.length - 1)},${y(0)}`} />
            <polyline className="admin-stats-line" points={points} />
            {days.length <= 31 && days.map((d, i) => d[metric] > 0 && <circle key={d.date} className="admin-stats-dot" cx={x(i)} cy={y(d[metric])} r={2.5} />)}
            {shown && active !== null && <circle className="admin-stats-dot active" cx={x(active)} cy={y(shown[metric])} r={5} />}
            <text className="admin-stats-tick" x={PAD.left} y={height - 6} textAnchor="start">{days[0]?.date}</text>
            <text className="admin-stats-tick" x={PAD.left + plotW} y={height - 6} textAnchor="end">{days.at(-1)?.date}</text>
          </svg>
        )}
      </div>
    </figure>
  );
}
