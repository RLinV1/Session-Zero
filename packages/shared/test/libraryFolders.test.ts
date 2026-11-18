import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BulkDeleteCreaturesRequest,
  BulkUpdateCreaturesRequest,
  CreateCreatureRequest,
  MAX_BULK_ITEMS,
  MAX_LIBRARY_FOLDER,
  MoveToFolderRequest,
  UpdateCreatureRequest,
} from "../src";

describe("creature folders and bulk creature requests (library-organize, ADR 0075, FR-GM-08)", () => {
  it("files a new creature in no folder unless one is named, trimmed", () => {
    expect(CreateCreatureRequest.parse({ name: "Goblin" }).folder).toBeNull();
    expect(CreateCreatureRequest.parse({ name: "Goblin", folder: "  Cairnkeepers " }).folder).toBe("Cairnkeepers");
  });

  it("refuses a blank folder or one over the limit", () => {
    expect(CreateCreatureRequest.safeParse({ name: "Goblin", folder: "   " }).success).toBe(false);
    expect(CreateCreatureRequest.safeParse({ name: "Goblin", folder: "x".repeat(MAX_LIBRARY_FOLDER + 1) }).success).toBe(false);
    expect(CreateCreatureRequest.safeParse({ name: "Goblin", folder: "x".repeat(MAX_LIBRARY_FOLDER) }).success).toBe(true);
  });

  it("moves one creature into a folder or out of every folder", () => {
    expect(UpdateCreatureRequest.parse({ folder: "Lanternfall" })).toEqual({ folder: "Lanternfall" });
    expect(UpdateCreatureRequest.parse({ folder: null })).toEqual({ folder: null });
  });

  it("names each creature once in a bulk edit, however often it was sent", () => {
    const id = randomUUID();
    const other = randomUUID();
    expect(BulkUpdateCreaturesRequest.parse({ ids: [id, other, id], patch: { ac: 12 } }).ids).toEqual([id, other]);
    expect(BulkDeleteCreaturesRequest.parse({ ids: [id, id] }).ids).toEqual([id]);
  });

  it("takes between 1 and the limit of creature ids, all uuids", () => {
    const patch = { folder: null };
    expect(BulkUpdateCreaturesRequest.safeParse({ ids: [], patch }).success).toBe(false);
    expect(BulkUpdateCreaturesRequest.safeParse({ ids: ["goblin"], patch }).success).toBe(false);
    const many = Array.from({ length: MAX_BULK_ITEMS + 1 }, () => randomUUID());
    expect(BulkDeleteCreaturesRequest.safeParse({ ids: many }).success).toBe(false);
    expect(BulkDeleteCreaturesRequest.safeParse({ ids: many.slice(1) }).success).toBe(true);
  });

  it("changes only what several creatures share: folder, size, Max HP and AC", () => {
    const ids = [randomUUID()];
    expect(BulkUpdateCreaturesRequest.parse({ ids, patch: { folder: "Bosses", size: 2, maxHp: 40, ac: null } }).patch)
      .toEqual({ folder: "Bosses", size: 2, maxHp: 40, ac: null });
    // A name, art or attacks belong to one creature, and an empty change changes nothing.
    expect(BulkUpdateCreaturesRequest.safeParse({ ids, patch: { name: "Same" } }).success).toBe(false);
    expect(BulkUpdateCreaturesRequest.safeParse({ ids, patch: { imageAssetId: null } }).success).toBe(false);
    expect(BulkUpdateCreaturesRequest.safeParse({ ids, patch: {} }).success).toBe(false);
    expect(BulkUpdateCreaturesRequest.safeParse({ ids, patch: { maxHp: 0 } }).success).toBe(false);
  });
});

describe("moving library items to a folder (library-organize, ADR 0075, FR-GM-08)", () => {
  const id = randomUUID();

  it("takes any kind with folders, ids once each, and a folder or none", () => {
    for (const kind of ["asset", "creature", "encounter", "animation"]) {
      expect(MoveToFolderRequest.parse({ kind, ids: [id, id], folder: " Cairnkeepers " })).toEqual({ kind, ids: [id], folder: "Cairnkeepers" });
    }
    expect(MoveToFolderRequest.parse({ kind: "asset", ids: [id], folder: null }).folder).toBeNull();
  });

  it("refuses an unknown kind, no folder field, a blank or long folder, and extra fields", () => {
    for (const body of [
      { kind: "dice", ids: [id], folder: "A" },
      { kind: "asset", ids: [id] },
      { kind: "asset", ids: [id], folder: " " },
      { kind: "asset", ids: [id], folder: "x".repeat(MAX_LIBRARY_FOLDER + 1) },
      { kind: "asset", ids: [id], folder: "A", name: "Renamed" },
      { kind: "asset", ids: [], folder: "A" },
    ]) {
      expect(MoveToFolderRequest.safeParse(body).success).toBe(false);
    }
  });
});
