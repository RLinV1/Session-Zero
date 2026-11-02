import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_GRID, emptyRoomState, normalizeLegacyGridForBoard, type LibraryAsset, type LibraryMapBoard, type UvttIssue } from "@vtt/shared";
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
import { WallSetup } from "./WallSetup";
import type { MapDraft } from "./mapDraft";
import { boardChanged, boardFromDraft, draftFromBoard } from "./libraryBoardDraft";

type Step = "grid" | "walls" | "fog";
const STEPS: { key: Step; label: string }[] = [
  { key: "grid", label: "1 · Grid" },
  { key: "walls", label: "2 · Walls" },
  { key: "fog", label: "3 · Fog" },
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
    api.library.board(asset.id).then(
      (board) => { if (live) { setStored(board); setDraft(draftFromBoard(asset.url, board)); } },
      (err: unknown) => { if (live) setLoadError(err instanceof Error ? err.message : "Could not load this map's walls and fog"); },
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
    walls: draft.walls, fog: draft.fog,
  } : null, [asset, draft, parsedGrid, savedAsset.grid]);

  const discard = () => {
    suggestionSession.blocked = true;
    setGridDraft(toGridDraft(normalizeLegacyGridForBoard(savedAsset.grid ?? DEFAULT_GRID, asset)));
    if (stored) setDraft(draftFromBoard(asset.url, stored));
    setSaveError(null);
  };
  const save = async (): Promise<LibraryAsset | null> => {
    suggestionSession.blocked = true;
    if (busy.current) return null;
    if (!parsedGrid) { setSaveError("Fix the grid before saving your changes."); return null; }
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    let updated = savedAsset;
    try {
      if (gridDirty) {
        updated = await api.library.update(asset.id, { grid: parsedGrid });
        if (!active.current) return null;
        setSavedAsset(updated);
        onSaved(updated);
      }
      if (boardDirty && draft) {
        const board = await api.library.setBoard(asset.id, boardFromDraft(draft));
        if (!active.current) return null;
        setStored(board);
      }
      return updated;
    } catch (err) {
      if (active.current) setSaveError(err instanceof Error ? err.message : "Could not save map changes");
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
    <Modal open title={savedAsset.grid ? "Edit map" : "Set up map"} className={`map-editor${waiting ? " is-preparing" : ""}`} onClose={close}
      closeLabel={waiting ? "Set up manually" : "Close"}
      headerContent={!waiting && <nav className="map-editor-steps" role="tablist" aria-label="Map setup steps">
        {STEPS.map(({ key, label }) => <button key={key} type="button" role="tab" aria-selected={step === key}
          className="map-editor-step" disabled={saving} onClick={() => setStep(key)}>{label}</button>)}
        {dirty && <span className="map-editor-unsaved">
          <span className="map-editor-draft">Unsaved changes: not saved to this map yet</span>
          <button type="button" className="secondary small" disabled={saving} onClick={discard}>Discard</button>
          <button type="button" className="small primary" disabled={saving || !parsedGrid} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</button>
        </span>}
        {saveError && !prompt && <span role="alert" className="error map-editor-save-error">{saveError}</span>}
      </nav>}>
      {waiting ? <GridPreparation label={preparation.label} onSkip={preparation.skip} /> :
      <div className="map-editor-shell"><div className="map-editor-body" role="tabpanel" inert={saving}>
        <GuideStepContext.Provider value={step}>
        {importDiagnostics && <p className="muted">Imported map saved to your library. Review its grid and geometry below.</p>}
        {importDiagnostics && importDiagnostics.length > 0 && <details className="uvtt-diagnostics"><summary>{importDiagnostics.length} import warnings</summary><ul>{importDiagnostics.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul></details>}
        {step === "grid" && <HudLayout className="map-editor-grid"><GridForm
          grid={savedAsset.grid ?? DEFAULT_GRID} map={asset} draft={gridDraft} hasDraft={gridDirty}
          onChange={(next) => { setGridDraft(next); setSaveError(null); }} onCancel={discard}
          onApply={async () => { await save(); }} applying={saving} error={null} hideActions advancedOpen
          detection={detection.status} detectionError={detection.error}
          detectionDenied={detection.accessDenied}
          detectionNotice={setup.preparation.notice} focusCanvas={!savedAsset.grid}
          suggestionSession={suggestionSession}
          onUseSuggestion={(candidate) => setGridDraft(withGridSuggestion(gridDraft, candidate))}
          allowUnchanged={!savedAsset.grid}
        /></HudLayout>}
        {step !== "grid" && loadError && <p role="alert" className="error">{loadError}</p>}
        {step !== "grid" && !loadError && !state && <p className="muted">Loading…</p>}
        {step === "walls" && state && <WallSetup connection={connection} state={state} token="" detection={false} />}
        {step === "fog" && state && <FogSetup connection={connection} state={state} />}
        </GuideStepContext.Provider>
      </div></div>}
    </Modal>
    <Modal open={prompt} title="Save changes?" onClose={() => { if (!busy.current) setPrompt(false); }}>
      <div className="stack">
        <p>This map has changes you haven't saved. Save the grid, walls and fog, or discard them?</p>
        {saveError && <p role="alert" className="error">{saveError}</p>}
        {!parsedGrid && <p className="error">Fix the grid before saving your changes.</p>}
        <div className="row button-row">
          <button type="button" className="primary" disabled={saving || !parsedGrid} onClick={async () => { const saved = await save(); if (saved) onClose(saved); }}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" className="secondary" disabled={saving} onClick={() => onClose(savedAsset)}>Discard</button>
          <button type="button" className="secondary" disabled={saving} onClick={() => setPrompt(false)}>Keep editing</button>
        </div>
      </div>
    </Modal>
  </>;
}
