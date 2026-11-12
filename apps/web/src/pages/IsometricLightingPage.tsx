import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, House, Pause, Play } from "@phosphor-icons/react";
import { Link } from "../Link";
import { APARTMENTS, START, WALK_STOPS } from "../lighting/apartments";
import { findPath, isWalkable, unproject, type Point2 } from "../lighting/isometric";
import { renderApartments, viewport, type LightingView } from "../lighting/renderApartments";
import "./isometricLighting.css";

import { t, type TextId } from "../i18n/locale";
export function IsometricLightingPage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [at, setAt] = useState<Point2>(START);
  const [path, setPath] = useState<Point2[]>([]);
  const [walking, setWalking] = useState(false);
  const [stop, setStop] = useState(0);
  const [turn, setTurn] = useState(0);
  const [torchHeight, setTorchHeight] = useState(1.2);
  const [time, setTime] = useState<LightingView["time"]>("dusk");
  const [cutaway, setCutaway] = useState(true);
  const [grid, setGrid] = useState(false);
  const [cutaways, setCutaways] = useState(0);
  const [message, setMessage] = useState<TextId>("demo.msg.start");
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    setCutaways(renderApartments(canvas.current, size.width, size.height, { at, turn, torchHeight, time, cutaway, grid, path }).cutaways);
  }, [size, at, turn, torchHeight, time, cutaway, grid, path]);
  useEffect(() => {
    if (!path.length) return;
    const timer = window.setTimeout(() => { setAt(path[0]!); setPath((p) => p.slice(1)); }, 140);
    return () => window.clearTimeout(timer);
  }, [path]);
  useEffect(() => {
    if (!walking || path.length) return;
    const next = findPath(at, WALK_STOPS[stop % WALK_STOPS.length]!, APARTMENTS);
    if (next.length) setPath(next);
    setStop((s) => (s + 1) % WALK_STOPS.length);
  }, [walking, path.length, at, stop]);
  const move = useCallback((dx: number, dy: number) => {
    setWalking(false); setPath([]);
    setAt((p) => {
      const target = { x: p.x + dx, y: p.y + dy };
      if (isWalkable(target, APARTMENTS)) { setMessage("demo.msg.follows"); return target; }
      setMessage("demo.msg.blocked"); return p;
    });
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,button"))) return;
      const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
      const direction = directions[event.key]; if (direction) { event.preventDefault(); move(...direction); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [move]);
  const go = (target: Point2) => {
    setWalking(false);
    const next = findPath(at, target, APARTMENTS);
    setPath(next);
    setMessage(next.length ? "demo.msg.walking" : "demo.msg.choose");
  };
  return <main className="lighting-lab">
    <header className="lighting-lab-header">
      <Link href="/" className="tool-button" aria-label={t("demo.home")} title={t("demo.home")}><House size={18} aria-hidden="true" /></Link>
      <div className="lighting-lab-heading"><h1>{t("demo.title")}</h1><span>{t("demo.subtitle")}</span></div>
      <div className="lighting-lab-actions">
        <button className="tool-button" type="button" onClick={() => setTurn((turn) => (turn + 1) % 4)}><ArrowClockwise size={16} aria-hidden="true" />{t("demo.rotate")}</button>
        <button type="button" onClick={() => { if (walking) { setWalking(false); setPath([]); } else setWalking(true); }}>{walking ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{walking ? t("demo.pause") : t("demo.walk")}</button>
      </div>
    </header>
    <div className="lighting-lab-layout">
      <div className="lighting-stage">
        <canvas ref={canvas} tabIndex={0} aria-label={t("demo.canvas")} onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          const rect = event.currentTarget.getBoundingClientRect(), camera = viewport(rect.width, rect.height);
          go(unproject({ x: (event.clientX - rect.left - camera.x) / camera.scale, y: (event.clientY - rect.top - camera.y) / camera.scale }, turn));
        }} />
        <div className="lighting-stage-caption"><span className="lighting-live-dot" />{t("demo.caption")}</div>
      </div>
      <aside className="lighting-lab-panel" aria-label={t("demo.controls")}>
        <section><h2>{t("demo.walkTitle")}</h2><p>{t("demo.walkBody")}</p>
          <div className="lighting-position" role="status">{t("demo.square", { x: Math.floor(at.x) + 1, y: Math.floor(at.y) + 1 })}</div>
          <div className="lighting-move" aria-label={t("demo.move")}>
            <button type="button" aria-label={t("demo.north")} onClick={() => move(0, -1)}>↑</button>
            <button type="button" aria-label={t("demo.west")} onClick={() => move(-1, 0)}>←</button>
            <button type="button" aria-label={t("demo.south")} onClick={() => move(0, 1)}>↓</button>
            <button type="button" aria-label={t("demo.east")} onClick={() => move(1, 0)}>→</button>
          </div>
          <p className="lighting-hint">{t("demo.keys")}</p>
        </section>
        <section><h2>{t("demo.light")}</h2>
          <label>{t("demo.time")}<select value={time} onChange={(event) => setTime(event.target.value as LightingView["time"])}><option value="day">{t("demo.day")}</option><option value="dusk">{t("demo.dusk")}</option><option value="night">{t("demo.night")}</option></select></label>
          <label>{t("demo.height")} <span>{t("demo.feet", { n: (torchHeight * 5).toFixed(0) })}</span><input type="range" min="0.6" max="5" step="0.2" value={torchHeight} onChange={(event) => setTorchHeight(Number(event.target.value))} /></label>
          <label className="lighting-checkbox"><input type="checkbox" checked={cutaway} onChange={(event) => setCutaway(event.target.checked)} />{t("demo.cutaway")}</label>
          <label className="lighting-checkbox"><input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />{t("demo.grid")}</label>
        </section>
        <section><h2>{t("demo.explore")}</h2><div className="lighting-stops">
          <button type="button" className="secondary" onClick={() => go({ x: 9.5, y: 4.5 })}>{t("demo.market")}</button>
          <button type="button" className="secondary" onClick={() => go({ x: 18.5, y: 4.5 })}>{t("demo.behind")}</button>
          <button type="button" className="secondary" onClick={() => go({ x: 1.5, y: 14.5 })}>{t("demo.alley")}</button>
        </div></section>
        <p className="lighting-hint" aria-live="polite">{t(message)}{cutaways > 0 && cutaway ? t("demo.cutawayNote") : ""}</p>
        <button className="secondary" type="button" onClick={() => { setWalking(false); setPath([]); setAt(START); setTurn(0); setTorchHeight(1.2); setMessage("demo.msg.back"); }}>{t("demo.reset")}</button>
        <p className="lighting-demo-note">{t("demo.note")}</p>
      </aside>
    </div>
  </main>;
}
