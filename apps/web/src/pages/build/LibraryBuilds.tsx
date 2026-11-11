import { useEffect, useId, useRef, useState } from "react";
import { BUILD_LIMITS, NO_BUILD_CHOICES, formatDateTime, type BuildChoices, type BuildSummary } from "@vtt/shared";
import { formattingLocale, t, useLocale, type TextId } from "../../i18n/locale";
import { api } from "../../net/api";
import { navigate } from "../../router";
import { EmptyState } from "../../ui/EmptyState";
import { Modal } from "../../ui/Modal";
import { PassPanel } from "./PassPanel";
import { RIGHTS_NOTICE } from "./buildCopy";
import { EMPTY_PROGRESS, buildProgress, counted, type BuildProgress } from "./buildProgress";

/** The line saying why New build is off, so the library toolbar's button can point at it. */
export const BUILD_LIMIT_REASON_ID = "build-limit-reason";

/** A build closing within this long says so on its card, not only in the small print. */
const CLOSING_SOON_MS = 3 * 24 * 60 * 60 * 1000;

const day = (iso: string) => formatDateTime(formattingLocale(), new Date(iso), { month: "long", day: "numeric" });
const moment = (iso: string) => formatDateTime(formattingLocale(), new Date(iso), { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const openBuildPage = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(`/builds/${id}`); };

function ChoiceBoxes({ choices, onChange }: { choices: BuildChoices; onChange: (choices: BuildChoices) => void }) {
  return (
    <>
      <label className="build-choice">
        <input type="checkbox" checked={choices.aiGrid} onChange={(e) => onChange({ ...choices, aiGrid: e.target.checked })} />
        <span>{t("build.choice.aiGrid")} <span className="muted small-print">{t("build.choice.aiGridHint")}</span></span>
      </label>
      <label className="build-choice">
        <input type="checkbox" checked={choices.aiWalls} onChange={(e) => onChange({ ...choices, aiWalls: e.target.checked })} />
        <span>{t("build.choice.aiWalls")} <span className="muted small-print">{t("build.choice.aiWallsHint")}</span></span>
      </label>
    </>
  );
}

/**
 * The owner's two choices for what their AI may set up on maps (ADR 0053). Off unless ticked,
 * both when starting a build and on its page.
 */
export function BuildChoiceFields({ choices, onChange, disabled }: { choices: BuildChoices; onChange: (choices: BuildChoices) => void; disabled?: boolean }) {
  return (
    <fieldset className="build-choices" disabled={disabled}>
      <legend>{t("build.choice.legend")}</legend>
      <ChoiceBoxes choices={choices} onChange={onChange} />
    </fieldset>
  );
}

/** The usual answers to "how much map setup does my AI do", over the same two choices. Shown with `t()`. */
const MAP_SETUPS: { label: TextId; detail: TextId; choices: BuildChoices }[] = [
  { label: "build.setup.you", detail: "build.setup.youDetail", choices: { aiGrid: false, aiWalls: false } },
  { label: "build.setup.grids", detail: "build.setup.gridsDetail", choices: { aiGrid: true, aiWalls: false } },
  { label: "build.setup.all", detail: "build.setup.allDetail", choices: { aiGrid: true, aiWalls: true } },
];

/** One choice for the usual cases, and each of the two on its own for the rest. */
function MapSetupFields({ choices, onChange }: { choices: BuildChoices; onChange: (choices: BuildChoices) => void }) {
  const group = useId();
  return (
    <fieldset className="build-choices">
      <legend>{t("build.setup.legend")}</legend>
      {MAP_SETUPS.map((setup) => (
        <label key={setup.label} className="build-choice">
          <input
            type="radio"
            name={group}
            checked={setup.choices.aiGrid === choices.aiGrid && setup.choices.aiWalls === choices.aiWalls}
            onChange={() => onChange(setup.choices)}
          />
          <span>{t(setup.label)} <span className="muted small-print">{t(setup.detail)}</span></span>
        </label>
      ))}
      <details className="build-disclosure">
        <summary>{t("build.setup.separately")}</summary>
        <ChoiceBoxes choices={choices} onChange={onChange} />
      </details>
    </fieldset>
  );
}

const mapSetupLabel = ({ aiGrid, aiWalls }: BuildChoices): TextId =>
  aiGrid && aiWalls ? "build.setup.chip.both" : aiGrid ? "build.setup.chip.grids" : aiWalls ? "build.setup.chip.walls" : "build.setup.you";

/** Whether the build's AI can still add to it, from the pass's expiry alone, in the current language. */
function passState(build: BuildSummary, now: number): { live: boolean; chip: string; text: string } {
  if (!build.passExpiresAt) return { live: false, chip: t("build.passState.none"), text: t("build.passState.noneText") };
  const when = moment(build.passExpiresAt);
  return Date.parse(build.passExpiresAt) > now
    ? { live: true, chip: t("build.passState.works"), text: t("build.passState.worksText", { when }) }
    : { live: false, chip: t("build.passState.ended"), text: t("build.passState.endedText", { when }) };
}

/** Starting a build: its name and how much map setup the AI does, then its pass (FR-GM-26). */
function NewBuildDialog({ open, onClose, onAfterClose, onStarted }: { open: boolean; onClose: () => void; onAfterClose: () => void; onStarted: (build: BuildSummary, pass: string) => void }) {
  const [name, setName] = useState("");
  const [choices, setChoices] = useState<BuildChoices>(NO_BUILD_CHOICES);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);

  const reset = () => { setName(""); setChoices(NO_BUILD_CHOICES); setError(null); };
  const cancel = () => { if (starting) return; reset(); onClose(); };

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    setError(null);
    try {
      const { build, pass, expiresAt } = await api.builds.start(name.trim(), choices);
      reset();
      // The summary is read before its first pass is made, so the pass's expiry comes alongside it.
      onStarted({ ...build, passExpiresAt: expiresAt }, pass);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("build.new.startFailed"));
    } finally {
      setStarting(false);
    }
  }

  return (
    <Modal open={open} title={t("library.newBuild")} onClose={cancel} onAfterClose={onAfterClose} closeLabel={t("common.cancel")} initialFocus={nameField}>
      <form className="build-form build-new" onSubmit={(e) => void start(e)}>
        <p className="muted small-print">{t("build.new.lead")}</p>
        <label>{t("build.new.name")}<input ref={nameField} value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} /></label>
        <MapSetupFields choices={choices} onChange={setChoices} />
        <p className="muted small-print">{t("build.new.changeLater")}</p>
        {error && <p role="alert" className="error">{error}</p>}
        <p className="muted small-print">{t(RIGHTS_NOTICE)}</p>
        <div className="row build-form-actions">
          <button type="button" disabled={starting} onClick={cancel}>{t("common.cancel")}</button>
          <button type="submit" className="primary" disabled={starting || name.trim() === ""}>{starting ? t("build.new.starting") : t("build.new.start")}</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * What there is to fix, as the build page lists it, once the AI has saved something. Before that
 * the only finding is a missing game profile, which is the AI's to save, not the owner's to fix.
 */
