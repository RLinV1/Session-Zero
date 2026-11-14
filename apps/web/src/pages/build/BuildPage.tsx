import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  DEFAULT_GRID,
  EMPTY_MAP_SETUP,
  draftMapBoard,
  draftTerrainState,
  formatExpression,
  listOpenings,
  squareSizeOf,
  terrainTally,
  type BuildCheckIssue,
  type BuildDetail,
  type BuildFileView,
  type BuildItemView,
  type BuildPublished,
  type DraftCreatureState,
  type DraftLine,
  type DraftMapSetup,
  type DraftMapState,
  type DraftMark,
  type DraftProposedGrid,
  type LibraryMapBoard,
  type OpeningView,
  type PublishedBuildItem,
  type TerrainRun,
} from "@vtt/shared";
import { AccountMenu } from "../../account/AccountPages";
import { RequireAccount } from "../../account/RequireAccount";
import { useAccount } from "../../account/accountStore";
import { ApiError, api } from "../../net/api";
import { navigate } from "../../router";
import { Check, Copy, PencilSimple, Trash } from "@phosphor-icons/react";
import { Modal } from "../../ui/Modal";
import { HubNav, SiteHeader } from "../../ui/SiteHeader";
import { createRoomWith, emptyRoomDetails } from "../RoomDetailsFields";
import { TerrainCells } from "../mapEditor/TerrainSetup";
import { FlagList, Fold, NoteText, ReviewQueue, groupIssues, revealElement, type ThumbFor } from "./BuildLayout";
import { ContentsRail, DraftMeter, type RailLink } from "./BuildRail";
import { CreatureRoster, MapViewer } from "./BuildViewers";
import { EncounterBoard } from "./EncounterBoard";
import { LINE_COLOUR, LinePickLayer, MapWalls, useLinePicker, type LinePicker } from "./MapLines";
import { DraftCreatureEditor, DraftEncounterEditor } from "./DraftEditors";
import { BuildChoiceFields } from "./LibraryBuilds";
import { KIND_WORD, creatureOf, encounterOf, mapOf, ownerIssues } from "./buildProgress";
import { byName, pageRank, sortCreatures, sortEncounters, sortFiles, sortMaps } from "./buildOrder";
import { PassPanel } from "./PassPanel";
import { RIGHTS_NOTICE, copyText, uploadKindFor } from "./buildCopy";

