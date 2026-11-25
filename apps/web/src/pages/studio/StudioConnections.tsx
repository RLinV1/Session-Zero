import { useCallback, useEffect, useState } from "react";
import { getLocale, useLocale, useT } from "../../i18n/locale";
import { ApiError, api, type StudioGrantView } from "../../net/api";
import { studioT, type StudioTextKey } from "../../studio/text";
import { copyText } from "../build/buildCopy";

const when = (iso: string) => new Date(iso).toLocaleString(getLocale(), { dateStyle: "medium", timeStyle: "short" });

/**
 * The AI app connections that include this build, on its page (FR-GM-26, ADR 0073, design D7).
 * Disconnecting ends the whole connection, for every build it covers, at once. The Studio itself
 * opens in the AI app, so this page also offers the text that launches it there. Shows nothing when
 * this server doesn't offer connections.
 */
export function StudioConnections({ buildId }: { buildId: string }) {
  const t = useT();
  const locale = useLocale();
  const st = (key: StudioTextKey, params?: Record<string, string | number>) => studioT(locale, key, params);
  const [copied, setCopied] = useState<"copied" | "copyFailed" | null>(null);
  const [grants, setGrants] = useState<StudioGrantView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /** False when this server doesn't offer AI app connections at all. */
  const [available, setAvailable] = useState(true);
  const [ending, setEnding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.studio.grants(buildId).then(
    (found) => {
      setGrants(found.grants);
      setAvailable(true);
      setLoadFailed(false);
    },
    // 404: this server doesn't offer AI app connections, so there is nothing to show.
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 404) { setGrants([]); setAvailable(false); } else setLoadFailed(true);
    },
  ), [buildId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function disconnect(grant: StudioGrantView) {
    setEnding(grant.id);
    setError(null);
    try {
      await api.studio.revoke(buildId, grant.id);
      await load();
    } catch {
      setError(t("studio.grants.failed"));
    } finally {
      setEnding(null);
    }
  }

  const nameOf = (grant: StudioGrantView) => grant.clientName || t("studio.connect.unnamedApp");

  if (loadFailed) return <p role="alert" className="error">{t("studio.grants.loadFailed")}</p>;
  if (!grants || !available) return null;
  const prompt = st("launchPrompt", { buildId });
  return (
    <section className="build-section studio-connections" aria-labelledby={`studio-connections-${buildId}`}>
      <h2 id={`studio-connections-${buildId}`}>{t("studio.grants.title")}</h2>
      <details className="studio-launch"><summary>{st("launchTitle")}</summary>
        <p className="muted">{st("launchHint", { endpoint: `${location.origin}/mcp/studio` })}</p>
        <textarea readOnly aria-label={st("copyLaunch")} value={prompt} />
        <div><button type="button" onClick={() => void copyText(prompt).then((ok) => setCopied(ok ? "copied" : "copyFailed"))}>{st("copyLaunch")}</button>
          {" "}<span role="status">{copied ? st(copied) : ""}</span></div>
        <p className="muted">{st("legacyPass")}</p>
      </details>
      {grants.length > 0 && <p className="muted">{t("studio.grants.intro")}</p>}
      {grants.length > 0 && <ul>
        {grants.map((grant) => (
          <li key={grant.id}>
            <p><strong>{t("studio.grants.app", { name: nameOf(grant), host: grant.redirectHost })}</strong></p>
            <p className="muted">{t("studio.grants.covers", { names: grant.builds.map((b) => b.name).join(", ") })}</p>
            <p className="muted">
              {t("studio.grants.dates", { since: when(grant.createdAt), until: when(grant.expiresAt) })}
              {" · "}
              {grant.lastUsedAt ? t("studio.grants.lastUsed", { date: when(grant.lastUsedAt) }) : t("studio.grants.notUsed")}
            </p>
            {grant.builds.length > 1 && <p className="muted">{t("studio.grants.disconnectAll")}</p>}
            <button type="button" disabled={ending !== null} aria-label={t("studio.grants.disconnectNamed", { name: nameOf(grant) })} onClick={() => void disconnect(grant)}>
              {ending === grant.id ? t("studio.grants.disconnecting") : t("studio.grants.disconnect")}
            </button>
          </li>
        ))}
      </ul>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
