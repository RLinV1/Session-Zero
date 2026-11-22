-- Feedback reports and their screenshots (FR-PL-11, ADR 0079). Additive: two new tables.

-- CreateTable
CREATE TABLE "feedback_reports" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "technical" JSONB,
    "reporter_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_screenshots" (
    "report_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "feedback_screenshots_pkey" PRIMARY KEY ("report_id","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_reports_reference_key" ON "feedback_reports"("reference");

-- CreateIndex
CREATE INDEX "feedback_reports_created_at_idx" ON "feedback_reports"("created_at");

-- CreateIndex
CREATE INDEX "feedback_reports_reporter_user_id_idx" ON "feedback_reports"("reporter_user_id");

-- AddForeignKey
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_screenshots" ADD CONSTRAINT "feedback_screenshots_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
