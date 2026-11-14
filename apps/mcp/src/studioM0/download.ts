import { readFile } from "node:fs/promises";
import { StudioError } from "./store";

/**
 * M0 ONLY: fetch an original file from a host-supplied download descriptor (design D9). The URL is
 * untrusted: only exact allowlisted origins, no redirects, no credentials, identity encoding, a
 * streamed byte cap and a total deadline. The allowlist starts empty; an operator adds an origin
 * only after verifying the host actually issued it (research.md Q3).
 */

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20_000;

export interface DownloadPolicy {
  /** A JSON file holding an array of allowed origins, re-read on every import so it can change without a restart. */
  originsFile: string;
  /** Tests only: let http:// origins through. */
  allowHttp?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

async function allowedOrigins(file: string): Promise<Set<string>> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export interface Downloaded {
  bytes: Buffer;
  origin: string;
  contentType: string | null;
}

export async function downloadOriginal(downloadUrl: string, policy: DownloadPolicy): Promise<Downloaded> {
  let url: URL;
  try {
    url = new URL(downloadUrl);
  } catch {
    throw new StudioError("That file descriptor has no valid download URL. Select the file again.");
  }
  const schemeOk = url.protocol === "https:" || (policy.allowHttp === true && url.protocol === "http:");
  if (!schemeOk || url.username || url.password) throw new StudioError("That file URL isn't an HTTPS address this server can use. Select the file again.");
  if (!(await allowedOrigins(policy.originsFile)).has(url.origin)) {
    // Naming the origin (never the full signed URL) lets an operator verify and approve it.
    throw new StudioError(`Files from ${url.origin} aren't approved yet, so nothing was downloaded. The operator must verify that origin before it is allowed.`);
  }

  const maxBytes = policy.maxBytes ?? MAX_IMPORT_BYTES;
  const signal = AbortSignal.timeout(policy.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (policy.fetchImpl ?? fetch)(url, {
      method: "GET", redirect: "manual", credentials: "omit", signal,
      headers: { accept: "image/png, image/jpeg, image/webp", "accept-encoding": "identity" },
    });
  } catch {
    throw new StudioError("The file couldn't be downloaded (it may have expired). Select or attach it again.");
  }
  if (response.status >= 300 && response.status < 400) throw new StudioError("The file URL redirected, which isn't allowed. Select or attach the file again.");
  if (!response.ok || !response.body) throw new StudioError(`The file couldn't be downloaded (HTTP ${response.status}); the link may have expired. Select or attach it again.`);
  const encoding = response.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") throw new StudioError("The file arrived compressed, so its original bytes can't be checked. Select it again.");
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) throw new StudioError(`The file is larger than ${maxBytes / 1024 / 1024} MiB.`);

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new StudioError(`The file is larger than ${maxBytes / 1024 / 1024} MiB.`);
      chunks.push(Buffer.from(value));
    }
  } catch (err) {
    if (err instanceof StudioError) throw err;
    throw new StudioError("The download stopped before the whole file arrived. Select or attach it again.");
  } finally {
    void reader.cancel().catch(() => {});
  }
  if (declared && Number(declared) !== total) throw new StudioError("The download was incomplete. Select or attach the file again.");
  return { bytes: Buffer.concat(chunks, total), origin: url.origin, contentType: response.headers.get("content-type") };
}
