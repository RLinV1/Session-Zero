-- Password reset links (FR-GM-01, docs/adr/0081-signup-recovery.md).
-- Additive: a new table, bound to the account's credential version as verification tokens are.

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "credential_version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
