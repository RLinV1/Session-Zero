import { GridActionsContext } from "./GridActionsContext";
import { ISO_X, projectedBounds } from "../board/mapProjection";
import { buildingsForScene } from "@vtt/shared";
import { BuildingSetup } from "./mapEditor/BuildingSetup";
import { BuildingLayers } from "./mapEditor/BuildingLayers";
import { Fragment, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emptyTerrain, gridGeometryChanged, sameValue, pendingDepartures, undoableAction, type Command, type MapTokenPolicy, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { libraryAssetId } from "../net/builtinAssets";
import { useAccount } from "../account/accountStore";
import { imageSize, nameFromFile } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { ScenesPanel } from "../panels/ScenesPanel";
import { EncounterPanel } from "../panels/EncounterPanel";
import { ScenePreparationContext } from "../panels/ScenePreparationContext";
import { PanelSection } from "../ui/PanelSection";
import { gridsEqual, parseGridDraft, withGridSuggestion, type GridDraft } from "./gridDraft";
import { GridForm } from "./GridForm";
import { HudLayout } from "./mapEditor/HudLayout";
import { LibraryPicker } from "./LibraryPicker";
import { useGridPreparation, type GridDetection } from "./useGridPreparation";
import { GridPreparation } from "./mapEditor/GridPreparation";
import { FogSetup } from "./mapEditor/FogSetup";
import { SightSetup } from "./mapEditor/SightSetup";
import { MapStylePicker } from "./mapEditor/MapStylePicker";
import { TerrainSetup } from "./mapEditor/TerrainSetup";
import { WallSetup } from "./mapEditor/WallSetup";
import { draftConnection } from "./mapEditor/draftConnection";
import { draftDirty, draftFrom, planDraftSave, type MapDraft } from "./mapEditor/mapDraft";
import { adjustedMessage, offersTokenPolicy, prepCommand, prepDirty, startPrep, startUvttPrep, TOKEN_POLICY_CHOICES, type MapPrep } from "./mapPrep";
import { FULL_ROOM, type RoomFeatures } from "./encounterEdit/roomFeatures";
import { EditorGuide, GuideStepContext } from "./mapEditor/EditorGuide";
import { t, type TextId } from "../i18n/locale";
import { inactiveText } from "../i18n/labels";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  token: string;
  gridDraft: GridDraft;
  hasGridDraft: boolean;
  onGridDraftChange: (draft: GridDraft) => void;
  onGridDraftCancel: () => void;
  onGridApply: (grid: GridSpec) => Promise<boolean>;
  gridApplying: boolean;
  gridError: string | null;
  /** Opens the per-token review for a player who left (KAN-58). */
  onReviewDeparture: (participantId: string) => void;
  /** What this room offers; a template being edited offers less (ADR 0033). */
  features?: RoomFeatures;
}

