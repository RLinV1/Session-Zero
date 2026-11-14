import { useEffect, useState } from "react";
import type { LibraryAnimation } from "@vtt/shared";
import { useAccountLibrary } from "../ui/GuestRoom";
import { api } from "../net/api";

/**
 * The signed-in GM's library animations that an attack can use (every shape but the nuke), for the
 * attack editors' Animation select (ADR 0038). Empty when signed out, not a GM, or the request fails.
 */
export function useStrikeAnimations(): LibraryAnimation[] {
  const signedIn = useAccountLibrary();
  const [animations, setAnimations] = useState<LibraryAnimation[]>([]);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api.library.animations.list().then(
      (list) => live && setAnimations(list.filter((a) => a.def.shape !== "nuke")),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [signedIn]);
  return animations;
}
