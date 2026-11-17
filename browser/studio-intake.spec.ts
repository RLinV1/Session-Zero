import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test, type Page, type APIRequestContext, type FrameLocator } from "@playwright/test";

test.use({trace:"off"});
const ORIGIN="http://127.0.0.1:5189", MCP="http://127.0.0.1:3119/mcp/studio";
const descriptor=(kind="map",id=randomUUID())=>({file_id:id,download_url:`https://sdmntpreastus3.oaiusercontent.com/studio-browser-${kind}`,file_name:`synthetic-${kind}.png`,mime_type:"image/png"});
async function connected(request:APIRequestContext,name="Browser GM",secondBuild=false) {
  expect((await request.post(`${ORIGIN}/api/auth/signup`,{data:{email:`${randomUUID()}@example.com`,password:"correct horse battery",displayName:name}})).status()).toBe(201);
  const {build}=await (await request.post(`${ORIGIN}/api/builds`,{data:{name:"Synthetic chapel"}})).json() as {build:{id:string}};
  const otherBuild=secondBuild?(await (await request.post(`${ORIGIN}/api/builds`,{data:{name:"Other context"}})).json() as {build:{id:string}}).build:null;
  const redirect="https://ai.test.invalid/callback";const registration=await request.post(`${ORIGIN}/api/oauth/register`,{data:{client_name:"Browser fixture",redirect_uris:[redirect],token_endpoint_auth_method:"none"}});expect(registration.status()).toBe(201);const client=await registration.json() as {client_id:string};
  const verifier=randomBytes(32).toString("base64url");
  const consent=await request.post(`${ORIGIN}/api/oauth/authorize`,{data:{params:{response_type:"code",state:"browser-state",client_id:client.client_id,redirect_uri:redirect,scope:"studio:build",resource:`${ORIGIN}/mcp/studio`,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"},decision:"allow",buildIds:[build.id,...(otherBuild?[otherBuild.id]:[])]}});
  expect(consent.status()).toBe(200);const back=(await consent.json() as {redirectTo:string}).redirectTo;
  const tokens=await (await request.post(`${ORIGIN}/api/oauth/token`,{form:{grant_type:"authorization_code",client_id:client.client_id,redirect_uri:redirect,resource:`${ORIGIN}/mcp/studio`,code_verifier:verifier,code:new URL(back).searchParams.get("code")!}})).json() as {access_token:string};
  return {build,otherBuild,token:tokens.access_token};
}
async function mount(page:Page,request:APIRequestContext,options:{empty?:boolean;locale?:string;secondBuild?:boolean}={}) {
  const session=await connected(request,"Browser GM",options.secondBuild);let token=session.token;let polls=0;let bridgeFailure=false;
  const rpc=async(method:string,params:unknown)=>{
    const response=await request.post(MCP,{headers:{authorization:`Bearer ${token}`,accept:"application/json, text/event-stream","mcp-protocol-version":"2025-06-18"},data:{jsonrpc:"2.0",id:1,method,params}});
    if(response.status()===401)return {result:{isError:true,content:[],_meta:{"sessionzero/error":{status:401,code:"access"}}}};
    return await response.json() as {result:Record<string,unknown>};
  };
  const opened=await rpc("tools/call",{name:"studio_open",arguments:{buildId:session.build.id,...(options.empty?{}:{mapFiles:[descriptor()],tokenFiles:[descriptor("token")]})}});
  const listed=await rpc("tools/list",{});const open=(listed.result.tools as {name:string;_meta:{ui:{resourceUri:string}}}[]).find((tool)=>tool.name==="studio_open")!;
  const resource=await rpc("resources/read",{uri:open._meta.ui.resourceUri});const html=(resource.result.contents as {text:string}[])[0]!.text;
  await page.route("**/_studio_bridge",async(route)=>{const message=route.request().postDataJSON() as {method:string;params:unknown};if(message.method==="tools/call"&&(message.params as {name:string}).name==="studio_snapshot")polls++;const answer=bridgeFailure?{error:{code:-32000,message:"Synthetic authorization cancellation"}}:await rpc(message.method,message.params);await route.fulfill({json:answer});});
  await page.route("**/studio-test-host",(route)=>route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121417"><iframe title="Studio" sandbox="allow-scripts" style="border:0;width:100%;height:1350px"></iframe><script>
const opened=${JSON.stringify(opened.result)};
window.addEventListener('message',async(event)=>{const message=event.data;if(!message||message.jsonrpc!=='2.0')return;
const respond=(result)=>event.source.postMessage({jsonrpc:'2.0',id:message.id,result},'*');
if(message.method==='ui/initialize'){respond({protocolVersion:'2026-01-26',hostInfo:{name:'Local test host',version:'1'},hostCapabilities:{serverTools:{},serverResources:{},openLinks:{}},hostContext:{theme:'dark',displayMode:'inline',availableDisplayModes:['inline','fullscreen']}});}
else if(message.method==='ui/notifications/initialized'){event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:opened},'*');}
else if(message.method==='tools/call'){const answer=await (await fetch('/_studio_bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)})).json();event.source.postMessage({...answer,jsonrpc:'2.0',id:message.id},'*');}
else if(message.method==='ui/request-display-mode'){window.studioExpanded=true;respond({mode:'fullscreen'});}
else if(message.id!==undefined)respond({});});
</script></body></html>`}));
  await page.goto(`${ORIGIN}/studio-test-host`);
  const helper=`<script>window.openai={selectFiles:async()=>[{fileId:'picker-map',fileName:'picked-map.png',mimeType:'image/png'}],uploadFile:async(file)=>({fileId:'device-'+file.name}),getFileDownloadUrl:async({fileId})=>({downloadUrl:'https://sdmntpreastus3.oaiusercontent.com/studio-browser-'+(fileId.includes('token')?'token':'map')})};</script>`;
  await page.locator("iframe").evaluate((element,{html,helper})=>{(element as HTMLIFrameElement).srcdoc=html.replace("<script type=\"module\">",helper+"<script type=\"module\">");},{html,helper});
  const frame=page.frameLocator("iframe");await expect(frame.locator("#status")).toHaveText("Saved files are up to date");
  if(options.locale)await frame.locator("#language").selectOption(options.locale);
  const notify=async(result:Record<string,unknown>)=>page.locator("iframe").evaluate((element,result)=>{(element as HTMLIFrameElement).contentWindow!.postMessage({jsonrpc:"2.0",method:"ui/notifications/tool-result",params:result},"*");},result);
  const openOther=async()=>{if(!session.otherBuild)throw new Error("Missing second build fixture");const opened=await rpc("tools/call",{name:"studio_open",arguments:{buildId:session.otherBuild.id,mapFiles:[descriptor()]}});await notify(opened.result);await expect(frame.locator("#build")).toHaveText("Other context");await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await expect(frame.locator("#status")).toHaveText("Saved files are up to date");};
  return {frame,session,rpc,notify,openOther,polls:()=>polls,setToken:(next:string)=>{token=next;},setBridgeFailure:(failed:boolean)=>{bridgeFailure=failed;},reopen:async()=>{await page.locator("iframe").evaluate((el)=>{const iframe=el as HTMLIFrameElement;const content=iframe.srcdoc;iframe.srcdoc=content;});await expect(frame.locator("#status")).toHaveText("Saved files are up to date");}};
}
const noOverflow=(frame:FrameLocator)=>frame.locator("body").evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
test("protected chat intake, picker/device controls, canonical hashes and reopened source (FR-GM-26)",async({page,request},info)=>{
  const {frame,session,rpc,reopen}=await mount(page,request);
  await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await expect(frame.locator('[data-testid="studio-source-image"]')).toHaveAttribute("href",/^data:image\/webp;base64,/);expect(await noOverflow(frame)).toBe(true);
  await expect(frame.locator("#owner")).toHaveText("Browser GM");await expect(frame.locator("#files li")).toHaveCount(2);
  const snapshot=await rpc("tools/call",{name:"studio_snapshot",arguments:{buildId:session.build.id}});const data=snapshot.result.structuredContent as {files:{kind:string;originalSha256:string}[]};
  const expected=await (await request.get(`${ORIGIN.replace(":5189",":3109")}/_test/studio-fixtures`)).json() as {map:{sha256:string};token:{sha256:string}};
  expect(data.files.find((f)=>f.kind==="map")!.originalSha256).toBe(expected.map.sha256);expect(data.files.find((f)=>f.kind==="token")!.originalSha256).toBe(expected.token.sha256);
  await frame.getByRole("button",{name:"Choose from ChatGPT"}).click();await expect(frame.locator("#upload-status")).toHaveText("Saved");await expect(frame.locator("#files li")).toHaveCount(2);
  await frame.locator("#kind").selectOption("token");await frame.locator("#device").setInputFiles(path.resolve("browser/fixtures/studio-token.png"));await expect(frame.locator("#upload-status")).toHaveText("Saved");
  await frame.locator("#language").selectOption("zh-TW");await expect(frame.locator("#upload-status")).toHaveText("已儲存");await expect(frame.locator("#status")).toHaveText("已顯示最新儲存的檔案");
  await frame.locator("#language").selectOption("en");await expect(frame.locator("#upload-status")).toHaveText("Saved");
  await reopen();await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await frame.getByRole("button",{name:"Expand Studio"}).click();await expect.poll(()=>page.evaluate(()=>Boolean((window as unknown as {studioExpanded:boolean}).studioExpanded))).toBe(true);
  await page.screenshot({path:info.outputPath("studio-intake.png"),fullPage:true});
});
test("empty and zh-TW intake states fit narrow layouts and keyboard controls (FR-GM-26, localization)",async({page,request},info)=>{
  const {frame}=await mount(page,request,{empty:true,locale:"zh-TW"});await expect(frame.getByText("選擇來源地圖以檢視已儲存的準備。",{exact:true})).toBeVisible();expect(await noOverflow(frame)).toBe(true);
  await frame.getByRole("button",{name:"從 ChatGPT 選取"}).focus();await page.keyboard.press("Enter");await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await expect(frame.locator("#upload-status")).toHaveText("已儲存");
  await page.screenshot({path:info.outputPath("studio-intake-zh.png"),fullPage:true});
});
test("cached binding refuses another owner, clears images and stops polling while hidden/teardown (FR-GM-26)",async({page,request,browser})=>{
  const {frame,polls,setToken}=await mount(page,request);await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();
  await frame.locator("body").evaluate(()=>{Object.defineProperty(document,"hidden",{value:true,configurable:true});document.dispatchEvent(new Event("visibilitychange"));});const before=polls();await page.waitForTimeout(5500);expect(polls()).toBe(before);
  const foreign=await browser.newContext();const other=await connected(foreign.request,"Other GM");setToken(other.token);
  await frame.locator("body").evaluate(()=>{Object.defineProperty(document,"hidden",{value:false,configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
  await expect(frame.locator("#status")).toHaveText("This build is unavailable to this connection. Reconnect with its owner.");await expect(frame.locator('[data-testid="studio-source-image"]')).toHaveCount(0);await expect(frame.locator("#files li")).toHaveCount(0);
  await frame.locator("body").evaluate(()=>dispatchEvent(new Event("pagehide")));const ended=polls();await page.waitForTimeout(5500);expect(polls()).toBe(ended);await foreign.close();
});
test("a declined bridge refresh pauses automatic requests until explicit retry (FR-GM-26)",async({page,request})=>{
  const {frame,polls,setBridgeFailure}=await mount(page,request);await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();
  setBridgeFailure(true);await frame.getByRole("button",{name:"Retry connection"}).click();
  await expect(frame.locator("#status")).toHaveText("Connection interrupted. Showing the last saved view. Reconnect in your AI app, then retry.");
  const failed=polls();await page.waitForTimeout(5500);expect(polls()).toBe(failed);await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();
  setBridgeFailure(false);await frame.getByRole("button",{name:"Retry connection"}).click();await expect(frame.locator("#status")).toHaveText("Saved files are up to date");
});
test("a late binding refusal cannot clear a newer build view (FR-GM-26)",async({page,request})=>{
  const {frame,session,rpc,notify,openOther}=await mount(page,request,{secondBuild:true});
  const second=await rpc("tools/call",{name:"studio_open",arguments:{buildId:session.build.id,mapFiles:[descriptor("token")]}});await notify(second.result);await expect(frame.locator("#files li")).toHaveCount(3);
  let entered!:()=>void,release!:()=>void,delivered!:()=>void;const pending=new Promise<void>((resolve)=>{entered=resolve;});const resume=new Promise<void>((resolve)=>{release=resolve;});const responseSent=new Promise<void>((resolve)=>{delivered=resolve;});
  await page.route("**/_studio_bridge",async(route)=>{const message=route.request().postDataJSON() as {params:{name:string;arguments:{buildId:string}}};if(message.params.name!=="studio_bind_file")return route.fallback();expect(message.params.arguments.buildId).toBe(session.build.id);entered();await resume;await route.fulfill({json:{result:{isError:true,content:[],_meta:{"sessionzero/error":{status:404,code:"missing"}}}}});delivered();});
  await frame.getByRole("button",{name:"Show this map",disabled:false}).click();await pending;await openOther();release();await responseSent;await page.waitForTimeout(100);
  await expect(frame.locator("#build")).toHaveText("Other context");await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await expect(frame.locator("#status")).toHaveText("Saved files are up to date");
});
for(const phase of ["picker","descriptor","device"] as const)test(`pending ${phase} selection cannot be retargeted to another build (FR-GM-26)`,async({page,request})=>{
  const {frame,session,rpc,openOther}=await mount(page,request,{secondBuild:true});
  let imports=0;await page.route("**/_studio_bridge",async(route)=>{const message=route.request().postDataJSON() as {params:{name:string}};if(message.params.name==="studio_import_files")imports++;await route.fallback();});
  await frame.locator("body").evaluate((_,phase)=>{
    const testWindow=window as unknown as {openai:{selectFiles:()=>Promise<unknown>;uploadFile:()=>Promise<unknown>;getFileDownloadUrl:()=>Promise<unknown>};releaseSelection?:()=>void};
    const result=phase==="picker"?[{fileId:"delayed-file",fileName:"delayed.png",mimeType:"image/png"}]:phase==="device"?{fileId:"delayed-file"}:{downloadUrl:"https://sdmntpreastus3.oaiusercontent.com/studio-browser-token"};
    testWindow.openai.getFileDownloadUrl=async()=>({downloadUrl:"https://sdmntpreastus3.oaiusercontent.com/studio-browser-token"});
    const method=phase==="picker"?"selectFiles":phase==="device"?"uploadFile":"getFileDownloadUrl";
    testWindow.openai[method]=()=>new Promise((resolve)=>{testWindow.releaseSelection=()=>resolve(result);});
  },phase);
  if(phase==="device")await frame.locator("#device").setInputFiles(path.resolve("browser/fixtures/studio-token.png"));else await frame.getByRole("button",{name:"Choose from ChatGPT"}).click();
  await expect.poll(()=>frame.locator("body").evaluate(()=>typeof (window as unknown as {releaseSelection?:()=>void}).releaseSelection)).toBe("function");
  await openOther();await frame.locator("body").evaluate(()=>(window as unknown as {releaseSelection:()=>void}).releaseSelection());await page.waitForTimeout(100);
  expect(imports).toBe(0);
  const before=await rpc("tools/call",{name:"studio_snapshot",arguments:{buildId:session.build.id}});const after=await rpc("tools/call",{name:"studio_snapshot",arguments:{buildId:session.otherBuild!.id}});
  expect((before.result.structuredContent as {files:unknown[]}).files).toHaveLength(2);expect((after.result.structuredContent as {files:unknown[]}).files).toHaveLength(1);
  await expect(frame.locator("#build")).toHaveText("Other context");await expect(frame.locator("#upload-status")).toBeEmpty();
});
