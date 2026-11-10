import { lazy, Suspense, useState } from "react";
import { conditionLabel, type ConditionId } from "@vtt/shared";
import { ConditionMarker } from "../../panels/ConditionMarker";
import { useNearViewport } from "../../ui/nearViewport";
import { TokenDisc } from "../../ui/TokenDisc";
import { AttackTile } from "./AttackTile";
import { PORTRAITS } from "./crops";
import { DiceTile } from "./DiceTile";
import { SightStage } from "./SightStage";
import { TemplateTile } from "./TemplateTile";
import { getLocale, t } from "../../i18n/locale";

/** The turn order runs the table's `decide`, so it is fetched near the viewport with the rest of that code. */
const TurnTile = lazy(() => import("./TurnTile"));

/**
 * Playing at the table (gm-home: "The home page covers the four promises"): line of sight, then
 * exactly five tiles, each a running piece of the table: area templates, dice, attacks, the turn
 * order and conditions.
 */
export function PlaySection() {
  return (
    <section className="home-section play-section" aria-labelledby="play-heading">
      <div className="section-copy">
        <h3 id="play-heading">{t("home.play.title")}</h3>
        <p>
          {t("home.play.body")}
        </p>
      </div>
      <SightStage />
      <div className="play-grid">
        <div className="play-tile tile-templates">
          <TemplateTile />
        </div>
        <div className="play-tile tile-dice">
          <DiceTile />
        </div>
        <div className="play-tile tile-attacks">
          <AttackTile />
        </div>
        <div className="play-tile tile-turns">
          <TurnSlot />
        </div>
        <div className="play-tile tile-conditions">
          <ConditionsTile />
        </div>
      </div>
    </section>
  );
}

function TurnSlot() {
  const [near, ref] = useNearViewport<HTMLDivElement>();
  return (
    <>
      <h4>{t("home.play.turnOrder")}</h4>
      <div ref={ref} className="turn-slot">
        {near && (
          <Suspense fallback={null}>
            {/* Keyed on the language: the demo's room is built with names in it (localization). */}
            <TurnTile key={getLocale()} />
          </Suspense>
        )}
      </div>
    </>
  );
}

/** Conditions a token can carry, a few at a time. */
const SHOWN: ConditionId[] = ["prone", "poisoned", "frightened", "stunned", "restrained", "concentrating"];

/** The table's condition markers on a token (FR-TAC-08): each is its own picture, not just a colour. */
function ConditionsTile() {
  const [on, setOn] = useState<ConditionId[]>(["poisoned", "prone"]);
  const toggle = (id: ConditionId) => setOn((list) => (list.includes(id) ? list.filter((c) => c !== id) : [...list, id]));
  return (
    <>
      <h4>{t("home.play.conditions")}</h4>
      <p>{t("home.play.conditionsBody")}</p>
      <div className="condition-token">
        <TokenDisc name="Pell" color="#3fb950" image={PORTRAITS.templates.pell} hp={0.61} size="3.25rem">
          <span className="token-label">{"Pell"}</span>
        </TokenDisc>
        <span className="condition-markers">
          {on.map((id) => (
            <ConditionMarker key={id} id={id} size={26} />
          ))}
        </span>
      </div>
      <ul className="plain condition-list" aria-label={t("home.play.conditionsOn", { name: "Pell" })}>
        {SHOWN.map((id) => (
          <li key={id}>
            <button type="button" className="condition-toggle" aria-pressed={on.includes(id)} onClick={() => toggle(id)}>
              <span aria-hidden="true">
                <ConditionMarker id={id} size={20} />
              </span>
              {conditionLabel(id, getLocale())}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
