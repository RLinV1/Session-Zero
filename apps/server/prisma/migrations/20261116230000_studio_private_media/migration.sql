ALTER TABLE "builds" ADD COLUMN "studio_file_id" UUID;
ALTER TABLE "build_files" ADD COLUMN "studio" JSONB;
CREATE TABLE "studio_media_jobs" (
  "id" UUID PRIMARY KEY,
  "build_id" UUID NOT NULL,
  "state" TEXT NOT NULL CHECK ("state" IN ('write', 'delete')),
  "keys" TEXT[] NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "studio_media_jobs_state_expires_at_idx" ON "studio_media_jobs"("state", "expires_at");
CREATE INDEX "studio_media_jobs_build_id_idx" ON "studio_media_jobs"("build_id");