const toFix = (progress: BuildProgress | undefined) => (progress && progress.draft.length + progress.published > 0 ? progress.problems : 0);

/**
 * The one thing to do next on a build, from what its draft holds: fix what its page lists, then
 * publish, then give the AI a pass again. A section of the build page is named after its `#`.
 * `open` marks the plain Open step, whose accessible name is "Open <build>".
 */
function nextStep(build: BuildSummary, passLive: boolean, progress: BuildProgress | undefined): { label: string; href: string; open?: true } | "new pass" {
  const fix = toFix(progress);
  if (fix > 0) return { label: t("build.next.fix", { n: fix }), href: `/builds/${build.id}#build-issues` };
  if (progress && progress.draft.length > 0) return { label: t("build.next.publish", { n: progress.draft.length }), href: `/builds/${build.id}#build-publish` };
  if (!passLive) return "new pass";
  return { label: t("common.open"), href: `/builds/${build.id}`, open: true };
}

/** How much a build needs its owner, so the ones that do come first. */
function urgency(build: BuildSummary, now: number, progress: BuildProgress | undefined): number {
  if (toFix(progress) > 0) return 3;
  if (progress && progress.draft.length > 0) return 2;
  return passState(build, now).live ? 0 : 1;
}

/** What the draft holds, as its page counts it. */
function DraftCounts({ progress }: { progress: BuildProgress }) {
  const parts = [
    progress.draft.length > 0 ? t("build.counts.unpublished", { items: counted(progress.draft) }) : null,
    progress.published > 0 ? t("build.counts.published", { n: progress.published }) : null,
    progress.notes > 0 ? t("build.counts.notes", { n: progress.notes }) : null,
  ].filter((p): p is string => p !== null);
  return <p className="build-stats">{parts.length > 0 ? parts.map((p) => <span key={p}>{p}</span>) : <span>{t("build.counts.nothing")}</span>}</p>;
}

