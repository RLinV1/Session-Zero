import { useCallback, useEffect, useState } from "react";
import { getLocale, useT } from "../../i18n/locale";
import { ApiError, api, type StudioGrantView } from "../../net/api";

const when = (iso: string) => new Date(iso).toLocaleString(getLocale(), { dateStyle: "medium", timeStyle: "short" });

/**
 * The AI app connections that include this build, on its page (FR-GM-26, ADR 0073, design D7).
 * Disconnecting ends the whole connection, for every build it covers, at once. Shows nothing when
 * there are none, or when this server doesn't offer connections.
 */
export function StudioConnections({ buildId }: { buildId: string }) {
  const t = useT();
  const [grants, setGrants] = useState<StudioGrantView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.studio.grants(buildId).then(
    (found) => {
      setGrants(found.grants);
      setLoadFailed(false);
    },
    // 404: this server doesn't offer AI app connections, so there is nothing to show.
    (err: unknown) => (err instanceof ApiError && err.status === 404 ? setGrants([]) : setLoadFailed(true)),
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
  if (!grants || grants.length === 0) return null;
  return (
    <section className="build-section studio-connections" aria-labelledby={`studio-connections-${buildId}`}>
      <h2 id={`studio-connections-${buildId}`}>{t("studio.grants.title")}</h2>
      <p className="muted">{t("studio.grants.intro")}</p>
      <ul>
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
      </ul>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
