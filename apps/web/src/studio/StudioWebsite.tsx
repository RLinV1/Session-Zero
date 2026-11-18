import { useCallback, useEffect, useRef, useState } from "react";
import type { BuildFileView, StudioContext, StudioSnapshot } from "@vtt/shared";
import { useLocale } from "../i18n/locale";
import { ApiError, api } from "../net/api";
import { copyText } from "../pages/build/buildCopy";
import { SceneStudio } from "./SceneStudio";
import { studioT, type StudioTextKey } from "./text";

/** Owner-cookie adapter. It never reads or changes the native builder's unsaved editing forms. */
export function StudioWebsite({ buildId, files }: { buildId: string; files: readonly BuildFileView[] }) {
  const locale = useLocale();
  const t = (key: StudioTextKey, params?: Record<string, string | number>) => studioT(locale, key, params);
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "stale" | "denied">("loading");
  const [copied, setCopied] = useState<"copied" | "copyFailed" | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poll = useRef<() => Promise<void>>(async () => {});
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const refresh = useCallback(async () => {
    if (document.hidden || inFlight.current || paused.current) return;
    const current = generation.current;
    inFlight.current = true;
    controller.current = new AbortController();
    const started = Date.now();
    try {
      const saved = await api.studio.snapshot(buildId, controller.current.signal);
      if (generation.current !== current) return;
      setSnapshot(saved); setState("ready");
    } catch (error) {
      if (generation.current !== current || controller.current?.signal.aborted) return;
      paused.current = true;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { setSnapshot(null); setState("denied"); }
      else setState("stale");
    } finally {
      if (generation.current === current) {
        inFlight.current = false;
        if (timer.current) clearTimeout(timer.current);
        if (!document.hidden && !paused.current) timer.current = setTimeout(() => void poll.current(), Math.max(0, (snapshotRef.current?.refreshIntervalMs ?? 5000) - (Date.now() - started)));
      }
    }
  }, [buildId]);
  poll.current = refresh;

  useEffect(() => {
    generation.current++; paused.current = false; inFlight.current = false;
    setSnapshot(null); setState("loading"); setCopied(null);
    void refresh();
    const visible = () => {
      if (timer.current) clearTimeout(timer.current);
      if (document.hidden) { generation.current++; controller.current?.abort(); inFlight.current = false; }
      else void refresh();
    };
    const focus = () => { if (!paused.current) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", focus);
    return () => {
      generation.current++; paused.current = true;
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);

  useEffect(() => { void refresh(); }, [locale, refresh]);

  async function selectContext(context: StudioContext) {
    const current = generation.current;
    await api.studio.context(buildId, context);
    if (generation.current !== current) return;
    // Discard any old snapshot begun before the selection committed.
    generation.current++; controller.current?.abort(); inFlight.current = false; paused.current = false;
    await refresh();
  }

  const active = snapshot?.buildId === buildId ? snapshot : null;
  const media: Record<string, string> = {};
  if (active) {
    const needed = new Set([active.scene.source?.id, ...active.scene.tokens.map((token) => token.imageFileId)]);
    for (const file of active.files) {
      if (!needed.has(file.id)) continue;
      if (file.privacy === "private") media[file.id] = `/api/builds/${encodeURIComponent(buildId)}/files/${encodeURIComponent(file.id)}/media?variant=preview`;
      else { const legacy = files.find((candidate) => candidate.id === file.id); if (legacy) media[file.id] = legacy.url; }
    }
  }
  const prompt = t("launchPrompt", { buildId });
  return <section className="build-section studio-website-panel" aria-labelledby={`studio-title-${buildId}`}>
    <h2 id={`studio-title-${buildId}`}>{t("title")}</h2>
    <p className="muted">{t("intro")}</p>
    {active ? <>
      <SceneStudio snapshot={active} media={media} locale={locale} onContext={selectContext} disabled={state !== "ready"} stale={state !== "ready"} />
      <details className="studio-launch"><summary>{t("launchTitle")}</summary>
        <p>{t("launchHint", { endpoint: `${location.origin}/mcp/studio` })}</p>
        <textarea readOnly aria-label={t("copyLaunch")} value={prompt} />
        <div><button type="button" onClick={() => void copyText(prompt).then((ok) => setCopied(ok ? "copied" : "copyFailed"))}>{t("copyLaunch")}</button><span role="status">{copied ? t(copied) : ""}</span></div>
        <p className="muted">{t("legacyPass")}</p>
      </details>
    </> : <p role="status">{t(state === "loading" ? "loading" : "unavailable")}</p>}
    {state !== "ready" && <button type="button" onClick={() => { paused.current = false; void refresh(); }}>{t("retry")}</button>}
  </section>;
}
