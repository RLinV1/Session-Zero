import { useEffect, useRef, useState } from "react";
import type { Command, RoomState } from "@vtt/shared";
import type { EditorConnection } from "../../net/roomConnection";
import { coversWholeMap, describeCells, wholeMapRegion } from "../../panels/fogCells";
import { t } from "../../i18n/locale";

/**
 * The map editor's fog controls (FR-GM-17, ADR 0016): fog the whole map, and reveal any region from
 * a list, by keyboard as well as pointer. They send the same `fog.add` / `fog.remove` commands as
 * the fog canvas.
 */
export function FogControls({ connection, state, intro }: { connection: EditorConnection; state: RoomState; intro: string }) {
  const { map, grid } = state.scene;
  const regions = Object.values(state.fog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  /** After a reveal: the region removed and its place in the list, to move focus once it has gone. */
  const [revealed, setRevealed] = useState<{ id: string; index: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLParagraphElement>(null);

  // A reveal removes the focused button; once the region has left state, hand focus to its
  // neighbour, or to the summary if none is left.
  useEffect(() => {
    if (!revealed || state.fog[revealed.id]) return;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [];
    const next = buttons[Math.min(revealed.index, buttons.length - 1)];
    (next ?? headingRef.current)?.focus();
    setRevealed(null);
  }, [revealed, state.fog]);

  /** What the list and its Reveal button call a region: "Whole map", or its shape and cells. */
  const label = (id: string) => {
    const region = state.fog[id];
    if (!region || !map) return t("fog.fallback");
    if (coversWholeMap(region, map)) return t("fog.wholeMap");
    const kind = region.shape === "rect" ? t("common.rectangle") : t("fog.polygonCorners", { n: region.points.length });
    return t("fog.regionLabel", { kind, cells: describeCells(region, map, grid) });
  };

  /** Send a `fog.add`; on success, announce `done`. */
  const add = async (command: Extract<Command, { type: "fog.add" }>, done: string) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setError(result.ok ? null : result.message);
    if (result.ok) setStatus(done);
  };

  /** Remove a region, announce it, and queue focus for the button that takes its place. */
  const reveal = async (id: string, index: number) => {
    const what = label(id);
    setBusy(true);
    const result = await connection.command({ type: "fog.remove", regionId: id });
    setBusy(false);
    setError(result.ok ? null : result.message);
    if (result.ok) {
      setStatus(t("fog.revealed", { what }));
      setRevealed({ id, index });
    }
  };

  return (
    <>
      {!map ? (
        <p className="muted">{t("fog.needsMap")}</p>
      ) : (
        <>
          <p className="muted">{intro}</p>
          <div className="row button-row">
            <button
              type="button"
              className="secondary"
              data-guide="fog-whole"
              disabled={busy}
              onClick={() => void add({ type: "fog.add", region: wholeMapRegion(map) }, t("fog.fogged"))}
            >
              {t("fog.fogWhole")}
            </button>
          </div>
          <p ref={headingRef} tabIndex={-1} className="fog-count">
            {regions.length === 0 ? t("fog.none") : t("fog.regionsN", { n: regions.length })}
          </p>
          {regions.length > 0 && (
            <ul ref={listRef} className="plain fog-list" aria-label={t("fog.regions")}>
              {regions.map((region, i) => (
                <li key={region.id} className="fog-row">
                  <span>{label(region.id)}</span>
                  <button
                    type="button"
                    className="small secondary"
                    disabled={busy}
                    aria-label={t("fog.revealNamed", { what: label(region.id) })}
                    onClick={() => void reveal(region.id, i)}
                  >
                    {t("fog.reveal")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="sr-only" role="status">{status}</p>
    </>
  );
}

