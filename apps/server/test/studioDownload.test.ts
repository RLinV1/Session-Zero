import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadStudioOriginal, publicDownloadAddress, studioDownloadUrl, STUDIO_DOWNLOAD_MS, STUDIO_FILE_BYTES } from "../src/domain/studioDownload";
vi.mock("node:https", () => ({ default: { get: vi.fn() } }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
const origin = "https://sdmntpreastus3.oaiusercontent.com/file?signed=fixture";
let status = 200, headers: Record<string,string> = {}, chunks: Buffer[] = [], neverRespond = false;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  status=200;headers={};chunks=[Buffer.from("synthetic-original")];neverRespond=false;
  vi.mocked(lookup).mockResolvedValue([{address:"8.8.8.8",family:4}] as never);
  vi.mocked(https.get).mockImplementation(((url: URL, options: https.RequestOptions, callback: (response: Readable) => void) => {
    const request = new EventEmitter();
    options.signal?.addEventListener("abort",()=>request.emit("error",new Error("aborted")),{once:true});
    if (!neverRespond) queueMicrotask(() => { const response=Readable.from(chunks); Object.assign(response,{statusCode:status,headers}); callback(response); });
    return request;
  }) as typeof https.get);
});
afterEach(()=>vi.restoreAllMocks());
describe("bounded host original download (FR-GM-26)",()=>{
  it.each(["eastus3", "northeu", "nznorth", "westus2", "a1", "a".repeat(32)])("accepts composer region %s on HTTPS port 443", (region) => {
    const host = `sdmntpr${region}.oaiusercontent.com`;
    expect(studioDownloadUrl(`https://${host}/file?signed=fixture`).hostname).toBe(host);
    expect(studioDownloadUrl(`https://${host}:443/a`).origin).toBe(`https://${host}`);
    expect(studioDownloadUrl(`HTTPS://${host.toUpperCase()}:443/a`).hostname).toBe(host);
    expect(console.warn).not.toHaveBeenCalled();
  });
  it.each([
    "https://oaiusercontent.com/a",
    "https://web-sandbox.oaiusercontent.com/a",
    "https://widget.web-sandbox.oaiusercontent.com/a",
    "https://files.oaiusercontent.com/a",
    "https://xsdmntprnortheu.oaiusercontent.com/a",
    "https://sdmntpr.oaiusercontent.com/a",
    "https://sdmntpra.oaiusercontent.com/a",
    "https://sdmntprnorth-eu.oaiusercontent.com/a",
    `https://sdmntpr${"a".repeat(33)}.oaiusercontent.com/a`,
    "https://sdmntprnortheu.oaiusercontent.com.evil.test/a",
    "https://sdmntprnortheu.oaiusercontent.com./a",
    "http://sdmntprnortheu.oaiusercontent.com/a",
    "https://sdmntprnortheu.oaiusercontent.com:8443/a",
    "https://user:pass@sdmntprnortheu.oaiusercontent.com/a",
    "https://@sdmntprnortheu.oaiusercontent.com/a",
    "https://sdmntprnortheu.oaiusercontent.com/a#fragment",
    "https://sdmntprnortheu.oaiusercontent.com/a#",
    "https://sdmntprnortheu.oaiusercontent.com\\@evil.test/a",
    "https://sdmntprnorth\teu.oaiusercontent.com/a",
    "https://sdmntprnortheu.oaiusercontent.com/a?sig=\u007f",
    "https://%73dmntprnortheu.oaiusercontent.com/a",
    "https://sdmntpr\u212a1.oaiusercontent.com/a",
    "https:sdmntprnortheu.oaiusercontent.com/a",
    "https://oaisdmntpreastus3.blob.core.windows.net/a",
    "https://sdmntprnortheu.blob.core.windows.net/a",
    "https://account.blob.core.windows.net/a",
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "file:///etc/passwd",
  ])("refuses %s before DNS", async (url) => {
    await expect(downloadStudioOriginal(url)).rejects.toMatchObject({ code: "origin" });
    expect(lookup).not.toHaveBeenCalled();
    expect(https.get).not.toHaveBeenCalled();
  });
  it("logs one structured line with only the normalized origin of a refused URL", async () => {
    await expect(downloadStudioOriginal("https://user:secret@web-sandbox.oaiusercontent.com/private-art.png?sig=synthetic-signature#fragment"))
      .rejects.toMatchObject({ code: "origin" });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(JSON.stringify({ event: "studio_attachment_origin_refused", origin: "https://web-sandbox.oaiusercontent.com" }));
  });
  it("logs no raw descriptor if the refused URL cannot be parsed", async () => {
    await expect(downloadStudioOriginal("private-art.png?sig=synthetic-signature")).rejects.toMatchObject({ code: "origin" });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(JSON.stringify({ event: "studio_attachment_origin_refused", origin: null }));
  });
  it.each(["0.0.0.0","127.0.0.1","10.1.1.1","172.16.0.1","192.168.1.1","169.254.169.254","100.64.0.1","224.0.0.1","::1","::","::ffff:127.0.0.1","::ffff:169.254.169.254","fc00::1","fe80::1","64:ff9b::a9fe:a9fe","2001:db8::1"])("refuses non-public destination %s",async(address)=>{
    expect(publicDownloadAddress(address)).toBe(false);vi.mocked(lookup).mockResolvedValue([{address,family:address.includes(":")?6:4}] as never);
    await expect(downloadStudioOriginal(origin)).rejects.toMatchObject({code:"origin"});expect(https.get).not.toHaveBeenCalled();
  });
  it("pins the validated DNS address, uses normal TLS verification, and sends no application credentials",async()=>{
    expect(await downloadStudioOriginal(origin)).toEqual(chunks[0]);
    const options=vi.mocked(https.get).mock.calls[0]![1] as https.RequestOptions;
    expect(options).toMatchObject({agent:false,family:4,headers:{accept:"image/png, image/jpeg, image/webp","accept-encoding":"identity"}});
    expect(options.rejectUnauthorized).not.toBe(false);expect(options.headers).not.toHaveProperty("authorization");expect(options.headers).not.toHaveProperty("cookie");expect(options.headers).not.toHaveProperty("x-forwarded-for");
    const done=vi.fn();(options.lookup as unknown as (host:string,opts:object,callback:typeof done)=>void)("host",{},done);expect(done).toHaveBeenCalledWith(null,"8.8.8.8",4);expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("rejects mixed public/private DNS answers before making a connection",async()=>{
    vi.mocked(lookup).mockResolvedValue([{address:"8.8.8.8",family:4},{address:"10.0.0.1",family:4}] as never);await expect(downloadStudioOriginal(origin)).rejects.toMatchObject({code:"origin"});expect(https.get).not.toHaveBeenCalled();
  });
  it.each([301,302,303,307,308,401,403,404,500])("does not follow response status %i",async(code)=>{
    status=code;headers={location:"http://169.254.169.254/"};await expect(downloadStudioOriginal(origin)).rejects.toBeInstanceOf(Error);expect(https.get).toHaveBeenCalledTimes(1);
  });
  it("bounds declared/streamed sizes, refuses compression and detects truncation",async()=>{
    for(const next of ([{"content-length":String(STUDIO_FILE_BYTES+1)},{"content-encoding":"gzip"},{"content-length":"999"},{"content-length":"invalid"}] as Record<string,string>[])) { headers=next;await expect(downloadStudioOriginal(origin)).rejects.toBeInstanceOf(Error); }
    headers={};chunks=[Buffer.alloc(STUDIO_FILE_BYTES),Buffer.alloc(1)];await expect(downloadStudioOriginal(origin)).rejects.toMatchObject({code:"size"});
  });
  it("passes the 20-second total deadline to both DNS and the connected request",async()=>{
    const controller=new AbortController();const timeout=vi.spyOn(AbortSignal,"timeout").mockReturnValue(controller.signal);neverRespond=true;
    const request=downloadStudioOriginal(origin); const refused = expect(request).rejects.toMatchObject({code:"download"});await new Promise((resolve)=>setImmediate(resolve));controller.abort();await refused;expect(timeout).toHaveBeenCalledWith(STUDIO_DOWNLOAD_MS);
    expect((vi.mocked(https.get).mock.calls[0]![1] as https.RequestOptions).signal).toBe(controller.signal);
  });
});
