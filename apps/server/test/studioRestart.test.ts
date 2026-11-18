import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { S3Client, CreateBucketCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import { S3StudioMediaStore } from "../src/store/studioMediaStore";
import { startServer } from "./helpers";
import { bearer, connectStudio, TEST_ORIGIN } from "./studioFlow";

const run=promisify(execFile);
const enabled=process.env.STUDIO_TEST_RESTART==="1";
const endpoint=process.env.STUDIO_TEST_S3_ENDPOINT;
const project=process.env.STUDIO_TEST_COMPOSE_PROJECT;
const environment=process.env.STUDIO_TEST_ENV_FILE;
const m2 = project?.match(/^sz-studio-m2-[a-f0-9]{8}$/) && process.env.DATABASE_URL?.includes("127.0.0.1:55435/studio_m2") && endpoint === "http://127.0.0.1:18335";
const m1b = project?.match(/^sz-studio-m1b-[a-z0-9-]+$/) && process.env.DATABASE_URL?.includes("127.0.0.1:55434/studio_m1b") && endpoint === "http://127.0.0.1:18334";
if(enabled&&(!environment||(!m2&&!m1b)))throw new Error("Restart test requires its explicit isolated M1b or M2 services");

describe.runIf(enabled)("actual isolated Postgres/S3 restart (FR-GM-26, FR-GM-27)",()=>{
  it("recovers the saved source/grant and retries deletion jobs after both Docker services restart",async()=>{
    const bucket=`studio-m1b-restart-${randomUUID().slice(0,8)}`;
    const options={endpoint:endpoint!,bucket,publicBucket:"studio-m1b-public",accessKeyId:process.env.STUDIO_TEST_S3_ACCESS_KEY!,secretAccessKey:process.env.STUDIO_TEST_S3_SECRET_KEY!};
    const admin=new S3Client({endpoint,region:"us-east-1",forcePathStyle:true,requestChecksumCalculation:"WHEN_REQUIRED",credentials:{accessKeyId:options.accessKeyId,secretAccessKey:options.secretAccessKey}});
    await admin.send(new CreateBucketCommand({Bucket:bucket}));
    let store=await PostgresRoomStore.connect(process.env.DATABASE_URL!);let media=await S3StudioMediaStore.connect(options);
    const bytes=await readFile(new URL("../../../browser/fixtures/studio-map.png",import.meta.url));
    let server=await startServer(store,{studio:{publicOrigin:TEST_ORIGIN},studioMedia:media,studioDownloader:async()=>bytes,dispatcher:{enqueue:async()=>{},close:async()=>{}}});
    try{
      const owner=await server.signUp();const first=await owner.json<{build:{id:string}}>("POST","/api/builds",{name:"Retained source"});const second=await owner.json<{build:{id:string}}>("POST","/api/builds",{name:"Discarded source"});
      const {tokens}=await connectStudio(server.base,owner,[first.build.id,second.build.id]);
      const intake=async(id:string)=>{
        const response=await fetch(`${server.base}/api/studio/builds/${id}/intake`,{method:"POST",headers:bearer(tokens.access_token,{"content-type":"application/json"}),body:JSON.stringify({kind:"map",file:{file_id:randomUUID(),download_url:"https://sdmntpreastus3.oaiusercontent.com/restart-fixture"}})});expect(response.status).toBe(201);
        return (await store.listBuildFiles(id))[0]!;
      };
      const retained=await intake(first.build.id),discarded=await intake(second.build.id);
      await fetch(`${server.base}/api/studio/builds/${first.build.id}/binding`,{method:"POST",headers:bearer(tokens.access_token,{"content-type":"application/json"}),body:JSON.stringify({fileId:retained.id})});
      expect((await fetch(`${server.base}/api/studio/builds/${first.build.id}/maps`,{method:"POST",headers:bearer(tokens.access_token,{"content-type":"application/json"}),body:JSON.stringify({key:"retained",name:"Retained map",fileId:retained.id})})).status).toBe(200);
      expect((await fetch(`${server.base}/api/studio/builds/${first.build.id}/studio/context`,{method:"POST",headers:bearer(tokens.access_token,{"content-type":"application/json"}),body:JSON.stringify({sourceFileId:retained.id,mapKey:"retained",encounterKey:null})})).status).toBe(200);
      const offline=vi.spyOn(media,"delete").mockRejectedValue(new Error("synthetic delete outage"));expect((await owner.request("DELETE",`/api/builds/${second.build.id}`)).status).toBe(204);offline.mockRestore();
      expect((await store.listStudioMediaJobs(new Date().toISOString())).length).toBeGreaterThan(0);
      await server.close();await store.close();media.close();
      await run("docker",["compose","--project-name",project!,"--env-file",environment!,"-f",new URL(m2 ? "../../../scripts/studio-m2/compose.yml" : "../../../scripts/studio-m1b/compose.yml",import.meta.url).pathname,"restart","postgres","s3"],{timeout:30_000});
      const until=Date.now()+30_000;
      for(;;){let candidate:PostgresRoomStore|undefined;try{candidate=await PostgresRoomStore.connect(process.env.DATABASE_URL!);media=await S3StudioMediaStore.connect(options);store=candidate;break;}catch{await candidate?.close();if(Date.now()>=until)throw new Error("Isolated restart did not become ready");await new Promise((resolve)=>setTimeout(resolve,500));}}
      server=await startServer(store,{studio:{publicOrigin:TEST_ORIGIN},studioMedia:media,dispatcher:{enqueue:async()=>{},close:async()=>{}}});
      const snapshot=await fetch(`${server.base}/api/studio/builds/${first.build.id}/studio`,{headers:bearer(tokens.access_token)});expect(snapshot.status).toBe(200);expect(await snapshot.json()).toMatchObject({sourceFileId:retained.id,files:[{id:retained.id}],context:{sourceFileId:retained.id,mapKey:"retained",encounterKey:null},outcomes:[{operation:"map",targetKey:"retained",status:"saved",code:"saved"}]});
      expect(await media.read(retained.objectKey,25*1024**2)).toEqual(bytes);expect(await media.read(discarded.objectKey,25*1024**2)).toBeNull();expect(await media.read(discarded.studio!.previewKey,4*1024**2)).toBeNull();
      const signedIn=await server.signIn(owner.email,owner.password);expect((await signedIn.request("DELETE","/api/auth/account",{password:owner.password})).status).toBe(204);expect(await media.read(retained.objectKey,25*1024**2)).toBeNull();
    }finally{await server.close().catch(()=>{});await store.close().catch(()=>{});media.close();await admin.send(new DeleteBucketCommand({Bucket:bucket}));admin.destroy();}
  },90_000);
});
