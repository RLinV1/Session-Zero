import { lazy, Suspense, useState } from "react";
import { conditionSpec, type ConditionId } from "@vtt/shared";
import { ConditionMarker } from "../../panels/ConditionMarker";
import { useNearViewport } from "../../ui/nearViewport";
import { TokenDisc } from "../../ui/TokenDisc";
import { AttackTile } from "./AttackTile";
import { PORTRAITS } from "./crops";
import { DiceTile } from "./DiceTile";
import { SightStage } from "./SightStage";
import { TemplateTile } from "./TemplateTile";

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
        <h3 id="play-heading">Run the fight at the table.</h3>
        <p>
          Sight, templates, dice, attacks, turns and conditions, all by the table's own rules. Your players see each
          result as it happens.
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
      <h4>Turn order</h4>
      <div ref={ref} className="turn-slot">
        {near && (
          <Suspense fallback={null}>
            <TurnTile />
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
      <h4>Conditions</h4>
      <p>Each marker is its own picture, so nobody has to tell them apart by colour.</p>
      <div className="condition-token">
        <TokenDisc name="Pell" color="#3fb950" image={PORTRAITS.templates.pell} hp={0.61} size="3.25rem">
          <span className="token-label">Pell</span>
        </TokenDisc>
        <span className="condition-markers">
          {on.map((id) => (
            <ConditionMarker key={id} id={id} size={26} />
          ))}
        </span>
      </div>
      <ul className="plain condition-list" aria-label="Conditions on Pell">
        {SHOWN.map((id) => (
          <li key={id}>
            <button type="button" className="condition-toggle" aria-pressed={on.includes(id)} onClick={() => toggle(id)}>
              <span aria-hidden="true">
                <ConditionMarker id={id} size={20} />
              </span>
              {conditionSpec(id).label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
