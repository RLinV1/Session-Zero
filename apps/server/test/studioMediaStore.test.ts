import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { StudioMedia } from "../src/domain/studioMedia";
import { LocalStudioMediaStore } from "../src/store/studioMediaStore";
import { BuildLimitError, BuildPublishConflictError } from "../src/store/buildStore";
import { StudioAccessEndedError } from "../src/store/studioStore";
import { storeCases } from "./storeHarness";
import type { RoomStore } from "../src/store/roomStore";
import { startServer } from "./helpers";

export async function studioMediaStoreFixture(store:RoomStore) {
  const at=new Date().toISOString();
  const user=await store.createUser({id:randomUUID(),email:`${randomUUID()}@example.com`,passwordHash:"synthetic",displayName:"Synthetic GM"});
  const build=await store.createBuild({id:randomUUID(),ownerGmId:user.ownerId,name:"Synthetic intake"},100);
  const clientId=`fixture-${randomUUID()}`;await store.registerStudioClient({id:clientId,name:"Fixture",redirectUris:["https://ai.test.invalid/callback"],createdAt:at,lastUsedAt:null},100000,at);
  const grant={id:randomUUID(),ownerGmId:user.ownerId,clientId,resource:"https://studio.test.invalid/mcp/studio",scope:"studio:build",buildIds:[build.id],codeHash:randomUUID(),codeChallenge:"x".repeat(43),redirectUri:"https://ai.test.invalid/callback",codeExpiresAt:new Date(Date.now()+300000).toISOString(),codeUsedAt:null,createdAt:at,expiresAt:new Date(Date.now()+86400000).toISOString(),revokedAt:null,lastUsedAt:null};
  await store.createStudioGrant(grant,100,at);const hash=randomUUID();await store.redeemStudioCode(grant.id,at,[{tokenHash:hash,grantId:grant.id,kind:"access",expiresAt:grant.expiresAt,createdAt:at,usedAt:null}]);
  const root=await mkdtemp(path.join(tmpdir(),"studio-store-"));const media=await LocalStudioMediaStore.connect(path.join(root,"private"),path.join(root,"public"));
  const bytes=await sharp({create:{width:64,height:48,channels:3,background:"#544b78"}}).png().toBuffer();
  const service=new StudioMedia(store,media,async()=>bytes);const delegation={tokenHash:hash,now:Date.now};
  const file={file_id:"fixture-id",download_url:"https://sdmntpreastus3.oaiusercontent.com/fixture"};
  return {user,build,grant,media,bytes,service,delegation,file};
}
describe.each(storeCases)("private-media persistence on %s (FR-GM-26, FR-GM-27)",(_name,makeStore)=>{
  it("deduplicates simultaneous receipt/content retries under the same build lock",async()=>{
    const store=makeStore();const s=await studioMediaStoreFixture(store);
    const replies=await Promise.all([s.service.intake(s.build.id,"map",s.file,s.delegation),s.service.intake(s.build.id,"map",{...s.file,file_id:"new-host-id"},s.delegation)]);
    expect(replies[0]!.file.id).toBe(replies[1]!.file.id);expect(replies.filter((r)=>r.created)).toHaveLength(1);expect(await store.listBuildFiles(s.build.id)).toHaveLength(1);
    await s.service.sweep();expect(await store.listStudioMediaJobs(new Date().toISOString())).toHaveLength(0);
    const usage=await store.buildFileUsage(s.build.id);expect(usage.bytes).toBe(replies[0]!.file.studio!.totalBytes);
  });
  it("counts derivative bytes at commit and refuses private publication even through a forged store plan",async()=>{
    const store=makeStore();const s=await studioMediaStoreFixture(store);const saved=await s.service.intake(s.build.id,"map",s.file,s.delegation);
    const id=randomUUID();const next={...saved.file,id,objectKey:`studio-private/v1/${id}/original.png`,studio:{...saved.file.studio!,previewKey:`studio-private/v1/${id}/preview-v1.webp`,originalSha256:"d".repeat(64),receiptKeys:["another"]}};
    await store.startStudioMedia({id,buildId:s.build.id,state:"write",keys:[next.objectKey,next.studio.previewKey],expiresAt:new Date(Date.now()+3600000).toISOString()},s.delegation);
    await expect(store.commitStudioFile(next,{files:100,maps:20,bytes:saved.file.studio!.totalBytes+next.sizeBytes},s.delegation)).rejects.toBeInstanceOf(BuildLimitError);
    expect(await store.listBuildFiles(s.build.id)).toHaveLength(1);await store.failStudioMedia(id);await s.service.sweep();
    const plan={buildId:s.build.id,ownerGmId:s.user.ownerId,reviewed:[],assets:[{fileId:saved.file.id,record:{...saved.file,id:randomUUID(),ownerGmId:s.user.ownerId,name:"Private fixture"}}],creatures:[],maps:[],encounters:[]};
    await expect(store.publishBuild(plan,{maxItems:1000,maxBytes:2000000000},100)).rejects.toBeInstanceOf(BuildPublishConflictError);
  });
  it("refuses a grant revoked while private objects are written and cleans the uncommitted objects",async()=>{
    const store=makeStore();const s=await studioMediaStoreFixture(store);const put=s.media.put.bind(s.media);
    vi.spyOn(s.media,"put").mockImplementationOnce(async(key,bytes)=>{await store.revokeStudioGrant(s.grant.id,new Date().toISOString());return put(key,bytes);});
    await expect(s.service.intake(s.build.id,"map",s.file,s.delegation)).rejects.toBeInstanceOf(StudioAccessEndedError);expect(await store.listBuildFiles(s.build.id)).toHaveLength(0);await s.service.sweep();expect(await store.listStudioMediaJobs(new Date().toISOString())).toHaveLength(0);
  });
  it("keeps durable failed deletion jobs across a service restart and retains the other build in a grant",async()=>{
    const store=makeStore();const s=await studioMediaStoreFixture(store);const first=await s.service.intake(s.build.id,"map",s.file,s.delegation);
    const second=await store.createBuild({id:randomUUID(),ownerGmId:s.user.ownerId,name:"Retained build"},100);
    const multi={...s.grant,id:randomUUID(),codeHash:randomUUID(),buildIds:[s.build.id,second.id]};await store.createStudioGrant(multi,100,new Date().toISOString());
    const deletion=vi.spyOn(s.media,"delete").mockRejectedValue(new Error("offline"));await store.closeBuild(s.build.id,s.user.ownerId);await s.service.sweep();expect((await store.listStudioMediaJobs(new Date().toISOString())).length).toBeGreaterThan(0);
    const retained=await store.findStudioGrantByCode(multi.codeHash);expect(retained!.buildIds).toEqual([second.id]);expect(retained!.revokedAt).toBeNull();
    deletion.mockRestore();const restarted=new StudioMedia(store,s.media);await restarted.sweep();expect(await s.media.read(first.file.objectKey,10000)).toBeNull();expect(await s.media.read(first.file.studio!.previewKey,10000)).toBeNull();expect(await store.listStudioMediaJobs(new Date().toISOString())).toHaveLength(0);
  });
  it("does not lose a write intent when discard races a delayed storage put",async()=>{
    const store=makeStore();const s=await studioMediaStoreFixture(store);
    let entered!:()=>void, release!:()=>void; const began=new Promise<void>((r)=>{entered=r;}); const resume=new Promise<void>((r)=>{release=r;});
    const put=s.media.put.bind(s.media);let key="";
    vi.spyOn(s.media,"put").mockImplementationOnce(async(k,bytes)=>{key=k;entered();await resume;return put(k,bytes);});
    const intake=s.service.intake(s.build.id,"map",s.file,s.delegation);const refused=expect(intake).rejects.toThrow();await began;
    await store.closeBuild(s.build.id,s.user.ownerId);await s.service.sweep();release();await refused;await s.service.sweep();
    expect(await s.media.read(key,10000)).toBeNull();expect(await s.media.read(key.replace(/original\.png$/,"preview-v1.webp"),10000)).toBeNull();
    const future=Date.now()+2*60*60_000;expect((await store.listStudioMediaJobs(new Date(future).toISOString())).length).toBeGreaterThan(0);
    const id=key.split("/")[2]!; const check=await store.claimStudioMediaDeletion(id,new Date(future).toISOString()); expect(check).not.toBeNull(); for(const object of check!.keys)await s.media.delete(object); await store.finishStudioMediaDeletion(id,new Date(future).toISOString()); expect(await store.listStudioMediaJobs(new Date(future).toISOString())).not.toContain(id);
  });
  it("rechecks abandoned-build age under the close lock, preserving a newly edited build",async()=>{
    const store=makeStore();const s=await studioMediaStoreFixture(store);await s.service.intake(s.build.id,"map",s.file,s.delegation);
    expect(await store.closeBuild(s.build.id,s.user.ownerId,new Date(0).toISOString())).toBeNull();expect(await store.listBuildFiles(s.build.id)).toHaveLength(1);
    const closed=await store.closeBuild(s.build.id,s.user.ownerId,new Date(Date.now()+1000).toISOString());expect(closed).not.toBeNull();await s.service.sweep();expect(await store.listBuildFiles(s.build.id)).toHaveLength(0);
  });

  it("the actual 14-day sweep closes access and deletes private originals and derivatives",async()=>{
    const store=makeStore();const s=await studioMediaStoreFixture(store);const saved=await s.service.intake(s.build.id,"map",s.file,s.delegation);
    let clock=Date.now();const server=await startServer(store,{studioMedia:s.media,now:()=>clock,dispatcher:{enqueue:async()=>{},close:async()=>{}}});
    try {
      await server.app.sweepAbandonedBuilds();expect((await store.findBuild(s.build.id,s.user.ownerId))!.status).toBe("open");
      expect((await store.findStudioGrantByCode(s.grant.codeHash))!.revokedAt).toBeNull();
      clock+=15*24*60*60_000;await server.app.sweepAbandonedBuilds();
      expect((await store.findBuild(s.build.id,s.user.ownerId))!.status).toBe("closed");expect(await store.listBuildFiles(s.build.id)).toHaveLength(0);
      // Another store contract's future-time OAuth sweep may already remove the revoked row.
      const ended=await store.findStudioGrantByCode(s.grant.codeHash);expect(ended===null||ended.revokedAt!==null).toBe(true);
      expect(await s.media.read(saved.file.objectKey,10000)).toBeNull();expect(await s.media.read(saved.file.studio!.previewKey,10000)).toBeNull();
    } finally {await server.close();}
  });

  it("aborts expired write intents atomically so a late commit cannot resurrect deleted media",async()=>{
    const store=makeStore();const s=await studioMediaStoreFixture(store);const result=await s.service.intake(s.build.id,"map",s.file,s.delegation);
    const id=randomUUID();const row={...result.file,id,studio:{...result.file.studio!,originalSha256:"c".repeat(64),receiptKeys:["new"]}};
    await store.startStudioMedia({id,buildId:s.build.id,state:"write",keys:[`studio-private/v1/${id}/original.png`],expiresAt:new Date(0).toISOString()},s.delegation);
    expect(await store.claimStudioMediaDeletion(id,new Date().toISOString())).not.toBeNull();await expect(store.commitStudioFile(row,{files:100,maps:20,bytes:500*1024**2},s.delegation)).rejects.toThrow(/conflict/);await s.service.sweep();
  });
});
