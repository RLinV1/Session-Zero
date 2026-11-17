import { useEffect, useState, type FormEvent } from "react";
import { RequireAccount } from "../../account/RequireAccount";
import { useAccount } from "../../account/accountStore";
import { useT } from "../../i18n/locale";
import { api, type StudioConsentRequest } from "../../net/api";
import { EntryPage } from "../../ui/SiteHeader";

/**
 * Where an AI app sends the owner to connect it to builds (FR-GM-26, ADR 0073, design D7): Session
 * Zero's OAuth authorization page. Signed in on this site, the owner ticks the builds it may work
 * on. The answer goes back to the redirect the server checked against the app's registration; this
 * page never builds that address itself.
 */
export function StudioConnectPage() {
  return (
    <RequireAccount>
      <StudioConsent />
    </RequireAccount>
  );
}

type View =
  | { state: "loading" }
  /** `back`: where the AI app asked to hear about a problem. Only ever followed by the person's click. */
  | { state: "invalid"; error: string; back: string | null }
  | { state: "ready"; request: StudioConsentRequest }
  | { state: "returning" };

function StudioConsent() {
  const t = useT();
  const account = useAccount();
  const [view, setView] = useState<View>({ state: "loading" });
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The request as the AI app sent it, read once: it goes back to the server unchanged.
  const [search] = useState(() => location.search);

  useEffect(() => {
    let live = true;
    api.studio.checkRequest(search).then((checked) => {
      if (!live) return;
      if (checked.ok) return setView({ state: "ready", request: checked.request });
      // Never sent on without a click: anyone can register an app, so its address isn't trusted
      // enough to turn this site into a silent redirect (RFC 9700 §4.11.2).
      setView({ state: "invalid", error: checked.error, back: checked.redirectTo });
    }, () => live && setView({ state: "invalid", error: t("studio.connect.failed"), back: null }));
    return () => {
      live = false;
    };
  }, [search, t]);

  async function answer(decision: "allow" | "deny") {
    if (decision === "allow" && chosen.length === 0) return setError(t("studio.connect.chooseOne"));
    setBusy(true);
    setError(null);
    try {
      const { redirectTo } = await api.studio.decide(Object.fromEntries(new URLSearchParams(search)), decision, chosen);
      setView({ state: "returning" });
      location.assign(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("studio.connect.failed"));
      setBusy(false);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void answer("allow");
  };

  if (view.state === "loading") return <EntryPage><p role="status">{t("common.loading")}</p></EntryPage>;
  if (view.state === "returning") return <EntryPage><p role="status">{t("studio.connect.returning")}</p></EntryPage>;
  if (view.state === "invalid") {
    return (
      <EntryPage>
        <div className="card">
          <h1>{t("studio.connect.invalidTitle")}</h1>
          <p role="alert" className="error">{view.error}</p>
          {view.back && <a href={view.back} rel="noreferrer">{t("studio.connect.goBack", { host: new URL(view.back).host })}</a>}
        </div>
      </EntryPage>
    );
  }

  const { client, builds } = view.request;
  const toggle = (id: string, on: boolean) => setChosen((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));
  return (
    <EntryPage>
      <form className="card studio-connect" onSubmit={submit} aria-labelledby="studio-connect-title">
        <h1 id="studio-connect-title">{t("studio.connect.title")}</h1>
        <p>{client.name ? t("studio.connect.claims", { name: client.name }) : t("studio.connect.claimsUnnamed")}</p>
        <p><strong>{t("studio.connect.returnsTo", { host: client.redirectHost })}</strong></p>
        {account.status === "signedIn" && <p className="muted">{t("studio.connect.signedInAs", { name: account.account.displayName })}</p>}
        {builds.length === 0 ? (
          <p className="notice">{t("studio.connect.noBuilds")}</p>
        ) : (
          <fieldset>
            <legend>{t("studio.connect.chooseBuilds")}</legend>
            {builds.map((build) => (
              <label key={build.id} className="checkbox">
                <input type="checkbox" checked={chosen.includes(build.id)} disabled={busy} onChange={(e) => toggle(build.id, e.currentTarget.checked)} />
                {build.name}
              </label>
            ))}
          </fieldset>
        )}
        <p>{t("studio.connect.can")}</p>
        <p>{t("studio.connect.cannot")}</p>
        <p className="muted">{t("studio.connect.lasts")}</p>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="row">
          {builds.length > 0 && <button type="submit" className="primary" disabled={busy}>{t("studio.connect.allow")}</button>}
          <button type="button" disabled={busy} onClick={() => void answer("deny")}>{t("studio.connect.deny")}</button>
        </div>
      </form>
    </EntryPage>
  );
}
