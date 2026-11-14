-- A guest GM identity (guest-gm-hosting D1): a browser-held token that hosts guest rooms with no
-- account. Additive; every existing row is a pre-account identity and stays false.
ALTER TABLE "gm_identities" ADD COLUMN "guest" BOOLEAN NOT NULL DEFAULT false;
