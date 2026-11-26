ALTER TABLE "studio_grants" ADD COLUMN "correction_build_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "studio_authoring_entries" ADD COLUMN "activity" JSONB;
