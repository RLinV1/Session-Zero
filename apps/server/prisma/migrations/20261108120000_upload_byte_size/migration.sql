-- The stored file's length, for the account upload allowance (upload-limits).
-- Null until recorded; a null counts as zero, so existing rows can't push anyone over a limit.
ALTER TABLE "library_assets" ADD COLUMN "byte_size" INTEGER;
ALTER TABLE "room_uploads" ADD COLUMN "byte_size" INTEGER;
