-- Display selection/status do not change authoring items or abandoned-build updated_at.
ALTER TABLE "builds" ADD COLUMN "studio_context" JSONB, ADD COLUMN "studio_outcomes" JSONB;
