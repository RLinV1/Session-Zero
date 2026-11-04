/** Pure framing math for the token-art cropper. `view` is the circle's diameter in px. */
export interface Offset { x: number; y: number }

/** Image scale at zoom 1: the short edge exactly fills the circle (cover-fit). */
export const coverScale = (w: number, h: number, view: number) => view / Math.min(w, h);

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Offset = how far the image centre sits from the circle centre. Keeps the circle fully covered. */
export function clampOffset(o: Offset, w: number, h: number, zoom: number, view: number): Offset {
  const s = coverScale(w, h, view) * zoom;
  const mx = Math.max(0, (w * s - view) / 2);
  const my = Math.max(0, (h * s - view) / 2);
  return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
}

/** The square region of the source image that sits under the circle's bounding square. */
export function sourceRect(w: number, h: number, zoom: number, o: Offset, view: number) {
  const s = coverScale(w, h, view) * zoom;
  return { sx: w / 2 - (view / 2 + o.x) / s, sy: h / 2 - (view / 2 + o.y) / s, size: view / s };
}
