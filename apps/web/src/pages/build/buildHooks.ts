import { useEffect, useState } from "react";

/**
 * Which of a list is shown, chosen by the person or by a link to `#<prefix><key>`, so a fix's
 * link to "Scene 4" opens Scene 4 in the encounter board as well as scrolling to it.
 */
export function useHashKey(prefix: string, keys: readonly string[]): [string | null, (key: string) => void] {
  const fromHash = () => {
    const hash = typeof location === "undefined" ? "" : location.hash.slice(1);
    const key = hash.startsWith(prefix) ? hash.slice(prefix.length) : null;
    return key !== null && keys.includes(key) ? key : null;
  };
  const [picked, setPicked] = useState<string | null>(fromHash);
  const joined = keys.join("\n");
  useEffect(() => {
    const follow = () => { const key = fromHash(); if (key) setPicked(key); };
    follow();
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, [prefix, joined]); // `fromHash` reads `keys`, whose contents are in `joined`
  return [picked !== null && keys.includes(picked) ? picked : keys[0] ?? null, setPicked];
}

/** Whether a media query matches, following it as the window changes. False where there is no `matchMedia`. */
export function useMedia(query: string): boolean {
  const read = () => typeof matchMedia === "function" && matchMedia(query).matches;
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const change = () => setMatches(list.matches);
    change();
    list.addEventListener?.("change", change);
    return () => list.removeEventListener?.("change", change);
  }, [query]);
  return matches;
}

/** The id of the section nearest the top of the window, from a list of ids, for a contents list to mark. */
export function useSectionInView(ids: readonly string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  const joined = ids.join("\n");
  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return;
    // Each id is watched through the section around it, so a tall section stays marked while it
    // fills the window, not only while its heading passes.
    const seen = new Map<string, boolean>();
    const idOf = new Map<Element, string[]>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) for (const id of idOf.get(entry.target) ?? []) seen.set(id, entry.isIntersecting);
      const first = ids.find((id) => seen.get(id));
      if (first) setCurrent(first);
    }, { rootMargin: "-20% 0px -60% 0px" });
    for (const id of ids) {
      const element = document.getElementById(id);
      const section = element?.closest("section, details") ?? element;
      if (!section) continue;
      idOf.set(section, [...(idOf.get(section) ?? []), id]);
      observer.observe(section);
    }
    return () => observer.disconnect();
  }, [joined]); // `ids` is rebuilt every render; its contents are in `joined`
  return current;
}
