-- Historical rows deliberately remain NULL: no result reuse or automatic backfill.
ALTER TABLE library_assets
  ADD COLUMN source_hash TEXT,
  ADD COLUMN detection_source_hash TEXT,
  ADD COLUMN detection_version TEXT,
  ADD COLUMN detection_error TEXT;
ALTER TABLE room_uploads
  ADD COLUMN source_hash TEXT,
  ADD COLUMN detection_source_hash TEXT,
  ADD COLUMN detection_version TEXT,
  ADD COLUMN detection_error TEXT;
