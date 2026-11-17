import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStudioMediaStore, createStudioMediaStore } from "../src/store/studioMediaStore";
import { StudioIntakeError } from "../src/domain/studioDownload";
import { connectStudio, TEST_ORIGIN, bearer } from "./studioFlow";
import { startServer } from "./helpers";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { planPublish } from "../src/domain/buildPublish";

const servers: Awaited<ReturnType<typeof startServer>>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())); });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const png = () => sharp({ create: { width: 120, height: 80, channels: 3, background: "#a76138" } }).png().toBuffer();
async function setup(suppliedBytes?: Buffer, now = Date.now) {
  const bytes = suppliedBytes ?? await png();
  const directory = await mkdtemp(path.join(tmpdir(), "studio-media-"));
  const media = await LocalStudioMediaStore.connect(path.join(directory, "private"), path.join(directory, "public"));
  const downloader = vi.fn(async (_url: string) => bytes);
  const store = new MemoryRoomStore();
  const server = await startServer(store, { studio: { publicOrigin: TEST_ORIGIN }, studioMedia: media, studioDownloader: downloader, now }); servers.push(server);
  const owner = await server.signUp();
  const { build, pass } = await owner.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", { name: "Synthetic chapel" });
  const { tokens } = await connectStudio(server.base, owner, [build.id]);
  const request = (method: string, suffix: string, body?: unknown, token = tokens.access_token) => fetch(`${server.base}/api/studio/builds/${build.id}${suffix}`, {
    method, headers: bearer(token, { ...(body === undefined ? {} : { "content-type": "application/json" }) }), body: body === undefined ? undefined : JSON.stringify(body),
  });
  const upload = (kind = "map", id = "host-fixture", download_url = "https://sdmntpreastus3.oaiusercontent.com/fixture") => request("POST", "/intake", { kind, file: { file_id: id, download_url, file_name: "Synthetic.png", mime_type: "text/plain" } });
  return { server, owner, build, pass, store, media, downloader, tokens, request, upload, bytes, directory };
}

