import { useEffect, useRef, useState } from "react";
import type { LibraryAnimation } from "@vtt/shared";
import { animationThumbnail, cachedAnimationThumbnail, thumbnailKey } from "../board/animationThumbnail";

import { t } from "../i18n/locale";
/** One cached still, requested only near the viewport. No canvas or animation loop per card. */
export function AnimationThumbnail({ animation }: { animation: LibraryAnimation }) {
  const host = useRef<HTMLDivElement>(null);
  const key = thumbnailKey(animation.def);
  const [image, setImage] = useState(() => ({ key, url: cachedAnimationThumbnail(animation.def) }));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let requested = false;
    setFailed(false);
    const load = () => {
      if (requested) return;
      requested = true;
      void animationThumbnail(animation.def).then((url) => {
        if (!live) return;
        setImage({ key, url: url ?? undefined });
        setFailed(url === null);
      });
    };
    const known = cachedAnimationThumbnail(animation.def);
    if (known) setImage({ key, url: known });
    else if (typeof IntersectionObserver === "undefined") load();
    const observer = known || typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: "160px" });
    if (host.current) observer?.observe(host.current);
    return () => { live = false; observer?.disconnect(); };
  }, [key, animation.def]);

  const url = image.key === key ? image.url : undefined;
  return (
    <div ref={host} className="asset-thumb animation-thumb" aria-busy={!url && !failed}>
      {url ? <img src={url} alt={t("thumb.previewOf", { name: animation.name })} width={240} height={180} decoding="async" /> : (
        <div className="animation-thumb-placeholder">
          <svg viewBox="0 0 240 180" aria-hidden="true">
            <path d="M0 45H240M0 90H240M0 135H240M60 0V180M120 0V180M180 0V180" stroke="currentColor" opacity="0.12" />
            <circle cx="53" cy="90" r="12" fill="#3b82f6" />
            <circle cx="187" cy="90" r="12" fill="#ef4444" />
            <path d="M77 90H163M153 83L163 90L153 97" fill="none" stroke={animation.def.primary} strokeWidth="3" />
          </svg>
          <span>{failed ? t("thumb.unavailable") : t("thumb.preparing")}</span>
        </div>
      )}
    </div>
  );
}
