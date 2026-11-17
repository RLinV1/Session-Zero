/** Explicit local browser harness. Production entrypoints never import this module. */
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildApp } from "../src/app";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { LocalStudioMediaStore } from "../src/store/studioMediaStore";
import { StudioIntakeError, studioDownloadUrl } from "../src/domain/studioDownload";

if (process.env.STUDIO_BROWSER_TEST !== "1" || process.env.S3_AUTODETECT !== "0" || process.env.DATABASE_URL) throw new Error("The Studio browser harness requires explicit isolated memory/disk configuration");
const root=process.env.STUDIO_PRIVATE_DIR!;const uploadDir=process.env.UPLOAD_DIR!;
await mkdir(uploadDir,{recursive:true});
const map=await readFile(new URL("../../../browser/fixtures/studio-map.png",import.meta.url));
const token=await readFile(new URL("../../../browser/fixtures/studio-token.png",import.meta.url));
const files=new Map([["/studio-browser-map",map],["/studio-browser-token",token]]);
const app=await buildApp({store:new MemoryRoomStore(),uploadDir,studio:{publicOrigin:"http://127.0.0.1:5189"},studioMedia:await LocalStudioMediaStore.connect(root,uploadDir),clientOrigin:"http://127.0.0.1:5189",redisUrl:undefined,visionUrl:"http://127.0.0.1:18889",wallQueue:null,
  studioDownloader:async(raw)=>{const url=studioDownloadUrl(raw);const bytes=files.get(url.pathname);if(!bytes)throw new StudioIntakeError("expired");return bytes;}});
app.express.get("/_test/studio-fixtures",(_req,res)=>res.json({map:{sha256:createHash("sha256").update(map).digest("hex"),bytes:map.length},token:{sha256:createHash("sha256").update(token).digest("hex"),bytes:token.length}}));
await app.listen({port:Number(process.env.PORT??3109),host:"127.0.0.1"});
console.log("[studio browser] synthetic fixtures, isolated memory and private disk");
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>void app.close().then(()=>process.exit(0)));
