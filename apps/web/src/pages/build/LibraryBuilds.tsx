import { useEffect, useState } from "react";
import type { BuildSummary } from "@vtt/shared";
import { api } from "../../net/api";
import { navigate } from "../../router";
import { EmptyState } from "../../ui/EmptyState";
import { PassPanel } from "./PassPanel";
import { RIGHTS_NOTICE } from "./buildCopy";

/** The library's AI builds tab: start one, and get back to the ones in progress (FR-GM-26). */
export function BuildsTab({ query, onError }: { query: string; onError: (error: string | null) => void }) {
  const [builds, setBuilds] = useState<BuildSummary[] | null>(null);
  const [name, setName] = useState("");
  const [started, setStarted] = useState<{ id: string; pass: string } | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let live = true;
    api.builds.list().then(
      (list) => { if (live) setBuilds(list); },
      (err: unknown) => { if (live) onError(err instanceof Error ? err.message : "Could not load your builds"); },
    );
    return () => { live = false; };
  }, [onError]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    onError(null);
    try {
      const { build, pass } = await api.builds.start(name.trim());
      setBuilds((all) => [build, ...(all ?? [])]);
      setStarted({ id: build.id, pass });
      setName("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not start a build");
    } finally {
      setStarting(false);
    }
  }

  const q = query.trim().toLowerCase();
  const shown = (builds ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));

  return (
    <div role="tabpanel" className="build-section">
      <p className="muted">Let your own AI app turn a folder of rules, sheets and art into a draft game. You review it here and choose what to publish. Your AI never gets your password, and it can't reach your library or rooms.</p>
      <form className="build-start" onSubmit={(e) => void start(e)}>
        <label>Name of this build<input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} /></label>
        <button type="submit" className="primary" disabled={starting || name.trim() === ""}>Start a build</button>
      </form>
      <p className="muted small-print">{RIGHTS_NOTICE}</p>

      {!builds && <p className="muted" aria-busy="true">Loading…</p>}
      {builds && shown.length === 0 && (q
        ? <p className="muted">None of your builds match that search.</p>
        : <EmptyState picture="empty-library">You haven't started an AI build yet.</EmptyState>)}
      <ul className="plain build-published">
        {shown.map((b) => (
          <li key={b.id}>
            <a href={`/builds/${b.id}`} onClick={(e) => { e.preventDefault(); navigate(`/builds/${b.id}`); }}>{b.name}</a>
            <span className="muted small-print">{b.status === "open" ? "In progress" : "Closed"}</span>
          </li>
        ))}
      </ul>

      <PassPanel pass={started?.pass ?? null} onClose={() => setStarted(null)}>
        {started && <a href={`/builds/${started.id}`} onClick={(e) => { e.preventDefault(); navigate(`/builds/${started.id}`); }}>Open the build page</a>}
      </PassPanel>
    </div>
  );
}
