import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { AccountView } from "@vtt/shared";
import { api, whenSignedOut } from "../net/api";

/**
 * Who is signed in on this browser (FR-GM-01, ADR 0017 C3). Loaded once at startup from
 * `GET /api/auth/me`. The session itself is an HttpOnly cookie this code never sees, and no
 * account data is written to browser storage.
 *
 * Other tabs hear about sign-in and sign-out, so a room open in one tab and the library in another
 * agree on whose dice and seats are in play.
 */
export type AccountState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; account: AccountView };

export const accountStore = createStore<AccountState>(() => ({ status: "loading" }));

export function useAccount(): AccountState {
  return useStore(accountStore);
}

export const isSignedIn = () => accountStore.getState().status === "signedIn";

const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("vtt-account");
channel?.addEventListener("message", () => void loadAccount());

/** Things to tidy on this device when the person signs out (stored seats, say). */
const onSignOut = new Set<() => void>();
export function whenThisDeviceSignsOut(fn: () => void) {
  onSignOut.add(fn);
  return () => onSignOut.delete(fn);
}

function setAccount(account: AccountView | null, announce: boolean) {
  accountStore.setState(account ? { status: "signedIn", account } : { status: "signedOut" });
  if (announce) channel?.postMessage("changed");
}

/** Asks the server who is signed in. A failure reads as signed out, so the app never hangs on it. */
export async function loadAccount() {
  try {
    setAccount((await api.auth.me()).account, false);
  } catch {
    setAccount(null, false);
  }
}

export async function signIn(email: string, password: string) {
  setAccount((await api.auth.signIn({ email, password })).account, true);
}

export async function signUp(email: string, password: string, displayName: string) {
  setAccount((await api.auth.signUp({ email, password, displayName })).account, true);
}

export async function signOut() {
  await api.auth.signOut().catch(() => {});
  onSignOut.forEach((fn) => fn());
  setAccount(null, true);
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await api.auth.changePassword(currentPassword, newPassword);
}

/** Deletes the account for good. The server clears the cookie; this tidies the device and shows signed out. */
export async function deleteAccount(password: string) {
  await api.auth.deleteAccount(password);
  onSignOut.forEach((fn) => fn());
  setAccount(null, true);
}

/** The session ended while the app was open (a 401 on an account request). */
export function expireAccount() {
  if (accountStore.getState().status === "signedIn") setAccount(null, true);
}

whenSignedOut(expireAccount);