/** The GM's administration section: departed players, map setup, encounter templates and scenes. */
export function GmPanel({
  connection, state, token, onReviewDeparture,
  gridDraft, hasGridDraft, onGridDraftChange, onGridDraftCancel, onGridApply, gridApplying, gridError,
  features = FULL_ROOM,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  // The library belongs to the signed-in account (ADR 0017).
  const hasLibrary = useAccount().status === "signedIn";
  /** Sends a command and reports failure to `report`: the panel, or the open modal. */
  const runWith = (report: (message: string | null) => void) => async (p: Promise<CommandResult>) => {
    const result = await p;
    report(result.ok ? null : result.message);
    return result.ok;
  };

  return (
    <>
      {error && <p role="alert" className="error">{error}</p>}
      {features.tableAdmin && <DepartedPlayers state={state} onReview={onReviewDeparture} />}
      <MapSection
        roomId={state.roomId}
        token={token}
        currentGrid={state.scene.grid}
        sceneId={state.activeSceneId ?? "initial"}
        hasLibrary={hasLibrary}
        onError={setError}
        onSetMap={(command, report) => runWith(report)(connection.command({ ...command, expectedSceneId: state.activeSceneId ?? "initial" }))}
        onImport={(importId, revision, tokenPolicy, report) => runWith(report)(connection.command({ type: "scene.importUVTT", importId, revision, expectedSceneId: state.activeSceneId ?? "initial", ...(tokenPolicy ? { tokenPolicy } : {}) }))}
        onGridClose={onGridDraftCancel}
        gridDraft={gridDraft}
        hasGridDraft={hasGridDraft}
        onGridApply={onGridApply}
        gridError={gridError}
        mapUrl={state.scene.map?.url ?? null}
        map={state.scene.map}
        wallCount={Object.keys(state.walls).length}
        fixedMap={!features.mapAndWalls}
        gridApplying={gridApplying}
        room={state}
        connection={connection}
        walls={(draftConnection, draftState) => <WallSetup connection={draftConnection} state={draftState} token={token} />}
        fog={(draftConnection, draftState) => <FogSetup connection={draftConnection} state={draftState} />}
        sight={(draftConnection, draftState) => <SightSetup connection={draftConnection} state={draftState} />}
        grid={(close, detection, applyGrid) => (
          <GridForm
            key={state.scene.map?.url ?? "no-map"}
            detection={detection.status} detectionError={detection.error} detectionDenied={detection.accessDenied}
            onUseSuggestion={(candidate) => onGridDraftChange(withGridSuggestion(gridDraft, candidate))}
            advancedOpen
            grid={state.scene.grid}
            map={state.scene.map}
            draft={gridDraft}
            hasDraft={hasGridDraft}
            onChange={onGridDraftChange}
            onCancel={close}
            onApply={async (grid) => { await applyGrid(grid); }}
            applying={gridApplying}
            error={gridError}
          >
            {hasLibrary && state.scene.map?.assetId && (
              <SaveGridToLibrary assetId={state.scene.map.assetId} grid={state.scene.grid} />
            )}
          </GridForm>
        )}
      />
      {features.tableAdmin && (
        <>
          <ScenesPanel connection={connection} state={state} />
          <EncounterPanel connection={connection} state={state} />
        </>
      )}
    </>
  );
}

/**
 * Players who left or were removed while still controlling tokens (KAN-58, FR-GM-20, ADR 0006). Derived from state, so
 * "Decide later" survives a reload, and a player drops off once nothing names them.
 */
function DepartedPlayers({ state, onReview }: { state: RoomState; onReview: (participantId: string) => void }) {
  const pending = pendingDepartures(state);
  if (pending.length === 0) return null;
  return (
    <PanelSection id="departed-players" title={t("gmMap.departed")}>
      <ul className="plain departed-list">
        {pending.map(({ participant, tokenIds }) => (
          <li key={participant.id} className="departed-row">
            <span>
              <strong>{participant.displayName}</strong>
              <span className="muted"> {t("gmMap.toDecide", { status: inactiveText(participant), n: tokenIds.length })}</span>
            </span>
            <button type="button" className="small secondary" onClick={() => onReview(participant.id)}>
              {t("gmMap.review")}
            </button>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}

/** The room's scene with the draft's sight settings, for steps that show the draft. */
function draftScene(scene: RoomState["scene"], draft: MapDraft): RoomState["scene"] {
  const { sightRange: _drop, ...rest } = scene;
  return { ...rest, lineOfSight: draft.lineOfSight, isometric: draft.isometric,
    ...(draft.buildings !== undefined && { isometricBuildings: { mapUrl: draft.mapUrl, items: draft.buildings } }),
    ...(draft.sightRange !== null && { sightRange: draft.sightRange }) };
}

type EditorStep = "map" | "grid" | "walls" | "fog" | "sight" | "terrain" | "buildings";
/** Unsaved work the editor asks about, and where it goes once the GM answers (map-section-step-buttons). */
type PendingKind = "map" | "grid" | "draft";
type Pending = { kind: PendingKind; then: EditorStep | "close" };
const PENDING_TEXT: Record<PendingKind, { title: TextId; body: TextId; save: TextId }> = {
  map: { title: "gmMap.applyMapQ", body: "gmMap.applyMapBody", save: "gmMap.applyMap" },
  grid: { title: "gmMap.applyGridQ", body: "gmMap.applyGridBody", save: "grid.apply" },
  draft: { title: "common.saveChangesQ", body: "gmMap.saveGeometryBody", save: "common.save" },
};
/** The editor's steps, numbered in this order when shown. */
const STEPS: { key: EditorStep; label: TextId }[] = [
  { key: "map", label: "editor.step.map" },
  { key: "grid", label: "editor.step.grid" },
  { key: "walls", label: "editor.step.walls" },
  { key: "fog", label: "editor.step.fog" },
  { key: "sight", label: "editor.step.sight" },
  { key: "terrain", label: "editor.step.terrain" },
];
/** Encounter templates inherit walls from their map; only grid and fog are editable here. */
const FIXED_MAP_STEPS: { key: EditorStep; label: TextId }[] = [
  { key: "grid", label: "editor.step.grid" },
  { key: "fog", label: "editor.step.fog" },
];

/**
 * Battle map setup (map-editor). The Manage tab shows a summary and Edit map, which opens a
 * full-screen editor with its own HUD: Map (upload or library), Grid, and Walls. A new map is
 * prepared privately first (KAN-59): the image and its grid are a draft in this browser until
 * Apply map sends them as one command, so the table never sees a half-aligned scene.
 */
function MapSection(props: {
  roomId: string;
  token: string;
  /** The room's grid, where a map with no saved grid starts its draft. */
  currentGrid: GridSpec;
  sceneId: string;
  hasLibrary: boolean;
  onSetMap: (command: Extract<Command, { type: "scene.setMap" }>, report: (message: string | null) => void) => Promise<boolean>;
  onImport: (id: string, revision: number, policy: MapTokenPolicy | undefined, report: (message: string | null) => void) => Promise<boolean>;
  onError: (message: string | null) => void;
  onGridClose: () => void;
  /** The live map's grid edits, so leaving the Grid step or closing can ask about them. */
  gridDraft: GridDraft;
  hasGridDraft: boolean;
  onGridApply: (grid: GridSpec) => Promise<boolean>;
  gridError: string | null;
  mapUrl: string | null;
  map: MapImage | null;
  wallCount: number;
  /**
   * The map can't be changed and has no walls (a template being edited, ADR 0033): the editor
   * and its openers offer only the Grid and Fog steps.
   */
  fixedMap?: boolean;
  gridApplying: boolean;
  /** The live map's grid form; `close` is called after a successful apply or a cancel. */
  grid: (close: () => void, detection: GridDetection, applyGrid: (grid: GridSpec) => Promise<boolean>) => ReactNode;
  /** The live room and its connection: the walls and fog draft starts from them and saves through them. */
  room: RoomState;
  connection: RoomConnection;
  /** The Walls step, editing the draft through a connection that keeps wall commands in it. */
  walls: (connection: RoomConnection, state: RoomState) => ReactNode;
  /** The Fog step, the same for fog. */
  fog: (connection: RoomConnection, state: RoomState) => ReactNode;
  /** The Sight step, the same for line of sight and sight range. */
  sight: (connection: RoomConnection, state: RoomState) => ReactNode;
}) {
  const preparing = useContext(ScenePreparationContext)?.preparing ?? false;
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [step, setStep] = useState<EditorStep>("map");
  /** The map being prepared, or null. Only this browser has it until Apply. */
  const [prep, setPrep] = useState<MapPrep | null>(null);
  const analysisMap = prep?.map ?? props.map;
  const preparation = useGridPreparation({
    source: analysisMap?.assetId ? "library" : "room",
    token: analysisMap?.assetId ? "" : props.token,
    id: analysisMap?.assetId ?? props.roomId,
    map: analysisMap,
    enabled: editorOpen && !!analysisMap && !prep?.uvtt,
    setup: prep,
    update: (change) => setPrep((current) => current && current.suggestionSession === prep?.suggestionSession ? change(current) : current),
  });
  const { detection, waiting } = preparation;
  const [prepError, setPrepError] = useState<string | null>(null);
  const [applyingMap, setApplyingMap] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** What to do with existing tokens (KAN-67); only asked when a map and tokens are there to move. */
  const [policy, setPolicy] = useState<MapTokenPolicy>("scale");
  /** The token-choice dialog is open (token-policy-dialog); Apply map asks here instead of in the Grid step. */
  const [askingPolicy, setAskingPolicy] = useState(false);
  /** Where to go once the token dialog's Apply map succeeds, when the leave-step prompt opened it. */
  const [afterPolicy, setAfterPolicy] = useState<EditorStep | "close" | null>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  /** The map just applied with tokens present, to find its Undo entry and the count it moved. */
  const [changedMapUrl, setChangedMapUrl] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const askPolicy = offersTokenPolicy(props.room);
  const uploadRef = useRef<HTMLInputElement>(null);
  const emptyUploadRef = useRef<HTMLInputElement>(null);
  const editMapRef = useRef<HTMLButtonElement>(null);
  /** Whether a map uploaded here is also kept in the account's library (on by default, ADR 0004). */
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  /** Bumped when a library map is picked, so an upload still in flight can't replace that draft. */
  const prepGeneration = useRef(0);
  /**
   * Walls and fog as the editor shows them: a private draft of the room's, saved with Save changes
   * (map-editor-drafts). Started from the room when the editor opens on a map, or the map changes.
   */
  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Asking about unsaved work before switching steps or closing; null when not asking. */
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingSaving, setPendingSaving] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const liveMapUrl = props.map?.url ?? null;
  const [editorGeneration, setEditorGeneration] = useState(0);
  const editorSession = useMemo(() => ({ open: editorOpen, mapUrl: liveMapUrl, sceneId: props.sceneId }), [editorOpen, liveMapUrl, props.sceneId, editorGeneration, props.roomId, props.connection]);
  const currentSession = useRef(editorSession);
  currentSession.current = editorSession;
  useEffect(() => {
    if (!editorOpen || !liveMapUrl) return setDraft(null);
    setDraft((current) => (current?.mapUrl === liveMapUrl && current.sceneId === props.sceneId ? current : draftFrom(props.room)));
    // Only opening the editor or a new map/scene restarts the draft; room updates must not overwrite it.
  }, [editorOpen, liveMapUrl, props.sceneId]);
  const draftEdits = useMemo(
    () => draftConnection(
      props.connection,
      (change) => setDraft((current) => (current && currentSession.current === editorSession && current.mapUrl === editorSession.mapUrl && current.sceneId === editorSession.sceneId ? change(current) : current)),
      (mapUrl) => api.walls.detected(props.roomId, props.token, mapUrl),
      editorSession.mapUrl ?? "",
      { width: props.room.scene.map?.width ?? 0, height: props.room.scene.map?.height ?? 0 },
      () => currentSession.current === editorSession && editorSession.open,
    ),
    [props.connection, props.roomId, props.token, editorSession],
  );
  const activeDraft = draft?.mapUrl === liveMapUrl && draft.sceneId === props.sceneId ? draft : null;
  const draftState: RoomState = activeDraft ? { ...props.room, walls: activeDraft.walls, fog: activeDraft.fog, terrain: activeDraft.terrain ?? props.room.terrain, scene: draftScene(props.room.scene, activeDraft) } : props.room;
  const applyGrid = async (grid: GridSpec): Promise<boolean> => {
    const geometryChanged = gridGeometryChanged(props.currentGrid, grid);
    if (geometryChanged && draft && !sameValue(draft.terrain ?? emptyTerrain(), props.room.terrain ?? emptyTerrain())) {
      setSaveError(t("gmMap.terrainFirst"));
      return false;
    }
    const applied = await props.onGridApply(grid);
    // Cosmetic edits do not reset or rebase private terrain, including stale drafts.
    if (applied && geometryChanged) {
      const current = props.connection.snapshot?.state;
      if (current?.scene.map?.url === liveMapUrl) setDraft((previous) => previous ? { ...previous, terrain: current.terrain ?? emptyTerrain(), terrainContext: { boardEpoch: current.boardEpoch ?? 0, revision: current.terrainRevision ?? 0 } } : previous);
    }
    return applied;
  };
  const unsaved = activeDraft !== null && draftDirty(props.room, activeDraft);
  /** Submits one bounded preparation: the server validates and appends every edit atomically. */
  const saveDraft = async (): Promise<boolean> => {
    if (!draft || saving) return false;
    const baseline = props.connection.snapshot?.state ?? props.room;
    if (baseline.scene.map?.url !== draft.mapUrl || (baseline.activeSceneId ?? "initial") !== (draft.sceneId ?? props.sceneId)) {
      setSaveError(t("gmMap.changedDraftKept"));
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      for (const command of planDraftSave(baseline, draft)) {
        if (currentSession.current !== editorSession) return false;
        const result = await props.connection.command(command);
        if (currentSession.current !== editorSession) return false;
        if (!result.ok) {
          setSaveError(result.message);
          return false;
        }
      }
      const saved = props.connection.snapshot?.state;
      if (saved?.scene.map?.url === draft.mapUrl && (saved.activeSceneId ?? "initial") === (draft.sceneId ?? props.sceneId)) {
        setDraft((current) => current === draft && currentSession.current === editorSession ? draftFrom(saved) : current);
      }
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("connection.draftSaveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const discardDraft = () => {
    currentSession.current = { ...editorSession };
    setEditorGeneration((generation) => generation + 1);
    setDraft(draftFrom(props.room));
    setSaveError(null);
  };
  const importSession = useMemo(() => ({ id: prep?.uvtt?.id, open: editorOpen }), [prep?.uvtt?.id, editorOpen]);
  const activeImportSession = useRef(importSession); activeImportSession.current = importSession;
  const importEdits = useMemo(() => draftConnection(
    props.connection,
    (change) => setPrep((current) => {
      if (!current?.uvtt || activeImportSession.current !== importSession) return current;
      const next = change({ mapUrl: current.map.url, walls: current.walls ?? {}, fog: {}, lineOfSight: false, isometric: false, sightRange: null });
      return { ...current, walls: next.walls };
    }),
    async () => { throw new Error(t("gmMap.uvttSupplied")); },
    prep?.map.url ?? "", { width: prep?.map.width ?? 0, height: prep?.map.height ?? 0 },
    () => activeImportSession.current === importSession && importSession.open,
  ), [props.connection, prep?.map.url, prep?.map.width, prep?.map.height, importSession]);
  const importedState: RoomState | null = prep?.uvtt ? { ...props.room, scene: { ...props.room.scene, map: prep.map, grid: parseGridDraft(prep.draft, prep.map) ?? prep.initial }, walls: prep.walls ?? {}, fog: {} } : null;
  const discardPrep = () => {
    if (prep?.suggestionSession) prep.suggestionSession.blocked = true;
    prepGeneration.current++;
    if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
    setPrep(null);
    setPrepError(null);
  };
  const closeEditor = () => {
    currentSession.current = { ...editorSession, open: false };
    discardPrep();
    setPending(null);
    setSaveError(null);
    setEditorOpen(false);
    props.onGridClose();
  };
  /** The live map's grid as edited, or null when it doesn't parse. */
  const editedGrid = props.map ? parseGridDraft(props.gridDraft, props.map) : null;
  /** Grid edits to the live map that differ from its grid (a draft map's grid belongs to `prep`). */
  const gridDirty = !prep && props.map !== null && props.hasGridDraft && (editedGrid === null || !gridsEqual(editedGrid, props.currentGrid));
  /**
   * What leaving `from` for `to` would lose. A UVTT draft also spans Walls for private geometry
   * edits; Fog needs the applied map. Live Walls and Fog share one draft.
   */
  const pendingFor = (from: EditorStep, to: EditorStep | "close"): PendingKind | null => {
    if (to === "close") {
      if (prep && prepDirty(prep)) return "map";
      if (gridDirty) return "grid";
      return unsaved ? "draft" : null;
    }
    if (prep?.uvtt) return to === "fog" || to === "sight" ? "map" : null;
    if (prep && (from === "map" || from === "grid") && (to === "walls" || to === "fog" || to === "sight" || to === "terrain")) return "map";
    if (from === "grid" && to !== "grid" && gridDirty) return "grid";
    if ((from === "walls" || from === "fog" || from === "sight" || from === "terrain" || from === "buildings") && to !== from && unsaved) return "draft";
    return null;
  };
  const busyNow = applyingMap || props.gridApplying || saving || pendingSaving;
  const ask = (then: EditorStep | "close") => {
    if (then === "close" && prep?.suggestionSession) prep.suggestionSession.blocked = true;
    const kind = pendingFor(step, then);
    if (!kind) return false;
    setPendingError(null);
    setPending({ kind, then });
    return true;
  };
  /** A step tab the GM chose: asks first when the current step has unsaved work. */
  const requestStep = (to: EditorStep) => {
    if (busyNow || to === step) return;
    if (!ask(to)) setStep(to);
  };
  /** Every way out of the editor comes here: unsaved work asks first. */
  const requestClose = () => {
    if (waiting) return preparation.skip();
    if (busyNow) return;
    if (!ask("close")) closeEditor();
  };
  const finishPending = (then: EditorStep | "close") => {
    setPending(null);
    setPendingError(null);
    if (then === "close") closeEditor();
    else setStep(then);
  };
  /** Why Save can't run for this kind of change, or null when it can. */
  const pendingBlocked = (kind: PendingKind): string | null => {
    if (kind === "map" && prep && !prepCommand(prep)) return t("gmMap.fixGridStepMap");
    if (kind === "grid" && editedGrid === null) return t("gmMap.fixGridStep");
    return null;
  };
  const savePending = async () => {
    if (!pending || pendingSaving || pendingBlocked(pending.kind)) return;
    // Tokens on the table: the token dialog asks first, then carries on where the GM was going.
    if (pending.kind === "map" && askPolicy) {
      setAfterPolicy(pending.then);
      setPending(null);
      requestApply();
      return;
    }
    setPendingSaving(true);
    setPendingError(null);
    try {
      const ok = pending.kind === "map" ? await applyPrep()
        : pending.kind === "grid" ? editedGrid !== null && await applyGrid(editedGrid)
        : await saveDraft();
      if (ok) finishPending(pending.then);
      else if (pending.kind === "grid") setPendingError(props.gridError ?? t("gmMap.applyGridFailed"));
    } finally {
      setPendingSaving(false);
    }
  };
  const discardPending = () => {
    if (!pending || pendingSaving) return;
    if (pending.kind === "map") discardPrep();
    else if (pending.kind === "grid") props.onGridClose();
    else discardDraft();
    finishPending(pending.then);
  };
  /** Apply map: ask what to do with the tokens first when there are some to move. */
  const requestApply = () => {
    if (!askPolicy) return void applyPrep();
    setPolicy("scale");
    setAskingPolicy(true);
  };
  const applyPrep = async (choice: MapTokenPolicy = "scale"): Promise<boolean> => {
    if (prep?.suggestionSession) prep.suggestionSession.blocked = true;
    if (!prep || applyingMap) return false;
    const grid = parseGridDraft(prep.draft, prep.map);
    if (!grid) {
      setPrepError(t("gmMap.fixGridMap"));
      return false;
    }
    setApplyingMap(true); setPrepError(null);
    try {
      let applied = false;
      if (prep.uvtt) {
        let revision = prep.uvtt.revision;
        const walls = Object.values(prep.walls ?? {}).map(({ id: _id, ...wall }) => wall);
        // Avoid revising an unchanged draft on retry: a successful Apply may have lost its ack.
        if (!sameValue(grid, prep.validated?.grid) || !sameValue(walls, prep.validated?.walls)) {
          const saved = await api.uvtt.revise(props.roomId, props.token, prep.uvtt.id, { revision, grid, walls });
          revision = saved.revision;
          setPrep((now) => now?.uvtt?.id === saved.id ? { ...now, uvtt: { ...now.uvtt, revision }, walls: Object.fromEntries(saved.walls.map((w, i) => [`draft:${i}`, { ...w, id: `draft:${i}` }])), validated: { grid: saved.grid, walls: saved.walls } } : now);
        }
        applied = await props.onImport(prep.uvtt.id, revision, askPolicy ? choice : undefined, setPrepError);
      } else {
        const command = prepCommand(prep, askPolicy ? choice : undefined);
        if (command) applied = await props.onSetMap(command, setPrepError);
      }
      if (applied) {
        const current = props.connection.snapshot?.state;
        const isometric = prep.isometric ?? false;
        if (current && (current.scene.map?.url !== prep.map.url || (current.activeSceneId ?? "initial") !== props.sceneId)) {
          const message = t("gmMap.changedDuringApply");
          setPrepError(message); setPendingError(message);
          return false;
        }
        // Save view and buildings together, bound to the map just applied; retain the draft on refusal.
        const baseline = current ?? { ...props.room, scene: { ...props.room.scene, map: prep.map, grid } };
        const nextDraft = { ...draftFrom(baseline), mapUrl: prep.map.url, sceneId: props.sceneId, isometric, ...(prep.buildings && { buildings: prep.buildings }) };
        setDraft(nextDraft);
        let viewSaved = true;
        try {
          for (const command of planDraftSave(baseline, nextDraft)) {
            const result = await props.connection.command(command);
            if (!result.ok) { setSaveError(result.message); viewSaved = false; break; }
          }
        } catch {
          setSaveError(t("gmMap.retryViewSave"));
          viewSaved = false;
        }
        setChangedMapUrl(askPolicy ? prep.map.url : null); setUndoError(null); discardPrep();
        setStep("walls");
        if (!viewSaved) {
          setPending((current) => current?.kind === "map" ? { ...current, kind: "draft" } : current);
          setPendingError(t("gmMap.viewSavePending"));
          return false;
        }
      }
      return applied;
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : t("gmMap.applyMapFailed"));
      return false;
    } finally { setApplyingMap(false); }
  };
  const exportMap = async () => {
    setExporting(true); setPrepError(null);
    try {
      const blob = await api.uvtt.export(props.roomId, props.token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "map.uvtt";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setPrepError(err instanceof Error ? err.message : t("gmMap.exportFailed")); }
    finally { setExporting(false); }
  };
  // A grid being edited belongs to the map it was edited for.
  const previousMap = useRef(props.mapUrl);
  useEffect(() => {
    if (previousMap.current !== props.mapUrl) {
      previousMap.current = props.mapUrl;
      props.onGridClose();
    }
  }, [props.mapUrl, props.onGridClose]);

  async function onChange(file: File | undefined) {
    if (!file) return;
    // Capture before image decoding/upload: room updates must not rebase this preparation.
    const terrainContext = { boardEpoch: props.room.boardEpoch ?? 0, revision: props.room.terrainRevision ?? 0 };
    if (/\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) { setEditorOpen(true); if (!prep) setStep("map"); }
    setBusy(true);
    const generation = ++prepGeneration.current;
    try {
      if (/\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) {
        const result = await api.uvtt.prepare(props.roomId, props.token, file, { saveToLibrary: props.hasLibrary && saveToLibrary, sceneId: props.sceneId });
        if (generation !== prepGeneration.current) { await api.uvtt.discard(props.roomId, props.token, result.id); return; }
        if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
        setPrep(startUvttPrep(result)); setPrepError(null); setStep("grid"); setEditorOpen(true); return;
      }
      // Read the size first: a map upload carries it so the server can analyze it (grid-detection).
      const { width, height } = await imageSize(file);
      // Saved to the library, the map is a library row the room links to, so it can be reused and
      // saved in encounters; otherwise it is a direct upload that only this room knows.
      const asset = props.hasLibrary && saveToLibrary
        ? await api.library.upload(file, { kind: "map", name: nameFromFile(file), width, height })
        : null;
      const { url } = asset ?? (await api.upload(file, props.token, { width, height }));
      // Another map was chosen meanwhile: keep that draft and its grid edits.
      if (generation !== prepGeneration.current) return;
      // Nothing is sent yet: the upload becomes a private draft (KAN-59).
      props.onError(null);
      if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
      setPrep(startPrep({ url, width, height, ...(asset && { assetId: asset.id }) }, undefined, props.currentGrid, terrainContext));
      setStep("grid");
      // An upload from the Manage tab opens the editor to line up its grid.
      setEditorOpen(true);
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : t("common.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  // A library map starts its draft from its saved grid; Apply copies it into the room in the
  // same event (ADR 0004), and later library edits never reach back into this room.
  const place = async (asset: LibraryAsset) => {
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: libraryAssetId(asset) };
    prepGeneration.current++;
    const next = startPrep(map, asset.grid, props.currentGrid, { boardEpoch: props.room.boardEpoch ?? 0, revision: props.room.terrainRevision ?? 0 });
    if (editorOpen || !asset.grid || !props.map) {
      setPicking(false);
      setPickError(null);
      setPrep(next);
      setStep("grid");
      setEditorOpen(true);
      return;
    }
    // From the Manage tab: the library map already has its grid, so it goes straight to the table.
    const command = prepCommand(next);
    if (!command) return setPickError(t("gmMap.savedGridInvalid"));
    if (await props.onSetMap(command, setPickError)) {
      setPicking(false);
    }
  };

  const [gridActionSlot, setGridActionSlot] = useState<HTMLElement | null>(null);
  const shown = prep?.map ?? props.map;
  const isometric = prep ? prep.isometric ?? false : draftState.scene.isometric ?? false;
  const setupGrid = prep ? parseGridDraft(prep.draft, prep.map) ?? prep.initial : props.currentGrid;
  const editorBuildings = prep ? prep.buildings ?? [] : buildingsForScene(draftState.scene);
  const elevation = isometric ? Math.max(0, ...editorBuildings.map((building) => building.height * setupGrid.cellSize)) : 0;
  const mapBounds = shown ? projectedBounds(shown.width, shown.height, isometric, elevation) : null;
  const steps: { key: EditorStep; label: TextId }[] = props.fixedMap ? FIXED_MAP_STEPS : isometric ? [...STEPS, { key: "buildings", label: "editor.step.buildings" }] : STEPS;
  return (
    <PanelSection id="gm-map" title={t("gmMap.battleMap")}>
      <div className="stack">
        <p className="muted">
          {props.map
            ? props.fixedMap ? t("gmMap.summary", { w: props.map.width, h: props.map.height }) : t("gmMap.summaryWalls", { w: props.map.width, h: props.map.height, n: props.wallCount })
            : t("gmMap.noMap")}
        </p>
        {props.map ? (
          // Opens the editor on its first step (Grid for a fixed map, ADR 0033); its tabs reach the others.
          <div className="row button-row" data-tour="gm-grid">
            <button ref={editMapRef} type="button" className="secondary small" onClick={(e) => {
              e.currentTarget.focus();
              setStep(steps[0]!.key);
              setEditorOpen(true);
            }}>
              {t("editor.title.edit")}
            </button>
          </div>
        ) : props.fixedMap ? null : (
          <div className="row button-row" data-tour="gm-grid">
            <label className="upload-button">
              <span>{busy ? t("common.uploading") : t("library.uploadMap")}</span>
              <input
                ref={emptyUploadRef}
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt"
                disabled={busy}
                aria-label={t("gmMap.upload")}
                onChange={(e) => {
                  void onChange(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {props.hasLibrary && (
              <button type="button" className="secondary" disabled={busy} onClick={() => setPicking(true)}>
                {t("guide.map.library.title")}
              </button>
            )}
          </div>
        )}
        {prepError && !editorOpen && <p role="alert" className="error">{prepError}</p>}
      </div>
      <Modal
        open={editorOpen}
        title={t("editor.title.edit")}
        className={`map-editor${waiting ? " is-preparing" : ""}`}
        onClose={requestClose}
        closeLabel={waiting ? t("editor.setUpManually") : t("common.close")}
        onAfterClose={() => (editMapRef.current ?? emptyUploadRef.current)?.focus()}
        headerContent={!waiting && (
          <nav className="map-editor-steps" role="tablist" aria-label={t("editor.steps")}>
            {steps.map(({ key, label }, i) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={step === key}
                className="map-editor-step"
                onClick={() => requestStep(key)}
              >
                {t("editor.stepLabel", { n: i + 1, name: t(label) })}
              </button>
            ))}
            <span ref={setGridActionSlot} hidden={step !== "grid"} style={{ marginLeft: "auto" }} />
            {prep && step !== "grid" && <span className="map-editor-draft">{t("gmMap.draftNote")}</span>}
            {prep && prepError && step !== "grid" && <span role="alert" className="error map-editor-save-error">{prepError}</span>}
            {prep && step === "buildings" && <button type="button" className="primary small" disabled={applyingMap} onClick={requestApply}>{applyingMap ? t("gmMap.applyingMap") : t("gmMap.applyMap")}</button>}
            {!prep && unsaved && (
              <span className="map-editor-unsaved">
                <span className="map-editor-draft">{t("grid.unsaved")}</span>
                <button type="button" className="secondary small" disabled={saving} onClick={discardDraft}>{t("common.discard")}</button>
                <button type="button" className="small primary" disabled={saving} onClick={() => void saveDraft()}>
                  {saving ? t("common.saving") : t("common.saveChanges")}
                </button>
              </span>
            )}
            {saveError && <span role="alert" className="error map-editor-save-error">{saveError}</span>}
          </nav>
        )}
      >
        {waiting ? <GridPreparation label={preparation.label} onSkip={preparation.skip} /> : <div className="map-editor-shell">
          {prep?.uvtt && prep.uvtt.diagnostics.length > 0 && <details className="uvtt-diagnostics"><summary>{t("editor.importWarnings", { n: prep.uvtt.diagnostics.length })}</summary><ul>{prep.uvtt.diagnostics.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul></details>}
          <div className="map-editor-body" role="tabpanel">
            <GridActionsContext.Provider value={gridActionSlot}>
            <GuideStepContext.Provider value={step}>
            {step === "map" && (
              <div className="map-editor-split">
                <div className="map-editor-stage">
                  <div className="map-editor-guide-slot"><EditorGuide step="map" /></div>
                  {shown?.url && mapBounds ? <svg className="map-editor-thumb" width="100%" height="100%" role="img" aria-label={t("gmMap.currentAlt")}
                      viewBox={`${mapBounds.x} ${mapBounds.y} ${mapBounds.width} ${mapBounds.height}`}>
                      <g transform={isometric ? `matrix(${ISO_X} 0.5 ${-ISO_X} 0.5 0 0)` : undefined}>
                        <image href={shown.url} width={shown.width} height={shown.height} />
                        {isometric && <BuildingLayers map={shown} buildings={editorBuildings} cellSize={setupGrid.cellSize} />}
                      </g>
                    </svg> : <p className="map-editor-empty">{t("gmMap.noMapHint")}</p>}
                </div>
                <aside className="map-editor-hud" aria-label={t("editor.step.map")}>
                  <h3 className="map-editor-heading">{t("gmMap.battleMap")}</h3>
                  <MapStylePicker isometric={isometric}
                    disabled={busy || (!prep && !draft)}
                    onChange={(isometric) => {
                      if (prep) setPrep((current) => current ? { ...current, isometric } : current);
                      else setDraft((current) => current ? { ...current, isometric } : current);
                    }} />
                  {isometric && shown && <button type="button" className="secondary" onClick={() => requestStep("buildings")}>{t("buildings.editHeights")}</button>}
                  <p className="muted">{t("gmMap.uploadHint")}</p>
                  {props.hasLibrary && (
                    <label className="inline" data-guide="map-save-library">
                      <input type="checkbox" checked={saveToLibrary} disabled={busy} onChange={(e) => setSaveToLibrary(e.target.checked)} />
                      <span>{t("gmMap.alsoSave")}</span>
                    </label>
                  )}
                  {props.hasLibrary && saveToLibrary && <p className="muted">{t("gmMap.savedImmediately")}</p>}
                  <label className="upload-button">
                    <span>{busy ? t("common.uploading") : t("library.uploadMap")}</span>
                    <input
                      ref={uploadRef}
                      type="file"
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt"
                      disabled={busy}
                      aria-label={t("gmMap.upload")}
                      onChange={(e) => {
                        void onChange(e.target.files?.[0]);
                        // Cleared, so picking the same file again (after cancelling its draft) still fires.
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button type="button" className="secondary" data-guide="map-export" disabled={!props.map || exporting || preparing} onClick={() => void exportMap()}>{exporting ? t("gmMap.exporting") : t("gmMap.export")}</button>
                  <p className="muted small-print">{t("gmMap.uvttLimit")}</p>
                  {Object.values(props.room.walls).some((w) => w.portal) && <p className="muted small-print">{t("gmMap.exportNote")}</p>}
                  {props.hasLibrary && (
                    <button type="button" className="secondary" data-guide="map-library" disabled={busy} onClick={() => setPicking(true)}>
                      {t("guide.map.library.title")}
                    </button>
                  )}
                  {prepError && !prep && <p role="alert" className="error">{prepError}</p>}
                </aside>
              </div>
            )}
            {step === "grid" && (prep ? (
              <HudLayout className="map-editor-grid">
                <GridForm
                  key={prep.map.url}
                  detection={detection.status} detectionError={detection.error} detectionDenied={detection.accessDenied}
                  detectionNotice={prep.preparation?.notice} focusCanvas={!prep.uvtt && !prep.gridConfigured} advancedOpen
                  onUseSuggestion={(candidate) => setPrep((now) => now && now.suggestionSession === prep.suggestionSession
                    ? { ...now, draft: withGridSuggestion(now.draft, candidate) } : now)}
                  suggestionSession={prep.suggestionSession}
                  grid={prep.initial}
                  map={prep.map}
                  draft={prep.draft}
                  hasDraft={prepDirty(prep)}
                  onChange={(draft) => setPrep((now) => (now ? { ...now, draft } : now))}
                  onCancel={requestClose}
                  onApply={async () => { requestApply(); }}
                  applying={applyingMap}
                  error={prepError}
                  submitLabel={t("gmMap.applyMap")}
                  cancelLabel={t("common.close")}
                  busyLabel={t("gmMap.applyingMap")}
                  allowUnchanged
                >
                  <MapStylePicker isometric={prep.isometric ?? false} disabled={applyingMap}
                    onChange={(isometric) => setPrep((current) => current ? { ...current, isometric } : current)} />
                  {prep.isometric && <button type="button" className="secondary" onClick={() => requestStep("buildings")}>{t("buildings.outlineAndHeight")}</button>}
                  {prep.map.assetId && <label className="checkbox">
                    <input type="checkbox" checked={prep.resetTerrain ?? false} onChange={(e) => setPrep((now) => now ? { ...now, resetTerrain: e.target.checked } : now)} />
                    <span>{t("gmMap.resetTerrain")}</span>
                  </label>}
                </GridForm>
              </HudLayout>
            ) : props.map ? (
              <HudLayout className="map-editor-grid">
{props.grid(() => props.onGridClose(), detection, applyGrid)}</HudLayout>
            ) : (
              <p className="map-editor-empty">{t("gmMap.chooseFirst")}</p>
            ))}
            {step === "walls" && (importedState ? <div className="map-editor-import">
              <WallSetup key={prep?.uvtt?.id} connection={importEdits} state={importedState} token={props.token} detection={false} initialMode="select" />
              <div className="map-editor-import-apply"><button type="button" className="primary" disabled={applyingMap} onClick={requestApply}>{applyingMap ? t("gmMap.applyingMap") : t("gmMap.applyMap")}</button>{prepError && <p role="alert" className="error">{prepError}</p>}</div>
            </div> : prep ? <p className="map-editor-empty">{t("gmMap.applyBeforeWalls")}</p> : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.walls(draftEdits, draftState)}</Fragment>)}
            {step === "fog" && (prep
              ? <p className="map-editor-empty">{t("gmMap.applyBeforeFog")}</p>
              : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.fog(draftEdits, draftState)}</Fragment>)}
            {step === "terrain" && (prep ? <p className="map-editor-empty">{t("gmMap.applyBeforeTerrain")}</p> : <TerrainSetup key={`${editorGeneration}:${liveMapUrl}`} connection={draftEdits} state={draftState} />)}
            {step === "buildings" && isometric && shown && <BuildingSetup key={`${editorGeneration}:${shown.url}`}
              map={shown} grid={setupGrid} buildings={editorBuildings} onChange={(buildings) => {
                if (prep) setPrep((current) => current ? { ...current, buildings } : current);
                else setDraft((current) => current ? { ...current, buildings } : current);
              }} />}
        {step === "sight" && (prep
              ? <p className="map-editor-empty">{t("sight.needsMap")}</p>
              : !props.map ? <p className="map-editor-empty">{t("sight.needsMap")}</p>
              : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.sight(draftEdits, draftState)}</Fragment>)}
            </GuideStepContext.Provider>
            </GridActionsContext.Provider>
          </div>
        </div>}
      </Modal>
      <Modal open={askingPolicy} title={t("gmMap.tokensOnTable")} onClose={() => { setAskingPolicy(false); setAfterPolicy(null); }} initialFocus={applyRef}>
        <form className="stack token-policy" onSubmit={(e) => {
          e.preventDefault();
          setAskingPolicy(false);
          const then = afterPolicy;
          setAfterPolicy(null);
          void applyPrep(policy).then((ok) => { if (ok && then) finishPending(then); });
        }}>
          {TOKEN_POLICY_CHOICES.map((choice) => (
            <label key={choice.value} className="checkbox">
              <input type="radio" name="token-policy" value={choice.value} checked={policy === choice.value} onChange={() => setPolicy(choice.value)} />
              <span>{t(choice.label)} <span className="muted">{t(choice.hint)}</span></span>
            </label>
          ))}
          <div className="row button-row">
            <button type="submit" className="primary" ref={applyRef}>{t("gmMap.applyMap")}</button>
            <button type="button" className="secondary" onClick={() => { setAskingPolicy(false); setAfterPolicy(null); }}>{t("common.cancel")}</button>
          </div>
        </form>
      </Modal>
      {props.hasLibrary && (
        <Modal
          open={picking}
          title={t("stage.chooseMap")}
          onClose={() => {
            setPicking(false);
            setPickError(null);
          }}
        >
          <LibraryPicker kind="map" onPick={(asset) => void place(asset)} />
          {pickError && <p role="alert" className="error">{pickError}</p>}
        </Modal>
      )}
      {changedMapUrl && (() => {
        // The newest action, if it is this map change and can still be undone.
        const latest = props.room.undo.at(-1);
        const first = latest?.events[0];
        const entry = latest && first?.type === "MapSet" && first.map?.url === changedMapUrl
          ? undoableAction(props.room.undo, latest.commandId)
          : undefined;
        const message = first?.type === "MapSet" ? adjustedMessage(first.tokenChanges?.length ?? 0) : null;
        if (!message || !entry) return null;
        return (
          <div className="row" role="status">
            <span>{message}</span>
            <button type="button" className="small secondary" disabled={undoPending} onClick={async () => {
              if (undoPending) return;
              setUndoError(null); setUndoPending(true);
              try {
                const result = await props.connection.command({ type: "history.undo", commandId: entry.commandId });
                if (result.ok) setChangedMapUrl(null);
                else setUndoError(result.message);
              } catch (err) {
                setUndoError(err instanceof Error ? err.message : t("gmMap.undoFailed"));
              } finally { setUndoPending(false); }
            }}>
              {undoPending ? t("gmMap.undoing") : t("home.facts.undo")}
            </button>
            {undoError && <span role="alert" className="error">{undoError}</span>}
          </div>
        );
      })()}
      {/* One prompt for leaving a step and for closing: Save, Discard or Keep editing (map-section-step-buttons). */}
      {(() => {
        const text = PENDING_TEXT[pending?.kind ?? "draft"];
        const blocked = pending ? pendingBlocked(pending.kind) : null;
        const error = pendingError ?? (pending?.kind === "map" ? prepError : pending?.kind === "draft" ? saveError : null);
        return (
          <Modal open={pending !== null} title={t(text.title)} onClose={() => !pendingSaving && setPending(null)}>
            <div className="stack">
              <p>{t(text.body)}</p>
              {blocked && <p className="muted">{blocked}</p>}
              {error && <p role="alert" className="error">{error}</p>}
              <div className="row button-row">
                <button type="button" className="primary" disabled={pendingSaving || blocked !== null} onClick={() => void savePending()}>
                  {pendingSaving ? t("common.saving") : t(text.save)}
                </button>
                <button type="button" className="secondary" disabled={pendingSaving} onClick={discardPending}>{t("common.discard")}</button>
                {pending?.kind === "draft" && pending.then === "grid" && <button type="button" className="secondary" disabled={pendingSaving} onClick={() => finishPending("grid")}>{t("gmMap.keepDraft")}</button>}
                <button type="button" className="secondary" disabled={pendingSaving} onClick={() => setPending(null)}>{t("common.keepEditing")}</button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </PanelSection>
  );
}

/** Explicitly writes the room's current grid back to the library map it came from. */
function SaveGridToLibrary({ assetId, grid }: { assetId: string; grid: GridSpec }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setStatus("idle");
    setError(null);
  }, [assetId, grid]);
  return (
    <div className="stack">
      <button
        type="button"
        className="secondary"
        disabled={status === "saving"}
        onClick={async () => {
          setStatus("saving");
          setError(null);
          try {
            await api.library.update(assetId, { grid });
            setStatus("saved");
          } catch (err) {
            setError(err instanceof Error ? err.message : t("gmMap.saveGridFailed"));
            setStatus("idle");
          }
        }}
      >
        {status === "saving" ? t("common.saving") : t("gmMap.saveGridToLibrary")}
      </button>
      {status === "saved" && <p className="muted" role="status">{t("gmMap.gridSaved")}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
