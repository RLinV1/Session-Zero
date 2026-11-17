import { useEffect, useState } from "react";
import { HandPointing } from "@phosphor-icons/react";
import type { ExampleCursor as Cursor } from "./useExampleRun";

/** The demo's ghost pointer: decoration only, it never takes input. The editor draws the area a drag sweeps out. */
export function ExampleCursor({ cursor }: { cursor: Cursor }) {
  // The arrow turns into a pointing hand for the moment of a click.
  const [clicking, setClicking] = useState(false);
  useEffect(() => {
    if (cursor.pulse === 0) return;
    setClicking(true);
    const timer = window.setTimeout(() => setClicking(false), 600);
    return () => window.clearTimeout(timer);
  }, [cursor.pulse]);
  return (
    <div className="example-layer" aria-hidden="true">
      <div className={`example-cursor${cursor.pressed ? " is-pressed" : ""}`} style={{ transitionDuration: `${cursor.duration ?? 450}ms`, transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
        {cursor.pulse > 0 && <span key={cursor.pulse} className="example-click" />}
        {clicking || cursor.pressed
          ? <HandPointing className="example-hand" size={30} weight="fill" />
          : <svg width="26" height="30" viewBox="0 0 26 30"><path d="M1 1 L1 22 L7 17 L11 27 L15 25 L11 16 L19 16 Z" /></svg>}
      </div>
    </div>
  );
}
