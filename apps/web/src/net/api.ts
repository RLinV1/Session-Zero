import {
  PreparationSaved, type CommandInput, UvttPreparation, UvttIssue, type UvttDraftEdit,
  GM_TOKEN_HEADER,
  CheckpointPreviewResponse,
  HistoryResponse,
  ReplayPointsResponse,
  ReplayResponse,
  type AssetKind,
  type CreateAnimationRequest,
  type CreateCreatureRequest,
  type DiceLookView,
  type DiceLooksResponse,
  type DieName,
  type EncounterEditSession,
  type EncounterPreview,
  type LibraryMapBoard,
  type LibraryPreparation,
  type SaveLibraryPreparation,
  type LibraryUvttImportResponse,
  type EncounterSummary,
  type GridSpec,
  GridDetectionStatus,
  DetectedWallsResponse,
  WallDetectionStatus,
  WallDetectionAvailability,
  type WallDetectionRequest,
  type InviteSeatResponse,
  type LegacySummary,
  type LibraryAsset,
  type LibraryAnimation,
  type LibraryCreature,
  type LibraryUsageResponse,
  type MeResponse,
  type MyRoomsResponse,
  type RoomPreview,
  type SaveEncounterEditRequest,
  type SaveEncounterRequest,
  type SeatResponse,
  type SignInRequest,
  type SignUpRequest,
  type StartEncounterEditRequest,
  type StartEncounterEditResponse,
  type UpdateAnimationRequest,
  type UpdateCreatureRequest,
} from "@vtt/shared";
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  InviteResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  UploadResponse,
} from "@vtt/shared";

/**
 * A refused request, with what the server said about it: which field was wrong, a machine code
 * (`already_member`), why a seat ended (`left`), or how long to wait after a 429.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: { field?: string; code?: string; reason?: string; retryAfterSec?: number } = {},
  ) {
    super(message);
  }
}

/**
 * Called when a request that needs the account gets 401: the session ended (signed out
 * elsewhere, expired, password changed). The account module registers it, so the app can go
 * to sign-in without every caller knowing how.
 */
let onSignedOut: () => void = () => {};
export function whenSignedOut(handler: () => void) {
  onSignedOut = handler;
}

