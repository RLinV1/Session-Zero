import { useCallback, useEffect, useRef, useState } from "react";
import type { GridSpec, Point } from "@vtt/shared";
import type { TextId } from "../i18n/locale";
import { EXAMPLE_API_EVENT, EXAMPLE_HIGHLIGHT_EVENT, EXAMPLE_SIGHT_EVENT, EXAMPLE_STEPS, exampleBoard, exampleBox, sampleCleanup, type ExampleApi, type SightExample } from "./tutorialExample";
import type { MapDraft } from "../pages/mapEditor/mapDraft";
import { exampleScript } from "./tutorialScripts";

/** The ghost pointer, in screen pixels; `dragFrom` draws the rectangle a drag sweeps out. */
export interface ExampleCursor { x: number; y: number; pulse: number; dragFrom: { x: number; y: number } | null; pressed?: boolean; duration?: number }
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
const MOVE_MS = 850;
const HOLD_MS = 1800;
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
  const matrix = document.querySelector<SVGSVGElement>("dialog.map-editor[open] svg.wall-canvas-svg, dialog.map-editor[open] svg.map-grid-canvas")?.getScreenCTM();
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
 * or key press stops it where it is. Editor samples stay in the private draft; board actions use the normal room flow.
 */
export function useExampleRun() {
  const [run, setRun] = useState<ExampleRun>(IDLE);
  const token = useRef(0);
  const ringed = useRef<Element | null>(null);
  const sample = useRef<{ session: object; before: MapDraft; after: MapDraft } | null>(null);
  const pendingSample = useRef(false);
  const cancel = useRef<(() => void) | null>(null);
  const releasePointer = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    // Capture a draft command already applied when a real click interrupts before the next animation tick.
    if (pendingSample.current && sample.current) {
      const api = apiNow(), draft = api?.draft();
      if (api?.session === sample.current.session && draft) sample.current.after = draft;
    }
    pendingSample.current = false;
    token.current++;
    releasePointer.current?.();
    releasePointer.current = null;
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
    }
    const api = apiNow(), draft = api?.draft();
    const previous = sample.current;
    sample.current = null;
    if (api && draft && previous?.session === api.session) {
      for (const command of sampleCleanup(previous.before, previous.after, draft)) await api.command(command);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    setRun(IDLE);
  }, [stop]);

  const start = useCallback(async (step: string) => {
    const clearing = clear(step);
    const mine = token.current;
    const alive = () => token.current === mine;
    await clearing;
    if (!alive()) return;
    const api = apiNow();
    if (EXAMPLE_STEPS.has(step) && !api) return;
    const script = exampleScript(step, api?.grid ?? FALLBACK.grid, api?.map ?? FALLBACK.map);
    if (script.length === 0) return;
    const before = api?.draft();
    if (api && before && step !== "grid") sample.current = { session: api.session, before, after: before };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const moveMs = step === "invite" ? 700 : MOVE_MS;
    const holdMs = step === "invite" ? 1400 : HOLD_MS;
    // Browser tests slow the pace to catch each frame (`window.__tutorialPace`); it is 1 for everyone else.
    const pace = (window as { __tutorialPace?: number }).__tutorialPace ?? 1;
    // Reduced motion hides the pointer, but captions still need time to be read.
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms * pace));
    const stopOnUser = (e: Event) => { if (e.isTrusted) stop(); };
    window.addEventListener("pointerdown", stopOnUser, true);
    window.addEventListener("keydown", stopOnUser, true);
    cancel.current = () => { window.removeEventListener("pointerdown", stopOnUser, true); window.removeEventListener("keydown", stopOnUser, true); };
    const show = (patch: Partial<ExampleRun>) => { if (alive()) setRun((r) => ({ ...r, ...patch })); };
    const point = (at: { x: number; y: number } | null, dragFrom: ExampleCursor["dragFrom"] = null) => {
      if (reduced || !at || !alive()) return;
      setRun((r) => ({ ...r, cursor: { x: at.x, y: at.y, pulse: r.cursor?.pulse ?? 0, dragFrom, pressed: !!dragFrom, duration: moveMs * pace } }));
    };
    const pulse = () => { if (!reduced && alive()) setRun((r) => (r.cursor ? { ...r, cursor: { ...r.cursor, pulse: r.cursor.pulse + 1 } } : r)); };
    const unring = () => { ringed.current?.removeAttribute(RING); ringed.current = null; };

    setRun({ step, captions: script.map((s) => s.caption), index: 0, playing: true, cursor: reduced ? null : { x: window.innerWidth / 2, y: window.innerHeight - 40, pulse: 0, dragFrom: null } });
    // Mount at the starting point before setting the first destination, so CSS can interpolate it.
    await wait(80);
    const box = api ? exampleBox(api.grid, api.map) : null;
    // Frame the sample area first, so every board point the pointer visits stays where it is.
    if (box) { window.dispatchEvent(new CustomEvent(EXAMPLE_HIGHLIGHT_EVENT, { detail: box })); await wait(500); }
    for (let i = 0; i < script.length && alive(); i++) {
      const sub = script[i]!;
      if (sub.skip?.()) continue;
      show({ index: i });
      unring();
      const el = sub.control ? await waitFor(sub.control, 3000) : null;
      if (!alive()) return;
      if (sub.control && !el) { stop(); return; }
      if (el) { el.scrollIntoView({ block: "nearest", inline: "nearest" }); el.setAttribute(RING, ""); ringed.current = el; }
      // A phone can resize or scroll the board when its sidebar opens. Sample coordinates after that layout settles.
      if (sub.board) { await wait(400); if (!alive()) return; }
      const resolve = (value: typeof sub.at) => {
        const p = typeof value === "function" ? value() : value;
        return p ? sub.board ? exampleBoard()?.screen(p) ?? null : onScreen(p) : null;
      };
      const from = resolve(sub.from);
      const target = resolve(sub.at) ?? (el ? centreOf(el) : null);
      if (sub.board && (!target || (sub.from && !from))) { stop(); return; }
      const pointer = (type: string, at: Point, buttons: number) => el?.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: at.x, clientY: at.y, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons }));
      if (from) {
        point(from);
        await wait(moveMs);
        if (!alive()) return;
        pulse();
        point(from, from);
        if (sub.board) {
          pointer("pointerdown", from, 1);
          releasePointer.current = () => exampleBoard()?.cancel();
        }
        await wait(80);
      }
      if (!alive()) return;
      point(target, from);
      // Feed the real canvas a continuous drag while CSS moves the decorative pointer on the compositor.
      let dragTimer = 0;
      if (sub.board && from && target) {
        const began = performance.now();
        dragTimer = window.setInterval(() => {
          if (!alive()) { window.clearInterval(dragTimer); return; }
          const progress = Math.min(1, (performance.now() - began) / (moveMs * pace));
          const eased = progress * progress * (3 - 2 * progress);
          pointer("pointermove", { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased }, 1);
        }, 16);
      }
      await wait(moveMs);
      window.clearInterval(dragTimer);
      if (!alive()) return;
      if (sub.click || sub.press) pulse();
      if (sub.board && target) {
        pointer("pointermove", target, from ? 1 : 0);
        if (!from) pointer("pointerdown", target, 1);
        pointer("pointerup", target, 0);
        releasePointer.current = null;
        point(target);
      }
      if (sub.input !== undefined && el instanceof HTMLInputElement) {
        pulse();
        el.focus({ preventScroll: true });
        const value = typeof sub.input === "function" ? sub.input() : sub.input;
        const type = (text: string) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        if (el.type === "number" || reduced) type(value);
        else for (let end = 1; end <= value.length && alive(); end++) { type(value.slice(0, end)); await wait(65); }
      }
      if (!alive()) return;
      pendingSample.current = !!sample.current;
      if (sub.press && el && !(el as HTMLButtonElement).disabled) {
        el.click();
      }
      await sub.run?.(api!);
      // Draft commands update React state; record their result after that render, before a guest can edit it.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const after = api?.draft();
      if (sample.current && after && alive()) sample.current.after = after;
      pendingSample.current = false;
      await wait(holdMs);
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
