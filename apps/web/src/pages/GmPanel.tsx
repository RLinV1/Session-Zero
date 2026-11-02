import { GridActionsContext } from "./GridActionsContext";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sameValue, inactiveLabel, pendingDepartures, undoableAction, type Command, type MapTokenPolicy, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { libraryAssetId } from "../net/builtinAssets";
import { useAccount } from "../account/accountStore";
import { imageSize, nameFromFile } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { CheckpointsPanel } from "../panels/CheckpointsPanel";
import { EncounterPanel } from "../panels/EncounterPanel";
import { EffectsPanel } from "../panels/EffectsPanel";
import { PanelSection } from "../ui/PanelSection";
import { gridsEqual, parseGridDraft, withGridSuggestion, type GridDraft } from "./gridDraft";
import { GridForm } from "./GridForm";
import { HudLayout } from "./mapEditor/HudLayout";
import { LibraryPicker } from "./LibraryPicker";
import { useGridPreparation, type GridDetection } from "./useGridPreparation";
import { GridPreparation } from "./mapEditor/GridPreparation";
import { FogSetup } from "./mapEditor/FogSetup";
import { SightSetup } from "./mapEditor/SightSetup";
import { WallSetup } from "./mapEditor/WallSetup";
import { draftConnection } from "./mapEditor/draftConnection";
import { draftDirty, draftFrom, planDraftSave, type MapDraft } from "./mapEditor/mapDraft";
import { adjustedMessage, offersTokenPolicy, prepCommand, prepDirty, startPrep, startUvttPrep, TOKEN_POLICY_CHOICES, type MapPrep } from "./mapPrep";
import { FULL_ROOM, type RoomFeatures } from "./encounterEdit/roomFeatures";
import { EditorGuide, GuideStepContext } from "./mapEditor/EditorGuide";

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

