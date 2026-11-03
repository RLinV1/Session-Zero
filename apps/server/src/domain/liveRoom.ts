import { publicBoard } from "../store/libraryPreparation";
import type { UvttLease } from "../uvtt/preparations";
import { randomInt, randomUUID } from "node:crypto";
import {
  can,
  concealedFrom,
  concealmentFor,
  templateConcealedFrom,
  decide,
  decideJoin,
  emptyRoomState,
  filterEventForViewer,
  endReason,
  filterStateForViewer,
  isActive,
  movementFeedbackForViewer,
  reduceCommitted,
  replayTo,
  tableOf,
  referencedAssetIds,
  LibraryMapBoard,
  type ResolvedLibraryMap,
  type Command,
  type CommittedEvent,
  type DetectedWallsResponse,
  type DiceLookOnTable,
  type DieName,
  type DomainEvent,
  type EphemeralPayload,
  type JoinDecision,
  type Participant,
  type Point,
  type RejectionCode,
  type ResolvedEncounter,
  type RoomPreview,
  type RoomState,
  type ServerMessage,
  type TableState,
  type SessionEndReason,
} from "@vtt/shared";
import type { RoomStore } from "../store/roomStore";
import { resolveEncounter, type ResolveEncounterResult } from "./encounterTemplates";

/**
 * Float in [0, 1) from the CSPRNG. A dice roll decides encounter outcomes, so it should not
 * be predictable from other rolls the way `Math.random` is.
 */
const secureRandom = () => randomInt(0, 2 ** 31) / 2 ** 31;

/** A checkpoint restore slower than this is logged: past it, ADR 0019 calls for a snapshot cache. */
const RESTORE_SLOW_MS = 500;

/** Server services a room consults while deciding, passed in so `decide` stays pure. */
export interface RoomHooks {
  uvttLease?: (roomId: string, actorId: string, id: string, revision: number) => UvttLease;
  /** The validated detected walls for this room's map (ADR 0029), or null. */
  detectedWalls?: (roomId: string, mapUrl: string) => DetectedWallsResponse | null;
}

/** A connected socket bound to a participant. */
export interface RoomClient {
  participantId: string;
  /** The seat credential this connection presented, so it can be closed when that credential ends (ADR 0017 M4). */
  credentialHash?: string;
  /** Reliable, ordered delivery: snapshots, committed events, acks. */
  send(message: ServerMessage): void;
  /**
   * Best-effort delivery for the ephemeral channel — dropped under backpressure so
   * pointer chatter never queues ahead of committed state (DESIGN.md §1, FR-SYNC-03).
   * Falls back to `send` for transports without a volatile path.
   */
  sendVolatile?(message: ServerMessage): void;
  /** Disconnects this client for good, after its seat has ended (ADR 0006). */
  close(): void;
}

/**
 * A join decision, or the room was deleted while the join waited in the queue (ADR 0009), or the
 * signed-in person already holds a seat here or was removed (ADR 0017 M1).
 */
export type JoinResult =
  | JoinDecision
  | { ok: false; code: "not_found"; message: string; reason?: undefined }
  | { ok: false; code: "already_member" | "removed"; message: string; reason?: undefined };

export type SubmitResult =
  | { ok: true; seq: number | null }
  | { ok: false; code: RejectionCode; message: string };

/**
 * One loaded room: authoritative state + connected clients.
 *
 * Every committed change goes through `runExclusive`, a per-room FIFO queue, so commands
 * are decided against the latest state and receive consecutive seqs (FR-SYNC-01/04).
 */
export class LiveRoom {
  private state: RoomState;
  private seq: number;
  /** Per-viewer concealment for the ephemeral relay; rebuilt per state because line of sight makes it costly (ADR 0044). */
  private concealments = new Map<string, ReturnType<typeof concealmentFor>>();
  private clients = new Set<RoomClient>();
  private tail: Promise<unknown> = Promise.resolve();
  /** Sorted asset ids last written to the reference index, as a comparable key. */
  private assetRefsKey: string | null = null;
  /** Set once the room is being deleted (ADR 0009). Nothing is committed or relayed after. */
  private isClosed = false;

  private constructor(
    readonly roomId: string,
    private store: RoomStore,
    events: CommittedEvent[],
    private hooks: RoomHooks = {},
  ) {
    // With each event's `commandId`, so the undo history is rebuilt too (ADR 0013).
    this.state = events.reduce(reduceCommitted, emptyRoomState(roomId));
    this.seq = events.at(-1)?.seq ?? 0;
  }

