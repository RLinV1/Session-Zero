import { useSyncExternalStore } from "react";

export type Route =
  | { page: "home" }
  | { page: "gmDashboard" }
  | { page: "library" }
  | { page: "signin" }
  | { page: "signup" }
  | { page: "join"; inviteCode: string }
  | { page: "room"; roomId: string }
  | { page: "encounterEdit"; roomId: string }
  | { page: "notFound" };

export function parseRoute(pathname: string): Route {
  if (pathname === "/") return { page: "home" };
  if (/^\/gm-dashboard\/?$/.test(pathname)) return { page: "gmDashboard" };
  if (/^\/library\/?$/.test(pathname)) return { page: "library" };
  if (/^\/signin\/?$/.test(pathname)) return { page: "signin" };
  if (/^\/signup\/?$/.test(pathname)) return { page: "signup" };
  const join = pathname.match(/^\/join\/([^/]+)\/?$/);
  if (join) return { page: "join", inviteCode: decodeURIComponent(join[1]!) };
  const edit = pathname.match(/^\/encounters\/edit\/([^/]+)\/?$/);
  if (edit) return { page: "encounterEdit", roomId: decodeURIComponent(edit[1]!) };
  const room = pathname.match(/^\/r\/([^/]+)\/?$/);
  if (room) return { page: "room", roomId: decodeURIComponent(room[1]!) };
  return { page: "notFound" };
}

const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((fn) => fn()));

export function navigate(path: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  listeners.forEach((fn) => fn());
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => location.pathname,
  );
  return parseRoute(pathname);
}
