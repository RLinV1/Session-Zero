import { useEffect, useMemo, useRef, useState } from "react";
import type {
  StudioChatSelectionUpdate, StudioCorrectionHistory, StudioInspection, StudioRestoreInput, StudioRevisionView, StudioSnapshot,
} from "@vtt/shared";
import { StudioSceneMap, type StudioMapInteraction } from "./StudioSceneMap";
import { editLayers, useStudioSelection } from "./StudioSelection";
import { studioChanges, StudioDiffOverlay, type StudioChange } from "./StudioDiff";
import { chatSelectionDetails, type ChatSelectionDetails } from "./chatSelectionDetails";
import { studioT, type StudioLocale, type StudioTextKey } from "./text";

export interface StudioAuthoringClient {
  inspect(mapKey: string, encounterKey: string | null): Promise<StudioInspection>;
  history(mapKey: string): Promise<StudioCorrectionHistory>;
  revision(mapKey: string, revisionId: string): Promise<StudioRevisionView>;
  restore(mapKey: string, input: StudioRestoreInput): Promise<unknown>;
  refresh(): void;
  /** Stages the selection for the user's next chat message; absent when the host can't carry it. */
  attachToChat?(update: StudioChatSelectionUpdate, title: string, details?: ChatSelectionDetails): Promise<{ selectionId: string | null }>;
  ensureMedia?(fileIds: string[]): void;
}

const problems = {
  access: "correction.error.access", conflict: "correction.error.conflict",
  invalid: "correction.error.invalid", missing: "correction.error.missing", permission: "correction.error.permission",
  scope: "correction.error.scope", limit: "correction.error.limit",
} as const;
function actionError(error: unknown) {
  const other = error as { status?: number; code?: string; detail?: { code?: string } } | undefined;
  const code = other?.detail?.code ?? other?.code;
  const known = code ? problems[code as keyof typeof problems] : undefined;
  return { message: known ?? "correction.error.unavailable" as const,
    ambiguous: !other?.status || other.status >= 500 || other.status === 429 };
}

type Tool = "pan" | "region" | "objects";
interface Compared { base: StudioRevisionView | null; result: StudioRevisionView }

function operationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // The same selection controls can run on an HTTP development origin or a sandboxed frame.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function StudioCorrectionWorkspace({ snapshot, media, locale, authoring, disabled }: {
  snapshot: StudioSnapshot;
  media: Readonly<Record<string, string>>;
  locale: StudioLocale;
  authoring: StudioAuthoringClient;
  disabled: boolean;
}) {
  const t = (key: StudioTextKey, params?: Record<string, number | string>) => studioT(locale, key, params);
  const { mapKey, encounterKey, sourceFileId } = snapshot.context;
  const [inspection, setInspection] = useState<StudioInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<StudioTextKey | null>(null);
  const [retryRestore, setRetryRestore] = useState<StudioRestoreInput | null>(null);
  const [history, setHistory] = useState<StudioCorrectionHistory | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyRefresh, bumpHistory] = useState(0);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [autoCompare, setAutoCompare] = useState(true);
  const [comparison, setComparison] = useState<Compared | null>(null);
  const [comparisonError, setComparisonError] = useState(false);
  const [compareRefresh, bumpCompare] = useState(0);
  const [side, setSide] = useState<"base" | "result">("result");
  const [focused, setFocused] = useState<StudioChange | null>(null);
  const mounted = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const adapter = useRef(authoring);
  adapter.current = authoring;

  const chatEnabled = !!authoring.attachToChat;
  const allowed = editLayers.filter((layer) => layer === "geometry" ? snapshot.allowed.walls
    : layer === "terrain" ? snapshot.allowed.terrain : encounterKey !== null);
  const cancel = () => {
    setInspection(null); setFeedback(null);
  };
  const selection = useStudioSelection(inspection, allowed, disabled || busy, cancel);
  const revisionId = snapshot.workingRevisionId;
  const invalidated = !!inspection && (snapshot.workingBindingChanged || (inspection.workingRevisionId ?? undefined) !== revisionId);
  const needsInspection = invalidated || feedback === "correction.error.conflict";
  const chatDraft = chatEnabled && mapKey && inspection && !needsInspection && !disabled && selection.selection
    ? JSON.stringify({ mapKey, encounterKey, inspectedVersion: inspection.inspectedVersion, selection: selection.selection })
    : null;
  const mapName = snapshot.maps.find((map) => map.key === mapKey)?.name ?? "";
  const chatTitle = t("correction.chatTitle", { map: mapName });
  // Derived from the same inspection and selection as chatDraft, so it changes only when the draft does.
  const chatDetails = chatDraft && inspection && mapKey
    ? JSON.stringify(chatSelectionDetails(inspection, selection.selection!, mapName, mapKey, encounterKey)) : null;
  const attachmentView = useRef<{ id: string; sequence: number } | null>(null);
  const [attachment, setAttachment] = useState<{ draft: string; selectionId: string | null } | null>(null);
  const attachFailed = chatDraft !== null && attachment?.draft === chatDraft && attachment.selectionId === null;

  useEffect(() => {
    if (!chatEnabled || (!chatDraft && !attachmentView.current)) return;
    const view = attachmentView.current ??= { id: operationId(), sequence: 0 };
    const draft = chatDraft === null ? null : JSON.parse(chatDraft) as StudioChatSelectionUpdate["draft"];
    const deliver = adapter.current.attachToChat;
    if (!deliver) return;
    let current = true;
    const details = chatDetails === null ? undefined : JSON.parse(chatDetails) as ChatSelectionDetails;
    void deliver({ viewId: view.id, sequence: ++view.sequence, draft }, chatTitle, details).then(({ selectionId }) => {
      if (current && chatDraft !== null) setAttachment({ draft: chatDraft, selectionId });
    }).catch(() => {
      if (!current || chatDraft === null) return;
      setAttachment({ draft: chatDraft, selectionId: null });
      void deliver({ viewId: view.id, sequence: ++view.sequence, draft: null }, "").catch(() => undefined);
    });
    return () => { current = false; };
  }, [chatDraft, chatDetails, chatEnabled, chatTitle]);
  useEffect(() => () => {
    const view = attachmentView.current;
    if (view) void adapter.current.attachToChat?.({ viewId: view.id, sequence: ++view.sequence, draft: null }, "").catch(() => undefined);
  }, []);

  const previouslyEnrolled = useRef(!!revisionId);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (previouslyEnrolled.current && !revisionId) {
      setHistory(null); setComparison(null); setPinned(null); setInspection(null);
      setRequestId(null); setRetryRestore(null); setFocused(null);
    }
    previouslyEnrolled.current = !!revisionId;
  }, [revisionId]);
  useEffect(() => {
    if (!mapKey || !revisionId || disabled || document.hidden) return;
    let cancelled = false;
    void adapter.current.history(mapKey).then((value) => {
      if (!cancelled) { setHistory(value); setHistoryError(false); }
    }).catch(() => { if (!cancelled) setHistoryError(true); });
    return () => { cancelled = true; };
  }, [mapKey, revisionId, snapshot.correctionHistoryVersion, disabled, historyRefresh]);

  const head = history?.workingRevisionId ?? revisionId;
  const revisions = revisionId ? history?.revisions ?? [] : [];
  const requests = revisionId ? history?.requests ?? [] : [];
  const attachedRequest = attachment?.selectionId && requests.find((request) => request.requestId === attachment.selectionId);
  useEffect(() => {
    // The AI started a correction from this selection: leave selection and show its proposal when it arrives.
    if (!inspection || !attachedRequest) return;
    setRequestId(attachedRequest.requestId);
    setInspection(null);
    setFeedback(null);
    setAutoCompare(true);
    setAttachment(null);
  }, [inspection, attachedRequest]);
  const currentProposal = revisions.find((revision) => revision.id === head && revision.requestId && (!requestId || revision.requestId === requestId));
  useEffect(() => {
    if (autoCompare && !inspection && !pinned && currentProposal) setPinned(currentProposal.id);
  }, [autoCompare, inspection, pinned, currentProposal]);

  const selected = revisions.find((r) => r.id === pinned);
  const parent = selected?.parentId ?? null;
  const baseId = revisions.some((r) => r.id === parent) ? parent : null;
  useEffect(() => {
    if (!mapKey || !pinned || disabled || comparison?.result.revision.id === pinned) return;
    let cancelled = false;
    const client = adapter.current;
    void Promise.all([client.revision(mapKey, pinned), baseId ? client.revision(mapKey, baseId) : null]).then(([result, base]) => {
      if (!cancelled) { setComparison({ result, base }); setComparisonError(false); }
    }).catch(() => { if (!cancelled) setComparisonError(true); });
    return () => { cancelled = true; };
  }, [mapKey, pinned, baseId, disabled, compareRefresh, comparison]);

  const compared = comparison?.result.revision.id === pinned ? comparison : null;
  const displayed = inspection?.scene ?? (side === "base" ? compared?.base?.scene : compared?.result.scene) ?? snapshot.scene;
  const mediaIds = [displayed.source?.id, ...displayed.tokens.map((token) => token.imageFileId)].filter((id): id is string => !!id);
  const mediaSignature = [...new Set(mediaIds)].sort().join(",");
  useEffect(() => {
    adapter.current.ensureMedia?.(mediaSignature ? mediaSignature.split(",") : []);
    return () => adapter.current.ensureMedia?.([]);
  }, [mediaSignature]);

  const changes = useMemo(() => compared?.base ? studioChanges(compared.base, compared.result, locale) : [], [compared, locale]);
  function showRevision(id: string | null) {
    cancel(); setAutoCompare(false); setPinned(id); setSide("result"); setFocused(null); setComparisonError(false);
  }
  function refresh() {
    bumpHistory((value) => value + 1);
    adapter.current.refresh();
  }
  /** Loads the exact saved scene to select on, then switches to `tool`. */
  async function startSelection(tool: Tool) {
    if (!mapKey || disabled || busy) return;
    setBusy(true); setFeedback(null);
    try {
      const value = await authoring.inspect(mapKey, encounterKey);
      if (!mounted.current) return;
      if (value.target.encounterKey !== encounterKey || value.scene.source?.id !== sourceFileId || value.drifted) {
        setFeedback("correction.error.conflict"); refresh(); return;
      }
      setInspection(value); setAutoCompare(false); setPinned(null); setSide("result"); setAttachment(null);
      selection.reset(allowed);
      selection.setTool(tool);
      if ((value.workingRevisionId ?? undefined) !== revisionId) refresh();
      root.current?.querySelector<SVGSVGElement>('svg[data-testid="studio-map"]')?.focus({ preventScroll: true });
    } catch (error) {
      if (mounted.current) setFeedback(actionError(error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function chooseTool(tool: Tool) {
    if (inspection && !needsInspection) selection.setTool(tool);
    else if (tool !== "pan") void startSelection(tool);
  }

  async function restore(target?: string, expected = head) {
    if (!mapKey || disabled || busy || (!retryRestore && (!target || !expected))) return;
    const input = retryRestore ?? { revisionId: target!, expectedCurrentRevisionId: expected!, operationId: operationId() };
    setRetryRestore(input); setBusy(true); setFeedback(null);
    try {
      await authoring.restore(mapKey, input);
      if (!mounted.current) return;
      setRetryRestore(null); showRevision(null); setFeedback("correction.restored");
    } catch (error) {
      if (!mounted.current) return;
      const { message, ambiguous } = actionError(error);
      setFeedback(ambiguous ? "correction.restoreUnknown" : message);
      if (!ambiguous) setRetryRestore(null);
    } finally {
      if (mounted.current) { setBusy(false); refresh(); }
    }
  }

  const interaction: StudioMapInteraction | undefined = inspection ? selection.interaction
    : focused?.focus ? { focus: { x: (focused.focus.minX + focused.focus.maxX) / 2, y: (focused.focus.minY + focused.focus.maxY) / 2 } } : undefined;
  const activeTool: Tool = inspection ? selection.draft.tool : "pan";
  const canSelect = chatEnabled && !disabled && !busy && !!snapshot.scene.grid && !snapshot.workingBindingChanged && allowed.length > 0;
  const toolbar = <>
    {chatEnabled && <div className="studio-tools" role="toolbar" aria-label={t("correction.tools")}>
      {(["pan", "region", "objects"] as const).map((tool) => <button key={tool} type="button" className="studio-tool"
        aria-pressed={activeTool === tool} aria-label={t(`correction.tool.${tool}`)} title={t(`correction.toolHint.${tool}`)}
        disabled={tool !== "pan" && !canSelect} onClick={() => chooseTool(tool)}><ToolIcon tool={tool} /></button>)}
      {inspection && selection.draft.region && <button type="button" className="studio-tool" aria-label={t("correction.cancel")}
        title={t("correction.cancel")} disabled={busy} onClick={cancel}><ToolIcon tool="clear" /></button>}
    </div>}
    {!inspection && pinned && <div className="studio-tools" role="group" aria-label={t("correction.comparison")}>
      <button type="button" aria-pressed={side === "base" && !!compared?.base} disabled={!compared?.base} onClick={() => setSide("base")}>{t("correction.before")}</button>
      <button type="button" aria-pressed={side === "result" || !compared?.base} disabled={!compared} onClick={() => setSide("result")}>{t("correction.after")}</button>
    </div>}
  </>;
  return <div className="studio-corrections" ref={root}>
    <StudioSceneMap scene={displayed} locale={locale} media={media} interaction={interaction} reportIssues={displayed === snapshot.scene} toolbar={toolbar}
      drawOverlay={inspection ? selection.drawOverlay : compared?.base ? (px) => <StudioDiffOverlay changes={changes} focused={focused?.id ?? null} px={px} /> : undefined} />
    {chatDraft && <p role="status" className="studio-note">{t(attachFailed ? "correction.chatAttachFailed"
      : attachment?.draft === chatDraft ? "correction.chatAttached" : "correction.chatAttaching")}</p>}
    {needsInspection && <p role="status" className="studio-note">{invalidated && feedback !== "correction.error.conflict" && t("correction.error.conflict")}{" "}
      <button type="button" disabled={busy} onClick={() => void startSelection(activeTool === "pan" ? "region" : activeTool)}>{t("correction.reselect")}</button></p>}
    {displayed !== snapshot.scene && snapshot.workingBindingChanged && <p className="studio-note" role="status">{t("correction.bindingChanged")}</p>}
    {feedback && feedback !== "correction.error.conflict" && <p role={feedback === "correction.restored" ? "status" : "alert"}>{t(feedback)}</p>}
    {retryRestore && <button type="button" disabled={busy || disabled} onClick={() => void restore()}>{t("correction.retryRestore")}</button>}
    {!inspection && revisionId && <div className="studio-correction-history">
      {historyError && <p role="status">{t("correction.historyFailed")}{" "}<button type="button" onClick={refresh}>{t("retry")}</button></p>}
      {revisions.length > 1 && <label>{t("correction.history")}
        <select value={selected?.id ?? ""} onChange={(event) => showRevision(event.currentTarget.value || null)}>
          <option value="">{t("correction.working")}</option>
          {revisions.map((r) => <option key={r.id} value={r.id}>{t(r.requestId ? "correction.proposalOption" : r.restoredFrom ? "correction.restoredOption" : "correction.revisionOption",
            { id: r.id.slice(0, 8), date: new Date(r.at).toLocaleString(locale) })}</option>)}
        </select>
      </label>}
      {pinned && !compared && !comparisonError && <p role="status">{t("correction.loadingComparison")}</p>}
      {comparisonError && <p role="status">{t("correction.comparisonFailed")}{" "}<button type="button" onClick={() => { setComparisonError(false); bumpCompare((value) => value + 1); }}>{t("retry")}</button></p>}
      {compared && <>
        {pinned !== head && <p role="status" className="studio-note">{t("correction.newer")}</p>}
        {!compared.base && <p className="studio-note">{t("correction.noBase")}</p>}
        {compared.base && <section aria-label={t("correction.changes")} className="studio-change-list">
          <h3>{t("correction.changes")}</h3>
          {changes.length ? <ul>{changes.map((change) => <li key={change.id}>
            {change.focus ? <button type="button" aria-pressed={focused?.id === change.id} onClick={() => setFocused(change)}>{change.label}</button> : change.label}
          </li>)}</ul> : <p>{t("correction.noChanges")}</p>}
        </section>}
        {!retryRestore && <div className="studio-action-row">
          {compared.result.revision.requestId && pinned === head && compared.base && <button type="button" disabled={busy || disabled}
            onClick={() => void restore(compared.base!.revision.id, pinned!)}>{t("correction.reject")}</button>}
          {pinned !== head && <button type="button" disabled={busy || disabled} onClick={() => void restore(compared.result.revision.id)}>{t("correction.restore")}</button>}
        </div>}
      </>}
    </div>}
  </div>;
}

/** 24-unit stroke icons for the map tools; the button carries the accessible name. */
function ToolIcon({ tool }: { tool: Tool | "clear" }) {
  const paths = {
    // An open hand, the usual sign for grabbing and panning a canvas.
    pan: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5M14 11.5V5.5a1.5 1.5 0 0 1 3 0v7M17 12.5V8.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.6a6 6 0 0 1-4.5-2l-3.6-4.2a1.6 1.6 0 0 1 2.3-2.2L8 15.9" />,
    // A dashed marquee, the usual sign for rectangle selection.
    region: <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3.2 2.4" />,
    // A pointer arrow clicking one object.
    objects: <><path d="M5 4l13 5.5-5.4 1.6L11 16.5z" /><path d="M13 13l5 5" /></>,
    clear: <path d="M6 6l12 12M18 6L6 18" />,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[tool]}</svg>;
}