async function errorFrom(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const issues = UvttIssue.array().min(1).max(20).safeParse(body.issues);
    const message = issues.success
      ? issues.data.map((issue) => `${issue.path}: ${issue.message}`).join("\n")
      : typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    return new ApiError(message, res.status, {
      field: typeof body.field === "string" ? body.field : undefined,
      code: typeof body.code === "string" ? body.code : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      retryAfterSec: typeof body.retryAfterSec === "number" ? body.retryAfterSec : undefined,
    });
  } catch {
    return new ApiError(`Request failed (${res.status})`, res.status);
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/**
 * A request made as the signed-in account. The session cookie is HttpOnly and same-origin, so
 * `fetch` sends it by itself; nothing here ever sees it (ADR 0017 I1). A 401 means the session
 * ended, which the account module turns into "go and sign in".
 */
async function accountRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) onSignedOut();
  if (!res.ok) throw await errorFrom(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const jsonBody = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * A request made with this browser's legacy GM device token (ADR 0017 O2), only to find out what
 * it owns and to move that into the account. Never retried and never re-registered: a token the
 * server doesn't know is forgotten by the caller (gm-identity-recovery).
 */
async function legacyRequest<T>(gmToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), [GM_TOKEN_HEADER]: gmToken },
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/** A room request authorized by this browser's guest credential for that room. */
async function roomRequest<T>(roomId: string, token: string, method: "GET" | "POST"): Promise<T> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/invite`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

export const api = {
  preparation: {
    async save(roomId: string, token: string, command: Extract<CommandInput, { type: "scene.savePreparation" }>) {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/preparation`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(command),
      });
      if (!res.ok) throw await errorFrom(res);
      return PreparationSaved.parse(await res.json());
    },
  },
  uvtt: {
    async prepare(roomId: string, token: string, file: File, options?: { saveToLibrary: boolean }) {
      const body = new FormData(); body.append("file", file);
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/uvtt/imports${options?.saveToLibrary ? "?saveToLibrary=1" : ""}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body });
      if (!res.ok) throw await errorFrom(res);
      return UvttPreparation.parse(await res.json());
    },
    async revise(roomId: string, token: string, id: string, edit: UvttDraftEdit) {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/uvtt/imports/${encodeURIComponent(id)}`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(edit) });
      if (!res.ok) throw await errorFrom(res);
      return UvttPreparation.parse(await res.json());
    },
    async discard(roomId: string, token: string, id: string) {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/uvtt/imports/${encodeURIComponent(id)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      if (!res.ok && res.status !== 404) throw await errorFrom(res);
    },
    async export(roomId: string, token: string) {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/uvtt/export`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw await errorFrom(res);
      return res.blob();
    },
  },
  async history(roomId: string, token: string, player: string, before?: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ player });
    if (before !== undefined) query.set("before", String(before));
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/history?${query}`, {
      headers: { authorization: `Bearer ${token}` }, signal,
    });
    if (!res.ok) throw await errorFrom(res);
    return HistoryResponse.parse(await res.json());
  },

  /** A checkpoint's saved board, for the GM to look at before restoring it (FR-REC-02, ADR 0036). */
  async checkpointPreview(roomId: string, token: string, checkpointId: string, signal?: AbortSignal) {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/checkpoints/${encodeURIComponent(checkpointId)}/preview`, {
      headers: { authorization: `Bearer ${token}` }, signal,
    });
    if (!res.ok) throw await errorFrom(res);
    return CheckpointPreviewResponse.parse(await res.json());
  },

  /** Where this participant can start a replay of the room (FR-PL-07, ADR 0025). */
  async replayPoints(roomId: string, token: string, signal?: AbortSignal) {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/replay`, {
      headers: { authorization: `Bearer ${token}` }, signal,
    });
    if (!res.ok) throw await errorFrom(res);
    return ReplayPointsResponse.parse(await res.json()).points;
  },

  /** The room's history from one replay point, filtered for this participant by the server (FR-PL-07). */
  async replay(roomId: string, token: string, pointId: string, signal?: AbortSignal) {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/replay/${encodeURIComponent(pointId)}`, {
      headers: { authorization: `Bearer ${token}` }, signal,
    });
    if (!res.ok) throw await errorFrom(res);
    return ReplayResponse.parse(await res.json());
  },

  /** The room's current invite code (FR-GM-20). GM only; the server answers 403 otherwise. */
  getInvite: (roomId: string, token: string) => roomRequest<InviteResponse>(roomId, token, "GET"),

  /** Replaces the invite code; the old link stops working at once (FR-GM-20). */
  resetInvite: (roomId: string, token: string) => roomRequest<InviteResponse>(roomId, token, "POST"),

  /** Hosting needs an account (FR-GM-01): the session cookie makes the caller the room's owner and GM. */
  createRoom: (req: CreateRoomRequest) =>
    accountRequest<CreateRoomResponse>("/api/rooms", { method: "POST", ...jsonBody(req) }),

  /**
   * Joining needs no account. When signed in, the seat is also kept on the account; a 409 with
   * `code: "already_member"` means the account already has a seat here, to resume instead.
   */
  joinRoom: (inviteCode: string, req: JoinRoomRequest) =>
    postJson<JoinRoomResponse>(`/api/invites/${encodeURIComponent(inviteCode)}/join`, req),

  async upload(file: File, token: string, mapSize?: { width: number; height: number }): Promise<UploadResponse> {
    const form = new FormData();
    form.append("file", file);
    if (mapSize) {
      form.append("purpose", "map");
      form.append("width", String(mapSize.width));
      form.append("height", String(mapSize.height));
    }
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as UploadResponse;
  },

  /** Wall detection for the room's map, as its GM (FR-GM-11, ADR 0029). */
  walls: {
    /**
     * Queues an analysis of the room's current map. With `sample`, a point on a wall the GM
     * clicked, the worker looks for walls of that colour, within `tolerance` Lab units of it
     * (wall-editing); `strictness` and `minLength` filter what it finds.
     */
    async detect(roomId: string, token: string, request: WallDetectionRequest = {}): Promise<WallDetectionStatus> {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/wall-detection`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw await errorFrom(res);
      return WallDetectionStatus.parse(await res.json());
    },
    /** Whether this server can detect walls now (map-editor D4); with a room, for that room's current map. */
    async availability(roomId?: string, token?: string, signal?: AbortSignal): Promise<WallDetectionAvailability> {
      const res = await fetch(`/api/wall-detection/availability${roomId ? `?room=${encodeURIComponent(roomId)}` : ""}`, {
        signal, cache: "no-store", headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw await errorFrom(res);
      return WallDetectionAvailability.parse(await res.json());
    },
    /** The latest analysis of this map, or null when the room never analyzed it. */
    async status(roomId: string, token: string, mapUrl: string, signal?: AbortSignal): Promise<WallDetectionStatus | null> {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/wall-detection?map=${encodeURIComponent(mapUrl)}`, {
        headers: { authorization: `Bearer ${token}` }, signal, cache: "no-store",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw await errorFrom(res);
      return WallDetectionStatus.parse(await res.json());
    },
    /** The detected segments of a finished analysis, for erasing false ones before applying. */
    async detected(roomId: string, token: string, mapUrl: string, signal?: AbortSignal): Promise<DetectedWallsResponse> {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/wall-detection/walls?map=${encodeURIComponent(mapUrl)}`, {
        signal, cache: "no-store", headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw await errorFrom(res);
      return DetectedWallsResponse.parse(await res.json());
    },
    /** The rendered preview, fetched with the GM's credential (an <img> can't send it). */
    async preview(roomId: string, token: string, mapUrl: string, signal?: AbortSignal): Promise<Blob> {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/wall-detection/preview?map=${encodeURIComponent(mapUrl)}`, {
        headers: { authorization: `Bearer ${token}` }, signal, cache: "no-store",
      });
      if (!res.ok) throw await errorFrom(res);
      return res.blob();
    },
  },

  detection: {
    async room(roomId: string, token: string, mapUrl: string, signal?: AbortSignal) {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/grid-detection`, {
        headers: { authorization: `Bearer ${token}`, "x-expected-map-url": mapUrl }, signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) throw await errorFrom(res);
      return GridDetectionStatus.parse(await res.json());
    },
    async retryRoom(roomId: string, token: string, mapUrl: string) {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/grid-detection/retry`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "x-expected-map-url": mapUrl },
      });
      if (!res.ok) throw await errorFrom(res);
      return GridDetectionStatus.parse(await res.json());
    },
    /** A library map's analysis, as the signed-in account that owns it (ADR 0017). */
    async library(id: string, signal?: AbortSignal) {
      const res = await fetch(`/api/library/${encodeURIComponent(id)}/grid-detection`, { signal, cache: "no-store" });
      if (res.status === 401) onSignedOut();
      if (res.status === 404) return null;
      if (!res.ok) throw await errorFrom(res);
      return GridDetectionStatus.parse(await res.json());
    },
    retryLibrary: (id: string) =>
      accountRequest<unknown>(`/api/library/${encodeURIComponent(id)}/grid-detection/retry`, { method: "POST" })
        .then((raw) => GridDetectionStatus.parse(raw)),
  },

  /** Accounts (FR-GM-01, ADR 0017). Errors carry the field to show them beside. */
  auth: {
    async me(): Promise<MeResponse> {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) throw await errorFrom(res);
      return (await res.json()) as MeResponse;
    },
    signUp: (req: SignUpRequest) => postJson<MeResponse>("/api/auth/signup", req),
    signIn: (req: SignInRequest) => postJson<MeResponse>("/api/auth/signin", req),
    async signOut(): Promise<void> {
      await fetch("/api/auth/signout", { method: "POST" });
    },
    changePassword: (currentPassword: string, newPassword: string) =>
      accountRequest<void>("/api/auth/password", { method: "POST", ...jsonBody({ currentPassword, newPassword }) }),
  },

  /** The account's rooms and seats (room-membership, ADR 0017 M). */
  me: {
    rooms: () => accountRequest<MyRoomsResponse>("/api/me/rooms"),
    /** A hosted room's board, small, for its dashboard card (gm-dashboard). */
    roomPreview: (roomId: string) => accountRequest<RoomPreview>(`/api/me/rooms/${encodeURIComponent(roomId)}/preview`),
  },

  /** The account's active seat in an invite's room, if any (room-membership): Resume instead of joining twice. */
  inviteSeat: (inviteCode: string) => accountRequest<InviteSeatResponse>(`/api/invites/${encodeURIComponent(inviteCode)}/seat`),

  rooms: {
    /** A new credential for the account's seat in the room, from this device (ADR 0017 M2). */
    seat: (roomId: string, guestToken: string) =>
      accountRequest<SeatResponse>(`/api/rooms/${encodeURIComponent(roomId)}/seat`, {
        method: "POST", ...jsonBody({ guestToken }),
      }),

    /** Keeps this browser's guest seat on the account (ADR 0017 M3), proven by its credential. */
    keep: (roomId: string, guestToken: string) =>
      accountRequest<void>(`/api/rooms/${encodeURIComponent(roomId)}/seat/keep`, {
        method: "POST", headers: { authorization: `Bearer ${guestToken}` },
      }),

    /** Deletes an owned room and everything in it, for good (KAN-72, ADR 0009). */
    async remove(roomId: string): Promise<void> {
      try {
        await accountRequest<void>(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" });
      } catch (err) {
        // 404: already deleted (another tab, a double click). Either way it is no longer this GM's room.
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
    },
  },

  /** A legacy GM device token, only to move what it owns into the account (ADR 0017 O2). */
  legacy: {
    summary: (gmToken: string) => legacyRequest<LegacySummary>(gmToken, "/api/gm/legacy"),
    claim: (gmToken: string) => legacyRequest<LegacySummary>(gmToken, "/api/gm/legacy/claim", { method: "POST" }),
  },

  /** The signed-in account's library (asset-library, ADR 0017 O1). */
  library: {
    list: () => accountRequest<LibraryAsset[]>("/api/library"),
    importUvtt(file: File) {
      const form = new FormData(); form.append("file", file);
      return accountRequest<LibraryUvttImportResponse>("/api/library/uvtt/imports", { method: "POST", body: form });
    },

    upload(file: File, fields: { kind: AssetKind; name: string; width: number; height: number }) {
      const form = new FormData();
      form.append("kind", fields.kind);
      form.append("name", fields.name);
      form.append("width", String(fields.width));
      form.append("height", String(fields.height));
      form.append("file", file);
      return accountRequest<LibraryAsset>("/api/library", { method: "POST", body: form });
    },

    update: (id: string, patch: { name?: string; grid?: GridSpec }) =>
      accountRequest<LibraryAsset>(`/api/library/${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody(patch) }),

    /** The walls and fog prepared on a library map (ADR 0037). */
    preparation: (id: string) => accountRequest<LibraryPreparation>(`/api/library/${encodeURIComponent(id)}/preparation`),
    savePreparation: (id: string, change: SaveLibraryPreparation) => accountRequest<LibraryPreparation>(`/api/library/${encodeURIComponent(id)}/preparation`, { method: "PUT", ...jsonBody(change) }),
    board: (id: string) => accountRequest<LibraryMapBoard>(`/api/library/${encodeURIComponent(id)}/board`),
    setBoard: (id: string, board: LibraryMapBoard) =>
      accountRequest<LibraryMapBoard>(`/api/library/${encodeURIComponent(id)}/board`, { method: "PUT", ...jsonBody(board) }),

    usage: (id: string) => accountRequest<LibraryUsageResponse>(`/api/library/${encodeURIComponent(id)}/usage`),

    remove: (id: string) => accountRequest<void>(`/api/library/${encodeURIComponent(id)}`, { method: "DELETE" }),

    /** Reusable creatures placed from Add Token (library-creatures, ADR 0012). */
    creatures: {
      list: () => accountRequest<LibraryCreature[]>("/api/library/creatures"),
      create: (creature: CreateCreatureRequest) =>
        accountRequest<LibraryCreature>("/api/library/creatures", { method: "POST", ...jsonBody(creature) }),
      update: (id: string, patch: UpdateCreatureRequest) =>
        accountRequest<LibraryCreature>(`/api/library/creatures/${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody(patch) }),
      remove: (id: string) =>
        accountRequest<void>(`/api/library/creatures/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },

    /** The GM's board animations for attacks and nukes (ADR 0038). */
    animations: {
      list: () => accountRequest<LibraryAnimation[]>("/api/library/animations"),
      create: (animation: CreateAnimationRequest) =>
        accountRequest<LibraryAnimation>("/api/library/animations", { method: "POST", ...jsonBody(animation) }),
      update: (id: string, patch: UpdateAnimationRequest) =>
        accountRequest<LibraryAnimation>(`/api/library/animations/${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody(patch) }),
      remove: (id: string) =>
        accountRequest<void>(`/api/library/animations/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },

    /** Encounter templates: a room's prepared board saved to the account (encounter-templates, ADR 0024). */
    encounters: {
      list: () => accountRequest<EncounterSummary[]>("/api/library/encounters"),
      save: (req: SaveEncounterRequest) =>
        accountRequest<EncounterSummary>("/api/library/encounters", { method: "POST", ...jsonBody(req) }),
      rename: (id: string, name: string) =>
        accountRequest<EncounterSummary>(`/api/library/encounters/${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody({ name }) }),
      remove: (id: string) =>
        accountRequest<void>(`/api/library/encounters/${encodeURIComponent(id)}`, { method: "DELETE" }),
      preview: (id: string) => accountRequest<EncounterPreview>(`/api/library/encounters/${encodeURIComponent(id)}/preview`),
      /** Rebuilds a template from a room the GM owns, keeping its id and name (ADR 0033). */
      replaceFromRoom: (id: string, roomId: string) =>
        accountRequest<EncounterSummary>(`/api/library/encounters/${encodeURIComponent(id)}/from-room`, { method: "PUT", ...jsonBody({ roomId }) }),
    },

    /** Editing a template in a temporary room only this GM can enter (ADR 0033). Leaving is `rooms.remove`. */
    encounterEdits: {
      start: (req: StartEncounterEditRequest) =>
        accountRequest<StartEncounterEditResponse>("/api/library/encounter-edits", { method: "POST", ...jsonBody(req) }),
      get: (roomId: string) => accountRequest<EncounterEditSession>(`/api/library/encounter-edits/${encodeURIComponent(roomId)}`),
      save: (roomId: string, req: SaveEncounterEditRequest = {}) =>
        accountRequest<EncounterSummary>(`/api/library/encounter-edits/${encodeURIComponent(roomId)}/save`, { method: "POST", ...jsonBody(req) }),
    },

    /** Dice looks saved to the account (dice-looks, ADR 0017 O3). */
    dice: {
      list: () => accountRequest<DiceLooksResponse>("/api/library/dice"),
      create: (name: string) => accountRequest<DiceLookView>("/api/library/dice", { method: "POST", ...jsonBody({ name }) }),
      rename: (id: string, name: string) =>
        accountRequest<DiceLookView>(`/api/library/dice/${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody({ name }) }),
      remove: (id: string) => accountRequest<void>(`/api/library/dice/${encodeURIComponent(id)}`, { method: "DELETE" }),
      setFace(id: string, die: DieName, picture: Blob, size: { width: number; height: number }) {
        const form = new FormData();
        form.append("width", String(size.width));
        form.append("height", String(size.height));
        form.append("file", picture, `${die}.${picture.type === "image/png" ? "png" : "webp"}`);
        return accountRequest<DiceLookView>(`/api/library/dice/${encodeURIComponent(id)}/faces/${die}`, { method: "PUT", body: form });
      },
      resetFace: (id: string, die: DieName) =>
        accountRequest<DiceLookView>(`/api/library/dice/${encodeURIComponent(id)}/faces/${die}`, { method: "DELETE" }),
      setActive: (id: string | null) =>
        accountRequest<void>("/api/library/dice/active", { method: "PUT", ...jsonBody({ id }) }),
    },
  },
};
