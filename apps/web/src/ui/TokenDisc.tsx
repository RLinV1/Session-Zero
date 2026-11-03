import { useState, type CSSProperties, type ReactNode } from "react";
import { HP_LEVEL_VAR, hpLevel } from "./palette";

/**
 * A token drawn the way the board draws one (design-language: "One token drawing"), for every
 * place outside the board: the home page's maps, library creature cards, roster rows. A disc in
 * the token's colour, its art clipped to the circle, a ring, a hit-point bar when hit points are
 * known, and its initial when it has no art or the art fails to load.
 *
 * The name is always written beside or beneath it, so the disc itself is decorative. `hp` is a
 * fraction of full; `size` sets the disc's diameter; `children` hang beneath it (a name label).
 */
export function TokenDisc(props: {
  name: string;
  color: string;
  image?: string | null;
  hp?: number | null;
  size?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const [artFailed, setArtFailed] = useState(false);
  const art = props.image && !artFailed ? props.image : null;
  const hp = props.hp == null ? null : Math.max(0, Math.min(1, props.hp));
  return (
    <span
      className={props.className ? `token-figure ${props.className}` : "token-figure"}
      style={{ ...(props.size && { "--disc": props.size }), ...props.style } as CSSProperties}
    >
      <span className={art ? "token-disc has-art" : "token-disc"} style={{ backgroundColor: props.color }} aria-hidden="true">
        {art ? (
          <img src={art} alt="" width={192} height={192} loading="lazy" decoding="async" draggable={false} onError={() => setArtFailed(true)} />
        ) : (
          props.name.slice(0, 1)
        )}
      </span>
      {hp !== null && (
        <span className="token-hp">
          <span className="token-hp-fill" style={{ width: `${hp * 100}%`, backgroundColor: HP_LEVEL_VAR[hpLevel(hp)] }} />
        </span>
      )}
      {props.children}
    </span>
  );
}
