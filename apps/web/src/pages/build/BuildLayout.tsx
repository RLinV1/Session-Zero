import { useEffect, useState, type ReactNode } from "react";
import { buildFieldLabel, type BuildCheckIssue, type BuildFlag } from "@vtt/shared";

/**
 * The build page's parts: sections a person can fold away, and the AI's words laid out so they
 * read as a list of short facts rather than one block of text (FR-GM-27).
 */

/** A section the person can close while they work on another. It opens again by itself when a link points into it. */
export function Fold({ id, title, summary, defaultOpen, className, children }: {
  id: string;
  title: string;
  /** What's inside, in a few words, so a closed section still says where it stands. */
  summary?: ReactNode;
  defaultOpen: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className={`build-section build-fold${className ? ` ${className}` : ""}`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <h2 id={id}>{title}</h2>
        {summary !== undefined && <span className="build-fold-summary">{summary}</span>}
      </summary>
      <div className="build-fold-body">{children}</div>
    </details>
  );
}

/** Opens every folded section around an element, so a link into one shows what it points at. */
export function revealElement(element: Element | null) {
  for (let fold = element?.closest("details") ?? null; fold; fold = fold.parentElement?.closest("details") ?? null) {
    if (!fold.open) fold.open = true;
  }
}

/**
 * "CORE ROLL" reads as "Core roll" and "STORM CLOCK (hidden token)" as "Storm clock (hidden token)".
 * Short capitals such as HP, AC or GM are taken as abbreviations and kept.
 */
const sentenceCase = (term: string) => {
  const lowered = term.replace(/\b[A-Z]{4,}\b/g, (word) => word.toLowerCase());
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
};

/** A line that starts with a short label, such as "Move: 6" or "CORE ROLL: 2d6 + trait". */
const LABELLED = /^([^:]{1,48}):\s+(.+)$/;

/**
 * The AI's free text, one fact to a line. A line that starts with a short label puts the label in
 * its own column, so a long block of notes can be scanned down its left edge.
 */
export function NoteText({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);
  const labelled = lines.map((line) => LABELLED.exec(line));
  if (labelled.filter(Boolean).length < 2) return <p className="build-text">{text}</p>;
  return (
    <dl className="build-facts">
      {lines.map((line, i) => {
        const match = labelled[i];
        return match
          ? <div key={i}><dt>{sentenceCase(match[1]!.trim())}</dt><dd>{match[2]}</dd></div>
          : <div key={i} className="build-fact-plain"><dd>{line}</dd></div>;
      })}
    </dl>
  );
}

/** An item's flags, each under the field it is about, named as people know it ("Art", not "imageFileId"). */
export function FlagList({ flags }: { flags: readonly BuildFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <dl className="build-facts build-flags">
      {flags.map((f, i) => <div key={i}><dt>{buildFieldLabel(f.field)}</dt><dd>{f.message}</dd></div>)}
    </dl>
  );
}

export interface IssueGroup {
  item: string;
  label: string;
  target: BuildCheckIssue["target"];
  issues: BuildCheckIssue[];
}

/** Issues about the same item together, in the order they first appear. */
export function groupIssues(issues: readonly BuildCheckIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const group = groups.get(issue.item) ?? { item: issue.item, label: issue.label, target: issue.target, issues: [] };
    group.issues.push(issue);
    groups.set(issue.item, group);
  }
  return [...groups.values()];
}

/** The first sentence of a message, and the rest. */
const firstSentence = (message: string): [string, string] => {
  const end = message.indexOf(". ");
  return end < 0 ? [message, ""] : [message.slice(0, end + 1), message.slice(end + 2)];
};

/** A flag's message as the check writes it, "Field: what the AI said", split back into its two parts. */
const fieldAndMessage = (message: string): [string | null, string] => {
  const match = LABELLED.exec(message);
  return match ? [match[1]!, match[2]!] : [null, message];
};

type LinkTo = (target: NonNullable<IssueGroup["target"]>) => string;
/** The picture for an item, a map or a creature's art, or none. */
export type ThumbFor = (target: IssueGroup["target"]) => string | null;

function GroupTitle({ group, linkTo }: { group: IssueGroup; linkTo: LinkTo }) {
  return (
    <h3 className="build-group-title">
      {group.target ? <a href={`#${linkTo(group.target)}`}>{group.label}</a> : group.label}
      {group.issues.length > 1 && <span className="build-group-count">{group.issues.length}</span>}
    </h3>
  );
}

