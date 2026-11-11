import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Where uploaded map and token images live (DESIGN.md §2).
 *
 * Images do not belong in Postgres, so they go to object storage. The compose object store speaks the S3
 * API, so local dev and the deploy target run the same code path — and a checkout with
 * no object store running still works, on local disk.
 */
export interface AssetStore {
  /**
   * Moves a temporary upload into storage and returns the URL clients should use.
   *
   * The URL is always **origin-relative** (`/uploads/<key>`). An absolute one would bake
   * this machine's hostname into the event log, and the log is permanent: a map uploaded
   * as `http://localhost:9000/...` is unreachable from every device except the server's
   * own browser — phones, teammates, and the deployed app all get a broken image.
   */
  put(tempPath: string, filename: string, contentType: string): Promise<string>;
  /**
   * Streams an object back, or null when this store does not serve reads itself
   * (local disk is served by express.static instead).
   */
  read?(key: string): Promise<{ body: Readable; contentType?: string } | null>;
  /** Server-only bytes for analysis. Never constructs or follows a user-supplied URL. */
  readPrivate(key: string, maxBytes: number): Promise<Uint8Array | null>;
  /**
   * Removes an object for good (library delete, ADR 0004). Missing keys are not an error.
   * Rooms whose event log still names the URL then get a 404 and draw a generic stand-in.
   */
  delete(key: string): Promise<void>;
  /** The stored object's length in bytes, or null when there is no such object. */
  sizeOf(key: string): Promise<number | null>;
}

/** Fallback for `pnpm dev` and CI with no containers running. Served by express.static. */
export class LocalDiskAssetStore implements AssetStore {
  constructor(private uploadDir: string) {}

  async put(tempPath: string, filename: string): Promise<string> {
    await mkdir(this.uploadDir, { recursive: true });
    // multer already wrote the file into uploadDir; just confirm and address it.
    await stat(tempPath);
    return `/uploads/${filename}`;
  }

  async delete(key: string) {
    // basename: a key is only ever a bare filename, never a path out of uploadDir.
    await unlink(path.join(this.uploadDir, path.basename(key))).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  }

