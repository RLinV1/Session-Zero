import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page, type APIRequestContext, type FrameLocator, type Locator } from "@playwright/test";
import type { StudioCorrectionHistory, StudioInspection, StudioSnapshot } from "@vtt/shared";

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
async function mount(page:Page,request:APIRequestContext,options:{empty?:boolean;secondBuild?:boolean;corrections?:boolean}={}) {
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
  await page.route("**/studio-test-host",(route)=>route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#121417"><iframe title="Studio" sandbox="allow-scripts" style="border:0;width:100%;height:1350px"></iframe><script>
const opened=${JSON.stringify(opened.result)};
window.addEventListener('message',async(event)=>{const message=event.data;if(!message||message.jsonrpc!=='2.0')return;
const respond=(result)=>event.source.postMessage({jsonrpc:'2.0',id:message.id,result},'*');
if(message.method==='ui/initialize'){respond({protocolVersion:'2026-01-26',hostInfo:{name:'Local test host',version:'1'},hostCapabilities:{serverTools:{},serverResources:{},openLinks:{},...(${!!options.corrections} && {message:{text:{}},experimental:{'openai/message':{}}})},hostContext:{theme:'dark',displayMode:'inline',availableDisplayModes:['inline','fullscreen']}});}
else if(message.method==='ui/notifications/initialized'){event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:opened},'*');}
else if(message.method==='tools/call'){const answer=await (await fetch('/_studio_bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)})).json();event.source.postMessage({...answer,jsonrpc:'2.0',id:message.id},'*');}
else if(message.method==='ui/request-display-mode'){window.studioExpanded=true;respond({mode:'fullscreen'});}
else if(message.method==='ui/open-link'){window.studioOpenedUrl=message.params.url;respond({});}
else if(message.method==='ui/message'){const {handoff}=await(await fetch('/_studio_handoff',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message.params)})).json();if(handoff!=='timeout')respond(handoff==='refused'?{isError:true}:{});}
else if(message.id!==undefined)respond({});});
</script></body></html>`}));
  await page.goto(`${ORIGIN}/studio-test-host`);
  await page.locator("iframe").evaluate((element,html)=>{(element as HTMLIFrameElement).srcdoc=html;},html);
  const frame=page.frameLocator("iframe");await expect(frame.locator("#status")).toHaveText("Saved files are up to date");
  const notify=async(result:Record<string,unknown>)=>page.locator("iframe").evaluate((element,result)=>{(element as HTMLIFrameElement).contentWindow!.postMessage({jsonrpc:"2.0",method:"ui/notifications/tool-result",params:result},"*");},result);
  const openOther=async()=>{if(!session.otherBuild)throw new Error("Missing second build fixture");const opened=await rpc("tools/call",{name:"studio_open",arguments:{buildId:session.otherBuild.id,mapFiles:[descriptor()]}});await notify(opened.result);await expect(frame.locator("#build")).toHaveText("Other context");await expect(frame.locator('[data-testid="studio-source-image"]')).toBeVisible();await expect(frame.locator("#status")).toHaveText("Saved files are up to date");};
  return {frame,session,rpc,notify,openOther,messages,setHandoff:(next:typeof handoff)=>{handoff=next;},polls:()=>polls,setToken:(next:string)=>{token=next;},setBridgeFailure:(failed:boolean)=>{bridgeFailure=failed;},reopen:async()=>{await page.locator("iframe").evaluate((el)=>{const iframe=el as HTMLIFrameElement;const content=iframe.srcdoc;iframe.srcdoc=content;});await expect(frame.locator("#status")).toHaveText("Saved files are up to date");}};
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
  await frame.locator("#language").selectOption("zh-TW");await expect(frame.locator("#outcomes small")).toHaveText(["已儲存","已儲存"]);await expect(frame.locator("#status")).toHaveText("已顯示最新儲存的檔案");
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

async function fitCorrectionMap(studio: Locator, canvas: Locator) {
  await studio.getByRole("button", { name: "Fit", exact: true }).click();
  await expect.poll(() => canvas.evaluate((element) => {
    const view = (element as SVGSVGElement).viewBox.baseVal;
    return [Math.round(view.x + view.width / 2), Math.round(view.y + view.height / 2)];
  })).toEqual([600, 450]);
}

async function selectDoorway(page: Page, studio: Locator, canvas: Locator) {
  await studio.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoomed = await canvas.getAttribute("viewBox");
  await canvas.press("ArrowLeft");
  await canvas.press("ArrowLeft");
  await expect(canvas).not.toHaveAttribute("viewBox", zoomed!);
  await studio.getByRole("button", { name: /Select for correction|Refine working revision/ }).click();
  await expect(studio.getByRole("button", { name: "Draw rectangle" })).toHaveAttribute("aria-pressed", "true");
  await canvas.evaluate((element) => {
    element.addEventListener("dragstart", () => element.setAttribute("data-native-drag", "started"), true);
  });
  await dragSelection(page, canvas, [180, 164], [380, 243]);
  const scope = studio.getByTestId("studio-selection-region");
  await expect(scope).toBeVisible();
  expect(Number(await scope.getAttribute("x"))).toBeCloseTo(180, -1);
  await expect(canvas).not.toHaveAttribute("data-native-drag", "started");
  await expect(studio.locator('[data-crossing="true"][data-included="false"]')).toHaveCount(1);
  await studio.getByRole("checkbox", { name: /Include all of Wall/ }).check();
  await expect(studio.locator('[data-crossing="true"][data-included="true"]')).toHaveCount(1);
}

test("website Studio binds a keyboard and pointer selection to the saved map, compares and ends corrections", async ({ page, request }) => {
  test.setTimeout(75_000);
  const session = await mount(page, request);
  const { buildId, history, propose, readRequest } = await preparedCorrection(session, request);
  await page.context().addCookies((await request.storageState()).cookies);
  await page.goto(`${ORIGIN}/builds/${buildId}`);
  const studio = page.getByTestId("studio-scene"), canvas = studio.getByTestId("studio-map");
  const select = studio.getByRole("button", { name: "Select for correction", exact: true });
  await select.click();
  await expect(studio.getByRole("button", { name: "Draw rectangle" })).toBeVisible();
  await canvas.press("Enter");
  await canvas.press("ArrowRight");
  await canvas.press("ArrowDown");
  await canvas.press("Enter");
  await expect(studio.getByTestId("studio-selection-region")).toBeVisible();
  await canvas.press("Escape");
  await expect(select).toBeVisible();
  await expect(studio.getByTestId("studio-selection-region")).toHaveCount(0);
  await fitCorrectionMap(studio, canvas);

  await selectDoorway(page, studio, canvas);
  await studio.getByLabel("Correction instruction").fill("Open the east doorway and remove the crossing wall.");
  await studio.getByRole("button", { name: "Save correction request" }).click();
  await expect(studio.getByText(/^Request saved/)).toBeVisible();
  const saved = (await history()).requests[0]!;
  await expect(studio.getByRole("textbox", { name: "Saved correction prompt" })).toHaveValue(new RegExp(saved.requestId));
  const model = await readRequest(saved.requestId);
  expect(model.scope.wholeObjectIds).toHaveLength(1);
  const inspection = await (await request.get(`${correctionRoute(buildId)}?encounterKey=watch`)).json() as StudioInspection;
  const wallId = inspection.objects.find((object) => object.kind === "wall")!.id;
  const doorId = inspection.objects.find((object) => object.kind === "door")!.id;
  expect(model.scope.objectIds).toEqual(expect.arrayContaining([wallId, doorId]));
  expect((await propose(model, [{ op: "line.update", id: doorId, line: { ...correctionDoor, state: "open" } }, { op: "line.remove", id: wallId }])).isError).not.toBe(true);
  await expect(studio.getByText("Proposal saved", { exact: true })).toBeVisible({ timeout: 9000 });
  const before = studio.getByRole("button", { name: "Before", exact: true });
  const after = studio.getByRole("button", { name: "After", exact: true });
  await expect(after).toHaveAttribute("aria-pressed", "true");
  const viewBox = await canvas.getAttribute("viewBox");
  await before.click();
  await expect(canvas.locator('[data-kind="door"]')).toHaveAttribute("data-portal-state", "closed");
  await expect(canvas).toHaveAttribute("viewBox", viewBox!);
  await after.click();
  await expect(canvas.locator('[data-kind="door"]')).toHaveAttribute("data-portal-state", "open");
  await expect(studio.getByRole("button", { name: "Door, Closed → Door, Open" })).toBeVisible();
  await expect(studio.getByTestId("studio-removed-mark")).toBeVisible();

  const change = studio.getByRole("button", { name: "Removed Wall" });
  await change.focus();
  await page.keyboard.press("Enter");
  await expect(change).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).not.toHaveAttribute("viewBox", viewBox!);
  const focusedCamera = await canvas.getAttribute("viewBox");
  const next = await (await request.post(`${correctionRoute(buildId)}/requests`, { data: {
    operationId: randomUUID(), inspectedVersion: (await history()).workingRevisionId, encounterKey: "watch", instruction: "Close that door again.",
    selection: { region: model.scope.region, layers: ["geometry"], objectIds: [doorId], wholeObjectIds: [] },
  } })).json() as { requestId: string; baseRevisionId: string };
  await propose(next, [{ op: "line.update", id: doorId, line: correctionDoor }]);
  await expect(studio.getByText("The working revision changed. You are still viewing the selected revision.")).toBeVisible({ timeout: 9000 });
  await expect(canvas.locator('[data-kind="door"]')).toHaveAttribute("data-portal-state", "open");
  await expect(canvas).toHaveAttribute("viewBox", focusedCamera!);
  await expect(change).toBeFocused();

  await studio.getByRole("button", { name: "Refine working revision" }).click();
  await expect(studio.getByRole("button", { name: "Draw rectangle" })).toBeVisible();
  await expect(canvas.locator('[data-kind="door"]')).toHaveAttribute("data-portal-state", "closed");
  await canvas.press("Escape");

  await page.reload();
  await expect(canvas.locator('[data-kind="door"]')).toHaveAttribute("data-portal-state", "closed");
  await expect(studio.getByRole("button", { name: "Door, Open → Door, Closed" })).toBeVisible();

  await studio.getByRole("button", { name: "Refine working revision" }).click();
  await expect(studio.getByRole("button", { name: "Draw rectangle" })).toBeVisible();
  await dragSelection(page, canvas, [9, 7], [885, 520]);
  const editors = studio.getByRole("group", { name: "Editable layers" });
  await editors.getByRole("checkbox", { name: "Walls and openings" }).uncheck();
  await editors.getByRole("checkbox", { name: "Base terrain" }).check();
  await editors.getByRole("checkbox", { name: "Token placements" }).check();
  await expect(studio.getByTestId("studio-cell-scope")).toHaveText("Editable terrain cells in columns -1–8 and rows 0–5");
  await studio.getByLabel("Correction instruction").fill("Clear the courtyard edge and move the sentry east one square.");
  await studio.getByRole("button", { name: "Save correction request" }).click();
  await expect(studio.getByText(/^Request saved/)).toBeVisible();
  const combined = await readRequest((await history()).requests[0]!.requestId);
  const sentry = combined.scope.objectIds[0]!;
  const erase = { op: "terrain.paint", runs: [{ row: 0, start: -1, end: -1, kind: null }] };
  const count = (await history()).revisions.length;
  expect((await propose(combined, [erase, { op: "placement.move", id: sentry, square: { column: 7, row: 3 } }])).isError).toBe(true);
  expect((await history()).revisions).toHaveLength(count);
  expect((await propose(combined, [erase, { op: "placement.move", id: sentry, square: { column: 6, row: 3 } }])).isError).not.toBe(true);
  await expect(studio.getByTestId("studio-movement-arrow")).toBeVisible({ timeout: 9000 });
  await page.evaluate(() => localStorage.setItem("vtt.locale", "zh-TW"));
  await page.reload();
  await expect(studio.getByRole("button", { name: "1 個地形格 · 困難 → 一般" })).toBeVisible();
  const widths = await studio.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, viewport: innerWidth, content: element.scrollWidth, client: element.clientWidth };
  });
  expect(widths.width, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.content, JSON.stringify(widths)).toBeLessThanOrEqual(widths.client + 1);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("這會清除已儲存的要求、私人版本與提案");
    await dialog.accept();
  });
  await studio.getByRole("button", { name: "結束修正", exact: true }).click();
  await expect(studio.getByText("已結束這個場景的修正。")).toBeVisible();
  expect((await request.get(`${correctionRoute(buildId)}/revisions`)).status()).toBe(404);
});

test("embedded Studio hands off after save and supports doorway, cropped terrain and hidden sentry corrections", async ({ page, request }) => {
  test.setTimeout(100_000);
  const session = await mount(page, request, { corrections: true });
  const { buildId, history, propose, readRequest } = await preparedCorrection(session, request);
  const { frame, messages, setHandoff } = session;
  const studio = frame.getByTestId("studio-scene"), canvas = studio.getByTestId("studio-map");
  const select = studio.getByRole("button", { name: "Select for correction", exact: true });
  await expect(studio.getByLabel("Active encounter", { exact: true })).toHaveValue("watch", { timeout: 9000 });
  await expect(select).toBeDisabled();

  await page.context().addCookies((await request.storageState()).cookies);
  const ownerView = await page.context().newPage();
  await ownerView.goto(`${ORIGIN}/builds/${buildId}`);
  const permission = ownerView.getByRole("checkbox", { name: "Allow Browser fixture to request corrections and restore private revisions" });
  await expect(permission).not.toBeChecked();
  await permission.click();
  await expect(permission).toBeChecked();
  await expect(permission).toBeEnabled();
  await ownerView.close();
  await page.bringToFront();
  await expect(select).toBeEnabled({ timeout: 10_000 });

  await selectDoorway(page, studio, canvas);
  await studio.getByLabel("Correction instruction").fill("Open the door within this selection.");
  expect(messages).toHaveLength(0);
  await studio.getByRole("button", { name: "Send to chat" }).click();
  await expect(studio.getByText("Handed to chat", { exact: true })).toBeVisible();
  expect(messages[0]).toMatchObject({ savedBeforeHandoff: true, prompt: expect.stringContaining(buildId) });
  await expect(studio.getByText("Retrieved by the AI", { exact: true })).toHaveCount(0);
  await expect(studio.getByText("Proposal saved", { exact: true })).toHaveCount(0);
  await studio.getByText("Saved correction prompt", { exact: true }).click();
  await expect(studio.getByRole("textbox", { name: "Saved correction prompt" })).toHaveValue(new RegExp(messages[0]!.requestId));
  const doorway = await readRequest(messages[0]!.requestId);
  await expect(studio.getByText("Retrieved by the AI", { exact: true })).toBeVisible({ timeout: 9000 });
  const doorId = doorway.scope.objectIds.find((id) => !doorway.scope.wholeObjectIds.includes(id))!;
  expect((await propose(doorway, [{ op: "line.update", id: doorId, line: { ...correctionDoor, state: "open" } }])).isError).not.toBe(true);
  await expect(studio.getByRole("button", { name: "Door, Closed → Door, Open" })).toBeVisible({ timeout: 9000 });
  await session.reopen();
  await expect(studio.getByRole("button", { name: "Door, Closed → Door, Open" })).toBeVisible();

  await studio.getByRole("button", { name: "Refine working revision" }).click();
  await expect(studio.getByRole("button", { name: "Draw rectangle" })).toBeVisible();
  await canvas.press("Enter");
  await canvas.press("ArrowRight");
  await canvas.press("ArrowDown");
  await expect(studio.getByTestId("studio-selection-region")).toBeVisible();
  await canvas.press("Escape");
  await expect(studio.getByTestId("studio-selection-region")).toHaveCount(0);
  await fitCorrectionMap(studio, canvas);
  await dragSelection(page, canvas, [4, 7], [19, 71]);
  const editors = studio.getByRole("group", { name: "Editable layers" });
  await editors.getByRole("checkbox", { name: "Walls and openings" }).uncheck();
  await editors.getByRole("checkbox", { name: "Base terrain" }).check();
  await expect(studio.getByTestId("studio-cell-scope")).toHaveText("Editable terrain cells in columns -1–-1 and rows 0–0");
  await studio.getByLabel("Correction instruction").fill("Clear the difficult terrain along the courtyard edge.");
  setHandoff("refused");
  await studio.getByRole("button", { name: "Send to chat" }).click();
  await expect.poll(() => messages.length).toBe(2);
  await expect(studio.getByText(/Chat did not confirm the handoff/)).toBeVisible();
  expect(messages[1]).toMatchObject({ savedBeforeHandoff: true });
  await expect(studio.getByRole("textbox", { name: "Saved correction prompt" })).toHaveValue(new RegExp(messages[1]!.requestId));
  const terrain = await readRequest(messages[1]!.requestId);
  expect(terrain.baseRevisionId).not.toBe(doorway.baseRevisionId);
  const erase = { op: "terrain.paint", runs: [{ row: 0, start: -1, end: -1, kind: null }] };
  const revisionsBefore = (await history()).revisions.length;
  expect((await propose(terrain, [erase, { op: "line.remove", id: doorId }])).isError).toBe(true);
  await expect(studio.getByText(/Proposal refused.*scope/)).toBeVisible({ timeout: 9000 });
  expect((await history()).revisions).toHaveLength(revisionsBefore);
  expect((await propose(terrain, [erase])).isError).not.toBe(true);
  await expect(studio.getByRole("button", { name: "1 terrain cell · Difficult → Normal" })).toBeVisible({ timeout: 9000 });

  await studio.getByRole("button", { name: "Refine working revision" }).click();
  await studio.getByRole("button", { name: "Pick object", exact: true }).click();
  const object = studio.getByLabel("Choose an object", { exact: true });
  const sentry = object.locator("option").filter({ hasText: "Sentry" });
  await expect(sentry).toHaveCount(1);
  await object.selectOption((await sentry.getAttribute("value"))!);
  await expect(studio.getByRole("checkbox", { name: /Sentry at/ })).toBeChecked();
  await studio.getByRole("button", { name: "Draw rectangle" }).click();
  await dragSelection(page, canvas, [600, 250], [885, 520]);
  await expect(studio.getByRole("checkbox", { name: /Include all of Sentry/ })).not.toBeChecked();
  await studio.getByRole("checkbox", { name: /Include all of Sentry/ }).check();
  await studio.getByLabel("Correction instruction").fill("Move the hidden sentry east one square and reveal it.");
  setHandoff("timeout");
  await studio.getByRole("button", { name: "Send to chat" }).click();
  await expect.poll(() => messages.length).toBe(3);
  await expect(studio.getByText(`Request saved · ${messages[2]!.requestId}`)).toBeVisible();
  await expect(studio.getByText(/Chat did not confirm the handoff/)).toBeVisible({ timeout: 12_000 });
  expect(messages[2]).toMatchObject({ savedBeforeHandoff: true });
  await session.reopen();
  await expect(studio.getByRole("textbox", { name: "Saved correction prompt" })).toHaveValue(new RegExp(messages[2]!.requestId));
  const token = await readRequest(messages[2]!.requestId);
  const id = token.scope.wholeObjectIds[0]!;
  expect((await propose(token, [{ op: "placement.move", id, square: { column: 7, row: 3 } }])).isError).toBe(true);
  expect((await propose(token, [{ op: "placement.move", id, square: { column: 6, row: 3 } }, { op: "placement.set_visibility", id, hidden: false }])).isError).not.toBe(true);
  await studio.getByRole("button", { name: "View saved proposal" }).click({ timeout: 9000 });
  await expect(studio.getByTestId("studio-movement-arrow")).toBeVisible({ timeout: 9000 });
  await expect(studio.getByRole("button", { name: "Sentry · Hidden → Visible" })).toBeVisible();

  const other = await page.context().newPage();
  await other.goto(`${ORIGIN}/builds/${buildId}`);
  const website = other.getByTestId("studio-scene");
  await expect(website.getByRole("button", { name: "Sentry · Hidden → Visible" })).toBeVisible();
  for (const surface of [website, studio]) {
    await (surface === website ? other : page).bringToFront();
    await surface.getByText("Saved placements", { exact: true }).click();
    const placements = surface.locator(".studio-placements");
    await surface.getByRole("button", { name: "Before", exact: true }).click();
    await expect(placements.getByText("Sentry — Hidden")).toBeVisible();
    await expect(placements.getByText("Column 5, row 3 · 2 squares wide")).toBeVisible();
    await surface.getByRole("button", { name: "After", exact: true }).click();
    await expect(placements.getByText("Sentry — Visible")).toBeVisible();
    await expect(placements.getByText("Column 6, row 3 · 2 squares wide")).toBeVisible();
  }
  await other.close();
  await page.bringToFront();
  await frame.locator("#language").selectOption("zh-TW");
  await expect(studio.getByRole("button", { name: "拒絕提案並還原基準版本" })).toBeVisible();
  expect(await noOverflow(frame)).toBe(true);
  await studio.getByRole("button", { name: "拒絕提案並還原基準版本" }).click();
  await expect(studio.getByText("已還原為新的工作版本。")).toBeVisible();
  await expect(canvas.locator('[data-token-index="0"]')).toHaveAttribute("data-hidden", "true");
  const head = await history();
  expect(head.revisions.find((r) => r.id === head.workingRevisionId)).toMatchObject({ restoredFrom: token.baseRevisionId });
  expect(messages).toHaveLength(3);
  await frame.locator("body").evaluate(() => dispatchEvent(new Event("pagehide")));
});
