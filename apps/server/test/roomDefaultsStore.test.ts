import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BUILTIN_ROOM_DEFAULTS, type RoomDefaults } from "@vtt/shared";
import { storeCases } from "./storeHarness";

const mine: RoomDefaults = { ...BUILTIN_ROOM_DEFAULTS, hideHp: true, diagonalRule: "euclidean", unitsPerCell: 1.5, unitLabel: "m" };

for (const [label, store] of storeCases) {
  describe(`room defaults in the store: ${label} (gm-room-defaults, ADR 0066)`, () => {
    it("reads null until saved, then what was saved", async () => {
      const s = store();
      const owner = await s.registerGm(randomUUID());
      expect(await s.getRoomDefaults(owner)).toBeNull();
      await s.setRoomDefaults(owner, mine);
      expect(await s.getRoomDefaults(owner)).toEqual(mine);
      await s.setRoomDefaults(owner, BUILTIN_ROOM_DEFAULTS);
      expect(await s.getRoomDefaults(owner)).toEqual(BUILTIN_ROOM_DEFAULTS);
    });

    it("keeps each owner's defaults apart", async () => {
      const s = store();
      const a = await s.registerGm(randomUUID());
      const b = await s.registerGm(randomUUID());
      await s.setRoomDefaults(a, mine);
      expect(await s.getRoomDefaults(b)).toBeNull();
    });
  });
}
