import { useEffect, useRef, useState } from "react";

/**
 * True once the element has come within one viewport of the screen, and from then on. Lets a
 * home page demo fetch its code only when the visitor is about to reach it (gm-home: "The
 * board's renderer is not loaded up front"). Without IntersectionObserver it is true at once.
 */
export function useNearViewport<T extends Element>(): [boolean, (el: T | null) => void] {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => () => observer.current?.disconnect(), []);

  const ref = (el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || near) return;
    observer.current = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setNear(true);
        observer.current?.disconnect();
      },
      { rootMargin: "100% 0px" },
    );
    observer.current.observe(el);
  };
  return [near, ref];
}
