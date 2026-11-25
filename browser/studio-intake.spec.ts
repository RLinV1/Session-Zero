import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page, type APIRequestContext, type FrameLocator, type Locator } from "@playwright/test";
import type { StudioCorrectionHistory, StudioSnapshot } from "@vtt/shared";

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
async function mount(page:Page,request:APIRequestContext,options:{empty?:boolean;secondBuild?:boolean;corrections?:boolean;chatSelection?:boolean}={}) {
  const session=await connected(request,"Browser GM",options.secondBuild);let token=session.token;let polls=0;let bridgeFailure=false;
  const messages: { prompt: string; requestId: string; savedBeforeHandoff: boolean }[] = [];
  let handoff: "accepted" | "refused" | "timeout" = "accepted";
  const rpc=async(method:string,params:unknown)=>{
    const response=await request.post(MCP,{headers:{authorization:`Bearer ${token}`,accept:"application/json, text/event-stream","mcp-protocol-version":"2025-06-18"},data:{jsonrpc:"2.0",id:1,method,params}});
    if(response.status()===401)return {result:{isError:true,content:[],_meta:{"sessionzero/error":{status:401,code:"access"}}}};
    return await response.json() as {result:Record<string,unknown>};
  };
  const opened=await rpc("tools/call",{name:"studio_open",arguments:{buildId:session.build.id,...(options.empty?{}:{mapFiles:[descriptor()],tokenFiles:[descriptor("token")]})}});
  const listed=await rpc("tools/list",{});const open=(listed.result.tools as {name:string;_meta:{ui:{resourceUri:string}}}[]).find((tool)=>tool.name==="studio_open")!;
  const resource=await rpc("resources/read",{uri:open._meta.ui.resourceUri});const html=(resource.result.contents as {text:string}[])[0]!.text;
  if (options.corrections) {
    await page.route("**/_studio_handoff", async (route) => {
      const { content } = route.request().postDataJSON() as { content: { text: string }[] };
      const prompt = content[0]!.text;
      const requestId = prompt.match(/Correction request ([a-f0-9-]{36})/)?.[1] ?? "missing";
      const history = await request.get(`${ORIGIN}/api/builds/${session.build.id}/studio/authoring/maps/chapel/revisions`);
      const saved = history.ok() ? (await history.json() as StudioCorrectionHistory).requests.some((item) => item.requestId === requestId) : false;
      messages.push({ requestId, prompt, savedBeforeHandoff: saved });
      await route.fulfill({ json: { handoff } });
    });
  }
  await page.route("**/_studio_bridge",async(route)=>{const message=route.request().postDataJSON() as {method:string;params:unknown};if(message.method==="tools/call"&&(message.params as {name:string}).name==="studio_snapshot")polls++;const answer=bridgeFailure?{error:{code:-32000,message:"Synthetic authorization cancellation"}}:await rpc(message.method,message.params);await route.fulfill({json:answer});});
  await page.route("**/studio-test-host",(route)=>route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121417">${options.chatSelection ? '<form aria-label="Chat"><p data-testid="chat-attachment"></p><input aria-label="Message"><button>Send</button></form>' : ''}<iframe title="Studio" sandbox="allow-scripts" style="border:0;width:100%;height:1350px"></iframe><script>
const opened=${JSON.stringify(opened.result)};
let selection=null;
document.querySelector('form')?.addEventListener('submit',(event)=>{
  event.preventDefault();
  const input=event.currentTarget.querySelector('input');
  window.studioChatTurn={text:input.value,selection};
  input.value='';
});
window.addEventListener('message',async(event)=>{const message=event.data;if(!message||message.jsonrpc!=='2.0')return;
const respond=(result)=>event.source.postMessage({jsonrpc:'2.0',id:message.id,result},'*');
if(message.method==='ui/initialize'){respond({protocolVersion:'2026-01-26',hostInfo:{name:'Local test host',version:'1'},hostCapabilities:{serverTools:{},serverResources:{},openLinks:{},...(${!!options.chatSelection} && {updateModelContext:{text:{}}}),...(${!!options.corrections} && {message:{text:{}},experimental:{'openai/message':{}}})},hostContext:{theme:'dark',displayMode:'inline',availableDisplayModes:['inline','fullscreen']}});}
else if(message.method==='ui/notifications/initialized'){event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:opened},'*');}
else if(message.method==='tools/call'){const answer=await (await fetch('/_studio_bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)})).json();event.source.postMessage({...answer,jsonrpc:'2.0',id:message.id},'*');}
else if(message.method==='ui/request-display-mode'){window.studioExpanded=true;respond({mode:'fullscreen'});}
else if(message.method==='ui/open-link'){window.studioOpenedUrl=message.params.url;respond({});}
else if(message.method==='ui/update-model-context'){
  const item=message.params.content[0];
  if(item&&window.studioRefuseAttachment){
    event.source.postMessage({jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Attachment unavailable'}},'*');
    return;
  }
  selection=item ? JSON.parse(item.text).studioSelection : null;
  if(selection)window.studioPublishedSelections=(window.studioPublishedSelections??0)+1;
  document.querySelector('[data-testid="chat-attachment"]').textContent=item?._meta?.['openai/title'] ?? '';
  window.studioSelection=selection;
  respond({});
}
else if(message.method==='ui/message'){const {handoff}=await(await fetch('/_studio_handoff',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message.params)})).json();if(handoff!=='timeout')respond(handoff==='refused'?{isError:true}:{});}
else if(message.id!==undefined)respond({});});
</script></body></html>`}));
  await page.goto(`${ORIGIN}/studio-test-host`);
  await page.locator("iframe").evaluate((element,html)=>{(element as HTMLIFrameElement).srcdoc=html;},html);
  const frame=page.frameLocator("iframe");await expect(frame.locator("#status")).toHaveAttribute("data-state","ready");
  const notify=async(result:Record<string,unknown>)=>page.locator("iframe").evaluate((element,result)=>{(element as HTMLIFrameElement).contentWindow!.postMessage({jsonrpc:"2.0",method:"ui/notifications/tool-result",params:result},"*");},result);
  const openOther=async()=>{if(!session.otherBuild)throw new Error("Missing second build fixture");const opened=await rpc("tools/call",{name:"studio_open",arguments:{buildId:session.otherBuild.id,mapFiles:[descriptor()]}});await notify(opened.result);await expect(frame.locator("#build")).toHaveText("Other context");await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await expect(frame.locator("#status")).toHaveAttribute("data-state","ready");};
  return {frame,session,rpc,notify,openOther,messages,setHandoff:(next:typeof handoff)=>{handoff=next;},polls:()=>polls,setToken:(next:string)=>{token=next;},setBridgeFailure:(failed:boolean)=>{bridgeFailure=failed;},reopen:async()=>{await page.locator("iframe").evaluate((el)=>{const iframe=el as HTMLIFrameElement;const content=iframe.srcdoc;iframe.srcdoc=content;});await expect(frame.locator("#status")).toHaveAttribute("data-state","ready");}};
}
const noOverflow=(frame:FrameLocator)=>frame.locator("body").evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
test("protected chat intake preserves original hashes, localized outcomes and the reopened source (FR-GM-26)",async({page,request},info)=>{
  const {frame,session,rpc,reopen}=await mount(page,request);
  await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await expect(frame.locator('[data-testid="studio-source-image"]')).toHaveAttribute("href",/^data:image\/webp;base64,/);expect(await noOverflow(frame)).toBe(true);
  await expect(frame.locator("#owner")).toHaveText("Browser GM");await expect(frame.locator("#files li")).toHaveCount(2);
  const snapshot=await rpc("tools/call",{name:"studio_snapshot",arguments:{buildId:session.build.id}});const data=snapshot.result.structuredContent as {files:{kind:string;originalSha256:string}[]};
  const expected=await (await request.get(`${ORIGIN.replace(":5189",":3109")}/_test/studio-fixtures`)).json() as {map:{sha256:string};token:{sha256:string}};
  expect(data.files.find((f)=>f.kind==="map")!.originalSha256).toBe(expected.map.sha256);expect(data.files.find((f)=>f.kind==="token")!.originalSha256).toBe(expected.token.sha256);
  await expect(frame.locator("#outcomes small")).toHaveText(["Saved","Saved"]);
  await frame.locator("#language").selectOption("zh-TW");await expect(frame.locator("#outcomes small")).toHaveText(["已儲存","已儲存"]);await expect(frame.locator("#status")).toHaveAttribute("data-state","ready");
  await frame.locator("#language").selectOption("en");await expect(frame.locator("#outcomes small")).toHaveText(["Saved","Saved"]);
  await reopen();await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await frame.getByRole("button",{name:"Expand Studio"}).click();await expect.poll(()=>page.evaluate(()=>Boolean((window as unknown as {studioExpanded:boolean}).studioExpanded))).toBe(true);
  await page.screenshot({path:info.outputPath("studio-intake.png"),fullPage:true});
});
test("chat intake and website fallback are available in English and zh-TW (FR-GM-26)",async({page,request},info)=>{
  const {frame,session,rpc,notify}=await mount(page,request,{empty:true});
  const buildUrl = `${ORIGIN}/builds/${session.build.id}`;
  await expect(frame.getByText("Attach the original image in the ChatGPT chat and ask to add it to this build.")).toBeVisible();
  await expect(frame.getByText("Anyone with a website upload’s file link can open it.")).toBeVisible();
  const englishLink = frame.getByRole("link", { name: "Or upload on the Session Zero website.", exact: true });
  await expect(englishLink).toHaveAttribute("href", buildUrl);
  await expect(frame.locator("input[type=file], #pick, #kind")).toHaveCount(0);
  await englishLink.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as unknown as { studioOpenedUrl?: string }).studioOpenedUrl)).toBe(buildUrl);

  const refused = { ...descriptor(), download_url: "https://web-sandbox.oaiusercontent.com/studio-browser-map?sig=fixture" };
  const expired = descriptor("expired");
  const opened = await rpc("tools/call", { name: "studio_open", arguments: { buildId: session.build.id, mapFiles: [refused], tokenFiles: [expired] } });
  await notify(opened.result);
  await expect(frame.locator("#outcomes")).toContainText("The image could not be imported. Attach the original again in the ChatGPT chat or upload it on the Session Zero website.");
  await expect(frame.locator("#outcomes")).toContainText("This file link expired. Attach the original again in the ChatGPT chat.");
  await expect(frame.locator("#files")).toHaveText("No files saved yet.");
  expect(await noOverflow(frame)).toBe(true);

  await frame.locator("#language").selectOption("zh-TW");
  await expect(frame.getByText("請在 ChatGPT 聊天中附加原始圖片，並要求將它加入此建置。")).toBeVisible();
  await expect(frame.getByText("透過網站上傳的檔案，任何持有連結的人都能存取。")).toBeVisible();
  await expect(frame.getByRole("link", { name: "也可以在 Session Zero 網站上傳。", exact: true })).toHaveAttribute("href", buildUrl);
  await expect(frame.locator("#outcomes")).toContainText("無法匯入這張圖片。請在 ChatGPT 聊天中重新附加原始檔，或在 Session Zero 網站上傳。");
  await expect(frame.locator("#outcomes")).toContainText("檔案連結已過期。請在 ChatGPT 聊天中重新附加原始檔。");
  expect(await noOverflow(frame)).toBe(true);
  await page.screenshot({path:info.outputPath("studio-intake-zh.png"),fullPage:true});

  await page.context().addCookies((await request.storageState()).cookies);
  const website = await page.context().newPage();
  try {
    await website.goto(buildUrl);
    await expect(website.getByRole("heading", { name: "Synthetic chapel" })).toBeVisible();
    await website.getByLabel(/^Maps/).setInputFiles("browser/fixtures/studio-map.png");
    await expect(website.getByText("studio-map.png", { exact: true })).toBeVisible();
  } finally {
    await website.close();
  }
  await expect(frame.locator("#files")).toContainText("studio-map.png");
  // Stop polling and drain bridge requests before Playwright disposes the API fixture.
  await frame.locator("body").evaluate(() => dispatchEvent(new Event("pagehide")));
  await page.unrouteAll({ behavior: "wait" });
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
  setBridgeFailure(false);await frame.getByRole("button",{name:"Retry connection"}).click();await expect(frame.locator("#status")).toHaveAttribute("data-state","ready");
});
test("a late binding refusal cannot clear a newer build view (FR-GM-26)",async({page,request})=>{
  const {frame,session,rpc,notify,openOther}=await mount(page,request,{secondBuild:true});
  const second=await rpc("tools/call",{name:"studio_open",arguments:{buildId:session.build.id,mapFiles:[descriptor("token")]}});await notify(second.result);await expect(frame.locator("#files li")).toHaveCount(3);
  let entered!:()=>void,release!:()=>void,delivered!:()=>void;const pending=new Promise<void>((resolve)=>{entered=resolve;});const resume=new Promise<void>((resolve)=>{release=resolve;});const responseSent=new Promise<void>((resolve)=>{delivered=resolve;});
  await page.route("**/_studio_bridge",async(route)=>{const message=route.request().postDataJSON() as {params:{name:string;arguments:{buildId:string}}};if(message.params.name!=="studio_bind_file")return route.fallback();expect(message.params.arguments.buildId).toBe(session.build.id);entered();await resume;await route.fulfill({json:{result:{isError:true,content:[],_meta:{"sessionzero/error":{status:404,code:"missing"}}}}});delivered();});
  await frame.getByRole("button",{name:"Show this map",disabled:false}).click();await pending;await openOther();release();await responseSent;await page.waitForTimeout(100);
  await expect(frame.locator("#build")).toHaveText("Other context");await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await expect(frame.locator("#status")).toHaveAttribute("data-state","ready");
});

const correctionMapKey = "chapel";
const correctionRoute = (id: string) => `${ORIGIN}/api/builds/${id}/studio/authoring/maps/${correctionMapKey}`;
const correctionDoor = { kind: "door", state: "closed", from: { column: 2, row: 2 }, to: { column: 3, row: 2 } };
const correctionWall = { kind: "wall", from: { column: 0, row: 2 }, to: { column: 8, row: 2 } };

async function preparedCorrection(session: Awaited<ReturnType<typeof mount>>, request: APIRequestContext) {
  const buildId = session.session.build.id;
  const tool = async (name: string, args: Record<string, unknown> = {}) =>
    (await session.rpc("tools/call", { name, arguments: { buildId, ...args } })).result;
  const assertSaved = async (name: string, args: Record<string, unknown>) => {
    const result = await tool(name, args);
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return result.structuredContent;
  };
  const snapshot = (await tool("studio_snapshot")).structuredContent as StudioSnapshot;
  const sourceFileId = snapshot.files.find((file) => file.kind === "map")!.id;
  const choices = await request.put(`${ORIGIN}/api/builds/${buildId}/choices`, { data: { aiGrid: false, aiWalls: true, aiTerrain: true } });
  expect(choices.ok()).toBe(true);
  await assertSaved("save_map", { key: correctionMapKey, name: "Chapel", fileId: sourceFileId, proposedGrid: { cellSize: 100, offsetX: 25, offsetY: 0 } });
  await assertSaved("save_map_setup", { mapKey: correctionMapKey, lines: [correctionWall, correctionDoor], terrain: [
    { row: 0, start: -1, end: -1, kind: "difficult" },
  ] });
  await assertSaved("save_creatures", { creatures: [{ key: "sentry", name: "Sentry", isPlayerCharacter: false, size: 2 }] });
  await assertSaved("save_encounter", {
    key: "watch", name: "Watch", mapKey: correctionMapKey, tokens: [{ creatureKey: "sentry", square: { column: 5, row: 3 }, hidden: true }],
  });
  await assertSaved("studio_set_context", { context: { sourceFileId, mapKey: correctionMapKey, encounterKey: "watch" } });
  const history = async () => {
    const reply = await request.get(`${correctionRoute(buildId)}/revisions`);
    expect(reply.ok()).toBe(true);
    return reply.json() as Promise<StudioCorrectionHistory>;
  };
  const readRequest = async (requestId: string) => {
    const result = await tool("studio_get_correction_request", { requestId });
    expect(result.isError).not.toBe(true);
    expect(result.content).toContainEqual(expect.objectContaining({ type: "image", mimeType: "image/webp" }));
    return result.structuredContent as { requestId: string; baseRevisionId: string; scope: StudioCorrectionHistory["requests"][number]["scope"] };
  };
  const propose = (saved: { requestId: string; baseRevisionId: string }, operations: unknown[]) => tool("studio_submit_correction", {
    requestId: saved.requestId, baseRevisionId: saved.baseRevisionId, operationId: randomUUID(), operations,
  });
  return { buildId, tool, propose, readRequest, history };
}

async function dragSelection(page: Page, canvas: Locator, a: [number, number], b: [number, number]) {
  await canvas.scrollIntoViewIfNeeded();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Studio map is missing");
  const points = await canvas.evaluate((element, coordinates) => {
    const svg = element as SVGSVGElement;
    const viewport = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    return coordinates.map(([x, y]) => ({ x: (x - viewBox.x) * viewport.width / viewBox.width, y: (y - viewBox.y) * viewport.height / viewBox.height }));
  }, [a, b]);
  const [from, to] = points.map((point) => ({ x: point.x + rect.x, y: point.y + rect.y }));
  await page.mouse.move(from!.x, from!.y);
  await page.mouse.down();
  await page.mouse.move(to!.x, to!.y, { steps: 10 });
  await page.mouse.up();
}

test("the normal composer carries the current Studio selection and delivers a scoped proposal", async ({ page, request }) => {
  test.setTimeout(85_000);
  const session = await mount(page, request, { chatSelection: true });
  const { buildId, tool, readRequest, propose, history } = await preparedCorrection(session, request);
  const studio = session.frame.getByTestId("studio-scene"), canvas = studio.getByTestId("studio-map");
  const select = studio.getByRole("button", { name: "Select area", exact: true });
  const chip = page.getByTestId("chat-attachment");
  const ready = studio.getByText("Selection attached. Ask for the change in chat.");
  type SelectedScope = { buildId: string; selectionId: string; editable: string[]; contains: { walls: number; doors: number } };
  const currentSelection = () => page.evaluate(() => (window as Window & { studioSelection?: SelectedScope }).studioSelection);
  // Like the model, pass only the reference from the attached selection; its description is for reading.
  const start = ({ buildId: build, selectionId }: SelectedScope, instruction = "Open the selected door.") =>
    tool("studio_start_correction", { buildId: build, selectionId, instruction });

  await expect(studio.getByLabel("Active encounter", { exact: true })).toHaveValue("watch", { timeout: 9000 });
  const fit = studio.getByRole("button", { name: "Fit", exact: true });
  const camera = () => canvas.evaluate((element) => {
    const { x, y, width } = (element as SVGSVGElement).viewBox.baseVal;
    return { x, y, width };
  });
  await fit.click();
  const fitted = await camera();
  await studio.getByRole("button", { name: "Zoom out", exact: true }).click();
  const wider = await camera();
  expect(wider.width).toBeGreaterThan(fitted.width);
  await canvas.dispatchEvent("wheel", { deltaMode: 0, deltaX: 20, deltaY: 15, cancelable: true });
  const panned = await camera();
  expect(panned.width).toBeCloseTo(wider.width);
  expect(panned.x).toBeGreaterThan(wider.x);
  expect(panned.y).toBeGreaterThan(wider.y);
  await canvas.dispatchEvent("wheel", { ctrlKey: true, deltaY: -15, cancelable: true });
  expect((await camera()).width).toBeLessThan(panned.width);
  await fit.click();

  const pick = studio.getByRole("button", { name: "Pick object", exact: true });
  await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  await canvas.press("ArrowRight");
  await canvas.press("ArrowRight");
  await canvas.press("Enter");
  await expect.poll(async () => (await currentSelection())?.contains.doors).toBe(1);
  expect((await currentSelection())?.editable).toEqual(["walls and openings"]);
  await fit.click();

  await expect(select).toBeEnabled();
  await select.click();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await dragSelection(page, canvas, [140, 150], [345, 245]);
  await expect(chip).toHaveText("Chapel selection");
  await expect.poll(async () => (await currentSelection())?.editable).toEqual(["walls and openings", "terrain", "creature placements"]);
  await expect(ready).toBeVisible();
  await expect(studio.getByLabel("Correction instruction")).toHaveCount(0);
  await expect(studio.getByRole("button", { name: "Send to chat" })).toHaveCount(0);
  const original = (await currentSelection())!;
  expect(original.buildId).toBe(buildId);
  expect((await request.get(`${correctionRoute(buildId)}/revisions`)).status()).toBe(404);

  await studio.getByText("Objects crossing the selection", { exact: true }).click();
  const includeWall = studio.getByRole("checkbox", { name: /^Include entire Wall at/ });
  await expect(includeWall).not.toBeChecked();
  await includeWall.check();
  await expect.poll(async () => (await currentSelection())?.contains.walls).toBe(1);
  await includeWall.uncheck();
  await expect.poll(async () => (await currentSelection())?.contains.walls).toBe(0);
  const beforeRedraw = (await currentSelection())!;

  await dragSelection(page, canvas, [118, 177], [356, 243]);
  await expect(ready).toBeVisible();
  const replaced = (await currentSelection())!;
  expect(replaced.selectionId).not.toBe(beforeRedraw.selectionId);
  expect((await start(original)).isError).toBe(true);
  await studio.getByRole("button", { name: "Clear selection" }).click();
  await expect(chip).toBeEmpty();
  expect((await start(replaced)).isError).toBe(true);

  await select.click();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await dragSelection(page, canvas, [118, 177], [356, 243]);
  await expect(ready).toBeVisible();
  await expect(chip).toHaveText("Chapel selection");
  const instruction = "Can you open that door?";
  await page.getByRole("textbox", { name: "Message" }).fill(instruction);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const turn = await page.evaluate(() => (window as Window & { studioChatTurn?: { text: string; selection: SelectedScope } }).studioChatTurn);
  expect(turn).toMatchObject({ text: instruction, selection: { buildId, map: "Chapel", mapKey: correctionMapKey, contains: { doors: 1 } } });
  if (!turn) throw new Error("The composer did not submit a turn");
  const started = await start(turn.selection, turn.text);
  expect(started.isError, JSON.stringify(started.content)).not.toBe(true);
  const { requestId } = JSON.parse((started.content as { text: string }[])[0]!.text) as { requestId: string };
  const model = await readRequest(requestId);
  expect(model.scope.wholeObjectIds).toHaveLength(0);
  expect(model.scope.objectIds).toHaveLength(1);
  expect(model.scope.region.minX).toBeCloseTo(118, -1);
  expect(model.scope.region.maxX).toBeCloseTo(356, -1);
  expect((await history()).requests[0]).toMatchObject({ instruction, requestId });
  expect((await propose(model, [{ op: "line.update", id: model.scope.objectIds[0], line: { ...correctionDoor, state: "open" } }])).isError).not.toBe(true);
  await expect(studio.getByRole("button", { name: "Door, Closed → Door, Open" })).toBeVisible({ timeout: 12000 });
  await expect(studio.getByRole("button", { name: "Before", exact: true })).toBeVisible();
  await expect(studio.getByRole("textbox", { name: "Saved correction prompt" })).toHaveCount(0);
  await expect(chip).toBeEmpty();

  await page.evaluate(() => { (window as Window & { studioRefuseAttachment?: boolean }).studioRefuseAttachment = true; });
  await select.click();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await dragSelection(page, canvas, [118, 177], [356, 243]);
  await expect(studio.getByText(/^Chat couldn’t attach the selection/)).toBeVisible();
  await expect(studio.getByLabel("Correction instruction")).toHaveCount(0);
  await expect(chip).toBeEmpty();
  expect((await history()).requests).toHaveLength(1);
  await page.evaluate(() => { (window as Window & { studioRefuseAttachment?: boolean }).studioRefuseAttachment = false; });
  await dragSelection(page, canvas, [118, 177], [356, 243]);
  await expect(ready).toBeVisible();
  await expect(chip).toHaveText("Chapel selection");
});

test("a pending selection cannot attach after clear and an expired attachment is removed", async ({ page, request }) => {
  const session = await mount(page, request, { chatSelection: true });
  await preparedCorrection(session, request);
  const studio = session.frame.getByTestId("studio-scene"), canvas = studio.getByTestId("studio-map");
  const select = studio.getByRole("button", { name: "Select area", exact: true });
  const chip = page.getByTestId("chat-attachment");
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let reached!: () => void;
  const staging = new Promise<void>((resolve) => { reached = resolve; });
  let delayedOnce = false;
  let clears = 0;
  const viewIds = new Set<string>();
  await page.route("**/_studio_bridge", async (route) => {
    const message = route.request().postDataJSON() as { method: string; params: { name?: string; arguments: { draft?: unknown; viewId: string } } };
    if (message.params.name !== "studio_stage_chat_selection") return route.fallback();
    viewIds.add(message.params.arguments.viewId);
    const answer = await session.rpc(message.method, message.params);
    if (!message.params.arguments?.draft) clears++;
    else if (!delayedOnce) { delayedOnce = true; reached(); await delayed; }
    else {
      // Server TTL is verified in the store tests. Shorten the advertised TTL in this host fixture.
      (answer.result.structuredContent as { expiresAt: string }).expiresAt = new Date(Date.now() + 2000).toISOString();
    }
    await route.fulfill({ json: answer });
  });

  await expect(studio.getByLabel("Active encounter", { exact: true })).toHaveValue("watch", { timeout: 9000 });
  await select.click();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await dragSelection(page, canvas, [118, 177], [356, 243]);
  await staging;
  try { await studio.getByRole("button", { name: "Clear selection" }).click(); }
  finally { release(); }
  await expect.poll(() => clears).toBe(1);
  await expect(chip).toBeEmpty();
  expect(await page.evaluate(() => (window as Window & { studioPublishedSelections?: number }).studioPublishedSelections ?? 0)).toBe(0);

  const encounter = studio.getByLabel("Active encounter", { exact: true });
  await encounter.selectOption("");
  await expect(encounter).toHaveValue("");
  await expect(select).toBeEnabled();
  await select.click();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await dragSelection(page, canvas, [118, 177], [356, 243]);
  await expect(chip).toHaveText("Chapel selection");
  await expect(studio.getByText("The chat selection expired. Select an area or object again.")).toBeVisible();
  await expect(chip).toBeEmpty();
  expect(viewIds.size).toBe(1);
});