/** An item's picture beside its issues, so the list reads by thing rather than by sentence. */
function Thumb({ url }: { url: string | null }) {
  return url
    ? <img className="build-group-thumb" src={url} alt="" loading="lazy" />
    : <span className="build-group-thumb build-group-thumb-blank" aria-hidden="true" />;
}

/**
 * What still needs fixing, one row per item. When every fix on an item ends with the same
 * instruction, such as where to do it, it is said once under the list rather than on every line.
 */
export function ProblemGroups({ groups, linkTo, thumbFor }: { groups: readonly IssueGroup[]; linkTo: LinkTo; thumbFor?: ThumbFor }) {
  return (
    <ul className="plain build-groups">
      {groups.map((group) => {
        const parts = group.issues.map((i) => firstSentence(i.message));
        const shared = parts.length > 1 && parts[0]![1] !== "" && parts.every(([, rest]) => rest === parts[0]![1]) ? parts[0]![1] : null;
        return (
          <li key={group.item} className="build-group build-problem">
            <Thumb url={thumbFor?.(group.target) ?? null} />
            <div className="build-group-body">
              <GroupTitle group={group} linkTo={linkTo} />
              <ul className="build-group-list">
                {group.issues.map((issue, i) => <li key={i}>{shared ? parts[i]![0] : issue.message}</li>)}
              </ul>
              {shared && <p className="muted small-print">{shared}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The AI's notes, one row per item, each note under the field it is about. */
export function NoteGroups({ groups, linkTo, thumbFor }: { groups: readonly IssueGroup[]; linkTo: LinkTo; thumbFor?: ThumbFor }) {
  return (
    <ul className="plain build-groups">
      {groups.map((group) => (
        <li key={group.item} className="build-group build-flag">
          <Thumb url={thumbFor?.(group.target) ?? null} />
          <div className="build-group-body">
            <GroupTitle group={group} linkTo={linkTo} />
            <dl className="build-facts">
              {group.issues.map((issue, i) => {
                const [field, text] = fieldAndMessage(issue.message);
                return field ? <div key={i}><dt>{field}</dt><dd>{text}</dd></div> : <div key={i} className="build-fact-plain"><dd>{text}</dd></div>;
              })}
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Fixes and notes as one queue, switched with a segmented control rather than two long sections.
 * Fixes come first while there are any. A link to `#build-notes` switches to the notes.
 */
export function ReviewQueue({ problems, notes, linkTo, thumbFor }: { problems: readonly IssueGroup[]; notes: readonly IssueGroup[]; linkTo: LinkTo; thumbFor: ThumbFor }) {
  const count = (groups: readonly IssueGroup[]) => groups.reduce((n, g) => n + g.issues.length, 0);
  const [tab, setTab] = useState<"fix" | "notes">(problems.length > 0 ? "fix" : "notes");
  const shown = tab === "fix" && problems.length === 0 ? "notes" : tab === "notes" && notes.length === 0 ? "fix" : tab;
  useEffect(() => {
    const follow = () => {
      if (location.hash === "#build-notes") setTab("notes");
      if (location.hash === "#build-issues") setTab("fix");
    };
    follow();
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);
  return (
    <section className="build-section build-queue" aria-labelledby="build-issues">
      <div className="build-section-head">
        <h2 id="build-issues" tabIndex={-1}>Review</h2>
        <div className="seg seg-small" role="group" aria-label="Show">
          <button type="button" id="build-notes-fix" aria-pressed={shown === "fix"} disabled={problems.length === 0} onClick={() => setTab("fix")}>
            To fix <span className="build-seg-count">{count(problems)}</span>
          </button>
          <button type="button" id="build-notes" aria-pressed={shown === "notes"} disabled={notes.length === 0} onClick={() => setTab("notes")}>
            Notes from your AI <span className="build-seg-count">{count(notes)}</span>
          </button>
        </div>
      </div>
      {shown === "fix"
        ? <ProblemGroups groups={problems} linkTo={linkTo} thumbFor={thumbFor} />
        : (
          <>
            <p className="muted small-print">What your AI wasn't sure of, or couldn't store. Nothing here stops publishing.</p>
            <NoteGroups groups={notes} linkTo={linkTo} thumbFor={thumbFor} />
          </>
        )}
    </section>
  );
}
