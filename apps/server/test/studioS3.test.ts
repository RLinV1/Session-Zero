import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CreateBucketCommand, S3Client, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";
import { S3StudioMediaStore } from "../src/store/studioMediaStore";
import { S3AssetStore } from "../src/store/assetStore";
import { startServer } from "./helpers";
import { connectStudio, TEST_ORIGIN, bearer } from "./studioFlow";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

const endpoint=process.env.STUDIO_TEST_S3_ENDPOINT;
// This suite cannot select the development store: all four isolation variables are required.
const enabled=Boolean(endpoint && process.env.STUDIO_TEST_S3_ACCESS_KEY && process.env.STUDIO_TEST_S3_SECRET_KEY && process.env.STUDIO_TEST_S3_BUCKET);
const prefix=process.env.STUDIO_TEST_S3_BUCKET ?? "unconfigured";
if(enabled && (!endpoint!.startsWith("http://127.0.0.1:") || endpoint!.includes(":8333") || !prefix.startsWith("studio-m1b-"))) throw new Error("Studio S3 tests require their isolated loopback endpoint/bucket prefix");
const clients:S3StudioMediaStore[]=[];
const buckets:string[]=[];
const s3=enabled?new S3Client({endpoint,region:"us-east-1",forcePathStyle:true,requestChecksumCalculation:"WHEN_REQUIRED",credentials:{accessKeyId:process.env.STUDIO_TEST_S3_ACCESS_KEY!,secretAccessKey:process.env.STUDIO_TEST_S3_SECRET_KEY!}}):null;
afterAll(async()=>{
  clients.forEach((c)=>c.close());
  if(s3) for(const bucket of buckets) {
    const objects=await s3.send(new ListObjectsV2Command({Bucket:bucket}));
    if(objects.Contents?.length) await s3.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{Objects:objects.Contents.map(({Key})=>({Key}))}}));
    await s3.send(new DeleteBucketCommand({Bucket:bucket}));
  }
  s3?.destroy();
});
async function stores() {
  const privateBucket=`${prefix}-${randomUUID().slice(0,8)}`;const publicBucket=`${privateBucket}-public`;
  await s3!.send(new CreateBucketCommand({Bucket:privateBucket}));buckets.push(privateBucket,publicBucket);
  const publicStore=await S3AssetStore.connect({endpoint:endpoint!,bucket:publicBucket,accessKeyId:process.env.STUDIO_TEST_S3_ACCESS_KEY,secretAccessKey:process.env.STUDIO_TEST_S3_SECRET_KEY});
  const options={endpoint:endpoint!,bucket:privateBucket,publicBucket,accessKeyId:process.env.STUDIO_TEST_S3_ACCESS_KEY!,secretAccessKey:process.env.STUDIO_TEST_S3_SECRET_KEY!};
  const media=await S3StudioMediaStore.connect(options);clients.push(media);
  return {media,publicStore,options};
}
describe.runIf(enabled)("real isolated S3 private media (FR-GM-26, FR-GM-27)",()=>{
  it("serves legacy public bytes but never exposes private originals or derivatives through S3/uploads/static",async()=>{
    const {media,publicStore,options}=await stores();
    const bytes=await sharp({create:{width:128,height:96,channels:3,background:"#426b76"}}).png().toBuffer();
    const server=await startServer(new MemoryRoomStore(),{studio:{publicOrigin:TEST_ORIGIN},studioMedia:media,assets:publicStore,studioDownloader:async()=>bytes});
    try {
      const owner=await server.signUp();const {build}=await owner.json<{build:{id:string}}>("POST","/api/builds",{name:"S3 fixture"});const {tokens}=await connectStudio(server.base,owner,[build.id]);
      const response=await fetch(`${server.base}/api/studio/builds/${build.id}/intake`,{method:"POST",headers:bearer(tokens.access_token,{"content-type":"application/json"}),body:JSON.stringify({kind:"map",file:{file_id:"s3-fixture",download_url:"https://sdmntpreastus3.oaiusercontent.com/synthetic"}})});expect(response.status).toBe(201);
      const row=(await server.store.listBuildFiles(build.id))[0]!;
      expect(row.studio!.originalSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      for(const key of [row.objectKey,row.studio!.previewKey]) {
        expect(await media.read(key,4*1024**2)).not.toBeNull();
        for(const method of ["GET","HEAD"]) { const raw=await fetch(`${endpoint}/${options.bucket}/${key}`,{method});expect(raw.status).toBe(403);await raw.body?.cancel(); }
        for(const suffix of [key,encodeURIComponent(key),encodeURIComponent(encodeURIComponent(key)),key.replaceAll("/","%2F"),path.basename(key)]) { const publicRead=await fetch(`${server.base}/uploads/${suffix}`);expect(publicRead.status).not.toBe(200);await publicRead.body?.cancel(); }
      }
      const original=await fetch(`${server.base}/api/studio/builds/${build.id}/files/${row.id}/media`,{headers:bearer(tokens.access_token)});expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);expect(original.headers.get("cache-control")).toBe("no-store");
      const unauthorized=await fetch(`${server.base}/api/builds/${build.id}/files/${row.id}/media?variant=preview`);expect(unauthorized.status).toBe(401);expect(unauthorized.headers.get("cache-control")).toBe("no-store");
      const file=path.join(server.uploadDir,"legacy.png");await writeFile(file,bytes);await publicStore.put(file,"legacy.png","image/png");expect((await fetch(`${server.base}/uploads/legacy.png`)).status).toBe(200);
      expect((await owner.request("DELETE",`/api/builds/${build.id}`)).status).toBe(204);expect(await media.read(row.objectKey,10000)).toBeNull();expect(await media.read(row.studio!.previewKey,10000)).toBeNull();expect((await fetch(`${server.base}/uploads/legacy.png`)).status).toBe(200);
    } finally {await server.close();}
  });
  it("fails closed on the public bucket, missing buckets and bucket-name collisions",async()=>{
    const {options}=await stores();
    await expect(S3StudioMediaStore.connect({...options,bucket:options.publicBucket,publicBucket:"another-public-bucket"})).rejects.toThrow(/anonymous/);
    await expect(S3StudioMediaStore.connect({...options,bucket:options.publicBucket})).rejects.toThrow(/distinct/);
    await expect(S3StudioMediaStore.connect({...options,bucket:`${prefix}-absent-${randomUUID().slice(0,8)}`})).rejects.toThrow();
  });
  it("retains private bytes across a new authenticated adapter instance",async()=>{
    const {media,options}=await stores();const key=`studio-private/v1/${randomUUID()}/original.png`;await media.put(key,Buffer.from("synthetic restart bytes"),"image/png");
    const reopened=await S3StudioMediaStore.connect(options);clients.push(reopened);expect((await reopened.read(key,1000))!.toString()).toBe("synthetic restart bytes");await reopened.delete(key);expect(await media.read(key,1000)).toBeNull();
  });
});
