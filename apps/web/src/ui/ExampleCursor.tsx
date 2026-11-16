import type { ExampleCursor as Cursor } from "./useExampleRun";

/** The demo's ghost pointer (and the rectangle a drag sweeps out): decoration only, it never takes input. */
export function ExampleCursor({ cursor }: { cursor: Cursor }) {
  const from = cursor.dragFrom;
  return (
    <div className="example-layer" aria-hidden="true">
      {from && <div className="example-drag" style={{ left: Math.min(from.x, cursor.x), top: Math.min(from.y, cursor.y), width: Math.abs(cursor.x - from.x), height: Math.abs(cursor.y - from.y) }} />}
      <div className="example-cursor" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
        {cursor.pulse > 0 && <span key={cursor.pulse} className="example-click" />}
        <svg width="26" height="30" viewBox="0 0 26 30"><path d="M1 1 L1 22 L7 17 L11 27 L15 25 L11 16 L19 16 Z" /></svg>
      </div>
    </div>
  );
}
