/**
 * A map's grid, drawn in the map's own pixels so it lands on the same squares at any display
 * size. Lines keep a hairline width however far the map is scaled down. `fit` follows the
 * image under it: "fill" when the image is shown whole at its own shape, "cover" when it is
 * cropped to its frame (object-fit: cover), so the lines stay on the map's squares either way.
 * `cellY` is for a drawn grid whose squares aren't quite square; it defaults to `cell`.
 */
export function MapGrid(props: {
  width: number;
  height: number;
  cell: number;
  cellY?: number;
  offsetX?: number;
  offsetY?: number;
  variant: "faint" | "light" | "app";
  fit?: "fill" | "cover";
}) {
  const { width, height, cell, cellY = cell, offsetX = 0, offsetY = 0 } = props;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = offsetX; x <= width; x += cell) xs.push(x);
  for (let y = offsetY; y <= height; y += cellY) ys.push(y);
  return (
    <svg
      className={`map-grid map-grid-${props.variant}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={props.fit === "cover" ? "xMidYMid slice" : "none"}
      aria-hidden="true"
    >
      {xs.map((x) => (
        <line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} vectorEffect="non-scaling-stroke" />
      ))}
      {ys.map((y) => (
        <line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
