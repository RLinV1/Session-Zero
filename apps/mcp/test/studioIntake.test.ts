import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startServer } from "../../server/test/helpers";
import { connectStudio, TEST_ORIGIN, bearer } from "../../server/test/studioFlow";
import { LocalStudioMediaStore } from "../../server/src/store/studioMediaStore";
import { StudioIntakeError, studioDownloadUrl } from "../../server/src/domain/studioDownload";
import { studioIntake } from "../../web/src/i18n/en/studioIntake";
import { studioIntakeZhTW } from "../../web/src/i18n/zh-TW/studioIntake";
import { startMcpServer } from "../src/app";
import { VIEW_SCRIPT } from "../src/studio/viewScript";
import { studioView } from "../src/studio/view";

const stops:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const stop of stops.splice(0).reverse()) await stop();});
async function fixture() {
  const root=await mkdtemp(path.join(tmpdir(),"studio-mcp-"));const media=await LocalStudioMediaStore.connect(path.join(root,"private"),path.join(root,"public"));
  const bytes=await sharp({create:{width:90,height:60,channels:3,background:"#59705f"}}).png().toBuffer();
  const room=await startServer(undefined,{studio:{publicOrigin:TEST_ORIGIN},studioMedia:media,studioDownloader:async(raw)=>{
    const url = studioDownloadUrl(raw);
    if (url.pathname === "/expired") throw new StudioIntakeError("expired");
    return url.pathname === "/bad" ? Buffer.from("bad file") : bytes;
  }});stops.push(()=>room.close());
  const owner=await room.signUp({displayName:"Private owner name"});const {build}=await owner.json<{build:{id:string}}>("POST","/api/builds",{name:"Private build title"});const {tokens}=await connectStudio(room.base,owner,[build.id]);
  const mcp=await startMcpServer({roomServerUrl:room.base,allowedOrigins:[],studioAccess:{publicOrigin:TEST_ORIGIN}});stops.push(()=>mcp.close());
  const rpc=async(method:string,params:unknown,token=tokens.access_token)=>{
    const response=await fetch(`${mcp.url}/studio`,{method:"POST",headers:bearer(token,{"content-type":"application/json",accept:"application/json, text/event-stream","mcp-protocol-version":"2025-06-18"}),body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
    return {response,body:await response.json() as {result?:{isError?:boolean;content?:{type:string;text?:string}[];structuredContent?:Record<string,unknown>;_meta?:Record<string,unknown>}}};
  };
  const call=(name:string,args:Record<string,unknown>,token?:string)=>rpc("tools/call",{name,arguments:args},token);
  const descriptor=(id:string,suffix="good")=>({file_id:id,download_url:`https://sdmntpreastus3.oaiusercontent.com/${suffix}`,file_name:"Private art filename.png",mime_type:"image/png"});
  return {room,mcp,owner,build,tokens,rpc,call,descriptor,bytes};
}
describe("Studio connected intake and static UI (FR-GM-26, FR-GM-27)",()=>{
  it("opens attached originals with partial outcomes, exposes only ids/status, then recovers through app calls",async()=>{
    const s=await fixture();const opened=await s.call("studio_open",{buildId:s.build.id,mapFiles:[s.descriptor("map")],tokenFiles:[s.descriptor("bad-token","bad"),s.descriptor("token")]});
    expect(opened.response.status).toBe(200);expect(opened.response.headers.get("cache-control")).toBe("no-store");expect(opened.body.result!.isError).not.toBe(true);
    const data=opened.body.result!.structuredContent!;expect(data).toMatchObject({buildId:s.build.id,bindingVersion:1,outcomes:[{status:"saved",kind:"map"},{status:"failed",code:"image"},{status:"saved",kind:"token"}]});
    const cached=JSON.stringify(opened.body);expect(cached).not.toContain("Private owner");expect(cached).not.toContain("Private build");expect(cached).not.toContain("Private art filename");expect(cached).not.toContain(s.tokens.access_token);expect(cached).not.toContain(s.bytes.toString("base64"));expect(cached).not.toContain("download_url");
    const snapshot=(await s.call("studio_snapshot",{buildId:s.build.id})).body.result!.structuredContent!;
    expect(snapshot).toMatchObject({ownerName:"Private owner name",buildName:"Private build title"});expect(snapshot.files).toHaveLength(2);
    const fileId=snapshot.sourceFileId as string;
    const image=await s.call("studio_get_media",{buildId:s.build.id,fileId});expect(image.body.result!.content).toEqual([]);expect(image.body.result!._meta).toHaveProperty("sessionzero/media");
    const reopened=await s.call("studio_open",{buildId:s.build.id});expect(reopened.body.result!.structuredContent).toMatchObject({buildId:s.build.id,outcomes:[]});
    expect(((await s.call("studio_snapshot",{buildId:s.build.id})).body.result!.structuredContent!).sourceFileId).toBe(fileId);
    const retry=await s.call("studio_open",{buildId:s.build.id,mapFiles:[s.descriptor("changed-map-id")]});expect(retry.body.result!.isError).not.toBe(true);expect(await s.room.store.listBuildFiles(s.build.id)).toHaveLength(2);
  });
  it("retains non-sensitive per-file outcomes when a connection ends after one commit",async()=>{
    const s=await fixture();const commit=s.room.store.commitStudioFile.bind(s.room.store);let ended=false;
    vi.spyOn(s.room.store,"commitStudioFile").mockImplementation(async(...args)=>{const saved=await commit(...args);if(!ended){ended=true;await s.room.store.endStudioGrants((await s.room.store.findUserById(s.owner.view!.id))!.ownerId,new Date().toISOString());}return saved;});
    const response=await s.call("studio_open",{buildId:s.build.id,mapFiles:[s.descriptor("map")],tokenFiles:[s.descriptor("token")]});
    expect(response.body.result!.isError).toBe(true);expect(response.body.result!.structuredContent).toHaveProperty("outcomes");expect((response.body.result!.structuredContent!.outcomes as {status:string}[]).some((o)=>o.status==="saved")).toBe(true);expect(response.body.result!._meta).toHaveProperty("mcp/www_authenticate");expect(JSON.stringify(response.body).includes(s.bytes.toString("base64"))).toBe(false);
    expect((await s.room.store.listBuildFiles(s.build.id)).length).toBeGreaterThan(0);
  });
  it.each([["en", studioIntake], ["zh-TW", studioIntakeZhTW]] as const)("uses %s catalog guidance for rejected and expired attachments", async (locale, catalog) => {
    const s = await fixture();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = {
      ...s.descriptor("private-host-file-id"),
      download_url: "https://web-sandbox.oaiusercontent.com/private-attachment.png?sig=synthetic-signature",
    };
    try {
      const { body } = await s.call("studio_open", {
        buildId: s.build.id, mapFiles: [refused], tokenFiles: [s.descriptor("expired-token", "expired")], locale,
      });
      const originMessage = catalog["error.origin"];
      const expiryMessage = catalog["error.expired"];
      expect(body.result!.isError).not.toBe(true);
      expect(JSON.parse(body.result!.content![0]!.text!)).toEqual({
        buildId: s.build.id, bindingVersion: 1, outcomes: [
          { index: 0, kind: "map", status: "failed", message: originMessage },
          { index: 1, kind: "token", status: "failed", message: expiryMessage },
        ],
      });
      expect(body.result!.structuredContent).toMatchObject({
        outcomes: [{ code: "origin", message: originMessage }, { code: "expired", message: expiryMessage }],
      });
      for (const secret of [refused.file_id, refused.file_name, refused.download_url, "synthetic-signature"]) {
        expect(JSON.stringify(body)).not.toContain(secret);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
      }
      expect(warn.mock.calls).toEqual([[JSON.stringify({ event: "studio_attachment_origin_refused", origin: "https://web-sandbox.oaiusercontent.com" })]]);
      expect(await s.room.store.listBuildFiles(s.build.id)).toHaveLength(0);
    } finally { warn.mockRestore(); }
  });
  it("registers complete file schemas and app-only media tools, with a credential-free content-versioned resource",async()=>{
    const s=await fixture();const listed=await s.rpc("tools/list",{});const tools=(listed.body.result as unknown as {tools:{name:string;_meta:Record<string,unknown>;inputSchema:Record<string,unknown>}[]}).tools;
    const open=tools.find((t)=>t.name==="studio_open")!;expect(open._meta["openai/fileParams"]).toEqual(["mapFiles","tokenFiles"]);
    expect(open._meta.ui).toMatchObject({resourceUri:studioView.uri,visibility:["model"]});
    expect(tools.filter((tool) => tool._meta?.["openai/fileParams"]).map((tool) => tool.name)).toEqual(["studio_open"]);
    expect(studioView.uri).toMatch(/^ui:\/\/session-zero\/studio\.[a-f0-9]{16}\.html$/);
    const schema=JSON.stringify(open.inputSchema);for(const property of ["download_url","file_id","mime_type","file_name"])expect(schema).toContain(property);
    for(const name of ["studio_snapshot","studio_bind_file","studio_get_media"])expect(tools.find((t)=>t.name===name)!._meta.ui).toMatchObject({visibility:["app"]});
    expect(tools.some((tool) => tool.name === "studio_import_files")).toBe(false);
    const removed = await s.call("studio_import_files", { buildId: s.build.id, kind: "map", files: [s.descriptor("former-view-import")] });
    expect(removed.body).toMatchObject({ error: { code: -32602, message: expect.stringContaining("not found") } });
    expect(await s.room.store.listBuildFiles(s.build.id)).toHaveLength(0);
    const resource=await s.rpc("resources/read",{uri:studioView.uri});const html=JSON.stringify(resource.body);expect(html).not.toContain(s.tokens.access_token);expect(html).not.toContain(s.build.id);expect(html).not.toContain("Private owner name");expect(html).not.toContain(s.bytes.toString("base64"));
    for (const forbidden of ["blob:","localStorage","setWidgetState","selectFiles","uploadFile","getFileDownloadUrl","studio_import_files"]) expect(VIEW_SCRIPT).not.toContain(forbidden);
    expect(html).toContain("preparation");expect(html).toContain("__sceneStudio");
    const context=tools.find((tool)=>tool.name==="studio_set_context")!;
    expect(context._meta.ui).toMatchObject({visibility:["model","app"]});
    for(const property of ["sourceFileId","mapKey","encounterKey"])expect(JSON.stringify(context.inputSchema)).toContain(property);
  });
  it("answers a view address from an earlier build with the current view, for hosts that keep tool listings across deploys",async()=>{
    const s=await fixture();const earlier=studioView.uri==="ui://session-zero/studio.0123456789abcdef.html"?"ui://session-zero/studio.fedcba9876543210.html":"ui://session-zero/studio.0123456789abcdef.html";
    const current=await s.rpc("resources/read",{uri:studioView.uri});const old=await s.rpc("resources/read",{uri:earlier});
    const contents=(body:typeof old.body)=>(body.result as unknown as {contents:{uri:string;mimeType:string;text:string}[]}).contents;
    expect(contents(old.body)).toEqual([{...contents(current.body)[0],uri:earlier}]);expect(contents(old.body)[0]!.text).toBe(studioView.html);
    for(const uri of ["ui://session-zero/studio.html","ui://session-zero/studio.0123456789ABCDEF.html","ui://session-zero/studio.0123456789abcdef.html.js","ui://session-zero/other.html"]){
      expect((await s.rpc("resources/read",{uri})).body).toMatchObject({error:{message:expect.stringContaining("not found")}});
    }
  });
  it("projects real saved preparation after explicit context selection and keeps prior layers after a refused save",async()=>{
    const s=await fixture();await s.call("studio_open",{buildId:s.build.id,mapFiles:[s.descriptor("map")],tokenFiles:[s.descriptor("token")]});
    const rows=await s.room.store.listBuildFiles(s.build.id),file=rows.find((row)=>row.kind==="map")!,art=rows.find((row)=>row.kind==="token")!;
    await s.owner.json("PUT",`/api/builds/${s.build.id}/choices`,{aiGrid:true,aiWalls:true,aiTerrain:true});
    for(const [name,args] of [
      ["save_map",{key:"chapel",name:"Chapel",fileId:file.id,proposedGrid:{cellSize:30,offsetX:0,offsetY:0}}],
      ["save_creatures",{creatures:[{key:"sentry",name:"Sentry",isPlayerCharacter:false,imageFileId:art.id}]}],
      ["save_map_setup",{mapKey:"chapel",lines:[{from:{column:0,row:1},to:{column:3,row:1},kind:"wall"},{from:{column:1,row:1},to:{column:2,row:1},kind:"door",state:"closed"}],terrain:[{row:0,start:0,end:0,kind:"difficult"}]}],
      ["save_encounter",{key:"watch",name:"Watch",mapKey:"chapel",tokens:[{creatureKey:"sentry",name:"East sentry",square:{column:2,row:0},hidden:true}]}],
    ] as const)expect((await s.call(name,{buildId:s.build.id,...args})).body.result!.isError,name).not.toBe(true);
    const context={sourceFileId:file.id,mapKey:"chapel",encounterKey:"watch"};
    expect((await s.call("studio_set_context",{buildId:s.build.id,context})).body.result!.structuredContent).toMatchObject({buildId:s.build.id,context});
    const saved=(await s.call("studio_snapshot",{buildId:s.build.id})).body.result!.structuredContent!;
    expect(saved).toMatchObject({context,scene:{gridStatus:"proposed",terrain:[{row:0,start:0,end:0,kind:"difficult"}],tokens:[{name:"East sentry",hidden:true,imageFileId:art.id,center:{x:75,y:15}}]}});
    const walls=(saved.scene as {walls:unknown[]}).walls;expect(walls.length).toBe(3);
    expect(saved.websitePath).toBe(`${TEST_ORIGIN}/builds/${s.build.id}`);
    await s.owner.json("PUT",`/api/builds/${s.build.id}/choices`,{aiGrid:true,aiWalls:false,aiTerrain:true});
    expect((await s.call("save_map_setup",{buildId:s.build.id,mapKey:"chapel",lines:[],terrain:[]})).body.result!.isError).toBe(true);
    const after=(await s.call("studio_snapshot",{buildId:s.build.id})).body.result!.structuredContent!;
    expect((after.scene as {walls:unknown[]}).walls).toEqual(walls);expect((after.scene as {terrain:unknown[]}).terrain).toEqual((saved.scene as {terrain:unknown[]}).terrain);
    expect(after.outcomes).toEqual(expect.arrayContaining([expect.objectContaining({targetKey:"chapel",status:"refused",code:"permission"})]));
    const reopened=await s.call("studio_open",{buildId:s.build.id,context});
    expect(reopened.body.result!.isError).not.toBe(true);expect(JSON.stringify(reopened.body)).not.toContain("East sentry");
    const mismatch=await s.call("studio_set_context",{buildId:s.build.id,context:{...context,mapKey:null}});
    expect(mismatch.body.result!.isError).toBe(true);
    // The AI is told to fix the selection, not to attach files again.
    expect(JSON.stringify(mismatch.body.result!.content)).toContain(studioIntake["error.context"]);expect(((await s.call("studio_snapshot",{buildId:s.build.id})).body.result!.structuredContent!).context).toEqual(context);
  });
  it("loads a protected media cache miss without another snapshot when the view provides a routing hint",async()=>{
    const s=await fixture();await s.call("studio_open",{buildId:s.build.id,mapFiles:[s.descriptor("map")]});
    const row=(await s.room.store.listBuildFiles(s.build.id))[0]!;
    const fetch=globalThis.fetch;const requests:string[]=[];
    const spy=vi.spyOn(globalThis,"fetch").mockImplementation((input,init)=>{requests.push(String(input));return fetch(input,init);});
    try {
      const loaded=await s.call("studio_get_media",{buildId:s.build.id,fileId:row.id,privacy:"private"});
      expect(loaded.body.result!._meta).toHaveProperty("sessionzero/media");
      expect(requests.filter((url)=>url===`${s.room.base}/api/studio/builds/${s.build.id}/studio`)).toEqual([]);
      expect(requests.filter((url)=>url.includes(`/files/${row.id}/media`))).toHaveLength(1);
    } finally {spy.mockRestore();}
  });
  it("refuses foreign bindings and stale cached ids after reconnecting as another owner; revoked media returns no bytes",async()=>{
    const s=await fixture();await s.call("studio_open",{buildId:s.build.id,mapFiles:[s.descriptor("map")]});const row=(await s.room.store.listBuildFiles(s.build.id))[0]!;
    const stranger=await s.room.signUp({displayName:"Other owner"});const {build}=await stranger.json<{build:{id:string}}>("POST","/api/builds",{name:"Other build"});const foreign=await connectStudio(s.room.base,stranger,[build.id]);
    for(const name of ["studio_open","studio_snapshot","studio_get_media","studio_bind_file"]) {
      const refused=await s.call(name,{buildId:s.build.id,fileId:row.id,privacy:"private"},foreign.tokens.access_token);expect(refused.body.result!.isError).toBe(true);expect(JSON.stringify(refused.body)).not.toContain(row.studio!.originalSha256);expect(refused.body.result!._meta).not.toHaveProperty("sessionzero/media");
    }
    const grant=(await s.owner.json<{grants:{id:string}[]}>("GET",`/api/builds/${s.build.id}/grants`)).grants[0]!;await s.owner.request("DELETE",`/api/builds/${s.build.id}/grants/${grant.id}`);
    const revoked=await s.call("studio_get_media",{buildId:s.build.id,fileId:row.id});expect(revoked.response.status).toBe(401);expect(revoked.response.headers.get("cache-control")).toBe("no-store");expect(revoked.body.result).toBeUndefined();
    const reauthorized=await connectStudio(s.room.base,s.owner,[s.build.id]);expect((await s.call("studio_open",{buildId:s.build.id},reauthorized.tokens.access_token)).body.result!.isError).not.toBe(true);
  });
});
