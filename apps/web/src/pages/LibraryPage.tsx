import { GridFour, TextAa, Trash, X } from "@phosphor-icons/react";
import { IconAction } from "../ui/IconAction";
import { useEffect, useMemo, useState } from "react";
import { shippedMapByUrl, type AssetKind, type EncounterSummary, type LibraryAsset, type LibraryCreature, type UvttIssue } from "@vtt/shared";
import { api } from "../net/api";
import { assetDisplayName, builtinsMatching } from "../net/builtinAssets";
import { imageSize, nameFromFile } from "../net/imageFile";
import { Modal } from "../ui/Modal";
import { isCroppable, TokenArtCropper } from "../ui/TokenArtCropper";
import { AccountMenu } from "../account/AccountPages";
import { EmptyState } from "../ui/EmptyState";
import { MapThumbnail } from "../ui/MapThumbnail";
import { HubNav, SiteHeader } from "../ui/SiteHeader";
import { RequireAccount } from "../account/RequireAccount";
import { LibraryMapEditor } from "./mapEditor/LibraryMapEditor";
import { AnimationsTab } from "./LibraryAnimations";
import { BuiltinCreatureCard, CreatureCard, CreatureForm } from "./LibraryCreatures";
import { BUILTIN_CREATURES } from "../net/builtinCreatures";
import { EncounterCard } from "./LibraryEncounters";
import { LibraryPicker } from "./LibraryPicker";import { startEncounterEdit } from "./encounterEdit/startEdit";
import { DiceLookCards, DiceLookModal, DiceSignInLine, SaveBrowserLooksOffer } from "./DiceLooks";
import { createDiceLook } from "../ui/diceSkinStore";
import { IMAGE_ACCEPT, MAP_ACCEPT } from "../net/mapFileTypes";
import { t } from "../i18n/locale";

/**
 * Maps and token art are uploaded assets; creatures are reusable token setups (library-creatures);
 * dice are your dice looks, kept in this browser (dice-image-skins).
 */
type Tab = AssetKind | "creature" | "encounter" | "animation" | "dice";

/** Tab labels are catalog ids, read when the page renders. */
const TABS = [
  { tab: "map", label: "library.tab.map" },
  { tab: "token", label: "library.tab.token" },
  { tab: "creature", label: "library.tab.creature" },
  { tab: "encounter", label: "library.tab.encounter" },
  { tab: "animation", label: "library.tab.animation" },
  { tab: "dice", label: "library.tab.dice" },
] as const satisfies readonly { tab: Tab; label: string }[];

/** `/library?tab=dice` opens on the Dice tab: the room's Dice panel links there. */
const wantsDice = () => new URLSearchParams(location.search).get("tab") === "dice";

/**
 * The signed-in person's library, whether they host or only play (asset-library). It follows the
 * dashboard's entry rule (gm-dashboard): signed out goes to sign-in first.
 *
 * Dice looks are the exception: every player has dice, so the Dice tab opens on its own for a
 * signed-out browser, with the looks kept in that browser (dice-looks).
 */
export function LibraryPage() {
  const [diceOnly] = useState(wantsDice);
  return (
    <RequireAccount signedOut={diceOnly ? <DiceLibrary /> : undefined}>
      <Library />
    </RequireAccount>
  );
}

/** The Dice tab alone, for a player who isn't a GM here: the same toolbar, grid and editor. */
function DiceLibrary() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
    <div className="page-shell page-bar">
      <SiteHeader />
    </div>
    <main className="page-shell home gm-page">
      <h1>{t("library.diceLooks")}</h1>
      <div className="library-toolbar">
        <input type="search" aria-label={t("common.searchByName")} placeholder={t("common.searchByName")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="primary" onClick={() => void createDiceLook().then(setEditing)}>
          {t("library.newDiceLook")}
        </button>
      </div>
      <DiceSignInLine />
      <DiceLookCards query={query} onEdit={setEditing} />
      <DiceLookModal lookId={editing} onClose={() => setEditing(null)} />
    </main>
    </>
  );
}

