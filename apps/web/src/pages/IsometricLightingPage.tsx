import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, House, Pause, Play } from "@phosphor-icons/react";
import { Link } from "../Link";
import { APARTMENTS, START, WALK_STOPS } from "../lighting/apartments";
import { findPath, isWalkable, unproject, type Point2 } from "../lighting/isometric";
import { renderApartments, viewport, type LightingView } from "../lighting/renderApartments";
import "./isometricLighting.css";

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
  const [message, setMessage] = useState("Click a street square or use the movement controls.");
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
      if (isWalkable(target, APARTMENTS)) { setMessage("Light follows your position."); return target; }
      setMessage("An apartment blocks that square."); return p;
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
    setMessage(next.length ? "Walking around the buildings." : "Choose an open street square.");
  };
  return <main className="lighting-lab">
    <header className="lighting-lab-header">
      <Link href="/" className="tool-button" aria-label="Home" title="Home"><House size={18} aria-hidden="true" /></Link>
      <div className="lighting-lab-heading"><h1>Lantern Court</h1><span>Isometric lighting demo</span></div>
      <div className="lighting-lab-actions">
        <button className="tool-button" type="button" onClick={() => setTurn((t) => (t + 1) % 4)}><ArrowClockwise size={16} aria-hidden="true" />Rotate view</button>
        <button type="button" onClick={() => { if (walking) { setWalking(false); setPath([]); } else setWalking(true); }}>{walking ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{walking ? "Pause walk" : "Walk demo"}</button>
      </div>
    </header>
    <div className="lighting-lab-layout">
      <div className="lighting-stage">
        <canvas ref={canvas} tabIndex={0} aria-label="Isometric apartment courtyard. Click an open street square to move the torch bearer." onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          const rect = event.currentTarget.getBoundingClientRect(), camera = viewport(rect.width, rect.height);
          go(unproject({ x: (event.clientX - rect.left - camera.x) / camera.scale, y: (event.clientY - rect.top - camera.y) / camera.scale }, turn));
        }} />
        <div className="lighting-stage-caption"><span className="lighting-live-dot" />Position-based shadows · raised buildings</div>
      </div>
      <aside className="lighting-lab-panel" aria-label="Lighting controls">
        <section><h2>Walk the courtyard</h2><p>Move around the apartments. Your torch lights the paving and leaves shadows behind the buildings.</p>
          <div className="lighting-position" role="status">Square {Math.floor(at.x) + 1}, {Math.floor(at.y) + 1}</div>
          <div className="lighting-move" aria-label="Move torch bearer">
            <button type="button" aria-label="Move north" onClick={() => move(0, -1)}>↑</button>
            <button type="button" aria-label="Move west" onClick={() => move(-1, 0)}>←</button>
            <button type="button" aria-label="Move south" onClick={() => move(0, 1)}>↓</button>
            <button type="button" aria-label="Move east" onClick={() => move(1, 0)}>→</button>
          </div>
          <p className="lighting-hint">Arrow keys / WASD · click to walk</p>
        </section>
        <section><h2>Light & atmosphere</h2>
          <label>Time of day<select value={time} onChange={(event) => setTime(event.target.value as LightingView["time"])}><option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option></select></label>
          <label>Light height <span>{(torchHeight * 5).toFixed(0)} ft</span><input type="range" min="0.6" max="5" step="0.2" value={torchHeight} onChange={(event) => setTorchHeight(Number(event.target.value))} /></label>
          <label className="lighting-checkbox"><input type="checkbox" checked={cutaway} onChange={(event) => setCutaway(event.target.checked)} />Reveal foreground buildings</label>
          <label className="lighting-checkbox"><input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />Show movement grid</label>
        </section>
        <section><h2>Explore</h2><div className="lighting-stops">
          <button type="button" className="secondary" onClick={() => go({ x: 9.5, y: 4.5 })}>Market street</button>
          <button type="button" className="secondary" onClick={() => go({ x: 18.5, y: 4.5 })}>Behind the apartments</button>
          <button type="button" className="secondary" onClick={() => go({ x: 1.5, y: 14.5 })}>Lantern alley</button>
        </div></section>
        <p className="lighting-hint" aria-live="polite">{message}{cutaways > 0 && cutaway ? " Foreground buildings are cut away to keep your token visible." : ""}</p>
        <button className="secondary" type="button" onClick={() => { setWalking(false); setPath([]); setAt(START); setTurn(0); setTorchHeight(1.2); setMessage("Back at the courtyard entrance."); }}>Reset position</button>
        <p className="lighting-demo-note">A local rendering demo. Room maps and shared game state are unchanged.</p>
      </aside>
    </div>
  </main>;
}
