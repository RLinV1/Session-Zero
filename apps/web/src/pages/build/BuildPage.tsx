import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  EMPTY_MAP_SETUP,
  describeDraftLine,
  draftLineRef,
  draftMapBoard,
  formatDateTime,
  listOpenings,
  squareSizeOf,
  type BuildCheckIssue,
  type BuildDetail,
  type BuildFileView,
  type BuildItemView,
  type BuildPublished,
  type DraftMapSetup,
  type DraftMapState,
  type DraftMark,
  type DraftProposedGrid,
  type LibraryMapBoard,
  type OpeningView,
  type PortalState,
  type PublishedBuildItem,
} from "@vtt/shared";
import { AccountMenu } from "../../account/AccountPages";
import { RequireAccount } from "../../account/RequireAccount";
import { useAccount } from "../../account/accountStore";
import { formatMessage, formattingLocale, t, useLocale, type TextId } from "../../i18n/locale";
import { ApiError, api } from "../../net/api";
import { navigate } from "../../router";
import { Modal } from "../../ui/Modal";
import { HubNav, SiteHeader } from "../../ui/SiteHeader";
import { createRoomWith, emptyRoomDetails } from "../RoomDetailsFields";
import { DraftCreatureEditor, DraftEncounterEditor } from "./DraftEditors";
import { BuildChoiceFields } from "./LibraryBuilds";
import { KIND_WORD, counted, creatureOf, encounterOf, flaggedFirst, mapOf, ownerIssues } from "./buildProgress";
import { PassPanel } from "./PassPanel";
import { RIGHTS_NOTICE, copyText, uploadKindFor } from "./buildCopy";

