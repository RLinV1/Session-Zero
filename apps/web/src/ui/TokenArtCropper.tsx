import { ArrowCounterClockwise, MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Modal } from "./Modal";
import { clampOffset, clampZoom, coverScale, MAX_ZOOM, MIN_ZOOM, sourceRect, type Offset } from "./tokenArtCrop";

const VIEW = 256; // css px of the editing circle
const OUT = 512; // baked output edge in px
const LIVE = 44 / VIEW; // live round preview edge (44px) relative to the editing circle
// The server's upload allowlist (apps/server/src/http/imageUpload.ts).
const CROPPABLE = ["image/png", "image/jpeg", "image/webp"];

/** Anything else (GIF...) skips cropping and goes to the upload unchanged; the server decides. */
export const isCroppable = (file: File) => CROPPABLE.includes(file.type);

/** Frames token art inside the board's circle, then hands a square File to `onConfirm`. */
export function TokenArtCropper({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (cropped: File) => void }) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    createImageBitmap(file, { imageOrientation: "from-image" }).then(
      (b) => {
        if (!live) return b.close();
        url = URL.createObjectURL(file);
        setBitmap(b);
        setSrc(url);
      },
      () => live && setError("Could not read that image"),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => () => bitmap?.close(), [bitmap]);

  const w = bitmap?.width ?? 1;
  const h = bitmap?.height ?? 1;
  const apply = (z: number, o: Offset) => {
    const nz = clampZoom(z);
    setZoom(nz);
    setOffset(clampOffset(o, w, h, nz, VIEW));
  };

  // Native listener: React's onWheel is passive and could not stop the page scrolling.
  const latest = useRef({ apply, zoom, offset });
  latest.current = { apply, zoom, offset };
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const l = latest.current;
      l.apply(l.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), l.offset);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [bitmap]);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  };

  async function confirm() {
    if (!bitmap) return;
    const { sx, sy, size } = sourceRect(w, h, zoom, offset, VIEW);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setError("Cropping is not supported in this browser");
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, OUT, OUT);
    const type = file.type; // PNG/WebP keep their transparency
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.92));
    if (!blob) return setError("Could not crop that image");
    const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
    onConfirm(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type }));
  }

  const scale = coverScale(w, h, VIEW) * zoom;
  const nudge = (dx: number, dy: number) => apply(zoom, { x: offset.x + dx, y: offset.y + dy });
  const keys: Record<string, () => void> = {
    ArrowLeft: () => nudge(-8, 0),
    ArrowRight: () => nudge(8, 0),
    ArrowUp: () => nudge(0, -8),
    ArrowDown: () => nudge(0, 8),
    "+": () => apply(zoom * 1.1, offset),
    "=": () => apply(zoom * 1.1, offset),
    "-": () => apply(zoom / 1.1, offset),
  };
  const release = (id: number) => {
    pointers.current.delete(id);
    pinch.current = null;
  };

  return (
    <Modal open title="Frame token art" onClose={onCancel}>
      <div className="stack token-cropper">
        <div className="token-cropper-body">
        {error ? (
          <p role="alert" className="error">{error}</p>
        ) : (
          <div className="token-cropper-backdrop">
          <div
            ref={stage}
            className="token-cropper-stage"
            tabIndex={0}
            role="group"
            aria-label="Token art framing. Drag to move, arrow keys nudge, plus and minus zoom."
            style={{ width: VIEW, height: VIEW }}
            onKeyDown={(e) => {
              const k = keys[e.key];
              if (k) {
                e.preventDefault();
                k();
              }
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pointers.current.size === 2) pinch.current = { dist: dist(), zoom };
            }}
            onPointerMove={(e) => {
              const prev = pointers.current.get(e.pointerId);
              if (!prev) return;
              pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pointers.current.size === 2 && pinch.current) apply(pinch.current.zoom * (dist() / pinch.current.dist), offset);
              else if (pointers.current.size === 1) nudge(e.clientX - prev.x, e.clientY - prev.y);
            }}
            onPointerUp={(e) => release(e.pointerId)}
            onPointerCancel={(e) => release(e.pointerId)}
          >
            {src && bitmap && (
              <img src={src} alt="" draggable={false} style={{ width: w * scale, height: h * scale, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }} />
            )}
            <span className="token-cropper-mask" aria-hidden="true" />
            <span className="token-cropper-guide" aria-hidden="true" />
          </div>
          </div>
        )}
        <div className="token-cropper-side">
        <p className="muted token-cropper-hint">Drag to move, scroll or use the slider to zoom.</p>
        <div className="row token-cropper-tools">
          <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" disabled={!bitmap} onClick={() => apply(zoom / 1.1, offset)}>
            <MagnifyingGlassMinus size={18} />
          </button>
          <input type="range" aria-label="Zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={zoom} disabled={!bitmap} style={{ "--fill": `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` } as CSSProperties} onChange={(e) => apply(Number(e.target.value), offset)} />
          <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" disabled={!bitmap} onClick={() => apply(zoom * 1.1, offset)}>
            <MagnifyingGlassPlus size={18} />
          </button>
        </div>
        <div className="row token-cropper-readout">
          <output className="token-cropper-zoom" aria-live="off">{Math.round(zoom * 100)}%</output>
          <button type="button" className="icon-button" aria-label="Reset framing" title="Reset framing" disabled={!bitmap} onClick={() => apply(1, { x: 0, y: 0 })}>
            <ArrowCounterClockwise size={18} />
          </button>
        </div>
        </div>
        </div>
        <div className="row modal-actions token-cropper-footer">
          {src && bitmap && (
            <span className="token-cropper-live" aria-hidden="true">
              <img src={src} alt="" draggable={false} style={{ width: w * scale * LIVE, height: h * scale * LIVE, transform: `translate(calc(-50% + ${offset.x * LIVE}px), calc(-50% + ${offset.y * LIVE}px))` }} />
            </span>
          )}
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" disabled={!bitmap} onClick={() => void confirm()}>Use art</button>
        </div>
      </div>
    </Modal>
  );
}
