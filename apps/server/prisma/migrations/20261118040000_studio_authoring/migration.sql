CREATE TABLE "studio_authoring_workspaces" (
    "build_id" UUID NOT NULL REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "map_key" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    PRIMARY KEY ("build_id", "map_key")
);

CREATE TABLE "studio_authoring_entries" (
    "build_id" UUID NOT NULL,
    "map_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "value" JSONB NOT NULL,
    PRIMARY KEY ("build_id", "kind", "id"),
    FOREIGN KEY ("build_id", "map_key")
        REFERENCES "studio_authoring_workspaces"("build_id", "map_key") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "studio_authoring_entries_build_id_map_key_kind_idx"
    ON "studio_authoring_entries"("build_id", "map_key", "kind");
