import type { CSSProperties } from "react";

/**
 * Fog drifting between two sections of the home page, made of the board's own fog wisps
 * (public/img/fog), so the page's weather is the table's weather. Decorative and inert.
 */
export function FogDivider({ flip = false }: { flip?: boolean }) {
  const [a, b] = flip ? ["fog-wisp-3", "fog-wisp-2"] : ["fog-wisp-1", "fog-wisp-4"];
  return (
    <div className="fog-divider" aria-hidden="true">
      <span className="fog-wisp" style={{ "--wisp": `url(/img/fog/${a}.webp)` } as CSSProperties} />
      <span className="fog-wisp" style={{ "--wisp": `url(/img/fog/${b}.webp)` } as CSSProperties} />
    </div>
  );
}
