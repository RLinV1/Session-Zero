import { readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_DICE_LOOKS, type DiceLookView, type DiceLooksResponse } from "@vtt/shared";
import { startServer, type HttpAccount } from "./helpers";
import { pngOfSize } from "./pngOfSize";
import { storeCases } from "./storeHarness";
import { UPLOAD_ALLOWANCE } from "../src/store/libraryStore";

describe("dice looks on the account (dice-looks, FR-GM-01)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeEach(async () => {
    server = await startServer();
  });
  afterEach(async () => {
    await server.close();
  });

  const newLook = (who: HttpAccount, name = "Jungle") => who.json<DiceLookView>("POST", "/api/library/dice", { name });
  const putFace = (
    who: HttpAccount,
    lookId: string,
    die: string,
    size: { width: number; height: number },
    file: { bytes?: Uint8Array; type?: string; name?: string } = {},
  ) => {
    const form = new FormData();
    form.append("width", String(size.width));
    form.append("height", String(size.height));
    // A real picture of the declared size, unless the test brings its own bytes.
    const bytes = file.bytes ?? pngOfSize(size.width, size.height);
    form.append("file", new Blob([bytes], { type: file.type ?? "image/png" }), file.name ?? "jungle-d20.png");
    return fetch(`${server.base}/api/library/dice/${lookId}/faces/${die}`, {
      method: "PUT", headers: { cookie: who.cookie }, body: form,
    });
  };
  const looks = (who: HttpAccount) => who.json<DiceLooksResponse>("GET", "/api/library/dice");

  it("keeps a look and the look in use on the account, the same on every device", async () => {
    const laptop = await server.signUp({ email: "kim@example.com", password: "correct horse" });
    const look = await newLook(laptop);
    const res = await putFace(laptop, look.id, "d20", { width: 1536, height: 1024 });
    expect(res.status).toBe(200);
    await laptop.json("PUT", "/api/library/dice/active", { id: look.id });

    const phone = await server.signIn("kim@example.com", "correct horse");
    const seen = await looks(phone);
    expect(seen.activeId).toBe(look.id);
    expect(seen.looks).toHaveLength(1);
    expect(seen.looks[0]!.faces.d20).toMatchObject({ width: 1536, height: 1024 });
    expect(JSON.stringify(seen)).not.toContain("objectKey");
    expect(seen.looks[0]!.faces.d20!.url.toLowerCase()).not.toContain("jungle");
  });

  it("answers 404 to another account for every look route, and changes nothing", async () => {
    const kim = await server.signUp();
    const sam = await server.signUp();
    const look = await newLook(kim);
    expect((await sam.request("PATCH", `/api/library/dice/${look.id}`, { name: "Mine now" })).status).toBe(404);
    expect((await sam.request("DELETE", `/api/library/dice/${look.id}`)).status).toBe(404);
    expect((await sam.request("PUT", "/api/library/dice/active", { id: look.id })).status).toBe(404);
    expect((await putFace(sam, look.id, "d6", { width: 512, height: 512 })).status).toBe(404);
    expect((await sam.request("DELETE", `/api/library/dice/${look.id}/faces/d6`)).status).toBe(404);
    expect((await looks(sam)).looks).toEqual([]);
    expect((await looks(kim)).looks[0]!.name).toBe("Jungle");
  });

  it("refuses pictures out of bounds and leaves the look unchanged", async () => {
    const kim = await server.signUp();
    const look = await newLook(kim);
    expect((await putFace(kim, look.id, "d20", { width: 1920, height: 1080 })).status).toBe(400);
    expect((await putFace(kim, look.id, "d20", { width: 600, height: 600 })).status).toBe(400);
    expect((await putFace(kim, look.id, "d20", { width: 1600, height: 1066 })).status).toBe(400);
    expect((await putFace(kim, look.id, "d20", { width: 512, height: 512 }, { type: "image/gif" })).status).toBe(415);
    const huge = new Uint8Array(5 * 1024 * 1024 + 1);
    expect((await putFace(kim, look.id, "d20", { width: 512, height: 512 }, { bytes: huge })).status).toBe(413);
    expect((await putFace(kim, look.id, "d7", { width: 512, height: 512 })).status).toBe(404);
    expect((await looks(kim)).looks[0]!.faces).toEqual({});
  });

  it("checks the file itself: a picture whose real size differs from the declared one is refused (ADR 0018)", async () => {
    const kim = await server.signUp();
    const look = await newLook(kim);
    const res = await putFace(kim, look.id, "d6", { width: 512, height: 512 }, { bytes: pngOfSize(600, 600) });
    expect(res.status).toBe(400);
    const notAPicture = await putFace(kim, look.id, "d6", { width: 512, height: 512 }, { bytes: Buffer.from("<script>alert(1)</script>") });
    expect(notAPicture.status).toBe(415);
    expect((await looks(kim)).looks[0]!.faces).toEqual({});
  });

  it("serves uploaded pictures with nosniff", async () => {
    const kim = await server.signUp();
    const look = await newLook(kim);
    const saved = (await (await putFace(kim, look.id, "d6", { width: 512, height: 512 })).json()) as DiceLookView;
    const res = await fetch(server.base + saved.faces.d6!.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("accepts a painted template and a square picture at their limits", async () => {
    const kim = await server.signUp();
    const look = await newLook(kim);
    expect((await putFace(kim, look.id, "d20", { width: 1536, height: 1024 })).status).toBe(200);
    expect((await putFace(kim, look.id, "d6", { width: 512, height: 512 })).status).toBe(200);
    expect(Object.keys((await looks(kim)).looks[0]!.faces).sort()).toEqual(["d20", "d6"]);
  });

  it("caps an account at 50 looks", async () => {
    const kim = await server.signUp();
    for (let i = 0; i < MAX_DICE_LOOKS; i++) await newLook(kim, `Look ${i}`);
    const res = await kim.request("POST", "/api/library/dice", { name: "One more" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/50/);
  });

  it("leaves no stored picture behind after replace, reset or delete", async () => {
    const kim = await server.signUp();
    const look = await newLook(kim);
    const before = await uploadCount();
    await putFace(kim, look.id, "d20", { width: 512, height: 512 });
    await putFace(kim, look.id, "d20", { width: 512, height: 512 });
    expect(await uploadCount()).toBe(before + 1);
    await kim.json("DELETE", `/api/library/dice/${look.id}/faces/d20`);
    expect(await uploadCount()).toBe(before);
    await putFace(kim, look.id, "d6", { width: 512, height: 512 });
    await putFace(kim, look.id, "d8", { width: 512, height: 512 });
    await kim.json("DELETE", `/api/library/dice/${look.id}`);
    expect(await uploadCount()).toBe(before);
  });

  it("puts the person back on classic dice when they delete the look in use", async () => {
    const kim = await server.signUp();
    const look = await newLook(kim);
    await kim.json("PUT", "/api/library/dice/active", { id: look.id });
    await kim.json("DELETE", `/api/library/dice/${look.id}`);
    expect((await looks(kim)).activeId).toBeNull();
  });

  it("needs a session", async () => {
    expect((await server.anonymous().request("GET", "/api/library/dice")).status).toBe(401);
    expect((await server.anonymous().request("POST", "/api/library/dice", { name: "x" })).status).toBe(401);
  });

  /** Objects in the upload folder, which is where a test server keeps its pictures. */
  async function uploadCount() {
    return (await readdir(server.uploadDir)).length;
  }
});

describe.each(storeCases)("dice look store, %s (ADR 0017 O3)", (_name, makeStore) => {
  const store = makeStore();
  const owner = async () =>
    (await store.createUser({ id: randomUUID(), email: `${randomUUID()}@x.com`, displayName: "K", passwordHash: "x" })).ownerId;

  it("scopes every read and write to its owner", async () => {
    const [kim, sam] = [await owner(), await owner()];
    const now = new Date().toISOString();
    const id = randomUUID();
    await store.createDiceLook({ id, ownerGmId: kim, name: "Jungle", faces: {}, createdAt: now, updatedAt: now });
    expect(await store.findDiceLook(id, sam)).toBeNull();
    expect(await store.renameDiceLook(id, sam, "x", now)).toBeNull();
    expect(await store.setDiceLookFace(id, sam, "d6", null, now, UPLOAD_ALLOWANCE)).toBeNull();
    expect(await store.deleteDiceLook(id, sam)).toBeNull();
    expect(await store.listDiceLooks(sam)).toEqual([]);
    expect(await store.countDiceLooks(kim)).toBe(1);
  });

  it("reports the replaced picture so the caller can delete it", async () => {
    const kim = await owner();
    const now = new Date().toISOString();
    const id = randomUUID();
    await store.createDiceLook({ id, ownerGmId: kim, name: "Jungle", faces: {}, createdAt: now, updatedAt: now });
    const face = (key: string) => ({ objectKey: key, url: `/uploads/${key}`, width: 512, height: 512 });
    expect((await store.setDiceLookFace(id, kim, "d6", face("a.png"), now, UPLOAD_ALLOWANCE))!.replacedKey).toBeNull();
    expect((await store.setDiceLookFace(id, kim, "d6", face("b.png"), now, UPLOAD_ALLOWANCE))!.replacedKey).toBe("a.png");
    expect((await store.setDiceLookFace(id, kim, "d8", face("c.png"), now, UPLOAD_ALLOWANCE))!.look.faces.d6!.objectKey).toBe("b.png");
    expect((await store.deleteDiceLook(id, kim))!.sort()).toEqual(["b.png", "c.png"]);
  });
});
