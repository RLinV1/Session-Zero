-- The owner's per-build choices for the AI game builder (FR-GM-26, ADR 0053). Additive: both default
-- to off, so existing builds keep working exactly as before, and old code ignores the columns.
ALTER TABLE "builds" ADD COLUMN "ai_grid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ai_walls" BOOLEAN NOT NULL DEFAULT false;
