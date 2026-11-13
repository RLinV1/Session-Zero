-- A GM's defaults for new rooms (ADR 0066). Additive and nullable: null means never saved, which
-- reads as the built-in defaults, so existing owners keep exactly the rooms they got before.
ALTER TABLE "gm_identities" ADD COLUMN "room_defaults" JSONB;
