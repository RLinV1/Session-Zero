/**
 * The playtest's seat at the table: signs in over REST, creates the room, seats players and opens
 * one Socket.IO connection per participant, exactly as the web client does (HandshakeAuth,
 * ClientMessage, reduceReceived). Every change still goes Command → decide → events on the server;
 * this file only mirrors the room state each seat is sent.
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { io } from "socket.io-client";
import { SOCKET_EVENTS, reduceReceived } from "@vtt/shared";

export const newGuestToken = () => randomBytes(32).toString("base64url");

export class Seat {
  constructor(table, { name, guestToken, participantId, role, roomId }) {
    Object.assign(this, { table, name, guestToken, participantId, role, roomId });
    this.state = null;
    this.pending = new Map();
    this.nextId = 0;
    this.listeners = new Set();
  }

  /** Connects and resolves once the first snapshot has arrived. */
  connect() {
    return new Promise((resolve, reject) => {
      const socket = io(this.table.server, { path: "/socket.io", transports: ["websocket"], auth: { roomId: this.roomId, guestToken: this.guestToken } });
      this.socket = socket;
      socket.on("connect_error", (err) => reject(new Error(`${this.name}: ${err.message}`)));
      socket.on(SOCKET_EVENTS.event, (msg) => {
        if (msg.type === "welcome") { this.state = msg.state; this.seq = msg.seq; this.you = msg.you; resolve(this); }
        else if (msg.type === "event") {
          if (msg.committed.seq !== this.seq + 1) { socket.emit(SOCKET_EVENTS.message, { type: "resync" }); return; }
          this.state = reduceReceived(this.state, msg.committed);
          this.seq = msg.committed.seq;
          for (const fn of this.listeners) fn(msg.committed);
        } else if (msg.type === "redacted") this.seq = msg.seq;
        else if (msg.type === "ack") this.settle(msg.clientCommandId, null);
        else if (msg.type === "rejected") this.settle(msg.clientCommandId, new Error(`${this.name}: ${msg.command?.type ?? ""} ${msg.code}: ${msg.message}`));
      });
    });
  }

  settle(id, error) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (error) p.reject(Object.assign(error, { command: p.command })); else p.resolve();
  }

  /** Sends one command and waits for its ack (events arrive before the ack on the same socket). */
  command(command) {
    const clientCommandId = `p${++this.nextId}`;
    return new Promise((resolve, reject) => {
      this.pending.set(clientCommandId, { resolve, reject, command });
      this.socket.emit(SOCKET_EVENTS.message, { type: "command", clientCommandId, command });
    }).catch((err) => { throw new Error(`${err.message} (${command.type})`); });
  }

  ephemeral(payload) { this.socket.emit(SOCKET_EVENTS.message, { type: "ephemeral", payload }); }

  /** The newest roll this seat made, once its DiceRolled event has been applied. */
  lastRollBy(participantId = this.participantId) {
    const rolls = this.state.rolls ?? [];
    for (let i = rolls.length - 1; i >= 0; i--) if (rolls[i].byParticipantId === participantId && rolls[i].dice) return rolls[i];
    return null;
  }

  close() { this.socket?.disconnect(); }
}

export class Table {
  constructor(server) { this.server = server; this.cookie = ""; }

  async rest(path, { method = "GET", json, form, bearer } = {}) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    let body;
    if (json) { headers["content-type"] = "application/json"; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(`${this.server}${path}`, { method, headers, body });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) this.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
    return data;
  }

  signIn(email, password) { return this.rest("/api/auth/signin", { method: "POST", json: { email, password } }); }

  async library() { return this.rest("/api/library"); }

  async importUvtt(file) {
    const form = new FormData();
    form.append("file", new Blob([await readFile(file)], { type: "application/json" }), basename(file));
    return this.rest("/api/library/uvtt/imports", { method: "POST", form });
  }

  async createRoom(roomName, displayName, preset) {
    const guestToken = newGuestToken();
    const r = await this.rest("/api/rooms", { method: "POST", json: { roomName, displayName, guestToken, preset } });
    this.roomId = r.roomId;
    this.inviteCode = r.inviteCode;
    this.gm = new Seat(this, { name: displayName, guestToken, participantId: r.participantId, role: "gm", roomId: r.roomId });
    return this.gm;
  }

  /** Joins as a guest through the invite link, with no account (FR-PL-01). */
  async join(displayName) {
    const guestToken = newGuestToken();
    const res = await fetch(`${this.server}/api/invites/${this.inviteCode}/join`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName, guestToken }),
    });
    if (!res.ok) throw new Error(`join ${displayName}: ${res.status} ${await res.text()}`);
    const r = await res.json();
    return new Seat(this, { name: displayName, guestToken, participantId: r.participantId, role: "player", roomId: r.roomId });
  }

  /** A token image, uploaded into the room by the GM (FR-GM-08). */
  async uploadToken(file) {
    const form = new FormData();
    form.append("purpose", "token");
    form.append("file", new Blob([await readFile(file)], { type: "image/webp" }), basename(file));
    return (await this.rest("/api/uploads", { method: "POST", form, bearer: this.gm.guestToken })).url;
  }
}
