import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * M0 ONLY (interactive-ai-scene-studio): an in-memory fixture workspace per OAuth subject. It holds
 * no real build, user art or room data, and disappears on restart. Real Studio state is M1+/M3.
 */

export interface StudioFile {
  id: string;
  name: string;
  /** "fixture" is generated here; "import" arrived through a host file descriptor. */
  source: "fixture" | "import";
  mimeType: string;
  bytes: Buffer;
  sha256: string;
  width: number;
  height: number;
  /** For imports: the origin the bytes came from, so evidence can name it. */
  origin?: string;
  createdAt: string;
}

export interface StudioRequest {
  id: string;
  workspaceId: string;
  rect: { x: number; y: number; width: number; height: number };
  instruction: string;
  baseVersion: number;
  status: "saved" | "observed";
  createdAt: string;
  observedAt?: string;
}

export interface Workspace {
  id: string;
  subject: string;
  version: number;
  value: string;
  files: Map<string, StudioFile>;
  mapFileId: string;
  requests: Map<string, StudioRequest>;
  updatedAt: string;
}

export const MAP_WIDTH = 1024;
export const MAP_HEIGHT = 768;
export const GRID = 64;

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A synthetic, non-sensitive map: a 64-pixel grid with a few labelled rooms. */
export async function renderFixtureMap(): Promise<Buffer> {
  const lines: string[] = [];
  for (let x = 0; x <= MAP_WIDTH; x += GRID) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${MAP_HEIGHT}" stroke="#8a7d68" stroke-width="1"/>`);
  for (let y = 0; y <= MAP_HEIGHT; y += GRID) lines.push(`<line x1="0" y1="${y}" x2="${MAP_WIDTH}" y2="${y}" stroke="#8a7d68" stroke-width="1"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}">
    <rect width="100%" height="100%" fill="#d9ccb0"/>
    ${lines.join("")}
    <rect x="128" y="128" width="320" height="256" fill="none" stroke="#3b2f22" stroke-width="12"/>
    <rect x="576" y="192" width="320" height="384" fill="none" stroke="#3b2f22" stroke-width="12"/>
    <rect x="440" y="224" width="144" height="48" fill="#a08c6a"/>
    <text x="288" y="260" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#3b2f22">HALL</text>
    <text x="736" y="390" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#3b2f22">CHAPEL</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Appends one JSON line of M0 evidence. Never write tokens, signed URLs or answer keys here. */
export class EvidenceLog {
  constructor(private file: string) {}
  async write(event: string, data: Record<string, unknown> = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...data });
    console.log(`[studio-m0] ${line}`);
    await mkdir(path.dirname(this.file), { recursive: true });
    await appendFile(this.file, `${line}\n`, { mode: 0o600 });
  }
}

export class WorkspaceStore {
  private bySubject = new Map<string, Workspace>();
  private byId = new Map<string, Workspace>();
  private fixture: Promise<Buffer> | null = null;

  constructor(private now: () => number = Date.now) {}

  private stamp() {
    return new Date(this.now()).toISOString();
  }

  /** One workspace per subject: opening again returns the same one, so a reopened view recovers it. */
  async open(subject: string): Promise<Workspace> {
    const existing = this.bySubject.get(subject);
    if (existing) return existing;
    this.fixture ??= renderFixtureMap();
    const bytes = await this.fixture;
    const map: StudioFile = {
      id: randomUUID(), name: "fixture-chapel.png", source: "fixture", mimeType: "image/png", bytes,
      sha256: sha256(bytes), width: MAP_WIDTH, height: MAP_HEIGHT, createdAt: this.stamp(),
    };
    const workspace: Workspace = {
      id: `ws_${randomBytes(9).toString("base64url")}`, subject, version: 1, value: "initial",
      files: new Map([[map.id, map]]), mapFileId: map.id, requests: new Map(), updatedAt: this.stamp(),
    };
    this.bySubject.set(subject, workspace);
    this.byId.set(workspace.id, workspace);
    return workspace;
  }

  /** Another subject's workspace reads exactly as one that doesn't exist. */
  get(subject: string, workspaceId: string): Workspace {
    const workspace = this.byId.get(workspaceId);
    if (!workspace || workspace.subject !== subject) throw new StudioError("No workspace with that id. Call studio_m0_open first.");
    return workspace;
  }

  setValue(workspace: Workspace, value: string) {
    workspace.value = value;
    workspace.version++;
    workspace.updatedAt = this.stamp();
  }

  addFile(workspace: Workspace, file: Omit<StudioFile, "id" | "sha256" | "createdAt">): StudioFile {
    const stored: StudioFile = { ...file, id: randomUUID(), sha256: sha256(file.bytes), createdAt: this.stamp() };
    workspace.files.set(stored.id, stored);
    if (file.source === "import" && file.width > 0) workspace.mapFileId = stored.id;
    workspace.version++;
    workspace.updatedAt = this.stamp();
    return stored;
  }

  saveRequest(workspace: Workspace, input: Pick<StudioRequest, "rect" | "instruction" | "baseVersion">): StudioRequest {
    const request: StudioRequest = {
      id: `req_${randomBytes(6).toString("hex")}`, workspaceId: workspace.id, status: "saved", createdAt: this.stamp(), ...input,
    };
    workspace.requests.set(request.id, request);
    workspace.version++;
    workspace.updatedAt = this.stamp();
    return request;
  }

  findRequest(subject: string, requestId: string): { workspace: Workspace; request: StudioRequest } {
    const workspace = this.bySubject.get(subject);
    const request = workspace?.requests.get(requestId);
    if (!workspace || !request) throw new StudioError("No saved Studio request with that id.");
    return { workspace, request };
  }

  markObserved(workspace: Workspace, request: StudioRequest) {
    if (request.status === "observed") return;
    request.status = "observed";
    request.observedAt = this.stamp();
    workspace.version++;
    workspace.updatedAt = this.stamp();
  }
}

/** A refusal the user or model can act on; its message is shown as is. */
export class StudioError extends Error {}

export const summarize = (workspace: Workspace) => ({
  workspaceId: workspace.id,
  version: workspace.version,
  value: workspace.value,
  updatedAt: workspace.updatedAt,
  mapFileId: workspace.mapFileId,
  files: [...workspace.files.values()].map((f) => ({
    fileId: f.id, name: f.name, source: f.source, mimeType: f.mimeType, bytes: f.bytes.length, sha256: f.sha256, width: f.width, height: f.height, origin: f.origin,
  })),
  requests: [...workspace.requests.values()].map((r) => ({
    requestId: r.id, status: r.status, rect: r.rect, instruction: r.instruction, baseVersion: r.baseVersion, createdAt: r.createdAt, observedAt: r.observedAt,
  })),
});
