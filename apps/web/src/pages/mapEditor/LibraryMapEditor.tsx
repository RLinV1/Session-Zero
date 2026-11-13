import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_GRID, emptyRoomState, emptyTerrain, gridGeometryChanged, normalizeLegacyGridForBoard, type LibraryAsset, type LibraryMapBoard, type UvttIssue } from "@vtt/shared";
import { api } from "../../net/api";
import { Modal } from "../../ui/Modal";
import { GridForm } from "../GridForm";
import { gridsEqual, newGridPreparation, newGridSuggestionSession, parseGridDraft, toGridDraft, withGridSuggestion } from "../gridDraft";
import { useGridPreparation } from "../useGridPreparation";
import { GridPreparation } from "./GridPreparation";
import { createDraftConnection } from "./draftConnection";
import { FogSetup } from "./FogSetup";
import { GuideStepContext } from "./EditorGuide";
import { HudLayout } from "./HudLayout";
import { TerrainSetup } from "./TerrainSetup";
import { WallSetup } from "./WallSetup";
import type { MapDraft } from "./mapDraft";
import { boardChanged, boardFromDraft, draftFromBoard } from "./libraryBoardDraft";
import { t, type TextId } from "../../i18n/locale";

type Step = "grid" | "walls" | "fog" | "terrain";
const STEPS: { key: Step; label: TextId }[] = [
  { key: "grid", label: "editor.step.grid" },
  { key: "walls", label: "editor.step.walls" },
  { key: "fog", label: "editor.step.fog" },
  { key: "terrain", label: "editor.step.terrain" },
];
interface Props {
  asset: LibraryAsset | null;
  importDiagnostics?: UvttIssue[];
  onSaved: (asset: LibraryAsset) => void;
  onClose: (asset: LibraryAsset) => void;
}

/** One private draft spans all three tabs. Only explicit Save writes to the library. */
export function LibraryMapEditor({ asset, importDiagnostics, onSaved, onClose }: Props) {
  return asset ? <MapSession key={`${asset.id}:${asset.url}`} asset={asset} importDiagnostics={importDiagnostics} onSaved={onSaved} onClose={onClose} /> : null;
}