/** An open build: what state it's in, and the one thing to do next. */
function BuildCard({ build, now, progress, making, error, onNewPass }: {
  build: BuildSummary;
  now: number;
  /** Absent while the draft is read, or if it couldn't be. */
  progress: BuildProgress | undefined;
  making: boolean;
  error: string | null;
  onNewPass: () => void;
}) {
  const pass = passState(build, now);
  const closingSoon = Date.parse(build.closesAt) - now < CLOSING_SOON_MS;
  const next = nextStep(build, pass.live, progress);
  const newPassButton = (className: string) => (
    <button type="button" className={className} aria-label={t("build.card.newPassFor", { name: build.name })} disabled={making} onClick={onNewPass}>
      {making ? t("build.card.makingPass") : t("build.card.newPass")}
    </button>
  );
  return (
    <li className="build-card" data-build-id={build.id}>
      <div className="build-card-head">
        <div className="build-card-title">
          <h3><a href={`/builds/${build.id}`} onClick={openBuildPage(build.id)}>{build.name}</a></h3>
          <div className="build-badges">
            <span className={pass.live ? "chip" : "chip build-chip-warn"}>{pass.chip}</span>
            {toFix(progress) > 0 && <span className="chip build-chip-warn">{t("build.card.toFix", { n: toFix(progress) })}</span>}
            {closingSoon && <span className="chip build-chip-warn">{t("build.card.closes", { day: day(build.closesAt) })}</span>}
            <span className="chip">{t(mapSetupLabel(build.choices))}</span>
          </div>
        </div>
      </div>
      {progress && <DraftCounts progress={progress} />}
      <p className="build-card-facts muted small-print">
        <span>{pass.text}</span>
        <span>{t("build.card.facts", { when: moment(build.updatedAt), day: day(build.closesAt) })}</span>
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="row build-card-actions">
        {next === "new pass" ? newPassButton("secondary") : (
          <button type="button" className="secondary" aria-label={next.open ? t("build.next.openNamed", { name: build.name }) : t("build.next.inBuild", { step: next.label, name: build.name })} onClick={() => navigate(next.href)}>
            {next.label}
          </button>
        )}
        {next !== "new pass" && !pass.live && newPassButton("link small-print")}
      </div>
    </li>
  );
}

/**
 * The library's AI builds tab (FR-GM-26): the builds in progress and what each needs, closed ones
 * out of the way, and New build. The toolbar's New build button sets `creating`; `onFullChange`
 * says when the open-build limit is reached, so that button can say why it's off.
 */
