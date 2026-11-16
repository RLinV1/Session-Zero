import { useCallback, useEffect, useRef, useState } from "react";
import type { GridSpec, Point } from "@vtt/shared";
import type { TextId } from "../i18n/locale";
import { EXAMPLE_API_EVENT, EXAMPLE_HIGHLIGHT_EVENT, EXAMPLE_SIGHT_EVENT, EXAMPLE_STEPS, exampleBox, exampleCommands, type ExampleApi, type SightExample } from "./tutorialExample";
import { exampleScript } from "./tutorialScripts";

/** The ghost pointer, in screen pixels; `dragFrom` draws the rectangle a drag sweeps out. */
export interface ExampleCursor { x: number; y: number; pulse: number; dragFrom: { x: number; y: number } | null }
export interface ExampleRun {
  /** The lesson whose sample is showing (or was just cancelled); null when there is none. */
  step: string | null;
  captions: TextId[];
  /** The sub-step under way; equal to `captions.length` once all are done. */
  index: number;
  playing: boolean;
  cursor: ExampleCursor | null;
}
const IDLE: ExampleRun = { step: null, captions: [], index: 0, playing: false, cursor: null };

/** The pointer takes this long to arrive, then the sub-step holds before the next one. */
const MOVE_MS = 450;
const HOLD_MS = 600;
const RING = "data-tutorial-ring";
const FALLBACK = { grid: { cellSize: 70, offsetX: 0, offsetY: 0 } as GridSpec, map: { width: 700, height: 700 } };

const apiNow = (): ExampleApi | null => {
  const holder: { api: ExampleApi | null } = { api: null };
  window.dispatchEvent(new CustomEvent(EXAMPLE_API_EVENT, { detail: holder }));
  return holder.api;
};
const centreOf = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
/** A board point on screen, through the editor canvas's own transform. */
const onScreen = (p: Point) => {
  const matrix = document.querySelector<SVGSVGElement>("dialog.map-editor[open] svg.wall-canvas-svg")?.getScreenCTM();
  if (!matrix) return null;
  const q = new DOMPoint(p.x, p.y).matrixTransform(matrix);
  return { x: q.x, y: q.y };
};
const waitFor = async (selector: string, ms: number): Promise<HTMLElement | null> => {
  for (let waited = 0; waited <= ms; waited += 100) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && el.getBoundingClientRect().width > 0) return el;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return null;
};

/**
 * The guest demo's animated Show me (guest-gm-hosting): runs a lesson's script, one captioned sub-step at a time,
 * moving a ghost pointer to the real controls and sending the commands the real tools send. Any real click
 * or key press stops it where it is; it never saves anything.
 */
export function useExampleRun() {
  const [run, setRun] = useState<ExampleRun>(IDLE);
  const token = useRef(0);
  const ringed = useRef<Element | null>(null);
  const turnedOn = useRef(false);
  const cancel = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    token.current++;
    cancel.current?.();
    cancel.current = null;
    ringed.current?.removeAttribute(RING);
    ringed.current = null;
    setRun((r) => (r.playing || r.cursor ? { ...r, playing: false, cursor: null } : r));
  }, []);

  /** Takes the sample out again, so leaving the lesson never asks to save it. */
  const clear = useCallback(async (step: string) => {
    stop();
    if (step === "sight") {
      window.dispatchEvent(new CustomEvent<SightExample>(EXAMPLE_SIGHT_EVENT, { detail: { op: "clear" } }));
      if (turnedOn.current) document.querySelector<HTMLButtonElement>('[data-tutorial-tool="sight-off"]')?.click();
      turnedOn.current = false;
    }
    const api = apiNow(), draft = api?.draft();
    if (api && draft && EXAMPLE_STEPS.has(step) && step !== "grid") {
      for (const command of exampleCommands(step === "sight" ? "walls" : step, draft, api.grid, api.map, true)) await api.command(command);
    }
    setRun(IDLE);
  }, [stop]);

  const start = useCallback(async (step: string) => {
    await clear(step);
    const mine = ++token.current;
    const alive = () => token.current === mine;
    const api = apiNow();
    if (EXAMPLE_STEPS.has(step) && !api) return;
    const script = exampleScript(step, api?.grid ?? FALLBACK.grid, api?.map ?? FALLBACK.map);
    if (script.length === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, reduced ? 60 : ms));
    const stopOnUser = (e: Event) => { if (e.isTrusted) stop(); };
    window.addEventListener("pointerdown", stopOnUser, true);
    window.addEventListener("keydown", stopOnUser, true);
    cancel.current = () => { window.removeEventListener("pointerdown", stopOnUser, true); window.removeEventListener("keydown", stopOnUser, true); };
    const show = (patch: Partial<ExampleRun>) => { if (alive()) setRun((r) => ({ ...r, ...patch })); };
    const point = (at: { x: number; y: number } | null, dragFrom: ExampleCursor["dragFrom"] = null) => {
      if (reduced || !at || !alive()) return;
      setRun((r) => ({ ...r, cursor: { x: at.x, y: at.y, pulse: r.cursor?.pulse ?? 0, dragFrom } }));
    };
    const pulse = () => { if (!reduced && alive()) setRun((r) => (r.cursor ? { ...r, cursor: { ...r.cursor, pulse: r.cursor.pulse + 1 } } : r)); };
    const unring = () => { ringed.current?.removeAttribute(RING); ringed.current = null; };

    setRun({ step, captions: script.map((s) => s.caption), index: 0, playing: true, cursor: null });
    const box = api && step !== "grid" ? exampleBox(api.grid, api.map) : null;
    // Frame the sample area first, so every board point the pointer visits stays where it is.
    if (box) { window.dispatchEvent(new CustomEvent(EXAMPLE_HIGHLIGHT_EVENT, { detail: box })); await wait(500); }
    for (let i = 0; i < script.length && alive(); i++) {
      const sub = script[i]!;
      if (sub.skip?.()) continue;
      show({ index: i });
      unring();
      const el = sub.control ? await waitFor(sub.control, 3000) : null;
      if (!alive()) return;
      if (el) { el.scrollIntoView({ block: "nearest", inline: "nearest" }); el.setAttribute(RING, ""); ringed.current = el; }
      if (sub.from) { point(onScreen(sub.from)); await wait(MOVE_MS); }
      const target = sub.at ? onScreen(sub.at) : el ? centreOf(el) : null;
      point(target, sub.from ? onScreen(sub.from) : null);
      await wait(MOVE_MS);
      if (!alive()) return;
      if (sub.click || sub.press) pulse();
      if (sub.press && el && !(el as HTMLButtonElement).disabled) {
        if (sub.control?.includes("sight-on")) turnedOn.current = true;
        el.click();
      }
      await sub.run?.(api!);
      await wait(HOLD_MS);
    }
    if (!alive()) return;
    unring();
    cancel.current?.();
    cancel.current = null;
    show({ index: script.length, playing: false, cursor: null });
    if (box) window.dispatchEvent(new CustomEvent(EXAMPLE_HIGHLIGHT_EVENT, { detail: box }));
  }, [clear, stop]);

  useEffect(() => stop, [stop]);
  return { run, start, stop, clear };
}
