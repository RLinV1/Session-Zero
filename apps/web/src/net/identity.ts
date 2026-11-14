import { z } from "zod";
import type { RoomCredentials } from "@vtt/shared";

/**
 * Durable guest identity (FR-PL-02): credentials live in localStorage so a reload,
 * backgrounded tab, or dropped connection rebinds to the same participant.
 *
 * One identity per room per browser origin. A browser holding the GM's credentials for a
 * room cannot also join it as a player — that would overwrite (and lose) the GM identity.
 */
export interface StoredCredentials extends RoomCredentials {
  /** The browser's own secret (DESIGN.md §5). The server only ever stores its SHA-256. */
  guestToken: string;
  /** Only known to the GM who created the room. */
  inviteCode?: string;
  /** Last room name seen by the room page, for the home page's joined list (KAN-64). */
  roomName?: string;
  /**
   * Made or kept while signed in, so it lasts as long as this device's sign-in (ADR 0017 M4):
   * signing out forgets it here too, and signing in again resumes it.
   */
  viaAccount?: boolean;
}

/**
 * 32 bytes of entropy, generated here rather than handed to us by the server
 * (DESIGN.md §5). The secret never leaves this browser except as the value the
 * server hashes, so a compromised server log cannot impersonate a participant.
 */
export function newGuestToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const CRED_PREFIX = "vtt.credentials.";
const credKey = (roomId: string) => `${CRED_PREFIX}${roomId}`;
/** Maps an invite code to the room a GUEST joined through it. Never written for the GM. */
const inviteKey = (inviteCode: string) => `vtt.invite.${inviteCode}`;

export function saveCredentials(creds: StoredCredentials) {
  try {
    localStorage.setItem(credKey(creds.roomId), JSON.stringify(creds));
  } catch {
    // Storage unavailable (private mode): identity lasts only for this page load.
  }
}

export function rememberInvite(inviteCode: string, roomId: string) {
  try {
    localStorage.setItem(inviteKey(inviteCode), roomId);
  } catch {
    /* ignore */
  }
}

export function loadCredentials(roomId: string): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(credKey(roomId));
    return raw ? (JSON.parse(raw) as StoredCredentials) : null;
  } catch {
    return null;
  }
}

/**
 * Drops this browser's seat in a room after leaving it (ADR 0006), including the invite
 * shortcut, so the invite link shows the join form again instead of a dead room.
 */
export function forgetCredentials(roomId: string) {
  try {
    localStorage.removeItem(credKey(roomId));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("vtt.invite.") && localStorage.getItem(key) === roomId) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** Room this browser previously joined as a guest through this invite, if any. */
export function guestRoomForInvite(inviteCode: string): string | null {
  try {
    const roomId = localStorage.getItem(inviteKey(inviteCode));
    const creds = roomId ? loadCredentials(roomId) : null;
    // Ignore entries pointing at GM credentials (written by older builds).
    return creds && !creds.inviteCode ? creds.roomId : null;
  } catch {
    return null;
  }
}

/** Records the room's current name on this browser's seat. Writes only on change, so every snapshot can call it. */
export function rememberRoomName(roomId: string, roomName: string) {
  const creds = loadCredentials(roomId);
  if (creds && creds.roomName !== roomName) saveCredentials({ ...creds, roomName });
}

export interface JoinedRoom {
  roomId: string;
  /** Null until the room page has seen the room's state once. */
  roomName: string | null;
}

type EnumerableStorage = Pick<Storage, "getItem" | "key" | "length">;

/**
 * What the joined list needs from a stored seat. localStorage is outside our control (older
 * builds, extensions, hand edits), so entries are validated rather than cast. `roomName` is
 * optional because seats stored before KAN-64 have none.
 */
const StoredSeat = z.object({
  roomId: z.string().min(1),
  guestToken: z.string().min(1),
  inviteCode: z.string().optional(),
  roomName: z.string().optional(),
});

function defaultStorage(): EnumerableStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Rooms this browser joined as a guest (KAN-64), read from the stored seats. GM seats carry an
 * invite code and are left to the GM dashboard. Named rooms first, by name. Empty if storage throws.
 */
export function listJoinedRooms(storage: EnumerableStorage | null = defaultStorage()): JoinedRoom[] {
  if (!storage) return [];
  const rooms: JoinedRoom[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(CRED_PREFIX)) continue;
      // Outside the parse's try: a storage failure hides the whole list, not just this entry.
      const raw = storage.getItem(key);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw ?? "null");
      } catch {
        continue;
      }
      const seat = StoredSeat.safeParse(parsed);
      if (!seat.success || seat.data.inviteCode) continue;
      rooms.push({ roomId: seat.data.roomId, roomName: seat.data.roomName || null });
    }
  } catch {
    return [];
  }
  return rooms.sort((a, b) => {
    if (a.roomName === null || b.roomName === null) return a.roomName === b.roomName ? 0 : a.roomName === null ? 1 : -1;
    return a.roomName.localeCompare(b.roomName);
  });
}

/** Room this browser created (as GM) with this invite code, if any. */
export function gmRoomForInvite(inviteCode: string): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CRED_PREFIX)) continue;
      const creds = JSON.parse(localStorage.getItem(key) ?? "null") as StoredCredentials | null;
      if (creds?.inviteCode === inviteCode) return creds.roomId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * GM device identity (ADR 0004): owned this browser's rooms and library before accounts. Since
 * guest-gm-hosting only the start page makes one (`ensureGmToken`), for a signed-out GM's guest
 * rooms. A stored one is otherwise used to list those rooms and to move what it owns into the
 * account, and is forgotten once the server no longer knows it (gm-identity-recovery).
 */
const GM_KEY = "vtt.gm";

export function loadGmToken(): string | null {
  try {
    return localStorage.getItem(GM_KEY);
  } catch {
    return null;
  }
}

/** This browser's GM token, made (32 random bytes, base64url) and stored on first use, for starting a guest room. */
export function ensureGmToken(): string {
  const existing = loadGmToken();
  if (existing) return existing;
  const token = newGuestToken();
  try {
    localStorage.setItem(GM_KEY, token);
  } catch {
    // Storage unavailable: the token lasts this page load, like a room's credentials (saveCredentials).
  }
  return token;
}

export function forgetGmToken() {
  try {
    localStorage.removeItem(GM_KEY);
  } catch {
    // Storage unavailable: nothing to forget.
  }
}

/** The retired "continue as guest" choice (gm-dashboard); removed on startup, never read. */
export function dropGuestChoice() {
  try {
    localStorage.removeItem("vtt.gmGuest");
  } catch {
    // Storage unavailable: nothing to drop.
  }
}

/** Forgets every seat this browser holds through the account, when this device signs out (ADR 0017 M4). */
export function forgetAccountSeats(storage: Pick<Storage, "getItem" | "key" | "length" | "removeItem"> | null = (() => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
})()) {
  if (!storage) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(CRED_PREFIX)) continue;
      const seat = JSON.parse(storage.getItem(key) ?? "null") as StoredCredentials | null;
      if (seat?.viaAccount) doomed.push(key);
    }
    doomed.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage unavailable: the server has ended these seats anyway.
  }
}