  /** Replays the room's log, then heals the derived projections: the asset index and removed players' credential locks. */
  static async load(roomId: string, store: RoomStore, hooks: RoomHooks = {}) {
    const room = new LiveRoom(roomId, store, await store.loadEvents(roomId), hooks);
    // Heals an index left stale by a crash between append and projection (ADR 0004).
    await room.syncAssetRefs();
    // Same for the credential-row lock on removed participants (FR-GM-20). Idempotent.
    for (const p of Object.values(room.state.participants)) {
      if (p.revoked) await room.revokeCredentials(p.id);
    }
    return room;
  }

  get closed() {
    return this.isClosed;
  }

  /**
   * Ends the room for everyone before it is deleted (ADR 0009). Runs in the queue, so a command
   * already running commits first and anything queued behind it is refused.
   */
  close(reason: SessionEndReason) {
    return this.runExclusive(async () => {
      this.isClosed = true;
      for (const client of [...this.clients]) {
        this.clients.delete(client);
        client.send({ type: "sessionEnded", reason });
        client.close();
      }
    });
  }

  participant(id: string): Participant | undefined {
    return this.state.participants[id];
  }

  /** Server-only lookup for the current direct map's private analysis endpoint. */
  currentMap() {
    return this.state.scene.map;
  }

  /** The room's grid, so wall detection judges walls against its squares (ADR 0029). */
  currentGrid() {
    return this.state.scene.grid;
  }

  /** Immutable, viewer-filtered scene capture inside the same FIFO as all mutations. */
  captureScene(actorId: string) {
    return this.runExclusive(async () => {
      const actor = this.activeParticipant(actorId);
      if (this.isClosed || !actor || !can.administer(actor)) return null;
      const view = filterStateForViewer(this.state, actor);
      return structuredClone({ map: view.scene.map, grid: view.scene.grid, walls: view.walls, fog: view.fog, terrainRevision: view.terrainRevision ?? 0, seq: this.seq });
    });
  }

  /** Why this participant's seat ended, or null if they are still in the room (ADR 0006). */
  endReason(id: string): SessionEndReason | null {
    const p = this.state.participants[id];
    return p ? endReason(p) : null;
  }

  /**
   * Sends a message to the room's GM connections only: a wall analysis changed state (ADR 0029).
   * Not room data and no seq (invariant 4); players never receive it.
   */
  notifyGm(message: ServerMessage) {
    if (this.isClosed) return;
    for (const client of this.clients) {
      const viewer = this.state.participants[client.participantId];
      if (viewer && viewer.role === "gm" && isActive(viewer)) client.send(message);
    }
  }

  /** The room's GM seat, for its owner resuming on another device (ADR 0017 M2). */
  gmParticipant(): Participant | undefined {
    return Object.values(this.state.participants).find((p) => p.role === "gm" && isActive(p));
  }

  /**
   * The board as the GM sees it, hidden tokens included, for saving as an encounter template
   * (ADR 0024). Callers must already have checked that the requester owns this room.
   */
  boardForOwner(): TableState {
    return tableOf(this.state);
  }

  /**
   * The board as this seat sees it, for the dashboard card's picture (gm-dashboard). Filtered like
   * every room payload (invariant 3), then cut down to what the picture draws.
   */
  previewFor(participantId: string): RoomPreview | null {
    const viewer = this.activeParticipant(participantId);
    if (this.isClosed || !viewer) return null;
    const view = filterStateForViewer(this.state, viewer);
    const map = view.scene.map;
    return {
      map: map && { url: map.url, width: map.width, height: map.height },
      grid: view.scene.grid,
      tokens: Object.values(view.tokens).map((t) => ({
        position: t.position,
        size: t.size,
        color: t.color,
        imageUrl: t.imageUrl,
        hidden: t.hidden,
      })),
      fog: Object.values(view.fog).map((region) => region.points),
    };
  }

  /** The participant, only while they are still in the room (ADR 0006). */
  activeParticipant(id: string): Participant | undefined {
    const p = this.state.participants[id];
    return p && isActive(p) ? p : undefined;
  }

