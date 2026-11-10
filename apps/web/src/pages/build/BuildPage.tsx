import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  EMPTY_MAP_SETUP,
  checkBuild,
  describeDraftLine,
  draftMapBoard,
  listOpenings,
  squareSizeOf,
  type BuildDetail,
  type BuildFileView,
  type BuildItemView,
  type BuildPublished,
  type DraftCreatureState,
  type DraftEncounterState,
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
import { ApiError, api } from "../../net/api";
import { navigate } from "../../router";
import { Modal } from "../../ui/Modal";
import { HubNav, SiteHeader } from "../../ui/SiteHeader";
import { createRoomWith, emptyRoomDetails } from "../RoomDetailsFields";
import { DraftCreatureEditor, DraftEncounterEditor } from "./DraftEditors";
import { BuildChoiceFields } from "./LibraryBuilds";
import { PassPanel } from "./PassPanel";
import { RIGHTS_NOTICE, copyText, uploadKindFor } from "./buildCopy";

const POLL_MS = 5000;
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
const itemId = (item: Pick<BuildItemView, "kind" | "key">) => `${item.kind}/${item.key}`;
/** The square size the person saw, sent with what they reviewed. Item ids always hold a slash, so this can't clash. */
const PROFILE_REVIEWED = "profile";
const creatureOf = (item: BuildItemView) => item.data as unknown as DraftCreatureState;
const mapOf = (item: BuildItemView) => item.data as unknown as DraftMapState;
const encounterOf = (item: BuildItemView) => item.data as unknown as DraftEncounterState;
/** Items with flags come first, so what needs a person is what they see first. */
const flaggedFirst = (a: BuildItemView, b: BuildItemView) => Number(b.flags.length > 0) - Number(a.flags.length > 0);
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
  const [removing, setRemoving] = useState<PublishedBuildItem[] | null>(null);

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

  const run = useCallback(async (action: () => Promise<unknown>, failure: string) => {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(message(err, failure));
    }
  }, [refresh]);

  const items = useMemo(() => detail?.items ?? [], [detail]);
  const files = useMemo(() => detail?.files ?? [], [detail]);
  const creatures = useMemo(() => items.filter((i) => i.kind === "creature").sort(flaggedFirst), [items]);
  const maps = useMemo(() => items.filter((i) => i.kind === "map").sort(flaggedFirst), [items]);
  const encounters = useMemo(() => items.filter((i) => i.kind === "encounter").sort(flaggedFirst), [items]);
  const issues = useMemo(() => (detail ? checkBuild({
    profile: detail.profile,
    aiWalls: detail.build.choices.aiWalls,
    files,
    creatures: creatures.map((i) => ({ key: i.key, data: creatureOf(i), flags: i.flags })),
    maps: maps.map((i) => ({ key: i.key, data: mapOf(i), flags: i.flags })),
    encounters: encounters.map((i) => ({ key: i.key, data: encounterOf(i), flags: i.flags })),
  }) : []), [detail, files, creatures, maps, encounters]);

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
    }, "Couldn't publish.");
  }

  const checkbox = (item: BuildItemView) => (open && !item.published
    ? <label className="build-check"><input type="checkbox" checked={selected.has(itemId(item))} onChange={(e) => toggle(item, e.target.checked)} />Publish</label>
    : null);
  const remove = (item: BuildItemView) => run(() => api.builds.removeItem(id, item.kind, item.key), "Couldn't remove this.");

  return (
    <>
      <div className="page-shell page-bar">
        <SiteHeader nav={<HubNav current="library" />} account={<AccountMenu />} />
      </div>
      <main className="page-shell home gm-page build-page">
        <p className="small-print"><a href="/library">Asset library</a></p>
        <h1>{detail?.build.name ?? "AI build"}</h1>
        {error && <p role="alert" className="error build-error">{error}</p>}
        {!detail && !error && <p className="muted" aria-busy="true">Loading…</p>}

        {detail && (
          <>
            {open ? (
              <section className="build-section" aria-label="Access">
                <p className="muted">
                  {detail.build.passExpiresAt && Date.parse(detail.build.passExpiresAt) > Date.now()
                    ? `Your AI's pass works until ${new Date(detail.build.passExpiresAt).toLocaleString()}. `
                    : "There is no working pass. "}
                  If nothing changes, this build closes on {when(detail.build.closesAt)}.
                </p>
                <div className="row">
                  <button type="button" onClick={() => void run(async () => setPass((await api.builds.newPass(id)).pass), "Couldn't make a new pass.")}>New pass</button>
                  {detail.build.passExpiresAt && <button type="button" onClick={() => void run(() => api.builds.cancelPass(id), "Couldn't cancel the pass.")}>Cancel pass</button>}
                </div>
                <BuildChoiceFields choices={detail.build.choices} onChange={(choices) => void run(() => api.builds.setChoices(id, choices), "Couldn't change what your AI may set up.")} />
                <p className="muted small-print">Turning walls off stops your AI making more changes. What it already set stays below, where you can remove it.</p>
              </section>
            ) : (
              <p className="notice"><span>This build is closed. Its draft is gone, and what it published is listed below.</span></p>
            )}
            <PassPanel pass={pass} onClose={() => setPass(null)} />

            {open && (changed.length > 0 || profileChanged) && (
              <section className="build-section" aria-labelledby="build-changed">
                <h2 id="build-changed">Changed by your AI since you looked</h2>
                <p className="muted small-print">These can't be published until you've checked them.</p>
                <ul className="plain build-published">
                  {profileChanged && (
                    <li>
                      <span>game profile: one square is now {squareSize}</span>
                      <button type="button" onClick={() => setReviewed((all) => ({ ...all, [PROFILE_REVIEWED]: squareSize }))}>I've checked it</button>
                    </li>
                  )}
                  {changed.map((item) => (
                    <li key={itemId(item)}>
                      <span>{item.kind} {item.key}</span>
                      <button type="button" onClick={() => markReviewed(item)}>I've checked it</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && issues.length > 0 && (
              <section className="build-section" aria-labelledby="build-issues">
                <h2 id="build-issues">Needs your attention</h2>
                <ul className="plain build-issues">
                  {issues.map((issue, i) => (
                    <li key={i} className={issue.type === "flag" ? "build-flag" : "build-problem"}>
                      <span className="build-issue-item">{issue.item}</span> {issue.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && <FilesSection id={id} files={files} onDone={refresh} onError={setError} />}

            {detail.profile && open && (
              <section className="build-section" aria-labelledby="build-profile">
                <h2 id="build-profile">Game</h2>
                <p><strong>{detail.profile.name}</strong> <span className="muted">One square is {detail.profile.unitsPerCell} {detail.profile.unitLabel}.</span></p>
                {detail.profile.notes && <p className="build-text">{detail.profile.notes}</p>}
              </section>
            )}

            {open && maps.length > 0 && (
              <section className="build-section" aria-labelledby="build-maps">
                <h2 id="build-maps">Maps</h2>
                <ul className="plain build-list build-list-maps">
                  {maps.map((item) => (
                    <li key={item.key}>
                      <MapCard item={item} file={files.find((f) => f.id === mapOf(item).fileId)} checkbox={checkbox(item)}
                        onConfirm={(grid) => run(async () => markReviewed((await api.builds.confirmGrid(id, item.key, grid)).item), "Couldn't confirm this grid.")}
                        onSaveSetup={(setup) => run(async () => markReviewed((await api.builds.saveMapSetup(id, item.key, setup, item.updatedAt)).item), "Couldn't change these walls.")}
                        onRemove={() => void remove(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && creatures.length > 0 && (
              <section className="build-section" aria-labelledby="build-creatures">
                <h2 id="build-creatures">Creatures and characters</h2>
                <ul className="plain build-list">
                  {creatures.map((item) => (
                    <li key={item.key}>
                      <CreatureCard item={item} files={files} checkbox={checkbox(item)}
                        onSave={async (patch) => { markReviewed((await api.builds.editCreature(id, item.key, patch)).item); await refresh(); }}
                        onRemove={() => void remove(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && encounters.length > 0 && (
              <section className="build-section" aria-labelledby="build-encounters">
                <h2 id="build-encounters">Encounters</h2>
                <ul className="plain build-list">
                  {encounters.map((item) => (
                    <li key={item.key}>
                      <EncounterCard item={item} creatures={creatures} maps={maps} checkbox={checkbox(item)}
                        onSave={async (patch) => { markReviewed((await api.builds.editEncounter(id, item.key, patch)).item); await refresh(); }}
                        onRemove={() => void remove(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {open && draftItems.length > 0 && (
              <section className="build-section" aria-labelledby="build-publish">
                <h2 id="build-publish">Publish</h2>
                <p className="muted">Published items become ordinary library items. An encounter brings its map, creatures and art with it. {RIGHTS_NOTICE}</p>
                <div className="row">
                  <button type="button" onClick={() => setSelected(new Set(draftItems.map(itemId)))}>Select all</button>
                  <button type="button" className="primary" disabled={chosen.length === 0 || chosenChanged}
                    onClick={() => { if (flaggedChosen > 0) setConfirmingPublish(true); else void doPublish(); }}>
                    Publish selected ({chosen.length})
                  </button>
                </div>
              </section>
            )}

            {justPublished && justPublished.encounters.length > 0 && <StartRoom published={justPublished} onError={setError} />}

            {published.length > 0 && (
              <section className="build-section" aria-labelledby="build-published">
                <h2 id="build-published">In your library from this build</h2>
                <p className="muted small-print">Characters arrive with no owner. In a room, open a token and set who controls it to give it to a player.</p>
                <ul className="plain build-published">
                  {published.map((p) => (
                    <li key={p.id}>
                      <span>{p.name} <span className="muted">{p.type === "asset" ? "art or map" : p.type}</span></span>
                      <button type="button" onClick={() => setRemoving([p])}>Remove</button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setRemoving(published)}>Remove everything this build published</button>
              </section>
            )}

            {open && (
              <section className="build-section">
                <button type="button" className="danger" onClick={() => setConfirmingDiscard(true)}>Discard this build</button>
              </section>
            )}
          </>
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

        <Modal open={confirmingDiscard} title="Discard this build?" onClose={() => setConfirmingDiscard(false)}>
          <div className="confirm">
            <p>This deletes its draft and every file that wasn't published, and ends its pass. Anything already published stays in your library.</p>
            <div className="row">
              <button type="button" onClick={() => setConfirmingDiscard(false)}>Keep it</button>
              <button type="button" className="danger" onClick={() => { setConfirmingDiscard(false); void run(() => api.builds.discard(id), "Couldn't discard this build."); }}>Discard</button>
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
    <section className="build-section" aria-labelledby="build-files">
      <h2 id="build-files">Files</h2>
      <p className="muted">Your AI can upload these itself if it can run commands. Otherwise drop them here and it will see them. {RIGHTS_NOTICE}</p>
      <div className="build-drops">
        {zone("token", "Token art")}
        {zone("map", "Maps")}
      </div>
      <p role="status" className="muted small-print">{uploading > 0 ? `Uploading ${uploading}…` : ""}</p>
      {files.length > 0 && (
        <ul className="plain build-files">
          {files.map((f) => <li key={f.id}><img src={f.url} alt="" loading="lazy" /><span className="build-file-name">{f.name}</span><span className="muted small-print">{f.width}×{f.height}{f.published ? " · published" : ""}</span></li>)}
        </ul>
      )}
    </section>
  );
}

function Flags({ item }: { item: BuildItemView }) {
  return (
    <>
      {item.flags.length > 0 && <ul className="plain build-flags">{item.flags.map((f, i) => <li key={i}><strong>{f.field}</strong>: {f.message}</li>)}</ul>}
      {item.notCarriedOver && <NotCarried text={item.notCarriedOver} />}
    </>
  );
}

function NotCarried({ text }: { text: string }) {
  const [state, setState] = useState("");
  return (
    <div className="build-carried">
      <p className="muted small-print">Not carried over</p>
      <p className="build-text">{text}</p>
      <div className="row">
        <button type="button" onClick={() => void copyText(text).then((ok) => setState(ok ? "Copied" : "Couldn't copy"))}>Copy notes</button>
        <span role="status" className="muted small-print">{state}</span>
      </div>
    </div>
  );
}

const badges = (item: BuildItemView, extra?: ReactNode) => (
  <span className="build-badges">
    {extra}
    {item.editedByUser && <span className="chip">Edited by you</span>}
    {item.published && <span className="chip">Published</span>}
  </span>
);

function CreatureCard({ item, files, checkbox, onSave, onRemove }: { item: BuildItemView; files: readonly BuildFileView[]; checkbox: ReactNode; onSave: (patch: Record<string, unknown>) => Promise<void>; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const data = creatureOf(item);
  const art = files.find((f) => f.id === data.imageFileId);
  const stat = (label: string, value: number | null) => <span>{label} <strong>{value ?? "blank"}</strong></span>;
  return (
    <article className="build-card">
      <div className="build-card-head">
        {art ? <img className="build-art" src={art.url} alt="" loading="lazy" /> : <span className="build-art" style={{ background: data.color }} aria-hidden />}
        <div className="build-card-title">
          <h3>{data.name}</h3>
          {badges(item, data.isPlayerCharacter ? <span className="chip">Player character</span> : undefined)}
        </div>
        {checkbox}
      </div>
      <p className="build-stats">{stat("HP", data.hp)} {stat("Max HP", data.maxHp)} {stat("AC", data.ac)} <span>Size <strong>{data.size}</strong></span></p>
      {data.attacks.length > 0 && <p className="muted small-print">{data.attacks.map((a) => a.name).join(", ")}</p>}
      <Flags item={item} />
      {!item.published && (
        <div className="row">
          <button type="button" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" onClick={onRemove}>Remove</button>
        </div>
      )}
      <Modal open={editing} title={`Edit ${data.name}`} onClose={() => setEditing(false)}>
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

const STATUS_TEXT: Record<DraftMapState["gridStatus"], string> = {
  none: "No grid yet",
  proposed: "Grid waiting for you to confirm it",
  confirmed: "Grid confirmed",
};

const gridStatusText = (data: DraftMapState) =>
  data.gridBy === "agreement" ? "Grid set by detection and your AI"
    : data.gridDiffers ? "Your AI's grid differs from detection: check it"
      : STATUS_TEXT[data.gridStatus];

const where = (o: Pick<OpeningView, "square">) => (o.square ? ` at column ${o.square.column}, row ${o.square.row}` : "");

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
      <option value="closed">closed</option><option value="open">open</option><option value="locked">locked</option>
    </select>
  );

  return (
    <details className="build-walls" open={setup.marks.length > 0 || setup.openings.some((o) => o.kind === "leave")}>
      <summary>Walls, doors and windows: {openings.length} {openings.length === 1 ? "opening" : "openings"}, {setup.lines.length} drawn by {editedByUser ? "your AI or you" : "your AI"}</summary>
      <p className="muted small-print">Yellow is a door, blue a window, dashed orange an opening as the file has it, red a wall. What was set here has a white edge. To draw or move walls, publish and use the map editor.</p>
      {openings.length > 0 && (
        <ul className="plain build-wall-list">
          {openings.map((o) => {
            const kind = o.now.kind === "left" || o.now.kind === "opening" ? "opening" : o.now.kind;
            const state = o.now.kind === "left" ? "closed" : o.now.state;
            return (
              <li key={o.number}>
                <span>Opening {o.number}{where(o)}</span>
                <select aria-label={`Opening ${o.number}`} value={kind} disabled={!editable} onChange={(e) => setOpening(o.number, e.target.value, state === "open" || state === "locked" ? state : "closed")}>
                  <option value="opening">{o.now.kind === "left" ? "left for you" : "as the file has it"}</option>
                  <option value="door">door</option>
                  <option value="window">window</option>
                </select>
                {kind !== "opening" && stateSelect(state, (s) => setOpening(o.number, kind, s), `Opening ${o.number} state`)}
                {o.now.kind === "left" && <span className="build-flag-reason">{o.now.reason}</span>}
                {/* Once the owner has edited the map, who set what can't be told apart. */}
                {o.set && o.now.kind !== "left" && <span className="chip">{editedByUser ? "Set" : "Set by your AI"}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {setup.lines.length > 0 && (
        <ul className="plain build-wall-list">
          {setup.lines.map((line, i) => (
            <li key={i}>
              <span>{describeDraftLine(line, i)}</span>
              <select aria-label={`Line ${i + 1}`} value={line.kind} disabled={!editable} onChange={(e) => setLine(i, e.target.value as "wall" | "door" | "window", line.state ?? "closed")}>
                <option value="wall">wall</option><option value="door">door</option><option value="window">window</option>
              </select>
              {line.kind !== "wall" && stateSelect(line.state ?? "closed", (s) => setLine(i, line.kind, s), `Line ${i + 1} state`)}
              {editable && <button type="button" onClick={() => removeLine(i)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {setup.marks.length > 0 && (
        <ul className="plain build-wall-list">
          {setup.marks.map((mark, i) => (
            <li key={i}>
              <span>Left for you at column {mark.square.column}, row {mark.square.row}</span>
              <span className="build-flag-reason">{mark.reason}</span>
              {editable && <button type="button" onClick={() => removeMark(i)}>Done</button>}
            </li>
          ))}
        </ul>
      )}
      {editable && aiSetSomething && <button type="button" onClick={() => void onSave(EMPTY_MAP_SETUP)}>Remove everything your AI set on this map</button>}
    </details>
  );
}

function MapCard({ item, file, checkbox, onConfirm, onSaveSetup, onRemove }: { item: BuildItemView; file: BuildFileView | undefined; checkbox: ReactNode; onConfirm: (grid: DraftProposedGrid) => Promise<void>; onSaveSetup: (setup: DraftMapSetup) => Promise<void>; onRemove: () => void }) {
  const data = mapOf(item);
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
          {badges(item, <span className={data.gridStatus === "confirmed" ? "chip" : "chip build-chip-warn"}>{gridStatusText(data)}</span>)}
        </div>
        {checkbox}
      </div>
      {file ? <GridOverlay file={file} grid={preview} drawing={drawing} /> : <p className="error">This map's file isn't in the build any more.</p>}
      {file?.fromUvtt && <p className="muted small-print">From a UVTT file, with {file.walls} walls.</p>}
      {file && drawing && <MapWalls data={data} openings={drawing.openings} editable={!item.published} editedByUser={item.editedByUser} onSave={onSaveSetup} />}
      {!item.published && file && (
        <div className="build-fields">
          <label>Square size (px)<input inputMode="decimal" value={cell} onChange={type(setCell)} /></label>
          <label>Offset X<input inputMode="decimal" value={x} onChange={type(setX)} /></label>
          <label>Offset Y<input inputMode="decimal" value={y} onChange={type(setY)} /></label>
        </div>
      )}
      {!item.published && unsaved && (
        <p className="build-blocked" role="status">
          The grid in the fields isn't saved. Publishing uses {saved ? `${saved.cellSize}-pixel squares at offset (${saved.offsetX}, ${saved.offsetY})` : "no grid"} until you confirm yours.{" "}
          <button type="button" onClick={() => { setTyped(false); fill(start); }}>Put the saved grid back</button>
        </p>
      )}
      <Flags item={item} />
      {!item.published && (
        <div className="row">
          {file && <button type="button" className="primary" disabled={!preview} onClick={() => { if (preview) void onConfirm(preview).then(() => setTyped(false)); }}>Confirm grid</button>}
          {suggestion && <button type="button" onClick={useSuggestion}>Use the detected grid</button>}
          <button type="button" onClick={onRemove}>Remove</button>
        </div>
      )}
    </article>
  );
}

function EncounterCard({ item, creatures, maps, checkbox, onSave, onRemove }: { item: BuildItemView; creatures: readonly BuildItemView[]; maps: readonly BuildItemView[]; checkbox: ReactNode; onSave: (patch: Record<string, unknown>) => Promise<void>; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const data = encounterOf(item);
  const creatureName = (key: string) => {
    const found = creatures.find((c) => c.key === key);
    return found ? creatureOf(found).name : key;
  };
  const map = maps.find((m) => m.key === data.mapKey);
  const blocked = !map ? "Its map isn't in this build." : mapOf(map).gridStatus !== "confirmed" ? `Confirm the grid on ${mapOf(map).name} first.` : null;
  return (
    <article className="build-card">
      <div className="build-card-head">
        <div className="build-card-title">
          <h3>{data.name}</h3>
          {badges(item)}
          <p className="muted small-print">On {map ? mapOf(map).name : data.mapKey}</p>
        </div>
        {!blocked && checkbox}
      </div>
      {blocked && !item.published && <p className="build-blocked">Can't be published yet. {blocked}</p>}
      <ul className="plain build-tokens">
        {data.tokens.map((token, i) => (
          <li key={i}>
            <span>{token.name ?? creatureName(token.creatureKey)}</span>
            <span className="muted small-print">{token.square ? `column ${token.square.column}, row ${token.square.row}` : "not placed"}</span>
            {token.hidden ? <span className="chip">Hidden</span> : <span className="chip build-chip-warn">Players see this name</span>}
          </li>
        ))}
      </ul>
      <Flags item={item} />
      {!item.published && (
        <div className="row">
          <button type="button" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" onClick={onRemove}>Remove</button>
        </div>
      )}
      <Modal open={editing} title={`Edit ${data.name}`} onClose={() => setEditing(false)}>
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
      onError(message(err, "Couldn't start a room."));
      setStarting(false);
    }
  }
  return (
    <section className="build-section" aria-labelledby="build-start">
      <h2 id="build-start">Published</h2>
      <ul className="plain build-published">
        {published.encounters.map((e) => (
          <li key={e.id}>
            <span>{e.name}</span>
            <button type="button" className="primary" disabled={starting} onClick={() => void start(e.id, e.name)}>Start a room</button>
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
