ALTER TABLE "builds" ADD COLUMN "studio_intake" JSONB;
ALTER TABLE "studio_media_jobs" DROP CONSTRAINT "studio_media_jobs_state_check";
ALTER TABLE "studio_media_jobs" ADD CONSTRAINT "studio_media_jobs_state_check" CHECK ("state" IN ('write', 'cancelled', 'delete'));
