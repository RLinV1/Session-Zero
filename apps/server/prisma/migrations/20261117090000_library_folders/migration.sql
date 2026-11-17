-- Library folders (docs/adr/0075-library-folders.md): a nullable name on each kind of
-- library item, so everything saved before reads back with no folder. IF NOT EXISTS: an earlier
-- draft of this change added the creature column alone, and a database that ran it must still migrate.
ALTER TABLE "library_assets" ADD COLUMN IF NOT EXISTS "folder" TEXT;
ALTER TABLE "library_creatures" ADD COLUMN IF NOT EXISTS "folder" TEXT;
ALTER TABLE "encounter_templates" ADD COLUMN IF NOT EXISTS "folder" TEXT;
ALTER TABLE "library_animations" ADD COLUMN IF NOT EXISTS "folder" TEXT;
