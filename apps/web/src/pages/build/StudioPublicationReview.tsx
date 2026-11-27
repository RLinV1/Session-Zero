import { useEffect, useRef, useState } from "react";
import { formatExpression, StudioPublishCommitInput, type BuildFileView, type BuildPublished, type StudioCandidate, type StudioPublishReviewInput,
  type StudioPublishReview as Review, type StudioScene,
} from "@vtt/shared";
import { useLocale } from "../../i18n/locale";
import { ApiError, api } from "../../net/api";
import { studioOperationId } from "../../studio/StudioCorrectionWorkspace";
import { studioChanges, StudioDiffOverlay } from "../../studio/StudioDiff";
import { StudioSceneMap } from "../../studio/StudioSceneMap";
import { studioT, type StudioTextKey } from "../../studio/text";
import "../../studio/SceneStudio.css";

const publicationKey = (buildId: string) => `vtt-pending-studio-publication:${buildId}`;

export function pendingStudioPublication(buildId: string) {
  try {
    const pending = StudioPublishCommitInput.safeParse(JSON.parse(sessionStorage.getItem(publicationKey(buildId)) ?? "null"));
    return pending.success ? pending.data : null;
  } catch { return null; }
}

function savePendingPublication(buildId: string, input: StudioPublishCommitInput | null) {
  try {
    if (input) sessionStorage.setItem(publicationKey(buildId), JSON.stringify(input));
    else sessionStorage.removeItem(publicationKey(buildId));
  } catch { /* The open dialog can still retry when browser storage is unavailable. */ }
}

function mapScene(map: Review["maps"][number], encounter?: Review["encounters"][number]["data"]): StudioScene {
  const walls = encounter?.walls ?? map.board?.walls ?? [];
  const terrain = encounter?.terrain ?? map.board?.terrain ?? [];
  return {
    source: { id: map.art.identity, kind: "map", name: map.art.name, width: map.art.width, height: map.art.height,
      sizeBytes: 0, privacy: "private", originalSha256: null, canonicalId: null, orientation: null, previewHash: null },
    mapName: map.art.name, encounterName: null, grid: encounter?.grid ?? map.grid, gridStatus: map.grid ? "confirmed" : "none",
    gridBy: null, detection: null, walls: walls.map((wall, index) => ({ ...wall, id: String(index) })), terrain,
    terrainState: terrain.length ? "ready" : "empty", marks: [], issues: [],
    tokens: encounter?.tokens.map((token, index) => ({ index, creatureKey: map.key, name: token.name, size: token.size,
      color: token.color, imageFileId: token.assetId ?? null, hidden: token.hidden, square: null, center: token.position })) ?? [],
  };
}

