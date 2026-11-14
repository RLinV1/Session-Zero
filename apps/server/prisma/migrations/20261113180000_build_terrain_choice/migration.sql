-- The owner's choice to let the AI game builder propose permanent terrain (FR-GM-26, ADR 0071).
-- Additive: it defaults to off, so existing builds keep working exactly as before, and old code
-- ignores the column. A draft map's proposed terrain lives in its existing JSON data.
ALTER TABLE "builds" ADD COLUMN "ai_terrain" BOOLEAN NOT NULL DEFAULT false;