describe("protected Studio intake and delivery (FR-GM-26, FR-GM-27)", () => {
  it("preserves original bytes, stores a private derivative and refuses public/static/foreign/identifier-only reads", async () => {
    const s = await setup(); const response = await s.upload(); expect(response.status).toBe(201);
    const { file } = await response.json() as { file: { id: string; originalSha256: string; width: number; height: number } };
    expect(file).toMatchObject({ originalSha256: sha(s.bytes), width: 120, height: 80 });
    const record = (await s.store.findBuildFile(s.build.id, file.id))!;
    expect(await s.media.read(record.objectKey, 10000)).toEqual(s.bytes);
    const preview = await s.media.read(record.studio!.previewKey, 4 * 1024 ** 2); expect((await sharp(preview!).metadata()).format).toBe("webp");
    const ownerRead = await s.owner.request("GET", `/api/builds/${s.build.id}/files/${file.id}/media`); expect(ownerRead.status).toBe(200); expect(Buffer.from(await ownerRead.arrayBuffer())).toEqual(s.bytes);
    for (const variant of ["", "?variant=preview"]) {
      const good = await s.request("GET", `/files/${file.id}/media${variant}`); expect(good.status).toBe(200); expect(good.headers.get("cache-control")).toBe("no-store"); expect(good.headers.get("etag")).toBeNull();
      const denied = await fetch(`${s.server.base}/api/studio/builds/${s.build.id}/files/${file.id}/media${variant}`); expect(denied.status).toBe(401); expect(denied.headers.get("cache-control")).toBe("no-store");
      const conditional = await s.request("GET", `/files/${file.id}/media${variant}`); expect(conditional.status).toBe(200);
    }
    for (const key of [record.objectKey, record.studio!.previewKey]) {
      for (const suffix of [key, encodeURIComponent(key), key.replaceAll("/", "%2f"), encodeURIComponent(encodeURIComponent(key)), `../${key}`, path.basename(key)]) {
        const res = await fetch(`${s.server.base}/uploads/${suffix}`); expect(res.status).not.toBe(200); expect(Buffer.from(await res.arrayBuffer())).not.toEqual(s.bytes);
      }
    }
    await symlink(s.media.root, path.join(s.server.uploadDir, "private-alias"));
    expect((await fetch(`${s.server.base}/uploads/private-alias/${record.objectKey}`)).status).toBe(404);
    const other = await s.server.signUp(); const otherRead = await other.request("GET", `/api/builds/${s.build.id}/files/${file.id}/media`); expect(otherRead.status).toBe(404);
    const publicPath = path.join(s.server.uploadDir, "legacy.png"); await writeFile(publicPath, s.bytes); expect((await fetch(s.server.base + "/uploads/legacy.png")).status).toBe(200);
  });

  it.each([1,2,3,4,5,6,7,8])("records EXIF orientation %i separately from the byte-identical original", async (orientation) => {
    const colors = [[230,30,30],[30,220,30],[30,30,230],[230,220,30]];
    const pixels = Buffer.alloc(60*40*3);
    for (let y=0;y<40;y++) for (let x=0;x<60;x++) {
      const color=colors[(y>=20?2:0)+(x>=30?1:0)]!;
      pixels.set(color,(y*60+x)*3);
    }
    const bytes = await sharp(pixels,{raw:{width:60,height:40,channels:3}}).jpeg({quality:100,chromaSubsampling:"4:4:4"}).withMetadata({orientation}).toBuffer();
    const s = await setup(bytes); const response = await s.upload(); expect(response.status).toBe(201);
    const {file} = await response.json() as {file:{id:string;width:number;height:number;orientation:number}};
    expect(file).toMatchObject({orientation,width:orientation>=5?40:60,height:orientation>=5?60:40});
    const row = (await s.store.findBuildFile(s.build.id,file.id))!; expect(row.studio!.originalSha256).toBe(sha(bytes));
    const preview=(await s.media.read(row.studio!.previewKey,100000))!;
    const meta = await sharp(preview).metadata(); expect(meta.orientation).toBeUndefined(); expect(meta.width).toBe(file.width); expect(meta.height).toBe(file.height);
    const decoded=await sharp(preview).removeAlpha().raw().toBuffer();
    const quadrants=[[0,1,2,3],[1,0,3,2],[3,2,1,0],[2,3,0,1],[0,2,1,3],[2,0,3,1],[3,1,2,0],[1,3,0,2]][orientation-1]!;
    for (let corner=0;corner<4;corner++) {
      const x=Math.floor(file.width*(corner%2?0.75:0.25)),y=Math.floor(file.height*(corner>=2?0.75:0.25));
      const expected=colors[quadrants[corner]!]!;
      for(let channel=0;channel<3;channel++) expect(Math.abs(decoded[(y*file.width+x)*3+channel]!-expected[channel]!)).toBeLessThan(35);
    }
  });

  it("retries with the same or changed host id without duplicates, including expired descriptors after a saved reply", async () => {
    const s = await setup(); const first = await (await s.upload()).json() as { file: { id: string } };
    s.downloader.mockRejectedValueOnce(new StudioIntakeError("expired"));
    const retry = await s.upload("map", "host-fixture", "expired"); expect(retry.status).toBe(200); expect((await retry.json() as {file:{id:string}}).file.id).toBe(first.file.id); expect(s.downloader).toHaveBeenCalledTimes(1);
    // The queued rejection belongs to the next new selection, and cannot remove the saved map.
    expect((await s.upload("token", "new-selection")).status).toBe(422);
    const newer = await s.upload("map", "changed-host-id"); expect(newer.status).toBe(200); expect((await newer.json() as {file:{id:string}}).file.id).toBe(first.file.id);
    expect(await s.store.listBuildFiles(s.build.id)).toHaveLength(1); expect(await s.store.listStudioMediaJobs(new Date().toISOString())).toHaveLength(0);
  });

  it("preserves successful files when another image is corrupt, oversized, expired or fails storage", async () => {
    const s = await setup(); expect((await s.upload()).status).toBe(201);
    s.downloader.mockResolvedValueOnce(Buffer.from("not an image")); expect((await s.upload("token","bad")).status).toBe(422);
    s.downloader.mockResolvedValueOnce(Buffer.alloc(25*1024**2+1)); expect((await s.upload("token","huge")).status).toBe(413);
    s.downloader.mockRejectedValueOnce(new StudioIntakeError("expired")); const expired = await s.upload("token","expired"); expect(await expired.json()).toMatchObject({code:"expired",messageId:"studio.media.expired"});
    const put = vi.spyOn(s.media,"put").mockRejectedValueOnce(new Error("synthetic storage outage")); expect((await s.upload("token","storage")).status).toBe(503); put.mockRestore();
    await s.server.app.sweepStudioMedia(); expect(await s.store.listBuildFiles(s.build.id)).toHaveLength(1); expect(await s.store.listStudioMediaJobs(new Date().toISOString())).toHaveLength(0);
  });

  it("rechecks expiry and revocation during intake and never commits or returns media after access ends", async () => {
    let clock = Date.now(); const s = await setup(await png(), () => clock);
    expect((await s.upload()).status).toBe(201); const file = (await s.store.listBuildFiles(s.build.id))[0]!;
    s.downloader.mockImplementationOnce(async () => { clock += 8*60*60_000; return s.bytes; }); expect((await s.upload("token","late")).status).toBe(401); expect(await s.store.listBuildFiles(s.build.id)).toHaveLength(1);
    const ended = await s.request("GET",`/files/${file.id}/media?variant=preview`); expect(ended.status).toBe(401); expect(ended.headers.get("cache-control")).toBe("no-store");
    const fresh = await connectStudio(s.server.base,s.owner,[s.build.id]);
    const read = vi.spyOn(s.media,"read").mockImplementationOnce(async () => { await s.store.endStudioGrants((await s.store.findUserById(s.owner.view!.id))!.ownerId,new Date(clock).toISOString()); return Buffer.from(s.bytes); });
    const revoked = await s.request("GET",`/files/${file.id}/media`,undefined,fresh.tokens.access_token); expect(revoked.status).toBe(401); expect(await revoked.text()).not.toContain(s.bytes.toString("base64")); read.mockRestore();
    const reauthorized = await connectStudio(s.server.base,s.owner,[s.build.id]); expect((await s.request("GET","/studio",undefined,reauthorized.tokens.access_token)).status).toBe(200);
  });

  it("rechecks a build pass after reading private preview bytes", async () => {
    const s=await setup();await s.upload();const row=(await s.store.listBuildFiles(s.build.id))[0]!;
    const read=s.media.read.bind(s.media);vi.spyOn(s.media,"read").mockImplementationOnce(async(key,max)=>{const bytes=await read(key,max);await s.store.clearBuildPass(s.build.id,(await s.store.findUserById(s.owner.view!.id))!.ownerId);return bytes;});
    const response=await fetch(`${s.server.base}/api/build/current/files/${row.id}/preview`,{headers:bearer(s.pass)});expect(response.status).toBe(401);expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rechecks a website session ended while original or preview storage reads are in flight",async()=>{
    const s=await setup();await s.upload();const row=(await s.store.listBuildFiles(s.build.id))[0]!;
    for(const variant of ["","?variant=preview"]) {
      const owner=await s.server.signIn(s.owner.email,s.owner.password);
      const read=s.media.read.bind(s.media);const pending=vi.spyOn(s.media,"read").mockImplementationOnce(async(key,max)=>{const bytes=await read(key,max);expect((await owner.request("POST","/api/auth/signout")).status).toBe(204);return bytes;});
      const response=await owner.request("GET",`/api/builds/${s.build.id}/files/${row.id}/media${variant}`);expect(response.status).toBe(401);expect(response.headers.get("cache-control")).toBe("no-store");expect((await response.text()).includes(s.bytes.toString("base64"))).toBe(false);pending.mockRestore();
    }
  });

  it("binding and ordinary reads recover saved files without extending retention; private dependencies cannot publish", async () => {
    const s = await setup(); const {file} = await (await s.upload("token")).json() as {file:{id:string}};
    const mapResponse = await s.upload("map", "binding-map"); const map = (await mapResponse.json() as {file:{id:string}}).file;
    const before = (await s.store.findBuild(s.build.id,(await s.store.findUserById(s.owner.view!.id))!.ownerId))!.updatedAt;
    expect((await s.request("POST","/binding",{fileId:map.id})).status).toBe(200);
    expect((await (await s.request("GET","/studio")).json() as {sourceFileId:string}).sourceFileId).toBe(map.id);
    const build = (await s.store.findBuild(s.build.id,(await s.store.findUserById(s.owner.view!.id))!.ownerId))!; expect(build.updatedAt).toBe(before);
    const item = await s.store.saveBuildItem({buildId:build.id,kind:"creature",key:"guard",data:{name:"Guard",isPlayerCharacter:false,imageFileId:file.id},flags:[],notCarriedOver:""},100);
    const planned = await planPublish(s.store,build,{creatures:["guard"],maps:[],encounters:[],reviewed:{"creature/guard":item.updatedAt}},new Date().toISOString()); expect(planned.ok).toBe(false);
  });

  it("discard and account deletion queue and retry originals and derivatives, keeping unrelated public files", async () => {
    const s = await setup(); await s.upload(); const row = (await s.store.listBuildFiles(s.build.id))[0]!;
    await writeFile(path.join(s.server.uploadDir,"legacy.png"),s.bytes);
    const deletion = vi.spyOn(s.media,"delete").mockRejectedValue(new Error("offline"));
    expect((await s.owner.request("DELETE",`/api/builds/${s.build.id}`)).status).toBe(204); expect(await s.store.listBuildFiles(s.build.id)).toHaveLength(0); expect((await s.store.listStudioMediaJobs(new Date().toISOString())).length).toBeGreaterThan(0);
    expect((await s.request("GET","/studio")).status).not.toBe(200);
    deletion.mockRestore(); await s.server.app.sweepStudioMedia(); expect(await s.media.read(row.objectKey,10000)).toBeNull(); expect(await s.media.read(row.studio!.previewKey,10000)).toBeNull(); expect(await readFile(path.join(s.server.uploadDir,"legacy.png"))).toEqual(s.bytes);
    const t = await setup(); await t.upload(); const other = (await t.store.listBuildFiles(t.build.id))[0]!; expect((await t.owner.request("DELETE","/api/auth/account",{password:t.owner.password})).status).toBe(204); expect(await t.media.read(other.objectKey,10000)).toBeNull(); expect(await t.media.read(other.studio!.previewKey,10000)).toBeNull();
  });

  it("rejects unsafe configuration, overlapping disk roots and symbolic aliases", async () => {
    const root = await mkdtemp(path.join(tmpdir(),"studio-roots-"));
    await expect(LocalStudioMediaStore.connect(path.join(root,"private"),root)).rejects.toThrow(/separate/);
    await expect(createStudioMediaStore(root,{STUDIO_PUBLIC_ORIGIN:TEST_ORIGIN})).rejects.toThrow(/STUDIO_MEDIA_MODE/);
    expect(await createStudioMediaStore(root,{})).toBeNull();
    const s = await setup(); await expect(s.media.read("../secret",10)).rejects.toThrow();
    const key = `studio-private/v1/${randomUUID()}/original.png`; await s.media.put(key,s.bytes); const actual = path.join(s.media.root,key); await writeFile(actual+".pending",s.bytes); await s.media.delete(key); expect(await s.media.read(key,10000)).toBeNull();
  });
});