export function StudioPublicationReview({ buildId, selection, initialCandidate, files, onDone, lockSelection }: {
  buildId: string;
  selection: StudioPublishReviewInput["selection"];
  initialCandidate?: StudioCandidate;
  files: BuildFileView[];
  onDone: (published: BuildPublished) => void;
  lockSelection: (locked: boolean) => void;
}) {
  const locale = useLocale();
  const t = (key: StudioTextKey, params?: Record<string, string | number>) => studioT(locale, key, params);
  const [candidate, pin] = useState(initialCandidate);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewedRequest, setReviewedRequest] = useState("");
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [retry, setRetry] = useState(() => pendingStudioPublication(buildId));
  const publishing = useRef(false);
  const latestRequest = useRef(0);
  const selectionCount = selection.maps.length + selection.creatures.length + selection.encounters.length;
  const request = JSON.stringify({ selection, ...(candidate && { candidate }) } satisfies StudioPublishReviewInput);

  useEffect(() => {
    const generation = ++latestRequest.current;
    if (!selectionCount) return;
    const input = JSON.parse(request) as StudioPublishReviewInput;
    let reading = false;
    let baseline: string | undefined;
    const poll = async () => {
      if (reading || latestRequest.current !== generation || publishing.current) return;
      reading = true;
      try {
        const next = await api.builds.reviewPublication(buildId, input);
        if (latestRequest.current !== generation) return;
        const signature = JSON.stringify(next);
        if (baseline === undefined) {
          baseline = signature;
          setReview(next);
          setReviewedRequest(request);
          setStale(false);
        } else if (baseline !== signature) {
          setStale(true);
        }
      } catch (error) {
        if (latestRequest.current !== generation) return;
        if (baseline !== undefined) setStale(true);
        else setError(error instanceof ApiError ? error.message : studioT(locale, "publishError"));
      } finally {
        reading = false;
      }
    };
    void poll();
    const timer = setInterval(() => { if (!document.hidden) void poll(); }, 5000);
    return () => { latestRequest.current++; clearInterval(timer); };
  }, [buildId, locale, request, reload, selectionCount]);

  function reviewLatest(pinned?: StudioCandidate) {
    setError(null);
    setReviewedRequest("");
    setRetry(null);
    savePendingPublication(buildId, null);
    lockSelection(false);
    pin(pinned);
    setReload((value) => value + 1);
  }

  async function resolveCandidate(view: Review["candidates"][number], action: "restore" | "grid") {
    if (publishing.current || stale || reviewedRequest !== request) return;
    publishing.current = true;
    setBusy(true);
    setError(null);
    const { target, revision } = view.candidate;
    try {
      if (action === "restore") {
        const { revisionId } = await api.studio.restoreRevision(buildId, target.mapKey, {
          revisionId: revision.id, expectedCurrentRevisionId: view.workingRevisionId, operationId: studioOperationId(),
        });
        reviewLatest({ mapKey: target.mapKey, revisionId });
      } else {
        const { revisionId } = await api.builds.confirmPublicationGrid(buildId, { mapKey: target.mapKey, revisionId: revision.id });
        reviewLatest({ mapKey: target.mapKey, revisionId });
      }
    } catch (error) {
      setError(error instanceof ApiError ? error.message : t("publishError"));
      if (error instanceof ApiError && error.status === 409) setStale(true);
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  }

  const canPublish = !!review?.digest && request === reviewedRequest && !stale;
  async function commit() {
    if (publishing.current || (!retry && !canPublish)) return;
    const input = retry ?? { ...JSON.parse(request) as StudioPublishReviewInput, digest: review!.digest!, operationId: studioOperationId() };
    publishing.current = true;
    lockSelection(true);
    savePendingPublication(buildId, input);
    setBusy(true);
    setError(null);
    try {
      const receipt = await api.builds.commitPublication(buildId, input);
      savePendingPublication(buildId, null);
      lockSelection(false);
      onDone(receipt.published);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : t("publishError"));
      if (!(error instanceof ApiError) || error.status >= 500 || error.status === 429 || error.status === 401) setRetry(input);
      else {
        setRetry(null);
        savePendingPublication(buildId, null);
        lockSelection(false);
        if (error.status === 409 && error.detail.code !== "limit") setStale(true);
      }
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  }

  const media = Object.fromEntries(files.map(({ id, url }) => [id, url.startsWith("/api/builds/") ? url + "?variant=preview" : url]));
  return <>
    {selectionCount > 0 && reviewedRequest !== request && !error && <p role="status">{t("publishLoading")}</p>}
    {error && <p role="alert">{error}</p>}
    {selectionCount > 0 && <div className="row">
      {stale && <p role="status">{t("publishChanged")}</p>}
      <button type="button" aria-disabled={busy} onClick={(event) => {
        event.currentTarget.focus();
        if (!publishing.current) reviewLatest();
      }}>{t("publishLatest")}</button>
    </div>}
    {selectionCount > 0 && review && <>
      {review.disclosesOriginals && <p>{t("publishDisclosure")}</p>}
      {review.problems.length > 0 && <ul>{review.problems.map(({ item, message }, index) =>
        <li key={index}>{item} {message}</li>)}</ul>}
      {review.candidates.map((view) => {
        const { candidate, reference } = view;
        const changes = studioChanges(reference, candidate, locale);
        return <section className="scene-studio" data-testid="studio-review-candidate" key={candidate.target.mapKey}>
          <h3>{candidate.scene.mapName}</h3>
          <StudioSceneMap scene={candidate.scene} media={media} locale={locale} reportIssues={false}
            drawOverlay={(px) => <StudioDiffOverlay changes={changes} focused={null} px={px} />} />
          <details><summary>{studioT(locale, "correction.changes")}</summary>
            {changes.length ? <ul>{changes.map((change) => <li key={change.id}>{change.label}</li>)}</ul> : <p>{studioT(locale, "correction.noChanges")}</p>}
          </details>
          {candidate.revision.id !== view.workingRevisionId && <button type="button" aria-disabled={busy || stale}
            onClick={() => void resolveCandidate(view, "restore")}>{t("publishRestore")}</button>}
          {view.confirmGrid && <button type="button" aria-disabled={busy || stale}
            onClick={() => void resolveCandidate(view, "grid")}>{t("publishConfirmGrid")}</button>}
        </section>;
      })}
      {review.maps.filter((map) => !review.candidates.some((view) => view.candidate.target.mapKey === map.key)).map((map) =>
        <details key={map.key} open={review.encounters.length === 0 ? true : undefined}>
          <summary>{map.art.name}</summary>
          <div className="scene-studio"><StudioSceneMap scene={mapScene(map)} media={{ [map.art.identity]: map.art.previewUrl }}
            locale={locale} reportIssues={false} /></div>
        </details>)}
      {review.items.some((item) => item.flags.length > 0) && <p>{t("publishFlags")}</p>}
      <details open={review.candidates.length === 0 ? true : undefined}>
        <summary>{t("publishDependencies")}</summary>
        <ul>{review.items.map((item) => <li key={`${item.kind}/${item.key}`}>
          {item.name} {item.reused && <small>{t("publishReused")}</small>}
          {item.flags.length > 0 && <ul>{item.flags.map((flag, index) => <li key={index}>{flag.field} {flag.message}</li>)}</ul>}
        </li>)}</ul>
        {review.maps.map(({ key, grid, art }) => grid && <p key={key}>{art.name} {t("publishGridValues", {
          cell: grid.cellSize, x: grid.offsetX, y: grid.offsetY, units: grid.unitsPerCell, unit: grid.unitLabel,
        })}</p>)}
        {review.creatures.map(({ key, values, art }) => <div key={key}>
          {art && <img src={art.previewUrl} alt={art.name} width={44} height={44} />}
          <p>{values.name} {t("publishCreatureValues", {
            size: values.size, hp: values.hp ?? "–", maxHp: values.maxHp ?? "–", ac: values.ac ?? "–",
          })}</p>
          {!!values.conditions.length && <p>{values.conditions.join(", ")}</p>}
          {!!values.attacks.length && <ul>{values.attacks.map((attack) => <li key={attack.name}>{attack.name} {attack.toHit && formatExpression(attack.toHit)} {attack.damage && formatExpression(attack.damage)}</li>)}</ul>}
        </div>)}
        {review.encounters.map(({ key, data }) => {
          const map = review.maps.find(({ art }) => art.identity === data.map.assetId);
          if (!map) return null;
          const encounter = review.items.find((item) => item.kind === "encounter" && item.key === key);
          const scene = mapScene(map, data);
          const art = Object.fromEntries(data.tokens.flatMap(({ assetId, imageUrl }) => assetId && imageUrl ? [[assetId, imageUrl]] : []));
          return <details key={key}><summary>{encounter?.name ?? key}</summary><div className="scene-studio">
            <StudioSceneMap scene={scene} media={{ ...art, [map.art.identity]: map.art.previewUrl }} locale={locale} reportIssues={false} />
          </div></details>;
        })}
      </details>
      {review.otherEncounters.length > 0 && <details><summary>{t("publishShared")}</summary>
        <ul>{review.otherEncounters.map(({ key, name }) => <li key={key}>{name}
          {review.candidates.some((view) => view.materializesEncounter === key) && <small> {t("publishUpdatesDraft")}</small>}
        </li>)}</ul>
      </details>}
    </>}
    <div className="row build-editor-actions">
      <button type="button" className="primary" aria-disabled={busy || (!canPublish && !retry)} onClick={() => void commit()}>
        {busy ? t("publishSending") : retry ? t("publishRetry") : t("publishSubmit", { count: selectionCount })}
      </button>
    </div>
  </>;
}
