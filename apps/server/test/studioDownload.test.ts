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
  it("allows only the two observed exact HTTPS origins and rejects parser and credential tricks",()=>{
    expect(studioDownloadUrl(origin).hostname).toBe("sdmntpreastus3.oaiusercontent.com");
    expect(studioDownloadUrl("https://oaisdmntpreastus3.blob.core.windows.net/a").protocol).toBe("https:");
    for(const value of ["http://sdmntpreastus3.oaiusercontent.com/a","https://other.oaiusercontent.com/a","https://sdmntpreastus3.oaiusercontent.com.evil.test/a","https://user:pass@sdmntpreastus3.oaiusercontent.com/a","https://sdmntpreastus3.oaiusercontent.com:444/a","https://127.0.0.1/a","https://[::1]/a","https://sdmntpreastus3.oaiusercontent.com/a#x","https://sdmntpreastus3.oaiusercontent.com\\@evil.test/a","https://sdmntpreastus3.oaiusercontent.com./a","file:///etc/passwd"]) expect(()=>studioDownloadUrl(value),value).toThrow();
  });
  it("accepts the reviewed regional composer origins exactly, never their region family",()=>{
    for(const host of ["sdmntprnortheu.oaiusercontent.com","sdmntprnznorth.oaiusercontent.com"]) expect(studioDownloadUrl(`https://${host}/file?signed=fixture`).hostname).toBe(host);
    for(const value of ["https://sdmntprwestus.oaiusercontent.com/a","https://sdmntprnortheu2.oaiusercontent.com/a","https://xsdmntprnortheu.oaiusercontent.com/a","https://sdmntprnortheu.oaiusercontent.com.evil.test/a","http://sdmntprnznorth.oaiusercontent.com/a","https://sdmntprnznorth.oaiusercontent.com:8443/a","https://oaisdmntprnortheu.blob.core.windows.net/a"]) expect(()=>studioDownloadUrl(value),value).toThrow();
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
