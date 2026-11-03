import { useSyncExternalStore } from "react";

export type Route =
  | { page: "home" }
  | { page: "isometricLighting" }
  | { page: "gmDashboard" }
  | { page: "library" }
  | { page: "signin" }
  | { page: "signup" }
  | { page: "privacy" }
  | { page: "terms" }
  | { page: "join"; inviteCode: string }
  | { page: "room"; roomId: string }
  | { page: "encounterEdit"; roomId: string }
  | { page: "notFound" };

export function parseRoute(pathname: string): Route {
  if (pathname === "/") return { page: "home" };
  if (/^\/demos\/apartments\/?$/.test(pathname)) return { page: "isometricLighting" };
  if (/^\/gm-dashboard\/?$/.test(pathname)) return { page: "gmDashboard" };
  if (/^\/library\/?$/.test(pathname)) return { page: "library" };
  if (/^\/signin\/?$/.test(pathname)) return { page: "signin" };
  if (/^\/signup\/?$/.test(pathname)) return { page: "signup" };
  if (/^\/privacy\/?$/.test(pathname)) return { page: "privacy" };
  if (/^\/terms\/?$/.test(pathname)) return { page: "terms" };
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
  const from = location.pathname;
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  // A new page opens at its top, as a full load would: a footer link would otherwise land at the
  // next page's footer. Back and forward (popstate) keep the browser's own restoration.
  if (location.pathname !== from) window.scrollTo(0, 0);
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
