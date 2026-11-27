ALTER TABLE "library_assets" ADD COLUMN "studio_original" JSONB;

CREATE TABLE "studio_publications" (
    "build_id" UUID NOT NULL REFERENCES "builds"("id") ON DELETE CASCADE,
    "operation_id" UUID NOT NULL,
    "input_hash" TEXT NOT NULL,
    "receipt" JSONB NOT NULL,
    PRIMARY KEY ("build_id", "operation_id")
);