export function BuildsTab({ query, onError, creating = false, onCreatingChange = () => {}, onFullChange }: {
  query: string;
  onError: (error: string | null) => void;
  creating?: boolean;
  onCreatingChange?: (creating: boolean) => void;
  onFullChange?: (full: boolean) => void;
}) {
  // The tab and its cards and dialogs re-render in a newly chosen language.
  useLocale();
  const [builds, setBuilds] = useState<BuildSummary[] | null>(null);
  /** Each open build's draft, read once the list is in; null until every read has finished. */
  const [progress, setProgress] = useState<Record<string, BuildProgress> | null>(null);
  const [shownPass, setShownPass] = useState<{ id: string; pass: string } | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const [passError, setPassError] = useState<{ id: string; message: string } | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  const startedPass = useRef<{ id: string; pass: string } | null>(null);
  /** The build whose pass dialog just closed, for where focus goes next. */
  const passFor = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    api.builds.list().then(
      async (list) => {
        if (!live) return;
        setBuilds(list);
        // At most three, read together, so the cards appear once, already in order. A draft that
        // can't be read leaves its card without counts rather than holding up the others.
        const open = list.filter((b) => b.status === "open");
        const read = await Promise.allSettled(open.map((b) => api.builds.get(b.id)));
        if (!live) return;
        setProgress(Object.fromEntries(read.flatMap((r, i) => (r.status === "fulfilled" ? [[open[i]!.id, buildProgress(r.value)]] : []))));
      },
      (err: unknown) => { if (live) onError(err instanceof Error ? err.message : t("build.tab.loadFailed")); },
    );
    return () => { live = false; };
  }, [onError]);

  const limit = BUILD_LIMITS.openBuildsPerAccount;
  const open = (builds ?? []).filter((b) => b.status === "open");
  const full = open.length >= limit;
  useEffect(() => { onFullChange?.(full); }, [full, onFullChange]);

  const q = query.trim().toLowerCase();
  const matches = (b: BuildSummary) => !q || b.name.toLowerCase().includes(q);
  const now = Date.now();
  // The ones that need their owner first; otherwise newest first, as the list comes.
  const openShown = open.filter(matches).sort((a, b) => urgency(b, now, progress?.[b.id]) - urgency(a, now, progress?.[a.id]));
  const closedShown = (builds ?? []).filter((b) => b.status === "closed" && matches(b));
  // A search that finds a closed build shows it, rather than leaving it folded away.
  useEffect(() => { if (q && closedShown.length > 0) setClosedOpen(true); }, [q, closedShown.length]);

  async function newPass(build: BuildSummary) {
    setMaking(build.id);
    setPassError(null);
    try {
      const { pass, expiresAt } = await api.builds.newPass(build.id);
      setBuilds((all) => (all ?? []).map((b) => (b.id === build.id ? { ...b, passExpiresAt: expiresAt } : b)));
      setShownPass({ id: build.id, pass });
    } catch (err) {
      setPassError({ id: build.id, message: err instanceof Error ? err.message : t("build.tab.newPassFailed") });
    } finally {
      setMaking(null);
    }
  }

  return (
    <div role="tabpanel" className="build-section">
      {full && <p id={BUILD_LIMIT_REASON_ID} className="muted small-print">{t("build.tab.full", { limit })}</p>}
      <p className="muted">{t("build.tab.lead")}</p>

      <details className="build-disclosure build-help" open={(builds !== null && builds.length === 0) || undefined}>
        <summary>{t("build.tab.how")}</summary>
        <ol className="share-ai-steps">
          <li><span className="share-ai-step">{t("build.tab.step1")}</span><span className="muted small-print">{t("build.tab.step1Detail")}</span></li>
          <li><span className="share-ai-step">{t("build.tab.step2")}</span><span className="muted small-print">{t("build.tab.step2Detail")}</span></li>
          <li><span className="share-ai-step">{t("build.tab.step3")}</span><span className="muted small-print">{t("build.tab.step3Detail")}</span></li>
        </ol>
        <p className="muted small-print">{t("build.tab.limits", { limit, days: BUILD_LIMITS.abandonedAfterDays })}</p>
      </details>

      {!builds && <p className="muted" aria-busy="true">{t("common.loading")}</p>}
      {builds && builds.length === 0 && <EmptyState picture="empty-library">{t("build.tab.empty")}</EmptyState>}
      {builds && builds.length > 0 && q && openShown.length === 0 && closedShown.length === 0 && <p className="muted">{t("build.tab.noMatch")}</p>}

      {builds && builds.length > 0 && (!q || openShown.length > 0) && (
        <>
          <div className="builds-head">
            <h2 id="builds-in-progress">{t("build.tab.inProgress")}</h2>
            <span className="muted small-print">{t("build.tab.openCount", { open: open.length, limit })}</span>
          </div>
          {open.length === 0 && <p className="muted">{t("build.tab.nothingInProgress")}</p>}
          {open.length > 0 && progress === null && <p className="muted" aria-busy="true">{t("build.tab.reading")}</p>}
          <ul className="plain build-list" aria-labelledby="builds-in-progress">
            {progress !== null && openShown.map((b) => (
              <BuildCard
                key={b.id}
                build={b}
                now={now}
                progress={progress[b.id]}
                making={making === b.id}
                error={passError?.id === b.id ? passError.message : null}
                onNewPass={() => void newPass(b)}
              />
            ))}
          </ul>
        </>
      )}

      {closedShown.length > 0 && (
        <details className="build-disclosure build-closed" open={closedOpen} onToggle={(e) => setClosedOpen(e.currentTarget.open)}>
          <summary>{t("build.tab.closed", { n: closedShown.length })}</summary>
          <ul className="plain build-published">
            {closedShown.map((b) => (
              <li key={b.id}>
                <a href={`/builds/${b.id}`} onClick={openBuildPage(b.id)}>{b.name}</a>
                <span className="muted small-print">{t("build.tab.closedNote")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <NewBuildDialog
        open={creating}
        onClose={() => onCreatingChange(false)}
        onStarted={(build, pass) => {
          setBuilds((all) => [build, ...(all ?? [])]);
          setProgress((all) => (all ? { ...all, [build.id]: EMPTY_PROGRESS } : all));
          startedPass.current = { id: build.id, pass };
          onCreatingChange(false);
        }}
        // The pass opens once New build has closed and handed focus back to its button, so
        // closing the pass returns there too.
        onAfterClose={() => {
          if (!startedPass.current) return;
          setShownPass(startedPass.current);
          startedPass.current = null;
        }}
      />

      <PassPanel
        pass={shownPass?.pass ?? null}
        onClose={() => { passFor.current = shownPass?.id ?? null; setShownPass(null); }}
        // "Make a new pass" beside a card's main step goes once the pass works. Focus that was on
        // it lands on the card's main step instead of the top of the page.
        onAfterClose={() => {
          const id = passFor.current;
          passFor.current = null;
          if (!id || (document.activeElement && document.activeElement !== document.body)) return;
          const card = [...document.querySelectorAll<HTMLElement>(".build-card[data-build-id]")].find((el) => el.dataset.buildId === id);
          card?.querySelector<HTMLButtonElement>(".build-card-actions button")?.focus();
        }}
      >
        {shownPass && (
          <>
            <ol className="share-ai-steps build-pass-next" aria-label={t("build.tab.nextSteps")}>
              <li><span className="share-ai-step">{t("build.tab.next1")}</span><span className="muted small-print">{t("build.tab.next1Detail")}</span></li>
              <li><span className="share-ai-step">{t("build.tab.step2")}</span><span className="muted small-print">{t("build.tab.next2Detail")}</span></li>
              <li><span className="share-ai-step">{t("build.tab.next3")}</span><span className="muted small-print">{t("build.tab.next3Detail")}</span></li>
            </ol>
            <a href={`/builds/${shownPass.id}`} onClick={openBuildPage(shownPass.id)}>{t("build.tab.openPage")}</a>
          </>
        )}
      </PassPanel>
    </div>
  );
}
