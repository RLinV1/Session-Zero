import type { Layer } from "../theme";

/**
 * The lit table behind a page (design-language: "Background by layer"). Each layer gets its own
 * amount of it: the home page the full lamp rig and grain (its sections add the grid behind the
 * hero and fog between them); the entry pages a dimmed photograph of the table, the lamp at half
 * strength and grain; the hub pages a faint glow along the top and grain. The table draws none:
 * there the board's own fog and line of sight do the lighting.
 *
 * Every part is fixed to the viewport and takes no pointer input, so it never scrolls, never
 * shifts layout and never catches a click meant for the page.
 */
export function Ambient({ layer }: { layer: Layer }) {
  if (layer === "table") return null;
  return (
    <div className="ambient" data-ambient={layer} aria-hidden="true">
      {layer === "entry" && <div className="ambient-plate" />}
      <div className="ambient-lamp" />
      <div className="ambient-grain" />
    </div>
  );
}
