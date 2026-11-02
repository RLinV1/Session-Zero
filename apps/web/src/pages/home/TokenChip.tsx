import type { CSSProperties } from "react";
import { TokenDisc } from "../../ui/TokenDisc";
import { atPoint, inSquare, type CropView } from "./crops";
import { squareCenter } from "./sightDemo";

/**
 * A token on a home crop, as the board draws one (ui/TokenDisc): a coloured disc with an
 * initial, or with the token's art clipped to it, and a hit-point bar, its name beneath. As on
 * the board, art that fails to load leaves the coloured disc.
 */
export function TokenChip(props: {
  name: string;
  color: string;
  hp: number;
  image?: string;
  /** The grid square the token stands in, on its home crop. */
  at: { col: number; row: number };
  /** The part of the crop on show, when it is not the whole crop. */
  view?: CropView;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const place = props.view ? atPoint(props.view, squareCenter(props.at.col, props.at.row)) : inSquare(props.at.col, props.at.row);
  return (
    <TokenDisc
      className={props.className ? `token-chip ${props.className}` : "token-chip"}
      name={props.name}
      color={props.color}
      image={props.image}
      hp={props.hp / 100}
      style={{ ...place, animationDelay: `${props.delay ?? 0}ms`, ...props.style }}
    >
      <span className="token-label">{props.name}</span>
    </TokenDisc>
  );
}