const POLL_MS = 5000;
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
const itemId = (item: Pick<BuildItemView, "kind" | "key">) => `${item.kind}/${item.key}`;
/** The square size the person saw, sent with what they reviewed. Item ids always hold a slash, so this can't clash. */
const PROFILE_REVIEWED = "profile";
/** Where an item's card is on the page, so the issue list and the changed list can link to it. Keys are safe in ids. */
const cardId = (item: Pick<BuildItemView, "kind" | "key">) => `build-${item.kind}-${item.key}`;
/** An item's own name, as the person knows it. */
const nameOf = (item: BuildItemView) => String((item.data as { name?: unknown }).name ?? item.key);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** Where the game profile's notes link: it has no card of its own. */
const PROFILE_ID = "build-profile";
const linkTo = (target: Pick<BuildItemView, "kind" | "key">) => cardId(target);

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
  const [removingDraft, setRemovingDraft] = useState<BuildItemView[] | null>(null);
  const [editingCreature, setEditingCreature] = useState<BuildItemView | null>(null);
  const [editingEncounter, setEditingEncounter] = useState<BuildItemView | null>(null);
  /** The action in flight, named as its button says it, so nothing is sent twice. */
  const [pending, setPending] = useState<string | null>(null);
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
      else setError(message(err, "Couldn't load this build."));
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

  const run = useCallback(async (action: () => Promise<unknown>, failure: string, doing = "Saving…") => {
    setError(null);
    setPending(doing);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(message(err, failure));
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
    revealElement(target);
    const heading = target.matches("h2") ? target : target.querySelector<HTMLElement>("h2") ?? target;
    heading.tabIndex = -1;
    target.scrollIntoView?.({ block: "start" });
    heading.focus({ preventScroll: true });
  }, [detail]);

  // A link to a part of this page, such as a fix's item, opens the folded section it is in before
  // the browser jumps there. It listens before the jump, on the way down, for links anywhere.
  useEffect(() => {
    const open = (e: MouseEvent) => {
      const hash = (e.target as Element | null)?.closest?.("a[href^='#']")?.getAttribute("href");
      if (hash && hash.length > 1) revealElement(document.getElementById(hash.slice(1)));
    };
    document.addEventListener("click", open, true);
    return () => document.removeEventListener("click", open, true);
  }, []);

  const items = useMemo(() => detail?.items ?? [], [detail]);
  const files = useMemo(() => detail?.files ?? [], [detail]);
  // One order for the whole page (buildOrder.ts): like things together, maps in the order the
  // encounters use them, and fixes and notes in the order of the cards they're about.
  const creatures = useMemo(() => sortCreatures(items.filter((i) => i.kind === "creature")), [items]);
  const encounters = useMemo(() => sortEncounters(items.filter((i) => i.kind === "encounter")), [items]);
  const maps = useMemo(() => sortMaps(items.filter((i) => i.kind === "map"), encounters), [items, encounters]);
  const issues = useMemo(() => (detail ? ownerIssues(detail) : []), [detail]);
  const rankOf = useMemo(() => pageRank({ maps, creatures, encounters }), [maps, creatures, encounters]);
  // The encounters a room can start from: what this build has in the library, and what was just
  // published before the list has caught up.
  const roomChoices = useMemo(() => {
    const all = new Map<string, { id: string; name: string }>();
    for (const e of justPublished?.encounters ?? []) all.set(e.id, { id: e.id, name: e.name });
    for (const p of published) if (p.type === "encounter") all.set(p.id, { id: p.id, name: p.name });
    return [...all.values()];
  }, [justPublished, published]);
  const issueGroups = (list: readonly BuildCheckIssue[]) => groupIssues(list).sort((a, b) => rankOf(a.target) - rankOf(b.target));

  if (missing) {
    return <main className="page-shell home gm-page"><h1>Build not found</h1><p className="muted">It may be someone else's, or it no longer exists.</p><a href="/library">Back to your library</a></main>;
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
    }, "Couldn't publish.", "Publishing…");
  }

  // "Choose" is one selection for the whole draft: the bar it brings up publishes or removes it.
  const checkbox = (item: BuildItemView) => (open && !item.published
    ? (
      <label className="build-check">
        <input type="checkbox" aria-label={`Choose ${nameOf(item)}`} checked={selected.has(itemId(item))} onChange={(e) => toggle(item, e.target.checked)} />
        <span aria-hidden="true">Choose</span>
      </label>
    )
    : null);
  const busy = pending !== null;
  const problems = issues.filter((i) => i.type === "problem");
  const notes = issues.filter((i) => i.type === "flag");
  const publishLabel = pending === "Publishing…" ? "Publishing…" : `Publish ${chosen.length}`;
  const passLive = detail?.build.passExpiresAt ? Date.parse(detail.build.passExpiresAt) > Date.now() : false;
  const makePass = () => {
    setConfirmingNewPass(false);
    void run(async () => { setPassReplaced(passLive); setPass((await api.builds.newPass(id)).pass); }, "Couldn't make a new pass.", "Making a pass…");
  };

  // What the check says each item still needs, for the meter, the strip, the roster and "what's ready".
  const tally = (list: readonly BuildCheckIssue[]) => {
    const per = new Map<string, number>();
    for (const issue of list) if (issue.target) per.set(itemId(issue.target), (per.get(itemId(issue.target)) ?? 0) + 1);
    return per;
  };
  const fixesFor = tally(problems);
  const notesFor = tally(notes);
  const ready = draftItems.filter((i) => !fixesFor.has(itemId(i)));
  const counts = {
    fix: draftItems.length - ready.length,
    ready: ready.length,
    published: open ? items.filter((i) => i.published).length : published.filter((p) => p.type !== "asset").length,
  };

  const fileOfMap = (key: string) => {
    const map = maps.find((m) => m.key === key);
    return map ? files.find((f) => f.id === mapOf(map).fileId) : undefined;
  };
  const thumbFor: ThumbFor = (target) => {
    if (!target) return null;
    if (target.kind === "map") return fileOfMap(target.key)?.url ?? null;
    if (target.kind === "creature") {
      const found = creatures.find((c) => c.key === target.key);
      return found ? files.find((f) => f.id === creatureOf(found).imageFileId)?.url ?? null : null;
    }
    const found = encounters.find((e) => e.key === target.key);
    return found ? fileOfMap(encounterOf(found).mapKey)?.url ?? null : null;
  };
  const creatureData = (key: string) => {
    const found = creatures.find((c) => c.key === key);
    return found ? creatureOf(found) : undefined;
  };
  const mapStatus = (map: BuildItemView) => {
    const data = mapOf(map);
    const left = (data.setup?.openings ?? []).filter((o) => o.kind === "leave").length + (data.setup?.marks.length ?? 0);
    const fixes = fixesFor.get(itemId(map)) ?? 0;
    if (map.published) return { text: "Published", warn: false };
    if (data.gridStatus !== "confirmed") return { text: "Grid to confirm", warn: true };
    if (left > 0) return { text: `${left} left for you`, warn: true };
    if (fixes > 0) return { text: `${fixes} to fix`, warn: true };
    return { text: "Ready", warn: false };
  };
  const attention = (item: BuildItemView) => {
    if (item.published) return { text: "Published", warn: false };
    const fixes = fixesFor.get(itemId(item)) ?? 0;
    if (fixes > 0) return { text: `${fixes} to fix`, warn: true };
    const noted = notesFor.get(itemId(item)) ?? 0;
    return noted > 0 ? { text: plural(noted, "note"), warn: false } : null;
  };
  const blockedText = (item: BuildItemView) => {
    const map = maps.find((m) => m.key === encounterOf(item).mapKey);
    return !map ? "Its map isn't in this build." : mapOf(map).gridStatus !== "confirmed" ? `Confirm the grid on ${mapOf(map).name} first.` : null;
  };
  const startPublish = () => { if (flaggedChosen > 0) setConfirmingPublish(true); else void doPublish(); };

  const railLinks: RailLink[] = [
    ...(open && problems.length > 0 ? [{ id: "build-issues", label: "To fix", count: problems.length, urgent: true }] : []),
    ...(open && notes.length > 0 ? [{ id: "build-notes", label: "Notes from your AI", count: notes.length }] : []),
    ...(open && maps.length > 0 ? [{ id: "build-maps", label: "Maps", count: maps.length }] : []),
    ...(open && creatures.length > 0 ? [{ id: "build-creatures", label: "Creatures", count: creatures.length }] : []),
    ...(open && encounters.length > 0 ? [{ id: "build-encounters", label: "Encounters", count: encounters.length }] : []),
    ...(open && draftItems.length > 0 ? [{ id: "build-publish", label: "Publish", count: chosen.length > 0 ? chosen.length : undefined }] : []),
    ...(roomChoices.length > 0 ? [{ id: "build-start", label: "Start a room" }] : []),
    ...(published.length > 0 ? [{ id: "build-published", label: "In your library", count: published.length }] : []),
    ...(open && detail?.profile ? [{ id: PROFILE_ID, label: "Game" }] : []),
    ...(open ? [{ id: "build-files", label: "Files", count: files.length }, { id: "build-access", label: "Your AI's access" }] : []),
  ];

  return (
    <>
      <div className="page-shell page-bar">
        <SiteHeader nav={<HubNav current="library" />} account={<AccountMenu />} />
      </div>
      <main className="page-shell home gm-page build-page">
        <p className="small-print"><a href="/library?tab=builds" onClick={(e) => { e.preventDefault(); navigate("/library?tab=builds"); }}>AI builds</a></p>
        <h1>{detail?.build.name ?? "AI build"}</h1>
        {detail && open && (
          <p className="build-summary">
            {draftItems.length === 0
              ? "Nothing in the draft yet. Your AI's work appears here as it saves it."
              : <>{problems.length === 0 ? "Nothing needs fixing. Check each item, then " : "Fix what's listed, check each item, then "}<a href="#build-publish">publish what you choose</a>.</>}
          </p>
        )}
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="error build-error">{error}</p>}
        {!detail && !error && <p className="muted" aria-busy="true">Loading…</p>}

        {detail && (
          <div className="build-layout">
            <ContentsRail links={railLinks}>
              {open && <DraftMeter counts={counts} />}
              {open && (
                <p className="build-rail-pass small-print">
                  <a href="#build-access">{passLive && detail.build.passExpiresAt ? `Pass works until ${shortWhen(detail.build.passExpiresAt)}` : "No working pass"}</a>
                </p>
              )}
            </ContentsRail>

            <div className="build-main">
              {!open && <p className="notice"><span>This build is closed. Its draft is gone, and what it published is listed below.</span></p>}
              <PassPanel pass={pass} replaced={passReplaced} onClose={() => setPass(null)} />

              {open && (changed.length > 0 || profileChanged) && (
                <section className="build-section build-changed" aria-labelledby="build-changed">
                  <h2 id="build-changed">Changed by your AI since you looked</h2>
                  <p className="muted small-print">These can't be published until you've checked them.</p>
                  <ul className="plain build-published">
                    {profileChanged && (
                      <li>
                        <span>Game profile: one square is now {squareSize}</span>
                        <button type="button" className="small" onClick={() => setReviewed((all) => ({ ...all, [PROFILE_REVIEWED]: squareSize }))}>I've checked it</button>
                      </li>
                    )}
                    {changed.map((item) => (
                      <li key={itemId(item)}>
                        <span><a href={`#${cardId(item)}`}>{nameOf(item)}</a> <span className="muted">{KIND_WORD[item.kind]}</span></span>
                        <button type="button" className="small" onClick={() => markReviewed(item)}>I've checked it</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {open && issues.length > 0 && (
                <ReviewQueue problems={issueGroups(problems)} notes={issueGroups(notes)} linkTo={linkTo} thumbFor={thumbFor} />
              )}

              {open && maps.length > 0 && (
                <MapViewer maps={maps} files={files} idFor={cardId} statusFor={mapStatus}
                  renderPanel={(item) => (
                    <MapCard item={item} file={files.find((f) => f.id === mapOf(item).fileId)} checkbox={checkbox(item)} busy={busy}
                      onConfirm={(grid) => run(async () => markReviewed((await api.builds.confirmGrid(id, item.key, grid)).item), "Couldn't confirm this grid.")}
                      onSaveSetup={(setup) => run(async () => markReviewed((await api.builds.saveMapSetup(id, item.key, setup, item.updatedAt)).item), "Couldn't change this map's setup.")} />
                  )} />
              )}

              {open && creatures.length > 0 && (
                <CreatureRoster creatures={creatures} files={files} idFor={cardId} checkbox={checkbox} attention={attention}
                  renderDetail={(item) => <CreatureDetail item={item} files={files} checkbox={checkbox(item)} busy={busy} onEdit={() => setEditingCreature(item)} />} />
              )}

              {open && encounters.length > 0 && (
                <EncounterBoard encounters={encounters} maps={maps} files={files} creature={creatureData} idFor={cardId}
                  checkbox={checkbox} blockedText={blockedText} busy={busy} onEdit={setEditingEncounter}
                  extras={(item) => <Flags item={item} />} />
              )}

              {open && draftItems.length > 0 && (
                <section className="build-section build-publish" aria-labelledby="build-publish-title" id="build-publish">
                  <div className="build-section-head">
                    <h2 id="build-publish-title">Publish</h2>
                    <span className="build-section-sum">{chosen.length} of {draftItems.length} chosen</span>
                  </div>
                  <p className="muted">Published items become ordinary library items. An encounter brings its map, creatures and art with it. {RIGHTS_NOTICE}</p>
                  <div className="row">
                    <button type="button" disabled={busy} onClick={() => setSelected(new Set(draftItems.map(itemId)))}>Choose everything</button>
                    {ready.length > 0 && ready.length < draftItems.length && (
                      <button type="button" disabled={busy} onClick={() => setSelected(new Set(ready.map(itemId)))}>Choose what's ready ({ready.length})</button>
                    )}
                  </div>
                  {chosenChanged && chosen.length > 0 && <p className="muted small-print">Check what your AI changed, above, before publishing.</p>}
                  {chosen.length === 0 && <p className="muted small-print">Tick Choose on what you want. A bar then appears to publish it or remove it from the draft.</p>}
                </section>
              )}

              {/* Stays while the build has encounters in the library, not only just after publishing. */}
              {roomChoices.length > 0 && <StartRoom encounters={roomChoices} thumbFor={(name) => {
                const found = encounters.find((e) => encounterOf(e).name === name);
                return found ? fileOfMap(encounterOf(found).mapKey)?.url ?? null : null;
              }} onError={setError} />}

              {published.length > 0 && (
                <PublishedList published={published} mapNames={new Set(maps.map((m) => mapOf(m).name))} onRemove={setRemoving}
                  thumbFor={(p, kind) => {
                    // The draft says what each published thing looks like, while the build is open.
                    if (kind === "creature" || kind === "art") {
                      const found = creatures.find((c) => creatureOf(c).name === p.name);
                      return found ? files.find((f) => f.id === creatureOf(found).imageFileId)?.url ?? null : null;
                    }
                    if (kind === "map") {
                      const found = maps.find((m) => mapOf(m).name === p.name);
                      return found ? fileOfMap(found.key)?.url ?? null : null;
                    }
                    if (kind === "encounter") {
                      const found = encounters.find((e) => encounterOf(e).name === p.name);
                      return found ? fileOfMap(encounterOf(found).mapKey)?.url ?? null : null;
                    }
                    return null;
                  }} />
              )}

              {detail.profile && open && (
                <Fold id={PROFILE_ID} title="Game" defaultOpen={false}
                  summary={`${detail.profile.name}. One square is ${detail.profile.unitsPerCell} ${detail.profile.unitLabel}.`}>
                  {detail.profile.notes ? <NoteText text={detail.profile.notes} /> : <p className="muted">Your AI left no notes on the game.</p>}
                </Fold>
              )}

              {open && <FilesSection id={id} files={files} onDone={refresh} onError={setError} />}

              {open && (
                <Fold id="build-access" title="Your AI's access" defaultOpen={!passLive}
                  summary={passLive && detail.build.passExpiresAt ? `Pass works until ${shortWhen(detail.build.passExpiresAt)}` : "No working pass"}>
                  <p className="muted">If nothing changes, this build closes on {when(detail.build.closesAt)}.</p>
                  <div className="row">
                    <button type="button" disabled={busy} onClick={() => (passLive ? setConfirmingNewPass(true) : makePass())}>{pending === "Making a pass…" ? "Making a pass…" : "New pass"}</button>
                    {detail.build.passExpiresAt && <button type="button" disabled={busy} onClick={() => void run(() => api.builds.cancelPass(id), "Couldn't cancel the pass.", "Cancelling…")}>{pending === "Cancelling…" ? "Cancelling…" : "Cancel pass"}</button>}
                  </div>
                  <BuildChoiceFields choices={detail.build.choices} disabled={busy} onChange={(choices) => void run(() => api.builds.setChoices(id, choices), "Couldn't change what your AI may set up.")} />
                  <p className="muted small-print">Turning a choice off stops your AI making more of those changes. What it already set stays above, where you can remove it.</p>
                </Fold>
              )}

              {open && (
                <section className="build-section build-end">
                  <button type="button" className="danger" disabled={busy} onClick={() => setConfirmingDiscard(true)}>Discard this build</button>
                </section>
              )}

              {/* One bar for what's chosen: publish it, or take it out of the draft. */}
              {open && chosen.length > 0 && (
                <div className="build-publish-bar" role="region" aria-label="Chosen items">
                  <span><strong>{chosen.length}</strong> chosen</span>
                  <div className="row">
                    <button type="button" className="link" onClick={() => setSelected(new Set())}>Clear</button>
                    <button type="button" className="link danger build-text-action" disabled={busy} onClick={() => setRemovingDraft(chosen)}>
                      <Trash size={16} aria-hidden="true" />Remove from draft
                    </button>
                    <button type="button" className="primary" disabled={chosenChanged || busy} onClick={startPublish}>{publishLabel}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <Modal open={confirmingPublish} title="Publish with open flags?" onClose={() => setConfirmingPublish(false)}>
          <div className="confirm">
            <p>{flaggedChosen} of the items you chose still {flaggedChosen === 1 ? "has a flag or something left for you" : "have flags or things left for you"}. Blank values stay blank, and openings left for you publish as the file had them.</p>
            <div className="row">
              <button type="button" onClick={() => setConfirmingPublish(false)}>Keep reviewing</button>
              <button type="button" className="primary" onClick={() => void doPublish()}>Publish anyway</button>
            </div>
          </div>
        </Modal>

        <Modal open={confirmingNewPass} title="Make a new pass?" onClose={() => setConfirmingNewPass(false)}>
          <div className="confirm">
            <p>The pass your AI has now stops working at once. If it's still building, it stops, and you send it the new message to carry on.</p>
            <div className="row">
              <button type="button" onClick={() => setConfirmingNewPass(false)}>Keep the current pass</button>
              <button type="button" className="primary" onClick={makePass}>Make a new pass</button>
            </div>
          </div>
        </Modal>

        <Modal open={removingDraft !== null}
          title={removingDraft?.length === 1 ? `Remove ${nameOf(removingDraft[0]!)} from this draft?` : `Remove ${removingDraft?.length ?? 0} items from this draft?`}
          onClose={() => setRemovingDraft(null)}>
          {removingDraft && (
            <div className="confirm">
              <p>{removingDraft.some((i) => i.kind === "map") ? "Encounters on a removed map can't be published without it. " : ""}Your library doesn't change. Your AI can save {removingDraft.length === 1 ? "it" : "them"} again if you ask it to.</p>
              {removingDraft.length > 1 && <ul className="build-usage">{removingDraft.map((i) => <li key={itemId(i)}>{nameOf(i)} <span className="muted">{KIND_WORD[i.kind]}</span></li>)}</ul>}
              <div className="row">
                <button type="button" onClick={() => setRemovingDraft(null)}>Keep {removingDraft.length === 1 ? "it" : "them"}</button>
                <button type="button" className="danger" onClick={() => {
                  const list = removingDraft;
                  setRemovingDraft(null);
                  void run(async () => {
                    for (const item of list) await api.builds.removeItem(id, item.kind, item.key);
                    setSelected((all) => new Set([...all].filter((key) => !list.some((i) => itemId(i) === key))));
                  }, "Couldn't remove these.", "Removing…");
                }}>Remove</button>
              </div>
            </div>
          )}
        </Modal>

        <Modal open={editingCreature !== null} title={editingCreature ? `Edit ${nameOf(editingCreature)}` : "Edit"} className="build-editor-modal" onClose={() => setEditingCreature(null)}>
          {editingCreature && (
            <DraftCreatureEditor data={creatureOf(editingCreature)} files={files} onCancel={() => setEditingCreature(null)}
              onSave={async (patch) => {
                markReviewed((await api.builds.editCreature(id, editingCreature.key, patch)).item);
                await refresh();
                setEditingCreature(null);
              }} />
          )}
        </Modal>

        <Modal open={editingEncounter !== null} title={editingEncounter ? `Edit ${nameOf(editingEncounter)}` : "Edit"} className="build-editor-modal" onClose={() => setEditingEncounter(null)}>
          {editingEncounter && (
            <DraftEncounterEditor data={encounterOf(editingEncounter)} creature={(key) => { const c = creatures.find((x) => x.key === key); return c ? creatureOf(c) : undefined; }}
              onCancel={() => setEditingEncounter(null)}
              onSave={async (patch) => {
                markReviewed((await api.builds.editEncounter(id, editingEncounter.key, patch)).item);
                await refresh();
                setEditingEncounter(null);
              }} />
          )}
        </Modal>

        <Modal open={confirmingDiscard} title={`Discard ${detail?.build.name ?? "this build"}?`} onClose={() => setConfirmingDiscard(false)}>
          <div className="confirm">
            <p>This deletes its draft and every file that wasn't published, and ends its pass. Anything already published stays in your library.</p>
            <div className="row">
              <button type="button" onClick={() => setConfirmingDiscard(false)}>Keep it</button>
              <button type="button" className="danger" onClick={() => { setConfirmingDiscard(false); void run(() => api.builds.discard(id), "Couldn't discard this build.", "Discarding…"); }}>Discard</button>
            </div>
          </div>
        </Modal>

        <RemoveDialog items={removing} onClose={() => setRemoving(null)}
          onConfirm={(ids) => { setRemoving(null); void run(() => api.builds.removePublished(id, ids), "Couldn't remove these."); }} />
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
        failures.push(`${file.name}: ${message(err, "Couldn't upload this.")}`);
      }
      setUploading((n) => n - 1);
    }
    if (failures.length > 0) onError(failures.join("\n"));
    await onDone();
  }

  const zone = (kind: "map" | "token", label: string) => (
    <label
      className="build-drop"
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDrop={(e: DragEvent) => { e.preventDefault(); void send(e.dataTransfer.files, kind); }}
    >
      <span>{label}</span>
      <span className="muted small-print">Drop files here, or choose them</span>
      <input type="file" multiple className="sr-only" accept={kind === "map" ? "image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt" : "image/png,image/jpeg,image/webp"}
        onChange={(e) => { if (e.target.files) void send(e.target.files, kind); e.target.value = ""; }} />
    </label>
  );

  return (
    // Open while there's nothing in it, since dropping files here is then the next step.
    <Fold id="build-files" title="Files" defaultOpen={files.length === 0} summary={files.length === 0 ? "None yet" : plural(files.length, "file")}>
      <p className="muted">Your AI can upload these itself if it can run commands. Otherwise drop them here and it will see them. {RIGHTS_NOTICE}</p>
      <div className="build-drops">
        {zone("token", "Token art")}
        {zone("map", "Maps")}
      </div>
      <p role="status" className="muted small-print">{uploading > 0 ? `Uploading ${uploading}…` : ""}</p>
      {files.length > 0 && (
        <ul className="plain build-files">
          {sortFiles(files).map((f) => <li key={f.id}><img src={f.url} alt="" loading="lazy" /><span className="build-file-name">{f.name}</span><span className="muted small-print">{f.width}×{f.height}{f.published ? ", published" : ""}</span></li>)}
        </ul>
      )}
    </Fold>
  );
}

function Flags({ item }: { item: BuildItemView }) {
  return (
    <>
      <FlagList flags={item.flags} />
      {item.notCarriedOver && <NotCarried text={item.notCarriedOver} />}
    </>
  );
}

/** What the source had that the app can't store. Folded, since it's often the longest text on a card. */
function NotCarried({ text }: { text: string }) {
  const [state, setState] = useState("");
  return (
    <details className="build-disclosure build-carried">
      <summary>Not carried over</summary>
      <NoteText text={text} />
      <div className="row">
        <button type="button" className="link build-text-action" onClick={() => void copyText(text).then((ok) => setState(ok ? "Copied" : "Couldn't copy"))}><Copy size={16} aria-hidden="true" />Copy notes</button>
        <span role="status" className="muted small-print">{state}</span>
      </div>
    </details>
  );
}

const badges = (item: BuildItemView, extra?: ReactNode) => (
  <span className="build-badges">
    {extra}
    {item.editedByUser && <span className="chip">Edited by you</span>}
    {item.published && <span className="chip">Published</span>}
  </span>
);

/**
 * A creature read in full, beside the roster: its numbers as plates, its attacks as a table with
 * the dice written out, then what the AI flagged and what it couldn't store.
 */
function CreatureDetail({ item, files, checkbox, busy, onEdit }: { item: BuildItemView; files: readonly BuildFileView[]; checkbox: ReactNode; busy: boolean; onEdit: () => void }) {
  const data = creatureOf(item);
  const art = files.find((f) => f.id === data.imageFileId);
  const plate = (label: string, value: number | null) => (
    <div className="build-plate"><dt>{label}</dt><dd className={value === null ? "is-blank" : undefined}>{value ?? "blank"}</dd></div>
  );
  const dice = (roll: DraftCreatureState["attacks"][number]["toHit"]) => (roll ? formatExpression(roll) : null);
  return (
    <article className="build-detail" aria-label={data.name}>
      <div className="build-detail-head">
        {art ? <img className="build-detail-art" src={art.url} alt="" loading="lazy" /> : <span className="build-detail-art" style={{ background: data.color }} aria-hidden="true" />}
        <div className="build-card-title">
          <h3>{data.name}</h3>
          {badges(item, data.isPlayerCharacter ? <span className="chip">Player character</span> : undefined)}
        </div>
        <div className="build-board-actions">
          {checkbox}
          {!item.published && (
            <button type="button" className="small build-text-action" disabled={busy} onClick={onEdit}>
              <PencilSimple size={16} aria-hidden="true" />Edit
            </button>
          )}
        </div>
      </div>
      <dl className="build-plates">
        {plate("HP", data.hp)}{plate("Max HP", data.maxHp)}{plate("AC", data.ac)}{plate("Size", data.size)}
      </dl>
      {data.attacks.length > 0 && (
        <table className="build-attacks">
          <thead><tr><th scope="col">Attack</th><th scope="col">To hit</th><th scope="col">Damage</th></tr></thead>
          <tbody>
            {data.attacks.map((a) => (
              <tr key={a.name}>
                <th scope="row">{a.name}</th>
                <td className={a.toHit ? undefined : "is-blank"}>{dice(a.toHit) ?? "blank"}</td>
                <td className={a.damage ? undefined : "is-blank"}>{dice(a.damage) ?? "blank"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Flags item={item} />
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
  /** Drawn doors and windows that sit on a wall they don't cut. */
  blockedLines: readonly number[];
  /** The terrain the AI proposed, in squares of the grid drawn (ADR 0071). */
  terrain: readonly TerrainRun[];
}

const WALL_COLOUR = LINE_COLOUR;

/** A map with its grid, walls, doors and windows drawn over it, in the image's own pixels, so what's published is what's seen. */
export function GridOverlay({ file, grid, drawing, pick }: { file: BuildFileView; grid: DraftProposedGrid | null; drawing?: MapDrawing; pick?: { lines: readonly DraftLine[]; marks: readonly DraftMark[]; picker: LinePicker } }) {
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
          {/* As the map editor draws terrain, under the walls so none is hidden (board-palette). */}
          {grid && grid.cellSize > 0 && drawing && drawing.terrain.length > 0 && <TerrainCells runs={[...drawing.terrain]} grid={{ ...DEFAULT_GRID, ...grid }} />}
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
          {grid && grid.cellSize > 0 && pick && pick.lines.length > 0 && <LinePickLayer lines={pick.lines} marks={pick.marks} grid={grid} picker={pick.picker} labelSize={label} />}
        </svg>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<DraftMapState["gridStatus"], string> = {
  none: "No grid yet",
  proposed: "Grid waiting for you to confirm it",
  confirmed: "Grid confirmed",
};

const gridStatusText = (data: DraftMapState) =>
  data.gridBy === "agreement" ? "Grid set by detection and your AI"
    : data.gridDiffers ? "Your AI's grid differs from detection: check it"
      : STATUS_TEXT[data.gridStatus];

/**
 * The permanent terrain the AI proposed (ADR 0071), drawn on the map above. The owner can clear it
 * all here; painting terrain stays in the map editor after publishing.
 */
function MapTerrain({ data, editable, editedByUser, onSave }: { data: DraftMapState; editable: boolean; editedByUser: boolean; onSave: (setup: DraftMapSetup) => Promise<void> }) {
  const setup = data.setup ?? EMPTY_MAP_SETUP;
  const terrain = setup.terrain ?? [];
  if (terrain.length === 0) return null;
  const tally = terrainTally(terrain);
  const otherGrid = draftTerrainState(setup, data.grid ?? data.proposedGrid) === "otherGrid";
  const was = setup.terrainGrid;
  return (
    <details className="build-walls" open={otherGrid}>
      <summary>Terrain: {plural(tally.difficult, "Difficult square")} and {plural(tally.blocked, "Blocked square")}, proposed by your AI</summary>
      <p className="muted small-print">Violet single hatching is Difficult, red crosshatching Blocked. Every other square is Normal. To paint terrain, publish and use the map editor.</p>
      {otherGrid && was && (
        <p className="build-blocked" role="status">Your AI proposed this terrain on {was.cellSize}-pixel squares at offset ({was.offsetX}, {was.offsetY}), not on the grid this map has now. Clear it, or put the grid back.</p>
      )}
      {editable && !editedByUser && <p className="muted small-print">Clearing it stops your AI changing this map.</p>}
      {editable && <button type="button" className="link danger build-text-action" onClick={() => void onSave({ ...setup, terrain: [] })}>Clear all terrain</button>}
    </details>
  );
}

function MapCard({ item, file, checkbox, busy = false, onConfirm, onSaveSetup }: { item: BuildItemView; file: BuildFileView | undefined; checkbox: ReactNode; busy?: boolean; onConfirm: (grid: DraftProposedGrid) => Promise<void>; onSaveSetup: (setup: DraftMapSetup) => Promise<void> }) {
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
  const setup = data.setup ?? EMPTY_MAP_SETUP;
  const picker = useLinePicker(setup.lines.length, setup.marks.length);
  const drawing = useMemo<MapDrawing | undefined>(() => {
    if (!file) return undefined;
    const built = draftMapBoard(file.board, setup, preview, file);
    return {
      walls: built.ok ? built.board.walls : file.board?.walls ?? [],
      openings: listOpenings(file.board, setup, preview),
      marks: setup.marks,
      aiLines: preview ? setup.lines.map((l) => ({
        a: { x: preview.offsetX + l.from.column * preview.cellSize, y: preview.offsetY + l.from.row * preview.cellSize },
        b: { x: preview.offsetX + l.to.column * preview.cellSize, y: preview.offsetY + l.to.row * preview.cellSize },
      })) : [],
      blockedLines: built.ok ? built.blockedLines : [],
      terrain: setup.terrain ?? [],
    };
  }, [file, data.setup, cell, x, y]); // `preview` is rebuilt from these three fields on every render
  const walls = drawing !== undefined && drawing.openings.length + setup.lines.length + setup.marks.length > 0;
  return (
    <article className="build-card">
      <div className="build-card-head">
        <div className="build-card-title">
          <h3>{data.name}</h3>
          {badges(item, <span className={data.gridStatus === "confirmed" ? "chip" : "chip build-chip-warn"}>{gridStatusText(data)}</span>)}
        </div>
        {checkbox}
      </div>
      {file ? (
        <div className={walls ? "build-map-room" : undefined}><div className={walls ? "build-map-review" : undefined}>
          <div className="build-map-side">
            <GridOverlay file={file} grid={preview} drawing={drawing} pick={walls ? { lines: setup.lines, marks: setup.marks, picker } : undefined} />
            {file.fromUvtt && <p className="muted small-print">From a UVTT file, with {file.walls} walls.</p>}
          </div>
          {walls && drawing && (
            <MapWalls setup={setup} openings={drawing.openings} blocked={drawing.blockedLines} editable={!item.published} editedByUser={item.editedByUser}
              busy={busy} picker={picker} onSave={onSaveSetup} />
          )}
        </div></div>
      ) : <p className="error">This map's file isn't in the build any more.</p>}
      {file && <MapTerrain data={data} editable={!item.published} editedByUser={item.editedByUser} onSave={onSaveSetup} />}
      {fromFile && data.grid && <p className="muted small-print">Grid from the UVTT file: {data.grid.cellSize}-pixel squares. It's exact, so there's nothing to confirm.</p>}
      {!item.published && file && !fromFile && (
        <div className="build-fields">
          <label>Square size (px)<input inputMode="decimal" value={cell} onChange={type(setCell)} /></label>
          <label>Offset X<input inputMode="decimal" value={x} onChange={type(setX)} /></label>
          <label>Offset Y<input inputMode="decimal" value={y} onChange={type(setY)} /></label>
        </div>
      )}
      {!item.published && !fromFile && unsaved && (
        <p className="build-blocked" role="status">
          The grid in the fields isn't saved. Publishing uses {saved ? `${saved.cellSize}-pixel squares at offset (${saved.offsetX}, ${saved.offsetY})` : "no grid"} until you confirm yours.{" "}
          <button type="button" onClick={() => { setTyped(false); fill(start); }}>Put the saved grid back</button>
        </p>
      )}
      <Flags item={item} />
      {!item.published && (
        <div className="row">
          {file && !fromFile && (
            <button type="button" className="primary" disabled={!preview || busy || (data.gridStatus === "confirmed" && !unsaved)}
              onClick={() => { if (preview) void onConfirm(preview).then(() => setTyped(false)); }}>
              {data.gridStatus === "confirmed" ? "Save grid" : "Confirm grid"}
            </button>
          )}
          {suggestion && !fromFile && <button type="button" disabled={busy} onClick={useSuggestion}>Use the detected grid</button>}
        </div>
      )}
      {!item.published && !fromFile && data.gridStatus === "confirmed" && !unsaved && <p className="muted small-print">The grid is confirmed. Change the numbers to save a different one.</p>}
    </article>
  );
}

/**
 * What's next after publishing: a room from one of the new encounters. The encounters are a choice,
 * each shown with its map, and the room is one button, rather than a primary button on every row.
 */
function StartRoom({ encounters: given, thumbFor, onError }: { encounters: readonly { id: string; name: string }[]; thumbFor: (name: string) => string | null; onError: (error: string) => void }) {
  const account = useAccount();
  const encounters = [...given].sort((a, b) => byName(a.name, b.name));
  const [choice, setChoice] = useState(encounters[0]!.id);
  const [starting, setStarting] = useState(false);
  const chosen = encounters.find((e) => e.id === choice) ?? encounters[0]!;
  async function start() {
    setStarting(true);
    try {
      navigate(`/r/${await createRoomWith(emptyRoomDetails(chosen.name, account.status === "signedIn" ? account.account.displayName : "GM"), chosen.id)}`);
    } catch (err) {
      onError(message(err, "Couldn't start a room."));
      setStarting(false);
    }
  }
  return (
    <section className="build-section build-start" aria-labelledby="build-start">
      <div className="build-section-head">
        <h2 id="build-start">Start a room</h2>
        <span className="build-section-sum">{encounters.length === 1 ? "1 encounter in your library" : `${encounters.length} encounters in your library`}</span>
      </div>
      {encounters.length === 1
        ? <p className="muted">{chosen.name} is in your library. Start a room with it now, or later from your library.</p>
        : (
          <fieldset className="build-scenes">
            <legend>Encounter to start with</legend>
            {encounters.map((e) => {
              const thumb = thumbFor(e.name);
              return (
                <label key={e.id} className={e.id === choice ? "build-scene is-chosen" : "build-scene"}>
                  <input type="radio" className="sr-only" name="build-start-encounter" value={e.id} checked={e.id === choice} onChange={() => setChoice(e.id)} />
                  {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="build-scene-blank" aria-hidden="true" />}
                  <span className="build-scene-name">{e.name}</span>
                  {e.id === choice && <Check className="build-scene-tick" size={18} weight="bold" aria-hidden="true" />}
                </label>
              );
            })}
          </fieldset>
        )}
      <div className="row">
        <button type="button" className="primary" disabled={starting} onClick={() => void start()}>{starting ? "Starting…" : "Start a room"}</button>
      </div>
    </section>
  );
}

type PublishedKind = "encounter" | "map" | "creature" | "art" | "file";
const PUBLISHED_GROUPS: { kind: PublishedKind; title: string; one: string; many: string }[] = [
  { kind: "encounter", title: "Encounters", one: "encounter", many: "encounters" },
  { kind: "map", title: "Maps", one: "map", many: "maps" },
  { kind: "creature", title: "Creatures", one: "creature", many: "creatures" },
  { kind: "art", title: "Token art", one: "token art", many: "token art" },
  { kind: "file", title: "Art and maps", one: "other file", many: "other files" },
];

/**
 * The library only says an item is a file. A file an encounter uses, or with a draft map's name, is
 * a map; one a creature uses is token art. Anything else, such as art whose creature was removed,
 * stays "art and maps", since that's all that's known.
 */
function publishedKind(item: PublishedBuildItem, mapNames: ReadonlySet<string>): PublishedKind {
  if (item.type !== "asset") return item.type;
  if (item.encounters.length > 0 || mapNames.has(item.name)) return "map";
  if (item.creatures.length > 0) return "art";
  return "file";
}

/** A checkbox for a whole group: ticked when all of it is chosen, half-ticked when some is. */
function GroupCheck({ label, all, some, onChange }: { label: ReactNode; all: boolean; some: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="build-pick">
      <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some && !all; }} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/**
 * What a build put in the library, by kind, with each kind's count and its names in counting
 * order, so the kind isn't repeated on every row.
 *
 * Removing is one action, not a button on every row: "Remove from library" turns the names into
 * choices, a kind's heading chooses the whole kind, and one Remove takes everything chosen to the
 * same confirmation, which lists where each thing is still in use.
 */
function PublishedList({ published, mapNames, thumbFor, onRemove }: { published: readonly PublishedBuildItem[]; mapNames: ReadonlySet<string>; thumbFor: (item: PublishedBuildItem, kind: PublishedKind) => string | null; onRemove: (items: PublishedBuildItem[]) => void }) {
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const groups = PUBLISHED_GROUPS
    .map((g) => ({ ...g, items: published.filter((p) => publishedKind(p, mapNames) === g.kind).sort((a, b) => byName(a.name, b.name)) }))
    .filter((g) => g.items.length > 0);
  const picked = published.filter((p) => chosen.has(p.id));
  const choose = (ids: readonly string[], on: boolean) => setChosen((all) => {
    const next = new Set(all);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    return next;
  });
  const stop = () => { setChoosing(false); setChosen(new Set()); };
  // Once what was chosen has gone from the library, choosing is over. A cancelled confirmation keeps it.
  useEffect(() => { if (chosen.size > 0 && picked.length === 0) stop(); }, [chosen.size, picked.length]);

  return (
    <Fold id="build-published" title="In your library from this build" defaultOpen
      summary={groups.map((g) => plural(g.items.length, g.one, g.many)).join(", ")}>
      <p className="muted small-print">Characters arrive with no owner. In a room, open a token and set who controls it to give it to a player.</p>
      {/* One button that changes its words, so focus stays on it as choosing starts and stops. */}
      <button type="button" className="small build-text-action" aria-pressed={choosing} onClick={() => (choosing ? stop() : setChoosing(true))}>
        {choosing ? "Cancel" : <><Trash size={16} aria-hidden="true" />Remove from library</>}
      </button>
      {choosing && <p className="muted small-print" role="status">Choose what to remove. A heading chooses all of its kind.</p>}
      <div className="build-published-groups" onKeyDown={(e) => { if (choosing && e.key === "Escape") stop(); }}>
        {groups.map((g) => {
          const ids = g.items.map((p) => p.id);
          const count = ids.filter((id) => chosen.has(id)).length;
          const title = <>{g.title} <span className="muted">({g.items.length})</span></>;
          return (
            <div key={g.kind} className="build-published-group">
              <h3>{choosing ? <GroupCheck label={title} all={count === ids.length} some={count > 0} onChange={(on) => choose(ids, on)} /> : title}</h3>
              <ul className="plain build-published-grid">
                {g.items.map((p) => {
                  const thumb = thumbFor(p, g.kind);
                  const picture = thumb
                    ? <img className={g.kind === "creature" || g.kind === "art" ? "build-published-thumb is-round" : "build-published-thumb"} src={thumb} alt="" loading="lazy" />
                    : null;
                  return (
                    <li key={p.id}>
                      {choosing
                        ? <label className="build-pick"><input type="checkbox" checked={chosen.has(p.id)} onChange={(e) => choose([p.id], e.target.checked)} />{picture}<span>{p.name}</span></label>
                        : <span className="build-published-name">{picture}<span>{p.name}</span></span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {/* Kept in view while ticking far down the list, as the publish bar is. */}
      {choosing && (
        <div className="build-publish-bar" role="region" aria-label="Remove from your library">
          <span>{picked.length === 0 ? "Nothing chosen" : `${picked.length} chosen`}</span>
          <div className="row">
            <button type="button" className="link" onClick={() => choose(published.map((p) => p.id), picked.length < published.length)}>
              {picked.length < published.length ? "Choose everything" : "Choose nothing"}
            </button>
            <button type="button" className="danger" disabled={picked.length === 0} onClick={() => onRemove(picked)}>
              Remove{picked.length > 0 ? ` ${picked.length}` : ""}
            </button>
          </div>
        </div>
      )}
    </Fold>
  );
}

/** Lists where each thing is in use before anything is removed, as a library delete does. */
export function RemoveDialog({ items, onClose, onConfirm }: { items: PublishedBuildItem[] | null; onClose: () => void; onConfirm: (ids: string[]) => void }) {
  const used = (items ?? []).filter((i) => i.rooms.length + i.creatures.length + i.encounters.length > 0);
  return (
    <Modal open={items !== null} title="Remove from your library?" onClose={onClose}>
      {items && (
        <div className="confirm">
          <p>{items.length === 1 ? `${items[0]!.name} will be removed from your library.` : `These ${items.length} items will be removed from your library.`} Nothing else in your library changes, and no room is deleted.</p>
          {used.length > 0 && (
            <>
              <p>Still in use:</p>
              <ul className="build-usage">
                {used.flatMap((item) => [
                  ...item.rooms.map((r) => <li key={`${item.id}/${r.id}`}>{item.name} is on the board in room {r.name}. It will show a stand-in there.</li>),
                  ...item.creatures.map((c) => <li key={`${item.id}/${c.id}`}>{item.name} is the art for {c.name}.</li>),
                  ...item.encounters.map((e) => <li key={`${item.id}/${e.id}`}>{item.name} is the map for {e.name}.</li>),
                ])}
              </ul>
            </>
          )}
          <div className="row">
            <button type="button" onClick={onClose}>Keep</button>
            <button type="button" className="danger" onClick={() => onConfirm(items.map((i) => i.id))}>Remove</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
