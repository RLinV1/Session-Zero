import { useMemo, useState, type CSSProperties } from "react";
import { MapGrid } from "../../ui/MapGrid";
import { revealOnEnter } from "../../ui/reveal";
import { CROP, MAPS, cropWallLines, onCrop } from "./crops";
import { CropWindow } from "./CropWindow";
import { WALL_WIDTH } from "./PrepareSection";
import { TEMPLATE_VIEW } from "./TemplateTile";
import { TokenChip } from "./TokenChip";
import { t } from "../../i18n/locale";

/** The source repository, linked from the open source tile. */
export const REPO_URL = "https://github.com/RLinV1/Session-Zero";

/**
 * What sets the product apart (gm-home: "A differentiators section opens the running-a-game
 * part"): four items in a fixed order, two with a demo and two as text. Under "Running a game",
 * so "you" is the GM.
 */
export function DifferentiatorsSection() {
  return (
    <section className="home-section diff-section" aria-labelledby="diff-heading">
      <div className="section-copy">
        <h3 id="diff-heading">{t("home.diff.title")}</h3>
        <p>{t("home.diff.body")}</p>
      </div>
      <div className="diff-grid">
        <article className="diff-tile" ref={revealOnEnter}>
          <DetectTile />
        </article>
        <article className="diff-tile" ref={revealOnEnter}>
          <SeatTile />
        </article>
        <article className="diff-tile" ref={revealOnEnter}>
          <h4>{t("home.diff.build.title")}</h4>
          <p>{t("home.diff.build.body")}</p>
          <p className="diff-note">{t("home.diff.aiNote")}</p>
        </article>
        <article className="diff-tile" ref={revealOnEnter}>
          <h4>{t("home.diff.open.title")}</h4>
          <p>{t("home.diff.open.body")}</p>
          <a className="diff-link" href={REPO_URL} target="_blank" rel="noreferrer">
            {t("home.diff.open.link")}
          </a>
        </article>
      </div>
    </section>
  );
}

type Verdict = "suggested" | "applied" | "discarded";

/** Suggested walls on the inn's crop: the map's own plain walls, drawn as the board draws them once applied. */
function DetectTile() {
  const [verdict, setVerdict] = useState<Verdict>("suggested");
  const walls = useMemo(() => cropWallLines("moor-inn").filter(onCrop).filter((w) => w.kind === "wall"), []);
  return (
    <>
      <h4>{t("home.diff.detect.title")}</h4>
      <p>{t("home.diff.detect.body")}</p>
      <figure className="map-figure diff-figure" style={{ "--map": `url(${MAPS.walls.src})` } as CSSProperties}>
        <div className="map-frame" data-verdict={verdict}>
          <img src={MAPS.walls.src} width={CROP.width} height={CROP.height} alt={MAPS.walls.alt} loading="lazy" decoding="async" />
          <MapGrid width={CROP.width} height={CROP.height} cell={CROP.cell} variant="faint" />
          {verdict !== "discarded" && (
            <svg className="walls-drawing" viewBox={`0 0 ${CROP.width} ${CROP.height}`} preserveAspectRatio="none" aria-hidden="true">
              <g className="wall-halo" strokeWidth={WALL_WIDTH + 3}>
                {walls.map((w, i) => (
                  <line key={i} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
                ))}
              </g>
              <g strokeWidth={WALL_WIDTH}>
                {walls.map((w, i) => (
                  <line key={i} className={verdict === "suggested" ? "wall-stroke is-suggested" : "wall-stroke"} data-kind="wall" x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
                ))}
              </g>
            </svg>
          )}
        </div>
      </figure>
      <p className="figure-note">{t("home.diff.detect.grid", { px: CROP.cell })}</p>
      <div className="diff-actions">
        {verdict === "suggested" ? (
          <>
            <button type="button" className="ui-button" onClick={() => setVerdict("applied")}>
              {t("home.diff.detect.apply")}
            </button>
            <button type="button" className="ui-button" onClick={() => setVerdict("discarded")}>
              {t("home.diff.detect.discard")}
            </button>
          </>
        ) : (
          <button type="button" className="ui-button" onClick={() => setVerdict("suggested")}>
            {t("home.diff.detect.again")}
          </button>
        )}
      </div>
      <p className="figure-note" role="status">
        {t(`home.diff.detect.${verdict}` as const)}
      </p>
    </>
  );
}

/** Where the AI's token stands before it is told anything. */
const START = { col: 9, row: 8 };

/** Instructions to pick from, each a plain-language order and the square it ends on (open ground on the camp crop). */
const ORDERS = [
  { id: "north", label: "home.diff.seat.north", done: "home.diff.seat.northDone", to: { col: 9, row: 6 } },
  { id: "goblin", label: "home.diff.seat.goblin", done: "home.diff.seat.goblinDone", to: { col: 6, row: 4 } },
  { id: "back", label: "home.diff.seat.back", done: "home.diff.seat.backDone", to: START },
] as const;

/** A preview of an AI seat: preset orders move a token, and no AI runs. */
function SeatTile() {
  const [order, setOrder] = useState<(typeof ORDERS)[number] | null>(null);
  const at = order?.to ?? START;
  return (
    <>
      <h4>{t("home.diff.seat.title")}</h4>
      <p>{t("home.diff.seat.body")}</p>
      <p className="diff-note">{t("home.diff.aiNote")}</p>
      <p className="diff-preview">{t("home.diff.seat.preview")}</p>
      <div className="seat-stage">
        <CropWindow src={MAPS.templates.src} alt={MAPS.templates.alt} view={TEMPLATE_VIEW}>
          <TokenChip className="seat-token" name={t("home.diff.seat.name")} color="#8e6bd1" hp={100} at={at} view={TEMPLATE_VIEW} />
        </CropWindow>
      </div>
      <div className="seg seg-small diff-orders" role="group" aria-label={t("home.diff.seat.orders")}>
        {ORDERS.map((o) => (
          <button key={o.id} type="button" aria-pressed={order?.id === o.id} onClick={() => setOrder(o)}>
            {t(o.label)}
          </button>
        ))}
      </div>
      <p className="figure-note" role="status">
        {order ? t(order.done) : t("home.diff.seat.idle")}
      </p>
    </>
  );
}
