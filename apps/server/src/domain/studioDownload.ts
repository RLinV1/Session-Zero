import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";

export const STUDIO_DOWNLOAD_ORIGINS = new Set(["https://sdmntpreastus3.oaiusercontent.com", "https://oaisdmntpreastus3.blob.core.windows.net"]);
export const STUDIO_FILE_BYTES = 25 * 1024 ** 2;
export const STUDIO_DOWNLOAD_MS = 20_000;
export class StudioIntakeError extends Error {
  constructor(readonly code: "origin" | "expired" | "download" | "size" | "image" | "busy" | "storage" | "limit" | "access" = "download") { super(code); }
}
const nonPublic4 = new BlockList();
const nonPublic6 = new BlockList();
const global6 = new BlockList();
global6.addSubnet("2000::", 3, "ipv6");
for (const [ip, bits] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) nonPublic4.addSubnet(ip, bits, "ipv4");
for (const [ip, bits] of [["::",96],["::ffff:0:0",96],["64:ff9b::",96],["64:ff9b:1::",48],["100::",64],["2001::",23],["2001:db8::",32],["2002::",16],["fc00::",7],["fe80::",10],["ff00::",8]] as const) nonPublic6.addSubnet(ip, bits, "ipv6");
export const publicDownloadAddress = (address: string) => {
  const family = isIP(address);
  return family === 4 ? !nonPublic4.check(address, "ipv4") : family === 6 && global6.check(address, "ipv6") && !nonPublic6.check(address, "ipv6");
};
export function studioDownloadUrl(raw: string): URL {
  let url: URL; try { url = new URL(raw); } catch { throw new StudioIntakeError("origin"); }
  if (url.username || url.password || url.hash || !STUDIO_DOWNLOAD_ORIGINS.has(url.origin) || (raw.includes("\\") || [...raw].some((ch) => ch.codePointAt(0)! <= 32))) throw new StudioIntakeError("origin");
  return url;
}
export type OriginalDownloader = (url: string) => Promise<Buffer>;

/** Never send application headers. The validated address is used by this very TLS connection. */
export async function downloadStudioOriginal(raw: string): Promise<Buffer> {
  const url = studioDownloadUrl(raw);
  const signal = AbortSignal.timeout(STUDIO_DOWNLOAD_MS);
  const answers = await Promise.race([dnsLookup(url.hostname, { all: true }), new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new StudioIntakeError("download")), { once: true }))]).catch(() => { throw new StudioIntakeError("download"); });
  if (!answers.length || answers.some((a) => !publicDownloadAddress(a.address))) throw new StudioIntakeError("origin");
  const selected = answers[0]!;
  return new Promise<Buffer>((resolve, reject) => {
    const fail = (code: StudioIntakeError["code"]) => reject(new StudioIntakeError(code));
    const request = https.get(url, { signal, agent: false, family: selected.family,
      lookup: (_host, _options, callback) => callback(null, selected.address, selected.family),
      headers: { accept: "image/png, image/jpeg, image/webp", "accept-encoding": "identity" } }, (response) => {
      const status = response.statusCode ?? 0;
      const length = response.headers["content-length"];
      const declared = length === undefined ? null : /^\d+$/.test(length) ? Number(length) : NaN;
      const encoding = response.headers["content-encoding"];
      if (status !== 200 || (encoding && encoding !== "identity") || (declared !== null && (!Number.isSafeInteger(declared) || declared > STUDIO_FILE_BYTES))) {
        response.destroy(); return fail(status === 401 || status === 403 || status === 404 ? "expired" : declared !== null && declared > STUDIO_FILE_BYTES ? "size" : "download");
      }
      const chunks: Buffer[] = []; let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > STUDIO_FILE_BYTES) { response.destroy(); fail("size"); } else chunks.push(chunk);
      });
      response.on("end", () => total === 0 || (declared !== null && total !== declared) ? fail("download") : resolve(Buffer.concat(chunks, total)));
      response.on("error", () => fail("download"));
      response.on("aborted", () => fail("download"));
    });
    request.on("error", () => fail("download"));
  });
}
