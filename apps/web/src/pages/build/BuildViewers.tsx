import type { ReactNode } from "react";
import type { BuildFileView, BuildItemView } from "@vtt/shared";
import { creatureOf, mapOf } from "./buildProgress";
import { ROLE_RANK, roleOf, type Role } from "./buildOrder";
import { useHashKey, useMedia } from "./buildHooks";
import { moveAlongTabs } from "./EncounterBoard";

/**
 * Maps and creatures as viewers rather than walls of cards (FR-GM-27, build page layout
 * 2026-11-12): a strip of map thumbnails over one map at full size, and a roster of creatures
 * beside the one being read.
 */

export interface ItemStatus { text: string; warn: boolean }

/** One map at a time, picked from a strip of thumbnails that also says where each stands. */
export function MapViewer({ maps, files, idFor, statusFor, renderPanel }: {
  maps: readonly BuildItemView[];
  files: readonly BuildFileView[];
  idFor: (item: BuildItemView) => string;
  statusFor: (item: BuildItemView) => ItemStatus;
  renderPanel: (item: BuildItemView) => ReactNode;
}) {
  const keys = maps.map((m) => m.key);
  const [selectedKey, pick] = useHashKey("build-map-", keys);
  const item = maps.find((m) => m.key === selectedKey) ?? maps[0];
  if (!item) return null;
  const confirmed = maps.filter((m) => mapOf(m).gridStatus === "confirmed").length;
  return (
    <section className="build-section build-viewer" aria-labelledby="build-maps">
      <div className="build-section-head">
        <h2 id="build-maps">Maps</h2>
        <span className="build-section-sum">{maps.length} {maps.length === 1 ? "map" : "maps"}, {confirmed === maps.length ? "every grid confirmed" : `${maps.length - confirmed} grid${maps.length - confirmed === 1 ? "" : "s"} to confirm`}</span>
      </div>
      <div className="build-strip" role="tablist" aria-label="Maps">
        {maps.map((m) => {
          const file = files.find((f) => f.id === mapOf(m).fileId);
          const status = statusFor(m);
          return (
            <button key={m.key} type="button" role="tab" id={idFor(m)} aria-selected={m.key === item.key} aria-controls="build-map-panel"
              tabIndex={m.key === item.key ? 0 : -1} onClick={() => pick(m.key)} onKeyDown={(k) => moveAlongTabs(k, keys, item.key, pick)}>
              {file ? <img src={file.url} alt="" loading="lazy" /> : <span className="build-strip-blank" aria-hidden="true" />}
              <span className="build-strip-name">{mapOf(m).name}</span>
              <span className={status.warn ? "build-strip-status is-warn" : "build-strip-status"}>{status.text}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="build-map-panel" aria-labelledby={idFor(item)} className="build-swap" key={item.key}>
        {renderPanel(item)}
      </div>
    </section>
  );
}

const ROLE_TITLE: Record<Role, string> = { character: "Player characters", creature: "Creatures", piece: "Pieces" };

/**
 * The creatures as a roster: a compact list by kind on one side, the chosen one read in full on the
 * other. On a narrow screen the full view opens under its row instead.
 */
export function CreatureRoster({ creatures, files, idFor, checkbox, attention, renderDetail }: {
  creatures: readonly BuildItemView[];
  files: readonly BuildFileView[];
  idFor: (item: BuildItemView) => string;
  checkbox: (item: BuildItemView) => ReactNode;
  /** What the row says needs a look, such as "1 to fix" or "2 notes". */
  attention: (item: BuildItemView) => ItemStatus | null;
  renderDetail: (item: BuildItemView) => ReactNode;
}) {
  const keys = creatures.map((c) => c.key);
  const [selectedKey, pick] = useHashKey("build-creature-", keys);
  const narrow = useMedia("(max-width: 900px)");
  const item = creatures.find((c) => c.key === selectedKey) ?? creatures[0];
  if (!item) return null;
  const roles = [...new Set(creatures.map((c) => roleOf(creatureOf(c))))].sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]);
  const characters = creatures.filter((c) => creatureOf(c).isPlayerCharacter).length;
  const detail = <div className="build-roster-detail build-swap" key={item.key} id="build-creature-detail">{renderDetail(item)}</div>;

  return (
    <section className="build-section build-roster" aria-labelledby="build-creatures">
      <div className="build-section-head">
        <h2 id="build-creatures">Creatures and characters</h2>
        <span className="build-section-sum">{creatures.length} {creatures.length === 1 ? "creature" : "creatures"}{characters > 0 ? `, ${characters} of them player characters` : ""}</span>
      </div>
      <div className="build-roster-body">
        <div className="build-roster-list">
          {roles.map((role) => (
            <div key={role} className="build-roster-group">
              <h3>{ROLE_TITLE[role]}</h3>
              <ul className="plain">
                {creatures.filter((c) => roleOf(creatureOf(c)) === role).map((c) => {
                  const data = creatureOf(c);
                  const art = files.find((f) => f.id === data.imageFileId);
                  const flag = attention(c);
                  const chosen = c.key === item.key;
                  return (
                    <li key={c.key} className={chosen ? "build-roster-row is-current" : "build-roster-row"}>
                      {checkbox(c)}
                      <button type="button" id={idFor(c)} className="build-roster-pick" aria-current={chosen ? "true" : undefined}
                        aria-controls="build-creature-detail" onClick={() => pick(c.key)}>
                        {art ? <img className="build-roster-art" src={art.url} alt="" loading="lazy" /> : <span className="build-roster-art" style={{ background: data.color }} aria-hidden="true" />}
                        <span className="build-roster-name">{data.name}</span>
                        <span className="build-roster-stats">
                          {data.maxHp !== null && <span>{data.hp ?? 0}<span className="muted">/{data.maxHp} HP</span></span>}
                          {data.ac !== null && <span>{data.ac} <span className="muted">AC</span></span>}
                        </span>
                        {flag && <span className={flag.warn ? "build-roster-flag is-warn" : "build-roster-flag"}>{flag.text}</span>}
                      </button>
                      {narrow && chosen && detail}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {!narrow && detail}
      </div>
    </section>
  );
}
