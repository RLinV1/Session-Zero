-- Delegated Studio access (FR-GM-26, ADR 0073, design D7 "M1a implementation record"): Session
-- Zero's own OAuth authorization server. Additive: three new tables, nothing existing changes, and
-- old code ignores them. Only SHA-256 hashes of codes and tokens are stored.
CREATE TABLE "studio_oauth_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirect_uris" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "studio_oauth_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studio_grants" (
    "id" UUID NOT NULL,
    "owner_gm_id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "build_ids" UUID[],
    "code_hash" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "code_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "code_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "studio_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studio_tokens" (
    "token_hash" TEXT NOT NULL,
    "grant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "studio_tokens_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX "studio_oauth_clients_created_at_idx" ON "studio_oauth_clients"("created_at");
CREATE UNIQUE INDEX "studio_grants_code_hash_key" ON "studio_grants"("code_hash");
CREATE INDEX "studio_grants_owner_gm_id_idx" ON "studio_grants"("owner_gm_id");
CREATE INDEX "studio_grants_client_id_idx" ON "studio_grants"("client_id");
CREATE INDEX "studio_grants_expires_at_idx" ON "studio_grants"("expires_at");
CREATE INDEX "studio_tokens_grant_id_idx" ON "studio_tokens"("grant_id");
CREATE INDEX "studio_tokens_expires_at_idx" ON "studio_tokens"("expires_at");

ALTER TABLE "studio_grants" ADD CONSTRAINT "studio_grants_owner_gm_id_fkey" FOREIGN KEY ("owner_gm_id") REFERENCES "gm_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "studio_grants" ADD CONSTRAINT "studio_grants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "studio_oauth_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "studio_tokens" ADD CONSTRAINT "studio_tokens_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "studio_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
