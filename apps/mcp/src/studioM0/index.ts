import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { StudioAuth, type Principal } from "./auth";
import { downloadOriginal } from "./download";
import { createStudioM0Server } from "./server";
import { EvidenceLog, WorkspaceStore } from "./store";
import { buildViewHtml } from "./view";

/**
 * M0 ONLY (interactive-ai-scene-studio): a flag-gated, fixture-only proof endpoint. It never reaches
 * Session Zero's room server, builds or storage. Enable with STUDIO_M0=1; see apps/mcp/README.studio-m0.md.
 */

export const STUDIO_PATH = "/mcp/studio-m0";

export interface StudioM0Options {
  /** The public HTTPS origin ChatGPT reaches (the tunnel), used for OAuth metadata and token audience. */
  publicOrigin: string;
  /** Private, Git-ignored folder for the evidence log, answer key and operator file. */
  dataDir: string;
  accessTtlSeconds?: number;
  /** Tests only. */
  allowHttpDownloads?: boolean;
  fetchImpl?: typeof fetch;
}

export interface StudioM0 {
  auth: StudioAuth;
  store: WorkspaceStore;
  log: EvidenceLog;
  makeServer: (principal: Principal) => McpServer;
}

export async function createStudioM0(options: StudioM0Options): Promise<StudioM0> {
  const log = new EvidenceLog(path.join(options.dataDir, "evidence.jsonl"));
  const auth = new StudioAuth({ publicOrigin: options.publicOrigin, resourcePath: STUDIO_PATH, dataDir: options.dataDir, accessTtlSeconds: options.accessTtlSeconds, log });
  await auth.init();
  const originsFile = path.join(options.dataDir, "file-origins.json");
  try {
    await access(originsFile);
  } catch {
    await writeFile(originsFile, "[]\n", { mode: 0o600 }); // Starts empty: no file origin is trusted until verified.
  }
  const store = new WorkspaceStore();
  const viewHtml = await buildViewHtml();
  const descriptors = new Map<string, string>();
  const download = { originsFile, allowHttp: options.allowHttpDownloads, fetchImpl: options.fetchImpl };
  auth.replayDescriptor = async (hostFileId) => {
    const url = descriptors.get(hostFileId);
    if (!url) return { outcome: "unknown", message: "No descriptor with that host file id is held." };
    try {
      const got = await downloadOriginal(url, download);
      return { outcome: "downloaded", bytes: got.bytes.length, origin: got.origin };
    } catch (err) {
      return { outcome: "refused", message: err instanceof Error ? err.message : "unknown" };
    }
  };
  await log.write("started", { publicOrigin: options.publicOrigin, resource: auth.resourceUrl, viewBytes: Buffer.byteLength(viewHtml) });
  return {
    auth, store, log,
    makeServer: (principal) => createStudioM0Server({
      principal, store, log, viewHtml, descriptors, download,
      answerKeyFile: path.join(options.dataDir, "answer-key.jsonl"),
    }),
  };
}