/** The GM's administration section: departed players to resolve, map and grid setup, fog, then checkpoints. */
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
        hasLibrary={hasLibrary}
        onError={setError}
        onSetMap={(command, report) => runWith(report)(connection.command(command))}
        onImport={(importId, revision, tokenPolicy, report) => runWith(report)(connection.command({ type: "scene.importUVTT", importId, revision, ...(tokenPolicy ? { tokenPolicy } : {}) }))}
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
        grid={(close, detection) => (
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
            onApply={async (grid) => { await onGridApply(grid); }}
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
          <CheckpointsPanel connection={connection} state={state} token={token} />
          <EncounterPanel connection={connection} state={state} />
          <EffectsPanel connection={connection} state={state} />
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
    <PanelSection id="departed-players" title="Departed players">
      <ul className="plain departed-list">
        {pending.map(({ participant, tokenIds }) => (
          <li key={participant.id} className="departed-row">
            <span>
              <strong>{participant.displayName}</strong>
              <span className="muted"> {inactiveLabel(participant)}, {tokenIds.length} {tokenIds.length === 1 ? "token" : "tokens"} to decide</span>
            </span>
            <button type="button" className="small secondary" onClick={() => onReview(participant.id)}>
              Review
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
  return { ...rest, lineOfSight: draft.lineOfSight, ...(draft.sightRange !== null && { sightRange: draft.sightRange }) };
}

type EditorStep = "map" | "grid" | "walls" | "fog" | "sight";
/** Unsaved work the editor asks about, and where it goes once the GM answers (map-section-step-buttons). */
type PendingKind = "map" | "grid" | "draft";
type Pending = { kind: PendingKind; then: EditorStep | "close" };
const PENDING_TEXT: Record<PendingKind, { title: string; body: string; save: string }> = {
  map: { title: "Apply this map?", body: "This map is still a draft only you can see. Apply it with its grid, or discard it? The table keeps its current map until you apply.", save: "Apply map" },
  grid: { title: "Apply grid changes?", body: "You changed this map's grid. Apply it for the table, or discard your changes?", save: "Apply grid" },
  draft: { title: "Save changes?", body: "You changed this map's walls, fog or sight. Save them for the table, or discard them?", save: "Save" },
};
const STEPS: { key: EditorStep; label: string }[] = [
  { key: "map", label: "1 · Map" },
  { key: "grid", label: "2 · Grid" },
  { key: "walls", label: "3 · Walls" },
  { key: "fog", label: "4 · Fog" },
  { key: "sight", label: "5 · Sight" },
];
/** Encounter templates inherit walls from their map; only grid and fog are editable here. */
const FIXED_MAP_STEPS: { key: EditorStep; label: string }[] = [
  { key: "grid", label: "1 · Grid" },
  { key: "fog", label: "2 · Fog" },
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
  grid: (close: () => void, detection: GridDetection) => ReactNode;
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
  const editorSession = useMemo(() => ({ open: editorOpen, mapUrl: liveMapUrl }), [editorOpen, liveMapUrl, editorGeneration, props.roomId, props.connection]);
  const currentSession = useRef(editorSession);
  currentSession.current = editorSession;
  useEffect(() => {
    if (!editorOpen || !liveMapUrl) return setDraft(null);
    setDraft((current) => (current?.mapUrl === liveMapUrl ? current : draftFrom(props.room)));
    // Only opening the editor or a new map restarts the draft; room updates must not overwrite it.
  }, [editorOpen, liveMapUrl]);
  const draftEdits = useMemo(
    () => draftConnection(
      props.connection,
      (change) => setDraft((current) => (current && currentSession.current === editorSession && current.mapUrl === editorSession.mapUrl ? change(current) : current)),
      (mapUrl) => api.walls.detected(props.roomId, props.token, mapUrl),
      editorSession.mapUrl ?? "",
      { width: props.room.scene.map?.width ?? 0, height: props.room.scene.map?.height ?? 0 },
      () => currentSession.current === editorSession && editorSession.open,
    ),
    [props.connection, props.roomId, props.token, editorSession],
  );
  const draftState: RoomState = draft ? { ...props.room, walls: draft.walls, fog: draft.fog, scene: draftScene(props.room.scene, draft) } : props.room;
  const unsaved = draft !== null && draftDirty(props.room, draft);
  /** Sends the draft's difference, one command at a time; stops at the first refusal. */
  const saveDraft = async (): Promise<boolean> => {
    if (!draft || saving) return false;
    setSaving(true);
    setSaveError(null);
    try {
      for (const command of planDraftSave(props.room, draft)) {
        if (currentSession.current !== editorSession) return false;
        const result = await props.connection.command(command);
        if (currentSession.current !== editorSession) return false;
        if (!result.ok) {
          setSaveError(result.message);
          return false;
        }
      }
      const saved = props.connection.snapshot?.state;
      if (saved?.scene.map?.url === draft.mapUrl) {
        setDraft((current) => current === draft && currentSession.current === editorSession ? draftFrom(saved) : current);
      }
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save the map draft.");
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
      const next = change({ mapUrl: current.map.url, walls: current.walls ?? {}, fog: {}, lineOfSight: false, sightRange: null });
      return { ...current, walls: next.walls };
    }),
    async () => { throw new Error("UVTT geometry is already supplied."); },
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
    if (prep && (from === "map" || from === "grid") && (to === "walls" || to === "fog" || to === "sight")) return "map";
    if (from === "grid" && to !== "grid" && gridDirty) return "grid";
    if ((from === "walls" || from === "fog" || from === "sight") && to !== from && unsaved) return "draft";
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
    if (kind === "map" && prep && !prepCommand(prep)) return "Fix the grid in the Grid step before applying the map.";
    if (kind === "grid" && editedGrid === null) return "Fix the grid in the Grid step before applying it.";
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
        : pending.kind === "grid" ? editedGrid !== null && await props.onGridApply(editedGrid)
        : await saveDraft();
      if (ok) finishPending(pending.then);
      else if (pending.kind === "grid") setPendingError(props.gridError ?? "Couldn't apply the grid.");
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
      setPrepError("Fix the grid before applying the map.");
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
        setChangedMapUrl(askPolicy ? prep.map.url : null); setUndoError(null); discardPrep();
        setStep("walls");
      }
      return applied;
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : "Could not apply the map. Your draft has been kept.");
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
    } catch (err) { setPrepError(err instanceof Error ? err.message : "Export failed."); }
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
    if (/\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) { setEditorOpen(true); if (!prep) setStep("map"); }
    setBusy(true);
    const generation = ++prepGeneration.current;
    try {
      if (/\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) {
        const result = props.hasLibrary && saveToLibrary
          ? await api.uvtt.prepare(props.roomId, props.token, file, { saveToLibrary: true })
          : await api.uvtt.prepare(props.roomId, props.token, file);
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
      setPrep(startPrep({ url, width, height, ...(asset && { assetId: asset.id }) }, undefined, props.currentGrid));
      setStep("grid");
      // An upload from the Manage tab opens the editor to line up its grid.
      setEditorOpen(true);
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // A library map starts its draft from its saved grid; Apply copies it into the room in the
  // same event (ADR 0004), and later library edits never reach back into this room.
  const place = async (asset: LibraryAsset) => {
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: libraryAssetId(asset) };
    prepGeneration.current++;
    const next = startPrep(map, asset.grid, props.currentGrid);
    if (editorOpen || !asset.grid) {
      setPicking(false);
      setPickError(null);
      setPrep(next);
      setStep("grid");
      setEditorOpen(true);
      return;
    }
    // From the Manage tab: the library map already has its grid, so it goes straight to the table.
    const command = prepCommand(next);
    if (!command) return setPickError("This map's saved grid isn't valid. Upload it, or fix it in your library.");
    if (await props.onSetMap(command, setPickError)) {
      setPicking(false);
    }
  };

  const [gridActionSlot, setGridActionSlot] = useState<HTMLElement | null>(null);
  const shown = prep?.map ?? props.map;
  const steps = props.fixedMap ? FIXED_MAP_STEPS : STEPS;
  return (
    <PanelSection id="gm-map" title="Battle map">
      <div className="stack">
        <p className="muted">
          {props.map
            ? `${props.map.width} × ${props.map.height} px${props.fixedMap ? "" : ` · ${props.wallCount} ${props.wallCount === 1 ? "wall" : "walls"}`}`
            : "No map yet."}
        </p>
        {props.map ? (
          // Opens the editor on its first step (Grid for a fixed map, ADR 0033); its tabs reach the others.
          <div className="row button-row" data-tour="gm-grid">
            <button ref={editMapRef} type="button" className="secondary small" onClick={(e) => {
              e.currentTarget.focus();
              setStep(steps[0]!.key);
              setEditorOpen(true);
            }}>
              Edit map
            </button>
          </div>
        ) : props.fixedMap ? null : (
          <div className="row button-row" data-tour="gm-grid">
            <label className="upload-button">
              <span>{busy ? "Uploading…" : "Upload map"}</span>
              <input
                ref={emptyUploadRef}
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt"
                disabled={busy}
                aria-label="Upload battle map"
                onChange={(e) => {
                  void onChange(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {props.hasLibrary && (
              <button type="button" className="secondary" disabled={busy} onClick={() => setPicking(true)}>
                From library
              </button>
            )}
          </div>
        )}
        {prepError && !editorOpen && <p role="alert" className="error">{prepError}</p>}
      </div>
      <Modal
        open={editorOpen}
        title="Edit map"
        className={`map-editor${waiting ? " is-preparing" : ""}`}
        onClose={requestClose}
        closeLabel={waiting ? "Set up manually" : "Close"}
        onAfterClose={() => (editMapRef.current ?? emptyUploadRef.current)?.focus()}
        headerContent={!waiting && (
          <nav className="map-editor-steps" role="tablist" aria-label="Map setup steps">
            {steps.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={step === key}
                className="map-editor-step"
                onClick={() => requestStep(key)}
              >
                {label}
              </button>
            ))}
            <span ref={setGridActionSlot} hidden={step !== "grid"} style={{ marginLeft: "auto" }} />
            {prep && step !== "grid" && <span className="map-editor-draft">Draft map: only you see it until Apply map</span>}
            {!prep && unsaved && (
              <span className="map-editor-unsaved">
                <span className="map-editor-draft">Unsaved changes: only you see them</span>
                <button type="button" className="secondary small" disabled={saving} onClick={discardDraft}>Discard</button>
                <button type="button" className="small primary" disabled={saving} onClick={() => void saveDraft()}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </span>
            )}
            {saveError && <span role="alert" className="error map-editor-save-error">{saveError}</span>}
          </nav>
        )}
      >
        {waiting ? <GridPreparation label={preparation.label} onSkip={preparation.skip} /> : <div className="map-editor-shell">
          {prep?.uvtt && prep.uvtt.diagnostics.length > 0 && <details className="uvtt-diagnostics"><summary>{prep.uvtt.diagnostics.length} import warnings</summary><ul>{prep.uvtt.diagnostics.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul></details>}
          <div className="map-editor-body" role="tabpanel">
            <GridActionsContext.Provider value={gridActionSlot}>
            <GuideStepContext.Provider value={step}>
            {step === "map" && (
              <div className="map-editor-split">
                <div className="map-editor-stage">
                  <div className="map-editor-guide-slot"><EditorGuide step="map" /></div>
                  {shown?.url ? <img className="map-editor-thumb" src={shown.url} alt="The current battle map" /> : <p className="map-editor-empty">No map yet. Upload one, or choose one from your library.</p>}
                </div>
                <aside className="map-editor-hud" aria-label="Map">
                  <h3 className="map-editor-heading">Battle map</h3>
                  <p className="muted">Upload a map image, or place one from your library. It stays private until you apply it with its grid.</p>
                  {props.hasLibrary && (
                    <label className="inline" data-guide="map-save-library">
                      <input type="checkbox" checked={saveToLibrary} disabled={busy} onChange={(e) => setSaveToLibrary(e.target.checked)} />
                      <span>Also save uploads to my library</span>
                    </label>
                  )}
                  {props.hasLibrary && saveToLibrary && <p className="muted">Uploads are saved to your library immediately. Grid and wall edits here affect this room's draft.</p>}
                  <label className="upload-button">
                    <span>{busy ? "Uploading…" : "Upload map"}</span>
                    <input
                      ref={uploadRef}
                      type="file"
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt"
                      disabled={busy}
                      aria-label="Upload battle map"
                      onChange={(e) => {
                        void onChange(e.target.files?.[0]);
                        // Cleared, so picking the same file again (after cancelling its draft) still fires.
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button type="button" className="secondary" data-guide="map-export" disabled={!props.map || exporting} onClick={() => void exportMap()}>{exporting ? "Exporting…" : "Export applied map (UVTT)"}</button>
                  <p className="muted small-print">UVTT files: up to 40 MiB. Preview and edit geometry in Walls before Apply.</p>
                  {Object.values(props.room.walls).some((w) => w.portal) && <p className="muted small-print">Export preserves open/closed state. UVTT does not carry door/window identity or locks.</p>}
                  {props.hasLibrary && (
                    <button type="button" className="secondary" data-guide="map-library" disabled={busy} onClick={() => setPicking(true)}>
                      From library
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
                  submitLabel="Apply map"
                  cancelLabel="Close"
                  busyLabel="Applying map…"
                  allowUnchanged
                />
              </HudLayout>
            ) : props.map ? (
              <HudLayout className="map-editor-grid">
{props.grid(() => props.onGridClose(), detection)}</HudLayout>
            ) : (
              <p className="map-editor-empty">Choose a map in the Map step first.</p>
            ))}
            {step === "walls" && (importedState ? <div className="map-editor-import">
              <WallSetup key={prep?.uvtt?.id} connection={importEdits} state={importedState} token={props.token} detection={false} initialMode="select" />
              <div className="map-editor-import-apply"><button type="button" className="primary" disabled={applyingMap} onClick={requestApply}>{applyingMap ? "Applying map…" : "Apply map"}</button>{prepError && <p role="alert" className="error">{prepError}</p>}</div>
            </div> : prep ? <p className="map-editor-empty">Apply this map before setting up its walls.</p> : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.walls(draftEdits, draftState)}</Fragment>)}
            {step === "fog" && (prep
              ? <p className="map-editor-empty">Apply the draft map in the Grid step first, then set up its fog here.</p>
              : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.fog(draftEdits, draftState)}</Fragment>)}
            {step === "sight" && (prep
              ? <p className="map-editor-empty">Apply a map before setting up sight.</p>
              : !props.map ? <p className="map-editor-empty">Apply a map before setting up sight.</p>
              : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.sight(draftEdits, draftState)}</Fragment>)}
            </GuideStepContext.Provider>
            </GridActionsContext.Provider>
          </div>
        </div>}
      </Modal>
      <Modal open={askingPolicy} title="Tokens already on the table" onClose={() => { setAskingPolicy(false); setAfterPolicy(null); }} initialFocus={applyRef}>
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
              <span>{choice.label} <span className="muted">{choice.hint}</span></span>
            </label>
          ))}
          <div className="row button-row">
            <button type="submit" className="primary" ref={applyRef}>Apply map</button>
            <button type="button" className="secondary" onClick={() => { setAskingPolicy(false); setAfterPolicy(null); }}>Cancel</button>
          </div>
        </form>
      </Modal>
      {props.hasLibrary && (
        <Modal
          open={picking}
          title="Choose a map"
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
                setUndoError(err instanceof Error ? err.message : "Could not undo the map change. Try again.");
              } finally { setUndoPending(false); }
            }}>
              {undoPending ? "Undoing…" : "Undo"}
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
          <Modal open={pending !== null} title={text.title} onClose={() => !pendingSaving && setPending(null)}>
            <div className="stack">
              <p>{text.body}</p>
              {blocked && <p className="muted">{blocked}</p>}
              {error && <p role="alert" className="error">{error}</p>}
              <div className="row button-row">
                <button type="button" className="primary" disabled={pendingSaving || blocked !== null} onClick={() => void savePending()}>
                  {pendingSaving ? "Saving…" : text.save}
                </button>
                <button type="button" className="secondary" disabled={pendingSaving} onClick={discardPending}>Discard</button>
                <button type="button" className="secondary" disabled={pendingSaving} onClick={() => setPending(null)}>Keep editing</button>
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
            setError(err instanceof Error ? err.message : "Could not save the grid");
            setStatus("idle");
          }
        }}
      >
        {status === "saving" ? "Saving…" : "Save grid to library"}
      </button>
      {status === "saved" && <p className="muted" role="status">Saved. Future placements of this map use this grid.</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