  async sizeOf(key: string) {
    try {
      return (await stat(path.join(this.uploadDir, path.basename(key)))).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async readPrivate(key: string, maxBytes: number) {
    const filename = path.join(this.uploadDir, path.basename(key));
    try {
      if ((await stat(filename)).size > maxBytes) throw new Error("Image exceeds analysis limit");
      return await readFile(filename);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
}

export class S3AssetStore implements AssetStore {
  private constructor(
    private s3: S3Client,
    private bucket: string,
  ) {}

  static async connect(opts: {
    endpoint: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    /** S3 client attempts per request; 1 for a quick availability probe. */
    attempts?: number;
  }): Promise<S3AssetStore> {
    const bucket = opts.bucket ?? "vtt-assets";
    const s3 = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region ?? "us-east-1",
      ...(opts.attempts !== undefined && { maxAttempts: opts.attempts }),
      // Path-style addressing: the bucket is in the path, not the subdomain.
      forcePathStyle: true,
      // The SDK adds a trailing checksum to streamed uploads by default, which SeaweedFS rejects as
      // InvalidAccessKeyId; ask for one only where an operation requires it. AWS S3 keeps the default.
      ...(!isAwsEndpoint(opts.endpoint) && { requestChecksumCalculation: "WHEN_REQUIRED" as const }),
      credentials: {
        accessKeyId: opts.accessKeyId ?? "vtt",
        secretAccessKey: opts.secretAccessKey ?? "vttvttvtt",
      },
    });

    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }

    // Buckets are private by default, which would make every returned URL a 403 in the
    // browser. Objects are named by UUID and carry no room data, and DESIGN.md §5 wants
    // them served from an origin separate from the app, so read is public and write is not.
    await s3.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${bucket}/*`],
            },
          ],
        }),
      }),
    );

    return new S3AssetStore(s3, bucket);
  }

  async put(tempPath: string, filename: string, contentType: string): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: filename,
        Body: createReadStream(tempPath),
        ContentType: contentType,
        ContentLength: (await stat(tempPath)).size,
      }),
    );
    // Relative on purpose — see the AssetStore docstring.
    return `/uploads/${filename}`;
  }

  async delete(key: string) {
    // S3 DeleteObject is already idempotent: a missing key succeeds.
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async sizeOf(key: string) {
    try {
      const out = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return out.ContentLength ?? null;
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  async read(key: string) {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) return null;
    return { body: out.Body as Readable, contentType: out.ContentType };
  }

  async readPrivate(key: string, maxBytes: number) {
    const object = await this.read(key);
    if (!object) return null;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of object.body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > maxBytes) {
        object.body.destroy();
        throw new Error("Image exceeds analysis limit");
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
}

/** Where `docker compose up` puts the S3 object store. 127.0.0.1, not localhost: a WSL relay can hold ::1. */
export const DEV_S3_ENDPOINT = "http://127.0.0.1:8333";
const PROBE_TIMEOUT_MS = 1000;

type Connect = (opts: Parameters<typeof S3AssetStore.connect>[0]) => Promise<AssetStore>;

/**
 * Uploads go to object storage whenever it is available (upload-storage):
 * `S3_ENDPOINT` when set; otherwise, outside production, the compose object store if it answers
 * within a second; local disk only when neither applies. Production never falls back.
 */
/** Whether an S3 endpoint is AWS itself, which accepts the SDK's default upload checksums. */
export function isAwsEndpoint(endpoint: string): boolean {
  try {
    return /(^|\.)amazonaws\.com(\.cn)?$/.test(new URL(endpoint).hostname);
  } catch {
    return false;
  }
}

export async function createAssetStore(
  uploadDir: string,
  env: NodeJS.ProcessEnv = process.env,
  connect: Connect = (opts) => S3AssetStore.connect(opts),
): Promise<AssetStore> {
  const credentials = {
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  };
  const disk = new LocalDiskAssetStore(uploadDir);
  // The defaults in `connect` are the docker-compose development values: publicly known, so
  // production must name its own (security-hardening D4).
  if (env.NODE_ENV === "production" && env.S3_ENDPOINT && (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY)) {
    throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY are required in production; the development credentials must not be used");
  }
  if (env.S3_ENDPOINT) {
    const store = await connect({ endpoint: env.S3_ENDPOINT, ...credentials });
    console.log(`[vtt] storing uploads in object storage at ${env.S3_ENDPOINT} (and on local disk)`);
    return withDiskCopy(store, disk);
  }
  if (env.NODE_ENV === "production") {
    throw new Error("S3_ENDPOINT is required in production; uploads must not go to local disk");
  }
  if (env.S3_AUTODETECT === "0") {
    console.log("[vtt] S3_AUTODETECT=0 — storing uploads on local disk");
    return disk;
  }
  const found = await withTimeout(connect({ endpoint: DEV_S3_ENDPOINT, ...credentials, attempts: 1 }), PROBE_TIMEOUT_MS);
  if (found) {
    console.log(`[vtt] found object storage at ${DEV_S3_ENDPOINT} — storing uploads there (and on local disk)`);
    return withDiskCopy(found, disk);
  }
  console.log(`[vtt] no object storage at ${DEV_S3_ENDPOINT} — storing uploads on local disk`);
  return disk;
}

/**
 * Every upload lands on local disk first (multer writes it there) and stays there; with
 * object storage it is also stored in the bucket, which serves it. The disk copy is the fallback the
 * `/uploads` route reads when object storage misses, so a delete must remove both, or a deleted
 * library asset would keep loading from disk.
 */
function withDiskCopy(s3: AssetStore, disk: LocalDiskAssetStore): AssetStore {
  return {
    put: (tempPath, filename, contentType) => s3.put(tempPath, filename, contentType),
    read: s3.read?.bind(s3),
    readPrivate: async (key, maxBytes) => {
      try {
        return (await s3.readPrivate(key, maxBytes)) ?? disk.readPrivate(key, maxBytes);
      } catch {
        // Multer's local copy is the same fallback used by the public /uploads route.
        return disk.readPrivate(key, maxBytes);
      }
    },
    delete: async (key) => {
      await s3.delete(key);
      await disk.delete(key);
    },
    sizeOf: async (key) => (await s3.sizeOf(key)) ?? disk.sizeOf(key),
  };
}

/** The value, or null if the promise rejects or takes longer than `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise.catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const assetPath = (uploadDir: string, filename: string) => path.join(uploadDir, filename);
