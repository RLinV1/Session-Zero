import { useEffect, useState } from "react";
import type { RoomPreview } from "@vtt/shared";
import { api } from "../net/api";
import { MapThumbnail } from "./MapThumbnail";
import { useNearViewport } from "./nearViewport";

import { t } from "../i18n/locale";
type PreviewState = { status: "loading" } | { status: "loaded"; preview: RoomPreview } | { status: "failed" };

/**
 * A hosted room's board as a picture on its dashboard card (gm-dashboard), so a GM picks the
 * room by its map rather than its name alone: the map cropped to the frame, then the fog and
 * tokens as the GM sees them, hidden tokens dimmed. Fetched once the card nears the screen.
 * Decorative: the card names the room beside it.
 */
export function RoomBoardPreview({ roomId }: { roomId: string }) {
  const [near, ref] = useNearViewport<HTMLSpanElement>();
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    if (!near) return;
    let live = true;
    api.me.roomPreview(roomId).then(
      (preview) => live && setState({ status: "loaded", preview }),
      () => live && setState({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [near, roomId]);

  const preview = state.status === "loaded" ? state.preview : null;
  const map = preview?.map;
  return (
    <span ref={ref} className="room-preview" aria-hidden="true">
      {preview && map ? (
        <MapThumbnail
          url={map.url}
          width={map.width}
          height={map.height}
          grid={preview.grid}
          overlay={<BoardMarks preview={preview} width={map.width} height={map.height} />}
        />
      ) : (
        <span className={`room-preview-empty is-${state.status}`}>{preview && t("thumb.noMap")}</span>
      )}
    </span>
  );
}

/** Fog and tokens in the map's own pixels, cropped like the map under them. */
function BoardMarks({ preview, width, height }: { preview: RoomPreview; width: number; height: number }) {
  const cell = preview.grid.cellSize;
  return (
    <svg className="room-preview-marks" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
      {preview.fog.map((points, i) => (
        <polygon key={`f${i}`} className="room-preview-fog" points={points.map((p) => `${p.x},${p.y}`).join(" ")} />
      ))}
      {preview.tokens.map((token, i) => {
        const radius = (token.size * cell) / 2;
        const { x, y } = token.position;
        return (
          <g key={`t${i}`} opacity={token.hidden ? 0.45 : 1}>
            <circle cx={x} cy={y} r={radius} fill={token.color} />
            {token.imageUrl && (
              <image
                href={token.imageUrl}
                x={x - radius}
                y={y - radius}
                width={radius * 2}
                height={radius * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`circle(${radius}px at ${radius}px ${radius}px)`}
              />
            )}
            <circle cx={x} cy={y} r={radius} fill="none" stroke="#fff" strokeWidth={Math.max(2, radius / 8)} />
          </g>
        );
      })}
    </svg>
  );
}
