import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { isAwsEndpoint } from "./assetStore";

/** Private storage is deliberately not an AssetStore: it cannot produce /uploads URLs. */
export const PRIVATE_MEDIA_PREFIX = "studio-private/";
const KEY = /^studio-private\/v1\/[0-9a-f-]{36}\/(original\.(png|jpg|webp)|preview-v1\.webp)$/;
export const isPrivateMediaKey = (key: string) => key.startsWith(PRIVATE_MEDIA_PREFIX);
export function assertPrivateMediaKey(key: string) {
  if (!KEY.test(key)) throw new Error("Invalid private media key");
}
export interface StudioMediaStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  read(key: string, maxBytes: number): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const within = (root: string, child: string) => child === root || child.startsWith(root + path.sep);

export class LocalStudioMediaStore implements StudioMediaStore {
  private constructor(readonly root: string) {}
  static async connect(root: string, publicRoot: string) {
    // Resolve aliases before comparing, including an as-yet nonexistent final directory.
    await mkdir(publicRoot, { recursive: true });
    await mkdir(root, { recursive: true, mode: 0o700 });
    const [privateReal, publicReal] = await Promise.all([realpath(root), realpath(publicRoot)]);
    if (within(publicReal, privateReal) || within(privateReal, publicReal)) throw new Error("Private media and public uploads must be separate directories");
    await chmod(privateReal, 0o700);
    return new LocalStudioMediaStore(privateReal);
  }
  private async filename(key: string, create = false) {
    assertPrivateMediaKey(key);
    const parts = key.split("/");
    let parent = this.root;
    for (const part of parts.slice(0, -1)) {
      parent = path.join(parent, part);
      if (create) await mkdir(parent, { mode: 0o700 }).catch((e: NodeJS.ErrnoException) => { if (e.code !== "EEXIST") throw e; });
      const info = await lstat(parent);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Private media path is not a directory");
    }
    return path.join(parent, parts.at(-1)!);
  }
  async put(key: string, bytes: Uint8Array) {
    const destination = await this.filename(key, true);
    const temporary = destination + ".pending";
    try {
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(bytes); } finally { await file.close(); }
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
  async read(key: string, maxBytes: number) {
    try {
      const filename = await this.filename(key);
      const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > maxBytes) throw new Error("Private media exceeds limit");
        return await file.readFile();
      } finally { await file.close(); }
    } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }
  async delete(key: string) {
    try { const file = await this.filename(key); await rm(file, { force: true }); await rm(file + ".pending", { force: true }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
}

export interface StudioS3Options {
  endpoint: string; bucket: string; publicBucket: string; accessKeyId: string; secretAccessKey: string; region?: string;
}
export class S3StudioMediaStore implements StudioMediaStore {
  private constructor(private client: S3Client, readonly options: StudioS3Options) {}
  static async connect(options: StudioS3Options) {
    if (!options.bucket || options.bucket === options.publicBucket || !options.accessKeyId || !options.secretAccessKey) throw new Error("A distinct private bucket and credentials are required");
    const endpoint = new URL(options.endpoint);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("Invalid private storage endpoint");
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))) throw new Error("Private storage requires HTTPS (HTTP is allowed only on loopback)");
    const client = new S3Client({ endpoint: options.endpoint, region: options.region ?? "us-east-1", forcePathStyle: true, maxAttempts: 2,
      requestHandler: { requestTimeout: 20_000, connectionTimeout: 5_000, throwOnRequestTimeout: true },
      ...(!isAwsEndpoint(options.endpoint) && { requestChecksumCalculation: "WHEN_REQUIRED" as const }),
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } });
    const store = new S3StudioMediaStore(client, options);
    try {
      await client.send(new HeadBucketCommand({ Bucket: options.bucket }));
      await store.provePrivate();
      return store;
    } catch (e) { client.destroy(); throw e; }
  }
  /** A synthetic probe, never user bytes. Do not change bucket policy to make this pass. */
  private async provePrivate() {
    const prefix = `studio-private/v1/${randomUUID()}/`;
    // Bucket rules can differ by suffix; qualify every original and derivative shape.
    const keys = ["original.png", "original.jpg", "original.webp", "preview-v1.webp"].map((name) => prefix + name);
    const root = this.options.endpoint.replace(/\/$/, "");
    const denied = async (url: string, method: string) => {
      const response = await fetch(url, { method, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(5_000) });
      await response.body?.cancel();
      if (response.status !== 403 && response.status !== 401) throw new Error("Private storage permits anonymous access or could not prove denial");
    };
    let qualified = false; let qualificationError: unknown;
    try {
      for (const key of keys) {
        await this.put(key, Buffer.from("Session Zero private storage probe"), "application/octet-stream");
        const object = `${root}/${encodeURIComponent(this.options.bucket)}/${key}`;
        await denied(object, "GET"); await denied(object, "HEAD");
      }
      await denied(`${root}/${encodeURIComponent(this.options.bucket)}?list-type=2&prefix=studio-private%2F`, "GET");
      qualified = true;
    } catch (error) { qualificationError = error; }
    const removed = await Promise.allSettled(keys.map((key) => this.delete(key)));
    if (removed.some((item) => item.status === "rejected")) throw new Error("Private storage probe cleanup failed");
    if (!qualified) throw qualificationError ?? new Error("Private storage qualification failed");
  }
  async put(key: string, bytes: Uint8Array, contentType: string) {
    assertPrivateMediaKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: contentType, CacheControl: "no-store" }));
  }
  async read(key: string, maxBytes: number) {
    assertPrivateMediaKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
      if (!result.Body) return null;
      const body = result.Body;
      try {
        if ((result.ContentLength ?? 0) > maxBytes) throw new Error("Private media exceeds limit");
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of body as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength;
          if (size > maxBytes) throw new Error("Private media exceeds limit");
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      } finally { if ("destroy" in body && typeof body.destroy === "function") body.destroy(); }
    } catch (e) { if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null; throw e; }
  }
  async delete(key: string) { assertPrivateMediaKey(key); await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key })); }
  close() { this.client.destroy(); }
}

export async function createStudioMediaStore(uploadDir: string, env: NodeJS.ProcessEnv = process.env): Promise<StudioMediaStore | null> {
  if (!env.STUDIO_MEDIA_MODE) {
    if (env.STUDIO_PUBLIC_ORIGIN) throw new Error("STUDIO_MEDIA_MODE=local or s3 is required to enable Studio");
    return null;
  }
  if (env.STUDIO_MEDIA_MODE === "local") {
    if (!env.STUDIO_PRIVATE_DIR) throw new Error("STUDIO_PRIVATE_DIR is required for private local storage");
    return LocalStudioMediaStore.connect(env.STUDIO_PRIVATE_DIR, uploadDir);
  }
  if (env.STUDIO_MEDIA_MODE !== "s3") throw new Error("Unknown STUDIO_MEDIA_MODE");
  return S3StudioMediaStore.connect({ endpoint: env.STUDIO_S3_ENDPOINT ?? "", bucket: env.STUDIO_S3_BUCKET ?? "", publicBucket: env.S3_BUCKET ?? "vtt-assets",
    accessKeyId: env.STUDIO_S3_ACCESS_KEY ?? "", secretAccessKey: env.STUDIO_S3_SECRET_KEY ?? "", region: env.STUDIO_S3_REGION });
}