  /** Validate, authorize, persist, apply, broadcast. */
  submit(actorId: string, command: Command): Promise<SubmitResult> {
    return this.runExclusive(async () => {
      if (this.isClosed) return { ok: false, code: "not_found", message: "This room has been deleted" };
      const actor = this.state.participants[actorId];
      if (!actor) return { ok: false, code: "forbidden", message: "Unknown participant" };
      // Checked inside the queue, so a command sent from another tab just before the leave
      // committed can't run after it (ADR 0006).
      if (!isActive(actor)) return { ok: false, code: "forbidden", message: "You are no longer in this room" };
      // Randomness is injected, never reached for inside `decide` — that is what keeps the
      // kernel pure and the dice testable (CLAUDE.md invariant 2). So is the actor's own dice
      // look, read here from the stores (ADR 0018), the pre-decide lookup ADR 0004 anticipated,
      // and a checkpoint's board, rebuilt from the log (ADR 0019).
      const ownedDiceLook =
        command.type === "participant.setDiceLook" && command.lookId ? await this.ownedDiceLook(actorId, command.lookId) : null;
      // Only a GM restoring a checkpoint that exists pays for the replay; anything else is refused
      // by `decide` with its usual message, without reading the log under the room's queue.
      let checkpointTable: ((checkpointId: string) => TableState | null) | undefined;
      if (command.type === "checkpoint.restore" && can.administer(actor) && this.state.checkpoints.some((c) => c.id === command.checkpointId)) {
        try {
          checkpointTable = await this.checkpointTables();
        } catch (err) {
          // The store failed, not the replay: answer this restore so the GM's request settles,
          // and say it may work on a retry (unlike a log that won't replay).
          console.error(`[vtt] could not load the log of room ${this.roomId} for a checkpoint restore`, err);
          return { ok: false, code: "invalid", message: "Couldn't read the room's history to restore that checkpoint. Try again." };
        }
      }
      // An encounter template is read for the acting GM's own account before deciding (ADR 0024).
      // A seat with no account, or a template that isn't theirs, reads as no template at all.
      let encounterTemplate: ((templateId: string) => ResolvedEncounter | null) | undefined;
      if (command.type === "encounter.apply" && can.administer(actor)) {
        const found = await this.ownedEncounter(actorId, command.templateId);
        if (found && !found.ok) return { ok: false, code: "invalid", message: found.message };
        const encounter = found?.encounter ?? null;
        encounterTemplate = (id) => (encounter && encounter.id === id ? encounter : null);
      }
      let lease: UvttLease | undefined;
      let libraryMap: ResolvedLibraryMap | null | undefined;
      if (command.type === "scene.setMap" && command.includeLibraryBoard) {
        if (!can.administer(actor)) return { ok: false, code: "forbidden", message: "Only the GM can apply a library map." };
        try {
          const member = await this.store.findMemberByParticipant(this.roomId, actorId);
          const user = member ? await this.store.findUserById(member.userId) : null;
          const asset = user && command.map.assetId ? await this.store.findAsset(command.map.assetId, user.ownerId) : null;
          const board = LibraryMapBoard.safeParse(publicBoard(asset?.board));
          libraryMap = asset?.kind === "map" && board.success ? {
            map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id },
            grid: asset.grid, board: board.data,
          } : null;
        } catch {
          return { ok: false, code: "invalid", message: "Could not read your library map. Your draft has been kept; try Apply again." };
        }
      }
      if (command.type === "scene.importUVTT") {
        if (!can.administer(actor)) return { ok: false, code: "forbidden", message: "Only the GM can import a map." };
        lease = this.hooks.uvttLease?.(this.roomId, actorId, command.importId, command.revision);
        if (!lease) return { ok: false, code: "not_found", message: "This preparation expired or the server restarted. Re-import the file." };
        if (!lease.ok) return lease;
        if (lease.appliedSeq !== undefined) return { ok: true, seq: lease.appliedSeq };
      }
      try {
        const decision = decide(this.state, actor, command, {
          newId: randomUUID,
          preparedUvtt: lease?.ok ? lease.scene : undefined,
          libraryMap,
          random: secureRandom,
          ownedDiceLook,
          lastSeq: this.seq,
          checkpointTable,
          encounterTemplate,
          detectedWalls: command.type === "wall.applyDetected"
            ? (mapUrl) => this.hooks.detectedWalls?.(this.roomId, mapUrl) ?? null
            : undefined,
        });
        if (!decision.ok) return decision;
        const committed = await this.commit(actorId, decision.events);
        const seq = committed.at(-1)?.seq ?? null;
        if (lease?.ok) lease.finish?.(seq);
        return { ok: true, seq };
      } catch (error) {
        if (command.type === "scene.importUVTT") {
          console.error("[vtt] uvtt application failed", { code: "append_failed" });
          return { ok: false, code: "invalid", message: "Could not save the imported scene. Your draft has been kept; try Apply again." };
        }
        if (command.type === "scene.setMap" && command.includeLibraryBoard) return { ok: false, code: "invalid", message: "Could not save the library map. Your draft has been kept; try Apply again." };
        throw error;
      } finally {
        if (lease?.ok) lease.finish?.();
      }
    });
  }

  /** The template as the account holding this participant's seat owns it, or null (ADR 0024). */
  private async ownedEncounter(participantId: string, templateId: string): Promise<ResolveEncounterResult | null> {
    const member = await this.store.findMemberByParticipant(this.roomId, participantId);
    const user = member ? await this.store.findUserById(member.userId) : null;
    return user ? resolveEncounter(this.store, user.ownerId, templateId) : null;
  }

  /**
   * The dice look `lookId` as the room would draw it, only when it belongs to the account that
   * holds this participant's seat (ADR 0018). Null for a guest seat, or a look that isn't theirs.
   */
  private async ownedDiceLook(participantId: string, lookId: string): Promise<DiceLookOnTable | null> {
    const member = await this.store.findMemberByParticipant(this.roomId, participantId);
    const user = member ? await this.store.findUserById(member.userId) : null;
    const look = user ? await this.store.findDiceLook(lookId, user.ownerId) : null;
    if (!look) return null;
    const faces: DiceLookOnTable["faces"] = {};
    for (const [die, face] of Object.entries(look.faces) as [DieName, NonNullable<(typeof look.faces)[DieName]>][]) {
      faces[die] = { url: face.url, width: face.width, height: face.height };
    }
    return { lookId: look.id, version: Date.parse(look.updatedAt), faces };
  }

  /**
   * Invite join (FR-PL-01). Decided and committed in one queue step, so two joins racing for
   * the same display name can't both pass the uniqueness check (KAN-61).
   *
   * A signed-in join (`userId`) also keeps the seat on the account, in the same step, so two joins
   * from one account can't both get a seat (ADR 0017 M1). The account's existing seat decides:
   * still active, refused (`already_member`); removed by the GM, refused (`removed`); left, the
   * new seat replaces it.
   */
  join(participant: Participant, userId?: string): Promise<JoinResult> {
    return this.runExclusive(async (): Promise<JoinResult> => {
      if (this.isClosed) return { ok: false, code: "not_found", message: "This room has been deleted" };
      if (userId) {
        const existing = await this.store.findMember(this.roomId, userId);
        const seat = existing ? this.state.participants[existing.participantId] : undefined;
        if (seat && isActive(seat)) {
          return { ok: false, code: "already_member", message: `You're already in this room as ${seat.displayName}` };
        }
        if (seat?.revoked) return { ok: false, code: "removed", message: "You were removed from this room" };
      }
      const decision = decideJoin(this.state, participant);
      if (!decision.ok) return decision;
      await this.commit(participant.id, decision.events);
      if (userId) await this.store.putMember({ roomId: this.roomId, participantId: participant.id, userId });
      return decision;
    });
  }

  /** For server-originated events (room creation) that aren't client commands. */
  appendSystem(actorId: string | null, events: DomainEvent[]) {
    return this.runExclusive(() => this.commit(actorId, events));
  }

  /** Binds a connected socket to the room and sends it a snapshot, unless its seat has already ended. */
  attach(client: RoomClient) {
    // The handshake checked this too, but Socket.IO runs the connection handler a tick
    // later; a leave committed in between must not let this socket in (ADR 0006).
    const ended = this.isClosed ? "deleted" : this.endReason(client.participantId);
    if (ended) {
      client.send({ type: "sessionEnded", reason: ended });
      client.close();
      return;
    }
    this.clients.add(client);
    this.sendSnapshot(client);
  }

  /**
   * Closes the connections that presented these credentials: their device's sign-in ended
   * (ADR 0017 M4). The seat itself stays; the person resumes it after signing in again.
   */
  closeCredentials(hashes: ReadonlySet<string>) {
    for (const client of [...this.clients]) {
      if (!client.credentialHash || !hashes.has(client.credentialHash)) continue;
      this.clients.delete(client);
      client.send({ type: "sessionEnded", reason: "signed_out" });
      client.close();
    }
  }

  /** The seat credentials of the open connections, for the sweep that finds deleted ones. */
  connectedCredentials(): string[] {
    return [...this.clients].flatMap((c) => (c.credentialHash ? [c.credentialHash] : []));
  }

  detach(client: RoomClient) {
    this.clients.delete(client);
  }

  get clientCount() {
    return this.clients.size;
  }

  /** Full filtered state (FR-PL-06). Used on connect, on request, and when filtering needs it. */
  sendSnapshot(client: RoomClient) {
    const viewer = this.state.participants[client.participantId];
    if (!viewer || !isActive(viewer)) return;
    client.send({
      type: "welcome",
      you: viewer,
      seq: this.seq,
      state: filterStateForViewer(this.state, viewer),
    });
  }

  /** Ephemeral channel (FR-SYNC-03): relayed to other clients, never persisted, no seq. */
  relayEphemeral(from: RoomClient, payload: EphemeralPayload) {
    if (this.isClosed) return;
    const sender = this.state.participants[from.participantId];
    if (!sender || !isActive(sender)) return;
    if (payload.type === "tokenMovePreview") {
      let concealment = this.concealments.get(sender.id);
      if (!concealment) this.concealments.set(sender.id, (concealment = concealmentFor(this.state, sender)));
      const status = movementFeedbackForViewer(this.state, sender, payload, concealment);
      if (status === null) return;
      (from.sendVolatile ?? from.send).call(from, { type: "ephemeral", from: sender.id, payload: { type: "tokenMoveFeedback", requestId: payload.requestId, atSeq: this.seq, status } });
      return;
    }
    let token = undefined;
    if (payload.type === "tokenDragPreview") {
      token = this.state.tokens[payload.tokenId];
      if (!token || !can.moveToken(sender, token)) return;
    }
    // A dice drop only makes sense on the map: one off it, or with no map, is a forged payload.
    if (payload.type === "diceDrop" && !onMap(this.state.scene.map, payload.from, payload.to)) return;
    // A ping points at the map: one off it, or with no map yet, has nothing to point at (KAN-34).
    if (payload.type === "ping" && !onMap(this.state.scene.map, payload.at)) return;
    // An aim preview (KAN-35): only the GM aims GM-only areas, and one off the map is forged.
    const preview = payload.type === "templatePreview" ? payload.preview : null;
    const gmOnlyAim = payload.type === "templatePreview" && (payload.preview?.gmOnly ?? payload.gmOnly ?? false);
    if (gmOnlyAim && !can.administer(sender)) return;
    if (preview && !onMap(this.state.scene.map, preview.origin)) return;
    for (const client of this.clients) {
      if (client === from) continue;
      const viewer = this.state.participants[client.participantId];
      if (!viewer || !isActive(viewer)) continue;
      // A token the viewer may not see, or one dragged into fog they don't own, sends them nothing:
      // the preview point would trace it through the concealed area (FR-GM-17, ADR 0016).
      let concealment = this.concealments.get(viewer.id);
      if (!concealment) this.concealments.set(viewer.id, (concealment = concealmentFor(this.state, viewer)));
      if (token && concealedFrom(concealment, token, viewer)) continue;
      if (token && payload.type === "tokenDragPreview" && concealedFrom(concealment, { ...token, position: payload.at }, viewer)) continue;
      // An aim follows the rules for the area it would place: GM-only reaches GMs only (ADR 0007),
      // and one aimed from under fog reaches no player but its sender (ADR 0016).
      if (preview && templateConcealedFrom(concealment, { ...preview, id: "", ownerId: sender.id }, viewer)) continue;
      if (gmOnlyAim && viewer.role !== "gm") continue;
      // A dice drop is one message per throw, not pointer chatter, and a lost one shows the throw
      // in the wrong place: it is delivered reliably, still unsequenced (ADR 0014).
      const deliver = payload.type === "diceDrop" ? client.send : (client.sendVolatile ?? client.send);
      deliver.call(client, { type: "ephemeral", from: sender.id, payload });
    }
  }

  /**
   * A checkpoint's saved board for the GM to look at before restoring (ADR 0036): the table a
   * restore would produce, from the same replay. A read: nothing is committed or sequenced.
   * Null when the checkpoint is unknown (or deleted), or its log won't replay.
   */
  async previewCheckpoint(checkpointId: string): Promise<{ name: string; table: TableState } | null> {
    const checkpoint = this.state.checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) return null;
    const table = (await this.checkpointTables())(checkpointId);
    return table ? { name: checkpoint.name, table } : null;
  }

  /**
   * Rebuilds a checkpoint's board by replaying the log up to its seq (ADR 0019). Runs inside the
   * room's queue, so nothing commits between the replay and the decision. A log that won't
   * replay makes the checkpoint unavailable rather than failing the whole command.
   */
  private async checkpointTables(): Promise<(checkpointId: string) => TableState | null> {
    const started = performance.now();
    const events = await this.store.loadEvents(this.roomId);
    return (checkpointId) => {
      const checkpoint = this.state.checkpoints.find((c) => c.id === checkpointId);
      if (!checkpoint) return null;
      try {
        const table = tableOf(replayTo(this.roomId, events, checkpoint.seq));
        // The room's queue waits on this; ADR 0019 adds a snapshot cache once it passes 500 ms.
        const ms = performance.now() - started;
        if (ms > RESTORE_SLOW_MS) console.warn(`[vtt] restoring a checkpoint in room ${this.roomId} took ${Math.round(ms)} ms (${events.length} events)`);
        return table;
      } catch (err) {
        console.error(`[vtt] could not replay room ${this.roomId} to checkpoint ${checkpointId}`, err);
        return null;
      }
    };
  }

  /** Appends events atomically, then reduces, broadcasts and ends any seats they close, in seq order. */
  private async commit(actorId: string | null, events: DomainEvent[]) {
    if (events.length === 0) return [];
    // One id for the whole batch: undo reverses a command as a unit (ADR 0013).
    const commandId = randomUUID();
    const committed = await this.store.append(
      this.roomId,
      this.seq,
      events.map((event) => ({ actorId, commandId, event })),
    );
    for (const c of committed) {
      const before = this.state;
      this.state = reduceCommitted(this.state, c);
      this.concealments.clear();
      this.seq = c.seq;
      this.broadcast(c, before);
      if (c.event.type === "ParticipantLeft") this.endSession(c.event.participant.id, "left");
      if (c.event.type === "ParticipantRevoked") this.endSession(c.event.participant.id, "revoked");
    }
    for (const c of committed) {
      // Not awaited: the committed event and the state gate are the authority, and a slow
      // database must not hold up every other command in the room (sync review).
      if (c.event.type === "ParticipantRevoked") void this.revokeCredentials(c.event.participant.id);
    }
    await this.syncAssetRefs();
    return committed;
  }

  /**
   * Keeps the library's "in use" index in step with current state (ADR 0004). A read
   * model: derived from RoomState, never read back into it. The events are already
   * committed by now, so a failure here is logged rather than failing the command; the
   * next load rewrites the index.
   */
  private async syncAssetRefs() {
    const ids = [...referencedAssetIds(this.state)].sort();
    const key = ids.join("\n");
    if (key === this.assetRefsKey) return;
    try {
      await this.store.setAssetRefs(this.roomId, ids);
      this.assetRefsKey = key;
    } catch (err) {
      console.error(`[vtt] could not update asset refs for room ${this.roomId}`, err);
    }
  }

  /**
   * The credential rows' second lock for a removal (FR-GM-20, ADR 0006). The event is already
   * committed and is the authority, so a failure is logged, not surfaced: the state gate holds.
   */
  private async revokeCredentials(participantId: string) {
    try {
      await this.store.revokeCredentials(this.roomId, participantId);
    } catch (err) {
      console.error(`[vtt] could not revoke credentials for ${participantId} in room ${this.roomId}`, err);
    }
  }

  /**
   * Ends every connection bound to a participant who is no longer in the room: all their
   * tabs and devices, not just the one that asked (ADR 0006).
   */
  private endSession(participantId: string, reason: SessionEndReason) {
    for (const client of [...this.clients]) {
      if (client.participantId !== participantId) continue;
      this.clients.delete(client);
      client.send({ type: "sessionEnded", reason });
      client.close();
    }
  }

  private broadcast(committed: CommittedEvent, before: RoomState) {
    for (const client of this.clients) {
      const viewer = this.state.participants[client.participantId];
      if (!viewer) continue;
      const filtered = filterEventForViewer(committed, before, viewer);
      switch (filtered.kind) {
        case "event":
          client.send({ type: "event", committed: filtered.committed });
          break;
        case "redacted":
          client.send({ type: "redacted", seq: filtered.seq });
          break;
        case "resync":
          this.sendSnapshot(client);
          break;
      }
    }
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Whether every point is on the map image (ADR 0014); false when the room has no map. */
function onMap(map: RoomState["scene"]["map"], ...points: Point[]): boolean {
  return !!map && points.every((p) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height);
}