const POLL_MS = 5000;
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const when = (iso: string) => formatDateTime(formattingLocale(), new Date(iso), { month: "long", day: "numeric" });
/** A date and time as `toLocaleString()` writes it, in the current language. */
const moment = (iso: string) => formatDateTime(formattingLocale(), new Date(iso), { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
const itemId = (item: Pick<BuildItemView, "kind" | "key">) => `${item.kind}/${item.key}`;
/** The square size the person saw, sent with what they reviewed. Item ids always hold a slash, so this can't clash. */
const PROFILE_REVIEWED = "profile";
/** Where an item's card is on the page, so the issue list and the changed list can link to it. Keys are safe in ids. */
const cardId = (item: Pick<BuildItemView, "kind" | "key">) => `build-${item.kind}-${item.key}`;
/** An item's own name, as the person knows it. */
const nameOf = (item: BuildItemView) => String((item.data as { name?: unknown }).name ?? item.key);

/** One group of issues, each naming its item and linking to it, in the reader's language (ADR 0055). */
function IssueList({ heading, className, issues }: { heading: TextId; className: string; issues: readonly BuildCheckIssue[] }) {
  return (
    <>
      <h3 className="build-issues-title">{t("build.issues.heading", { title: t(heading), n: issues.length })}</h3>
      <ul className="plain build-issues">
        {issues.map((issue, i) => {
          const label = issue.labelText ? formatMessage(issue.labelText, issue.label) : issue.label;
          return (
            <li key={i} className={className}>
              {issue.target
                ? <a className="build-issue-item" href={`#${cardId(issue.target)}`}>{label}</a>
                : <span className="build-issue-item">{label}</span>}{" "}
              {issue.text ? formatMessage(issue.text, issue.message) : issue.message}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Whether the AI left openings or places on a map for the person to finish. */
const leftForYou = (item: BuildItemView) => {
  const setup = mapOf(item).setup;
  return (setup?.marks.length ?? 0) > 0 || (setup?.openings ?? []).some((o) => o.kind === "leave");
};

/** The owner's review of an AI build: fix it, confirm grids, and choose what to publish (FR-GM-27). */
export function BuildPage({ buildId }: { buildId: string }) {
  return (
    <RequireAccount>
      <Build id={buildId} />
    </RequireAccount>
  );
}

function Build({ id }: { id: string }) {
  const [detail, setDetail] = useState<BuildDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState<PublishedBuildItem[]>([]);
  const [justPublished, setJustPublished] = useState<BuildPublished | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [confirmingNewPass, setConfirmingNewPass] = useState(false);
  /** Whether the pass now shown replaced one the AI may still be using. */
  const [passReplaced, setPassReplaced] = useState(false);
  const [removing, setRemoving] = useState<PublishedBuildItem[] | null>(null);
  const [removingDraft, setRemovingDraft] = useState<BuildItemView | null>(null);
  /** The action in flight, by the words its button shows while it runs, so nothing is sent twice. */
  const [pending, setPending] = useState<TextId | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  /** The version of each item as this person last saw it. What the AI changes after that needs another look. */
  const [reviewed, setReviewed] = useState<Record<string, string>>({});
  const markReviewed = useCallback((item: BuildItemView) => setReviewed((all) => ({ ...all, [itemId(item)]: item.updatedAt })), []);

  const refresh = useCallback(async () => {
    try {
      const latest = await api.builds.get(id);
      setDetail(latest);
      setReviewed((all) => {
        const next = { ...all };
        for (const item of latest.items) next[itemId(item)] ??= item.updatedAt;
        // A grid detection and the AI agreed on takes the profile's square size, so a change needs a look too.
        next[PROFILE_REVIEWED] ??= squareSizeOf(latest.profile);
        return next;
      });
      setPublished((await api.builds.published(id)).published);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(message(err, t("build.page.loadFailed")));
    }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const open = detail?.build.status === "open";
  // The AI works while this page is open, so what it adds appears without a reload.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);

  const run = useCallback(async (action: () => Promise<unknown>, failure: TextId, doing: TextId = "build.page.saving") => {
    setError(null);
    setPending(doing);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(message(err, t(failure)));
    } finally {
      setPending(null);
    }
  }, [refresh]);

  // The page is long, so an error raised by a button far down must come into view, and be focused,
  // rather than appear at the top where nobody is looking.
  useEffect(() => {
    if (!error || !errorRef.current) return;
    errorRef.current.scrollIntoView?.({ block: "center" });
    errorRef.current.focus();
  }, [error]);

  // A link to a part of this page, such as "Fix 2 things" on the AI builds tab, lands there once the
  // draft has loaded, as it would on a page that loads all at once. Focus moves to its heading, so
  // the keyboard carries on from there too.
  const landed = useRef(false);
  useEffect(() => {
    if (!detail || landed.current) return;
    landed.current = true;
    const target = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
    if (!target) return;
    const heading = target.matches("h2") ? target : target.querySelector<HTMLElement>("h2") ?? target;
    heading.tabIndex = -1;
    target.scrollIntoView?.({ block: "start" });
    heading.focus({ preventScroll: true });
  }, [detail]);

  const items = useMemo(() => detail?.items ?? [], [detail]);
  const files = useMemo(() => detail?.files ?? [], [detail]);
  const creatures = useMemo(() => items.filter((i) => i.kind === "creature").sort(flaggedFirst), [items]);
  const maps = useMemo(() => items.filter((i) => i.kind === "map").sort(flaggedFirst), [items]);
  const encounters = useMemo(() => items.filter((i) => i.kind === "encounter").sort(flaggedFirst), [items]);
  const issues = useMemo(() => (detail ? ownerIssues(detail) : []), [detail]);
  // The page and everything on it re-render in a newly chosen language.
  useLocale();

  if (missing) {
    return <main className="page-shell home gm-page"><h1>{t("build.page.notFound")}</h1><p className="muted">{t("build.page.notFoundDetail")}</p><a href="/library">{t("build.page.backToLibrary")}</a></main>;
  }

  const toggle = (item: BuildItemView, on: boolean) => setSelected((all) => {
    const next = new Set(all);
    if (on) next.add(itemId(item)); else next.delete(itemId(item));
    return next;
  });
  const draftItems = items.filter((i) => !i.published);
  const chosen = draftItems.filter((i) => selected.has(itemId(i)));
  // A map the AI left openings or places on needs a look too, chosen or brought along by an encounter.
  const mapsLeftForYou = new Set(maps.filter((m) => !m.published && leftForYou(m)).map((m) => m.key));
  const flaggedChosen = chosen.filter((i) => i.flags.length > 0
    || (i.kind === "map" && mapsLeftForYou.has(i.key))
    || (i.kind === "encounter" && mapsLeftForYou.has(encounterOf(i).mapKey))).length;
  const changed = draftItems.filter((i) => reviewed[itemId(i)] !== undefined && reviewed[itemId(i)] !== i.updatedAt);
  const squareSize = squareSizeOf(detail?.profile ?? null);
  const profileChanged = reviewed[PROFILE_REVIEWED] !== undefined && reviewed[PROFILE_REVIEWED] !== squareSize;
  const chosenChanged = profileChanged || chosen.some((i) => changed.includes(i));

  async function doPublish() {
    setConfirmingPublish(false);
    const keys = (kind: BuildItemView["kind"]) => chosen.filter((i) => i.kind === kind).map((i) => i.key);
    await run(async () => {
      const { published: done } = await api.builds.publish(id, { creatures: keys("creature"), maps: keys("map"), encounters: keys("encounter"), reviewed });
      setJustPublished(done);
      setSelected(new Set());
    }, "build.page.publishFailed", "build.page.publishing");
  }

  const checkbox = (item: BuildItemView) => (open && !item.published
    ? <label className="build-check"><input type="checkbox" checked={selected.has(itemId(item))} onChange={(e) => toggle(item, e.target.checked)} />{t("build.page.publishTick")}</label>
    : null);
  // Asks first: a removed draft is gone unless the AI saves it again.
  const remove = (item: BuildItemView) => setRemovingDraft(item);
  const busy = pending !== null;
  const problems = issues.filter((i) => i.type === "problem");
  const notes = issues.filter((i) => i.type === "flag");
  const publishLabel = pending === "build.page.publishing" ? t("build.page.publishing") : t("build.page.publishSelected", { n: chosen.length });
  const passLive = detail?.build.passExpiresAt ? Date.parse(detail.build.passExpiresAt) > Date.now() : false;
  const makePass = () => {
    setConfirmingNewPass(false);
    void run(async () => { setPassReplaced(passLive); setPass((await api.builds.newPass(id)).pass); }, "build.page.newPassFailed", "build.page.makingPass");
  };

  return (
    <>
      <div className="page-shell page-bar">
        <SiteHeader nav={<HubNav current="library" />} account={<AccountMenu />} />
      </div>
      <main className="page-shell home gm-page build-page">
        <p className="small-print"><a href="/library?tab=builds" onClick={(e) => { e.preventDefault(); navigate("/library?tab=builds"); }}>{t("library.tab.build")}</a></p>
        <h1>{detail?.build.name ?? t("title.build")}</h1>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="error build-error">{error}</p>}
        {!detail && !error && <p className="muted" aria-busy="true">{t("common.loading")}</p>}

        {detail && open && (
          <p className="build-summary">
            {draftItems.length === 0
              ? t("build.summary.empty")
              : t("build.summary.saved", { items: counted(draftItems) })
                + (problems.length === 0 ? t("build.summary.nothingToFix") : t("build.summary.toFix", { n: problems.length }))
                + (notes.length > 0 ? t("build.summary.notes", { n: notes.length }) : "")
                + t("build.summary.check")}
            {draftItems.length > 0 && <a href="#build-publish">{t("build.summary.publishLink")}</a>}
            {draftItems.length > 0 && t("build.summary.end")}
          </p>
        )}

        {detail && (
          <>
            {open ? (
              <section className="build-section" aria-labelledby="build-access">
                <h2 id="build-access">{t("build.access.title")}</h2>
                <p className="muted">
                  {passLive && detail.build.passExpiresAt
                    ? t("build.access.passUntil", { when: moment(detail.build.passExpiresAt) })
                    : t("build.access.noPass")}
                  {t("build.access.closesOn", { day: when(detail.build.closesAt) })}
                </p>
                <div className="row">
                  <button type="button" disabled={busy} onClick={() => (passLive ? setConfirmingNewPass(true) : makePass())}>{pending === "build.page.makingPass" ? t("build.page.makingPass") : t("build.access.newPass")}</button>
                  {detail.build.passExpiresAt && <button type="button" disabled={busy} onClick={() => void run(() => api.builds.cancelPass(id), "build.page.cancelPassFailed", "build.page.cancelling")}>{pending === "build.page.cancelling" ? t("build.page.cancelling") : t("build.access.cancelPass")}</button>}
                </div>
                <BuildChoiceFields choices={detail.build.choices} disabled={busy} onChange={(choices) => void run(() => api.builds.setChoices(id, choices), "build.page.choicesFailed")} />
                <p className="muted small-print">{t("build.access.wallsOffNote")}</p>
              </section>
            ) : (
              <p className="notice"><span>{t("build.closedNotice")}</span></p>
            )}
            <PassPanel pass={pass} replaced={passReplaced} onClose={() => setPass(null)} />

            {open && (changed.length > 0 || profileChanged) && (
              <section className="build-section" aria-labelledby="build-changed">
                <h2 id="build-changed">{t("build.changed.title")}</h2>
                <p className="muted small-print">{t("build.changed.note")}</p>
                <ul className="plain build-published">
                  {profileChanged && (
                    <li>
                      <span>{t("build.changed.profile", { size: squareSize })}</span>
                      <button type="button" onClick={() => setReviewed((all) => ({ ...all, [PROFILE_REVIEWED]: squareSize }))}>{t("build.changed.checked")}</button>
                    </li>
                  )}
                  {changed.map((item) => (
                    <li key={itemId(item)}>
                      <span><a href={`#${cardId(item)}`}>{nameOf(item)}</a> <span className="muted">{t(KIND_WORD[item.kind])}</span></span>
                      <button type="button" onClick={() => markReviewed(item)}>{t("build.changed.checked")}</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && issues.length > 0 && (
              <section className="build-section" aria-labelledby="build-issues">
                <h2 id="build-issues">{t("build.issues.title")}</h2>
                {/* Grouped under words, not only told apart by colour. */}
                {problems.length > 0 && <IssueList heading="build.issues.toFix" className="build-problem" issues={problems} />}
                {notes.length > 0 && <IssueList heading="build.issues.notes" className="build-flag" issues={notes} />}
              </section>
            )}

            {open && <FilesSection id={id} files={files} onDone={refresh} onError={setError} />}

            {detail.profile && open && (
              <section className="build-section" aria-labelledby="build-profile">
                <h2 id="build-profile">{t("build.game.title")}</h2>
                <p><strong>{detail.profile.name}</strong> <span className="muted">{t("build.game.square", { size: squareSizeOf(detail.profile) })}</span></p>
                {detail.profile.notes && <p className="build-text">{detail.profile.notes}</p>}
              </section>
            )}

            {open && maps.length > 0 && (
              <section className="build-section" aria-labelledby="build-maps">
                <h2 id="build-maps">{t("build.section.maps")}</h2>
                <ul className="plain build-list build-list-maps">
                  {maps.map((item) => (
                    <li key={item.key} id={cardId(item)}>
                      <MapCard item={item} file={files.find((f) => f.id === mapOf(item).fileId)} checkbox={checkbox(item)} busy={busy}
                        onConfirm={(grid) => run(async () => markReviewed((await api.builds.confirmGrid(id, item.key, grid)).item), "build.page.confirmGridFailed")}
                        onSaveSetup={(setup) => run(async () => markReviewed((await api.builds.saveMapSetup(id, item.key, setup, item.updatedAt)).item), "build.page.wallsFailed")}
                        onRemove={() => remove(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && creatures.length > 0 && (
              <section className="build-section" aria-labelledby="build-creatures">
                <h2 id="build-creatures">{t("build.section.creatures")}</h2>
                <ul className="plain build-list">
                  {creatures.map((item) => (
                    <li key={item.key} id={cardId(item)}>
                      <CreatureCard item={item} files={files} checkbox={checkbox(item)} busy={busy}
                        onSave={async (patch) => { markReviewed((await api.builds.editCreature(id, item.key, patch)).item); await refresh(); }}
                        onRemove={() => remove(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && encounters.length > 0 && (
              <section className="build-section" aria-labelledby="build-encounters">
                <h2 id="build-encounters">{t("build.section.encounters")}</h2>
                <ul className="plain build-list">
                  {encounters.map((item) => (
                    <li key={item.key} id={cardId(item)}>
                      <EncounterCard item={item} creatures={creatures} maps={maps} checkbox={checkbox(item)} busy={busy}
                        onSave={async (patch) => { markReviewed((await api.builds.editEncounter(id, item.key, patch)).item); await refresh(); }}
                        onRemove={() => remove(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && draftItems.length > 0 && (
              <section className="build-section" aria-labelledby="build-publish-title" id="build-publish">
                <h2 id="build-publish-title">{t("build.publish.title")}</h2>
                <p className="muted">{t("build.publish.lead")}{t("build.sentenceGap")}{t(RIGHTS_NOTICE)}</p>
                <div className="row">
                  <button type="button" disabled={busy} onClick={() => setSelected(new Set(draftItems.map(itemId)))}>{t("build.publish.selectAll")}</button>
                  <button type="button" className="primary" disabled={chosen.length === 0 || chosenChanged || busy}
                    onClick={() => { if (flaggedChosen > 0) setConfirmingPublish(true); else void doPublish(); }}>
                    {publishLabel}
                  </button>
                </div>
                {chosenChanged && chosen.length > 0 && <p className="muted small-print">{t("build.publish.checkChanged")}</p>}
                {chosen.length === 0 && <p className="muted small-print">{t("build.publish.tick")}</p>}
              </section>
            )}

            {/* Keeps the choice in view while ticking items far up the page. */}
            {open && chosen.length > 0 && (
              <div className="build-publish-bar" role="region" aria-label={t("build.publish.bar")}>
                <span>{t("build.publish.selected", { n: chosen.length })}</span>
                <a href="#build-publish">{t("build.publish.review")}</a>
              </div>
            )}

            {justPublished && justPublished.encounters.length > 0 && <StartRoom published={justPublished} onError={setError} />}

            {published.length > 0 && (
              <section className="build-section" aria-labelledby="build-published">
                <h2 id="build-published">{t("build.published.title")}</h2>
                <p className="muted small-print">{t("build.published.note")}</p>
                <ul className="plain build-published">
                  {published.map((p) => (
                    <li key={p.id}>
                      <span>{p.name} <span className="muted">{t(p.type === "asset" ? "build.published.asset" : KIND_WORD[p.type])}</span></span>
                      <button type="button" onClick={() => setRemoving([p])}>{t("common.remove")}</button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setRemoving(published)}>{t("build.published.removeAll")}</button>
              </section>
            )}

            {open && (
              <section className="build-section">
                <button type="button" className="danger" disabled={busy} onClick={() => setConfirmingDiscard(true)}>{t("build.discard.button")}</button>
              </section>
            )}
          </>
        )}

        <Modal open={confirmingPublish} title={t("build.flagged.title")} onClose={() => setConfirmingPublish(false)}>
          <div className="confirm">
            <p>{t("build.flagged.body", { n: flaggedChosen })}</p>
            <div className="row">
              <button type="button" onClick={() => setConfirmingPublish(false)}>{t("build.flagged.keep")}</button>
              <button type="button" className="primary" onClick={() => void doPublish()}>{t("build.flagged.publish")}</button>
            </div>
          </div>
        </Modal>

        <Modal open={confirmingNewPass} title={t("build.newPass.title")} onClose={() => setConfirmingNewPass(false)}>
          <div className="confirm">
            <p>{t("build.newPass.body")}</p>
            <div className="row">
              <button type="button" onClick={() => setConfirmingNewPass(false)}>{t("build.newPass.keep")}</button>
              <button type="button" className="primary" onClick={makePass}>{t("build.card.newPass")}</button>
            </div>
          </div>
        </Modal>

        <Modal open={removingDraft !== null} title={removingDraft ? t("build.removeDraft.titleNamed", { name: nameOf(removingDraft) }) : t("build.removeDraft.title")} onClose={() => setRemovingDraft(null)}>
          {removingDraft && (
            <div className="confirm">
              <p>{removingDraft.kind === "map" ? t("build.removeDraft.mapNote") : ""}{t("build.removeDraft.body")}</p>
              <div className="row">
                <button type="button" onClick={() => setRemovingDraft(null)}>{t("build.keepIt")}</button>
                <button type="button" className="danger" onClick={() => {
                  const item = removingDraft;
                  setRemovingDraft(null);
                  void run(() => api.builds.removeItem(id, item.kind, item.key), "build.page.removeFailed", "build.page.removing");
                }}>{t("common.remove")}</button>
              </div>
            </div>
          )}
        </Modal>

        <Modal open={confirmingDiscard} title={detail ? t("build.discard.titleNamed", { name: detail.build.name }) : t("build.discard.title")} onClose={() => setConfirmingDiscard(false)}>
          <div className="confirm">
            <p>{t("build.discard.body")}</p>
            <div className="row">
              <button type="button" onClick={() => setConfirmingDiscard(false)}>{t("build.keepIt")}</button>
              <button type="button" className="danger" onClick={() => { setConfirmingDiscard(false); void run(() => api.builds.discard(id), "build.page.discardFailed", "build.page.discarding"); }}>{t("build.discard.confirm")}</button>
            </div>
          </div>
        </Modal>

        <RemoveDialog items={removing} onClose={() => setRemoving(null)}
          onConfirm={(ids) => { setRemoving(null); void run(() => api.builds.removePublished(id, ids), "build.page.removePublishedFailed"); }} />
      </main>
    </>
  );
}

function FilesSection({ id, files, onDone, onError }: { id: string; files: readonly BuildFileView[]; onDone: () => Promise<void>; onError: (error: string | null) => void }) {
  const [uploading, setUploading] = useState(0);

  async function send(list: FileList | File[], droppedOn: "map" | "token") {
    onError(null);
    const all = [...list];
    setUploading(all.length);
    const failures: string[] = [];
    for (const file of all) {
      try {
        await api.builds.upload(id, file, uploadKindFor(file.name, droppedOn));
      } catch (err) {
        failures.push(t("build.files.failed", { name: file.name, error: message(err, t("build.files.uploadFailed")) }));
      }
      setUploading((n) => n - 1);
    }
    if (failures.length > 0) onError(failures.join("\n"));
    await onDone();
  }

  const zone = (kind: "map" | "token", label: TextId) => (
    <label
      className="build-drop"
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDrop={(e: DragEvent) => { e.preventDefault(); void send(e.dataTransfer.files, kind); }}
    >
      <span>{t(label)}</span>
      <span className="muted small-print">{t("build.files.drop")}</span>
      <input type="file" multiple className="sr-only" accept={kind === "map" ? "image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt" : "image/png,image/jpeg,image/webp"}
        onChange={(e) => { if (e.target.files) void send(e.target.files, kind); e.target.value = ""; }} />
    </label>
  );

  return (
    <section className="build-section" aria-labelledby="build-files">
      <h2 id="build-files">{t("build.files.title")}</h2>
      <p className="muted">{t("build.files.lead")}{t("build.sentenceGap")}{t(RIGHTS_NOTICE)}</p>
      <div className="build-drops">
        {zone("token", "build.files.tokenArt")}
        {zone("map", "build.files.maps")}
      </div>
      <p role="status" className="muted small-print">{uploading > 0 ? t("build.files.uploading", { n: uploading }) : ""}</p>
      {files.length > 0 && (
        <ul className="plain build-files">
          {files.map((f) => <li key={f.id}><img src={f.url} alt="" loading="lazy" /><span className="build-file-name">{f.name}</span><span className="muted small-print">{f.width}×{f.height}{f.published ? t("build.files.published") : ""}</span></li>)}
        </ul>
      )}
    </section>
  );
}

function Flags({ item }: { item: BuildItemView }) {
  return (
    <>
      {item.flags.length > 0 && <ul className="plain build-flags">{item.flags.map((f, i) => <li key={i}><strong>{f.field}</strong>{t("build.flagSep")}{f.message}</li>)}</ul>}
      {item.notCarriedOver && <NotCarried text={item.notCarriedOver} />}
    </>
  );
}

function NotCarried({ text }: { text: string }) {
  const [state, setState] = useState<TextId | null>(null);
  return (
    <div className="build-carried">
      <p className="muted small-print">{t("build.notCarried.title")}</p>
      <p className="build-text">{text}</p>
      <div className="row">
        <button type="button" onClick={() => void copyText(text).then((ok) => setState(ok ? "build.notCarried.copied" : "build.notCarried.copyFailed"))}>{t("build.notCarried.copy")}</button>
        <span role="status" className="muted small-print">{state ? t(state) : ""}</span>
      </div>
    </div>
  );
}

const badges = (item: BuildItemView, extra?: ReactNode) => (
  <span className="build-badges">
    {extra}
    {item.editedByUser && <span className="chip">{t("build.badge.edited")}</span>}
    {item.published && <span className="chip">{t("build.badge.published")}</span>}
  </span>
);

function CreatureCard({ item, files, checkbox, busy = false, onSave, onRemove }: { item: BuildItemView; files: readonly BuildFileView[]; checkbox: ReactNode; busy?: boolean; onSave: (patch: Record<string, unknown>) => Promise<void>; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const data = creatureOf(item);
  const art = files.find((f) => f.id === data.imageFileId);
  const stat = (label: TextId, value: number | null) => <span>{t(label)} <strong>{value ?? t("build.stat.blank")}</strong></span>;
  return (
    <article className="build-card">
      <div className="build-card-head">
        {art ? <img className="build-art" src={art.url} alt="" loading="lazy" /> : <span className="build-art" style={{ background: data.color }} aria-hidden />}
        <div className="build-card-title">
          <h3>{data.name}</h3>
          {badges(item, data.isPlayerCharacter ? <span className="chip">{t("build.badge.playerCharacter")}</span> : undefined)}
        </div>
        {checkbox}
      </div>
      <p className="build-stats">{stat("build.stat.hp", data.hp)} {stat("build.stat.maxHp", data.maxHp)} {stat("build.stat.ac", data.ac)} <span>{t("build.stat.size")} <strong>{data.size}</strong></span></p>
      {data.attacks.length > 0 && <p className="muted small-print">{data.attacks.map((a) => a.name).join(", ")}</p>}
      <Flags item={item} />
      {!item.published && (
        <div className="row">
          <button type="button" disabled={busy} onClick={() => setEditing(true)}>{t("common.edit")}</button>
          <button type="button" disabled={busy} onClick={onRemove}>{t("common.remove")}</button>
        </div>
      )}
      <Modal open={editing} title={t("build.editNamed", { name: data.name })} onClose={() => setEditing(false)}>
        {editing && <DraftCreatureEditor data={data} files={files} onCancel={() => setEditing(false)} onSave={async (patch) => { await onSave(patch); setEditing(false); }} />}
      </Modal>
    </article>
  );
}

/** What the picture draws on top of the grid: the walls as they would publish, and what the AI set. */
export interface MapDrawing {
  walls: LibraryMapBoard["walls"];
  openings: readonly OpeningView[];
  marks: readonly DraftMark[];
  /** The ends of lines the AI drew, to mark them as the AI's. */
  aiLines: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[];
}

const WALL_COLOUR = { wall: "#ff3b30", door: "#ffd60a", window: "#64d2ff", opening: "#ff9f0a" } as const;

/** A map with its grid, walls, doors and windows drawn over it, in the image's own pixels, so what's published is what's seen. */
export function GridOverlay({ file, grid, drawing }: { file: BuildFileView; grid: DraftProposedGrid | null; drawing?: MapDrawing }) {
  const patternId = `build-grid-${file.id}`;
  const label = Math.max(file.width, file.height) / 60;
  const segment = (w: { a: { x: number; y: number }; b: { x: number; y: number } }) => `M ${w.a.x} ${w.a.y} L ${w.b.x} ${w.b.y}`;
  const aiSet = drawing ? [...drawing.aiLines, ...drawing.openings.filter((o) => o.set && o.now.kind !== "left")] : [];
  return (
    <div className="build-map">
      <img src={file.url} alt="" loading="lazy" />
      {((grid && grid.cellSize > 0) || drawing) && (
        <svg viewBox={`0 0 ${file.width} ${file.height}`} preserveAspectRatio="none" aria-hidden>
          {grid && grid.cellSize > 0 && (
            <>
              <defs>
                <pattern id={patternId} width={grid.cellSize} height={grid.cellSize} patternUnits="userSpaceOnUse" x={grid.offsetX} y={grid.offsetY}>
                  <path d={`M ${grid.cellSize} 0 L 0 0 0 ${grid.cellSize}`} fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth={Math.max(1, file.width / 800)} vectorEffect="non-scaling-stroke" />
                </pattern>
              </defs>
              <rect width={file.width} height={file.height} fill={`url(#${patternId})`} />
            </>
          )}
          {drawing && (
            <g className="build-walls-drawn">
              {aiSet.length > 0 && <path d={aiSet.map(segment).join(" ")} stroke="#fff" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" fill="none" data-ai-set={aiSet.length} />}
              {drawing.walls.map((wall, i) => {
                const kind = wall.portal ? wall.portal.kind : wall.uvttPortal ? "opening" : "wall";
                return <path key={i} d={segment(wall)} stroke={WALL_COLOUR[kind]} strokeWidth={kind === "wall" ? 2 : 4} strokeDasharray={kind === "opening" ? "6 4" : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" fill="none" data-kind={kind} />;
              })}
              {drawing.openings.map((o) => (
                <text key={o.number} x={(o.a.x + o.b.x) / 2} y={(o.a.y + o.b.y) / 2} fontSize={label} strokeWidth={label / 6} textAnchor="middle" dominantBaseline="central" className="build-wall-label">{o.number}</text>
              ))}
              {grid && drawing.marks.map((m, i) => (
                <g key={i} className="build-wall-mark">
                  <circle cx={grid.offsetX + (m.square.column + 0.5) * grid.cellSize} cy={grid.offsetY + (m.square.row + 0.5) * grid.cellSize} r={grid.cellSize * 0.4} stroke="#ff2d95" strokeWidth={3} vectorEffect="non-scaling-stroke" fill="none" />
                  <text x={grid.offsetX + (m.square.column + 0.5) * grid.cellSize} y={grid.offsetY + (m.square.row + 0.5) * grid.cellSize} fontSize={label} strokeWidth={label / 6} textAnchor="middle" dominantBaseline="central" className="build-wall-label">!</text>
                </g>
              ))}
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<DraftMapState["gridStatus"], TextId> = {
  none: "build.grid.none",
  proposed: "build.grid.proposed",
  confirmed: "build.grid.confirmed",
};

const gridStatusText = (data: DraftMapState): TextId =>
  data.gridBy === "agreement" ? "build.grid.agreed"
    : data.gridDiffers ? "build.grid.differs"
      : STATUS_TEXT[data.gridStatus];

/** "Opening 3", with where it is once the map has a grid. */
const openingName = (o: Pick<OpeningView, "number" | "square">) =>
  (o.square ? t("build.walls.openingAt", { number: o.number, column: o.square.column, row: o.square.row }) : t("build.walls.opening", { number: o.number }));
/** A door's or window's state, in lower case as the selects show it. */
const PORTAL_STATE_WORD: Record<PortalState, TextId> = { closed: "common.closed", open: "common.openState", locked: "common.locked" };
const LINE_KIND_WORD: Record<"wall" | "door" | "window", TextId> = { wall: "common.wall", door: "common.door", window: "common.window" };
const lower = (id: TextId) => t(id).toLowerCase();

/**
 * A map's walls, doors and windows, as the AI and the file left them (ADR 0053). The owner can change
 * any opening and remove anything the AI drew. Drawing and moving walls stays in the map editor.
 */
function MapWalls({ data, openings, editable, editedByUser, onSave }: { data: DraftMapState; openings: readonly OpeningView[]; editable: boolean; editedByUser: boolean; onSave: (setup: DraftMapSetup) => Promise<void> }) {
  const setup = data.setup ?? EMPTY_MAP_SETUP;
  if (openings.length === 0 && setup.lines.length === 0 && setup.marks.length === 0) return null;

  const setOpening = (number: number, kind: string, state: PortalState) => {
    const others = setup.openings.filter((o) => o.number !== number);
    const opening = kind === "door" || kind === "window" ? [{ number, kind, state } as const] : [];
    void onSave({ ...setup, openings: [...others, ...opening].sort((a, b) => a.number - b.number) });
  };
  const setLine = (index: number, kind: "wall" | "door" | "window", state: PortalState) =>
    void onSave({ ...setup, lines: setup.lines.map((l, i) => (i === index ? (kind === "wall" ? { from: l.from, to: l.to, kind } : { from: l.from, to: l.to, kind, state }) : l)) });
  const removeLine = (index: number) => void onSave({ ...setup, lines: setup.lines.filter((_, i) => i !== index) });
  const removeMark = (index: number) => void onSave({ ...setup, marks: setup.marks.filter((_, i) => i !== index) });
  const aiSetSomething = setup.openings.length + setup.lines.length + setup.marks.length > 0;

  const stateSelect = (value: PortalState, onChange: (state: PortalState) => void, label: string) => (
    <select aria-label={label} value={value} disabled={!editable} onChange={(e) => onChange(e.target.value as PortalState)}>
      {(["closed", "open", "locked"] as const).map((state) => <option key={state} value={state}>{lower(PORTAL_STATE_WORD[state])}</option>)}
    </select>
  );
  const counts = { openings: openings.length, lines: setup.lines.length };

  return (
    <details className="build-walls" open={setup.marks.length > 0 || setup.openings.some((o) => o.kind === "leave")}>
      <summary>{editedByUser ? t("build.walls.summaryYou", counts) : t("build.walls.summary", counts)}</summary>
      <p className="muted small-print">{t("build.walls.legend")}</p>
      {editable && !editedByUser && <p className="muted small-print">{t("build.walls.locksAi")}</p>}
      {openings.length > 0 && (
        <ul className="plain build-wall-list">
          {openings.map((o) => {
            const kind = o.now.kind === "left" || o.now.kind === "opening" ? "opening" : o.now.kind;
            const state = o.now.kind === "left" ? "closed" : o.now.state;
            return (
              <li key={o.number}>
                <span>{openingName(o)}</span>
                <select aria-label={t("build.walls.opening", { number: o.number })} value={kind} disabled={!editable} onChange={(e) => setOpening(o.number, e.target.value, state === "open" || state === "locked" ? state : "closed")}>
                  <option value="opening">{o.now.kind === "left" ? t("build.walls.leftForYou") : t("build.walls.asFile")}</option>
                  <option value="door">{lower("common.door")}</option>
                  <option value="window">{lower("common.window")}</option>
                </select>
                {kind !== "opening" && stateSelect(state, (s) => setOpening(o.number, kind, s), t("build.walls.openingState", { number: o.number }))}
                {o.now.kind === "left" && <span className="build-flag-reason">{o.now.reason}</span>}
                {/* Once the owner has edited the map, who set what can't be told apart. */}
                {o.set && o.now.kind !== "left" && <span className="chip">{editedByUser ? t("build.walls.set") : t("build.walls.setByAi")}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {setup.lines.length > 0 && (
        <ul className="plain build-wall-list">
          {setup.lines.map((line, i) => (
            <li key={i}>
              <span>{formatMessage(draftLineRef(line, i), describeDraftLine(line, i))}</span>
              <select aria-label={t("build.walls.line", { number: i + 1 })} value={line.kind} disabled={!editable} onChange={(e) => setLine(i, e.target.value as "wall" | "door" | "window", line.state ?? "closed")}>
                {(["wall", "door", "window"] as const).map((kind) => <option key={kind} value={kind}>{lower(LINE_KIND_WORD[kind])}</option>)}
              </select>
              {line.kind !== "wall" && stateSelect(line.state ?? "closed", (s) => setLine(i, line.kind, s), t("build.walls.lineState", { number: i + 1 }))}
              {editable && <button type="button" onClick={() => removeLine(i)}>{t("common.remove")}</button>}
            </li>
          ))}
        </ul>
      )}
      {setup.marks.length > 0 && (
        <ul className="plain build-wall-list">
          {setup.marks.map((mark, i) => (
            <li key={i}>
              <span>{t("build.walls.markAt", { column: mark.square.column, row: mark.square.row })}</span>
              <span className="build-flag-reason">{mark.reason}</span>
              {editable && <button type="button" onClick={() => removeMark(i)}>{t("build.walls.clearMark")}</button>}
            </li>
          ))}
        </ul>
      )}
      {editable && aiSetSomething && <button type="button" onClick={() => void onSave(EMPTY_MAP_SETUP)}>{t("build.walls.removeAll")}</button>}
    </details>
  );
}

function MapCard({ item, file, checkbox, busy = false, onConfirm, onSaveSetup, onRemove }: { item: BuildItemView; file: BuildFileView | undefined; checkbox: ReactNode; busy?: boolean; onConfirm: (grid: DraftProposedGrid) => Promise<void>; onSaveSetup: (setup: DraftMapSetup) => Promise<void>; onRemove: () => void }) {
  const data = mapOf(item);
  // A UVTT file's grid is exact: offering to "confirm" it would only lock the map against the AI.
  const fromFile = data.gridBy === "file";
  const suggestion = file?.detection?.suggestion ?? null;
  // What publishing would use now: the confirmed grid, or the AI's latest proposal.
  const saved = data.grid ?? data.proposedGrid;
  const start = saved ?? suggestion;
  const startKey = start ? `${start.cellSize}/${start.offsetX}/${start.offsetY}` : "";
  const [cell, setCell] = useState(start ? String(start.cellSize) : "");
  const [x, setX] = useState(start ? String(start.offsetX) : "0");
  const [y, setY] = useState(start ? String(start.offsetY) : "0");
  // Until the person types numbers of their own, the fields, and so the picture, follow the AI's latest grid.
  const [typed, setTyped] = useState(false);
  const fill = (grid: DraftProposedGrid | null) => {
    setCell(grid ? String(grid.cellSize) : "");
    setX(grid ? String(grid.offsetX) : "0");
    setY(grid ? String(grid.offsetY) : "0");
  };
  useEffect(() => { if (!typed) fill(start); }, [startKey]); // `start` is rebuilt every render; its numbers are in `startKey`
  const preview: DraftProposedGrid | null = Number(cell) > 0 ? { cellSize: Number(cell), offsetX: Number(x) || 0, offsetY: Number(y) || 0 } : null;
  const unsaved = typed && preview !== null && (!saved || preview.cellSize !== saved.cellSize || preview.offsetX !== saved.offsetX || preview.offsetY !== saved.offsetY);
  const type = (set: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { setTyped(true); set(e.target.value); };
  const useSuggestion = () => {
    if (!suggestion) return;
    setTyped(true);
    fill(suggestion);
  };
  // Drawn with the grid in the fields, so a correction shows where the AI's lines will land.
  const drawing = useMemo<MapDrawing | undefined>(() => {
    if (!file) return undefined;
    const setup = data.setup ?? EMPTY_MAP_SETUP;
    const built = draftMapBoard(file.board, setup, preview, file);
    return {
      walls: built.ok ? built.board.walls : file.board?.walls ?? [],
      openings: listOpenings(file.board, setup, preview),
      marks: setup.marks,
      aiLines: preview ? setup.lines.map((l) => ({
        a: { x: preview.offsetX + l.from.column * preview.cellSize, y: preview.offsetY + l.from.row * preview.cellSize },
        b: { x: preview.offsetX + l.to.column * preview.cellSize, y: preview.offsetY + l.to.row * preview.cellSize },
      })) : [],
    };
  }, [file, data.setup, cell, x, y]); // `preview` is rebuilt from these three fields on every render
  return (
    <article className="build-card">
      <div className="build-card-head">
        <div className="build-card-title">
          <h3>{data.name}</h3>
          {badges(item, <span className={data.gridStatus === "confirmed" ? "chip" : "chip build-chip-warn"}>{t(gridStatusText(data))}</span>)}
        </div>
        {checkbox}
      </div>
      {file ? <GridOverlay file={file} grid={preview} drawing={drawing} /> : <p className="error">{t("build.map.fileGone")}</p>}
      {file?.fromUvtt && <p className="muted small-print">{t("build.map.fromUvtt", { walls: file.walls })}</p>}
      {file && drawing && <MapWalls data={data} openings={drawing.openings} editable={!item.published} editedByUser={item.editedByUser} onSave={onSaveSetup} />}
      {fromFile && data.grid && <p className="muted small-print">{t("build.map.uvttGrid", { cellSize: data.grid.cellSize })}</p>}
      {!item.published && file && !fromFile && (
        <div className="build-fields">
          <label>{t("build.map.squareSize")}<input inputMode="decimal" value={cell} onChange={type(setCell)} /></label>
          <label>{t("grid.offsetX")}<input inputMode="decimal" value={x} onChange={type(setX)} /></label>
          <label>{t("grid.offsetY")}<input inputMode="decimal" value={y} onChange={type(setY)} /></label>
        </div>
      )}
      {!item.published && !fromFile && unsaved && (
        <p className="build-blocked" role="status">
          {t("build.map.unsaved", { grid: saved ? t("buildCheck.gridWords", { cellSize: saved.cellSize, offsetX: saved.offsetX, offsetY: saved.offsetY }) : t("build.map.noGrid") })}{" "}
          <button type="button" onClick={() => { setTyped(false); fill(start); }}>{t("build.map.putBack")}</button>
        </p>
      )}
      <Flags item={item} />
      {!item.published && (
        <div className="row">
          {file && !fromFile && (
            <button type="button" className="primary" disabled={!preview || busy || (data.gridStatus === "confirmed" && !unsaved)}
              onClick={() => { if (preview) void onConfirm(preview).then(() => setTyped(false)); }}>
              {data.gridStatus === "confirmed" ? t("build.map.saveGrid") : t("build.map.confirmGrid")}
            </button>
          )}
          {suggestion && !fromFile && <button type="button" disabled={busy} onClick={useSuggestion}>{t("build.map.useDetected")}</button>}
          <button type="button" disabled={busy} onClick={onRemove}>{t("common.remove")}</button>
        </div>
      )}
      {!item.published && !fromFile && data.gridStatus === "confirmed" && !unsaved && <p className="muted small-print">{t("build.map.confirmedNote")}</p>}
    </article>
  );
}

function EncounterCard({ item, creatures, maps, checkbox, busy = false, onSave, onRemove }: { item: BuildItemView; creatures: readonly BuildItemView[]; maps: readonly BuildItemView[]; checkbox: ReactNode; busy?: boolean; onSave: (patch: Record<string, unknown>) => Promise<void>; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const data = encounterOf(item);
  const creatureName = (key: string) => {
    const found = creatures.find((c) => c.key === key);
    return found ? creatureOf(found).name : key;
  };
  const map = maps.find((m) => m.key === data.mapKey);
  const blocked = !map ? t("build.encounter.mapGone") : mapOf(map).gridStatus !== "confirmed" ? t("build.encounter.confirmFirst", { map: mapOf(map).name }) : null;
  return (
    <article className="build-card">
      <div className="build-card-head">
        <div className="build-card-title">
          <h3>{data.name}</h3>
          {badges(item)}
          <p className="muted small-print">{t("build.encounter.on", { map: map ? mapOf(map).name : data.mapKey })}</p>
        </div>
        {!blocked && checkbox}
      </div>
      {blocked && !item.published && <p className="build-blocked">{t("build.encounter.blocked", { reason: blocked })}</p>}
      <ul className="plain build-tokens">
        {data.tokens.map((token, i) => (
          <li key={i}>
            <span>{token.name ?? creatureName(token.creatureKey)}</span>
            <span className="muted small-print">{token.square ? t("build.encounter.square", { column: token.square.column, row: token.square.row }) : t("build.encounter.notPlaced")}</span>
            {token.hidden ? <span className="chip">{t("build.encounter.hidden")}</span> : <span className="chip build-chip-warn">{t("build.encounter.playersSee")}</span>}
          </li>
        ))}
      </ul>
      <Flags item={item} />
      {!item.published && (
        <div className="row">
          <button type="button" disabled={busy} onClick={() => setEditing(true)}>{t("common.edit")}</button>
          <button type="button" disabled={busy} onClick={onRemove}>{t("common.remove")}</button>
        </div>
      )}
      <Modal open={editing} title={t("build.editNamed", { name: data.name })} onClose={() => setEditing(false)}>
        {editing && <DraftEncounterEditor data={data} creatureName={creatureName} onCancel={() => setEditing(false)} onSave={async (patch) => { await onSave(patch); setEditing(false); }} />}
      </Modal>
    </article>
  );
}

function StartRoom({ published, onError }: { published: BuildPublished; onError: (error: string) => void }) {
  const account = useAccount();
  const [starting, setStarting] = useState(false);
  async function start(templateId: string, roomName: string) {
    setStarting(true);
    try {
      navigate(`/r/${await createRoomWith(emptyRoomDetails(roomName, account.status === "signedIn" ? account.account.displayName : "GM"), templateId)}`);
    } catch (err) {
      onError(message(err, t("build.page.startRoomFailed")));
      setStarting(false);
    }
  }
  return (
    <section className="build-section" aria-labelledby="build-start">
      <h2 id="build-start">{t("build.start.title")}</h2>
      <ul className="plain build-published">
        {published.encounters.map((e) => (
          <li key={e.id}>
            <span>{e.name}</span>
            <button type="button" className="primary" disabled={starting} onClick={() => void start(e.id, e.name)}>{t("build.start.room")}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lists where each thing is in use before anything is removed, as a library delete does. */
export function RemoveDialog({ items, onClose, onConfirm }: { items: PublishedBuildItem[] | null; onClose: () => void; onConfirm: (ids: string[]) => void }) {
  const used = (items ?? []).filter((i) => i.rooms.length + i.creatures.length + i.encounters.length > 0);
  return (
    <Modal open={items !== null} title={t("build.remove.title")} onClose={onClose}>
      {items && (
        <div className="confirm">
          <p>{items.length === 1 ? t("build.remove.one", { name: items[0]!.name }) : t("build.remove.many", { n: items.length })}{t("build.sentenceGap")}{t("build.remove.nothingElse")}</p>
          {used.length > 0 && (
            <>
              <p>{t("build.remove.stillUsed")}</p>
              <ul className="build-usage">
                {used.flatMap((item) => [
                  ...item.rooms.map((r) => <li key={`${item.id}/${r.id}`}>{t("build.remove.onBoard", { name: item.name, room: r.name })}</li>),
                  ...item.creatures.map((c) => <li key={`${item.id}/${c.id}`}>{t("build.remove.artFor", { name: item.name, creature: c.name })}</li>),
                  ...item.encounters.map((e) => <li key={`${item.id}/${e.id}`}>{t("build.remove.mapFor", { name: item.name, encounter: e.name })}</li>),
                ])}
              </ul>
            </>
          )}
          <div className="row">
            <button type="button" onClick={onClose}>{t("build.remove.keep")}</button>
            <button type="button" className="danger" onClick={() => onConfirm(items.map((i) => i.id))}>{t("common.remove")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
