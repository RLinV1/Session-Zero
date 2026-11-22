import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackReceipt, type FeedbackReport } from "@vtt/shared";
import type { MailMessage, Mailer } from "../src/identity/mailer";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer } from "./helpers";

const HOUR = 60 * 60 * 1000;
const ADMIN = "team@example.com";

class Recorder implements Mailer {
  sent: MailMessage[] = [];
  failing = false;
  async send(message: MailMessage) {
    if (this.failing) throw new Error("smtp down");
    this.sent.push(message);
  }
}

type Server = Awaited<ReturnType<typeof startServer>>;
let server: Server | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

const report: FeedbackReport = { kind: "bug", summary: "Fog stays after the door opens", details: "Players still saw fog until reload." };
const technical = { pagePath: "/r/room-1", roomId: "room-1", seq: 12, role: "gm" as const, locale: "en" as const };
const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#3a6" } }).png().toBuffer();
const jpegWithLocation = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#a63" } })
  .jpeg()
  .withExif({ IFD0: { Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 44/1 0/1" } })
  .toBuffer();

async function send(base: string, body: unknown, files: { name: string; bytes: Uint8Array; type?: string }[] = [], headers: Record<string, string> = {}, website?: string) {
  const form = new FormData();
  form.append("report", JSON.stringify(body));
  if (website !== undefined) form.append("website", website);
  for (const file of files) form.append("screenshots", new Blob([file.bytes], { type: file.type ?? "image/png" }), file.name);
  return fetch(`${base}/api/feedback`, { method: "POST", body: form, headers });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

async function start(opts: { mail?: Recorder | null; adminEmail?: string; now?: () => number } = {}) {
  const mail = opts.mail === undefined ? new Recorder() : opts.mail;
  server = await startServer(new MemoryRoomStore(), {
    now: opts.now,
    verification: mail ? { mailer: mail } : null,
    adminEmail: opts.adminEmail ?? ADMIN,
  });
  return mail;
}

describe("feedback email alerts (FR-PL-11)", () => {
  it("mails a signed-in report with its details, account email, technical details and cleaned screenshots", async () => {
    const mail = (await start())!;
    const credentials = { email: "sam@example.com", password: "correct horse battery", displayName: "Sam" };
    await server!.anonymous().request("POST", "/api/auth/signup", credentials);
    const token = decodeURIComponent(mail.sent[0]!.text.match(/token=([^\s]+)/)![1]!);
    await server!.anonymous().request("POST", "/api/auth/verify", { token });
    const sam = await server!.signIn(credentials.email, credentials.password);
    mail.sent.length = 0;

    const res = await send(server!.base, { ...report, technical }, [
      { name: "a.png", bytes: await png() },
      { name: "b.jpg", bytes: await jpegWithLocation(), type: "image/jpeg" },
    ], { cookie: sam.cookie });
    expect(res.status).toBe(201);
    const { reference } = FeedbackReceipt.parse(await res.json());
    await settle();

    expect(mail.sent).toHaveLength(1);
    const message = mail.sent[0]!;
    expect(message.to).toBe(ADMIN);
    expect(message.subject).toBe(`[Feedback ${reference}] bug: ${report.summary}`);
    for (const part of [reference, "bug", report.summary, report.details, "Signed in: yes (sam@example.com)", "Page: /r/room-1", "Room: room-1", "Event number: 12", "Role: gm", "Screenshots: 2"]) {
      expect(message.text).toContain(part);
    }
    expect(message.html).toBe(`<pre>${message.text}</pre>`);
    expect(message.attachments!.map((a) => [a.filename, a.contentType])).toEqual([[`${reference}-1.webp`, "image/webp"], [`${reference}-2.webp`, "image/webp"]]);
  });

  it("says a guest was not signed in and includes no email address", async () => {
    const mail = (await start())!;
    expect((await send(server!.base, report)).status).toBe(201);
    await settle();
    expect(mail.sent[0]!.text).toContain("Signed in: no");
    expect(mail.sent[0]!.text).not.toMatch(/@/);
  });

  it("says no technical details were included when the reporter left them out", async () => {
    const mail = (await start())!;
    await send(server!.base, report);
    await settle();
    expect(mail.sent[0]!.text).toContain("No technical details were included.");
    expect(mail.sent[0]!.text).not.toContain("Page:");
  });

  it("attaches the re-encoded WebP, not the upload, so no location data travels", async () => {
    const mail = (await start())!;
    await send(server!.base, report, [{ name: "b.jpg", bytes: await jpegWithLocation(), type: "image/jpeg" }]);
    await settle();
    const [attachment] = mail.sent[0]!.attachments!;
    const meta = await sharp(attachment!.content).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    const [stored] = await server!.store.listFeedback();
    expect(Buffer.compare(attachment!.content, Buffer.from(stored!.screenshots[0]!.bytes))).toBe(0);
  });

  it("collapses line breaks and cuts the subject to 100 characters", async () => {
    const mail = (await start())!;
    await send(server!.base, { ...report, summary: `line one\r\nline two ${"x".repeat(90)}` });
    await settle();
    const subject = mail.sent[0]!.subject;
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toHaveLength(100);
    expect(subject).toContain("line one line two");
  });

  it("attempts no email without a recipient or without a mailer, and still saves", async () => {
    const mail = (await start({ adminEmail: "" }))!;
    expect((await send(server!.base, report)).status).toBe(201);
    await settle();
    expect(mail.sent).toEqual([]);
    expect(await server!.store.listFeedback()).toHaveLength(1);
    await server!.close();

    await start({ mail: null });
    expect((await send(server!.base, report)).status).toBe(201);
    expect(await server!.store.listFeedback()).toHaveLength(1);
  });

  it("still answers 201, saves the report and logs when sending throws", async () => {
    const mail = (await start())!;
    mail.failing = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await send(server!.base, report);
    expect(res.status).toBe(201);
    FeedbackReceipt.parse(await res.json());
    await settle();
    expect(await server!.store.listFeedback()).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("[vtt] feedback email failed:", expect.any(Error));
  });

  it("sends at most 20 notices in 24 hours and resumes when the window passes", async () => {
    let clock = Date.parse("2026-10-01T12:00:00.000Z");
    const mail = (await start({ now: () => clock }))!;
    for (let i = 0; i < 21; i++) {
      expect((await send(server!.base, report)).status).toBe(201);
      if (i % 5 === 4) clock += 61 * 60 * 1000;
    }
    await settle();
    expect(mail.sent).toHaveLength(20);
    expect(await server!.store.listFeedback()).toHaveLength(21);

    clock += 25 * HOUR;
    await send(server!.base, report);
    await settle();
    expect(mail.sent).toHaveLength(21);
  });

  it("drops a submission that fills the honeypot: 201, a reference, nothing stored, no mail", async () => {
    const mail = (await start())!;
    const res = await send(server!.base, report, [{ name: "a.png", bytes: await png() }], {}, "http://spam.example");
    expect(res.status).toBe(201);
    const receipt = FeedbackReceipt.parse(await res.json());
    expect(receipt.screenshots).toBe(0);
    await settle();
    expect(await server!.store.listFeedback()).toEqual([]);
    expect(mail.sent).toEqual([]);
  });

  it("treats an empty or missing honeypot as a normal report", async () => {
    const mail = (await start())!;
    expect((await send(server!.base, report, [], {}, "")).status).toBe(201);
    expect((await send(server!.base, report)).status).toBe(201);
    await settle();
    expect(await server!.store.listFeedback()).toHaveLength(2);
    expect(mail.sent).toHaveLength(2);
  });
});