function MapSession({ asset, importDiagnostics, onSaved, onClose }: Omit<Props, "asset"> & { asset: LibraryAsset }) {
  const [step, setStep] = useState<Step>("grid");
  const [savedAsset, setSavedAsset] = useState(asset);
  const [setup, setSetup] = useState(() => ({
    draft: toGridDraft(normalizeLegacyGridForBoard(asset.grid ?? DEFAULT_GRID, asset)),
    preparation: newGridPreparation(!asset.grid), suggestionSession: newGridSuggestionSession(),
  }));
  const gridDraft = setup.draft;
  const setGridDraft = (draft: typeof gridDraft) => setSetup((current) => ({ ...current, draft }));
  const [revision, setRevision] = useState<string | null>(null);
  const [resetTerrain, setResetTerrain] = useState(false);
  const [stored, setStored] = useState<LibraryMapBoard | null>(null);
  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  const suggestionSession = setup.suggestionSession;
  const preparation = useGridPreparation({
    source: "library", token: "", id: asset.id, map: asset, enabled: true, setup, update: setSetup,
  });
  const { detection, waiting } = preparation;
  useEffect(() => {
    active.current = true;
    let live = true;
    api.library.preparation(asset.id).then(
      (preparation) => { if (live) { setRevision(preparation.revision); setStored(preparation.board); setDraft(draftFromBoard(asset.url, preparation.board)); if (preparation.grid) { setSavedAsset({ ...asset, grid: preparation.grid }); setGridDraft(toGridDraft(normalizeLegacyGridForBoard(preparation.grid, asset))); } } },
      (err: unknown) => { if (live) setLoadError(err instanceof Error ? err.message : t("editor.loadFailed")); },
    );
    return () => { live = false; active.current = false; };
  }, [asset.id, asset.url]);

  const parsedGrid = useMemo(() => parseGridDraft(gridDraft, asset), [gridDraft, asset]);
  const gridDirty = !savedAsset.grid || parsedGrid === null || !gridsEqual(parsedGrid, savedAsset.grid);
  const boardDirty = draft !== null && stored !== null && boardChanged(draft, stored);
  const dirty = gridDirty || boardDirty;
  const connection = useMemo(() => createDraftConnection(
    (change) => setDraft((current) => current ? change(current) : current),
    () => ({ width: asset.width, height: asset.height }),
  ), [asset.width, asset.height]);
  const state = useMemo(() => draft ? {
    ...emptyRoomState("library"),
    scene: { map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, grid: parsedGrid ?? savedAsset.grid ?? DEFAULT_GRID },
    walls: draft.walls, fog: draft.fog, terrain: draft.terrain ?? emptyTerrain(),
  } : null, [asset, draft, parsedGrid, savedAsset.grid]);

  const applyGridDraft = (next: typeof gridDraft) => {
    const parsed = parseGridDraft(next, asset);
    if (parsed && gridGeometryChanged(parsed, parsedGrid ?? savedAsset.grid ?? DEFAULT_GRID) && (draft?.terrain?.base.length || (stored?.terrain?.length && !resetTerrain))) {
      if (!window.confirm(t("editor.resetTerrainConfirm"))) return;
      setResetTerrain(true); setDraft((current) => current ? { ...current, terrain: emptyTerrain() } : current);
    }
    setGridDraft(next); setSaveError(null);
  };
  const discard = () => {
    suggestionSession.blocked = true;
    setGridDraft(toGridDraft(normalizeLegacyGridForBoard(savedAsset.grid ?? DEFAULT_GRID, asset)));
    if (stored) setDraft(draftFromBoard(asset.url, stored));
    setSaveError(null); setResetTerrain(false);
  };
  const save = async (): Promise<LibraryAsset | null> => {
    suggestionSession.blocked = true;
    if (busy.current) return null;
    if (!parsedGrid) { setSaveError(t("editor.fixGrid")); return null; }
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    let updated = savedAsset;
    try {
      if (!draft || !revision) { setSaveError(t("editor.waitPreparation")); return null; }
      const preparation = await api.library.savePreparation(asset.id, { grid: parsedGrid, board: boardFromDraft(draft), revision, resetTerrain });
      if (!active.current) return null;
      updated = { ...savedAsset, grid: preparation.grid };
      setRevision(preparation.revision); setStored(preparation.board); setSavedAsset(updated); setResetTerrain(false); onSaved(updated);
      return updated;
    } catch (err) {
      if (active.current) setSaveError(err instanceof Error ? err.message : t("editor.saveFailed"));
      return null;
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  };
  const close = () => {
    if (waiting) return preparation.skip();
    suggestionSession.blocked = true;
    if (busy.current) return;
    if (dirty) setPrompt(true);
    else onClose(savedAsset);
  };

  return <>
    <Modal open title={savedAsset.grid ? t("editor.title.edit") : t("editor.title.setUp")} className={`map-editor${waiting ? " is-preparing" : ""}`} onClose={close}
      closeLabel={waiting ? t("editor.setUpManually") : t("common.close")}
      headerContent={!waiting && <nav className="map-editor-steps" role="tablist" aria-label={t("editor.steps")}>
        {STEPS.map(({ key, label }, i) => <button key={key} type="button" role="tab" aria-selected={step === key}
          className="map-editor-step" disabled={saving} onClick={() => setStep(key)}>{t("editor.stepLabel", { n: i + 1, name: t(label) })}</button>)}
        {dirty && <span className="map-editor-unsaved">
          <span className="map-editor-draft">{t("editor.unsaved")}</span>
          <button type="button" className="secondary small" disabled={saving} onClick={discard}>{t("common.discard")}</button>
          <button type="button" className="small primary" disabled={saving || !parsedGrid || !revision} onClick={() => void save()}>{saving ? t("common.saving") : t("common.saveChanges")}</button>
        </span>}
        {saveError && !prompt && <span role="alert" className="error map-editor-save-error">{saveError}</span>}
      </nav>}>
      {loadError && <p role="alert" className="error">{loadError}</p>}
      {waiting ? <GridPreparation label={preparation.label} onSkip={preparation.skip} /> :
      <div className="map-editor-shell"><div className="map-editor-body" role="tabpanel" inert={saving || !revision}>
        <GuideStepContext.Provider value={step}>
        {importDiagnostics && <p className="muted">{t("editor.imported")}</p>}
        {importDiagnostics && importDiagnostics.length > 0 && <details className="uvtt-diagnostics"><summary>{t("editor.importWarnings", { n: importDiagnostics.length })}</summary><ul>{importDiagnostics.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul></details>}
        {step === "grid" && <HudLayout className="map-editor-grid"><GridForm
          grid={savedAsset.grid ?? DEFAULT_GRID} map={asset} draft={gridDraft} hasDraft={gridDirty}
          onChange={applyGridDraft} onCancel={discard}
          onApply={async () => { await save(); }} applying={saving} error={null} hideActions advancedOpen
          detection={detection.status} detectionError={detection.error}
          detectionDenied={detection.accessDenied}
          detectionNotice={setup.preparation.notice} focusCanvas={!savedAsset.grid}
          suggestionSession={suggestionSession}
          onUseSuggestion={(candidate) => applyGridDraft(withGridSuggestion(gridDraft, candidate))}
          allowUnchanged={!savedAsset.grid}
        /></HudLayout>}
        {step !== "grid" && !loadError && !state && <p className="muted">{t("common.loading")}</p>}
        {step === "walls" && state && <WallSetup connection={connection} state={state} token="" detection={false} />}
        {step === "fog" && state && <FogSetup connection={connection} state={state} />}
        {step === "terrain" && state && <TerrainSetup connection={connection} state={state} />}
        </GuideStepContext.Provider>
      </div></div>}
    </Modal>
    <Modal open={prompt} title={t("common.saveChangesQ")} onClose={() => { if (!busy.current) setPrompt(false); }}>
      <div className="stack">
        <p>{t("editor.unsavedBody")}</p>
        {saveError && <p role="alert" className="error">{saveError}</p>}
        {!parsedGrid && <p className="error">{t("editor.fixGrid")}</p>}
        <div className="row button-row">
          <button type="button" className="primary" disabled={saving || !parsedGrid || !revision} onClick={async () => { const saved = await save(); if (saved) onClose(saved); }}>{saving ? t("common.saving") : t("common.save")}</button>
          <button type="button" className="secondary" disabled={saving} onClick={() => onClose(savedAsset)}>{t("common.discard")}</button>
          <button type="button" className="secondary" disabled={saving} onClick={() => setPrompt(false)}>{t("common.keepEditing")}</button>
        </div>
      </div>
    </Modal>
  </>;
}
