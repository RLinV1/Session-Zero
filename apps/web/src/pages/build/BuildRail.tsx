import type { ReactNode } from "react";
import { useSectionInView } from "./buildHooks";

/**
 * The build page's side rail (FR-GM-27, build page layout 2026-11-12): where the draft stands, as
 * one bar, and the page's parts, with the one in view marked. It replaces a row of count pills.
 */

export interface DraftCounts {
  /** Draft items with something to fix before they can be published. */
  fix: number;
  /** Draft items with nothing to fix. */
  ready: number;
  /** Items already in the library. */
  published: number;
}

/**
 * The draft as one bar: what needs a fix, what's ready and what's published, each as a share of
 * the whole. The words beside it carry the same numbers, so the colours are never the only cue.
 */
export function DraftMeter({ counts }: { counts: DraftCounts }) {
  const total = counts.fix + counts.ready + counts.published;
  if (total === 0) return null;
  const parts = [
    { key: "fix", n: counts.fix, label: counts.fix === 1 ? "needs a fix" : "need a fix" },
    { key: "ready", n: counts.ready, label: "ready" },
    { key: "published", n: counts.published, label: "published" },
  ] as const;
  return (
    <div className="build-meter">
      <div className="build-meter-bar" aria-hidden="true">
        {parts.filter((p) => p.n > 0).map((p) => <span key={p.key} className={`build-meter-${p.key}`} style={{ flexGrow: p.n }} />)}
      </div>
      <dl className="build-meter-legend">
        {parts.map((p) => (
          <div key={p.key} className={`build-meter-row build-meter-row-${p.key}`}>
            <dt><span className="build-meter-swatch" aria-hidden="true" />{p.label}</dt>
            <dd>{p.n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface RailLink {
  id: string;
  label: string;
  /** A count beside the name, such as how many things to fix. */
  count?: number;
  /** Marks a count that asks for the person's attention. */
  urgent?: boolean;
}

/** The page's parts, each a link, with the part in view marked as the person scrolls. */
export function ContentsRail({ links, children }: { links: readonly RailLink[]; children?: ReactNode }) {
  const current = useSectionInView(links.map((l) => l.id));
  return (
    <aside className="build-rail" aria-label="This build">
      {children}
      <nav aria-label="On this page">
        <ol className="plain build-rail-links">
          {links.map((link) => (
            <li key={link.id}>
              <a href={`#${link.id}`} aria-current={current === link.id ? "location" : undefined}>
                <span>{link.label}</span>
                {link.count !== undefined && <span className={link.urgent ? "build-rail-count build-rail-urgent" : "build-rail-count"}>{link.count}</span>}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
