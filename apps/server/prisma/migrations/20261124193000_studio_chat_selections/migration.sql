CREATE TABLE "studio_chat_selections" (
    "id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "grant_id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "draft" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "studio_chat_selections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "studio_chat_selections_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "studio_chat_selections_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "studio_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "studio_chat_selections_build_id_grant_id_view_id_key" ON "studio_chat_selections"("build_id", "grant_id", "view_id");
CREATE INDEX "studio_chat_selections_grant_id_idx" ON "studio_chat_selections"("grant_id");
CREATE INDEX "studio_chat_selections_expires_at_idx" ON "studio_chat_selections"("expires_at");
