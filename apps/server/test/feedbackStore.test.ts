import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FeedbackReferenceTakenError, type FeedbackRecord } from "../src/store/feedbackStore";
import { storeCases } from "./storeHarness";

/** A report with a unique reference, so runs against a shared Postgres never collide. */
function record(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  const code = randomUUID().replace(/[^0-9a-f]/g, "").toUpperCase().replace(/[ILOU]/g, "0").slice(0, 4);
  return {
    id: randomUUID(), reference: `FB-${code}`, kind: "bug", summary: "Fog stays", details: "", technical: { pagePath: "/r/x", seq: 3 },
    reporterUserId: null, createdAt: new Date().toISOString(),
    screenshots: [{ contentType: "image/webp", width: 2, height: 1, bytes: new Uint8Array([1, 2, 3]) }, { contentType: "image/webp", width: 4, height: 3, bytes: new Uint8Array([9]) }],
    ...overrides,
  };
}

for (const [name, make] of storeCases) {
  describe(`feedback store: ${name} (FR-PL-11)`, () => {
    it("stores a report with its screenshots in order, and lists by time", async () => {
      const store = make();
      const first = record({ createdAt: "2026-11-19T01:00:00.000Z" });
      const second = record({ createdAt: "2026-11-19T02:00:00.000Z", technical: null, kind: "idea" });
      await store.createFeedback(second);
      await store.createFeedback(first);
      const listed = (await store.listFeedback("2026-11-19T00:30:00.000Z")).filter((r) => [first.id, second.id].includes(r.id));
      expect(listed.map((r) => r.id)).toEqual([first.id, second.id]);
      expect(listed[0]).toEqual(first);
      expect(listed[1]!.technical).toBeNull();
      expect((await store.listFeedback("2026-11-19T01:30:00.000Z")).some((r) => r.id === first.id)).toBe(false);
    });

    it("refuses a taken reference without storing anything", async () => {
      const store = make();
      const taken = record();
      await store.createFeedback(taken);
      await expect(store.createFeedback(record({ reference: taken.reference }))).rejects.toBeInstanceOf(FeedbackReferenceTakenError);
      expect((await store.listFeedback()).filter((r) => r.reference === taken.reference)).toHaveLength(1);
    });

    it("deletes by reference, and with the reporter's account", async () => {
      const store = make();
      const user = await store.createUser({ id: randomUUID(), email: `${randomUUID()}@example.com`, displayName: "Sam", passwordHash: "x" });
      const theirs = record({ reporterUserId: user.id });
      const anonymous = record();
      await store.createFeedback(theirs);
      await store.createFeedback(anonymous);
      expect(await store.deleteUser(user.id)).not.toBeNull();
      const left = (await store.listFeedback()).map((r) => r.id);
      expect(left).not.toContain(theirs.id);
      expect(left).toContain(anonymous.id);
      expect(await store.deleteFeedback(anonymous.reference)).toBe(true);
      expect(await store.deleteFeedback(anonymous.reference)).toBe(false);
    });
  });
}