/** The GM's maps, token art and creatures, managed before a session (asset-library, library-creatures). */
function Library() {
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [creatures, setCreatures] = useState<LibraryCreature[] | null>(null);
  const [encounters, setEncounters] = useState<EncounterSummary[] | null>(null);
  const [tab, setTab] = useState<Tab>(() => (wantsDice() ? "dice" : "map"));
  const kind: AssetKind = tab === "map" ? "map" : "token";
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The creature open in the New/Edit form. */
  const [creatureTarget, setCreatureTarget] = useState<LibraryCreature | "new" | null>(null);
  /** An included creature being copied into the library: the New form, prefilled. */
  /** The dice look open in its editor (dice-image-skins). */
  const [diceTarget, setDiceTarget] = useState<string | null>(null);
  /** The owned map whose grid is open in the editor. */
  const [gridTarget, setGridTarget] = useState<LibraryAsset | null>(null);
  const [importResult, setImportResult] = useState<{ assetId: string; diagnostics: UvttIssue[] } | null>(null);
  /** New encounter: choosing its map (ADR 0033). */
  const [pickingEncounterMap, setPickingEncounterMap] = useState(false);
  /** The map a new encounter waits on while its grid is set up first. */
  const [encounterMapAwaitingGrid, setEncounterMapAwaitingGrid] = useState<string | null>(null);
  const [startingEncounter, setStartingEncounter] = useState(false);

  /** Opens a new encounter on one of the GM's maps in a temporary room; a map with no grid gets one first. */
  async function newEncounterOn(map: LibraryAsset) {
    setPickingEncounterMap(false);
    if (!map.grid) {
      setEncounterMapAwaitingGrid(map.id);
      setGridTarget(map);
      return;
    }
    setStartingEncounter(true);
    setError(null);
    try {
      await startEncounterEdit({ mapAssetId: map.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("library.encounterStartFailed"));
      setStartingEncounter(false);
    }
  }

  useEffect(() => {
    let live = true;
    api.library.list().then(
      (list) => live && setAssets(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : t("library.loadFailed")),
    );
    api.library.creatures.list().then(
      (list) => live && setCreatures(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : t("library.creaturesLoadFailed")),
    );
    api.library.encounters.list().then(
      (list) => live && setEncounters(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : t("library.encountersLoadFailed")),
    );
    return () => {
      live = false;
    };
  }, []);

  // Maps: the seeded shipped-map rows (ADR 0036) are listed under "Included with the app", not among the uploads.
  const { shown, seededMaps, seededUrls } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mine: LibraryAsset[] = [];
    const seeded: LibraryAsset[] = [];
    const urls = new Set<string>();
    for (const a of assets ?? []) {
      if (a.kind !== kind) continue;
      const isShipped = kind === "map" && !!shippedMapByUrl(a.url);
      if (isShipped) urls.add(a.url);
      if (q && !a.name.toLowerCase().includes(q)) continue;
      (isShipped ? seeded : mine).push(a);
    }
    return { shown: mine, seededMaps: seeded, seededUrls: urls };
  }, [assets, kind, query]);

  // Static copies fill in until the account's own shipped rows exist; once a row is seeded its twin is dropped.
  const builtins = useMemo(
    () => (tab === "creature" || tab === "encounter" || tab === "animation" || tab === "dice" ? [] : builtinsMatching(kind, query).filter((b) => !seededUrls.has(b.url))),
    [tab, kind, query, seededUrls],
  );

  const shownCreatures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (creatures ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [creatures, query]);

  const builtinCreatures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BUILTIN_CREATURES.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [query]);

  const shownEncounters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (encounters ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [encounters, query]);

  const replace = (next: LibraryAsset) => setAssets((all) => (all ?? []).map((a) => (a.id === next.id ? next : a)));

  return (
    <>
    <div className="page-shell page-bar">
      <SiteHeader nav={<HubNav current="library" />} account={<AccountMenu />} />
    </div>
    <main className="page-shell home gm-page">
      <h1>{t("library.title")}</h1>
      {error && <p role="alert" className="error">{error}</p>}

      <div className="library-toolbar">
        <div role="tablist" aria-label={t("library.assetType")} className="tabs">
          {TABS.map((entry) => (
            <button
              key={entry.tab}
              type="button"
              role="tab"
              aria-selected={tab === entry.tab}
              className={tab === entry.tab ? "tab active" : "tab"}
              onClick={() => {
                setTab(entry.tab);
                // Keep the Dice tab in the address, so reloading or sharing lands back on it.
                history.replaceState(null, "", entry.tab === "dice" ? "/library?tab=dice" : "/library");
              }}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label={t("common.searchByName")}
          placeholder={t("common.searchByName")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {tab === "dice" ? (
          <button type="button" className="primary" onClick={() => void createDiceLook().then(setDiceTarget)}>{t("library.newDiceLook")}</button>
        ) : tab === "creature" ? (
          <button type="button" className="primary" onClick={() => setCreatureTarget("new")}>{t("library.newCreature")}</button>
        ) : tab === "encounter" ? (
          <button type="button" className="primary" disabled={startingEncounter} onClick={() => setPickingEncounterMap(true)}>
            {startingEncounter ? t("common.opening") : t("library.newEncounter")}
          </button>
        ) : tab === "animation" ? null : (
          <UploadButton
            kind={kind}
            onUploaded={(a, diagnostics) => {
              setAssets((all) => [a, ...(all ?? [])]);
              if (diagnostics) setImportResult({ assetId: a.id, diagnostics });
              if (a.kind === "map" && (!a.grid || diagnostics)) setGridTarget(a);
            }}
            onError={setError}
          />
        )}
      </div>

      {tab === "map" && <p className="muted">{t("library.uploadHint")}</p>}

      {tab === "dice" ? (
        <>
          <SaveBrowserLooksOffer />
          <DiceLookCards query={query} onEdit={setDiceTarget} />
        </>
      ) : tab === "animation" ? (
        <AnimationsTab query={query} onError={setError} />
      ) : tab === "encounter" ? (
        <>
          {!encounters && !error && <p className="muted" aria-busy="true">{t("common.loading")}</p>}
          {encounters && shownEncounters.length === 0 && (query ? (
            <p className="muted">{t("library.noEncounterMatch")}</p>
          ) : (
            // The toolbar's New encounter is right above, so the empty state adds no second one.
            <EmptyState picture="empty-library">
              {t("library.noEncounters")}
            </EmptyState>
          ))}
          <ul className="plain asset-grid" role="tabpanel">
            {shownEncounters.map((encounter) => (
              <EncounterCard
                key={encounter.id}
                encounter={encounter}
                map={encounter.mapAssetId ? assets?.find((a) => a.id === encounter.mapAssetId) : undefined}
                onChanged={(next) => setEncounters((all) => (all ?? []).map((e) => (e.id === next.id ? next : e)))}
                onDeleted={() => setEncounters((all) => (all ?? []).filter((e) => e.id !== encounter.id))}
              />
            ))}
          </ul>
        </>
      ) : tab === "creature" ? (
        <>
          {!creatures && !error && <p className="muted" aria-busy="true">{t("common.loading")}</p>}
          {creatures && shownCreatures.length === 0 && (query ? (
            <p className="muted">{t("library.noCreatureMatch")}</p>
          ) : (
            <EmptyState picture="empty-library">
              {t("library.noCreatures")}
            </EmptyState>
          ))}
          <ul className="plain asset-grid" role="tabpanel">
            {shownCreatures.map((creature) => (
                <CreatureCard
                  key={creature.id}
                  creature={creature}
                  onEdit={() => setCreatureTarget(creature)}
                  onDeleted={() => setCreatures((all) => (all ?? []).filter((c) => c.id !== creature.id))}
                />
              ))}
          </ul>
          {builtinCreatures.length > 0 && (
            <section className="builtin-assets" aria-labelledby="builtin-creatures-heading">
              <h2 id="builtin-creatures-heading">{t("library.included")}</h2>
              <p className="muted">{t("library.includedCreatures")}</p>
              <ul className="plain asset-grid">
                {builtinCreatures.map((creature) => (
                  <BuiltinCreatureCard key={creature.id} creature={creature} />
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          {!assets && !error && <p className="muted" aria-busy="true">{t("common.loading")}</p>}
          {assets && shown.length === 0 && (query ? (
            <p className="muted">{t("library.noUploadMatch")}</p>
          ) : (
            <EmptyState picture="empty-library">
              {t(kind === "map" ? "library.noUploads.map" : "library.noUploads.token")}
            </EmptyState>
          ))}
          <ul className="plain asset-grid" role="tabpanel">
            {shown.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onChanged={replace}
                  onEditGrid={() => setGridTarget(asset)}
                  onDeleted={() => {
                    setAssets((all) => (all ?? []).filter((a) => a.id !== asset.id));
                    // The server cleared the link; creatures that used this art are now colour discs.
                    setCreatures((all) => (all ?? []).map((c) => (c.imageAssetId === asset.id ? { ...c, imageAssetId: null, imageUrl: null } : c)));
                  }}
                />
              ))}
          </ul>
        </>
      )}

      {(builtins.length > 0 || seededMaps.length > 0) && (
        <section className="builtin-assets" aria-labelledby="builtin-heading">
          <h2 id="builtin-heading">{t("library.included")}</h2>
          <p className="muted">{t("library.includedArt")}</p>
          {kind === "token" && <p className="muted small-print">{t("library.creditsDetail")} <a href="/img/tokens/enemies/CREDITS.md" target="_blank" rel="noreferrer">{t("library.credits")}</a></p>}
          <ul className="plain asset-grid">
            {seededMaps.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onChanged={replace}
                onEditGrid={() => setGridTarget(asset)}
                onDeleted={() => setAssets((all) => (all ?? []).filter((a) => a.id !== asset.id))}
              />
            ))}
            {builtins.map((asset) => (
              <BuiltinCard key={asset.id} asset={asset} />
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={creatureTarget !== null}
        title={creatureTarget === "new" ? t("library.newCreature") : t("library.editCreature")}
        onClose={() => setCreatureTarget(null)}
      >
        {creatureTarget !== null && (
          <CreatureForm
            key={creatureTarget === "new" ? "new" : creatureTarget.id}
            creature={creatureTarget === "new" ? null : creatureTarget}
            onCancel={() => setCreatureTarget(null)}
            onSaved={(saved) => {
              setCreatures((all) => [saved, ...(all ?? []).filter((c) => c.id !== saved.id)]);
              setCreatureTarget(null);
            }}
          />
        )}
      </Modal>

      <DiceLookModal lookId={diceTarget}onClose={() => setDiceTarget(null)} />

      <Modal open={pickingEncounterMap} title={t("library.chooseEncounterMap")} onClose={() => setPickingEncounterMap(false)}>
        {/* Only the GM's own maps: a template keeps its map by library id (ADR 0024). */}
        <LibraryPicker kind="map" includeBuiltins={false} onPick={(map) => void newEncounterOn(map)} />
      </Modal>
      <LibraryMapEditor
        asset={gridTarget}
        importDiagnostics={gridTarget?.id === importResult?.assetId ? importResult?.diagnostics : undefined}
        onSaved={(saved) => { replace(saved); setGridTarget(saved); }}
        onClose={(saved) => {
          setGridTarget(null);
          setEncounterMapAwaitingGrid(null);
          if (encounterMapAwaitingGrid === saved.id && saved.grid) void newEncounterOn(saved);
        }}
      />
    </main>
    </>
  );
}

/** A built-in asset: the same card, without Rename or Delete (builtin-library-assets). */
function BuiltinCard({ asset }: { asset: LibraryAsset }) {
  return (
    <li className="asset-card">
      <div className={asset.kind === "token" ? "asset-thumb token" : "asset-thumb"}>
        {asset.kind === "map" ? (
          <MapThumbnail url={asset.url} width={asset.width} height={asset.height} grid={asset.grid} />
        ) : (
          <img src={asset.url} alt="" loading="lazy" decoding="async" />
        )}
      </div>
      <strong className="asset-name" title={assetDisplayName(asset)}>
        {assetDisplayName(asset)}
      </strong>
      <span className="muted asset-meta">
        {asset.width}×{asset.height}
        {asset.grid && t("library.gridMeta", { cell: asset.grid.cellSize })}
      </span>
    </li>
  );
}

function UploadButton(props: {
  kind: AssetKind;
  onUploaded: (asset: LibraryAsset, diagnostics?: UvttIssue[]) => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    props.onError(null);
    try {
      if (props.kind === "map" && /\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) {
        const result = await api.library.importUvtt(file);
        props.onUploaded(result.asset, result.diagnostics);
        return;
      }
      const { width, height } = await imageSize(file);
      props.onUploaded(await api.library.upload(file, { kind: props.kind, name: nameFromFile(file), width, height }));
    } catch (err) {
      props.onError(err instanceof Error ? err.message : t("common.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
    <label className="upload-button">
      <span>{busy ? t("common.uploading") : props.kind === "map" ? t("library.uploadMap") : t("library.uploadTokenArt")}</span>
      <input
        type="file"
        className="sr-only"
        accept={props.kind === "map" ? MAP_ACCEPT : IMAGE_ACCEPT}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Token art is framed first (token-art-cropper); maps and other types upload as they are.
          if (file && props.kind === "token" && isCroppable(file)) setCropFile(file);
          else void onFile(file);
          e.target.value = "";
        }}
      />
    </label>
    {cropFile && <TokenArtCropper file={cropFile} onCancel={() => setCropFile(null)} onConfirm={(f) => { setCropFile(null); void onFile(f); }} />}
    </>
  );
}

type DeleteState =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "confirm"; rooms: { id: string; name: string }[]; creatures: { id: string; name: string }[]; encounters: { id: string; name: string }[] }
  | { step: "deleting" };

function AssetCard(props: {
  asset: LibraryAsset;
  onChanged: (asset: LibraryAsset) => void;
  onEditGrid: () => void;
  onDeleted: () => void;
}) {
  const { asset } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(asset.name);
  const [del, setDel] = useState<DeleteState>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function rename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === asset.name) return setEditing(false);
    try {
      props.onChanged(await api.library.update(asset.id, { name: trimmed }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.renameFailed"));
    }
  }

  async function startDelete() {
    setError(null);
    setDel({ step: "checking" });
    try {
      // Ask the server who uses it now, so the warning is never stale (asset-library).
      const { rooms, creatures, encounters } = await api.library.usage(asset.id);
      setDel({ step: "confirm", rooms, creatures, encounters });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("library.usageCheckFailed"));
      setDel({ step: "idle" });
    }
  }

  async function confirmDelete() {
    setDel({ step: "deleting" });
    try {
      await api.library.remove(asset.id);
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.deleteFailed"));
      setDel({ step: "idle" });
    }
  }

  const standIn = asset.kind === "map" ? t("library.standIn.map") : t("library.standIn.token");

  return (
    <li className="asset-card">
      <div className={asset.kind === "token" ? "asset-thumb token" : "asset-thumb"}>
        {asset.kind === "map" ? (
          <MapThumbnail url={asset.url} width={asset.width} height={asset.height} grid={asset.grid} />
        ) : (
          <img src={asset.url} alt="" loading="lazy" decoding="async" />
        )}
      </div>
      {editing ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <input aria-label={t("common.name")} value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="small primary">
            {t("common.save")}
          </button>
        </form>
      ) : (
        <strong className="asset-name" title={assetDisplayName(asset)}>
          {assetDisplayName(asset)}
        </strong>
      )}
      <span className="muted asset-meta">
        {asset.width}×{asset.height}
        {asset.grid && t("library.gridMeta", { cell: asset.grid.cellSize })}
      </span>
      {error && <p role="alert" className="error">{error}</p>}

      {del.step === "confirm" ? (
        <div className="confirm" role="alertdialog" aria-label={t("common.deleteNamedQ", { name: assetDisplayName(asset) })}>
          {del.rooms.length > 0 && (
            <p>
              {t("library.usedInRooms", { count: del.rooms.length })}{" "}
              <strong>{del.rooms.map((r) => r.name || t("common.untitledRoom")).join(t("library.listSeparator"))}</strong>{t("library.roomsStandIn", { standIn })}
            </p>
          )}
          {del.creatures.length > 0 && (
            <p>
              {t("library.usedByCreatures", { count: del.creatures.length })}{" "}
              <strong>{del.creatures.map((c) => c.name).join(t("library.listSeparator"))}</strong>{t("library.creaturesLoseImage", { count: del.creatures.length })}
            </p>
          )}
          {del.encounters.length > 0 && (
            <p>
              {t("library.usedByEncounters", { count: del.encounters.length })}{" "}
              <strong>{del.encounters.map((e) => e.name).join(t("library.listSeparator"))}</strong>{t("library.encountersUnusable", { count: del.encounters.length })}
            </p>
          )}
          {del.rooms.length === 0 && del.creatures.length === 0 && del.encounters.length === 0 && <p>{t("library.deleteUnused", { name: assetDisplayName(asset) })}</p>}
          <div className="row">
            <button type="button" className="secondary small" onClick={() => setDel({ step: "idle" })}>
              {t("common.cancel")}
            </button>
            <button type="button" className="small danger-fill" onClick={() => void confirmDelete()}>
              {t("common.delete")}
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          <IconAction icon={editing ? <X size={16} aria-hidden="true" /> : <TextAa size={16} aria-hidden="true" />} label={editing ? t("common.cancel") : t("common.rename")} onClick={() => setEditing(!editing)} />
          {asset.kind === "map" && <IconAction icon={<GridFour size={16} aria-hidden="true" />} label={t("library.editGrid")} onClick={props.onEditGrid} />}
          <IconAction
            icon={<Trash size={16} aria-hidden="true" />}
            label={del.step === "checking" ? t("common.checking") : del.step === "deleting" ? t("common.deleting") : t("common.delete")}
            danger
            disabled={del.step !== "idle"}
            onClick={() => void startDelete()}
          />
        </div>
      )}
    </li>
  );
}
