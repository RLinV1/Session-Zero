import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { hexToHsv, hsvToHex, hueSatToPoint, isHex, pointToHueSat, type Hsv } from "./color";

const SIZE = 136;
const RADIUS = SIZE / 2;
/** Quick picks: the historical grid, white for dark maps, and the app's accent. */
const SWATCHES = [
  { hex: "#000000", name: "Black" },
  { hex: "#ffffff", name: "White" },
  { hex: "#b9582f", name: "Rust" },
];

/**
 * Colour wheel for the grid line colour (grid-line-style). The disc is the hue and
 * saturation plane at full brightness, so it never renders as a black circle when the
 * current colour is dark; brightness has its own slider. Keeps its own HSV so hue
 * survives passing through black or grey, where hex loses it.
 */
export function ColorWheel({ value, onChange, label, disabled = false }: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value);
  const hexErrorId = useId();
  const hexInvalid = !isHex(hexDraft);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Follow an outside change (a swatch, a reset), but not our own echo.
  useEffect(() => {
    if (value.toLowerCase() !== hsvToHex(hsv)) setHsv(hexToHsv(value));
    setHexDraft(value);
  }, [value]);

  // The disc never changes, so it is painted once.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const px = Math.round(SIZE * Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = px;
    canvas.height = px;
    const image = ctx.createImageData(px, px);
    const r = px / 2;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const dx = x + 0.5 - r;
        const dy = y + 0.5 - r;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const { h, s } = pointToHueSat(dx, dy, r);
        const n = Number.parseInt(hsvToHex({ h, s, v: 1 }).slice(1), 16);
        const i = (y * px + x) * 4;
        image.data[i] = (n >> 16) & 255;
        image.data[i + 1] = (n >> 8) & 255;
        image.data[i + 2] = n & 255;
        // Soften the rim by a pixel rather than leaving a jagged edge.
        image.data[i + 3] = Math.round(255 * Math.min(1, r - dist + 0.5));
      }
    }
    ctx.putImageData(image, 0, 0);
  }, []);

  const commit = (next: Hsv) => {
    if (disabled) return;
    setHsv(next);
    onChange(hsvToHex(next));
  };

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { h, s } = pointToHueSat(e.clientX - rect.left - RADIUS, e.clientY - rect.top - RADIUS, RADIUS);
    // Picking on the wheel means "this hue": lift brightness off black so the pick shows.
    commit({ h, s, v: hsv.v < 0.15 ? 1 : hsv.v });
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowDown: [0, -0.05], ArrowUp: [0, 0.05] }[e.key];
    if (!step) return;
    e.preventDefault();
    commit({ ...hsv, h: (hsv.h + step[0]! + 360) % 360, s: Math.min(1, Math.max(0, hsv.s + step[1]!)) });
  };

  const marker = hueSatToPoint(hsv.h, hsv.s, RADIUS - 1);
  const hex = hsvToHex(hsv);
  const pureHue = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });

  return (
    <div className="color-wheel">
      <div
        className="color-wheel-disc"
        style={{ width: SIZE, height: SIZE }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={`${label}: hue and saturation`}
        aria-valuetext={hex}
        aria-valuenow={Math.round(hsv.h)}
        aria-valuemin={0}
        aria-valuemax={359}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (disabled) return;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
        }}
      >
        <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE }} aria-hidden="true" />
        <span
          className="color-wheel-marker"
          style={{ transform: `translate(${RADIUS + marker.x}px, ${RADIUS + marker.y}px)`, background: hex }}
          aria-hidden="true"
        />
      </div>
      <div className="color-wheel-controls">
        <label className="range-field">
          <span className="range-label">Brightness</span>
          <input
            type="range"
            className="range range-brightness"
            min={0}
            max={100}
            value={Math.round(hsv.v * 100)}
            disabled={disabled}
            style={{ "--range-to": pureHue } as CSSProperties}
            onChange={(e) => commit({ ...hsv, v: Number(e.target.value) / 100 })}
          />
        </label>
        <div className="color-wheel-row">
          <label className="color-wheel-hex">
            <span className="sr-only">Hex colour</span>
            <span className="color-wheel-chip" style={{ background: hex }} aria-hidden="true" />
            <input
              value={hexDraft}
              disabled={disabled}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={hexInvalid}
              aria-describedby={hexInvalid ? hexErrorId : undefined}
              onChange={(e) => {
                const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                setHexDraft(next);
                if (isHex(next)) {
                  setHsv(hexToHsv(next));
                  onChange(next.toLowerCase());
                }
              }}
            />
          </label>
          <div className="color-wheel-swatches" role="group" aria-label="Quick colours">
            {SWATCHES.map((s) => (
              <button
                key={s.hex}
                type="button"
                disabled={disabled}
                className="color-swatch"
                style={{ background: s.hex }}
                aria-label={s.name}
                aria-pressed={hex === s.hex}
                title={s.name}
                onClick={() => {
                  setHsv(hexToHsv(s.hex));
                  onChange(s.hex);
                }}
              />
            ))}
          </div>
        </div>
        {/* Said in words, not only by the red border (WCAG 1.4.1, 3.3.1). */}
        {hexInvalid && <p id={hexErrorId} className="error color-wheel-error">Enter a hex colour like #b3552d.</p>}
      </div>
    </div>
  );
}
