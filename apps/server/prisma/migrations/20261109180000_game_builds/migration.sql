-- The AI game builder's private drafts (FR-GM-26, FR-GM-27, ADR 0053). Additive: old code ignores these tables.
CREATE TABLE "builds" (
    "id" UUID NOT NULL,
    "owner_gm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "game_profile" JSONB,
    "pass_hash" TEXT,
    "pass_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "build_files" (
    "id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "grid" JSONB,
    "board" JSONB,
    "source_hash" TEXT,
    "detection_source_hash" TEXT,
    "detection_version" TEXT,
    "detection_error" TEXT,
    "detection_status" TEXT,
    "detection_attempt" INTEGER NOT NULL DEFAULT 0,
    "detection_result" JSONB,
    "detection_updated_at" TIMESTAMPTZ(6),
    "published_asset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "build_items" (
    "id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "not_carried_over" TEXT NOT NULL DEFAULT '',
    "edited_by_user" BOOLEAN NOT NULL DEFAULT false,
    "published_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "builds_pass_hash_key" ON "builds"("pass_hash");
CREATE INDEX "builds_owner_gm_id_status_idx" ON "builds"("owner_gm_id", "status");
CREATE INDEX "builds_status_updated_at_idx" ON "builds"("status", "updated_at");
CREATE INDEX "build_files_build_id_kind_idx" ON "build_files"("build_id", "kind");
CREATE INDEX "build_files_detection_status_idx" ON "build_files"("detection_status");
CREATE UNIQUE INDEX "build_items_build_id_kind_key_key" ON "build_items"("build_id", "kind", "key");

ALTER TABLE "builds" ADD CONSTRAINT "builds_owner_gm_id_fkey" FOREIGN KEY ("owner_gm_id") REFERENCES "gm_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "build_files" ADD CONSTRAINT "build_files_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "build_items" ADD CONSTRAINT "build_items_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
