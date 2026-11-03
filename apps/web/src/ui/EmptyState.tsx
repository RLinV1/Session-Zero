import { useState, type ReactNode } from "react";

export type EmptyPicture = "empty-rooms" | "empty-library" | "empty-map";

/**
 * Nothing here yet (design-language: "Empty states show the next step"): a picture from the
 * shared lighting brief, one sentence, and, where the viewer can fill it, the one action that
 * does. The picture is atmosphere, so it is hidden from assistive technology, and a picture
 * that fails to load leaves the sentence and action on their own.
 */
export function EmptyState({ picture, children, action }: { picture: EmptyPicture; children: ReactNode; action?: ReactNode }) {
  const [shown, setShown] = useState(true);
  return (
    <div className="empty-state">
      {shown && (
        <img
          className="empty-state-picture"
          src={`/img/ambient/${picture}.webp`}
          alt=""
          width={800}
          height={600}
          loading="lazy"
          decoding="async"
          onError={() => setShown(false)}
        />
      )}
      <p className="empty-state-text">{children}</p>
      {action}
    </div>
  );
}
