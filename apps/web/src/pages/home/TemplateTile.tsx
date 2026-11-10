import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Point } from "@vtt/shared";
import { areaShape, snapToIntersection, tokensTouchingArea } from "../../board/tools";
import { MAPS, PORTRAITS, viewRect, type CropView } from "./crops";
import { CropWindow, viewBoxOf } from "./CropWindow";
import { CROP_GRID, squareCenter } from "./sightDemo";
import { TokenChip } from "./TokenChip";
import { t } from "../../i18n/locale";

/** The goblins' cooking fire, loot pile and cart below the broken watchtower, on the camp's home crop. */
export const TEMPLATE_VIEW: CropView = { col: 0, row: 1, cols: 16, rows: 9 };

/** The tokens in the ruin, each in the middle of a square of open ground. */
export const TEMPLATE_TOKENS = [
  { id: "mara", name: "Mara", color: "#5b8def", hp: 84, image: PORTRAITS.templates.mara, at: { col: 11, row: 8 } },
  { id: "pell", name: "Pell", color: "#3fb950", hp: 61, image: PORTRAITS.templates.pell, at: { col: 12, row: 8 } },
  { id: "goblin", name: "Goblin", nameKey: "home.creature.goblin" as const, color: "#c0392b", hp: 100, image: PORTRAITS.templates.goblin, at: { col: 5, row: 4 } },
  { id: "archer", name: "Goblin archer", nameKey: "home.creature.archer" as const, color: "#a93226", hp: 70, image: PORTRAITS.templates.archer, at: { col: 7, row: 4 } },
  { id: "wolf", name: "Wolf", nameKey: "home.creature.wolf" as const, color: "#7f8c8d", hp: 45, image: PORTRAITS.templates.wolf, at: { col: 4, row: 6 } },
].map((t) => ({ ...t, position: squareCenter(t.at.col, t.at.row), size: 1 }));

/** A demo token's name: a creature in the reader's language, a character as named. */
const demoName = (token: { name: string; nameKey?: "home.creature.goblin" | "home.creature.archer" | "home.creature.wolf" }) =>
  token.nameKey ? t(token.nameKey) : token.name;

/** Radius choices for the sphere, in feet, as the table sizes templates. */
const SIZES = [10, 15, 20] as const;
/** Spheres are centred on a grid intersection, as the table snaps them. */
export const TEMPLATE_START: Point = { x: 6 * 70, y: 5 * 70 };

const STEP: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** What the table counts as inside a sphere of `size` feet centred at `at`. */
export function caughtBy(at: Point, size: number) {
  return tokensTouchingArea(areaShape("circle", at, at, size, CROP_GRID), TEMPLATE_TOKENS, CROP_GRID);
}

/**
 * Area templates (gm-home: "Area templates use the table's shapes"): the table's own shape for a
 * sphere, and the tokens it catches by the table's own count, aimed with the pointer or the arrow
 * keys.
 */
export function TemplateTile() {
  const [at, setAt] = useState<Point>(TEMPLATE_START);
  const [size, setSize] = useState<(typeof SIZES)[number]>(15);
  const area = areaShape("circle", at, at, size, CROP_GRID);
  const caught = caughtBy(at, size);
  const caughtIds = new Set(caught.map((t) => t.id));
  const rect = viewRect(TEMPLATE_VIEW);

  /** Keeps the centre on an intersection inside the courtyard. */
  const aim = (p: Point) => {
    const snapped = snapToIntersection(p, CROP_GRID);
    setAt({
      x: Math.min(Math.max(snapped.x, rect.x), rect.x + rect.width),
      y: Math.min(Math.max(snapped.y, rect.y), rect.y + Math.floor(rect.height / 70) * 70),
    });
  };

  const aimAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    aim({ x: rect.x + ((e.clientX - box.left) / box.width) * rect.width, y: rect.y + ((e.clientY - box.top) / box.height) * rect.height });
  };

  /** A click places the sphere; holding and dragging moves it. It stays put while the pointer only passes over. */
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    aimAt(e);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.buttons === 0) return;
    aimAt(e);
  }

  function onKeyDown(e: KeyboardEvent) {
    const d = STEP[e.key];
    if (!d) return;
    e.preventDefault();
    aim({ x: at.x + d[0] * 70, y: at.y + d[1] * 70 });
  }

  return (
    <>
      <h4>{t("home.templates.title")}</h4>
      <p>{t("home.templates.body")}</p>
      <div className="seg seg-small" role="group" aria-label={t("home.templates.radius")}>
        {SIZES.map((s) => (
          <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)}>
            <span className="num">{s}</span> {t("home.templates.unit")}
          </button>
        ))}
      </div>
      <div
        className="template-stage"
        tabIndex={0}
        role="group"
        aria-label={t("home.templates.onMap")}
        aria-describedby="template-caught"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <CropWindow src={MAPS.templates.src} alt={MAPS.templates.alt} view={TEMPLATE_VIEW}>
          <svg className="template-area" viewBox={viewBoxOf(TEMPLATE_VIEW)} preserveAspectRatio="none" aria-hidden="true">
            {area.kind === "circle" && <circle cx={area.center.x} cy={area.center.y} r={area.radius} />}
            <circle className="template-centre" cx={at.x} cy={at.y} r={6} />
          </svg>
          {TEMPLATE_TOKENS.map((t) => (
            <TokenChip
              key={t.id}
              name={demoName(t)}
              color={t.color}
              hp={t.hp}
              image={t.image}
              at={t.at}
              view={TEMPLATE_VIEW}
              className={caughtIds.has(t.id) ? "is-caught" : undefined}
            />
          ))}
        </CropWindow>
      </div>
      <p id="template-caught" className="figure-note" role="status">
        {caught.length ? t("home.templates.caught", { names: caught.map(demoName) }) : t("home.templates.nobody")}
      </p>
    </>
  );
}
