-- Verification tokens are bound to the account's credential version (PR 226 delayed-token takeover).
-- Additive: every existing row backfills to version 0, so tokens already issued keep working.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "credential_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "email_verification_tokens" ADD COLUMN     "credential_version" INTEGER NOT NULL DEFAULT 0;
